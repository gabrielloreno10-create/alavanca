import { describe, expect, it } from "vitest";
import { acoesDoDia, alertasDoDia, intervalos, margemDoDia, resumir, situacaoMeta, variacao } from "./calculos";
import type { AcaoSugerida, Cliente, DiaVendas, Plano } from "./types";

const cliente: Cliente = {
  origem: "EXEMPLO",
  slug: "teste",
  nome: "Teste",
  segmento: "",
  metaPorDiaSemana: { seg: 1000, ter: 1000, qua: 1000, qui: 1000, sex: 1000, sab: 1000, dom: 1000 },
  impostoPct: 0.06,
  canais: {
    ifood: { nome: "iFood", taxaPct: 0.262, custoPorPedido: 3 },
    proprio: { nome: "Próprio", taxaPct: 0.03, custoPorPedido: 8 },
    salao: { nome: "Salão", taxaPct: 0.025, custoPorPedido: 0 },
  },
  limites: { metaMinimaPct: 0.8, margemMinimaPct: 0.35, quedaPedidosPct: 0.2, ifoodMaximoPct: 0.6, quedaTicketPct: 0.1 },
};

const dia = (data: string, ifood: number, proprio: number, salao: number, pedidos: [number, number, number], cmv: number): DiaVendas => ({
  data,
  canais: {
    ifood: { faturamento: ifood, pedidos: pedidos[0] },
    proprio: { faturamento: proprio, pedidos: pedidos[1] },
    salao: { faturamento: salao, pedidos: pedidos[2] },
  },
  cmv,
});

describe("margem de contribuição", () => {
  it("desconta CMV, imposto, taxa e custo por pedido de cada canal", () => {
    // iFood 100 (1 pedido): 100*(0,06+0,262)+3 = 35,20 · CMV 30 → 100 − 30 − 35,20 = 34,80
    expect(margemDoDia(dia("2026-10-07", 100, 0, 0, [1, 0, 0], 30), cliente)).toBeCloseTo(34.8, 6);
    // salão 100: 100*(0,06+0,025) = 8,50 · CMV 30 → 61,50
    expect(margemDoDia(dia("2026-10-07", 0, 0, 100, [0, 0, 1], 30), cliente)).toBeCloseTo(61.5, 6);
  });
});

describe("resumir", () => {
  it("soma canais, calcula ticket e participação que fecha 100%", () => {
    const r = resumir([dia("2026-10-06", 600, 200, 200, [6, 2, 2], 300), dia("2026-10-07", 300, 100, 100, [3, 1, 1], 150)], cliente);
    expect(r.faturamento).toBe(1500);
    expect(r.pedidos).toBe(15);
    expect(r.ticket).toBe(100);
    expect(r.canalPct.ifood + r.canalPct.proprio + r.canalPct.salao).toBeCloseTo(1, 10);
    expect(r.canalPct.ifood).toBeCloseTo(0.6, 10);
  });
  it("não divide por zero sem vendas", () => {
    const r = resumir([], cliente);
    expect(r.ticket).toBe(0);
    expect(r.margemPct).toBe(0);
  });
});

describe("períodos", () => {
  it("7 dias compara com os 7 anteriores", () => {
    expect(intervalos("7d", "2026-10-07")).toEqual({ atual: ["2026-10-01", "2026-10-07"], anterior: ["2026-09-24", "2026-09-30"] });
  });
  it("ontem compara com o mesmo dia da semana passada", () => {
    expect(intervalos("ontem", "2026-10-07").anterior).toEqual(["2026-09-30", "2026-09-30"]);
  });
  it("mês compara com os mesmos dias do mês anterior", () => {
    expect(intervalos("mes", "2026-10-07")).toEqual({ atual: ["2026-10-01", "2026-10-07"], anterior: ["2026-09-01", "2026-09-07"] });
  });
  it("variação sem base é null", () => {
    expect(variacao(10, 0)).toBeNull();
    expect(variacao(110, 100)).toBeCloseTo(0.1, 10);
  });
});

describe("alertas e ações", () => {
  // Cada acao carrega a sua origem: e isso que permite a tela selar a fabricada.
  const ex = (t: string): AcaoSugerida => ({ texto: t, origem: "EXEMPLO" });
  const plano: Plano = {
    origem: "EXEMPLO",
    acoesPorAlerta: { meta: [ex("A1"), ex("A2")], margem: [], pedidos: [ex("P1")], ifood: [ex("I1")], ticket: [] },
    acoesPadrao: [ex("D1"), ex("D2"), ex("D3")],
    acoes: [],
  };
  it("meta abaixo de 80% vem primeiro e puxa as ações dela", () => {
    const dias = [dia("2026-09-30", 400, 300, 300, [4, 3, 3], 300), dia("2026-10-07", 500, 100, 100, [5, 1, 1], 200)];
    const alertas = alertasDoDia(dias, "2026-10-07", cliente);
    expect(alertas[0].tipo).toBe("meta");
    expect(alertas.map((a) => a.tipo)).toContain("pedidos");
    expect(alertas.map((a) => a.tipo)).toContain("ifood");
    expect(acoesDoDia(alertas, plano).map((a) => a.texto)).toEqual(["A1", "A2", "P1"]);
  });
  it("a origem de cada ação viaja junto, para a tela não ter como esquecer o selo", () => {
    expect(acoesDoDia([], plano).every((a) => a.origem === "EXEMPLO")).toBe(true);
  });
  it("sem alerta, usa as ações padrão", () => {
    expect(acoesDoDia([], plano).map((a) => a.texto)).toEqual(["D1", "D2", "D3"]);
  });
  it("semáforo da meta", () => {
    expect(situacaoMeta(1.02, cliente)).toBe("bom");
    expect(situacaoMeta(0.85, cliente)).toBe("atencao");
    expect(situacaoMeta(0.5, cliente)).toBe("alerta");
  });
});

import { fraseCanalProprio, fraseIfood, marcarMelhorPior, marcarVendeMuitoMargemBaixa, margemItemIfood, taxaEfetiva } from "./calculos";

describe("pilares 1 a 3", () => {
  it("margem do item no iFood", () => {
    // 100 × (1 − 0,06 − 0,23 − 0,032) − 30 − 2,50 = 35,30
    expect(margemItemIfood(100, 30, { impostoPct: 0.06, comissaoPct: 0.23, taxaPagamentoPct: 0.032, embalagemPorItem: 2.5 })).toBeCloseTo(35.3, 6);
  });
  it("taxa efetiva soma comissão, pagamento e promoções", () => {
    const t = taxaEfetiva(10000, 0.23, 0.032, 800);
    expect(t.total).toBeCloseTo(3420, 6);
    expect(t.pct).toBeCloseTo(0.342, 6);
  });
  it("marca quem vende muito com margem baixa", () => {
    const r = marcarVendeMuitoMargemBaixa([{ qtd: 100, margemPct: 0.2 }, { qtd: 90, margemPct: 0.5 }, { qtd: 5, margemPct: 0.1 }], 0.35);
    expect(r.map((x) => x.vendeMuitoMargemBaixa)).toEqual([true, false, false]);
  });
  it("melhor e pior criativo ignoram quem tem poucos pedidos", () => {
    const r = marcarMelhorPior([{ custoPorPedido: 10, pedidos: 1 }, { custoPorPedido: 20, pedidos: 5 }, { custoPorPedido: 40, pedidos: 4 }]);
    expect(r.map((x) => x.marca)).toEqual([null, "melhor", "pior"]);
  });
  it("frase do iFood usa 'mas' quando vendas e taxa vão em direções opostas", () => {
    const f = fraseIfood({ faturamento: 108, faturamentoAnterior: 100, taxaPct: 0.31, taxaPctAnterior: 0.29, promocoes: 20, promocoesAnterior: 10 });
    expect(f).toBe("Seu iFood vendeu 8% mais que no período anterior, mas a taxa efetiva subiu 2 p.p., para 31,0%, por causa das promoções.");
  });
  it("frase do canal próprio", () => {
    expect(fraseCanalProprio({ pct: 0.2, pctAnterior: 0.18, meta: 0.3, custoPorPedido: null, custoPorPedidoAnterior: null })).toBe(
      "O canal próprio ficou com 20% das vendas (abaixo da meta de 30%), 2 p.p. a mais que no período anterior.",
    );
  });
});

import { classificarCardapio, diasNoMes, margemPorCanal, projetarMes } from "./calculos";

describe("pilares 4 a 6", () => {
  it("margem por canal soma a margem total do dia", () => {
    const d = dia("2026-10-07", 600, 200, 200, [6, 2, 2], 300);
    const m = margemPorCanal([d], cliente);
    expect(m.ifood.margem + m.proprio.margem + m.salao.margem).toBeCloseTo(margemDoDia(d, cliente), 6);
  });
  it("engenharia de cardápio: 70% da média e margem média ponderada", () => {
    const { pratos, cortes } = classificarCardapio([
      { qtd: 100, margem: 50 }, // popular, margem alta
      { qtd: 100, margem: 20 }, // popular, margem baixa
      { qtd: 10, margem: 60 }, // pouco vendido, margem alta
      { qtd: 10, margem: 10 }, // pouco vendido, margem baixa
    ]);
    expect(cortes.qtd).toBeCloseTo(0.7 * 55, 6);
    expect(pratos.map((p) => p.quadrante)).toEqual(["estrela", "cavalo", "joia", "rever"]);
  });
  it("projeção do mês e dias no mês", () => {
    expect(projetarMes(7000, 7, 31)).toBe(31000);
    expect(diasNoMes("2026-02-10")).toBe(28);
    expect(diasNoMes("2026-10-07")).toBe(31);
  });
});
