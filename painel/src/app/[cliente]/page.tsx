import type { Metadata } from "next";
import { Suspense } from "react";
import { Carregando } from "@/components/Carregando";
import { HojeTela } from "@/components/HojeTela";
import { getHoje } from "@/lib/dados";
import { contextoDaTela, ou404 } from "@/lib/pagina";

export const metadata: Metadata = { title: "Hoje" };

export default function PaginaHoje({ params, searchParams }: PageProps<"/[cliente]">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ params, searchParams }: PageProps<"/[cliente]">) {
  const { cliente } = await params;
  const { periodo, marca, acesso, usuario } = await contextoDaTela(cliente, "", searchParams);
  const visao = await ou404(getHoje(cliente, periodo, marca, acesso));
  return <HojeTela slug={cliente} visao={visao} usuario={usuario} />;
}
