import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { modoDaFonte } from "@/lib/dados";
import { loginDisponivel } from "@/lib/usuarios";
import { FormEntrar } from "./FormEntrar";

export const metadata: Metadata = { title: "Entrar" };

export default function PaginaEntrar({ searchParams }: PageProps<"/entrar">) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-[420px] content-center gap-6 px-4 py-10">
      <Logo />
      <div className="grid gap-4 rounded-painel border border-linha bg-papel p-6">
        <div className="grid gap-1">
          <h1 className="font-display text-xl font-semibold text-grafite">Entrar no painel</h1>
          <p className="text-sm text-grafite-2">Acesso do time da Tapaggo e dos donos dos restaurantes.</p>
        </div>
        <Suspense fallback={<p className="text-sm text-grafite-2">Carregando…</p>}>
          <Conteudo searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<{ de?: string | string[] }> }) {
  const sp = await searchParams;
  const de = Array.isArray(sp.de) ? sp.de[0] : sp.de;

  if (!loginDisponivel()) {
    return (
      <p role="alert" className="rounded-botao border border-linha bg-bancada px-3 py-2 text-sm text-grafite">
        Não há como autenticar: defina <code>DATABASE_URL</code> e cadastre um usuário com{" "}
        <code>npm run criar-admin</code>, ou, sem banco, defina <code>ALAVANCA_SEED_ADMIN_EMAIL</code> e{" "}
        <code>ALAVANCA_SEED_ADMIN_SENHA_HASH</code>.
      </p>
    );
  }

  return (
    <>
      <FormEntrar de={de ?? "/"} />
      {modoDaFonte() === "seed" ? (
        <p className="text-sm text-grafite-2">
          Sem <code>DATABASE_URL</code>: o painel vai abrir com os dados de semente, não com o banco.
        </p>
      ) : null}
    </>
  );
}
