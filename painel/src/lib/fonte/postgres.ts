/**
 * Fonte de produção: o Postgres da plataforma.
 *
 * Cada carga abre UMA transação com `app.tenant_id` setado (RLS) e consulta só a janela
 * de datas e os blocos que a tela pediu. Nada de carregar o cliente inteiro.
 *
 * Os SELECT seguem o contrato de docs/modelo-dados.md e as views de 013_views_painel.sql.
 * Todo número sai do banco já como float8/int e toda data como texto ISO, para não
 * depender do parser de tipos do driver.
 */
import { intervalos, somarDias } from "@/lib/calculos";
import { comTenant, comUsuario, type Tx } from "@/lib/db";
import type {
  AcaoSugerida,
  Campanha,
  CanalProprio,
  Cliente,
  Comparacao,
  ConfigCanal,
  Conversa,
  Criativo,
  Crm,
  DiaSemana,
  DiaVendas,
  Ficha,
  Ifood,
  Lucro,
  Metricas,
  Origem,
  Periodo,
  Plano,
  Prato,
  SituacaoAcao,
  StatusCampanha,
  TipoAlerta,
  TipoCanal,
  Whatsapp,
  WhatsappDia,
} from "@/lib/types";
import type { Acesso, Bloco, Fonte, Pacote, Pedido, TenantResumo } from "./tipos";

const DIAS: DiaSemana[] = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const PERIODOS_ZERO = (): Record<Periodo, Comparacao> => ({
  ontem: { atual: 0, anterior: 0 },
  "7d": { atual: 0, anterior: 0 },
  "30d": { atual: 0, anterior: 0 },
  mes: { atual: 0, anterior: 0 },
});

/**
 * De onde veio o conjunto de linhas, em TRÊS estados.
 *
 * Antes eram dois, e "zero linha" caía em EXEMPLO. Medido em 20/10/2026 na Le Tre:
 * whatsapp_dia e conversation_state têm ZERO linhas e a tela levava o selo "Exemplo"
 * sem ter exemplo nenhum; e Canal próprio, com 20 campanhas REAIS e zero criativo,
 * se declarava REAL enquanto mostrava investimento R$ 0 e ROAS 0,0x — a tela que mais
 * enganava era a única sem aviso.
 *
 *  - sem linha          -> SEM_DADO (não existe número, nem real nem fabricado)
 *  - toda linha REAL    -> REAL
 *  - qualquer EXEMPLO   -> EXEMPLO (há número, mas fomos nós que o semeamos)
 */
export function origemDe(linhas: { origem?: string }[]): Origem {
  if (linhas.length === 0) return "SEM_DADO";
  return linhas.every((l) => l.origem === "REAL") ? "REAL" : "EXEMPLO";
}

/**
 * Combina a origem de vários conjuntos num bloco só.
 * Os conjuntos SEM_DADO não "contaminam" os que têm dado: eles apenas não contam.
 * Se nenhum tem dado, o bloco inteiro é SEM_DADO.
 */
export function origemDeVarios(...origens: Origem[]): Origem {
  const comDado = origens.filter((o) => o !== "SEM_DADO");
  if (!comDado.length) return "SEM_DADO";
  return comDado.every((o) => o === "REAL") ? "REAL" : "EXEMPLO";
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOuNulo = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** "Cliente 4821": número estável derivado do id, nunca o nome nem o telefone. */
function apelido(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9000;
  return `Cliente ${1000 + h}`;
}

/** A janela é resolvida aqui porque só o banco sabe qual é o último dia fechado. */
function janelaDe(pedido: Pedido, ultimoDia: string | null): [string, string] {
  const fim = ultimoDia ?? "2999-12-31";
  if (pedido.dias === "tudo" || !ultimoDia) return ["1900-01-01", fim];
  return [somarDias(fim, -(pedido.dias - 1)), fim];
}

const quer = (blocos: Bloco[], b: Bloco) => blocos.includes(b);

/* ---------------------------------------------------------------- cadastro */

async function lerCliente(tx: Tx, slug: string): Promise<Cliente | null> {
  const [c] = await tx<
    {
      slug: string;
      nome: string;
      segmento: string | null;
      imposto_pct: number;
      nota_margem: string | null;
      origem: string;
      fonte: string;
      meta_minima_pct: number | null;
      margem_minima_pct: number | null;
      queda_pedidos_pct: number | null;
      ifood_maximo_pct: number | null;
      queda_ticket_pct: number | null;
    }[]
  >`
    select slug, nome, segmento, imposto_pct::float8 as imposto_pct, nota_margem, origem, fonte,
           meta_minima_pct::float8   as meta_minima_pct,
           margem_minima_pct::float8 as margem_minima_pct,
           queda_pedidos_pct::float8 as queda_pedidos_pct,
           ifood_maximo_pct::float8  as ifood_maximo_pct,
           queda_ticket_pct::float8  as queda_ticket_pct
      from alavanca.vw_cliente_painel
     where slug = ${slug}
  `;
  if (!c) return null;

  const canaisLinhas = await tx<
    { canal: string; nome: string; tipo: TipoCanal; operacao: string | null; taxa_pct: number; custo_por_pedido: number }[]
  >`
    select canal, nome, tipo, operacao, taxa_pct::float8 as taxa_pct, custo_por_pedido::float8 as custo_por_pedido
      from alavanca.vw_canal_painel
     where ativo
     order by ordem
  `;
  const canais: Record<string, ConfigCanal> = {};
  for (const l of canaisLinhas) {
    canais[l.canal] = {
      nome: l.nome,
      tipo: l.tipo,
      ...(l.operacao ? { operacao: l.operacao } : {}),
      taxaPct: num(l.taxa_pct),
      custoPorPedido: num(l.custo_por_pedido),
    };
  }

  // Sem linha = meta NÃO cadastrada. Nunca zero.
  const metas = await tx<{ dia_semana: number; valor: number }[]>`
    select dia_semana, valor::float8 as valor
      from alavanca.vw_meta_dia_semana_vigente
     where marca_id is null
  `;
  const metaPorDiaSemana = metas.length
    ? (Object.fromEntries(metas.map((m) => [DIAS[m.dia_semana], num(m.valor)])) as Record<DiaSemana, number>)
    : null;

  return {
    // O cadastro sempre tem linha aqui (lerCliente devolve null quando não tem), então
    // SEM_DADO não cabe: ou o cadastro é do cliente, ou foi semeado por nós.
    origem: c.origem === "REAL" ? "REAL" : "EXEMPLO",
    slug: c.slug,
    nome: c.nome,
    segmento: c.segmento ?? "",
    metaPorDiaSemana,
    impostoPct: num(c.imposto_pct),
    canais,
    fonte: c.fonte ?? undefined,
    notaMargem: c.nota_margem ?? undefined,
    limites: {
      metaMinimaPct: num(c.meta_minima_pct),
      margemMinimaPct: num(c.margem_minima_pct),
      quedaPedidosPct: num(c.queda_pedidos_pct),
      ifoodMaximoPct: num(c.ifood_maximo_pct),
      quedaTicketPct: num(c.queda_ticket_pct),
    },
  };
}

async function lerConfig(tx: Tx): Promise<Record<string, unknown>> {
  const linhas = await tx<{ chave: string; valor: unknown }[]>`
    select chave, valor from alavanca.tenant_config
  `;
  return Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
}

/* ------------------------------------------------------------------ vendas */

async function lerVendas(tx: Tx, [inicio, fim]: [string, string]): Promise<Metricas> {
  const linhas = await tx<
    {
      data: string;
      canal: string;
      faturamento: number;
      pedidos: number;
      cmv: number | null;
      cmv_estimado: boolean;
      origem: string;
    }[]
  >`
    select data::text as data, canal,
           faturamento::float8 as faturamento, pedidos::int as pedidos,
           cmv::float8 as cmv, cmv_estimado, origem
      from alavanca.vw_venda_dia_painel
     where data between ${inicio} and ${fim}
     order by data, canal
  `;

  const porDia = new Map<string, DiaVendas>();
  for (const l of linhas) {
    const dia = porDia.get(l.data) ?? { data: l.data, canais: {}, cmv: 0 };
    const cmv = numOuNulo(l.cmv);
    dia.canais[l.canal] = { faturamento: num(l.faturamento), pedidos: num(l.pedidos), ...(cmv === null ? {} : { cmv }) };
    // O CMV do dia é a SOMA das linhas do dia (contrato da tela Métricas).
    dia.cmv += cmv ?? 0;
    porDia.set(l.data, dia);
  }

  const producao = await tx<{ data: string; unidades: number; perdas: number }[]>`
    select data::text as data, sum(unidades)::int as unidades, sum(perdas)::int as perdas
      from alavanca.producao_dia
     where data between ${inicio} and ${fim}
     group by data
  `;
  for (const p of producao) {
    const dia = porDia.get(p.data);
    if (dia) dia.producao = { pizzas: num(p.unidades), perdas: num(p.perdas) };
  }

  return {
    origem: origemDe(linhas),
    cmvEstimado: linhas.some((l) => l.cmv_estimado),
    dias: [...porDia.values()].sort((a, b) => a.data.localeCompare(b.data)),
  };
}

/* ------------------------------------------------------------------- iFood */

/** Bloco que a tela NÃO pediu. Não é exemplo: é ausência, e a tela precisa saber disso. */
function ifoodVazio(): Ifood {
  return {
    origem: "SEM_DADO",
    comissaoPct: null,
    taxaPagamentoPct: null,
    embalagemPorItem: null,
    takeRatePct: null,
    takeRateMes: null,
    takeRateVendasBrutas: null,
    pratos: [],
    promocoes: [],
    vendasPratosDia: [],
    promocoesDia: [],
    funilDia: [],
    pedidosPorFaixaDia: [],
    operacaoDia: [],
  };
}

async function lerIfood(tx: Tx, [inicio, fim]: [string, string]): Promise<Ifood> {
  // Taxas do mês mais recente fechado no canal_taxa_mes das lojas de iFood.
  // ATENÇÃO: canais.taxa_pct é a taxa de CADASTRO (projeção); isto aqui é o que
  // de fato aconteceu. Não são a mesma coisa e a tela precisa rotular.
  //
  // O take_rate_pct vem junto porque ele EXISTE mesmo quando o detalhamento não existe.
  // Medido em 20/10/2026: nas 5 linhas de canal_taxa_mes da Le Tre, comissao_pct,
  // taxa_pagamento_pct e embalagem_por_item são NULOS, e o take_rate_pct está lá
  // (34,45% na Pizzaria). Coagir esses nulos para 0 fazia a tela afirmar que de cada
  // R$ 100 sobravam R$ 100,00. Agora o nulo chega como nulo e o take-rate medido vai
  // junto, para a tela mostrar o número verdadeiro em vez do zero falso.
  const [taxas] = await tx<
    {
      comissao_pct: number | null;
      taxa_pagamento_pct: number | null;
      embalagem_por_item: number | null;
      take_rate_pct: number | null;
      vendas_brutas: number | null;
      mes: string | null;
    }[]
  >`
    with ultimo as (
      select max(t.mes) as mes
        from alavanca.canal_taxa_mes t
        join alavanca.canais c on c.id = t.canal_id
       where c.tipo = 'ifood'
    )
    select
      sum(t.comissao_pct       * t.vendas_brutas)::float8 / nullif(sum(t.vendas_brutas), 0)::float8 as comissao_pct,
      sum(t.taxa_pagamento_pct * t.vendas_brutas)::float8 / nullif(sum(t.vendas_brutas), 0)::float8 as taxa_pagamento_pct,
      avg(t.embalagem_por_item)::float8 as embalagem_por_item,
      sum(t.take_rate_pct      * t.vendas_brutas)::float8 / nullif(sum(t.vendas_brutas), 0)::float8 as take_rate_pct,
      nullif(sum(t.vendas_brutas), 0)::float8 as vendas_brutas,
      to_char(min(t.mes), 'YYYY-MM') as mes
      from alavanca.canal_taxa_mes t
      join alavanca.canais c on c.id = t.canal_id
      join ultimo u on u.mes = t.mes
     where c.tipo = 'ifood'
  `;

  const pratosLinhas = await tx<{ codigo: string; nome: string; preco_ifood: number; custo: number; origem: string }[]>`
    select f.codigo, f.nome, f.preco_ifood::float8 as preco_ifood, f.custo::float8 as custo, f.origem
      from alavanca.vw_ficha_painel f
     where f.preco_ifood is not null
     order by f.nome
  `;
  const pratos: Prato[] = pratosLinhas.map((p) => ({
    id: p.codigo,
    nome: p.nome,
    precoIfood: num(p.preco_ifood),
    cmvUnitario: num(p.custo),
  }));

  const promoLinhas = await tx<{ codigo: string; nome: string; tipo: string | null; quem_banca: string | null; origem: string }[]>`
    select p.codigo, p.nome, p.tipo, p.quem_banca, p.origem
      from alavanca.promocoes p
     where p.ativo
     order by p.nome
  `;

  const promoDia = await tx<{ data: string; codigo: string; pedidos: number; faturamento: number; custo: number }[]>`
    select d.data::text as data, p.codigo,
           d.pedidos::int as pedidos, d.faturamento::float8 as faturamento, d.custo::float8 as custo
      from alavanca.promocao_dia d
      join alavanca.promocoes p on p.id = d.promocao_id
     where d.data between ${inicio} and ${fim}
     order by d.data
  `;

  const vendasPratoDia = await tx<{ data: string; codigo: string; qtd: number }[]>`
    select v.periodo_inicio::text as data, f.codigo, sum(v.qtd)::float8 as qtd
      from alavanca.venda_prato v
      join alavanca.ficha_tecnica f on f.id = v.ficha_id
      join alavanca.canais c on c.id = v.canal_id
     where v.periodo_inicio = v.periodo_fim
       and v.periodo_inicio between ${inicio} and ${fim}
       and c.tipo = 'ifood'
     group by 1, 2
     order by 1
  `;

  const funil = await tx<{ data: string; visitas: number; cardapio: number; sacola: number; pedidos: number; origem: string }[]>`
    select data::text as data, sum(visitas)::int as visitas, sum(cardapio)::int as cardapio,
           sum(sacola)::int as sacola, sum(pedidos)::int as pedidos, min(origem) as origem
      from alavanca.ifood_funil_dia
     where data between ${inicio} and ${fim}
     group by data order by data
  `;

  const faixas = await tx<{ data: string; faixa: string; pedidos: number; ordem: number }[]>`
    select data::text as data, faixa, sum(pedidos)::int as pedidos, min(ordem)::int as ordem
      from alavanca.ifood_faixa_dia
     where data between ${inicio} and ${fim}
     group by data, faixa order by data, min(ordem)
  `;

  const operacao = await tx<{ data: string; nota: number; tempo: number; cancelados: number; origem: string }[]>`
    select data::text as data, avg(nota)::float8 as nota, avg(tempo_entrega_min)::float8 as tempo,
           sum(cancelados)::int as cancelados, min(origem) as origem
      from alavanca.ifood_operacao_dia
     where data between ${inicio} and ${fim}
     group by data order by data
  `;

  const agrupar = <T extends { data: string }>(linhas: T[], chave: (l: T) => string, valor: (l: T) => number) => {
    const m = new Map<string, Record<string, number>>();
    for (const l of linhas) {
      const d = m.get(l.data) ?? {};
      d[chave(l)] = (d[chave(l)] ?? 0) + valor(l);
      m.set(l.data, d);
    }
    return [...m.entries()];
  };

  const promocoesDia = (() => {
    const m = new Map<string, Record<string, { pedidos: number; faturamento: number; custo: number }>>();
    for (const l of promoDia) {
      const d = m.get(l.data) ?? {};
      d[l.codigo] = { pedidos: num(l.pedidos), faturamento: num(l.faturamento), custo: num(l.custo) };
      m.set(l.data, d);
    }
    return [...m.entries()].map(([data, promocoes]) => ({ data, promocoes }));
  })();

  const takeRatePct = numOuNulo(taxas?.take_rate_pct);
  const takeRateVendasBrutas = numOuNulo(taxas?.vendas_brutas);

  return {
    origem: origemDeVarios(origemDe(pratosLinhas), origemDe(promoLinhas), origemDe(funil), origemDe(operacao)),
    // Nulo vira nulo. Nunca zero: zero afirmaria que o iFood não cobra nada.
    comissaoPct: numOuNulo(taxas?.comissao_pct),
    taxaPagamentoPct: numOuNulo(taxas?.taxa_pagamento_pct),
    embalagemPorItem: numOuNulo(taxas?.embalagem_por_item),
    takeRatePct,
    takeRateMes: takeRatePct === null ? null : (taxas?.mes ?? null),
    takeRateVendasBrutas,
    pratos,
    promocoes: promoLinhas.map((p) => ({ id: p.codigo, nome: p.nome, tipo: p.tipo ?? "", quemBanca: p.quem_banca ?? "" })),
    vendasPratosDia: agrupar(vendasPratoDia, (l) => l.codigo, (l) => num(l.qtd)).map(([data, qtd]) => ({ data, qtd })),
    promocoesDia,
    funilDia: funil.map((f) => ({
      data: f.data,
      visitas: num(f.visitas),
      cardapio: num(f.cardapio),
      sacola: num(f.sacola),
      pedidos: num(f.pedidos),
    })),
    pedidosPorFaixaDia: agrupar(faixas, (l) => l.faixa, (l) => num(l.pedidos)).map(([data, faixas2]) => ({ data, faixas: faixas2 })),
    // Achado D: sem fonte, nota/tempo/cancelamentos viram null, não 0. "Nota da loja 0,0"
    // não é uma loja mal avaliada, é uma loja que ninguém avaliou.
    operacaoDia: operacao.map((o) => ({
      data: o.data,
      nota: numOuNulo(o.nota),
      tempoEntregaMin: numOuNulo(o.tempo),
      cancelados: numOuNulo(o.cancelados),
    })),
  };
}

/* ------------------------------------------------- canal próprio / mídia */

function canalProprioVazio(): CanalProprio {
  return { origem: "SEM_DADO", metaPctCanalProprio: null, campanhas: [], criativos: [], anunciosDia: [], alcance: PERIODOS_ZERO() };
}

async function lerMidia(
  tx: Tx,
  janela: [string, string],
  periodo: Periodo,
  ivAtual: [string, string],
  config: Record<string, unknown>,
): Promise<CanalProprio> {
  const [inicio, fim] = janela;
  const campanhasLinhas = await tx<
    { external_id: string; nome: string; status: string; objetivo: string | null; orcamento_dia: number | null; origem: string }[]
  >`
    select external_id, nome, status, objetivo, orcamento_dia::float8 as orcamento_dia, origem
      from alavanca.campanhas
     order by nome
  `;
  const criativosLinhas = await tx<{ external_id: string; nome: string; campanha: string | null; formato: string | null; origem: string }[]>`
    select k.external_id, k.nome, c.external_id as campanha, k.formato, k.origem
      from alavanca.criativos k
      left join alavanca.campanhas c on c.id = k.campanha_id
     order by k.nome
  `;
  const anuncios = await tx<
    { data: string; criativo: string | null; investimento: number; impressoes: number; cliques: number; pedidos: number; faturamento: number }[]
  >`
    select a.data::text as data, k.external_id as criativo,
           sum(a.investimento)::float8 as investimento,
           sum(a.impressoes)::int      as impressoes,
           sum(a.cliques)::int         as cliques,
           sum(a.pedidos)::int         as pedidos,
           sum(a.faturamento)::float8  as faturamento
      from alavanca.anuncio_dia a
      left join alavanca.criativos k on k.id = a.criativo_id
     where a.data between ${inicio} and ${fim}
     group by 1, 2
     order by 1
  `;

  // ALCANCE NÃO SE SOMA. Só vale a linha fechada exatamente para o período pedido;
  // sem ela, a tela mostra vazio em vez de somar anuncio_dia.
  const [alcance] = await tx<{ alcance: number }[]>`
    select alcance::int as alcance
      from alavanca.midia_alcance
     where periodo_inicio = ${ivAtual[0]} and periodo_fim = ${ivAtual[1]} and marca_id is null
  `;

  const anunciosDia = (() => {
    const m = new Map<string, Record<string, { investimento: number; impressoes: number; cliques: number; pedidos: number; faturamento: number }>>();
    for (const a of anuncios) {
      if (!a.criativo) continue;
      const d = m.get(a.data) ?? {};
      d[a.criativo] = {
        investimento: num(a.investimento),
        impressoes: num(a.impressoes),
        cliques: num(a.cliques),
        pedidos: num(a.pedidos),
        faturamento: num(a.faturamento),
      };
      m.set(a.data, d);
    }
    return [...m.entries()].map(([data, criativos]) => ({ data, criativos }));
  })();

  const metaPct = config["canal_proprio.meta_pct"];
  const alcancePeriodo = PERIODOS_ZERO();
  if (alcance) alcancePeriodo[periodo] = { atual: num(alcance.alcance), anterior: 0 };

  return {
    origem: origemDeVarios(origemDe(campanhasLinhas), origemDe(criativosLinhas)),
    // Achado B: a chave 'canal_proprio.meta_pct' NÃO existe no grupo-le-tre (as chaves
    // são canal.cliente_fiel_le_tre, comanda.hora_envio, consentimento.base_legada,
    // crm.custo_por_mensagem e midia.marca_padrao). Devolver 0 fazia 16% >= 0 virar
    // bolinha verde na tela Hoje e "meta 0,0%" no Lucro. Sem chave, não há meta.
    metaPctCanalProprio: typeof metaPct === "number" ? metaPct : null,
    campanhas: campanhasLinhas.map(
      (c): Campanha => ({
        id: c.external_id,
        nome: c.nome,
        status: (["ativa", "pausada", "em_analise"].includes(c.status) ? c.status : "pausada") as StatusCampanha,
        objetivo: c.objetivo ?? "",
        orcamentoDia: num(c.orcamento_dia),
      }),
    ),
    criativos: criativosLinhas.map(
      (k): Criativo => ({ id: k.external_id, nome: k.nome, campanhaId: k.campanha ?? "", formato: k.formato ?? "" }),
    ),
    anunciosDia,
    alcance: alcancePeriodo,
  };
}

/* --------------------------------------------------------------------- CRM */

function crmVazio(): Crm {
  return {
    origem: "SEM_DADO",
    custoPorMensagem: 0,
    resumo: { baseTotal: 0, comOptIn: 0, novosComOptIn: PERIODOS_ZERO(), novosClientes: PERIODOS_ZERO() },
    segmentos: [],
    disparos: [],
    proximos: [],
  };
}

async function lerCrm(
  tx: Tx,
  periodo: Periodo,
  iv: { atual: [string, string]; anterior: [string, string] },
  config: Record<string, unknown>,
): Promise<Crm> {
  const [inicio, fim] = iv.atual;
  const [base] = await tx<{ total: number }[]>`select count(*)::int as total from alavanca.customers`;
  const [optIn] = await tx<{ total: number }[]>`select count(*)::int as total from alavanca.vw_sniper_elegivel`;
  const [novos] = await tx<{ atual: number; anterior: number }[]>`
    select
      count(*) filter (where primeiro_contato::date between ${inicio} and ${fim})::int as atual,
      count(*) filter (where primeiro_contato::date between ${iv.anterior[0]} and ${iv.anterior[1]})::int as anterior
      from alavanca.customers
  `;

  const segLinhas = await tx<
    {
      codigo: string;
      nome: string;
      criterio: string;
      acao_sugerida: string | null;
      clientes: number | null;
      com_opt_in: number | null;
      valor_90d: number | null;
      origem: string;
    }[]
  >`
    select s.codigo, s.nome, s.criterio, s.acao_sugerida,
           n.clientes::int as clientes, n.com_opt_in::int as com_opt_in, n.valor_90d::float8 as valor_90d,
           s.origem
      from alavanca.crm_segmento s
      left join lateral (
        select * from alavanca.crm_segmento_snapshot x
         where x.segmento_id = s.id and x.data <= ${fim}
         order by x.data desc limit 1
      ) n on true
     where s.ativo
     order by s.ordem
  `;

  const disparos = await tx<
    {
      id: string;
      data: string | null;
      segmento: string | null;
      mensagem: string;
      enviados: number;
      respostas: number;
      pedidos: number;
      faturamento: number;
      origem: string;
    }[]
  >`
    select l.id::text as id,
           (l.concluido_em at time zone 'America/Sao_Paulo')::date::text as data,
           s.codigo as segmento,
           l.template_corpo as mensagem,
           count(e.*) filter (where e.status in ('enviado','entregue','lido'))::int as enviados,
           count(e.*) filter (where e.respondeu_em is not null)::int as respostas,
           count(e.order_id)::int as pedidos,
           coalesce(sum(o.valor_total), 0)::float8 as faturamento,
           l.origem
      from alavanca.sniper_lotes l
      left join alavanca.crm_segmento s on s.id = l.segmento_id
      left join alavanca.sniper_envios e on e.lote_id = l.id
      left join alavanca.orders o on o.id = e.order_id
     where l.status = 'concluido'
       and (l.concluido_em at time zone 'America/Sao_Paulo')::date between ${inicio} and ${fim}
     group by l.id, l.concluido_em, s.codigo, l.template_corpo, l.origem
     order by l.concluido_em desc
  `;

  const proximos = await tx<{ data: string; hora: string; segmento: string | null; mensagem: string }[]>`
    select (l.agendado_para at time zone 'America/Sao_Paulo')::date::text as data,
           to_char(l.agendado_para at time zone 'America/Sao_Paulo', 'HH24:MI') as hora,
           s.codigo as segmento,
           l.template_corpo as mensagem
      from alavanca.sniper_lotes l
      left join alavanca.crm_segmento s on s.id = l.segmento_id
     where l.status = 'agendado'
     order by l.agendado_para
  `;

  const custo = config["crm.custo_por_mensagem"];
  const novosComparacao = PERIODOS_ZERO();
  // Só o período pedido é consultado; os outros ficam zerados de propósito —
  // a tela lê apenas o período da URL.
  novosComparacao[periodo] = { atual: num(novos?.atual), anterior: num(novos?.anterior) };

  return {
    origem: origemDe(segLinhas),
    custoPorMensagem: typeof custo === "number" ? custo : 0,
    resumo: {
      baseTotal: num(base?.total),
      comOptIn: num(optIn?.total),
      novosClientes: novosComparacao,
      // PENDENCIA conhecida: `novosComOptIn` NAO e consultado ainda. Este zero e de
      // fabrica, nao medicao. Enquanto a consulta nao existe, a tela Hoje so mostra
      // este pilar quando ha base (dados.ts), para nao dar semaforo a um zero inventado.
      // Quando a consulta entrar, trocar por uma leitura real de alavanca.consents.
      novosComOptIn: PERIODOS_ZERO(),
    },
    segmentos: segLinhas.map((s) => ({
      id: s.codigo,
      nome: s.nome,
      criterio: s.criterio,
      clientes: num(s.clientes),
      comOptIn: num(s.com_opt_in),
      valor90d: num(s.valor_90d),
      acao: s.acao_sugerida ?? "",
    })),
    disparos: disparos.map((d) => ({
      id: d.id,
      data: d.data ?? "",
      segmento: d.segmento ?? "",
      mensagem: d.mensagem,
      enviados: num(d.enviados),
      respostas: num(d.respostas),
      pedidos: num(d.pedidos),
      faturamento: num(d.faturamento),
    })),
    proximos: proximos.map((p) => ({ data: p.data, hora: p.hora, segmento: p.segmento ?? "", mensagem: p.mensagem })),
  };
}

/* ---------------------------------------------------------------- WhatsApp */

function whatsappVazio(): Whatsapp {
  return { origem: "SEM_DADO", dias: [], conversas: [], regras: [] };
}

async function lerWhatsapp(tx: Tx, [inicio, fim]: [string, string]): Promise<Whatsapp> {
  const diasLinhas = await tx<
    {
      data: string;
      conversas: number;
      pedidos: number;
      faturamento: number;
      sugestoes: number;
      sugestoes_aceitas: number;
      valor_adicionais: number;
      followups: number;
      followups_respondidos: number;
      pedidos_recuperados: number;
      origem: string;
    }[]
  >`
    select data::text as data,
           sum(conversas)::int as conversas, sum(pedidos)::int as pedidos,
           sum(faturamento)::float8 as faturamento,
           sum(sugestoes)::int as sugestoes, sum(sugestoes_aceitas)::int as sugestoes_aceitas,
           sum(valor_adicionais)::float8 as valor_adicionais,
           sum(followups)::int as followups, sum(followups_respondidos)::int as followups_respondidos,
           sum(pedidos_recuperados)::int as pedidos_recuperados,
           min(origem) as origem
      from alavanca.whatsapp_dia
     where data between ${inicio} and ${fim}
     group by data order by data
  `;

  const transf = await tx<{ data: string; motivo: string; quantidade: number }[]>`
    select data::text as data, motivo, sum(quantidade)::int as quantidade
      from alavanca.whatsapp_transferencia_dia
     where data between ${inicio} and ${fim}
     group by data, motivo
  `;

  const regras = await tx<{ texto: string }[]>`
    select texto from alavanca.whatsapp_regras where ativo order by ordem
  `;

  // ANONIMIZADO: a tela mostra "Cliente 4821", nunca o nome nem o telefone de customers.
  const conversasLinhas = await tx<{ id: string; inicio: string; desfecho: string | null }[]>`
    select c.id::text as id,
           -- mesmo formato que a tela espera em Conversa.inicio: "AAAA-MM-DDTHH:MM"
           to_char(c.iniciada_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI') as inicio,
           c.desfecho
      from alavanca.conversation_state c
     where (c.iniciada_em at time zone 'America/Sao_Paulo')::date between ${inicio} and ${fim}
     order by c.iniciada_em desc
     limit 20
  `;
  const ids = conversasLinhas.map((c) => c.id);
  const mensagens = ids.length
    ? await tx<{ conversation_id: string; autor: string; texto: string | null }[]>`
        select conversation_id::text as conversation_id, autor, texto
          from alavanca.messages
         where conversation_id::text = any(${ids})
         order by ocorrido_em
      `
    : [];

  const porConversa = new Map<string, { autor: "cliente" | "ia" | "humano"; texto: string }[]>();
  for (const m of mensagens) {
    if (m.autor === "sistema") continue;
    const lista = porConversa.get(m.conversation_id) ?? [];
    lista.push({ autor: m.autor as "cliente" | "ia" | "humano", texto: m.texto ?? "" });
    porConversa.set(m.conversation_id, lista);
  }

  const diasWa: WhatsappDia[] = diasLinhas.map((d) => ({
    data: d.data,
    conversas: num(d.conversas),
    pedidos: num(d.pedidos),
    faturamento: num(d.faturamento),
    sugestoes: num(d.sugestoes),
    sugestoesAceitas: num(d.sugestoes_aceitas),
    valorAdicionais: num(d.valor_adicionais),
    followups: num(d.followups),
    followupsRespondidos: num(d.followups_respondidos),
    pedidosRecuperados: num(d.pedidos_recuperados),
    transferencias: Object.fromEntries(transf.filter((t) => t.data === d.data).map((t) => [t.motivo, num(t.quantidade)])),
  }));

  const conversas: Conversa[] = conversasLinhas.map((c) => ({
    id: c.id,
    cliente: apelido(c.id),
    inicio: c.inicio,
    desfecho: (["pedido", "sem_pedido", "humano", "recuperado"].includes(c.desfecho ?? "") ? c.desfecho : "sem_pedido") as Conversa["desfecho"],
    mensagens: porConversa.get(c.id) ?? [],
  }));

  return { origem: origemDe(diasLinhas), dias: diasWa, conversas, regras: regras.map((r) => r.texto) };
}

/* ------------------------------------------------------------------- lucro */

function lucroVazio(): Lucro {
  return { origem: "SEM_DADO", metaCmvPct: null, metaMargemPct: null, metaFaturamentoMes: null, fichas: [], vendasPratosDia: [] };
}

async function lerLucro(tx: Tx, [inicio, fim]: [string, string], config: Record<string, unknown>): Promise<Lucro> {
  const fichasLinhas = await tx<
    {
      codigo: string;
      nome: string;
      categoria: string | null;
      operacao: string | null;
      preco: number;
      custo: number;
      estimado: boolean;
      base: string | null;
      origem: string;
    }[]
  >`
    select codigo, nome, categoria, operacao, preco::float8 as preco, custo::float8 as custo, estimado, base, origem
      from alavanca.vw_ficha_painel
     order by nome
  `;

  // Só a série CONSOLIDADA (canal_id is null = todos os canais juntos). A série por
  // canal existe em paralelo e é a tela de iFood que a consome; somar as duas aqui
  // contaria o mesmo prato duas vezes.
  //
  // A janela é por SOBREPOSIÇÃO, não por continência. O relatório de 90 dias do Saipos
  // termina em 01/10 e o último dia de venda fechado é 30/09: com `periodo_fim <= fim`
  // a linha inteira sumia e a tela de Lucro ficava sem nenhuma quantidade vendida.
  const vendas = await tx<{ codigo: string; qtd: number; ini: string; fim: string; dia: boolean }[]>`
    select f.codigo,
           v.periodo_inicio::text as ini,
           v.periodo_fim::text    as fim,
           sum(v.qtd)::float8     as qtd,
           (v.periodo_inicio = v.periodo_fim) as dia
      from alavanca.venda_prato v
      join alavanca.ficha_tecnica f on f.id = v.ficha_id
     where v.canal_id is null
       and v.periodo_inicio <= ${fim} and v.periodo_fim >= ${inicio}
     group by f.codigo, v.periodo_inicio, v.periodo_fim
     order by v.periodo_inicio
  `;

  // Dia a dia quando a fonte entrega por dia; senão, uma janela fixa (ex.: relatório de 90 dias).
  const porDia = vendas.every((v) => v.dia);
  const vendasPratosDia = porDia
    ? (() => {
        const m = new Map<string, Record<string, number>>();
        for (const v of vendas) {
          const d = m.get(v.ini) ?? {};
          d[v.codigo] = num(v.qtd);
          m.set(v.ini, d);
        }
        return [...m.entries()].map(([data, qtd]) => ({ data, qtd }));
      })()
    : [];
  const vendasPratos =
    !porDia && vendas.length
      ? {
          inicio: vendas.reduce((a, v) => (v.ini < a ? v.ini : a), vendas[0].ini),
          fim: vendas.reduce((a, v) => (v.fim > a ? v.fim : a), vendas[0].fim),
          // Um mesmo código pode aparecer em mais de um período: soma, não sobrescreve.
          qtd: vendas.reduce<Record<string, number>>((acc, v) => {
            acc[v.codigo] = (acc[v.codigo] ?? 0) + num(v.qtd);
            return acc;
          }, {}),
        }
      : undefined;

  const metaCmv = config["lucro.meta_cmv_pct"];
  const metaMargem = config["lucro.meta_margem_pct"];
  const metaFat = config["lucro.meta_faturamento_mes"];

  return {
    origem: origemDe(fichasLinhas),
    // Sem tabela própria ainda: null significa "não cadastrada", e a tela já sabe lidar.
    metaCmvPct: typeof metaCmv === "number" ? metaCmv : null,
    metaMargemPct: typeof metaMargem === "number" ? metaMargem : null,
    metaFaturamentoMes: typeof metaFat === "number" ? metaFat : null,
    fichas: fichasLinhas.map(
      (f): Ficha => ({
        id: f.codigo,
        nome: f.nome,
        categoria: f.categoria ?? "",
        preco: num(f.preco),
        custo: num(f.custo),
        ...(f.operacao ? { operacao: f.operacao } : {}),
        estimado: !!f.estimado,
        base: f.base ?? undefined,
      }),
    ),
    vendasPratosDia,
    ...(vendasPratos ? { vendasPratos } : {}),
  };
}

/* ------------------------------------------------------------------- plano */

async function lerPlano(tx: Tx): Promise<Plano> {
  const acoes = await tx<
    {
      codigo: string;
      pilar: string;
      acao: string;
      responsavel: string | null;
      prazo: string | null;
      situacao: string;
      resultado_esperado_mes: number;
      origem: string;
    }[]
  >`
    select codigo, pilar, acao, responsavel, prazo::text as prazo, situacao,
           resultado_esperado_mes::float8 as resultado_esperado_mes, origem
      from alavanca.plano_acao
     order by prazo nulls last, codigo
  `;

  const sugeridas = await tx<{ gatilho: string; texto: string; origem: string }[]>`
    select gatilho, texto, origem from alavanca.acao_sugerida where ativo order by gatilho, ordem
  `;

  // Achado A: cada ação carrega a SUA origem. Medido: as 13 linhas de acao_sugerida da
  // Le Tre são EXEMPLO, e chegavam na Comanda e na mensagem das 7h como texto puro.
  const porAlerta: Record<TipoAlerta, AcaoSugerida[]> = { meta: [], margem: [], pedidos: [], ifood: [], ticket: [] };
  const padrao: AcaoSugerida[] = [];
  for (const s of sugeridas) {
    const item: AcaoSugerida = { texto: s.texto, origem: s.origem === "REAL" ? "REAL" : "EXEMPLO" };
    if (s.gatilho === "padrao") padrao.push(item);
    else if (s.gatilho in porAlerta) porAlerta[s.gatilho as TipoAlerta].push(item);
  }

  return {
    origem: origemDeVarios(origemDe(acoes), origemDe(sugeridas)),
    acoesPorAlerta: porAlerta,
    acoesPadrao: padrao,
    acoes: acoes.map((a) => ({
      id: a.codigo,
      pilar: a.pilar as Plano["acoes"][number]["pilar"],
      acao: a.acao,
      responsavel: a.responsavel ?? "",
      prazo: a.prazo ?? "",
      situacao: (["a_fazer", "fazendo", "feito"].includes(a.situacao) ? a.situacao : "a_fazer") as SituacaoAcao,
      resultadoEsperadoMes: num(a.resultado_esperado_mes),
    })),
  };
}

/* -------------------------------------------------------------------- API */

export const fontePostgres: Fonte = {
  modo: "postgres",

  async listarTenants(acesso: Acesso): Promise<TenantResumo[]> {
    const permitidos = acesso.tenants ?? [];
    if (!permitidos.length) return [];
    return comUsuario(acesso.usuarioId, async (tx) => {
      const out: TenantResumo[] = [];
      for (const t of permitidos) {
        // set_config LOCAL: cada volta troca o tenant só dentro desta transação.
        await tx`select set_config('app.tenant_id', ${t.tenantId}, true)`;
        const [r] = await tx<{ slug: string; nome: string; segmento: string | null }[]>`
          select slug, nome, segmento from alavanca.vw_cliente_painel where slug = ${t.slug}
        `;
        if (r) out.push({ tenantId: t.tenantId, slug: r.slug, nome: r.nome, segmento: r.segmento });
      }
      return out;
    });
  },

  async carregar(slug: string, pedido: Pedido, acesso: Acesso): Promise<Pacote | null> {
    const alvo = (acesso.tenants ?? []).find((t) => t.slug === slug);
    if (!alvo) return null; // sem acesso ou tenant inexistente: a tela trata como 404

    return comTenant(alvo.tenantId, acesso.usuarioId, async (tx) => {
      const cliente = await lerCliente(tx, slug);
      if (!cliente) return null;

      const [{ ultimo }] = await tx<{ ultimo: string | null }[]>`
        select max(data)::text as ultimo from alavanca.venda_dia
      `;
      const janela = janelaDe(pedido, ultimo);
      const [{ antes }] = await tx<{ antes: number }[]>`
        select count(distinct data)::int as antes from alavanca.venda_dia where data < ${janela[0]}
      `;

      const config = await lerConfig(tx);
      const b = pedido.blocos;
      const iv = intervalos(pedido.periodo, janela[1]);

      return {
        cliente,
        ultimoDia: ultimo,
        offsetDias: num(antes),
        metricas: quer(b, "vendas") ? await lerVendas(tx, janela) : { origem: "SEM_DADO" as Origem, dias: [] },
        ifood: quer(b, "ifood") ? await lerIfood(tx, janela) : ifoodVazio(),
        canalProprio: quer(b, "midia") ? await lerMidia(tx, janela, pedido.periodo, iv.atual, config) : canalProprioVazio(),
        crm: quer(b, "crm") ? await lerCrm(tx, pedido.periodo, iv, config) : crmVazio(),
        whatsapp: quer(b, "whatsapp") ? await lerWhatsapp(tx, janela) : whatsappVazio(),
        lucro: quer(b, "cardapio") ? await lerLucro(tx, janela, config) : lucroVazio(),
        plano: quer(b, "plano") ? await lerPlano(tx) : { origem: "SEM_DADO" as Origem, acoesPorAlerta: { meta: [], margem: [], pedidos: [], ifood: [], ticket: [] }, acoesPadrao: [], acoes: [] },
      } satisfies Pacote;
    });
  },
};
