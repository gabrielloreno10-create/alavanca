import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cliente, Comparacao, Periodo } from "./types";

/**
 * Ausência PARCIAL: a fonte trouxe algumas linhas e não outras.
 *
 * `ausencia.test.ts` cobre o tenant sem nenhuma linha. O caso difícil é o do meio, e
 * ele erra para os DOIS lados:
 *
 *  - há DEFINIÇÃO de segmento em `crm_segmento` e nenhum número em
 *    `crm_segmento_snapshot` — e a tela contava "0 clientes" como se alguém tivesse
 *    contado (medido no grupo-le-tre em 20/10/2026: 5 definições, 0 snapshots);
 *  - há INVESTIMENTO gravado em `anuncio_dia` sem criativo, e a leitura agrega por
 *    criativo — então o painel jogava fora R$ 16.901,43 e dizia "nenhum anúncio com
 *    investimento no período" (medido: criativo_id nulo em 27 de 27 linhas).
 *
 * Zero inventado e ausência inventada custam a mesma confiança.
 */

const SLUG = "parcial";

const periodosZero = (): Record<Periodo, Comparacao> => ({
  ontem: { atual: 0, anterior: 0 },
  "7d": { atual: 0, anterior: 0 },
  "30d": { atual: 0, anterior: 0 },
  mes: { atual: 0, anterior: 0 },
});

const cliente: Cliente = {
  origem: "REAL",
  slug: SLUG,
  nome: "Restaurante Meio Medido",
  segmento: "pizzaria",
  metaPorDiaSemana: null,
  impostoPct: 0.06,
  canais: {
    ifood: { nome: "iFood", tipo: "ifood", taxaPct: 0.27, custoPorPedido: 3 },
    proprio: { nome: "Site", tipo: "proprio", taxaPct: 0.03, custoPorPedido: 8 },
  },
  limites: { metaMinimaPct: 0.8, margemMinimaPct: 0.35, quedaPedidosPct: 0.2, ifoodMaximoPct: 0.6, quedaTicketPct: 0.1 },
};

const DIA = "2026-09-15";

/** Ligado/desligado pelo teste para comparar os dois casos com a MESMA fonte. */
let comLinhaOrfa = true;

const pacote = () => ({
  cliente,
  ultimoDia: DIA,
  offsetDias: 0,
  metricas: {
    origem: "REAL" as const,
    dias: [
      {
        data: DIA,
        cmv: 200,
        canais: {
          ifood: { faturamento: 700, pedidos: 10 },
          proprio: { faturamento: 300, pedidos: 5 },
        },
      },
    ],
  },
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
    origem: "REAL" as const,
    metaPctCanalProprio: null,
    campanhas: [],
    criativos: [],
    // Exatamente o caso do banco: a linha existe, o criativo não.
    anunciosDia: comLinhaOrfa ? [{ data: DIA, criativos: {}, semCriativo: { investimento: 318.77, pedidos: 12 } }] : [],
    alcance: periodosZero(),
  },
  crm: {
    origem: "EXEMPLO" as const,
    custoPorMensagem: 0.35,
    resumo: { baseTotal: 0, comOptIn: 0, novosComOptIn: periodosZero(), novosClientes: periodosZero() },
    // Definição sem apuração: é o que o `left join lateral` devolve sem snapshot.
    segmentos: [
      { id: "novos", nome: "Novos", criterio: "1o pedido em 30 dias", clientes: null, comOptIn: null, valor90d: null, acao: "Mandar boas-vindas" },
    ],
    disparos: [],
    proximos: [{ data: "2026-09-20", hora: "18:00", segmento: "novos", mensagem: "Oi" }],
  },
  whatsapp: { origem: "SEM_DADO" as const, dias: [], conversas: [], regras: [] },
  lucro: { origem: "REAL" as const, metaCmvPct: null, metaMargemPct: null, metaFaturamentoMes: null, fichas: [], vendasPratosDia: [] },
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
    listarTenants: async () => [{ tenantId: SLUG, slug: SLUG, nome: cliente.nome, segmento: cliente.segmento }],
    carregar: async (slug: string) => (slug === SLUG ? pacote() : null),
  };
});

describe("ausência parcial", () => {
  let d: typeof import("./dados");

  beforeEach(async () => {
    comLinhaOrfa = true;
    vi.resetModules();
    d = await import("./dados");
  });

  it("segmento com definição e sem snapshot chega null, não zero", async () => {
    const crm = await d.getCrm(SLUG, "30d");
    const s = crm.segmentos[0];
    expect(s.clientes).toBeNull();
    expect(s.comOptIn).toBeNull();
    expect(s.valor90d).toBeNull();
    expect(s.pctOptIn).toBeNull();
  });

  it("bloco de segmentos sem nenhuma apuração é SEM_DADO, não EXEMPLO", async () => {
    // A origem de um bloco de NÚMEROS tem que vir da tabela que guarda os números.
    // Tirá-la de crm_segmento selava como "Exemplo" um bloco que não tem número algum.
    const crm = await d.getCrm(SLUG, "30d");
    expect(crm.blocos.segmentos).toBe("SEM_DADO");
  });

  it("agendamento de segmento não apurado não afirma quantos vão receber", async () => {
    const crm = await d.getCrm(SLUG, "30d");
    expect(crm.proximos[0].disparaveis).toBeNull();
    expect(crm.proximos[0].foraDoDisparo).toBeNull();
  });

  it("investimento gravado sem criativo não some: vem separado para a tela declarar", async () => {
    const cp = await d.getCanalProprio(SLUG, "30d");
    // continua fora dos totais, porque de fato não dá para atribuir…
    expect(cp.trafego.investimento.atual).toBe(0);
    expect(cp.trafego.roas).toBeNull();
    // …mas a tela agora sabe que ele existe, e quanto é.
    expect(cp.trafego.naoAtribuido).toEqual({ investimento: 318.77, pedidos: 12 });
  });

  it("a mensagem das 7h não deixa '*Hoje:*' pendurado sem nada embaixo", async () => {
    // Depois da migration 017 o cliente REAL ficou sem nenhuma ação ativa. No painel o
    // vazio vira frase; no WhatsApp não existe estado vazio: "*Hoje:*" seguido de nada
    // o dono lê como "hoje não tem nada para fazer".
    const m = await d.getMetricas(SLUG, "30d");
    expect(m.mensagem).toContain("*Hoje:*");
    expect(m.mensagem).not.toMatch(/\*Hoje:\*\s*$/);
    expect(m.mensagem).toContain("Nenhuma ação combinada ainda");
  });

  it("sem linha órfã nenhuma, naoAtribuido é null (e aí 'não houve anúncio' é verdade)", async () => {
    comLinhaOrfa = false;
    const cp = await d.getCanalProprio(SLUG, "30d");
    expect(cp.trafego.naoAtribuido).toBeNull();
  });
});
