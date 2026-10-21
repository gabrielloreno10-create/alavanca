import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ClienteDesconhecido,
  getCanalProprio,
  getCrm,
  getHoje,
  getIfood,
  getLucro,
  getMetricas,
  getOperacoes,
  getPlano,
  getRestaurantes,
  getWhatsapp,
  listarClientes,
  modoDaFonte,
} from "./dados";
import { lerMarca, lerPeriodo } from "./filtros";
import { PERIODOS } from "./types";

/**
 * Os testes rodam contra a camada de dados de verdade, pela mesma interface que as telas
 * usam. Sem DATABASE_URL ela cai no modo de semente (src/data/clientes/), que é o que
 * roda aqui — por isso a primeira asserção é justamente qual modo está valendo: um teste
 * que passasse em silêncio apontando para o banco errado não valeria nada.
 */
describe("camada de dados", () => {
  beforeAll(() => {
    expect(process.env.DATABASE_URL ?? "").toBe("");
  });

  it("sem DATABASE_URL o modo é semente, e a lista de clientes vem do disco", async () => {
    expect(modoDaFonte()).toBe("seed");
    const clientes = await listarClientes();
    expect(clientes.map((c) => c.slug).sort()).toEqual(["grupo-le-tre", "pizzaria-exemplo"]);
  });

  it("cliente fora da lista vira ClienteDesconhecido (a rota transforma em 404)", async () => {
    await expect(getHoje("nao-existe", "7d")).rejects.toBeInstanceOf(ClienteDesconhecido);
  });

  it("os filtros da URL têm padrão e recusam lixo", () => {
    expect(lerPeriodo(undefined)).toBe("7d");
    expect(lerPeriodo("30d")).toBe("30d");
    expect(lerPeriodo("drop table")).toBe("7d");
    expect(lerMarca(undefined)).toBe("todas");
    expect(lerMarca("Jerry's Burger")).toBe("Jerry's Burger");
  });

  it("a tela raiz lista um restaurante por tenant com os 6 pilares", async () => {
    const linhas = await getRestaurantes({ usuarioId: null, tenants: [] });
    expect(linhas.length).toBe(2);
    for (const l of linhas) {
      expect(l.pilares.map((p) => p.pilar)).toEqual(["ifood", "canal-proprio", "crm", "whatsapp", "lucro", "metricas"]);
      // alerta pode ser null (tenant sem nenhum dia de venda); aqui os dois têm dia.
      expect(l.alerta).not.toBeNull();
      expect(l.alerta!.texto.length).toBeGreaterThan(0);
    }
  });
});

describe("Le Tre: dados reais importados", () => {
  const SLUG = "grupo-le-tre";

  it("setembro bate com o total do Saipos e as metas ficam em aberto", async () => {
    const m = await getMetricas(SLUG, "mes");
    const total = m.tabela.reduce((s, l) => s + l.faturamento, 0);
    expect(total).toBeCloseTo(49970.7, 2); // saipos_faturamento_mensal: PZ + PA + LCF em 2026-09
    // A tela de Métricas é MISTO, não REAL: o calendário e a tabela são reais, mas a
    // mensagem das 7h carrega as 3 ações sugeridas, que têm origem EXEMPLO (achado A).
    // Declarar a tela inteira REAL era apresentar recomendação fabricada como método.
    expect(m.origem).toBe("MISTO");
    expect(m.blocos.vendas).toBe("REAL");
    expect(m.blocos.calendario).toBe("REAL");
    expect(m.blocos.mensagem).toBe("EXEMPLO");
    expect(m.temMeta).toBe(false);
    expect(m.tabela.every((l) => l.meta === null)).toBe(true);
    const hoje = await getHoje(SLUG, "mes");
    expect(hoje.origem).toBe("MISTO");
    expect(hoje.comanda.meta).toBeNull();
  });

  it("blocos sem fonte real continuam marcados como exemplo", async () => {
    const ifood = await getIfood(SLUG, "30d");
    expect(ifood.origem).toBe("MISTO");
    expect(ifood.exemplo.vendas).toBe(false);
    expect(ifood.exemplo.promocoes).toBe(true);
    const lucro = await getLucro(SLUG, "30d");
    expect(lucro.exemplo.cardapio).toBe(false);
    expect(lucro.cmvEstimado).toBe(true);
    expect(lucro.metasMes.itens.every((i) => i.meta === null)).toBe(true);
    expect((await getCrm(SLUG, "30d")).origem).toBe("EXEMPLO");
  });

  it("cada operação somada dá o consolidado, e a margem por canal soma a margem total", async () => {
    const ops = (await getOperacoes(SLUG)).filter((o) => o.id !== "todas");
    const total = (await getHoje(SLUG, "30d")).comanda.resumo;
    if (ops.length > 1) {
      let soma = 0;
      for (const o of ops) soma += (await getHoje(SLUG, "30d", o.id)).comanda.resumo.faturamento;
      expect(soma).toBeCloseTo(total.faturamento, 2);
    }
    const l = await getLucro(SLUG, "30d");
    expect(l.porCanal.length).toBeGreaterThanOrEqual(3); // uma linha por loja
    expect(l.porCanal.reduce((s, c) => s + c.margem, 0)).toBeCloseTo(l.margem.valor, 4);
  });

  it("marca inválida na URL cai no consolidado em vez de quebrar a tela", async () => {
    const consolidado = await getHoje(SLUG, "30d", "todas");
    const inventada = await getHoje(SLUG, "30d", "Marca Que Não Existe");
    expect(inventada.comanda.resumo.faturamento).toBeCloseTo(consolidado.comanda.resumo.faturamento, 6);
  });

  it("nenhum dado pessoal de cliente final nos JSON", () => {
    const raiz = join(import.meta.dirname, "..", "data", "clientes");
    for (const cliente of readdirSync(raiz)) {
      const pasta = join(raiz, cliente);
      for (const arq of readdirSync(pasta)) {
        const txt = readFileSync(join(pasta, arq), "utf-8");
        expect(txt, `${cliente}/${arq}`).not.toMatch(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}/); // telefone
        expect(txt, `${cliente}/${arq}`).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i); // e-mail
      }
    }
  });
});

describe("nenhum segredo no código versionado", () => {
  const SUSPEITO = [
    /postgres(?:ql)?:\/\/[^\s"'`]*:[^\s"'`@]+@/i, // URL de banco com senha
    /\b(?:senha|password|secret|api[_-]?key|token)\s*[:=]\s*["'][^"'$\s{}]{8,}["']/i,
  ];
  const PERMITIDO = /process\.env|example|\$\{/;

  function arquivos(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return arquivos(p);
      return /\.(ts|tsx|mjs|json)$/.test(e.name) ? [p] : [];
    });
  }

  it("src/ e scripts/ não têm senha, token nem URL de banco com credencial", () => {
    const raiz = join(import.meta.dirname, "..");
    for (const arq of [...arquivos(raiz), ...arquivos(join(raiz, "..", "scripts"))]) {
      for (const linha of readFileSync(arq, "utf-8").split("\n")) {
        if (PERMITIDO.test(linha)) continue;
        for (const re of SUSPEITO) expect(linha, arq).not.toMatch(re);
      }
    }
  });
});

for (const SLUG of ["grupo-le-tre", "pizzaria-exemplo"])
  describe(`${SLUG}: totais batem`, () => {
    for (const { id } of PERIODOS) {
      it(`período ${id}`, async () => {
        const hoje = await getHoje(SLUG, id);
        const r = hoje.comanda.resumo;
        expect(r.faturamentoCanal.ifood + r.faturamentoCanal.proprio + r.faturamentoCanal.salao).toBeCloseTo(r.faturamento, 6);

        const ifood = await getIfood(SLUG, id);
        const te = ifood.taxaEfetiva;
        // taxaEfetiva só existe quando comissão E taxa de pagamento foram medidas.
        if (te) expect(te.comissao + te.taxaPagamento + te.promocoes).toBeCloseTo(te.total, 6);
        expect(ifood.pratos.length).toBeLessThanOrEqual(10);
        expect(ifood.funil).not.toBeNull();
        const etapas = ifood.funil!.etapas.map((e) => e.valor);
        expect([...etapas].sort((a, b) => b - a)).toEqual(etapas); // funil só diminui
        expect(etapas[3]).toBe(ifood.indicadores.pedidos.atual);

        const cp = await getCanalProprio(SLUG, id);
        for (const s of cp.semanas) expect(s.ifood + s.proprio + s.salao).toBeCloseTo(1, 6);
        expect(cp.trafego.pedidos.atual).toBeLessThanOrEqual(cp.economia.pedidos); // anúncio não atribui mais pedidos do que o site fez
        // nenhuma razão desta tela pode chegar como NaN ou Infinity
        for (const n of [cp.trafego.roas, cp.trafego.roasMargem, cp.trafego.custoPorPedido.atual]) {
          expect(n === null || Number.isFinite(n)).toBe(true);
        }
        expect(cp.criativos.filter((c) => c.marca === "melhor").length).toBeLessThanOrEqual(1);
      });
    }

    it("CRM: segmentos somam a base e ninguém sem opt-in recebe disparo", async () => {
      const crm = await getCrm(SLUG, "30d");
      // Na semente TODO segmento tem contagem. Null aqui seria regressão da fonte, não
      // ausência legítima — por isso a asserção explícita antes de somar.
      for (const s of crm.segmentos) {
        expect(s.clientes).not.toBeNull();
        expect(s.comOptIn).not.toBeNull();
      }
      expect(crm.segmentos.reduce((s, x) => s + (x.clientes ?? 0), 0)).toBe(crm.base.total);
      expect(crm.segmentos.reduce((s, x) => s + (x.comOptIn ?? 0), 0)).toBe(crm.base.comOptIn);
      for (const d of crm.disparos) {
        const seg = crm.segmentos.find((s) => s.nome === d.nomeSegmento)!;
        expect(d.enviados).toBeLessThanOrEqual(seg.comOptIn ?? 0);
      }
      for (const p of crm.proximos) expect((p.disparaveis ?? 0) + (p.foraDoDisparo ?? 0)).toBe(crm.segmentos.find((s) => s.nome === p.nomeSegmento)!.clientes);
    });

    it("pilares 4 a 6: totais batem e a mensagem cabe em 12 linhas", async () => {
      for (const { id } of PERIODOS) {
        const l = await getLucro(SLUG, id);
        const hoje = await getHoje(SLUG, id);
        expect(l.porCanal.reduce((s, c) => s + c.margem, 0)).toBeCloseTo(l.margem.valor, 4);
        expect(l.porCanal.reduce((s, c) => s + c.faturamento, 0)).toBeGreaterThan(0);
        const wa = await getWhatsapp(SLUG, id);
        expect(wa.pedidos.atual).toBeLessThanOrEqual(wa.conversas.atual);
        expect(wa.vendaSugestiva.aceitas).toBeLessThanOrEqual(wa.vendaSugestiva.sugestoes);
        expect(wa.conversasRecentes.every((c) => /^Cliente \d+$/.test(c.cliente))).toBe(true); // nunca nome real
        const m = await getMetricas(SLUG, id);
        expect(m.mensagem.split("\n").length).toBeLessThanOrEqual(12);
        expect(m.mensagem).toContain(hoje.comanda.alerta!.texto);
      }
    });

    it("o plano de ação chega com as ações padrão da comanda", async () => {
      const plano = await getPlano(SLUG);
      expect(plano.acoesPadrao.length).toBeGreaterThan(0);
      expect(plano.acoes.every((a) => ["a_fazer", "fazendo", "feito"].includes(a.situacao))).toBe(true);
    });
  });
