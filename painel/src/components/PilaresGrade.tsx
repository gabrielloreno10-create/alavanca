import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import { formatarVariacao } from "@/lib/formato";
import { PILARES } from "@/lib/pilares";
import type { IndicadorPilar } from "@/lib/types";
import { MarcaExemplo } from "./FaixaExemplo";
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

export function PilaresGrade({ slug, pilares, marcarExemplo }: { slug: string; pilares: IndicadorPilar[]; marcarExemplo?: boolean }) {
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
                  {marcarExemplo && ind.origem === "EXEMPLO" && <MarcaExemplo className="ml-1.5" />}
                </span>
                <span className="num font-display text-2xl font-semibold tracking-tight">{ind.valor}</span>
                <span className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-2">
                  <Variacao v={ind.variacao} emPontos={ind.variacaoEmPontos} />
                  <Sinal situacao={ind.situacao} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
