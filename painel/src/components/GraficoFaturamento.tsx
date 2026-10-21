"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { lerData } from "@/lib/calculos";
import { formatarBRLInteiro, formatarDataCurta, formatarDiaSemanaCurto } from "@/lib/formato";
import type { PontoGrafico } from "@/lib/types";
import { SemDado } from "./ui";

const milhar = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(v));

interface PropsDica {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
}

function Dica({ active, payload }: PropsDica) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as PontoGrafico | undefined;
  if (!p) return null;
  const d = lerData(p.data);
  return (
    <div className="rounded-botao border border-linha bg-papel px-3 py-2 text-sm shadow-sm">
      <p className="font-medium">
        {formatarDiaSemanaCurto(d)} {formatarDataCurta(d)}
      </p>
      <p className="num flex items-center gap-1.5">
        <span aria-hidden className="h-0.5 w-3 bg-comanda" /> Faturamento {formatarBRLInteiro(p.faturamento)}
      </p>
      {p.meta !== null && (
        <p className="num flex items-center gap-1.5 text-grafite-2">
          <span aria-hidden className="h-0 w-3 border-t-2 border-dashed border-cinza-grafico" /> Meta {formatarBRLInteiro(p.meta)}
        </p>
      )}
    </div>
  );
}

export function GraficoFaturamento({ pontos }: { pontos: PontoGrafico[] }) {
  // Sem nenhum ponto o resumo saía "Nos últimos 0 dias, o faturamento somou R$ 0" — um
  // R$ 0,00 que na verdade quer dizer "não sei", que é o que a fase 0 mata.
  if (!pontos.length) {
    return (
      <section aria-labelledby="grafico-titulo" className="rounded-painel border border-linha bg-papel p-4 sm:p-5">
        <h2 id="grafico-titulo" className="font-display text-lg font-semibold">
          Faturamento dos últimos 30 dias
        </h2>
        <div className="mt-4">
          <SemDado>Não há nenhum dia de venda neste filtro. Uma linha rente ao zero afirmaria 30 dias sem vender; o que existe é ausência de registro.</SemDado>
        </div>
      </section>
    );
  }
  const temMeta = pontos.some((p) => p.meta !== null);
  const batidos = pontos.filter((p) => p.meta !== null && p.faturamento >= p.meta).length;
  const total = pontos.reduce((s, p) => s + p.faturamento, 0);
  const resumo = temMeta
    ? `Nos últimos ${pontos.length} dias, o faturamento somou ${formatarBRLInteiro(total)} e bateu a meta em ${batidos} dias.`
    : `Nos últimos ${pontos.length} dias, o faturamento somou ${formatarBRLInteiro(total)}. Meta diária: [PREENCHER].`;

  return (
    <section aria-labelledby="grafico-titulo" className="rounded-painel border border-linha bg-papel p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="grafico-titulo" className="font-display text-lg font-semibold">
          Faturamento dos últimos 30 dias
        </h2>
        <div className="flex items-center gap-4 text-sm text-grafite-2" aria-hidden>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-comanda" /> Faturamento
          </span>
          {temMeta && (
            <span className="flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-cinza-grafico" /> Meta
            </span>
          )}
        </div>
      </div>
      <p className="mt-1 text-sm text-grafite-2">{resumo}</p>
      <div className="mt-4 h-60 sm:h-72" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={pontos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--linha)" strokeOpacity={0.7} />
            <XAxis
              dataKey="data"
              tickFormatter={(v: string) => formatarDataCurta(lerData(v))}
              tick={{ fill: "var(--grafite-2)", fontSize: 13 }}
              tickLine={false}
              axisLine={{ stroke: "var(--linha)" }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tickFormatter={milhar}
              tick={{ fill: "var(--grafite-2)", fontSize: 13 }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip content={Dica} cursor={{ stroke: "var(--grafite-2)", strokeWidth: 1, strokeDasharray: "3 3" }} />
            {temMeta && <Line type="stepAfter" dataKey="meta" stroke="var(--cinza-grafico)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} />}
            <Line type="monotone" dataKey="faturamento" stroke="var(--comanda)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--papel)" }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer py-2 text-comanda">Ver os números em tabela</summary>
        <div className="max-h-64 overflow-y-auto">
          <table className="num w-full text-left">
            <caption className="sr-only">Faturamento e meta por dia</caption>
            <thead className="sticky top-0 bg-papel text-grafite-2">
              <tr>
                <th scope="col" className="py-1 font-medium">Dia</th>
                <th scope="col" className="py-1 text-right font-medium">Faturamento</th>
                {temMeta && <th scope="col" className="py-1 text-right font-medium">Meta</th>}
              </tr>
            </thead>
            <tbody>
              {pontos.map((p) => {
                const d = lerData(p.data);
                return (
                  <tr key={p.data} className="border-t border-linha">
                    <td className="py-1">{formatarDiaSemanaCurto(d)} {formatarDataCurta(d)}</td>
                    <td className="py-1 text-right">{formatarBRLInteiro(p.faturamento)}</td>
                    {temMeta && <td className="py-1 text-right">{p.meta === null ? "—" : formatarBRLInteiro(p.meta)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
