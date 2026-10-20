/**
 * Escolhe a origem dos dados: Postgres quando há DATABASE_URL, senão os JSON de semente.
 *
 * O fallback é EXPLÍCITO de propósito: `modoDaFonte()` é mostrado no painel e avisado no
 * console uma vez por processo. Ninguém deve descobrir por acidente que está olhando a
 * semente em vez do banco.
 */
import { temBanco } from "@/lib/db";
import { fontePostgres } from "./postgres";
import { fonteSeed } from "./seed";
import type { Acesso, Fonte, ModoFonte, Pacote, Pedido, TenantResumo } from "./tipos";

export type { Acesso, Bloco, ModoFonte, Pacote, Pedido, TenantResumo } from "./tipos";

let avisou = false;

export function modoDaFonte(): ModoFonte {
  return temBanco() ? "postgres" : "seed";
}

function fonte(): Fonte {
  const modo = modoDaFonte();
  if (modo === "seed" && !avisou) {
    avisou = true;
    console.warn(
      "[alavanca] DATABASE_URL não definida: o painel está lendo os JSON de semente em src/data/clientes/, não o Postgres. " +
        "Isto é um modo de fallback para desenvolvimento e teste.",
    );
  }
  return modo === "postgres" ? fontePostgres : fonteSeed;
}

export function listarTenants(acesso: Acesso): Promise<TenantResumo[]> {
  return fonte().listarTenants(acesso);
}

export function carregar(slug: string, pedido: Pedido, acesso: Acesso): Promise<Pacote | null> {
  return fonte().carregar(slug, pedido, acesso);
}
