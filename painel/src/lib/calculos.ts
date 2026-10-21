import {
  NOME_TIPO,
  TIPOS_CANAL,
  type AcaoSugerida,
  type Alerta,
  type CanalId,
  type TipoCanal,
  type Cliente,
  type ComandaDoDia,
  type DiaSemana,
  type DiaVendas,
  type Periodo,
  type Plano,
  type Quadrante,
  type ResumoVendas,
  type Situacao,
} from "./types";
import { formatarBRL as fmtBRL, formatarPct as fmtPct } from "./formato";

const DIAS_SEMANA: DiaSemana[] = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

/** "2026-10-07" → Date local ao meio-dia (evita pular de dia por fuso) */
export function lerData(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d, 12);
}

export function isoDe(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function somarDias(iso: string, dias: number): string {
  const d = lerData(iso);
  d.setDate(d.getDate() + dias);
  return isoDe(d);
}

export function diaSemana(iso: string): DiaSemana {
  return DIAS_SEMANA[lerData(iso).getDay()];
}

export function dividir(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

/**
 * Divisao que admite NAO TER resposta.
 *
 * `dividir` devolve 0 sem denominador, e esse 0 vira afirmacao na tela ("ROAS 0,0x",
 * "conversao 0%", "taxa 0,0%") sobre algo que ninguem mediu. Onde o numero vai para a
 * tela, use esta: null nao e zero, e so o null faz a tela escrever "ainda nao medido".
 * Tambem barra NaN e Infinity, que nunca podem chegar na tela.
 */
export function razao(a: number, b: number): number | null {
  if (b === 0) return null;
  const r = a / b;
  return Number.isFinite(r) ? r : null;
}

/** Maior valor da lista; null quando ela esta vazia, porque Math.max() de vazio e -Infinity. */
export function maiorDe(valores: number[]): number | null {
  if (!valores.length) return null;
  const m = Math.max(...valores);
  return Number.isFinite(m) ? m : null;
}

/** variação relativa; null quando não há base de comparação */
export function variacao(atual: number, anterior: number): number | null {
  return anterior === 0 ? null : atual / anterior - 1;
}

/** Tipo de um canal de venda (iFood, próprio, salão) */
export function tipoDe(cliente: Cliente, canal: CanalId): TipoCanal {
  return cliente.canais[canal]?.tipo ?? (canal as TipoCanal);
}

/** Canais de venda que o cliente tem cadastrados */
export function canaisDo(cliente: Cliente): CanalId[] {
  return Object.keys(cliente.canais);
}

/** Tipos de canal que o cliente usa, na ordem padrão */
export function tiposDo(cliente: Cliente): TipoCanal[] {
  const usados = new Set(canaisDo(cliente).map((c) => tipoDe(cliente, c)));
  return TIPOS_CANAL.filter((t) => usados.has(t));
}

/** Operações (marcas/lojas) do cliente, na ordem do cadastro; vazio quando é uma operação só */
export function operacoesDo(cliente: Cliente): string[] {
  return [...new Set(canaisDo(cliente).map((c) => cliente.canais[c].operacao).filter((o): o is string => !!o))];
}

/** CMV de cada canal no dia: o informado pelo canal, ou o do dia rateado pelo faturamento */
function cmvPorCanal(dia: DiaVendas): Record<CanalId, number> {
  const ids = Object.keys(dia.canais);
  if (ids.every((c) => dia.canais[c].cmv !== undefined)) return Object.fromEntries(ids.map((c) => [c, dia.canais[c].cmv!]));
  const fat = ids.reduce((s, c) => s + dia.canais[c].faturamento, 0);
  return Object.fromEntries(ids.map((c) => [c, dia.cmv * dividir(dia.canais[c].faturamento, fat)]));
}

/** Margem de contribuição de cada canal num dia: faturamento − CMV − imposto − taxa e custo por pedido do canal */
function margensDoDia(dia: DiaVendas, cliente: Cliente): Record<CanalId, number> {
  const cmv = cmvPorCanal(dia);
  const out: Record<CanalId, number> = {};
  for (const [c, v] of Object.entries(dia.canais)) {
    const cfg = cliente.canais[c];
    if (!cfg) continue;
    out[c] = v.faturamento - cmv[c] - v.faturamento * (cliente.impostoPct + cfg.taxaPct) - v.pedidos * cfg.custoPorPedido;
  }
  return out;
}

/** Margem de contribuição de um dia: faturamento − CMV − imposto − taxas e custos por pedido de cada canal */
export function margemDoDia(dia: DiaVendas, cliente: Cliente): number {
  return Object.values(margensDoDia(dia, cliente)).reduce((s, m) => s + m, 0);
}

export function resumir(dias: DiaVendas[], cliente: Cliente): ResumoVendas {
  const zero = () => ({ ifood: 0, proprio: 0, salao: 0 }) as Record<TipoCanal, number>;
  const faturamentoCanal = zero();
  const pedidosCanal = zero();
  const porCanal: Record<CanalId, { faturamento: number; pedidos: number }> = Object.fromEntries(canaisDo(cliente).map((c) => [c, { faturamento: 0, pedidos: 0 }]));
  let cmv = 0;
  let margem = 0;
  for (const dia of dias) {
    for (const [c, v] of Object.entries(dia.canais)) {
      if (!cliente.canais[c]) continue;
      porCanal[c].faturamento += v.faturamento;
      porCanal[c].pedidos += v.pedidos;
      faturamentoCanal[tipoDe(cliente, c)] += v.faturamento;
      pedidosCanal[tipoDe(cliente, c)] += v.pedidos;
    }
    cmv += dia.cmv;
    margem += margemDoDia(dia, cliente);
  }
  const faturamento = TIPOS_CANAL.reduce((s, t) => s + faturamentoCanal[t], 0);
  const pedidos = TIPOS_CANAL.reduce((s, t) => s + pedidosCanal[t], 0);
  const canalPct = Object.fromEntries(TIPOS_CANAL.map((t) => [t, dividir(faturamentoCanal[t], faturamento)])) as Record<TipoCanal, number>;
  return {
    faturamento,
    pedidos,
    ticket: dividir(faturamento, pedidos),
    cmv,
    margem,
    margemPct: dividir(margem, faturamento),
    canalPct,
    faturamentoCanal,
    pedidosCanal,
    porCanal,
  };
}

/** Taxa média dos canais de um tipo, ponderada pelo faturamento (cai na média simples se não houve venda) */
export function taxaMediaTipo(dias: DiaVendas[], cliente: Cliente, tipo: TipoCanal): { taxaPct: number; custoPorPedido: number } {
  const ids = canaisDo(cliente).filter((c) => tipoDe(cliente, c) === tipo);
  if (!ids.length) return { taxaPct: 0, custoPorPedido: 0 };
  let fat = 0, ped = 0, taxa = 0, custo = 0;
  for (const d of dias) for (const c of ids) {
    const v = d.canais[c];
    if (!v) continue;
    fat += v.faturamento; ped += v.pedidos;
    taxa += v.faturamento * cliente.canais[c].taxaPct; custo += v.pedidos * cliente.canais[c].custoPorPedido;
  }
  if (!fat) return { taxaPct: ids.reduce((s, c) => s + cliente.canais[c].taxaPct, 0) / ids.length, custoPorPedido: ids.reduce((s, c) => s + cliente.canais[c].custoPorPedido, 0) / ids.length };
  return { taxaPct: taxa / fat, custoPorPedido: dividir(custo, ped) };
}

/** Intervalo [inicio, fim] (ISO, inclusive) do período e do período anterior equivalente */
export function intervalos(periodo: Periodo, ultimoDia: string): { atual: [string, string]; anterior: [string, string] } {
  if (periodo === "mes") {
    const fim = lerData(ultimoDia);
    const inicio = new Date(fim.getFullYear(), fim.getMonth(), 1, 12);
    const inicioAnt = new Date(fim.getFullYear(), fim.getMonth() - 1, 1, 12);
    const fimAnt = new Date(fim.getFullYear(), fim.getMonth() - 1, fim.getDate(), 12);
    return { atual: [isoDe(inicio), ultimoDia], anterior: [isoDe(inicioAnt), isoDe(fimAnt)] };
  }
  const n = periodo === "ontem" ? 1 : periodo === "7d" ? 7 : 30;
  // "ontem" compara com o mesmo dia da semana anterior, que é o que o dono usa de régua
  const passoAnterior = periodo === "ontem" ? 7 : n;
  const inicio = somarDias(ultimoDia, -(n - 1));
  return {
    atual: [inicio, ultimoDia],
    anterior: [somarDias(inicio, -passoAnterior), somarDias(ultimoDia, -passoAnterior)],
  };
}

export function filtrar(dias: DiaVendas[], [inicio, fim]: [string, string]): DiaVendas[] {
  return dias.filter((d) => d.data >= inicio && d.data <= fim);
}

/** Meta do dia pelo dia da semana; 0 quando o cliente ainda não tem meta cadastrada */
export function metaDoDia(cliente: Cliente, iso: string): number {
  return cliente.metaPorDiaSemana?.[diaSemana(iso)] ?? 0;
}


export function situacaoMeta(pct: number, cliente: Cliente): Situacao {
  if (pct >= 1) return "bom";
  return pct >= cliente.limites.metaMinimaPct ? "atencao" : "alerta";
}

/** Um alerta só: o mais grave que disparou. Mesma ordem do relatorio-diario/gerar_relatorio.py */
export function alertasDoDia(dias: DiaVendas[], iso: string, cliente: Cliente): Alerta[] {
  const lim = cliente.limites;
  const dia = filtrar(dias, [iso, iso]);
  if (!dia.length) return [];
  const hoje = resumir(dia, cliente);
  const out: Alerta[] = [];
  const meta = metaDoDia(cliente, iso);
  if (meta && hoje.faturamento < meta * lim.metaMinimaPct) {
    out.push({ tipo: "meta", texto: `Faturamento ficou em ${fmtPct(hoje.faturamento / meta)} da meta` });
  }
  if (hoje.faturamento && hoje.margemPct < lim.margemMinimaPct) {
    out.push({ tipo: "margem", texto: `Margem de ${fmtPct(hoje.margemPct, 1)}, abaixo do mínimo de ${fmtPct(lim.margemMinimaPct)}` });
  }
  const semanaPassada = resumir(filtrar(dias, [somarDias(iso, -7), somarDias(iso, -7)]), cliente);
  if (semanaPassada.pedidos && hoje.pedidos <= semanaPassada.pedidos * (1 - lim.quedaPedidosPct)) {
    out.push({ tipo: "pedidos", texto: `${hoje.pedidos} pedidos contra ${semanaPassada.pedidos} no mesmo dia da semana passada` });
  }
  if (hoje.canalPct.ifood > lim.ifoodMaximoPct) {
    out.push({ tipo: "ifood", texto: `iFood ficou com ${fmtPct(hoje.canalPct.ifood)} das vendas (limite ${fmtPct(lim.ifoodMaximoPct)})` });
  }
  const anteriores = filtrar(dias, [somarDias(iso, -7), somarDias(iso, -1)]).map((d) => resumir([d], cliente).ticket).filter((t) => t > 0);
  if (anteriores.length) {
    const media = anteriores.reduce((s, t) => s + t, 0) / anteriores.length;
    if (hoje.ticket <= media * (1 - lim.quedaTicketPct)) {
      out.push({ tipo: "ticket", texto: `Ticket de ${fmtBRL(hoje.ticket)}, abaixo da média de 7 dias (${fmtBRL(media)})` });
    }
  }
  return out;
}

/**
 * As 3 acoes da comanda, cada uma COM a sua origem.
 *
 * Achado A: as 13 linhas de acao_sugerida da Le Tre tem origem EXEMPLO e chegavam na
 * Comanda e na mensagem do WhatsApp como texto puro, sem selo. O dono lia recomendacao
 * fabricada como se fosse o metodo da casa. A origem viaja junto justamente para a tela
 * nao ter como esquecer de marcar.
 */
export function acoesDoDia(alertas: Alerta[], plano: Plano): AcaoSugerida[] {
  const acoes: AcaoSugerida[] = [];
  const juntar = (lista: AcaoSugerida[]) => {
    for (const acao of lista) if (!acoes.some((x) => x.texto === acao.texto)) acoes.push(acao);
  };
  for (const a of alertas) {
    if (a.tipo === "nenhum") continue;
    juntar(plano.acoesPorAlerta[a.tipo] ?? []);
  }
  juntar(plano.acoesPadrao);
  return acoes.slice(0, 3);
}

/* ---------- Pilares 1, 2 e 3 ---------- */

export function porData<T extends { data: string }>(linhas: T[], [inicio, fim]: [string, string]): T[] {
  return linhas.filter((l) => l.data >= inicio && l.data <= fim);
}

/** Margem de contribuição de um item vendido no iFood: preço − imposto − comissão − taxa de pagamento − CMV − embalagem */
export function margemItemIfood(
  preco: number,
  cmvUnitario: number,
  t: { impostoPct: number; comissaoPct: number; taxaPagamentoPct: number; embalagemPorItem: number },
): number {
  return preco * (1 - t.impostoPct - t.comissaoPct - t.taxaPagamentoPct) - cmvUnitario - t.embalagemPorItem;
}

/** Taxa efetiva do iFood = comissão + taxa de pagamento + promoções bancadas pelo restaurante, sobre o faturamento */
export function taxaEfetiva(faturamento: number, comissaoPct: number, taxaPagamentoPct: number, promocoes: number) {
  const comissao = faturamento * comissaoPct;
  const taxaPagamento = faturamento * taxaPagamentoPct;
  const total = comissao + taxaPagamento + promocoes;
  return { faturamento, comissao, taxaPagamento, promocoes, total, pct: dividir(total, faturamento) };
}

/** Itens que estão entre os mais vendidos (metade de cima) e abaixo da margem mínima */
export function marcarVendeMuitoMargemBaixa<T extends { qtd: number; margemPct: number | null }>(
  itens: T[],
  margemMinimaPct: number,
): (T & { vendeMuitoMargemBaixa: boolean })[] {
  const qtds = [...itens].map((i) => i.qtd).sort((a, b) => a - b);
  const mediana = qtds.length ? qtds[Math.floor((qtds.length - 1) / 2)] : 0;
  // margemPct null = a margem nao foi medida (taxas do iFood ausentes). Nao da para
  // acusar um prato de margem baixa sem saber a margem dele.
  return itens.map((i) => ({ ...i, vendeMuitoMargemBaixa: i.margemPct !== null && i.qtd >= mediana && i.margemPct < margemMinimaPct }));
}

/** Melhor e pior criativo por custo por pedido, só entre os que têm pedidos suficientes para comparar */
export function marcarMelhorPior<T extends { custoPorPedido: number | null; pedidos: number }>(itens: T[], minimoPedidos = 3): (T & { marca: "melhor" | "pior" | null })[] {
  const elegiveis = itens.filter((i) => i.custoPorPedido !== null && i.pedidos >= minimoPedidos);
  const marcados = itens.map((i) => ({ ...i, marca: null as "melhor" | "pior" | null }));
  if (elegiveis.length < 2) return marcados;
  const ordenados = [...elegiveis].sort((a, b) => a.custoPorPedido! - b.custoPorPedido!);
  for (const m of marcados) {
    if (m.custoPorPedido === ordenados[0].custoPorPedido && m.pedidos >= minimoPedidos) m.marca = "melhor";
    else if (m.custoPorPedido === ordenados[ordenados.length - 1].custoPorPedido && m.pedidos >= minimoPedidos) m.marca = "pior";
  }
  return marcados;
}

const pctFrase = (v: number) => fmtPct(Math.abs(v));
const pp = (v: number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Math.abs(v) * 100)} p.p.`;

/** Frase de abertura do iFood, gerada a partir dos números */
export function fraseIfood(a: {
  faturamento: number;
  faturamentoAnterior: number;
  /** null = comissao/taxa de pagamento nao foram medidas: a frase nao cita taxa nenhuma */
  taxaPct: number | null;
  taxaPctAnterior: number | null;
  promocoes: number;
  promocoesAnterior: number;
  piorPromo?: { nome: string; resultado: number };
}): string {
  const v = variacao(a.faturamento, a.faturamentoAnterior);
  const parte1 =
    v === null ? "Ainda não há período anterior para comparar as vendas do iFood"
    : Math.abs(v) < 0.01 ? "Seu iFood vendeu o mesmo que no período anterior"
    : `Seu iFood vendeu ${pctFrase(v)} ${v > 0 ? "mais" : "menos"} que no período anterior`;
  const dt = a.taxaPct === null || a.taxaPctAnterior === null ? null : a.taxaPct - a.taxaPctAnterior;
  let parte2 = "";
  if (dt !== null && Math.abs(dt) >= 0.005) {
    const vendasBoas = v === null || v > -0.01;
    const taxaBoa = dt < 0;
    const conector = vendasBoas === taxaBoa ? ", e" : ", mas";
    const motivo = dt > 0 && a.promocoes - a.promocoesAnterior > 0 ? ", por causa das promoções" : "";
    parte2 = `${conector} a taxa efetiva ${dt > 0 ? "subiu" : "caiu"} ${pp(dt)}, para ${fmtPct(a.taxaPct ?? 0, 1)}${motivo}`;
  }
  const parte3 = a.piorPromo && a.piorPromo.resultado < 0 ? ` A promoção "${a.piorPromo.nome}" deu prejuízo: custou mais do que a margem dos pedidos que trouxe.` : "";
  return `${parte1}${parte2}.${parte3}`;
}

export function fraseCanalProprio(a: { pct: number; pctAnterior: number; meta: number | null; custoPorPedido: number | null; custoPorPedidoAnterior: number | null }): string {
  const dp = a.pct - a.pctAnterior;
  const tendencia = Math.abs(dp) < 0.005 ? "o mesmo que no período anterior" : `${pp(dp)} a ${dp > 0 ? "mais" : "menos"} que no período anterior`;
  const meta = a.meta === null ? "meta ainda não definida" : a.pct >= a.meta ? `acima da meta de ${fmtPct(a.meta)}` : `abaixo da meta de ${fmtPct(a.meta)}`;
  let custo = "";
  if (a.custoPorPedido !== null) {
    const v = a.custoPorPedidoAnterior ? variacao(a.custoPorPedido, a.custoPorPedidoAnterior) : null;
    custo = ` Cada pedido vindo de anúncio custou ${fmtBRL(a.custoPorPedido)}`;
    custo += v === null || Math.abs(v) < 0.01 ? "." : `, ${pctFrase(v)} ${v > 0 ? "mais caro" : "mais barato"} que antes.`;
  }
  return `O canal próprio ficou com ${fmtPct(a.pct)} das vendas (${meta}), ${tendencia}.${custo}`;
}

export function fraseCrm(a: { comOptIn: number; total: number; pedidos: number; faturamento: number; custo: number; disparos: number; maiorGrupo?: { nome: string; disparaveis: number } }): string {
  const base = `Dos ${a.total.toLocaleString("pt-BR")} clientes da base, ${a.comOptIn.toLocaleString("pt-BR")} (${fmtPct(dividir(a.comOptIn, a.total))}) aceitaram receber WhatsApp.`;
  if (a.disparos === 0) {
    return `${base} Nenhum disparo no período${a.maiorGrupo ? `; o maior grupo pronto para receber é "${a.maiorGrupo.nome}", com ${a.maiorGrupo.disparaveis.toLocaleString("pt-BR")} clientes` : ""}.`;
  }
  return `${base} ${a.disparos === 1 ? "O disparo" : `Os ${a.disparos} disparos`} do período ${a.disparos === 1 ? "trouxe" : "trouxeram"} ${a.pedidos} pedidos e ${fmtBRL(a.faturamento)}, com custo de ${fmtBRL(a.custo)}.`;
}

/* ---------- Pilares 4, 5 e 6 ---------- */

/**
 * Margem de contribuição por canal de venda. Usa o CMV de cada canal quando ele vem separado; senão o CMV
 * do dia é dividido entre os canais na proporção do faturamento (premissa: o mix de pratos é parecido entre canais).
 */
export function margemPorCanal(dias: DiaVendas[], cliente: Cliente): Record<CanalId, { faturamento: number; margem: number }> {
  const out: Record<CanalId, { faturamento: number; margem: number }> = Object.fromEntries(canaisDo(cliente).map((c) => [c, { faturamento: 0, margem: 0 }]));
  for (const dia of dias) {
    const m = margensDoDia(dia, cliente);
    for (const c of Object.keys(m)) {
      out[c].faturamento += dia.canais[c].faturamento;
      out[c].margem += m[c];
    }
  }
  return out;
}

/**
 * Engenharia de cardápio (método Kasavana & Smith):
 * popular = vendeu pelo menos 70% da média por prato; margem alta = acima da margem média ponderada pelas vendas.
 */
export function classificarCardapio<T extends { qtd: number; margem: number }>(pratos: T[]): { pratos: (T & { quadrante: Quadrante })[]; cortes: { qtd: number; margem: number } } {
  const totalQtd = pratos.reduce((s, p) => s + p.qtd, 0);
  const corteQtd = pratos.length ? (0.7 * totalQtd) / pratos.length : 0;
  const corteMargem = dividir(pratos.reduce((s, p) => s + p.margem * p.qtd, 0), totalQtd);
  return {
    cortes: { qtd: corteQtd, margem: corteMargem },
    pratos: pratos.map((p) => {
      const popular = p.qtd >= corteQtd;
      const margemAlta = p.margem >= corteMargem;
      const quadrante: Quadrante = popular ? (margemAlta ? "estrela" : "cavalo") : margemAlta ? "joia" : "rever";
      return { ...p, quadrante };
    }),
  };
}

/** Projeção linear de fechamento do mês: ritmo dos dias passados × dias do mês */
export function projetarMes(realizado: number, diasPassados: number, diasNoMes: number): number {
  return diasPassados ? (realizado / diasPassados) * diasNoMes : 0;
}

export function diasNoMes(iso: string): number {
  const d = lerData(iso);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

const DIA_MSG = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** A mensagem diária do WhatsApp, no mesmo formato de relatorio-diario/gerar_relatorio.py (máximo 12 linhas) */
export function montarMensagemDiaria(cliente: Cliente, c: ComandaDoDia): string {
  const d = lerData(c.data);
  const r = c.resumo;
  const brl0 = (v: number) => fmtBRL(Math.round(v)).replace(/,\d{2}$/, "");
  // Sem dia de venda, a mensagem das 7h não inventa R$ 0: ela diz que não mediu.
  // Esta mensagem sai do painel e chega no WhatsApp do dono, onde não existe etiqueta
  // visual nenhuma para avisar que o número é fabricado. E NÃO LEVA DATA: `c.data` é o
  // último dia do tenant, não deste filtro — carimbar "qua 30/09" numa marca que não
  // vendeu nenhum dia seria datar um dia que não houve.
  if (c.origem === "SEM_DADO") {
    return [
      `*${cliente.nome}*`,
      "⚠️ Nenhum dia de venda registrado para este filtro.",
      "Nada aqui foi medido — não é zero, é ausência de dado.",
    ].join("\n");
  }
  const linhas = [`*${cliente.nome} · ${DIA_MSG[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}*`];
  if (c.meta && c.metaPct !== null) {
    const sem = c.situacaoMeta === "bom" ? "🟢" : c.situacaoMeta === "atencao" ? "🟡" : "🔴";
    linhas.push(`💰 Faturou ${brl0(r.faturamento)} · meta ${brl0(c.meta)} (${fmtPct(c.metaPct)}) ${sem}`);
  } else {
    linhas.push(`💰 Faturou ${brl0(r.faturamento)} (sem meta cadastrada)`);
  }
  linhas.push(`🧾 ${r.pedidos} pedidos · ticket ${fmtBRL(r.ticket)}`);
  linhas.push(`📈 Margem estimada ${brl0(r.margem)} (${fmtPct(r.margemPct, 1)})`);
  linhas.push("📊 " + tiposDo(cliente).map((t) => `${NOME_TIPO[t]} ${fmtPct(r.canalPct[t])}`).join(" · "));
  // alerta null = não houve dia de venda para avaliar. Dizer "dia dentro do plano" aqui
  // seria tranquilizar o dono sobre um dia que não existe.
  linhas.push(c.alerta ? `⚠️ ${c.alerta.texto}` : "⚠️ Sem dia de venda fechado: nada a avaliar.");
  // A ação fabricada vai selada aqui também: a mensagem das 7h é lida fora do painel,
  // onde não existe etiqueta visual para avisar.
  // Sem ação combinada, "*Hoje:*" seguido de NADA é uma afirmação: o dono lê o vazio
  // como "não tem nada para fazer hoje". Depois da migration 017 as 13 ações de
  // exemplo do cliente real saíram, e a lista chega vazia de verdade — então o vazio
  // precisa virar frase. Mensagem de WhatsApp não tem onde pendurar um estado vazio.
  linhas.push(
    "",
    "*Hoje:*",
    ...(c.acoes.length
      ? c.acoes.map((a, i) => `${i + 1}. ${a.texto}${a.origem === "REAL" ? "" : " (exemplo)"}`)
      : ["Nenhuma ação combinada ainda — e isso não quer dizer que não haja o que fazer."]),
  );
  return linhas.slice(0, 12).join("\n");
}

export function fraseWhatsapp(a: { conversas: number; pedidos: number; conversao: number; conversaoAnterior: number; ticketWa: number; ticketGeral: number; valorAdicionais: number }): string {
  if (!a.conversas) return "Nenhuma conversa no WhatsApp no período.";
  const dc = a.conversao - a.conversaoAnterior;
  const tendencia = Math.abs(dc) < 0.005 ? "igual ao período anterior" : `${pp(dc)} ${dc > 0 ? "acima" : "abaixo"} do período anterior`;
  const vt = variacao(a.ticketWa, a.ticketGeral);
  const ticket = vt === null || Math.abs(vt) < 0.01 ? "O ticket do WhatsApp ficou igual ao geral" : `O ticket do WhatsApp ficou ${pctFrase(vt)} ${vt > 0 ? "acima" : "abaixo"} do geral`;
  return `O vendedor IA fechou ${a.pedidos} pedidos em ${a.conversas} conversas (${fmtPct(a.conversao)}), ${tendencia}. ${ticket}, e a venda sugestiva somou ${fmtBRL(a.valorAdicionais)}.`;
}

export function fraseLucro(a: { cmvPct: number; metaCmv: number | null; cmvEstimado?: boolean; margemPct: number; margemPctAnterior: number; margem: number; cavalos: string[] }): string {
  const nomeCmv = a.cmvEstimado ? "O CMV estimado" : "O CMV";
  const cmv =
    a.metaCmv === null ? `${nomeCmv} ficou em ${fmtPct(a.cmvPct, 1)}`
    : a.cmvPct <= a.metaCmv ? `${nomeCmv} ficou em ${fmtPct(a.cmvPct, 1)}, dentro da meta de ${fmtPct(a.metaCmv)}`
    : `${nomeCmv} ficou em ${fmtPct(a.cmvPct, 1)}, acima da meta de ${fmtPct(a.metaCmv)}`;
  const dm = a.margemPct - a.margemPctAnterior;
  const nomeMargem = a.cmvEstimado ? "a margem estimada" : "a margem de contribuição";
  const margem = Math.abs(dm) < 0.005 ? `${nomeMargem} se manteve em ${fmtPct(a.margemPct, 1)} (${fmtBRL(a.margem)})` : `${nomeMargem} ${dm > 0 ? "subiu" : "caiu"} ${pp(dm)}, para ${fmtPct(a.margemPct, 1)} (${fmtBRL(a.margem)})`;
  const n = a.cavalos.length;
  const lista = n <= 2 ? a.cavalos.join(" e ") : `${a.cavalos.slice(0, 2).join(", ")} e mais ${n - 2}`;
  const cav = n ? ` ${n === 1 ? "Um prato vende muito com margem baixa" : `${n} pratos vendem muito com margem baixa`}: ${lista}.` : "";
  return `${cmv}, e ${margem}.${cav}`;
}

export function fraseMetricas(batidos: number, dias: number, diasComAlerta: number, temMeta = true): string {
  const meta =
    !temMeta ? "A meta diária ainda não foi cadastrada, então os dias aparecem sem comparação."
    : dias === 1 ? (batidos ? "Ontem a meta foi batida." : "Ontem a meta não foi batida.")
    : batidos === 0 ? `Nenhum dos ${dias} dias do período bateu a meta.`
    : batidos === 1 ? `1 dia de ${dias} bateu a meta no período.`
    : `${batidos} dias de ${dias} bateram a meta no período.`;
  const alertas = diasComAlerta ? ` Nos últimos 30 dias, houve alerta em ${diasComAlerta} ${diasComAlerta === 1 ? "dia" : "dias"}.` : " Nenhum alerta nos últimos 30 dias.";
  return meta + alertas;
}
