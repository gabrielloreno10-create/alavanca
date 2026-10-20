import type { Metadata } from "next";
import { Suspense } from "react";
import { Carregando } from "@/components/Carregando";
import { MetricasTela } from "@/components/MetricasTela";
import { getMetricas } from "@/lib/dados";
import { contextoDaTela, ou404 } from "@/lib/pagina";

export const metadata: Metadata = { title: "Métricas diárias" };

export default function Pagina({ params, searchParams }: PageProps<"/[cliente]/metricas">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ params, searchParams }: PageProps<"/[cliente]/metricas">) {
  const { cliente } = await params;
  const { periodo, marca, acesso } = await contextoDaTela(cliente, "/metricas", searchParams);
  const visao = await ou404(getMetricas(cliente, periodo, marca, acesso));
  return <MetricasTela visao={visao} />;
}
