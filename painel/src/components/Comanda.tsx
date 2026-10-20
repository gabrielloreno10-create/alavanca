"use client";

import { useState, useSyncExternalStore } from "react";
import clsx from "clsx";
import { Check, CheckCircle2, OctagonAlert } from "lucide-react";
import { canaisDo, isoDe, lerData, operacoesDo, somarDias, tiposDo } from "@/lib/calculos";
import { formatarBRL, formatarBRLInteiro, formatarDataCurta, formatarDiaSemanaCurto, formatarInteiro, formatarPct } from "@/lib/formato";
import { NOME_TIPO, type Cliente, type ComandaDoDia, type TipoCanal } from "@/lib/types";

const COR_TIPO: Record<TipoCanal, string> = { proprio: "bg-comanda", ifood: "bg-cinza-grafico", salao: "bg-linha" };
import { Sinal } from "./Sinal";

function Linha({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="flex items-baseline gap-2 py-1">
      <dt className="text-grafite-2">{rotulo}</dt>
      <span aria-hidden className="pontilhado" />
      <dd className="num text-right font-medium">
        {valor}
        {detalhe && <span className="ml-1.5 text-sm font-normal text-grafite-2">{detalhe}</span>}
      </dd>
    </div>
  );
}

const Corte = () => <hr className="my-4 border-0 border-t-[1.5px] border-dashed border-linha" />;

export function Comanda({ comanda, cliente }: { comanda: ComandaDoDia; cliente: Cliente }) {
  const [feitas, setFeitas] = useState<boolean[]>(() => comanda.acoes.map(() => false));
  const dia = lerData(comanda.data);
  const r = comanda.resumo;
  const temAlerta = comanda.alerta.tipo !== "nenhum";
  const canais = canaisDo(cliente);
  const tipos = tiposDo(cliente);
  // "Ontem" só quando o último dia com dados é mesmo ontem; senão, deixa claro que é o último dia fechado
  const ehOntem = useSyncExternalStore(
    () => () => {},
    () => somarDias(comanda.data, 1) === isoDe(new Date()),
    () => false,
  );
  const rotuloDia = ehOntem ? "Ontem" : "Último dia com dados";

  return (
    <section aria-labelledby="comanda-titulo" className="comanda-borda">
      <div className="comanda px-5 sm:px-6">
        <div className="flex items-center justify-between text-sm text-grafite-2">
          <span className="num">Comanda nº {String(comanda.numero).padStart(4, "0")}</span>
          <span className="num">Emitida às {comanda.emitidaEm}</span>
        </div>
        <h2 id="comanda-titulo" className="mt-3 font-display text-lg font-semibold">
          {rotuloDia}, {formatarDiaSemanaCurto(dia)} {formatarDataCurta(dia)}
        </h2>

        <Corte />

        <p className="text-sm text-grafite-2">Faturamento</p>
        <p className="num font-display text-3xl font-semibold tracking-tight">{formatarBRLInteiro(r.faturamento)}</p>
        {comanda.meta !== null && comanda.metaPct !== null && comanda.situacaoMeta && (
          <>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="num text-base text-grafite-2">
                meta {formatarBRLInteiro(comanda.meta)} · <span className="font-medium text-grafite">{formatarPct(comanda.metaPct)}</span>
              </span>
              <Sinal situacao={comanda.situacaoMeta} />
            </div>
            <div
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-bancada"
              role="progressbar"
              aria-label="Faturamento contra a meta"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.min(comanda.metaPct, 1) * 100)}
            >
              <div className="h-full rounded-full bg-comanda" style={{ width: `${Math.min(comanda.metaPct, 1) * 100}%` }} />
            </div>
          </>
        )}
        {comanda.meta === null && <p className="mt-1 text-sm text-grafite-2">Meta diária: [PREENCHER]</p>}

        <Corte />

        <dl>
          <Linha rotulo="Pedidos" valor={formatarInteiro(r.pedidos)} />
          <Linha rotulo="Ticket médio" valor={formatarBRL(r.ticket)} />
          <Linha rotulo="Margem estimada" valor={formatarBRLInteiro(r.margem)} detalhe={formatarPct(r.margemPct, 1)} />
        </dl>

        <Corte />

        <h3 className="text-sm text-grafite-2">Vendas por canal</h3>
        <div className="mt-2 flex h-2.5 gap-[2px] overflow-hidden rounded-full" aria-hidden>
          {tipos.map((t) => (
            <div key={t} className={COR_TIPO[t]} style={{ width: `${r.canalPct[t] * 100}%` }} />
          ))}
        </div>
        <ul className={clsx("mt-2 grid gap-2 text-sm", tipos.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
          {tipos.map((t) => (
            <li key={t}>
              <span className="flex items-center gap-1.5 text-grafite-2">
                <span aria-hidden className={clsx("size-2 rounded-full", COR_TIPO[t])} />
                {NOME_TIPO[t]}
              </span>
              <span className="num text-base font-medium">{formatarPct(r.canalPct[t])}</span>
            </li>
          ))}
        </ul>
        {canais.length > tipos.length && (
          <dl className="mt-3">
            {canais.map((c) => (
              <Linha
                key={c}
                rotulo={cliente.canais[c].operacao && operacoesDo(cliente).length > 1 ? `${cliente.canais[c].operacao} · ${cliente.canais[c].nome}` : cliente.canais[c].nome}
                valor={formatarBRLInteiro(r.porCanal[c]?.faturamento ?? 0)}
                detalhe={formatarPct(r.faturamento ? (r.porCanal[c]?.faturamento ?? 0) / r.faturamento : 0)}
              />
            ))}
          </dl>
        )}

        <Corte />

        <p className="flex items-start gap-2">
          {temAlerta ? (
            <OctagonAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-tomate" />
          ) : (
            <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-manjericao" />
          )}
          <span>
            <span className="sr-only">{temAlerta ? "Alerta: " : ""}</span>
            {comanda.alerta.texto}
          </span>
        </p>

        <Corte />

        <h3 className="font-display text-lg font-semibold">Hoje</h3>
        <ul className="mt-1">
          {comanda.acoes.map((acao, i) => (
            <li key={acao}>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
                <input
                  type="checkbox"
                  checked={feitas[i]}
                  onChange={() => setFeitas((f) => f.map((v, j) => (j === i ? !v : v)))}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className={clsx(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-[4px] border-[1.5px] transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-comanda",
                    feitas[i] ? "border-comanda bg-comanda text-white" : "border-grafite-2 bg-papel",
                  )}
                >
                  {feitas[i] && <Check className="size-3.5" strokeWidth={3} />}
                </span>
                <span className={clsx(feitas[i] && "text-grafite-2 line-through")}>
                  <span className="num mr-1 text-grafite-2">{i + 1}.</span>
                  {acao}
                </span>
              </label>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-sm text-grafite-2">
          {cliente.notaMargem ?? "Margem estimada = faturamento − CMV − imposto − taxas e custos de cada canal."}
        </p>
      </div>
    </section>
  );
}
