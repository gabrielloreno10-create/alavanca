/**
 * Conexão com o Postgres da plataforma.
 *
 * Regras que não se negociam (docs/modelo-dados.md, seção 3.2):
 *  - conectar SEMPRE com a role `alavanca_app` (nunca a owner: superuser passa por cima da RLS);
 *  - cada request abre UMA transação e seta `app.tenant_id` como primeira instrução;
 *  - o terceiro argumento de set_config é `true` = LOCAL à transação. Sem ele o valor
 *    gruda na conexão do pool e a próxima request de outro cliente lê o tenant errado.
 */
import postgres from "postgres";

/** Lançada quando se pede o banco sem DATABASE_URL configurada. */
export class SemBanco extends Error {
  constructor(detalhe = "DATABASE_URL não está definida") {
    super(`Banco indisponível: ${detalhe}`);
    this.name = "SemBanco";
  }
}

export type Tx = postgres.TransactionSql<Record<string, never>>;
export type Sql = postgres.Sql<Record<string, never>>;

let cache: Sql | null | undefined;

export function urlDoBanco(): string | null {
  const u = process.env.DATABASE_URL?.trim();
  return u ? u : null;
}

export function temBanco(): boolean {
  return urlDoBanco() !== null;
}

export function sql(): Sql {
  if (cache === undefined) {
    const url = urlDoBanco();
    cache = url
      ? postgres(url, {
          max: Number(process.env.DATABASE_POOL_MAX ?? 5),
          idle_timeout: 20,
          connect_timeout: 10,
          // Tudo que o painel lê é convertido para number/text no próprio SELECT
          // (::float8, ::text), então não há parser customizado aqui.
          onnotice: () => {},
        })
      : null;
  }
  if (!cache) throw new SemBanco();
  return cache;
}

/** Fecha o pool. Só para scripts de linha de comando; o painel não chama. */
export async function fechar(): Promise<void> {
  if (cache) await cache.end({ timeout: 5 });
  cache = undefined;
}

async function setar(tx: Tx, chave: "app.tenant_id" | "app.usuario_id", valor: string): Promise<void> {
  // set_config(chave, valor, true) => LOCAL à transação.
  await tx`select set_config(${chave}, ${valor}, true)`;
}

/**
 * Troca de role dentro da transação. Só é usada em desenvolvimento.
 *
 * Em produção a conexão JÁ é da role `alavanca_app` e esta função não faz nada. Ela
 * existe porque o banco embarcado de desenvolvimento (db/dev) tem um usuário só, e ele
 * é superuser: sem trocar de role, a RLS não barraria nada e o dev mentiria para nós.
 * Defina ALAVANCA_DB_ROLE=alavanca_app no .env.local para ligar.
 */
async function assumirRole(tx: Tx): Promise<void> {
  const role = process.env.ALAVANCA_DB_ROLE?.trim();
  if (!role) return;
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) {
    throw new Error(`ALAVANCA_DB_ROLE inválida: ${role}`);
  }
  // Identificador não aceita bind param; o regex acima é a barreira.
  await tx.unsafe(`set local role ${role}`);
}

/** Transação com o tenant setado. Tudo que lê dado de negócio passa por aqui. */
export async function comTenant<T>(tenantId: string, usuarioId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = sql();
  return db.begin(async (tx) => {
    await assumirRole(tx as Tx);
    await setar(tx as Tx, "app.tenant_id", tenantId);
    if (usuarioId) await setar(tx as Tx, "app.usuario_id", usuarioId);
    return fn(tx as Tx);
  }) as Promise<T>;
}

/**
 * Transação só com `app.usuario_id`. Serve para as tabelas globais (usuarios, papeis)
 * e para `usuario_tenant`, cuja policy aceita `usuario_id = app.usuario_id` — é assim
 * que o login descobre quais tenants a pessoa pode abrir ANTES de escolher um.
 */
export async function comUsuario<T>(usuarioId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = sql();
  return db.begin(async (tx) => {
    await assumirRole(tx as Tx);
    if (usuarioId) await setar(tx as Tx, "app.usuario_id", usuarioId);
    return fn(tx as Tx);
  }) as Promise<T>;
}
