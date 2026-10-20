import type { Metadata } from "next";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { sair } from "@/app/entrar/acoes";
import { Carregando } from "@/components/Carregando";
import { Logo } from "@/components/Logo";
import { RestaurantesTela } from "@/components/RestaurantesTela";
import { getRestaurantes, modoDaFonte } from "@/lib/dados";
import { acessoDe, exigirSessao } from "@/lib/sessao";

export const metadata: Metadata = { title: "Todos os restaurantes" };

export default function Raiz() {
  return (
    <main className="mx-auto grid max-w-[1200px] gap-6 px-4 py-6 lg:px-8 lg:py-10">
      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </main>
  );
}

async function Conteudo() {
  const sessao = await exigirSessao("/");
  const restaurantes = await getRestaurantes(acessoDe(sessao));

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Logo />
        <div className="flex items-center gap-2 text-sm text-grafite-2">
          <span>{sessao.nome}</span>
          <form action={sair}>
            <button type="submit" className="grid size-9 place-items-center rounded-botao text-grafite-2 hover:text-grafite">
              <LogOut aria-hidden className="size-4" />
              <span className="sr-only">Sair</span>
            </button>
          </form>
        </div>
      </header>

      <div className="grid gap-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-grafite">Todos os restaurantes</h1>
        <p className="text-base text-grafite-2">
          O último dia fechado de cada grupo, o alerta mais grave e como estão os 6 pilares.
        </p>
        {modoDaFonte() === "seed" ? (
          <p className="mt-2 rounded-botao border border-linha bg-papel px-3 py-2 text-sm text-grafite">
            Modo de semente: sem <code>DATABASE_URL</code>, estes números vêm dos JSON de exemplo, não do banco.
          </p>
        ) : null}
      </div>

      <RestaurantesTela restaurantes={restaurantes} />
    </>
  );
}
