/**
 * Contrato entre as telas (src/lib/dados.ts) e a origem dos dados.
 *
 * Duas implementações:
 *  - `postgres.ts`: o banco da plataforma, por tenant, com RLS. É o modo de produção.
 *  - `seed.ts`: os JSON de src/data/clientes/<slug>/. Modo de FALLBACK, usado só quando
 *    DATABASE_URL não está definida. Serve para o painel abrir e para os testes rodarem
 *    sem Postgres no ar. Nunca é silencioso: `modoDaFonte()` diz qual está valendo e o
 *    painel marca a tela.
 */
import type { CanalProprio, Cliente, Crm, Ifood, Lucro, Metricas, Periodo, Plano, Whatsapp } from "@/lib/types";

export type ModoFonte = "postgres" | "seed";

/** Quem está pedindo. Em modo postgres é o que permite resolver o tenant e setar app.usuario_id. */
export interface Acesso {
  usuarioId: string | null;
  /** tenants que a sessão pode abrir; em modo seed pode vir vazio (tudo é liberado) */
  tenants?: { tenantId: string; slug: string }[];
}

export interface TenantResumo {
  tenantId: string;
  slug: string;
  nome: string;
  segmento: string | null;
}

/** Blocos de dado que uma tela precisa. O modo postgres só consulta o que entra aqui. */
export type Bloco = "vendas" | "ifood" | "midia" | "crm" | "whatsapp" | "cardapio" | "plano";

export interface Pedido {
  periodo: Periodo;
  /**
   * Quantos dias para trás do último dia fechado carregar; "tudo" = a série inteira
   * (só a tela de Métricas, que desenha o calendário mês a mês).
   * Quem resolve a janela é a fonte, porque só ela sabe qual é o último dia fechado.
   */
  dias: number | "tudo";
  blocos: Bloco[];
}

/**
 * O que a origem devolve. É o mesmo formato que o painel já consumia dos JSON, só que
 * recortado na janela pedida — nada de pré-computar todas as visões.
 */
export interface Pacote {
  cliente: Cliente;
  /** último dia fechado do tenant, independente da janela carregada; null = sem venda nenhuma */
  ultimoDia: string | null;
  /** dias de venda que existem ANTES do primeiro dia da janela (para numerar a comanda) */
  offsetDias: number;
  metricas: Metricas;
  ifood: Ifood;
  canalProprio: CanalProprio;
  crm: Crm;
  whatsapp: Whatsapp;
  lucro: Lucro;
  plano: Plano;
}

export interface Fonte {
  modo: ModoFonte;
  listarTenants(acesso: Acesso): Promise<TenantResumo[]>;
  carregar(slug: string, pedido: Pedido, acesso: Acesso): Promise<Pacote | null>;
}
