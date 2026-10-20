import type { Metadata } from "next";
import { Suspense } from "react";
import { Carregando } from "@/components/Carregando";
import { PlanoTela } from "@/components/PlanoTela";
import { getDataReferencia, getPlano } from "@/lib/dados";
import { contextoDaTela, ou404 } from "@/lib/pagina";

export const metadata: Metadata = { title: "Plano de ação" };

export default function Pagina({ params }: PageProps<"/[cliente]/plano">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/[cliente]/plano">["params"] }) {
  const { cliente } = await params;
  const { acesso } = await contextoDaTela(cliente, "/plano");
  const [plano, hoje] = await ou404(Promise.all([getPlano(cliente, acesso), getDataReferencia(cliente, acesso)]));
  return <PlanoTela plano={plano} hoje={hoje} />;
}
