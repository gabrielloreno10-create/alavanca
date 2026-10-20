/**
 * Período e marca moram na URL (`?periodo=7d&marca=Jerry's Burger`), não em estado de
 * cliente: o servidor já sabe o que consultar, o link é compartilhável e o "voltar" do
 * navegador funciona.
 *
 * Fica fora de componente de propósito: o servidor também precisa ler estes valores, e
 * módulo marcado com "use client" não pode ser chamado no servidor.
 */
import { PERIODOS, type Periodo } from "./types";

export const PERIODO_PADRAO: Periodo = "7d";
export const MARCA_PADRAO = "todas";

type Valor = string | string[] | undefined | null;

export function lerPeriodo(valor: Valor): Periodo {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return PERIODOS.some((p) => p.id === v) ? (v as Periodo) : PERIODO_PADRAO;
}

export function lerMarca(valor: Valor): string {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v && v.trim() ? v : MARCA_PADRAO;
}

/** Mantém os filtros ao trocar de área ou de cliente. */
export function comFiltros(href: string, periodo: Periodo, operacao: string): string {
  const p = new URLSearchParams();
  if (periodo !== PERIODO_PADRAO) p.set("periodo", periodo);
  if (operacao !== MARCA_PADRAO) p.set("marca", operacao);
  const busca = p.toString();
  return busca ? `${href}?${busca}` : href;
}
