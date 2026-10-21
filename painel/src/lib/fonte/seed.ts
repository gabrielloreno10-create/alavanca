/**
 * Fonte de FALLBACK: os JSON de semente em src/data/clientes/<slug>/.
 *
 * Existe por um motivo só: sem DATABASE_URL o painel precisa abrir e os testes precisam
 * rodar. Não é modo de produção. Quem usa isto é avisado por `modoDaFonte()`, que o
 * painel mostra na tela e os scripts imprimem no console.
 *
 * Lê do disco em tempo de execução (não por import estático): foi assim que o
 * src/data/clientes/index.ts pôde sair e as rotas virarem dinâmicas.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { somarDias } from "@/lib/calculos";
import type {
  AcaoSugerida,
  CanalProprio,
  Cliente,
  Crm,
  DiaVendas,
  Ifood,
  Lucro,
  Metricas,
  Origem,
  Plano,
  TipoAlerta,
  Whatsapp,
} from "@/lib/types";
import type { Acesso, Fonte, Pacote, Pedido, TenantResumo } from "./tipos";

/*
 * Os `turbopackIgnore` abaixo existem porque o caminho destas leituras só se conhece em
 * tempo de execução; sem eles o Turbopack rastreia o projeto inteiro e empacota tudo.
 * Só o modo de semente lê disco — no modo postgres nenhuma destas funções é chamada.
 */
function pasta(): string | null {
  const candidatos = [
    join(process.cwd(), "src", "data", "clientes"),
    join(process.cwd(), "painel", "src", "data", "clientes"),
  ];
  const aqui = typeof import.meta.dirname === "string" ? import.meta.dirname : null;
  if (aqui) candidatos.push(join(aqui, "..", "..", "data", "clientes"));
  return candidatos.find((p) => existsSync(/*turbopackIgnore: true*/ p)) ?? null;
}

interface PacoteBruto {
  cliente: Cliente;
  metricas: Metricas;
  ifood: Ifood;
  canalProprio: CanalProprio;
  crm: Crm;
  whatsapp: Whatsapp;
  lucro: Lucro;
  plano: Plano;
}

const cache = new Map<string, PacoteBruto>();

function ler<T>(dir: string, arquivo: string): T {
  return JSON.parse(readFileSync(/*turbopackIgnore: true*/ join(dir, arquivo), "utf-8")) as T;
}

/**
 * Os JSON de semente foram escritos quando ausencia nao existia: campo que falta vinha
 * como `undefined`, e `undefined` nao e `null` — ele passa batido pelas checagens
 * `=== null` e reaparece como NaN la na frente. Aqui tudo que falta vira `null`
 * explicito, para o modo de semente obedecer ao mesmo contrato do Postgres.
 */
const ouNulo = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function normalizarIfood(j: Ifood): Ifood {
  return {
    ...j,
    comissaoPct: ouNulo(j.comissaoPct),
    taxaPagamentoPct: ouNulo(j.taxaPagamentoPct),
    embalagemPorItem: ouNulo(j.embalagemPorItem),
    takeRatePct: ouNulo(j.takeRatePct),
    takeRateMes: j.takeRateMes ?? null,
    takeRateVendasBrutas: ouNulo(j.takeRateVendasBrutas),
    operacaoDia: (j.operacaoDia ?? []).map((o) => ({
      data: o.data,
      nota: ouNulo(o.nota),
      tempoEntregaMin: ouNulo(o.tempoEntregaMin),
      cancelados: ouNulo(o.cancelados),
    })),
  };
}

/**
 * As acoes sugeridas sao string nos JSON; o contrato agora pede { texto, origem }.
 * A origem de cada uma e a do arquivo inteiro, que e o que a semente sabe dizer.
 */
function normalizarPlano(j: Plano): Plano {
  const origem: Origem = j.origem === "REAL" ? "REAL" : "EXEMPLO";
  const acao = (x: string | AcaoSugerida): AcaoSugerida => (typeof x === "string" ? { texto: x, origem } : x);
  const vazio: Record<TipoAlerta, AcaoSugerida[]> = { meta: [], margem: [], pedidos: [], ifood: [], ticket: [] };
  const porAlerta = { ...vazio };
  for (const k of Object.keys(vazio) as TipoAlerta[]) {
    porAlerta[k] = ((j.acoesPorAlerta?.[k] ?? []) as (string | AcaoSugerida)[]).map(acao);
  }
  return {
    ...j,
    acoesPorAlerta: porAlerta,
    acoesPadrao: ((j.acoesPadrao ?? []) as (string | AcaoSugerida)[]).map(acao),
  };
}

function carregarBruto(slug: string): PacoteBruto | null {
  const guardado = cache.get(slug);
  if (guardado) return guardado;
  const raiz = pasta();
  if (!raiz) return null;
  const dir = join(/*turbopackIgnore: true*/ raiz, slug);
  if (!existsSync(/*turbopackIgnore: true*/ join(dir, "cliente.json"))) return null;
  const p: PacoteBruto = {
    cliente: ler<Cliente>(dir, "cliente.json"),
    metricas: ler<Metricas>(dir, "metricas.json"),
    ifood: normalizarIfood(ler<Ifood>(dir, "ifood.json")),
    canalProprio: (() => {
      const cp = ler<CanalProprio>(dir, "canal-proprio.json");
      return { ...cp, metaPctCanalProprio: ouNulo(cp.metaPctCanalProprio) };
    })(),
    crm: ler<Crm>(dir, "crm.json"),
    whatsapp: ler<Whatsapp>(dir, "whatsapp.json"),
    lucro: ler<Lucro>(dir, "lucro.json"),
    plano: normalizarPlano(ler<Plano>(dir, "plano.json")),
  };
  cache.set(slug, p);
  return p;
}

function slugs(): string[] {
  const raiz = pasta();
  if (!raiz) return [];
  return readdirSync(/*turbopackIgnore: true*/ raiz)
    .filter((n) => {
      const dir = join(/*turbopackIgnore: true*/ raiz, n);
      return (
        statSync(/*turbopackIgnore: true*/ dir).isDirectory() &&
        existsSync(/*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ dir, "cliente.json"))
      );
    })
    .sort();
}

/** Mesmo recorte de janela que o modo postgres faz no SQL. */
function recortarJanela(dias: DiaVendas[], pedido: Pedido, ultimoDia: string | null): { dias: DiaVendas[]; offset: number } {
  if (pedido.dias === "tudo" || !ultimoDia) return { dias, offset: 0 };
  const inicio = somarDias(ultimoDia, -(pedido.dias - 1));
  return {
    dias: dias.filter((d) => d.data >= inicio && d.data <= ultimoDia),
    offset: dias.filter((d) => d.data < inicio).length,
  };
}

export const fonteSeed: Fonte = {
  modo: "seed",

  async listarTenants(acesso: Acesso): Promise<TenantResumo[]> {
    const permitidos = acesso.tenants?.length ? new Set(acesso.tenants.map((t) => t.slug)) : null;
    return slugs()
      .filter((s) => !permitidos || permitidos.has(s))
      .flatMap((s) => {
        const p = carregarBruto(s);
        return p ? [{ tenantId: s, slug: s, nome: p.cliente.nome, segmento: p.cliente.segmento ?? null }] : [];
      });
  },

  async carregar(slug: string, pedido: Pedido): Promise<Pacote | null> {
    const p = carregarBruto(slug);
    if (!p) return null;
    const todos = p.metricas.dias;
    const ultimoDia = todos.length ? todos[todos.length - 1].data : null;
    const { dias, offset } = recortarJanela(todos, pedido, ultimoDia);
    return {
      cliente: p.cliente,
      ultimoDia,
      offsetDias: offset,
      metricas: { ...p.metricas, dias },
      ifood: p.ifood,
      canalProprio: p.canalProprio,
      crm: p.crm,
      whatsapp: p.whatsapp,
      lucro: p.lucro,
      plano: p.plano,
    };
  },
};
