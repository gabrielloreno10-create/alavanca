import { Suspense } from "react";
import { Carregando } from "@/components/Carregando";
import { Shell } from "@/components/Shell";
import { getOperacoes, listarClientes, modoDaFonte } from "@/lib/dados";
import { acessoAtual } from "@/lib/sessao";

/* Não há mais generateStaticParams: os clientes vêm do banco, por sessão, então a rota
   é dinâmica. A moldura fica atrás de um <Suspense> porque ela lê a sessão (cookie),
   que com cacheComponents não entra no shell estático. */
export default function LayoutCliente({ children }: LayoutProps<"/[cliente]">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Moldura>{children}</Moldura>
    </Suspense>
  );
}

async function Moldura({ children }: { children: React.ReactNode }) {
  const { sessao, acesso } = await acessoAtual();
  const clientes = await listarClientes(acesso);
  const operacoes = Object.fromEntries(
    await Promise.all(clientes.map(async (c) => [c.slug, await getOperacoes(c.slug, acesso)] as const)),
  );

  return (
    <Shell clientes={clientes} operacoes={operacoes} usuario={{ nome: sessao.nome }} modo={modoDaFonte()}>
      {children}
    </Shell>
  );
}
