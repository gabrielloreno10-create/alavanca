import type { Metadata } from "next";
import { Suspense } from "react";
import { Carregando } from "@/components/Carregando";
import { CanalProprioTela } from "@/components/CanalProprioTela";
import { getCanalProprio } from "@/lib/dados";
import { contextoDaTela, ou404 } from "@/lib/pagina";

export const metadata: Metadata = { title: "Canal próprio" };

export default function Pagina({ params, searchParams }: PageProps<"/[cliente]/canal-proprio">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ params, searchParams }: PageProps<"/[cliente]/canal-proprio">) {
  const { cliente } = await params;
  const { periodo, marca, acesso } = await contextoDaTela(cliente, "/canal-proprio", searchParams);
  const visao = await ou404(getCanalProprio(cliente, periodo, marca, acesso));
  return <CanalProprioTela visao={visao} />;
}
