"use client";

import { useState } from "react";
import clsx from "clsx";
import { AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, Copy, OctagonAlert } from "lucide-react";
import { lerData } from "@/lib/calculos";
import { formatarBRL, formatarBRLInteiro, formatarDataCurta, formatarDiaSemanaCurto, formatarInteiro, formatarPct } from "@/lib/formato";
import type { Situacao, VisaoMetricas } from "@/lib/types";
import { CabecalhoArea, Painel, TabelaRolavel, td, th } from "./ui";

const SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const SIT: Record<Situacao, { rotulo: string; icone: typeof Check; cor: string; fundo: string }> = {
  bom: { rotulo: "Meta batida", icone: CheckCircle2, cor: "text-manjericao", fundo: "bg-manjericao/10 border-manjericao/40" },
  atencao: { rotulo: "Quase (80% a 99%)", icone: AlertTriangle, cor: "text-acafrao", fundo: "bg-acafrao-fundo border-acafrao/40" },
  alerta: { rotulo: "Não batida (abaixo de 80%)", icone: OctagonAlert, cor: "text-tomate", fundo: "bg-tomate/5 border-tomate/30" },
};
const nomeMes = (ym: string) => {
  const s = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(lerData(`${ym}-01`));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const milhar = (v: number) => `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;

function Calendario({ meses, temMeta }: { meses: VisaoMetricas["meses"]; temMeta: boolean }) {
  const [i, setI] = useState(meses.length - 1);
  const m = meses[i];
  const primeiro = lerData(`${m.mes}-01`);
  const offset = (primeiro.getDay() + 6) % 7; // semana começa na segunda
  const total = new Date(primeiro.getFullYear(), primeiro.getMonth() + 1, 0).getDate();
  const porDia = new Map(m.dias.map((d) => [lerData(d.data).getDate(), d]));
  const contagem = (s: Situacao) => m.dias.filter((d) => d.situacao === s).length;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => setI(i - 1)} disabled={i === 0} className="grid size-11 place-items-center rounded-botao border border-linha disabled:opacity-40 lg:size-9">
          <ChevronLeft aria-hidden className="size-4" />
          <span className="sr-only">Mês anterior</span>
        </button>
        <p className="font-display text-lg font-semibold" aria-live="polite">
          {nomeMes(m.mes)}
        </p>
        <button type="button" onClick={() => setI(i + 1)} disabled={i === meses.length - 1} className="grid size-11 place-items-center rounded-botao border border-linha disabled:opacity-40 lg:size-9">
          <ChevronRight aria-hidden className="size-4" />
          <span className="sr-only">Próximo mês</span>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm text-grafite-2" aria-hidden>
        {SEMANA.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <ol className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: offset }, (_, k) => (
          <li key={`v${k}`} aria-hidden />
        ))}
        {Array.from({ length: total }, (_, k) => {
          const n = k + 1;
          const d = porDia.get(n);
          const s = d?.situacao ? SIT[d.situacao] : null;
          const Icone = s?.icone;
          return (
            <li
              key={n}
              className={clsx("flex min-h-14 flex-col justify-between rounded-[6px] border p-1 text-left sm:min-h-16 sm:p-1.5", s ? s.fundo : d ? "border-linha" : "border-dashed border-linha")}
              aria-label={!d ? `${n}: sem dados` : d.meta === null ? `${n}: ${formatarBRLInteiro(d.faturamento)}` : `${n}: ${formatarBRLInteiro(d.faturamento)} de ${formatarBRLInteiro(d.meta)}, ${s?.rotulo}`}
            >
              <span className="flex items-center justify-between">
                <span className={clsx("num text-sm", d ? "font-medium text-grafite" : "text-grafite-2")}>{n}</span>
                {Icone && <Icone aria-hidden className={clsx("size-3.5", s.cor)} />}
              </span>
              {d && <span className="num hidden text-sm text-grafite-2 sm:block">{milhar(d.faturamento)}</span>}
            </li>
          );
        })}
      </ol>
      {!temMeta && <p className="mt-3 text-sm text-grafite-2">Meta diária: [PREENCHER]. Com a meta cadastrada, cada dia mostra se bateu ou não.</p>}
      <ul className={clsx("mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm", !temMeta && "hidden")}>
        {(Object.keys(SIT) as Situacao[]).map((k) => {
          const Icone = SIT[k].icone;
          return (
            <li key={k} className="flex items-center gap-1.5">
              <Icone aria-hidden className={clsx("size-4", SIT[k].cor)} />
              {SIT[k].rotulo}: <span className="num font-medium">{contagem(k)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Mensagem({ texto }: { texto: string }) {
  const [copiada, setCopiada] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2000);
    } catch {
      setCopiada(false);
    }
  };
  // *negrito* do WhatsApp vira negrito na prévia
  const linhas = texto.split("\n").map((l, i) => {
    const partes = l.split(/(\*[^*]+\*)/g).map((p, j) => (p.startsWith("*") && p.endsWith("*") ? <strong key={j}>{p.slice(1, -1)}</strong> : p));
    return (
      <span key={i} className="block min-h-[1.5em]">
        {partes}
      </span>
    );
  });
  return (
    <div>
      <div className="rounded-botao bg-bancada p-3 sm:p-4">
        <div className="max-w-[380px] rounded-[10px] rounded-tl-[3px] bg-papel px-3 py-2 text-base leading-normal">
          {linhas}
          <span className="num mt-1 block text-right text-sm text-grafite-2">07:00</span>
        </div>
      </div>
      <button
        type="button"
        onClick={copiar}
        className="mt-3 inline-flex h-11 items-center gap-2 rounded-botao bg-comanda px-4 font-medium text-white transition-colors hover:bg-comanda/90 lg:h-10"
      >
        {copiada ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
        {copiada ? "Mensagem copiada" : "Copiar mensagem"}
      </button>
      <span className="sr-only" aria-live="polite">
        {copiada ? "Mensagem copiada" : ""}
      </span>
    </div>
  );
}

export function MetricasTela({ visao }: { visao: VisaoMetricas }) {
  const v = visao;
  const dia = (iso: string) => `${formatarDiaSemanaCurto(lerData(iso))} ${formatarDataCurta(lerData(iso))}`;
  const temProducao = v.tabela.some((l) => l.pizzas !== null || l.perdas !== null);

  return (
    <>
      <CabecalhoArea numero={6} nome="Métricas diárias" frase={v.frase} origem={v.origem} />

      <div className="grid gap-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Painel titulo="Calendário da meta" descricao="Cada dia comparado com a meta do seu dia da semana.">
            <Calendario meses={v.meses} temMeta={v.temMeta} />
          </Painel>
          <Painel titulo="Mensagem de hoje no WhatsApp" descricao="Exatamente como o dono recebe às 7h, com os números de ontem.">
            <Mensagem texto={v.mensagem} />
          </Painel>
        </div>

        <Painel titulo="Dia a dia" descricao={`Do mais recente para o mais antigo, no período escolhido.${temProducao ? "" : " Pizzas produzidas e perdas: [PREENCHER] (ainda não há registro diário)."}`}>
          <TabelaRolavel legenda="Faturamento, meta, pedidos, ticket, margem e produção por dia">
            <thead>
              <tr>
                <th scope="col" className={th}>Dia</th>
                <th scope="col" className={clsx(th, "text-right")}>Faturamento</th>
                {v.temMeta && <th scope="col" className={clsx(th, "text-right")}>Meta</th>}
                <th scope="col" className={clsx(th, "text-right")}>Pedidos</th>
                <th scope="col" className={clsx(th, "text-right")}>Ticket</th>
                <th scope="col" className={clsx(th, "text-right")}>{v.margemEstimada ? "Margem estimada" : "Margem"}</th>
                {temProducao && <th scope="col" className={clsx(th, "text-right")}>Pizzas</th>}
                {temProducao && <th scope="col" className={clsx(th, "text-right")}>Perdas</th>}
              </tr>
            </thead>
            <tbody>
              {v.tabela.map((l) => {
                const pct = l.meta ? l.faturamento / l.meta : null;
                return (
                  <tr key={l.data}>
                    <td className={clsx(td, "whitespace-nowrap")}>{dia(l.data)}</td>
                    <td className={clsx(td, "text-right")}>{formatarBRLInteiro(l.faturamento)}</td>
                    {v.temMeta && (
                      <td className={clsx(td, "text-right")}>
                        {l.meta === null ? "—" : formatarBRLInteiro(l.meta)}
                        {pct !== null && <span className="block text-sm text-grafite-2">{formatarPct(pct)}</span>}
                      </td>
                    )}
                    <td className={clsx(td, "text-right")}>{formatarInteiro(l.pedidos)}</td>
                    <td className={clsx(td, "text-right")}>{formatarBRL(l.ticket)}</td>
                    <td className={clsx(td, "text-right")}>{formatarBRLInteiro(l.margem)}</td>
                    {temProducao && <td className={clsx(td, "text-right")}>{l.pizzas ?? "—"}</td>}
                    {temProducao && <td className={clsx(td, "text-right")}>{l.perdas ?? "—"}</td>}
                  </tr>
                );
              })}
            </tbody>
          </TabelaRolavel>
        </Painel>

        <Painel titulo="Histórico de alertas" descricao="Últimos 30 dias. Um alerta por dia: o mais grave.">
          {v.alertas.length ? (
            <ol className="grid gap-2">
              {v.alertas.map((a) => (
                <li key={a.data} className="flex items-start gap-3 border-b border-linha pb-2 last:border-0">
                  <OctagonAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-tomate" />
                  <span className="num w-20 shrink-0 text-sm text-grafite-2">{dia(a.data)}</span>
                  <span>{a.texto}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-grafite-2">Nenhum alerta nos últimos 30 dias.</p>
          )}
        </Painel>
      </div>
    </>
  );
}
