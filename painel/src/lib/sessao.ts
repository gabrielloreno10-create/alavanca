/**
 * Porta de entrada da sessão no servidor. Toda página com dado real passa por
 * `exigirSessao()` — o proxy faz só a checagem otimista do cookie, que não vale como
 * autorização (ver Next.js, "Optimistic checks with Proxy").
 */
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import type { Acesso } from "@/lib/fonte";
import type { VinculoTenant } from "@/lib/usuarios";

export interface Sessao {
  usuarioId: string;
  nome: string;
  email: string;
  tenants: VinculoTenant[];
}

export async function sessaoAtual(): Promise<Sessao | null> {
  // Marca o trecho como de tempo de request ANTES de tocar na sessão: com cacheComponents,
  // o Auth.js usa aleatoriedade (CSRF) e o prerender do shell estático reclamaria dela.
  await connection();
  const s = await auth();
  if (!s?.usuarioId) return null;
  return {
    usuarioId: s.usuarioId,
    nome: s.user?.name ?? "Sem nome",
    email: s.user?.email ?? "",
    tenants: s.tenants ?? [],
  };
}

/** Sem sessão, nada é respondido: manda para o login guardando para onde a pessoa ia. */
export async function exigirSessao(de?: string): Promise<Sessao> {
  const s = await sessaoAtual();
  if (!s) redirect(de ? `/entrar?de=${encodeURIComponent(de)}` : "/entrar");
  return s;
}

/** O contexto que a camada de dados precisa para resolver o tenant e setar app.usuario_id. */
export function acessoDe(s: Sessao): Acesso {
  return { usuarioId: s.usuarioId, tenants: s.tenants.map((t) => ({ tenantId: t.tenantId, slug: t.slug })) };
}

/** Atalho: exige sessão e já devolve o acesso. */
export async function acessoAtual(de?: string): Promise<{ sessao: Sessao; acesso: Acesso }> {
  const sessao = await exigirSessao(de);
  return { sessao, acesso: acessoDe(sessao) };
}
