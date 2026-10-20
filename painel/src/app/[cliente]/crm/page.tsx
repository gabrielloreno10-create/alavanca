import type { Metadata } from "next";
import { Suspense } from "react";
import { Carregando } from "@/components/Carregando";
import { CrmTela } from "@/components/CrmTela";
import { getCrm } from "@/lib/dados";
import { contextoDaTela, ou404 } from "@/lib/pagina";

export const metadata: Metadata = { title: "CRM sniper" };

export default function Pagina({ params, searchParams }: PageProps<"/[cliente]/crm">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ params, searchParams }: PageProps<"/[cliente]/crm">) {
  const { cliente } = await params;
  const { periodo, marca, acesso } = await contextoDaTela(cliente, "/crm", searchParams);
  const visao = await ou404(getCrm(cliente, periodo, marca, acesso));
  return <CrmTela visao={visao} />;
}
