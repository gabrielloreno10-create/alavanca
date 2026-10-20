/**
 * Cola entre a rota e a camada de dados: exige sessão, lê os filtros da URL e transforma
 * "cliente que não existe (ou que esta sessão não pode abrir)" em 404.
 */
import { notFound } from "next/navigation";
import { ClienteDesconhecido, type Acesso } from "./dados";
import { lerMarca, lerPeriodo } from "./filtros";
import { acessoAtual } from "./sessao";
import type { Periodo } from "./types";

type Busca = Record<string, string | string[] | undefined>;

export interface ContextoDaTela {
  periodo: Periodo;
  marca: string;
  acesso: Acesso;
  usuario: string;
}

export async function contextoDaTela(cliente: string, rota: string, searchParams?: Promise<Busca>): Promise<ContextoDaTela> {
  const sp = searchParams ? await searchParams : {};
  const { sessao, acesso } = await acessoAtual(`/${cliente}${rota}`);
  return { periodo: lerPeriodo(sp.periodo), marca: lerMarca(sp.marca), acesso, usuario: sessao.nome };
}

export async function ou404<T>(promessa: Promise<T>): Promise<T> {
  try {
    return await promessa;
  } catch (erro) {
    if (erro instanceof ClienteDesconhecido) notFound();
    throw erro;
  }
}
