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
import type { CanalProprio, Cliente, Crm, DiaVendas, Ifood, Lucro, Metricas, Plano, Whatsapp } from "@/lib/types";
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
    ifood: ler<Ifood>(dir, "ifood.json"),
    canalProprio: ler<CanalProprio>(dir, "canal-proprio.json"),
    crm: ler<Crm>(dir, "crm.json"),
    whatsapp: ler<Whatsapp>(dir, "whatsapp.json"),
    lucro: ler<Lucro>(dir, "lucro.json"),
    plano: ler<Plano>(dir, "plano.json"),
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
