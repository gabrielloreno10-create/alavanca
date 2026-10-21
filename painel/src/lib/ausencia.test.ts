import { beforeEach, describe, expect, it, vi } from "vitest";
import { maiorDe, razao } from "./calculos";
import { origemDe, origemDeVarios } from "./fonte/postgres";
import type { Cliente, Comparacao, Periodo } from "./types";

/**
 * Ausência não é zero.
 *
 * Estes testes guardam a regra que a fase 0 instalou: quando a fonte não tem a linha,
 * a camada de dados devolve `null` e o bloco vira `SEM_DADO`. Nunca 0, nunca verde,
 * nunca NaN. Um zero que significa "não sei" é a mentira mais cara do painel, porque
 * parece uma medição.
 */

describe("os três estados de origem", () => {
  it("sem linha nenhuma é SEM_DADO, não EXEMPLO", () => {
    // Era aqui o achado F: `origemDe([])` devolvia "EXEMPLO", e o CRM e o WhatsApp
    // vazios da Le Tre levavam selo de exemplo sem ter exemplo nenhum.
    expect(origemDe([])).toBe("SEM_DADO");
  });

  it("toda linha REAL é REAL; qualquer EXEMPLO contamina o conjunto", () => {
    expect(origemDe([{ origem: "REAL" }, { origem: "REAL" }])).toBe("REAL");
    expect(origemDe([{ origem: "REAL" }, { origem: "EXEMPLO" }])).toBe("EXEMPLO");
    expect(origemDe([{ origem: "EXEMPLO" }])).toBe("EXEMPLO");
  });

  it("juntando conjuntos independentes, o vazio não contamina quem tem dado", () => {
    // 20 campanhas REAIS + zero criativo = REAL, não SEM_DADO: há dado real ali.
    expect(origemDeVarios("REAL", "SEM_DADO")).toBe("REAL");
    expect(origemDeVarios("EXEMPLO", "SEM_DADO")).toBe("EXEMPLO");
    expect(origemDeVarios("REAL", "EXEMPLO")).toBe("EXEMPLO");
    // Se nenhum conjunto tem linha, aí sim não há nada.
    expect(origemDeVarios("SEM_DADO", "SEM_DADO")).toBe("SEM_DADO");
  });
});

describe("divisões protegidas", () => {
  it("razão sem denominador é null, não zero", () => {
    expect(razao(10, 0)).toBeNull();
    expect(razao(0, 0)).toBeNull();
    expect(razao(10, 4)).toBe(2.5);
  });

  it("razão nunca devolve NaN nem Infinity", () => {
    for (const [a, b] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [Number.NaN, 2],
      [Number.POSITIVE_INFINITY, 2],
    ]) {
      const r = razao(a, b);
      expect(r === null || Number.isFinite(r)).toBe(true);
    }
  });

  it("maiorDe de lista vazia é null, não -Infinity", () => {
    // Math.max() sem argumento devolve -Infinity, e era isso que ia para a faixa de horário.
    expect(maiorDe([])).toBeNull();
    expect(maiorDe([3, 9, 1])).toBe(9);
  });
});

/* ------------------------------------------------------------------------- *
 * Tenant sem NENHUMA linha: nada pode virar zero, verde ou NaN.
 * ------------------------------------------------------------------------- */

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

/** Exatamente o que o Postgres devolve para um tenant/marca sem uma linha sequer. */
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

vi.mock("./fonte", async (original) => {
  const real = await original<typeof import("./fonte")>();
  return {
    ...real,
    listarTenants: async () => [{ tenantId: SLUG, slug: SLUG, nome: clienteVazio.nome, segmento: clienteVazio.segmento }],
    carregar: async (slug: string) => (slug === SLUG ? pacoteVazio() : null),
  };
});

/** Todo número não finito que escapou para a visão. */
function naoFinitos(raiz: unknown, caminho = ""): string[] {
  const achados: string[] = [];
  const ver = (v: unknown, c: string) => {
    if (typeof v === "number") {
      if (!Number.isFinite(v)) achados.push(`${c} = ${v}`);
      return;
    }
    if (Array.isArray(v)) return v.forEach((x, i) => ver(x, `${c}[${i}]`));
    if (v && typeof v === "object") return Object.entries(v).forEach(([k, x]) => ver(x, c ? `${c}.${k}` : k));
  };
  ver(raiz, caminho);
  return achados;
}

/** Todo texto da visão, para procurar afirmação de número que ninguém mediu. */
function textos(raiz: unknown): string[] {
  const out: string[] = [];
  const ver = (v: unknown) => {
    if (typeof v === "string") return void out.push(v);
    if (Array.isArray(v)) return v.forEach(ver);
    if (v && typeof v === "object") return Object.values(v).forEach(ver);
  };
  ver(raiz);
  return out;
}

describe("tenant sem nenhuma linha", () => {
  // Importado depois do vi.mock para a camada já enxergar a fonte trocada.
  let d: typeof import("./dados");

  beforeEach(async () => {
    d = await import("./dados");
  });

  it("nenhum pilar fica verde, e nenhum mostra número", async () => {
    const hoje = await d.getHoje(SLUG, "30d");
    expect(hoje.origem).toBe("SEM_DADO");
    for (const p of hoje.pilares) {
      expect(p.origem, p.pilar).toBe("SEM_DADO");
      expect(p.situacao, p.pilar).toBeNull();
      expect(p.variacao, p.pilar).toBeNull();
      expect(p.valor, p.pilar).toBe("não medido");
    }
  });

  it('a comanda não diz "Nenhum alerta: dia dentro do plano" sobre um dia que não existe', async () => {
    const hoje = await d.getHoje(SLUG, "30d");
    expect(hoje.comanda.alerta).toBeNull();
    expect(hoje.comanda.origem).toBe("SEM_DADO");
  });

  it("a mensagem das 7h declara a ausência em vez de mandar R$ 0", async () => {
    const m = await d.getMetricas(SLUG, "30d");
    expect(m.origem).toBe("SEM_DADO");
    expect(m.mensagem).not.toMatch(/R\$\s*0/);
    expect(m.mensagem).not.toContain("dia dentro do plano");
    expect(m.mensagem).toContain("não é zero");
  });

  it("iFood: taxa, take-rate, funil, nota, tempo e cancelamento chegam como ausência", async () => {
    const i = await d.getIfood(SLUG, "30d");
    expect(i.taxaEfetiva).toBeNull(); // achado C: nunca "sobram R$ 100,00"
    expect(i.takeRateMedido).toBeNull();
    expect(i.funil).toBeNull(); // achado E: sem funil não há largura a calcular
    expect(i.indicadores.nota).toBeNull(); // achado D
    expect(i.indicadores.tempoEntregaMin).toBeNull();
    expect(i.indicadores.cancelamentoPct).toBeNull();
  });

  it("canal próprio: meta, ROAS e custo por pedido são null, não zero", async () => {
    const cp = await d.getCanalProprio(SLUG, "30d");
    expect(cp.metaPct).toBeNull(); // achado B: sem a chave não há meta, e sem meta não há verde
    expect(cp.trafego.roas).toBeNull();
    expect(cp.trafego.roasMargem).toBeNull();
    expect(cp.trafego.custoPorPedido).toEqual({ atual: null, anterior: null });
    expect(cp.blocos.anuncios).toBe("SEM_DADO");
  });

  it("CRM, WhatsApp e Lucro: percentuais sem base viram null", async () => {
    const crm = await d.getCrm(SLUG, "30d");
    expect(crm.base.pctOptIn).toBeNull();
    expect(crm.totaisDisparos.taxaResposta).toBeNull();

    const wa = await d.getWhatsapp(SLUG, "30d");
    expect(wa.conversao).toBeNull();
    expect(wa.ticketWhatsapp).toBeNull();
    expect(wa.vendaSugestiva.taxaAceite).toBeNull();

    const l = await d.getLucro(SLUG, "30d");
    expect(l.cmv.pct).toBeNull();
    expect(l.margem.pct).toBeNull();
  });

  it("nenhuma visão devolve NaN, Infinity ou -Infinity", async () => {
    const visoes = {
      hoje: await d.getHoje(SLUG, "30d"),
      ifood: await d.getIfood(SLUG, "30d"),
      canalProprio: await d.getCanalProprio(SLUG, "30d"),
      crm: await d.getCrm(SLUG, "30d"),
      whatsapp: await d.getWhatsapp(SLUG, "30d"),
      lucro: await d.getLucro(SLUG, "30d"),
      metricas: await d.getMetricas(SLUG, "30d"),
      restaurantes: await d.getRestaurantes({ usuarioId: null, tenants: [{ tenantId: SLUG, slug: SLUG }] }),
    };
    expect(naoFinitos(visoes)).toEqual([]);
  });

  it("nenhuma frase das telas afirma um número que ninguém mediu", async () => {
    const frases = [
      (await d.getIfood(SLUG, "30d")).frase,
      (await d.getCanalProprio(SLUG, "30d")).frase,
      (await d.getCrm(SLUG, "30d")).frase,
      (await d.getLucro(SLUG, "30d")).frase,
      (await d.getMetricas(SLUG, "30d")).frase,
    ];
    for (const f of frases) {
      expect(f, f).not.toMatch(/R\$\s*0(?!\d)/); // "R$ 0" / "R$ 0,00"
      expect(f, f).not.toMatch(/\b0(?:,0+)?%/); // "0%" / "0,0%"
      expect(f, f).not.toMatch(/NaN|Infinity/);
    }
  });

  it("nenhum texto de nenhuma visão carrega NaN nem Infinity", async () => {
    const todos = [
      ...textos(await d.getHoje(SLUG, "30d")),
      ...textos(await d.getIfood(SLUG, "30d")),
      ...textos(await d.getCanalProprio(SLUG, "30d")),
      ...textos(await d.getLucro(SLUG, "30d")),
      ...textos(await d.getMetricas(SLUG, "30d")),
    ];
    for (const t of todos) expect(t, t).not.toMatch(/NaN|Infinity|-∞/);
  });
});
