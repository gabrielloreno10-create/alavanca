/**
 * Auth.js (next-auth v5) com provider de credenciais contra alavanca.usuarios.
 *
 * Sessão em JWT: carrega o id do usuário e os tenants que ele pode abrir, que é o que
 * o painel usa para resolver o [cliente] da rota e setar app.tenant_id na transação.
 * A senha nunca entra no token — só o hash existe, e só no banco.
 */
import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { autenticar, tenantsDoUsuario, type VinculoTenant } from "@/lib/usuarios";

// Referência só para o TypeScript enxergar o módulo que a augmentação abaixo estende.
export type TokenDoPainel = JWT;

declare module "next-auth" {
  interface Session {
    usuarioId: string;
    tenants: VinculoTenant[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    usuarioId?: string;
    tenants?: VinculoTenant[];
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/entrar", error: "/entrar" },
  providers: [
    Credentials({
      name: "E-mail e senha",
      credentials: { email: { label: "E-mail", type: "email" }, senha: { label: "Senha", type: "password" } },
      authorize: async (dados) => {
        const u = await autenticar(String(dados?.email ?? ""), String(dados?.senha ?? ""));
        return u ? { id: u.id, name: u.nome, email: u.email } : null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.usuarioId = user.id;
        token.tenants = await tenantsDoUsuario(user.id);
      }
      return token;
    },
    async session({ session, token }) {
      session.usuarioId = token.usuarioId ?? "";
      session.tenants = token.tenants ?? [];
      return session;
    },
  },
});
