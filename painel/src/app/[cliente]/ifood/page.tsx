import type { Metadata } from "next";
import { Suspense } from "react";
import { Carregando } from "@/components/Carregando";
import { IfoodTela } from "@/components/IfoodTela";
import { getIfood } from "@/lib/dados";
import { contextoDaTela, ou404 } from "@/lib/pagina";

export const metadata: Metadata = { title: "Vendas no iFood" };

export default function Pagina({ params, searchParams }: PageProps<"/[cliente]/ifood">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ params, searchParams }: PageProps<"/[cliente]/ifood">) {
  const { cliente } = await params;
  const { periodo, marca, acesso } = await contextoDaTela(cliente, "/ifood", searchParams);
  const visao = await ou404(getIfood(cliente, periodo, marca, acesso));
  return <IfoodTela visao={visao} />;
}
