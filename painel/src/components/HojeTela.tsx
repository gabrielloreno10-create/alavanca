"use client";

import type { BlocosOrigem, Hoje } from "@/lib/types";
import { Comanda } from "./Comanda";
import { FaixaExemplo } from "./FaixaExemplo";
import { GraficoFaturamento } from "./GraficoFaturamento";
import { PilaresGrade } from "./PilaresGrade";
import { Saudacao } from "./Saudacao";

export function HojeTela({ slug, visao, usuario }: { slug: string; visao: Hoje; usuario: string }) {
  const hoje = visao;
  /**
   * A tela Hoje não tem `blocos`: cada pilar já carrega a sua origem. Montar o mapa
   * aqui é o que deixa a faixa saber se o "MISTO" tem exemplo de verdade ou se é só
   * real + ausência — que não é exemplo nenhum e não pode levar o selo açafrão.
   */
  const blocos: BlocosOrigem = Object.fromEntries(hoje.pilares.map((p) => [p.pilar, p.origem]));
  return (
    <>
      <FaixaExemplo origem={hoje.origem} fonte={hoje.cliente.fonte} blocos={blocos} />
      <Saudacao nome={usuario} />
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,380px)_1fr] lg:items-start lg:gap-8">
        <div className="lg:sticky lg:top-24">
          <Comanda comanda={hoje.comanda} cliente={hoje.cliente} />
        </div>
        <div className="grid min-w-0 gap-6">
          <PilaresGrade slug={slug} pilares={hoje.pilares} marcarBlocos={hoje.origem === "MISTO"} />
          <GraficoFaturamento pontos={hoje.grafico} />
        </div>
      </div>
    </>
  );
}
