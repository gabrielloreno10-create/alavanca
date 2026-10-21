import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight, CircleDashed, Minus } from "lucide-react";
import { NAO_MEDIDO, formatarVariacao } from "@/lib/formato";
import { variacao as calcVariacao } from "@/lib/calculos";
import type { BlocosOrigem, Comparacao, Origem, OrigemTela } from "@/lib/types";
import { FaixaExemplo, MarcaOrigem } from "./FaixaExemplo";

export function CabecalhoArea({
  numero,
  nome,
  frase,
  origem,
  blocos,
}: {
  numero?: number;
  nome: string;
  frase: string;
  origem: OrigemTela;
  /** estado de cada bloco: é o que deixa a faixa dizer "exemplo" só quando há exemplo */
  blocos?: BlocosOrigem;
}) {
  return (
    <>
      <FaixaExemplo origem={origem} blocos={blocos} />
      <header className="mb-6 lg:mb-8">
        {numero && <p className="num text-sm text-grafite-2">Pilar {numero}</p>}
        <h1 className="font-display text-3xl font-semibold tracking-tight">{nome}</h1>
        <p className="mt-3 max-w-[68ch] text-lg leading-snug text-grafite" aria-live="polite">
          {frase}
        </p>
      </header>
    </>
  );
}

export function Painel({
  titulo,
  descricao,
  children,
  className,
  id,
  origem,
}: {
  titulo: string;
  descricao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  /** origem DESTE bloco: EXEMPLO ganha selo açafrão, SEM_DADO ganha selo tracejado */
  origem?: Origem;
}) {
  const tid = id ?? `p-${titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={tid} className={clsx("min-w-0 rounded-painel border border-linha bg-papel p-4 sm:p-5", className)}>
      <h2 id={tid} className="font-display text-lg font-semibold">
        {titulo}
        <MarcaOrigem origem={origem} className="ml-2" />
      </h2>
      {descricao && <p className="mt-1 text-sm text-grafite-2">{descricao}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * O que o painel inteiro mostra quando não há nada para mostrar.
 *
 * É um bloco, não um número cinza: borda tracejada (a mesma forma do selo SEM_DADO) e o
 * MOTIVO escrito por extenso. A regra da fase: quem lê precisa entender POR QUE não há
 * número, e não só que ele falta.
 */
export function SemDado({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-botao border border-dashed border-linha bg-bancada px-3 py-2.5 text-base text-grafite-2">
      <CircleDashed aria-hidden className="mt-1 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function Variacao({ v, emPontos, className }: { v: number | null; emPontos?: boolean; className?: string }) {
  if (v === null) return <span className={clsx("text-sm text-grafite-2", className)}>sem comparação</span>;
  const Icone = Math.abs(v) < 0.0005 ? Minus : v > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={clsx("num inline-flex items-center gap-0.5 text-sm text-grafite-2", className)}>
      <Icone aria-hidden className="size-4" />
      {formatarVariacao(v, emPontos)}
    </span>
  );
}

/**
 * Número com rótulo e variação contra o período anterior.
 *
 * Quando `valor` é a string NAO_MEDIDO (o que `ouNaoMedido` devolve para null), o
 * indicador deixa de parecer número: sai do display grande e tabular e vira texto cinza,
 * sem variação e sem comparação. Assim "não medido" nunca é lido de relance como se
 * fosse um valor. Nesse caso `detalhe` carrega o motivo, e é obrigatório na prática.
 */
export function Indicador({
  rotulo,
  valor,
  comparacao,
  emPontos,
  detalhe,
  destaque,
  origem,
}: {
  origem?: Origem;
  rotulo: string;
  valor: string;
  comparacao?: Comparacao;
  emPontos?: boolean;
  detalhe?: string;
  destaque?: boolean;
}) {
  const ausente = valor === NAO_MEDIDO;
  const v = !ausente && comparacao ? (emPontos ? comparacao.atual - comparacao.anterior : calcVariacao(comparacao.atual, comparacao.anterior)) : undefined;
  return (
    <div className="min-w-0">
      <p className="text-sm text-grafite-2">
        {rotulo}
        <MarcaOrigem origem={origem} className="ml-1.5" />
      </p>
      <p
        className={clsx(
          ausente ? "text-lg leading-snug text-grafite-2" : "num font-display font-semibold tracking-tight",
          !ausente && (destaque ? "text-3xl" : "text-2xl"),
        )}
      >
        {valor}
      </p>
      <p className="flex flex-wrap items-center gap-x-2">
        {v !== undefined && <Variacao v={v} emPontos={emPontos} />}
        {detalhe && <span className="text-sm text-grafite-2">{detalhe}</span>}
      </p>
    </div>
  );
}

export function GradeIndicadores({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 xl:grid-cols-6">{children}</div>;
}

/** Etiqueta com ícone + texto (nunca só cor) */
export function Etiqueta({ icone: Icone, cor, children }: { icone: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; cor: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-botao border border-linha bg-papel px-1.5 py-0.5 text-sm font-medium text-grafite">
      <Icone aria-hidden className={clsx("size-3.5 shrink-0", cor)} />
      {children}
    </span>
  );
}

export function TabelaRolavel({ children, legenda }: { children: React.ReactNode; legenda: string }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="num w-full min-w-[560px] text-left text-base">
        <caption className="sr-only">{legenda}</caption>
        {children}
      </table>
    </div>
  );
}

export const th = "border-b border-linha py-2 pr-3 text-sm font-medium text-grafite-2 last:pr-0";
export const td = "border-b border-linha py-2.5 pr-3 align-top last:pr-0";
