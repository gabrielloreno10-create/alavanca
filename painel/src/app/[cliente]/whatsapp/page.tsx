import type { Metadata } from "next";
import { Suspense } from "react";
import { Carregando } from "@/components/Carregando";
import { WhatsappTela } from "@/components/WhatsappTela";
import { getWhatsapp } from "@/lib/dados";
import { contextoDaTela, ou404 } from "@/lib/pagina";

export const metadata: Metadata = { title: "Vendedor IA no WhatsApp" };

export default function Pagina({ params, searchParams }: PageProps<"/[cliente]/whatsapp">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ params, searchParams }: PageProps<"/[cliente]/whatsapp">) {
  const { cliente } = await params;
  const { periodo, marca, acesso } = await contextoDaTela(cliente, "/whatsapp", searchParams);
  const visao = await ou404(getWhatsapp(cliente, periodo, marca, acesso));
  return <WhatsappTela visao={visao} />;
}
