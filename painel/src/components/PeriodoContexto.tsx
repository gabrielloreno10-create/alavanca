"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { lerMarca, lerPeriodo, MARCA_PADRAO, PERIODO_PADRAO } from "@/lib/filtros";
import type { Periodo } from "@/lib/types";

export { comFiltros, MARCA_PADRAO, PERIODO_PADRAO } from "@/lib/filtros";

/**
 * Lê os filtros da URL e devolve os setters, que navegam em vez de guardar estado.
 * Precisa de um <Suspense> acima: useSearchParams é leitura de request.
 */
export function usePeriodo() {
  const parametros = useSearchParams();
  const router = useRouter();
  const caminho = usePathname();

  const trocar = (chave: "periodo" | "marca", valor: string, padrao: string) => {
    const p = new URLSearchParams(parametros.toString());
    if (valor === padrao) p.delete(chave);
    else p.set(chave, valor);
    const busca = p.toString();
    router.push(busca ? `${caminho}?${busca}` : caminho);
  };

  return {
    periodo: lerPeriodo(parametros.get("periodo")),
    setPeriodo: (p: Periodo) => trocar("periodo", p, PERIODO_PADRAO),
    operacao: lerMarca(parametros.get("marca")),
    setOperacao: (o: string) => trocar("marca", o, MARCA_PADRAO),
  };
}
