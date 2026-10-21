/**
 * Conexão com o Postgres da plataforma.
 *
 * Regras que não se negociam (docs/modelo-dados.md, seção 3.2):
 *  - conectar SEMPRE com a role `alavanca_app` (nunca a owner: superuser passa por cima da RLS);
 *  - cada request abre UMA transação e seta `app.tenant_id` como primeira instrução;
 *  - o terceiro argumento de set_config é `true` = LOCAL à transação. Sem ele o valor
 *    gruda na conexão do pool e a próxima request de outro cliente lê o tenant errado.
 *
 * Dois mundos, um arquivo (ver `opcoesDeConexao`):
 *  - desenvolvimento: processo longo, Postgres em 127.0.0.1, pool de 5, sem TLS;
 *  - serverless (Vercel): processo curto e muitas instâncias, pool de 1 por instância,
 *    TLS obrigatório e prepared statement DESLIGADO — a string "pooled" dos provedores
 *    é um PgBouncer em modo transaction, onde statement preparado não sobrevive de uma
 *    transação para a outra.
 * O padrão de cada opção é escolhido pelo ambiente; toda uma delas pode ser forçada por
 * variável (documentadas em .env.example). O comportamento local de hoje não muda.
 */
import postgres from "postgres";
import { bancoLocal, emServerless, inteiroPositivo, parametroDaUrl, type Env } from "@/lib/ambiente";

/** Lançada quando se pede o banco sem DATABASE_URL configurada. */
export class SemBanco extends Error {
  constructor(
    detalhe = "DATABASE_URL não está definida. Em desenvolvimento, suba o banco embarcado " +
      "(db/dev) e copie a URL para painel/.env.local; em produção, defina DATABASE_URL no provedor.",
  ) {
    super(`Banco indisponível: ${detalhe}`);
    this.name = "SemBanco";
  }
}

export type Tx = postgres.TransactionSql<Record<string, never>>;
export type Sql = postgres.Sql<Record<string, never>>;

/**
 * O que o driver aceita em `ssl`. `require` cifra sem validar o certificado (é o
 * `sslmode=require` do libpq); `verify-full` cifra E valida contra as CAs do sistema.
 */
export type ModoSsl = false | "allow" | "prefer" | "require" | "verify-full";

export interface OpcoesDeConexao {
  max: number;
  idle_timeout: number;
  connect_timeout: number;
  prepare: boolean;
  ssl: ModoSsl;
}

let cache: Sql | null | undefined;

export function urlDoBanco(env: Env = process.env): string | null {
  const u = env.DATABASE_URL?.trim();
  return u ? u : null;
}

export function temBanco(env: Env = process.env): boolean {
  return urlDoBanco(env) !== null;
}

/**
 * TLS. Local: dispensado. Remoto: obrigatório, e isto vale MAIS do que o `sslmode` que
 * vier na URL — provedor nenhum deve conseguir nos rebaixar para texto em claro por um
 * parâmetro de query. A URL só é obedecida para cima (verify-full continua verify-full).
 * `DATABASE_SSL` força qualquer modo, inclusive `disable` para rede privada.
 */
export function modoSsl(url: string, env: Env = process.env): ModoSsl {
  const forcado = (env.DATABASE_SSL ?? "").trim().toLowerCase();
  if (forcado) {
    if (["disable", "disabled", "off", "false", "0", "no", "nao", "não"].includes(forcado)) return false;
    if (["verify-full", "verify-ca", "verify"].includes(forcado)) return "verify-full";
    if (forcado === "prefer") return "prefer";
    if (forcado === "allow") return "allow";
    if (["require", "required", "on", "true", "1", "sim", "yes"].includes(forcado)) return "require";
    throw new Error(`DATABASE_SSL inválida: "${env.DATABASE_SSL}". Use require, verify-full, prefer, allow ou disable.`);
  }

  if (bancoLocal(url)) return false;

  const pedido = (parametroDaUrl(url, "sslmode") ?? parametroDaUrl(url, "ssl") ?? "").toLowerCase();
  if (parametroDaUrl(url, "sslrootcert") === "system" || pedido === "verify-full" || pedido === "verify-ca") {
    return "verify-full";
  }
  return "require";
}

/**
 * Padrões por ambiente, cada um com escape por variável.
 *
 * | opção           | local | serverless | variável                  |
 * |-----------------|-------|-----------|---------------------------|
 * | max             | 5     | 1         | DATABASE_POOL_MAX         |
 * | idle_timeout    | 20s   | 10s       | DATABASE_IDLE_TIMEOUT     |
 * | connect_timeout | 10s   | 5s        | DATABASE_CONNECT_TIMEOUT  |
 * | prepare         | sim   | não       | DATABASE_PREPARE          |
 *
 * `max: 1` em serverless não é pessimismo: cada instância da função tem o pool dela, e
 * o teto de conexões de um Postgres gerenciado de plano gratuito é baixo. O limite de
 * concorrência real fica no pooler do provedor, não aqui.
 * `connect_timeout` curto para a função não ficar pendurada esperando um banco que não
 * vai responder — melhor errar em 5s do que estourar o tempo da invocação.
 */
export function opcoesDeConexao(url: string, env: Env = process.env): OpcoesDeConexao {
  const serverless = emServerless(env);
  return {
    max: inteiroPositivo(env.DATABASE_POOL_MAX) ?? (serverless ? 1 : 5),
    idle_timeout: inteiroPositivo(env.DATABASE_IDLE_TIMEOUT) ?? (serverless ? 10 : 20),
    connect_timeout: inteiroPositivo(env.DATABASE_CONNECT_TIMEOUT) ?? (serverless ? 5 : 10),
    prepare: bandeiraPrepare(env) ?? !serverless,
    ssl: modoSsl(url, env),
  };
}

function bandeiraPrepare(env: Env): boolean | null {
  const v = (env.DATABASE_PREPARE ?? "").trim().toLowerCase();
  if (!v) return null;
  if (["1", "true", "on", "sim", "yes"].includes(v)) return true;
  if (["0", "false", "off", "nao", "não", "no"].includes(v)) return false;
  throw new Error(`DATABASE_PREPARE inválida: "${env.DATABASE_PREPARE}". Use 1 ou 0.`);
}

export function sql(): Sql {
  if (cache === undefined) {
    const url = urlDoBanco();
    cache = url
      ? postgres(url, {
          ...opcoesDeConexao(url),
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
