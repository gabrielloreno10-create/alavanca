"use client";

import type { Hoje } from "@/lib/types";
import { Comanda } from "./Comanda";
import { FaixaExemplo } from "./FaixaExemplo";
import { GraficoFaturamento } from "./GraficoFaturamento";
import { PilaresGrade } from "./PilaresGrade";
import { Saudacao } from "./Saudacao";

export function HojeTela({ slug, visao, usuario }: { slug: string; visao: Hoje; usuario: string }) {
  const hoje = visao;
  return (
    <>
      <FaixaExemplo origem={hoje.origem} fonte={hoje.cliente.fonte} />
      <Saudacao nome={usuario} />
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,380px)_1fr] lg:items-start lg:gap-8">
        <div className="lg:sticky lg:top-24">
          <Comanda comanda={hoje.comanda} cliente={hoje.cliente} />
        </div>
        <div className="grid min-w-0 gap-6">
          <PilaresGrade slug={slug} pilares={hoje.pilares} marcarExemplo={hoje.origem === "MISTO"} />
          <GraficoFaturamento pontos={hoje.grafico} />
        </div>
      </div>
    </>
  );
}
