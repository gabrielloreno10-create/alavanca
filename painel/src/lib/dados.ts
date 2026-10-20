/**
 * Camada única de acesso a dados. As telas nunca leem JSON nem SQL: só chamam estas funções.
 *
 * A origem é o Postgres da plataforma (src/lib/fonte/postgres.ts), por tenant, com RLS.
 * Sem DATABASE_URL cai no modo de semente (src/lib/fonte/seed.ts) — explícito, nunca silencioso.
 *
 * Cada função carrega SÓ a janela de dias e os blocos que a sua tela precisa. Não existe
 * mais pré-computação de todas as visões: período e operação chegam da URL e viram uma
 * consulta só.
 */
import {
  acoesDoDia,
  alertasDoDia,
  canaisDo,
  operacoesDo,
  taxaMediaTipo,
  tipoDe,
  tiposDo,
  classificarCardapio,
  diasNoMes,
  dividir,
  filtrar,
  fraseCanalProprio,
  fraseCrm,
  fraseIfood,
  fraseLucro,
  fraseMetricas,
  fraseWhatsapp,
  isoDe,
  lerData,
  margemPorCanal,
  montarMensagemDiaria,
  projetarMes,
  intervalos,
  marcarMelhorPior,
  marcarVendeMuitoMargemBaixa,
  margemItemIfood,
  metaDoDia,
  porData,
  resumir,
  situacaoMeta,
  somarDias,
  taxaEfetiva,
  variacao,
} from "./calculos";
import { carregar, listarTenants, type Acesso, type Bloco, type Pacote } from "./fonte";
import { formatarBRLInteiro, formatarInteiro, formatarPct } from "./formato";
import type {
  BlocosExemplo,
  Cliente,
  ComandaDoDia,
  Hoje,
  IndicadorPilar,
  LinhaDiaria,
  LinhaRestaurante,
  Origem,
  OrigemTela,
  Periodo,
  Plano,
  Situacao,
  VisaoCanalProprio,
  VisaoCrm,
  VisaoIfood,
  VisaoLucro,
  VisaoMetricas,
  VisaoWhatsapp,
  WhatsappDia,
} from "./types";

export { modoDaFonte } from "./fonte";
export type { Acesso } from "./fonte";

/** Filtro de operação: "todas" é o consolidado do cliente */
export const TODAS = "todas";

/** Acesso vazio: só serve ao modo de semente e aos testes. No Postgres não resolve tenant nenhum. */
const SEM_ACESSO: Acesso = { usuarioId: null, tenants: [] };

/**
 * Quantos dias para trás cada período precisa para fechar o comparativo com o período
 * anterior. "mes" chega a dois meses (mês corrente + mesmos dias do mês passado).
 */
const DIAS_DO_PERIODO: Record<Periodo, number> = { ontem: 9, "7d": 15, "30d": 61, mes: 64 };
const diasPara = (periodo: Periodo, minimo = 0) => Math.max(DIAS_DO_PERIODO[periodo], minimo);

export class ClienteDesconhecido extends Error {
  constructor(slug: string) {
    super(`Cliente não encontrado ou sem acesso: ${slug}`);
    this.name = "ClienteDesconhecido";
  }
}

/* ---------- carga ---------- */

/** Recorta o pacote para uma operação só: canais, vendas e fichas daquela operação */
function recortar(p: Pacote, operacao: string): Pacote {
  const canais = Object.fromEntries(Object.entries(p.cliente.canais).filter(([, c]) => c.operacao === operacao));
  const ids = Object.keys(canais);
  const dias = p.metricas.dias.map((d) => {
    const sub = Object.fromEntries(ids.filter((c) => d.canais[c]).map((c) => [c, d.canais[c]]));
    const fatTotal = Object.values(d.canais).reduce((s, v) => s + v.faturamento, 0);
    const fatSub = Object.values(sub).reduce((s, v) => s + v.faturamento, 0);
    const cmv = Object.values(sub).every((v) => v.cmv !== undefined)
      ? Object.values(sub).reduce((s, v) => s + (v.cmv ?? 0), 0)
      : d.cmv * dividir(fatSub, fatTotal);
    return { ...d, canais: sub, cmv };
  });
  return {
    ...p,
    // metas são do grupo; por operação ainda não há meta cadastrada
    cliente: { ...p.cliente, canais, metaPorDiaSemana: null },
    metricas: { ...p.metricas, dias },
    lucro: { ...p.lucro, fichas: p.lucro.fichas.filter((f) => !f.operacao || f.operacao === operacao) },
  };
}

async function pacote(
  slug: string,
  periodo: Periodo,
  operacao: string,
  blocos: Bloco[],
  dias: number | "tudo",
  acesso: Acesso,
): Promise<Pacote> {
  const p = await carregar(slug, { periodo, dias, blocos }, acesso);
  if (!p) throw new ClienteDesconhecido(slug);
  // Marca que não existe neste cliente cai no consolidado, como fazia o filtro da tela.
  if (operacao === TODAS || !operacoesDo(p.cliente).includes(operacao)) return p;
  return recortar(p, operacao);
}

/* ---------- cadastro ---------- */

export async function listarClientes(acesso: Acesso = SEM_ACESSO): Promise<{ slug: string; nome: string }[]> {
  return (await listarTenants(acesso)).map((t) => ({ slug: t.slug, nome: t.nome }));
}

export async function existeCliente(slug: string, acesso: Acesso = SEM_ACESSO): Promise<boolean> {
  return (await listarTenants(acesso)).some((t) => t.slug === slug);
}

export async function getCliente(slug: string, acesso: Acesso = SEM_ACESSO): Promise<Cliente> {
  return (await pacote(slug, "7d", TODAS, [], 1, acesso)).cliente;
}

/** Opções do filtro de operação: o consolidado e cada operação; só "todas" quando há uma operação só */
export async function getOperacoes(slug: string, acesso: Acesso = SEM_ACESSO): Promise<{ id: string; nome: string }[]> {
  const ops = operacoesDo(await getCliente(slug, acesso));
  return ops.length > 1 ? [{ id: TODAS, nome: "Todas" }, ...ops.map((o) => ({ id: o, nome: o }))] : [{ id: TODAS, nome: "Todas" }];
}

/* ---------- auxiliares ---------- */

/** REAL só quando todas as fontes de um bloco são reais */
const real = (...os: Origem[]): Origem => (os.every((o) => o === "REAL") ? "REAL" : "EXEMPLO");

/** Origem da tela inteira e quais blocos ainda são exemplo */
function origemTela(blocos: Record<string, Origem>): { origem: OrigemTela; exemplo: BlocosExemplo } {
  const v = Object.values(blocos);
  const origem: OrigemTela = v.every((o) => o === "REAL") ? "REAL" : v.every((o) => o === "EXEMPLO") ? "EXEMPLO" : "MISTO";
  return { origem, exemplo: Object.fromEntries(Object.entries(blocos).map(([k, o]) => [k, o === "EXEMPLO"])) };
}

/** Último dia fechado. Sem venda nenhuma no banco, a régua é hoje (tudo sai zerado). */
const ultimoDia = (p: Pacote) => p.ultimoDia ?? isoDe(new Date());

function situacaoPorFaixa(valor: number, bom: number, atencao: number, maiorMelhor = true): Situacao {
  if (maiorMelhor) return valor >= bom ? "bom" : valor >= atencao ? "atencao" : "alerta";
  return valor <= bom ? "bom" : valor <= atencao ? "atencao" : "alerta";
}

/** A comanda de um dia fechado: resumo, meta, o alerta mais grave e as 3 ações */
function comandaDoDia(p: Pacote, iso: string): ComandaDoDia {
  const { cliente, metricas, plano } = p;
  const resumo = resumir(filtrar(metricas.dias, [iso, iso]), cliente);
  const meta = metaDoDia(cliente, iso) || null;
  const metaPct = meta ? resumo.faturamento / meta : null;
  const alertas = alertasDoDia(metricas.dias, iso, cliente);
  const indice = metricas.dias.findIndex((d) => d.data === iso);
  return {
    // offsetDias conta os dias anteriores à janela carregada: a numeração é a mesma
    // de quando a série inteira ficava na memória.
    numero: indice < 0 ? 0 : p.offsetDias + indice + 1,
    data: iso,
    emitidaEm: "07:00",
    meta,
    metaPct,
    situacaoMeta: metaPct === null ? null : situacaoMeta(metaPct, cliente),
    resumo,
    alerta: alertas[0] ?? { tipo: "nenhum", texto: "Nenhum alerta: dia dentro do plano" },
    acoes: acoesDoDia(alertas, plano),
  };
}

/* ---------- Hoje ---------- */

export async function getHoje(slug: string, periodo: Periodo, operacao: string = TODAS, acesso: Acesso = SEM_ACESSO): Promise<Hoje> {
  // 37 dias: o gráfico de 30 dias mais os 7 dias que o cálculo de alerta olha para trás.
  const p = await pacote(slug, periodo, operacao, ["vendas", "crm", "whatsapp", "midia", "cardapio", "plano"], diasPara(periodo, 37), acesso);
  const { cliente, metricas, crm, whatsapp, lucro, canalProprio } = p;
  const dias = metricas.dias;
  const ontem = ultimoDia(p);

  // Pilares: período escolhido contra o anterior
  const iv = intervalos(periodo, ontem);
  const atual = resumir(filtrar(dias, iv.atual), cliente);
  const anterior = resumir(filtrar(dias, iv.anterior), cliente);
  const diasAtual = filtrar(dias, iv.atual);
  const diasAnterior = filtrar(dias, iv.anterior);
  const temMeta = !!cliente.metaPorDiaSemana;
  const bateuMeta = (ds: typeof dias) => ds.filter((d) => resumir([d], cliente).faturamento >= metaDoDia(cliente, d.data)).length;
  // Meta de canal próprio e de margem só valem se vierem da mesma fonte que as vendas
  const metaCanal = canalProprio.origem === metricas.origem ? canalProprio.metaPctCanalProprio : null;
  const metaMargem = lucro.origem === metricas.origem ? lucro.metaMargemPct : null;
  const metaBatidaAtual = bateuMeta(diasAtual);
  const metaBatidaPct = dividir(metaBatidaAtual, diasAtual.length);
  const waSoma = (iv2: [string, string]) =>
    porData(whatsapp.dias, iv2).reduce((s, d) => ({ conversas: s.conversas + d.conversas, pedidos: s.pedidos + d.pedidos }), { conversas: 0, pedidos: 0 });
  const waAt = waSoma(iv.atual);
  const waAn = waSoma(iv.anterior);
  const convAtual = dividir(waAt.pedidos, waAt.conversas);
  const convAnterior = dividir(waAn.pedidos, waAn.conversas);
  const optIn = crm.resumo.novosComOptIn[periodo];

  const pilares: IndicadorPilar[] = [
    {
      pilar: "ifood", rotulo: "Faturamento no iFood", origem: metricas.origem,
      valor: formatarBRLInteiro(atual.faturamentoCanal.ifood),
      variacao: variacao(atual.faturamentoCanal.ifood, anterior.faturamentoCanal.ifood),
      situacao: situacaoPorFaixa(atual.canalPct.ifood, cliente.limites.ifoodMaximoPct, cliente.limites.ifoodMaximoPct + 0.1, false),
    },
    {
      pilar: "canal-proprio", rotulo: "Vendas no canal próprio", origem: metricas.origem,
      valor: formatarPct(atual.canalPct.proprio),
      variacao: anterior.faturamento ? atual.canalPct.proprio - anterior.canalPct.proprio : null, variacaoEmPontos: true,
      situacao: metaCanal === null ? null : situacaoPorFaixa(atual.canalPct.proprio, metaCanal, metaCanal * 0.7),
    },
    {
      pilar: "crm", rotulo: "Novos clientes com opt-in", origem: crm.origem,
      valor: formatarInteiro(optIn.atual),
      variacao: variacao(optIn.atual, optIn.anterior),
      situacao: situacaoPorFaixa(dividir(optIn.atual, optIn.anterior), 1, 0.8),
    },
    {
      pilar: "whatsapp", rotulo: "Conversão no WhatsApp", origem: whatsapp.origem,
      valor: formatarPct(convAtual),
      variacao: waAn.conversas ? convAtual - convAnterior : null, variacaoEmPontos: true,
      situacao: situacaoPorFaixa(dividir(convAtual, convAnterior), 1, 0.85),
    },
    {
      pilar: "lucro", rotulo: metricas.cmvEstimado ? "Margem estimada" : "Margem de contribuição", origem: real(metricas.origem, cliente.origem),
      valor: formatarPct(atual.margemPct, 1),
      variacao: anterior.faturamento ? atual.margemPct - anterior.margemPct : null, variacaoEmPontos: true,
      situacao: metaMargem === null ? null : situacaoPorFaixa(atual.margemPct, metaMargem, cliente.limites.margemMinimaPct),
    },
    {
      pilar: "metricas", rotulo: "Dias com meta batida", origem: real(metricas.origem, cliente.origem),
      valor: temMeta ? `${metaBatidaAtual} de ${diasAtual.length}` : "Sem meta",
      variacao: temMeta && diasAnterior.length ? metaBatidaPct - dividir(bateuMeta(diasAnterior), diasAnterior.length) : null, variacaoEmPontos: true,
      situacao: temMeta ? situacaoPorFaixa(metaBatidaPct, 0.7, 0.4) : null,
    },
  ];

  const grafico = filtrar(dias, [intervalos("30d", ontem).atual[0], ontem]).map((d) => ({
    data: d.data,
    faturamento: Math.round(resumir([d], cliente).faturamento),
    meta: temMeta ? metaDoDia(cliente, d.data) : null,
  }));

  return {
    cliente,
    comanda: comandaDoDia(p, ontem),
    pilares,
    grafico,
    origem: origemTela(Object.fromEntries(pilares.map((x) => [x.pilar, x.origem]))).origem,
  };
}

/* ---------- Tela raiz: todos os restaurantes ---------- */

/**
 * Uma linha por tenant que a sessão pode abrir: último dia fechado, o que ele faturou,
 * o alerta mais grave e o semáforo dos 6 pilares. Nada inventado: tenant sem venda
 * aparece com ultimoDia null e a tela diz "sem dado".
 */
export async function getRestaurantes(acesso: Acesso): Promise<LinhaRestaurante[]> {
  const tenants = await listarTenants(acesso);
  return Promise.all(
    tenants.map(async (t): Promise<LinhaRestaurante> => {
      const hoje = await getHoje(t.slug, "ontem", TODAS, acesso);
      return {
        slug: t.slug,
        nome: t.nome,
        segmento: t.segmento ?? "",
        ultimoDia: hoje.comanda.resumo.faturamento || hoje.comanda.resumo.pedidos ? hoje.comanda.data : null,
        faturamento: hoje.comanda.resumo.faturamento,
        pedidos: hoje.comanda.resumo.pedidos,
        meta: hoje.comanda.meta,
        metaPct: hoje.comanda.metaPct,
        alerta: hoje.comanda.alerta,
        pilares: hoje.pilares.map((p) => ({ pilar: p.pilar, rotulo: p.rotulo, situacao: p.situacao, valor: p.valor })),
        origem: hoje.origem,
      };
    }),
  );
}

/* ---------- Pilar 1: iFood ---------- */

export async function getIfood(slug: string, periodo: Periodo, operacao: string = TODAS, acesso: Acesso = SEM_ACESSO): Promise<VisaoIfood> {
  const p = await pacote(slug, periodo, operacao, ["vendas", "ifood"], diasPara(periodo, 7), acesso);
  const { cliente, ifood, metricas } = p;
  const iv = intervalos(periodo, ultimoDia(p));
  const somaIfood = (iv2: [string, string]) => {
    const r = resumir(filtrar(metricas.dias, iv2), cliente);
    return { fat: r.faturamentoCanal.ifood, ped: r.pedidosCanal.ifood, cmvPct: dividir(r.cmv, r.faturamento) };
  };
  const at = somaIfood(iv.atual);
  const an = somaIfood(iv.anterior);

  const op = (iv2: [string, string]) => {
    const linhas = porData(ifood.operacaoDia, iv2);
    const cancel = linhas.reduce((s, l) => s + l.cancelados, 0);
    return {
      nota: linhas.length ? linhas[linhas.length - 1].nota : 0,
      tempo: dividir(linhas.reduce((s, l) => s + l.tempoEntregaMin, 0), linhas.length),
      cancelados: cancel,
    };
  };
  const opAt = op(iv.atual);
  const opAn = op(iv.anterior);

  const promoTotal = (iv2: [string, string]) =>
    porData(ifood.promocoesDia, iv2).reduce((s, d) => s + Object.values(d.promocoes).reduce((t, x) => t + x.custo, 0), 0);
  const promoAt = promoTotal(iv.atual);
  const promoAn = promoTotal(iv.anterior);
  const te = taxaEfetiva(at.fat, ifood.comissaoPct, ifood.taxaPagamentoPct, promoAt);
  const teAn = taxaEfetiva(an.fat, ifood.comissaoPct, ifood.taxaPagamentoPct, promoAn);

  const taxas = { impostoPct: cliente.impostoPct, comissaoPct: ifood.comissaoPct, taxaPagamentoPct: ifood.taxaPagamentoPct, embalagemPorItem: ifood.embalagemPorItem };
  const qtd: Record<string, number> = {};
  for (const d of porData(ifood.vendasPratosDia, iv.atual)) for (const [id, n] of Object.entries(d.qtd)) qtd[id] = (qtd[id] ?? 0) + n;
  const pratos = marcarVendeMuitoMargemBaixa(
    ifood.pratos
      .map((pr) => {
        const q = qtd[pr.id] ?? 0;
        const mu = margemItemIfood(pr.precoIfood, pr.cmvUnitario, taxas);
        return { id: pr.id, nome: pr.nome, qtd: q, faturamento: q * pr.precoIfood, margemUnitaria: mu, margemPct: dividir(mu, pr.precoIfood), margemTotal: mu * q };
      })
      .sort((x, y) => y.faturamento - x.faturamento)
      .slice(0, 10),
    cliente.limites.margemMinimaPct,
  );

  // Margem dos pedidos com promoção, antes do custo da promoção
  const custoIfood = taxaMediaTipo(filtrar(metricas.dias, iv.atual), cliente, "ifood").custoPorPedido;
  const fatorMargem = 1 - cliente.impostoPct - ifood.comissaoPct - ifood.taxaPagamentoPct - at.cmvPct;
  const promocoes = ifood.promocoes.map((pr) => {
    const linhas = porData(ifood.promocoesDia, iv.atual).map((d) => d.promocoes[pr.id]).filter(Boolean);
    const pedidos = linhas.reduce((s, l) => s + l.pedidos, 0);
    const faturamento = linhas.reduce((s, l) => s + l.faturamento, 0);
    const custo = linhas.reduce((s, l) => s + l.custo, 0);
    const margemDosPedidos = faturamento * fatorMargem - pedidos * custoIfood;
    return { id: pr.id, nome: pr.nome, tipo: pr.tipo, pedidos, faturamento, custo, margemDosPedidos, resultado: margemDosPedidos - custo };
  });
  const pior = [...promocoes].sort((x, y) => x.resultado - y.resultado)[0];
  const blocos = origemTela({ vendas: metricas.origem, operacao: ifood.origem, taxa: ifood.origem, pratos: ifood.origem, promocoes: ifood.origem, funil: ifood.origem, faixas: ifood.origem });
  // Frase: só cita taxa e promoção quando elas vêm da mesma fonte que as vendas
  const fraseCompleta = ifood.origem === metricas.origem;

  const funilSoma = (iv2: [string, string]) =>
    porData(ifood.funilDia, iv2).reduce((s, d) => ({ visitas: s.visitas + d.visitas, cardapio: s.cardapio + d.cardapio, sacola: s.sacola + d.sacola, pedidos: s.pedidos + d.pedidos }), { visitas: 0, cardapio: 0, sacola: 0, pedidos: 0 });
  const fu = funilSoma(iv.atual);
  const fuAn = funilSoma(iv.anterior);

  // Gráficos: no mínimo 7 dias, para "ontem" não virar uma barra só
  const ivGrafico: [string, string] = periodo === "ontem" ? intervalos("7d", ultimoDia(p)).atual : iv.atual;
  const faixas: Record<string, number> = {};
  for (const d of porData(ifood.pedidosPorFaixaDia, ivGrafico)) for (const [f, n] of Object.entries(d.faixas)) faixas[f] = (faixas[f] ?? 0) + n;

  return {
    ...blocos,
    margemMinimaPct: cliente.limites.margemMinimaPct,
    frase: fraseCompleta
      ? fraseIfood({ faturamento: at.fat, faturamentoAnterior: an.fat, taxaPct: te.pct, taxaPctAnterior: teAn.pct, promocoes: promoAt, promocoesAnterior: promoAn, piorPromo: pior })
      : fraseIfood({ faturamento: at.fat, faturamentoAnterior: an.fat, taxaPct: 0, taxaPctAnterior: 0, promocoes: 0, promocoesAnterior: 0 }),
    indicadores: {
      faturamento: { atual: at.fat, anterior: an.fat },
      pedidos: { atual: at.ped, anterior: an.ped },
      ticket: { atual: dividir(at.fat, at.ped), anterior: dividir(an.fat, an.ped) },
      nota: { atual: opAt.nota, anterior: opAn.nota },
      tempoEntregaMin: { atual: opAt.tempo, anterior: opAn.tempo },
      cancelamentoPct: { atual: dividir(opAt.cancelados, at.ped), anterior: dividir(opAn.cancelados, an.ped) },
    },
    taxaEfetiva: { ...te, pctAnterior: teAn.pct },
    pratos,
    promocoes,
    funil: {
      etapas: [
        { rotulo: "Visitas na loja", valor: fu.visitas },
        { rotulo: "Abriram o cardápio", valor: fu.cardapio },
        { rotulo: "Colocaram na sacola", valor: fu.sacola },
        { rotulo: "Fizeram o pedido", valor: fu.pedidos },
      ],
      conversao: dividir(fu.pedidos, fu.visitas),
      conversaoAnterior: dividir(fuAn.pedidos, fuAn.visitas),
    },
    pedidosDia: filtrar(metricas.dias, ivGrafico).map((d) => ({ data: d.data, pedidos: resumir([d], cliente).pedidosCanal.ifood })),
    faixas: Object.entries(faixas).map(([faixa, pedidos]) => ({ faixa, pedidos })),
  };
}

/* ---------- Pilar 2: canal próprio e tráfego ---------- */

export async function getCanalProprio(slug: string, periodo: Periodo, operacao: string = TODAS, acesso: Acesso = SEM_ACESSO): Promise<VisaoCanalProprio> {
  // 56 dias: as 8 semanas fechadas do gráfico de participação.
  const p = await pacote(slug, periodo, operacao, ["vendas", "midia"], diasPara(periodo, 56), acesso);
  const { cliente, canalProprio: cp, metricas } = p;
  const fim = ultimoDia(p);
  const iv = intervalos(periodo, fim);
  const at = resumir(filtrar(metricas.dias, iv.atual), cliente);
  const an = resumir(filtrar(metricas.dias, iv.anterior), cliente);

  // 8 semanas fechadas terminando no último dia
  const semanas = Array.from({ length: 8 }, (_, i) => {
    const fimSemana = somarDias(fim, -7 * (7 - i));
    const inicio = somarDias(fimSemana, -6);
    const r = resumir(filtrar(metricas.dias, [inicio, fimSemana]), cliente);
    return { inicio, ifood: r.canalPct.ifood, proprio: r.canalPct.proprio, salao: r.canalPct.salao };
  });

  const pedidosProprio = at.pedidosCanal.proprio;
  const fatProprio = at.faturamentoCanal.proprio;
  const tIfood = taxaMediaTipo(filtrar(metricas.dias, iv.atual), cliente, "ifood");
  const tProprio = taxaMediaTipo(filtrar(metricas.dias, iv.atual), cliente, "proprio");
  const custoSeFosseIfood = fatProprio * tIfood.taxaPct + pedidosProprio * tIfood.custoPorPedido;
  const custoNoCanalProprio = fatProprio * tProprio.taxaPct + pedidosProprio * tProprio.custoPorPedido;

  const somaAnuncios = (iv2: [string, string]) => {
    const porCriativo: Record<string, { investimento: number; impressoes: number; cliques: number; pedidos: number; faturamento: number }> = {};
    for (const d of porData(cp.anunciosDia, iv2)) {
      for (const [id, r] of Object.entries(d.criativos)) {
        const acc = (porCriativo[id] ??= { investimento: 0, impressoes: 0, cliques: 0, pedidos: 0, faturamento: 0 });
        acc.investimento += r.investimento; acc.impressoes += r.impressoes; acc.cliques += r.cliques; acc.pedidos += r.pedidos; acc.faturamento += r.faturamento;
      }
    }
    const tot = Object.values(porCriativo).reduce(
      (s, r) => ({ investimento: s.investimento + r.investimento, impressoes: s.impressoes + r.impressoes, cliques: s.cliques + r.cliques, pedidos: s.pedidos + r.pedidos, faturamento: s.faturamento + r.faturamento }),
      { investimento: 0, impressoes: 0, cliques: 0, pedidos: 0, faturamento: 0 },
    );
    return { porCriativo, tot };
  };
  const anAt = somaAnuncios(iv.atual);
  const anAn = somaAnuncios(iv.anterior);
  const cpp = (inv: number, ped: number) => (ped ? inv / ped : null);
  const cmvPct = dividir(at.cmv, at.faturamento);
  const margem = anAt.tot.faturamento * (1 - cliente.impostoPct - tProprio.taxaPct - cmvPct) - anAt.tot.pedidos * tProprio.custoPorPedido;

  const nomeCampanha = (id: string) => cp.campanhas.find((c) => c.id === id)?.nome ?? "";
  const criativos = marcarMelhorPior(
    cp.criativos
      .map((k) => {
        const r = anAt.porCriativo[k.id] ?? { investimento: 0, pedidos: 0 };
        return { id: k.id, nome: k.nome, formato: k.formato, campanha: nomeCampanha(k.campanhaId), investimento: r.investimento, pedidos: r.pedidos, custoPorPedido: cpp(r.investimento, r.pedidos) };
      })
      .filter((k) => k.investimento > 0)
      .sort((x, y) => (x.custoPorPedido ?? Infinity) - (y.custoPorPedido ?? Infinity)),
  );
  const campanhas = cp.campanhas.map((c) => {
    const ids = cp.criativos.filter((k) => k.campanhaId === c.id).map((k) => k.id);
    const investimento = ids.reduce((s, id) => s + (anAt.porCriativo[id]?.investimento ?? 0), 0);
    const pedidos = ids.reduce((s, id) => s + (anAt.porCriativo[id]?.pedidos ?? 0), 0);
    return { ...c, investimento, pedidos, custoPorPedido: cpp(investimento, pedidos) };
  });

  const cppAt = cpp(anAt.tot.investimento, anAt.tot.pedidos);
  const cppAn = cpp(anAn.tot.investimento, anAn.tot.pedidos);
  const mesmaFonte = cp.origem === metricas.origem;
  const metaPct = mesmaFonte ? cp.metaPctCanalProprio : null;
  return {
    ...origemTela({ vendas: metricas.origem, economia: real(metricas.origem, cliente.origem), anuncios: cp.origem }),
    canais: tiposDo(cliente),
    frase: fraseCanalProprio({ pct: at.canalPct.proprio, pctAnterior: an.canalPct.proprio, meta: metaPct, custoPorPedido: mesmaFonte ? cppAt : null, custoPorPedidoAnterior: mesmaFonte ? cppAn : null }),
    metaPct,
    proprioPct: { atual: at.canalPct.proprio, anterior: an.canalPct.proprio },
    semanas,
    economia: { pedidos: pedidosProprio, faturamento: fatProprio, custoSeFosseIfood, custoNoCanalProprio, economia: custoSeFosseIfood - custoNoCanalProprio },
    trafego: {
      investimento: { atual: anAt.tot.investimento, anterior: anAn.tot.investimento },
      alcance: cp.alcance[periodo],
      impressoes: anAt.tot.impressoes,
      cliques: anAt.tot.cliques,
      pedidos: { atual: anAt.tot.pedidos, anterior: anAn.tot.pedidos },
      custoPorPedido: { atual: cppAt ?? 0, anterior: cppAn ?? 0 },
      faturamento: anAt.tot.faturamento,
      roas: dividir(anAt.tot.faturamento, anAt.tot.investimento),
      margem,
      roasMargem: dividir(margem, anAt.tot.investimento),
      sobraDepoisDoAnuncio: margem - anAt.tot.investimento,
    },
    criativos,
    campanhas,
  };
}

/* ---------- Pilar 3: CRM sniper ---------- */

export async function getCrm(slug: string, periodo: Periodo, operacao: string = TODAS, acesso: Acesso = SEM_ACESSO): Promise<VisaoCrm> {
  const p = await pacote(slug, periodo, operacao, ["vendas", "crm"], diasPara(periodo), acesso);
  const { crm } = p;
  const iv = intervalos(periodo, ultimoDia(p));
  const nomeSeg = (id: string) => crm.segmentos.find((s) => s.id === id)?.nome ?? id;
  const optInSeg = (id: string) => crm.segmentos.find((s) => s.id === id)?.comOptIn ?? 0;
  const clientesSeg = (id: string) => crm.segmentos.find((s) => s.id === id)?.clientes ?? 0;

  const disparos = porData(crm.disparos, iv.atual)
    .map((d) => ({ ...d, nomeSegmento: nomeSeg(d.segmento), custo: d.enviados * crm.custoPorMensagem }))
    .sort((a, b) => b.data.localeCompare(a.data));
  const totais = disparos.reduce(
    (s, d) => ({ enviados: s.enviados + d.enviados, respostas: s.respostas + d.respostas, pedidos: s.pedidos + d.pedidos, faturamento: s.faturamento + d.faturamento, custo: s.custo + d.custo }),
    { enviados: 0, respostas: 0, pedidos: 0, faturamento: 0, custo: 0 },
  );
  const segmentos = crm.segmentos.map((s) => ({ ...s, pctOptIn: dividir(s.comOptIn, s.clientes) }));
  const maior = [...segmentos].filter((s) => s.id !== "sumidos").sort((a, b) => b.comOptIn - a.comOptIn)[0];
  const ultimo = [...crm.disparos].sort((a, b) => b.data.localeCompare(a.data))[0];

  return {
    origem: crm.origem,
    frase: fraseCrm({ comOptIn: crm.resumo.comOptIn, total: crm.resumo.baseTotal, ...totais, disparos: disparos.length, maiorGrupo: maior && { nome: maior.nome, disparaveis: maior.comOptIn } }),
    base: { total: crm.resumo.baseTotal, comOptIn: crm.resumo.comOptIn, pctOptIn: dividir(crm.resumo.comOptIn, crm.resumo.baseTotal) },
    novos: crm.resumo.novosClientes[periodo],
    novosComOptIn: crm.resumo.novosComOptIn[periodo],
    segmentos,
    disparos,
    totaisDisparos: totais,
    ultimoDisparo: ultimo?.data ?? null,
    proximos: crm.proximos.map((d) => ({ ...d, nomeSegmento: nomeSeg(d.segmento), disparaveis: optInSeg(d.segmento), foraDoDisparo: clientesSeg(d.segmento) - optInSeg(d.segmento) })),
  };
}

/* ---------- Pilar 4: vendedor IA no WhatsApp ---------- */

export async function getWhatsapp(slug: string, periodo: Periodo, operacao: string = TODAS, acesso: Acesso = SEM_ACESSO): Promise<VisaoWhatsapp> {
  const p = await pacote(slug, periodo, operacao, ["vendas", "whatsapp", "cardapio"], diasPara(periodo), acesso);
  const { cliente, whatsapp: wa, metricas, lucro } = p;
  const iv = intervalos(periodo, ultimoDia(p));
  const soma = (iv2: [string, string]) => {
    const linhas = porData(wa.dias, iv2);
    const t = (k: keyof Omit<WhatsappDia, "data" | "transferencias">) => linhas.reduce((s, d) => s + d[k], 0);
    const transf: Record<string, number> = {};
    for (const d of linhas) for (const [m, n] of Object.entries(d.transferencias)) transf[m] = (transf[m] ?? 0) + n;
    return {
      conversas: t("conversas"), pedidos: t("pedidos"), faturamento: t("faturamento"), sugestoes: t("sugestoes"), aceitas: t("sugestoesAceitas"),
      valor: t("valorAdicionais"), followups: t("followups"), respondidos: t("followupsRespondidos"), recuperados: t("pedidosRecuperados"), transf,
    };
  };
  const at = soma(iv.atual);
  const an = soma(iv.anterior);
  const geral = resumir(filtrar(metricas.dias, iv.atual), cliente);
  const ticketWa = dividir(at.faturamento, at.pedidos);
  const cmvPct = dividir(geral.cmv, geral.faturamento);
  const fatorMargemProprio = 1 - cliente.impostoPct - taxaMediaTipo(metricas.dias, cliente, "proprio").taxaPct;
  const margemAdicionais = at.valor * (fatorMargemProprio - cmvPct);
  const conv = dividir(at.pedidos, at.conversas);
  const convAn = dividir(an.pedidos, an.conversas);

  const blocosWa = origemTela({ conversas: wa.origem, cardapio: real(lucro.origem, cliente.origem) });
  return {
    ...blocosWa,
    frase: blocosWa.origem === "MISTO" && wa.origem === "EXEMPLO"
      ? `O vendedor IA ainda não está ligado na ${cliente.nome}: os números de conversa desta tela são de exemplo. O cardápio que a IA usa já sai das fichas técnicas reais.`
      : fraseWhatsapp({ conversas: at.conversas, pedidos: at.pedidos, conversao: conv, conversaoAnterior: convAn, ticketWa, ticketGeral: geral.ticket, valorAdicionais: at.valor }),
    conversas: { atual: at.conversas, anterior: an.conversas },
    pedidos: { atual: at.pedidos, anterior: an.pedidos },
    conversao: { atual: conv, anterior: convAn },
    ticketWhatsapp: ticketWa,
    ticketGeral: geral.ticket,
    faturamento: at.faturamento,
    vendaSugestiva: { sugestoes: at.sugestoes, aceitas: at.aceitas, taxaAceite: dividir(at.aceitas, at.sugestoes), valor: at.valor, margem: margemAdicionais },
    followups: { enviados: at.followups, respondidos: at.respondidos, recuperados: at.recuperados, faturamentoRecuperado: at.recuperados * ticketWa },
    transferencias: Object.entries(at.transf).map(([motivo, quantidade]) => ({ motivo, quantidade })).sort((a, b) => b.quantidade - a.quantidade),
    conversasRecentes: [...wa.conversas].sort((a, b) => b.inicio.localeCompare(a.inicio)),
    cardapio: lucro.fichas.map((f) => {
      const m = f.preco * fatorMargemProprio - f.custo;
      return { nome: f.nome, categoria: f.categoria, preco: f.preco, margem: m, margemPct: dividir(m, f.preco) };
    }).sort((a, b) => b.margem - a.margem),
    regras: wa.regras,
  };
}

/* ---------- Pilar 5: gestão de lucro ---------- */

export async function getLucro(slug: string, periodo: Periodo, operacao: string = TODAS, acesso: Acesso = SEM_ACESSO): Promise<VisaoLucro> {
  // 64 dias: o mês corrente das metas, mais o período anterior quando ele é "mes".
  const p = await pacote(slug, periodo, operacao, ["vendas", "cardapio", "midia"], diasPara(periodo, 64), acesso);
  const { cliente, lucro, metricas, canalProprio } = p;
  const fim = ultimoDia(p);
  const iv = intervalos(periodo, fim);
  const at = resumir(filtrar(metricas.dias, iv.atual), cliente);
  const an = resumir(filtrar(metricas.dias, iv.anterior), cliente);
  const mc = margemPorCanal(filtrar(metricas.dias, iv.atual), cliente);

  // Quantidades: do período escolhido, ou da janela fixa quando só existe o total
  const qtd: Record<string, number> = {};
  if (lucro.vendasPratos) Object.assign(qtd, lucro.vendasPratos.qtd);
  else for (const d of porData(lucro.vendasPratosDia, iv.atual)) for (const [id, n] of Object.entries(d.qtd)) qtd[id] = (qtd[id] ?? 0) + n;
  const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const janelaVendas = lucro.vendasPratos ? `${dm(lucro.vendasPratos.inicio)} a ${dm(lucro.vendasPratos.fim)}` : null;
  const { pratos, cortes } = classificarCardapio(
    lucro.fichas.map((f) => ({
      id: f.id, nome: f.nome, categoria: f.categoria, preco: f.preco, custo: f.custo, cmvPct: dividir(f.custo, f.preco), margem: f.preco - f.custo,
      qtd: qtd[f.id] ?? 0, estimado: !!f.estimado, base: f.base ?? null,
    })),
  );

  // Metas do mês: sempre o mês corrente até o último dia fechado
  const ivMes = intervalos("mes", fim).atual;
  const mes = resumir(filtrar(metricas.dias, ivMes), cliente);
  const passados = filtrar(metricas.dias, ivMes).length;
  const totalDias = diasNoMes(fim);
  const nomeMes = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(lerData(fim));
  const metaMargemMes = lucro.metaFaturamentoMes !== null && lucro.metaMargemPct !== null ? lucro.metaFaturamentoMes * lucro.metaMargemPct : null;
  const metaCanal = canalProprio.origem === metricas.origem ? canalProprio.metaPctCanalProprio : null;

  return {
    ...origemTela({ cmv: real(metricas.origem, cliente.origem), cardapio: lucro.origem, metas: real(metricas.origem, lucro.origem) }),
    notaMargem: cliente.notaMargem ?? null,
    cmvEstimado: !!metricas.cmvEstimado,
    janelaVendas,
    frase: fraseLucro({ cmvPct: dividir(at.cmv, at.faturamento), metaCmv: lucro.metaCmvPct, cmvEstimado: metricas.cmvEstimado, margemPct: at.margemPct, margemPctAnterior: an.margemPct, margem: at.margem, cavalos: pratos.filter((x) => x.quadrante === "cavalo").map((x) => x.nome) }),
    cmv: { valor: at.cmv, pct: dividir(at.cmv, at.faturamento), pctAnterior: dividir(an.cmv, an.faturamento), meta: lucro.metaCmvPct },
    margem: { valor: at.margem, pct: at.margemPct, pctAnterior: an.margemPct, meta: lucro.metaMargemPct },
    porCanal: canaisDo(cliente).map((c) => ({ canal: c, nome: cliente.canais[c].nome, tipo: tipoDe(cliente, c), operacao: operacoesDo(cliente).length > 1 ? (cliente.canais[c].operacao ?? null) : null, faturamento: mc[c].faturamento, margem: mc[c].margem, margemPct: dividir(mc[c].margem, mc[c].faturamento) })),
    pratos,
    cortes,
    metasMes: {
      mes: nomeMes,
      diasPassados: passados,
      diasNoMes: totalDias,
      itens: [
        { id: "faturamento", rotulo: "Faturamento", meta: lucro.metaFaturamentoMes, realizado: mes.faturamento, projecao: projetarMes(mes.faturamento, passados, totalDias), tipo: "brl" },
        { id: "margem", rotulo: "Margem de contribuição", meta: metaMargemMes, realizado: mes.margem, projecao: projetarMes(mes.margem, passados, totalDias), tipo: "brl" },
        { id: "cmv", rotulo: "CMV", meta: lucro.metaCmvPct, realizado: dividir(mes.cmv, mes.faturamento), projecao: null, tipo: "pct", menorMelhor: true },
        { id: "proprio", rotulo: "Vendas no canal próprio", meta: metaCanal, realizado: mes.canalPct.proprio, projecao: null, tipo: "pct" },
      ],
    },
  };
}

/* ---------- Pilar 6: métricas diárias ---------- */

export async function getMetricas(slug: string, periodo: Periodo, operacao: string = TODAS, acesso: Acesso = SEM_ACESSO): Promise<VisaoMetricas> {
  // "tudo": o calendário mês a mês mostra a série inteira. É a única tela que pede isso.
  const p = await pacote(slug, periodo, operacao, ["vendas", "plano"], "tudo", acesso);
  const { cliente, metricas } = p;
  const fim = ultimoDia(p);
  const iv = intervalos(periodo, fim);

  const temMeta = !!cliente.metaPorDiaSemana;
  const porMes = new Map<string, VisaoMetricas["meses"][number]["dias"]>();
  for (const d of metricas.dias) {
    const r = resumir([d], cliente);
    const meta = metaDoDia(cliente, d.data) || null;
    const lista = porMes.get(d.data.slice(0, 7)) ?? [];
    lista.push({ data: d.data, faturamento: r.faturamento, meta, situacao: meta ? situacaoMeta(r.faturamento / meta, cliente) : null });
    porMes.set(d.data.slice(0, 7), lista);
  }

  const tabela: LinhaDiaria[] = filtrar(metricas.dias, iv.atual).map((d) => {
    const r = resumir([d], cliente);
    return { data: d.data, faturamento: r.faturamento, meta: metaDoDia(cliente, d.data) || null, pedidos: r.pedidos, ticket: r.ticket, margem: r.margem, pizzas: d.producao?.pizzas ?? null, perdas: d.producao?.perdas ?? null };
  }).reverse();

  const alertas = filtrar(metricas.dias, [somarDias(fim, -29), fim])
    .flatMap((d) => {
      const a = alertasDoDia(metricas.dias, d.data, cliente)[0];
      return a && a.tipo !== "nenhum" ? [{ data: d.data, tipo: a.tipo, texto: a.texto }] : [];
    })
    .reverse();

  const batidos = tabela.filter((l) => l.meta !== null && l.faturamento >= l.meta).length;
  return {
    origem: real(metricas.origem, cliente.origem),
    temMeta,
    margemEstimada: !!metricas.cmvEstimado,
    frase: fraseMetricas(batidos, tabela.length, alertas.length, temMeta),
    meses: [...porMes.entries()].map(([mes, dias]) => ({ mes, dias })),
    tabela,
    mensagem: montarMensagemDiaria(cliente, comandaDoDia(p, fim)),
    alertas,
  };
}

/* ---------- Plano de ação ---------- */

export async function getPlano(slug: string, acesso: Acesso = SEM_ACESSO): Promise<Plano> {
  return (await pacote(slug, "7d", TODAS, ["plano"], 1, acesso)).plano;
}

/** "Hoje" do ponto de vista dos dados: o dia seguinte ao último dia fechado */
export async function getDataReferencia(slug: string, acesso: Acesso = SEM_ACESSO): Promise<string> {
  const p = await pacote(slug, "7d", TODAS, [], 1, acesso);
  return somarDias(ultimoDia(p), 1);
}
