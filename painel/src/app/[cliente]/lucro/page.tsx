import type { Metadata } from "next";
import { Suspense } from "react";
import { Carregando } from "@/components/Carregando";
import { LucroTela } from "@/components/LucroTela";
import { getLucro } from "@/lib/dados";
import { contextoDaTela, ou404 } from "@/lib/pagina";

export const metadata: Metadata = { title: "Gestão de lucro" };

export default function Pagina({ params, searchParams }: PageProps<"/[cliente]/lucro">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ params, searchParams }: PageProps<"/[cliente]/lucro">) {
  const { cliente } = await params;
  const { periodo, marca, acesso } = await contextoDaTela(cliente, "/lucro", searchParams);
  const visao = await ou404(getLucro(cliente, periodo, marca, acesso));
  return <LucroTela visao={visao} />;
}
