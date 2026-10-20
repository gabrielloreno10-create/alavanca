/**
 * Acesso à tabela global `alavanca.usuarios` e ao vínculo `usuario_tenant`.
 * Só roda no servidor. Nenhuma senha é guardada aqui: só o hash, e só o banco o vê.
 *
 * `usuarios` e `papeis` são GLOBAIS (sem tenant_id, sem RLS por tenant).
 * `usuario_tenant` tem policy própria: tenant do request OU usuario_id = app.usuario_id,
 * que é justamente o que deixa o login listar os tenants antes de escolher um.
 */
import { compare } from "bcryptjs";
import { comUsuario, temBanco } from "./db";
import { modoDaFonte } from "./fonte";
import { fonteSeed } from "./fonte/seed";

export interface UsuarioAutenticado {
  id: string;
  nome: string;
  email: string;
}

export interface VinculoTenant {
  tenantId: string;
  slug: string;
  nome: string;
  papel: string;
}

/** Login do modo de semente: só existe quando NÃO há banco, e nunca com senha em arquivo. */
function credencialDeSemente(): { email: string; hash: string } | null {
  const email = process.env.ALAVANCA_SEED_ADMIN_EMAIL?.trim();
  const hash = process.env.ALAVANCA_SEED_ADMIN_SENHA_HASH?.trim();
  return email && hash ? { email, hash } : null;
}

export function loginDisponivel(): boolean {
  return temBanco() || credencialDeSemente() !== null;
}

export async function autenticar(email: string, senha: string): Promise<UsuarioAutenticado | null> {
  if (!email || !senha) return null;

  if (!temBanco()) {
    const c = credencialDeSemente();
    if (!c || c.email.toLowerCase() !== email.toLowerCase()) return null;
    return (await compare(senha, c.hash)) ? { id: "semente", nome: "Administrador (semente)", email: c.email } : null;
  }

  const [u] = await comUsuario(null, (tx) =>
    tx<{ id: string; nome: string; email: string; senha_hash: string | null; ativo: boolean }[]>`
      select id::text as id, nome, email, senha_hash, ativo
        from alavanca.usuarios
       where lower(email) = lower(${email})
    `,
  );
  if (!u || !u.ativo || !u.senha_hash) return null;
  if (!(await compare(senha, u.senha_hash))) return null;

  await comUsuario(u.id, (tx) => tx`update alavanca.usuarios set ultimo_login_em = now() where id = ${u.id}::uuid`);
  return { id: u.id, nome: u.nome, email: u.email };
}

/** Tenants que este usuário pode abrir. É o que vira `Acesso.tenants`. */
export async function tenantsDoUsuario(usuarioId: string): Promise<VinculoTenant[]> {
  if (modoDaFonte() === "seed") {
    // Sem banco não há vínculo: o admin de semente enxerga as pastas de semente.
    const tenants = await fonteSeed.listarTenants({ usuarioId });
    return tenants.map((t) => ({ tenantId: t.tenantId, slug: t.slug, nome: t.nome, papel: "platform_admin" }));
  }

  return comUsuario(usuarioId, async (tx) => {
    const vinculos = await tx<{ tenant_id: string; papel: string }[]>`
      select tenant_id::text as tenant_id, papel
        from alavanca.usuario_tenant
       where usuario_id = ${usuarioId}::uuid and ativo
    `;
    const out: VinculoTenant[] = [];
    for (const v of vinculos) {
      // set_config LOCAL: troca o tenant só dentro desta transação, uma volta por tenant.
      await tx`select set_config('app.tenant_id', ${v.tenant_id}, true)`;
      const [t] = await tx<{ slug: string; nome: string }[]>`
        select slug, nome from alavanca.tenants where id = ${v.tenant_id}::uuid and ativo
      `;
      if (t) out.push({ tenantId: v.tenant_id, slug: t.slug, nome: t.nome, papel: v.papel });
    }
    return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  });
}
