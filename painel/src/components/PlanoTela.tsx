"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { CalendarDays, Check, CircleDashed, CircleDot, CircleCheck, UserRound } from "lucide-react";
import { lerData } from "@/lib/calculos";
import { formatarBRLInteiro, formatarDataCurta } from "@/lib/formato";
import { PILARES } from "@/lib/pilares";
import type { AcaoPlano, Plano, SituacaoAcao } from "@/lib/types";
import { CabecalhoArea, Etiqueta } from "./ui";

const SITUACOES: { id: SituacaoAcao; rotulo: string; icone: typeof CircleDot; cor: string }[] = [
  { id: "a_fazer", rotulo: "A fazer", icone: CircleDashed, cor: "text-grafite-2" },
  { id: "fazendo", rotulo: "Fazendo", icone: CircleDot, cor: "text-comanda" },
  { id: "feito", rotulo: "Feito", icone: CircleCheck, cor: "text-manjericao" },
];

export function PlanoTela({ plano, hoje }: { plano: Plano; hoje: string }) {
  const [acoes, setAcoes] = useState<AcaoPlano[]>(plano.acoes);
  const [pilar, setPilar] = useState<string>("todos");
  const [situacao, setSituacao] = useState<SituacaoAcao | "todas">("todas");

  const visiveis = useMemo(
    () => acoes.filter((a) => (pilar === "todos" || a.pilar === pilar) && (situacao === "todas" || a.situacao === situacao)).sort((a, b) => a.prazo.localeCompare(b.prazo)),
    [acoes, pilar, situacao],
  );
  const total = acoes.reduce((s, a) => s + a.resultadoEsperadoMes, 0);
  const feito = acoes.filter((a) => a.situacao === "feito").reduce((s, a) => s + a.resultadoEsperadoMes, 0);
  const nFeitas = acoes.filter((a) => a.situacao === "feito").length;
  const atrasadas = acoes.filter((a) => a.situacao !== "feito" && a.prazo < hoje).length;
  const frase = `${nFeitas} de ${acoes.length} ações feitas. Juntas, as ações valem ${formatarBRLInteiro(total)} por mês em margem; ${formatarBRLInteiro(feito)} disso já está em ações concluídas.${atrasadas ? ` ${atrasadas === 1 ? "1 ação está atrasada" : `${atrasadas} ações estão atrasadas`}.` : ""}`;

  // Desmarcar volta para a situação original (ou "fazendo", se ela já veio como feita)
  const alternar = (id: string) =>
    setAcoes((lista) =>
      lista.map((a) => {
        if (a.id !== id) return a;
        if (a.situacao !== "feito") return { ...a, situacao: "feito" };
        const original = plano.acoes.find((o) => o.id === id)!.situacao;
        return { ...a, situacao: original === "feito" ? "fazendo" : original };
      }),
    );

  return (
    <>
      <CabecalhoArea nome="Plano de ação" frase={frase} origem={plano.origem} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="flex items-center gap-2">
          <span className="text-sm text-grafite-2">Pilar</span>
          <select value={pilar} onChange={(e) => setPilar(e.target.value)} className="h-11 min-w-0 flex-1 rounded-botao border border-linha bg-papel px-2 sm:flex-none lg:h-9">
            <option value="todos">Todos os pilares</option>
            {PILARES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.numero}. {p.nome}
              </option>
            ))}
          </select>
        </label>
        <div role="group" aria-label="Situação" className="flex rounded-botao border border-linha bg-papel p-0.5">
          {[{ id: "todas" as const, rotulo: "Todas" }, ...SITUACOES].map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={situacao === s.id}
              onClick={() => setSituacao(s.id)}
              className={clsx("h-10 flex-1 whitespace-nowrap rounded-[5px] px-3 text-sm font-medium transition-colors lg:h-8", situacao === s.id ? "bg-comanda text-white" : "text-grafite-2 hover:text-grafite")}
            >
              {s.rotulo}
            </button>
          ))}
        </div>
        <p className="num text-sm text-grafite-2 sm:ml-auto" aria-live="polite">
          {visiveis.length} {visiveis.length === 1 ? "ação" : "ações"}
        </p>
      </div>

      <ul className="grid gap-3">
        {visiveis.map((a) => {
          const s = SITUACOES.find((x) => x.id === a.situacao)!;
          const info = PILARES.find((p) => p.id === a.pilar);
          const atrasada = a.situacao !== "feito" && a.prazo < hoje;
          const feita = a.situacao === "feito";
          return (
            <li key={a.id} className="flex gap-3 rounded-painel border border-linha bg-papel p-4">
              <label className="flex min-h-11 min-w-11 cursor-pointer items-start justify-center pt-0.5">
                <input type="checkbox" checked={feita} onChange={() => alternar(a.id)} className="peer sr-only" />
                <span className="sr-only">{feita ? "Desmarcar como feita" : "Marcar como feita"}: {a.acao}</span>
                <span
                  aria-hidden
                  className={clsx(
                    "grid size-6 place-items-center rounded-[5px] border-[1.5px] transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-comanda",
                    feita ? "border-comanda bg-comanda text-white" : "border-grafite-2 bg-papel",
                  )}
                >
                  {feita && <Check className="size-4" strokeWidth={3} />}
                </span>
              </label>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-grafite-2">{info ? `${info.numero}. ${info.nome}` : a.pilar}</p>
                <p className={clsx("mt-0.5 text-base font-medium", feita && "text-grafite-2 line-through")}>{a.acao}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-grafite-2">
                  <Etiqueta icone={s.icone} cor={s.cor}>{s.rotulo}</Etiqueta>
                  <span className="inline-flex items-center gap-1">
                    <UserRound aria-hidden className="size-4" /> {a.responsavel}
                  </span>
                  <span className={clsx("num inline-flex items-center gap-1", atrasada && "font-medium text-tomate")}>
                    <CalendarDays aria-hidden className="size-4" /> até {formatarDataCurta(lerData(a.prazo))}
                    {atrasada && " · atrasada"}
                  </span>
                  {a.resultadoEsperadoMes > 0 && <span className="num font-medium text-grafite sm:hidden">{formatarBRLInteiro(a.resultadoEsperadoMes)}/mês esperado</span>}
                </div>
              </div>
              <div className="hidden shrink-0 text-right sm:block">
                <p className="text-sm text-grafite-2">Resultado esperado</p>
                <p className="num font-display text-lg font-semibold">{a.resultadoEsperadoMes ? formatarBRLInteiro(a.resultadoEsperadoMes) : "—"}</p>
                {a.resultadoEsperadoMes > 0 && <p className="text-sm text-grafite-2">por mês</p>}
              </div>
            </li>
          );
        })}
        {!visiveis.length && <li className="rounded-painel border border-dashed border-linha bg-papel p-6 text-center text-grafite-2">Nenhuma ação com esses filtros.</li>}
      </ul>
      <p className="mt-3 text-sm text-grafite-2">Marcar como feita muda só esta tela por enquanto; ainda não fica salvo.</p>
    </>
  );
}
