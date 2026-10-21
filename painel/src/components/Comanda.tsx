"use client";

import { useState, useSyncExternalStore } from "react";
import clsx from "clsx";
import { Check, CheckCircle2, CircleDashed, OctagonAlert } from "lucide-react";
import { canaisDo, isoDe, lerData, operacoesDo, somarDias, tiposDo } from "@/lib/calculos";
import { MarcaExemplo } from "./FaixaExemplo";
import { NAO_MEDIDO, formatarBRL, formatarBRLInteiro, formatarDataCurta, formatarDiaSemanaCurto, formatarInteiro, formatarPct, ouNaoMedido } from "@/lib/formato";
import { NOME_TIPO, type CanalId, type Cliente, type ComandaDoDia, type TipoCanal } from "@/lib/types";

const COR_TIPO: Record<TipoCanal, string> = { proprio: "bg-comanda", ifood: "bg-cinza-grafico", salao: "bg-linha" };
import { Sinal } from "./Sinal";

function Linha({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  // Mesma convenção do Indicador (ui.tsx): "não medido" sai do tratamento de número
  // para não ser lido de relance como se fosse um valor.
  const ausente = valor === NAO_MEDIDO;
  return (
    <div className="flex items-baseline gap-2 py-1">
      <dt className="text-grafite-2">{rotulo}</dt>
      <span aria-hidden className="pontilhado" />
      <dd className={clsx("flex items-baseline justify-end gap-1.5 text-right", ausente ? "text-grafite-2" : "num font-medium")}>
        <span>{valor}</span>
        {/* O ponto é um separador de verdade, igual ao da linha da meta: valor e detalhe
            eram irmãos imediatos e o JSX comia a quebra entre eles, então o texto do DOM
            saía colado ("R$ 30856,6%") — e o leitor de tela lia a mesma coisa. */}
        {detalhe && (
          <>
            <span className="font-normal text-grafite-2">·</span>
            <span className="text-sm font-normal text-grafite-2">{detalhe}</span>
          </>
        )}
      </dd>
    </div>
  );
}

const Corte = () => <hr className="my-4 border-0 border-t-[1.5px] border-dashed border-linha" />;

export function Comanda({ comanda, cliente }: { comanda: ComandaDoDia; cliente: Cliente }) {
  const [feitas, setFeitas] = useState<boolean[]>(() => comanda.acoes.map(() => false));
  const dia = lerData(comanda.data);
  const r = comanda.resumo;
  // alerta null = não há dia de venda fechado para avaliar. Não é "tudo certo".
  const temAlerta = comanda.alerta !== null && comanda.alerta.tipo !== "nenhum";
  const semDiaParaAvaliar = comanda.alerta === null;
  /**
   * SEM_DADO = não existe dia de venda para este filtro. Todo número do resumo é zero
   * estrutural, não medição, e escrever "R$ 0,00" aqui seria afirmar um dia vazio que
   * ninguém observou.
   */
  const semVenda = comanda.origem === "SEM_DADO";
  const brl = (v: number) => (semVenda ? NAO_MEDIDO : formatarBRLInteiro(v));
  const canais = canaisDo(cliente);
  const tipos = tiposDo(cliente);
  /**
   * `resumir` SEMEIA o resumo com zero para todo canal e todo tipo CONFIGURADO, antes de
   * somar dia nenhum (calculos.ts). Então "R$ 0" e "0%" aqui não são medição: são a
   * semente, e escrevê-los afirma que alguém olhou aquele canal e não achou venda.
   * Foi o que a tela fez com a Jerry's, que não tem uma linha sequer em venda_dia.
   * Daqui não dá para separar "não tem linha" de "tem linha e vendeu zero" — o resumo
   * não guarda quais canais tiveram linha (ver pendência). Mas nos dois casos não há
   * faturamento a dividir, e o honesto é não escrever número nenhum.
   */
  const canalMedido = (c: CanalId) => !!r.porCanal[c] && (r.porCanal[c].faturamento > 0 || r.porCanal[c].pedidos > 0);
  const tipoMedido = (t: TipoCanal) => r.faturamentoCanal[t] > 0 || r.pedidosCanal[t] > 0;
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
        {/* Sem dia de venda não houve comanda: nem número sequencial, nem hora de
            emissão. "nº 0000 · emitida às 07:00" carimbava de ofício um documento que
            nunca foi emitido. */}
        <div className="flex items-center justify-between text-sm text-grafite-2">
          {semVenda ? (
            <span>Nenhuma comanda emitida</span>
          ) : (
            <>
              <span className="num">Comanda nº {String(comanda.numero).padStart(4, "0")}</span>
              <span className="num">Emitida às {comanda.emitidaEm}</span>
            </>
          )}
        </div>
        {/* Sem dia de venda não existe "último dia com dados": a data que sobra é a do
            grupo, não a deste filtro, e carimbá-la aqui seria datar um dia que não houve. */}
        <h2 id="comanda-titulo" className="mt-3 font-display text-lg font-semibold">
          {semVenda ? "Sem dia de venda neste filtro" : `${rotuloDia}, ${formatarDiaSemanaCurto(dia)} ${formatarDataCurta(dia)}`}
        </h2>

        <Corte />

        <p className="text-sm text-grafite-2">Faturamento</p>
        <p className={semVenda ? "text-lg leading-snug text-grafite-2" : "num font-display text-3xl font-semibold"}>
          {brl(r.faturamento)}
        </p>
        {semVenda && (
          <p className="mt-1 text-sm text-grafite-2">
            Não há nenhum dia de venda registrado para este filtro. Os campos abaixo não foram medidos — não são zero.
          </p>
        )}
        {!semVenda && comanda.meta !== null && comanda.metaPct !== null && comanda.situacaoMeta && (
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
        {!semVenda && comanda.meta === null && <p className="mt-1 text-sm text-grafite-2">Meta diária: [PREENCHER]</p>}

        <Corte />

        <dl>
          <Linha rotulo="Pedidos" valor={semVenda ? NAO_MEDIDO : formatarInteiro(r.pedidos)} />
          <Linha rotulo="Ticket médio" valor={semVenda ? NAO_MEDIDO : formatarBRL(r.ticket)} />
          <Linha rotulo="Margem estimada" valor={brl(r.margem)} detalhe={semVenda ? undefined : formatarPct(r.margemPct, 1)} />
        </dl>

        <Corte />

        <h3 className="text-sm text-grafite-2">Vendas por canal</h3>
        {/* A divisão por canal é um percentual DE um faturamento. Sem faturamento medido
            ela não existe: a barra de 0% e os três "0%" diriam que nenhum canal vendeu,
            quando a verdade é que ninguém olhou. */}
        {semVenda ? (
          <p className="mt-1 text-base text-grafite-2">
            {NAO_MEDIDO}: sem dia de venda não há faturamento para dividir entre os canais.
          </p>
        ) : (
          <>
            {/* A barra só soma o que foi medido: um tipo sem venda no período não vira
                segmento de largura 0, porque largura 0 afirmaria uma fatia apurada. */}
            <div className="mt-2 flex h-2.5 gap-[2px] overflow-hidden rounded-full" aria-hidden>
              {tipos.filter(tipoMedido).map((t) => (
                <div key={t} className={COR_TIPO[t]} style={{ width: `${r.canalPct[t] * 100}%` }} />
              ))}
            </div>
            <ul className={clsx("mt-2 grid gap-2 text-sm", tipos.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
              {tipos.map((t) => {
                const medido = tipoMedido(t);
                return (
                  <li key={t}>
                    <span className="flex items-center gap-1.5 text-grafite-2">
                      <span aria-hidden className={clsx("size-2 rounded-full", COR_TIPO[t])} />
                      {NOME_TIPO[t]}
                    </span>
                    <span className={clsx("text-base", medido ? "num font-medium" : "text-grafite-2")}>
                      {medido ? formatarPct(r.canalPct[t]) : NAO_MEDIDO}
                    </span>
                  </li>
                );
              })}
            </ul>
            {!tipos.every(tipoMedido) && (
              <p className="mt-2 text-sm text-grafite-2">
                Tipo de canal sem venda registrada no período fica fora da barra e da divisão: não há faturamento dele para dividir.
              </p>
            )}
            {canais.length > tipos.length && (
              <>
                <dl className="mt-3">
                  {canais.map((c) => {
                    const v = canalMedido(c) ? r.porCanal[c] : null;
                    return (
                      <Linha
                        key={c}
                        rotulo={cliente.canais[c].operacao && operacoesDo(cliente).length > 1 ? `${cliente.canais[c].operacao} · ${cliente.canais[c].nome}` : cliente.canais[c].nome}
                        valor={ouNaoMedido(v, (x) => formatarBRLInteiro(x.faturamento))}
                        detalhe={v && r.faturamento ? formatarPct(v.faturamento / r.faturamento) : undefined}
                      />
                    );
                  })}
                </dl>
                {!canais.every(canalMedido) && (
                  <p className="mt-1 text-sm text-grafite-2">
                    Canal sem venda registrada no período não entra na divisão: não há faturamento dele para dividir.
                  </p>
                )}
              </>
            )}
          </>
        )}

        <Corte />

        {/* Três estados, três ícones. Ausência de dia NÃO é o check verde (item 3 do
            critério de pronto) e também não é alerta vermelho: é o traço do não medido. */}
        <p className="flex items-start gap-2">
          {semDiaParaAvaliar ? (
            <CircleDashed aria-hidden className="mt-0.5 size-5 shrink-0 text-grafite-2" />
          ) : temAlerta ? (
            <OctagonAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-tomate" />
          ) : (
            <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-manjericao" />
          )}
          <span className={clsx(semDiaParaAvaliar && "text-grafite-2")}>
            <span className="sr-only">{temAlerta ? "Alerta: " : ""}</span>
            {comanda.alerta
              ? comanda.alerta.texto
              : "Sem dia de venda fechado neste filtro: não há nada a avaliar. Isto não quer dizer que o dia esteja dentro do plano."}
          </span>
        </p>

        <Corte />

        <h3 className="font-display text-lg font-semibold">Hoje</h3>
        {comanda.acoes.length === 0 ? (
          <p className="mt-1 text-grafite-2">
            {semDiaParaAvaliar
              ? "Sem dia de venda não há o que recomendar para hoje: nenhuma ação saiu de número nenhum."
              : "Nenhuma ação combinada ainda. As que estavam aqui eram exemplo nosso e saíram; entram as que o dono ditar. Lista vazia não quer dizer que não haja o que fazer."}
          </p>
        ) : (
          semDiaParaAvaliar && (
            <p className="mt-1 text-sm text-grafite-2">Lista padrão do plano. Não saiu de nenhum número deste filtro, porque não há número.</p>
          )
        )}
        <ul className="mt-1">
          {comanda.acoes.map((acao, i) => (
            <li key={acao.texto}>
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
                  {acao.texto}
                  {/* Achado A: as 13 ações da Le Tre têm origem EXEMPLO e chegavam aqui
                      sem selo. O dono lia recomendação fabricada como método da casa. */}
                  {acao.origem !== "REAL" && <MarcaExemplo className="ml-1.5" />}
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
