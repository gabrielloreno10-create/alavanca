import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NAO_MEDIDO } from "@/lib/formato";
import type { Cliente, Comparacao, Periodo } from "@/lib/types";

/**
 * A ausência vista da cadeira do dono.
 *
 * `src/lib/ausencia.test.ts` prova que a CAMADA DE DADOS devolve null e SEM_DADO. Estes
 * testes provam o passo seguinte, que é o que o dono realmente lê: a TELA renderizada
 * não pode escrever "R$ 0,00", "0,0%", "0,0x", "NaN" nem pintar um pilar de verde
 * quando não houve medição nenhuma. É o critério de pronto da fase 0, conferido no HTML.
 */

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => "/vazio",
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => createElement("a", { href }, children),
}));

/* ---------- a mesma fonte vazia de src/lib/ausencia.test.ts ---------- */

const SLUG = "vazio";

const periodosZero = (): Record<Periodo, Comparacao> => ({
  ontem: { atual: 0, anterior: 0 },
  "7d": { atual: 0, anterior: 0 },
  "30d": { atual: 0, anterior: 0 },
  mes: { atual: 0, anterior: 0 },
});

const clienteVazio: Cliente = {
  origem: "REAL",
  slug: SLUG,
  nome: "Restaurante Sem Dado",
  segmento: "pizzaria",
  metaPorDiaSemana: null,
  impostoPct: 0.06,
  canais: {
    ifood: { nome: "iFood", tipo: "ifood", taxaPct: 0.27, custoPorPedido: 3 },
    proprio: { nome: "Site", tipo: "proprio", taxaPct: 0.03, custoPorPedido: 8 },
  },
  limites: { metaMinimaPct: 0.8, margemMinimaPct: 0.35, quedaPedidosPct: 0.2, ifoodMaximoPct: 0.6, quedaTicketPct: 0.1 },
};

const pacoteVazio = () => ({
  cliente: clienteVazio,
  ultimoDia: null,
  offsetDias: 0,
  metricas: { origem: "SEM_DADO" as const, dias: [] },
  ifood: {
    origem: "SEM_DADO" as const,
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
  },
  canalProprio: {
    origem: "SEM_DADO" as const,
    metaPctCanalProprio: null,
    campanhas: [],
    criativos: [],
    anunciosDia: [],
    alcance: periodosZero(),
  },
  crm: {
    origem: "SEM_DADO" as const,
    custoPorMensagem: 0,
    resumo: { baseTotal: 0, comOptIn: 0, novosComOptIn: periodosZero(), novosClientes: periodosZero() },
    segmentos: [],
    disparos: [],
    proximos: [],
  },
  whatsapp: { origem: "SEM_DADO" as const, dias: [], conversas: [], regras: [] },
  lucro: { origem: "SEM_DADO" as const, metaCmvPct: null, metaMargemPct: null, metaFaturamentoMes: null, fichas: [], vendasPratosDia: [] },
  plano: {
    origem: "SEM_DADO" as const,
    acoesPorAlerta: { meta: [], margem: [], pedidos: [], ifood: [], ticket: [] },
    acoesPadrao: [],
    acoes: [],
  },
});

vi.mock("@/lib/fonte", async (original) => {
  const real = await original<typeof import("@/lib/fonte")>();
  return {
    ...real,
    listarTenants: async () => [{ tenantId: SLUG, slug: SLUG, nome: clienteVazio.nome, segmento: clienteVazio.segmento }],
    carregar: async (slug: string) => (slug === SLUG ? pacoteVazio() : null),
  };
});

/* ---------- o que nunca pode aparecer num HTML sem medição ---------- */

/** Só o texto que o dono lê: sem atributos, sem classe, sem nome de ícone. */
function texto(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ");
}

/** As quatro mentiras da fase 0, procuradas no texto visível. */
function mentiras(html: string): string[] {
  const t = texto(html);
  const achados: string[] = [];
  const procurar = (re: RegExp, nome: string) => {
    const m = t.match(re);
    if (m) achados.push(`${nome}: "${m[0]}" em …${t.slice(Math.max(0, (m.index ?? 0) - 60), (m.index ?? 0) + 60)}…`);
  };
  procurar(/R\$\s*0(?!\d)/, "R$ 0 que significa não sei");
  procurar(/(?<![\d,.])0(?:,0+)?\s?%/, "percentual zerado");
  procurar(/(?<![\d,.])0(?:,0+)?x\b/, "ROAS zerado");
  procurar(/NaN|Infinity|-∞/, "número impossível");
  procurar(/\bundefined\b/, "undefined vazado");
  return achados;
}

describe("telas de um tenant sem nenhuma linha", () => {
  let d: typeof import("@/lib/dados");
  let telas: {
    HojeTela: typeof import("./HojeTela").HojeTela;
    IfoodTela: typeof import("./IfoodTela").IfoodTela;
    CanalProprioTela: typeof import("./CanalProprioTela").CanalProprioTela;
    CrmTela: typeof import("./CrmTela").CrmTela;
    WhatsappTela: typeof import("./WhatsappTela").WhatsappTela;
    LucroTela: typeof import("./LucroTela").LucroTela;
    MetricasTela: typeof import("./MetricasTela").MetricasTela;
    RestaurantesTela: typeof import("./RestaurantesTela").RestaurantesTela;
  };

  beforeEach(async () => {
    d = await import("@/lib/dados");
    telas = {
      HojeTela: (await import("./HojeTela")).HojeTela,
      IfoodTela: (await import("./IfoodTela")).IfoodTela,
      CanalProprioTela: (await import("./CanalProprioTela")).CanalProprioTela,
      CrmTela: (await import("./CrmTela")).CrmTela,
      WhatsappTela: (await import("./WhatsappTela")).WhatsappTela,
      LucroTela: (await import("./LucroTela")).LucroTela,
      MetricasTela: (await import("./MetricasTela")).MetricasTela,
      RestaurantesTela: (await import("./RestaurantesTela")).RestaurantesTela,
    };
  });

  /** As sete telas, já renderizadas, para os testes que valem para todas. */
  async function todasAsTelas(): Promise<Record<string, string>> {
    const hoje = await d.getHoje(SLUG, "30d");
    return {
      hoje: renderToStaticMarkup(createElement(telas.HojeTela, { slug: SLUG, visao: hoje, usuario: "Gabriel" })),
      ifood: renderToStaticMarkup(createElement(telas.IfoodTela, { visao: await d.getIfood(SLUG, "30d") })),
      canalProprio: renderToStaticMarkup(createElement(telas.CanalProprioTela, { visao: await d.getCanalProprio(SLUG, "30d") })),
      crm: renderToStaticMarkup(createElement(telas.CrmTela, { visao: await d.getCrm(SLUG, "30d") })),
      whatsapp: renderToStaticMarkup(createElement(telas.WhatsappTela, { visao: await d.getWhatsapp(SLUG, "30d") })),
      lucro: renderToStaticMarkup(createElement(telas.LucroTela, { visao: await d.getLucro(SLUG, "30d") })),
      metricas: renderToStaticMarkup(createElement(telas.MetricasTela, { visao: await d.getMetricas(SLUG, "30d") })),
      restaurantes: renderToStaticMarkup(
        createElement(telas.RestaurantesTela, {
          restaurantes: await d.getRestaurantes({ usuarioId: null, tenants: [{ tenantId: SLUG, slug: SLUG }] }),
        }),
      ),
    };
  }

  it("renderiza as sete telas sem estourar (o calendário vazio quebrava)", async () => {
    const html = await todasAsTelas();
    for (const [nome, h] of Object.entries(html)) expect(h.length, nome).toBeGreaterThan(100);
  });

  it("critério 4: nenhuma tela escreve R$ 0, 0%, 0,0x, NaN nem undefined", async () => {
    for (const [nome, h] of Object.entries(await todasAsTelas())) expect(mentiras(h), nome).toEqual([]);
  });

  it("critério 1: nenhum pilar aparece verde na tela Hoje", async () => {
    const hoje = await d.getHoje(SLUG, "30d");
    const html = renderToStaticMarkup(createElement(telas.HojeTela, { slug: SLUG, visao: hoje, usuario: "Gabriel" }));
    // manjericão só significa "bom"; sem medição não há bom.
    expect(html).not.toContain("text-manjericao");
    // e o semáforo diz "Não medido", não "Sem meta" (que afirmaria existir número).
    expect(texto(html)).toContain("Não medido");
    expect(texto(html)).not.toContain("Sem meta");
  });

  it("critério 3: a Comanda não diz que o dia está dentro do plano", async () => {
    const hoje = await d.getHoje(SLUG, "30d");
    const t = texto(renderToStaticMarkup(createElement(telas.HojeTela, { slug: SLUG, visao: hoje, usuario: "Gabriel" })));
    expect(t).not.toContain("dia dentro do plano");
    expect(t).toContain("não há nada a avaliar");
  });

  it("critério 2: cada ausência vem com o motivo, não só com um traço", async () => {
    const html = await todasAsTelas();
    // "não medido" aparece; e nunca sozinho, sempre perto de uma explicação.
    expect(texto(html.ifood)).toContain(NAO_MEDIDO);
    expect(texto(html.ifood)).toContain("não há linha de operação do iFood na fonte");
    expect(texto(html.ifood)).toContain("Não há nenhum dia de funil medido neste período");
    expect(texto(html.canalProprio)).toContain("Não houve investimento em anúncio neste período");
    expect(texto(html.crm)).toContain("Não há nenhum cliente importado para este filtro");
    expect(texto(html.whatsapp)).toContain("Não há nenhum dia de WhatsApp registrado para este filtro");
    expect(texto(html.lucro)).toContain("Não há venda medida neste filtro");
    expect(texto(html.metricas)).toContain("Não há nenhum dia de venda neste filtro");
  });

  it("achado G: a prévia da mensagem não se passa pela mensagem das 7h", async () => {
    const t = texto(renderToStaticMarkup(createElement(telas.MetricasTela, { visao: await d.getMetricas(SLUG, "30d") })));
    expect(t).not.toContain("Exatamente como o dono recebe");
    // e diz de onde vem a mensagem que o dono recebe de verdade hoje
    expect(t).toContain("relatorio_le_tre.py");
  });

  it("achado F: tela vazia não leva selo de exemplo, porque não há exemplo nenhum", async () => {
    for (const [nome, h] of Object.entries(await todasAsTelas())) {
      expect(texto(h), nome).not.toContain("Dados de exemplo");
      expect(texto(h), nome).not.toMatch(/\bExemplo\b/);
    }
  });

  it("achado E: funil, faixa de horário, taxa de resposta e última mensagem não quebram", async () => {
    const t = texto(renderToStaticMarkup(createElement(telas.IfoodTela, { visao: await d.getIfood(SLUG, "30d") })));
    // largura "NaN%" do funil zerado e "faixa das undefined" do Math.max de lista vazia
    expect(t).not.toMatch(/NaN|undefined/);
    expect(t).toContain("Nenhum pedido por faixa de horário foi medido");
    const crm = texto(renderToStaticMarkup(createElement(telas.CrmTela, { visao: await d.getCrm(SLUG, "30d") })));
    expect(crm).not.toMatch(/NaN/);
  });
});

/* ---------- as peças do vocabulário, isoladas ---------- */

describe("o vocabulário visual da ausência", () => {
  it("Sinal separa 'não há meta' de 'não há número'", async () => {
    const { Sinal } = await import("./Sinal");
    const semMeta = renderToStaticMarkup(createElement(Sinal, { situacao: null }));
    const semDado = renderToStaticMarkup(createElement(Sinal, { situacao: null, semDado: true }));
    expect(texto(semMeta)).toContain("Sem meta");
    expect(texto(semDado)).toContain("Não medido");
    for (const h of [semMeta, semDado]) expect(h).not.toContain("text-manjericao");
    expect(renderToStaticMarkup(createElement(Sinal, { situacao: "bom" }))).toContain("text-manjericao");
  });

  it("o selo de SEM_DADO não usa o açafrão, que é a cor reservada ao exemplo", async () => {
    const { MarcaExemplo, MarcaSemDado } = await import("./FaixaExemplo");
    const exemplo = renderToStaticMarkup(createElement(MarcaExemplo, {}));
    const semDado = renderToStaticMarkup(createElement(MarcaSemDado, {}));
    expect(exemplo).toContain("acafrao");
    expect(semDado).not.toContain("acafrao");
    expect(semDado).toContain("border-dashed");
    expect(texto(semDado)).toContain(NAO_MEDIDO);
  });

  it("a faixa só fica açafrão quando existe bloco de exemplo de verdade", async () => {
    const { FaixaExemplo } = await import("./FaixaExemplo");
    // REAL + SEM_DADO é MISTO, mas não tem exemplo nenhum: pintar de açafrão seria
    // mentir ao contrário, prometendo um número fabricado que não existe.
    const misto = renderToStaticMarkup(createElement(FaixaExemplo, { origem: "MISTO", blocos: { a: "REAL", b: "SEM_DADO" } }));
    expect(misto).not.toContain("acafrao");
    expect(texto(misto)).toContain("ainda não foi medida");

    const comExemplo = renderToStaticMarkup(createElement(FaixaExemplo, { origem: "MISTO", blocos: { a: "EXEMPLO", b: "SEM_DADO" } }));
    expect(comExemplo).toContain("acafrao");
    expect(texto(comExemplo)).toContain("exemplo");

    const vazia = renderToStaticMarkup(createElement(FaixaExemplo, { origem: "SEM_DADO", blocos: { a: "SEM_DADO" } }));
    expect(vazia).not.toContain("acafrao");
    expect(texto(vazia)).toContain("Não é zero, é ausência");
  });

  it("campanha ativa sem orçamento na fonte não vira 'R$ 0/dia', e 'Ativa' não é verde", async () => {
    // Medido em 20/10/2026: as 20 campanhas da Le Tre têm orcamento_dia NULO no banco, e
    // a camada de dados converte NULO em 0 — então a tela escrevia "R$ 0/dia" numa
    // campanha ATIVA. E vinte bolinhas manjericão eram a única cor de uma tela sem
    // nenhum número medido, lidas como "está tudo bem".
    const { CanalProprioTela } = await import("./CanalProprioTela");
    const visao: import("@/lib/types").VisaoCanalProprio = {
      origem: "REAL",
      exemplo: {},
      blocos: { vendas: "SEM_DADO", economia: "SEM_DADO", anuncios: "SEM_DADO" },
      canais: ["ifood", "proprio"],
      frase: "Sem venda medida.",
      metaPct: null,
      proprioPct: { atual: 0, anterior: 0 },
      semanas: [],
      economia: { pedidos: 0, faturamento: 0, custoSeFosseIfood: 0, custoNoCanalProprio: 0, economia: 0 },
      trafego: {
        investimento: { atual: 0, anterior: 0 },
        alcance: { atual: 0, anterior: 0 },
        impressoes: 0,
        cliques: 0,
        pedidos: { atual: 0, anterior: 0 },
        custoPorPedido: { atual: null, anterior: null },
        faturamento: 0,
        roas: null,
        margem: 0,
        roasMargem: null,
        sobraDepoisDoAnuncio: 0,
      },
      criativos: [],
      campanhas: [
        { id: "c1", nome: "Jerry's - FDS - Conversão (Pixel)", status: "ativa", objetivo: "Conversão", orcamentoDia: 0, investimento: 0, pedidos: 0, custoPorPedido: null },
      ],
    };
    const html = renderToStaticMarkup(createElement(CanalProprioTela, { visao }));
    expect(mentiras(html)).toEqual([]);
    expect(texto(html)).toContain(`orçamento diário ${NAO_MEDIDO}`);
    expect(html).not.toContain("text-manjericao");
    // e a tela avisa que a lista não respeita o filtro de marca ainda
    expect(texto(html)).toContain("não é filtrada por marca");
  });

  it("Indicador com 'não medido' deixa de parecer número e não mostra variação", async () => {
    const { Indicador } = await import("./ui");
    const ausente = renderToStaticMarkup(
      createElement(Indicador, { rotulo: "ROAS", valor: NAO_MEDIDO, comparacao: { atual: 0, anterior: 0 }, detalhe: "sem investimento no período" }),
    );
    expect(ausente).not.toContain("font-display");
    expect(texto(ausente)).toContain(NAO_MEDIDO);
    expect(texto(ausente)).toContain("sem investimento no período");
    expect(texto(ausente)).not.toMatch(/%/);

    const medido = renderToStaticMarkup(createElement(Indicador, { rotulo: "Pedidos", valor: "120", comparacao: { atual: 120, anterior: 100 } }));
    expect(medido).toContain("font-display");
    expect(texto(medido)).toContain("+20%");
  });
});
