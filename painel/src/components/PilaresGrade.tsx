import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import { formatarVariacao } from "@/lib/formato";
import { PILARES } from "@/lib/pilares";
import type { IndicadorPilar } from "@/lib/types";
import { MarcaOrigem } from "./FaixaExemplo";
import { Sinal } from "./Sinal";

function Variacao({ v, emPontos }: { v: number | null; emPontos?: boolean }) {
  if (v === null) return <span className="text-sm text-grafite-2">sem base de comparação</span>;
  const Icone = Math.abs(v) < 0.0005 ? Minus : v > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="num inline-flex items-center gap-0.5 text-sm text-grafite-2">
      <Icone aria-hidden className="size-4" />
      {formatarVariacao(v, emPontos)}
      <span className="sr-only"> contra o período anterior</span>
    </span>
  );
}

export function PilaresGrade({ slug, pilares, marcarBlocos }: { slug: string; pilares: IndicadorPilar[]; marcarBlocos?: boolean }) {
  return (
    <section aria-labelledby="pilares-titulo">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="pilares-titulo" className="font-display text-lg font-semibold">
          Os 6 pilares
        </h2>
        <span className="text-sm text-grafite-2">contra o período anterior</span>
      </div>
      <ul className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {pilares.map((ind) => {
          const info = PILARES.find((p) => p.id === ind.pilar)!;
          /**
           * Pilar sem nenhuma linha na fonte: a camada de dados já troca o valor por
           * "não medido" e zera o semáforo. Aqui a tela fecha o resto do buraco — o
           * semáforo precisa DIZER "Não medido" e não "Sem meta", e o cartão precisa
           * explicar por que não há número. Critério 1 da fase: nenhum pilar verde.
           */
          const semDado = ind.origem === "SEM_DADO";
          return (
            <li key={ind.pilar}>
              <Link
                href={`/${slug}/${info.rota}`}
                className="group flex h-full flex-col rounded-painel border border-linha bg-papel p-3 transition-colors hover:border-comanda/50 sm:p-4"
              >
                <span className="flex items-start justify-between gap-2 text-sm text-grafite-2">
                  <span>
                    <span className="num">{info.numero}.</span> {info.nomeCurto}
                  </span>
                  <ArrowRight aria-hidden className="size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                <span className="mt-2 text-sm text-grafite-2">
                  {ind.rotulo}
                  {/* O selo só vale a pena quando ele DISTINGUE este pilar dos outros.
                      Com a tela inteira sem dado, a faixa do topo já disse, e o valor
                      "não medido" repetiria o selo palavra por palavra. */}
                  {marcarBlocos && <MarcaOrigem origem={ind.origem} className="ml-1.5" />}
                </span>
                <span
                  className={
                    semDado ? "mt-0.5 text-base leading-snug text-grafite-2" : "num font-display text-2xl font-semibold"
                  }
                >
                  {ind.valor}
                </span>
                <span className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-2">
                  {semDado ? (
                    <span className="text-sm text-grafite-2">nenhuma linha neste filtro</span>
                  ) : (
                    <Variacao v={ind.variacao} emPontos={ind.variacaoEmPontos} />
                  )}
                  <Sinal situacao={ind.situacao} semDado={semDado} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
