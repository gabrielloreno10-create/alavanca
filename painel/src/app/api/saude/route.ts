/**
 * /api/saude — verificação de vida, para o provedor e para quem está de plantão.
 *
 * Não exige sessão (um health check com login não serve para nada) e por isso não diz
 * NADA: só se o processo respondeu, se o banco respondeu e em quanto tempo. Nunca versão
 * de Postgres, nome de host, nome de banco, contagem de linha ou texto de erro — isso é
 * reconhecimento de alvo de graça. O erro de verdade vai para o log do servidor.
 *
 * 200 só quando o banco responde. Qualquer outra coisa é 503: um "ok" com o banco fora
 * seria mentira exatamente na hora em que a verdade importa.
 */
import { connection } from "next/server";
import { SemBanco, sql } from "@/lib/db";

export const runtime = "nodejs";

/** Teto para a função não ficar pendurada se o banco aceitar a conexão e nunca responder. */
const LIMITE_MS = 4000;

type EstadoDoBanco = "ok" | "erro" | "ausente";

function semTempo<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const relogio = setTimeout(() => reject(new Error(`sem resposta em ${ms}ms`)), ms);
    promessa.then(resolve, reject).finally(() => clearTimeout(relogio));
  });
}

async function consultarBanco(): Promise<EstadoDoBanco> {
  try {
    await semTempo(sql()`select 1`, LIMITE_MS);
    return "ok";
  } catch (erro) {
    if (erro instanceof SemBanco) return "ausente";
    // Só no log do servidor. A resposta não carrega detalhe de erro.
    console.error("[alavanca] /api/saude: o banco não respondeu.", erro);
    return "erro";
  }
}

export async function GET(): Promise<Response> {
  // Marca a rota como de tempo de request: health check não se prerenderiza no build
  // (e o build não pode tentar abrir conexão com o banco de produção).
  await connection();

  const inicio = Date.now();
  const banco = await consultarBanco();
  const ms = Date.now() - inicio;
  const ok = banco === "ok";

  return Response.json(
    { ok, banco, ms },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
    },
  );
}
