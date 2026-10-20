"use client";

import clsx from "clsx";
import { AlertTriangle, CircleCheck, CircleX } from "lucide-react";
import { formatarBRL, formatarBRLInteiro, formatarInteiro, formatarPct } from "@/lib/formato";
import { PERIODOS, type VisaoIfood } from "@/lib/types";
import { PedidosPorDia, PedidosPorFaixa } from "./graficos";
import { usePeriodo } from "./PeriodoContexto";
import { CabecalhoArea, Etiqueta, GradeIndicadores, Indicador, Painel, TabelaRolavel, td, th } from "./ui";

export function IfoodTela({ visao }: { visao: VisaoIfood }) {
  const { periodo } = usePeriodo();
  const v = visao;
  const comparacao = PERIODOS.find((p) => p.id === periodo)!.comparacao;
  const i = v.indicadores;
  const te = v.taxaEfetiva;
  const sobra = 100 * (1 - te.pct);
  const ex = v.exemplo;

  return (
    <>
      <CabecalhoArea numero={1} nome="Vendas no iFood" frase={v.frase} origem={v.origem} />

      <div className="grid gap-5">
        <Painel titulo="Resumo do período" descricao={`Variações ${comparacao}.`}>
          <GradeIndicadores>
            <Indicador rotulo="Faturamento" valor={formatarBRLInteiro(i.faturamento.atual)} comparacao={i.faturamento} />
            <Indicador rotulo="Pedidos" valor={formatarInteiro(i.pedidos.atual)} comparacao={i.pedidos} />
            <Indicador rotulo="Ticket médio" valor={formatarBRL(i.ticket.atual)} comparacao={i.ticket} />
            <Indicador exemplo={ex.operacao} rotulo="Nota da loja" valor={i.nota.atual.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} detalhe={`antes ${i.nota.anterior.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`} />
            <Indicador exemplo={ex.operacao} rotulo="Tempo médio de entrega" valor={`${Math.round(i.tempoEntregaMin.atual)} min`} detalhe={`antes ${Math.round(i.tempoEntregaMin.anterior)} min`} />
            <Indicador exemplo={ex.operacao} rotulo="Cancelamentos" valor={formatarPct(i.cancelamentoPct.atual, 1)} comparacao={i.cancelamentoPct} emPontos />
          </GradeIndicadores>
        </Painel>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Painel exemplo={ex.taxa} titulo="Taxa efetiva do iFood" descricao="Comissão + taxa de pagamento + promoções bancadas por você.">
            <p className="text-base">
              De cada <span className="num font-medium">R$ 100</span> vendidos no iFood, sobram{" "}
              <span className="num font-display text-2xl font-semibold">{formatarBRL(sobra)}</span> para pagar a pizza, a equipe e o lucro.
            </p>
            <div className="mt-4 flex h-3 gap-[2px] overflow-hidden rounded-full" aria-hidden>
              <div className="bg-cinza-grafico" style={{ width: `${(te.comissao / te.faturamento) * 100}%` }} />
              <div className="bg-linha" style={{ width: `${(te.taxaPagamento / te.faturamento) * 100}%` }} />
              <div className="bg-grafite-2" style={{ width: `${(te.promocoes / te.faturamento) * 100}%` }} />
              <div className="flex-1 bg-comanda" />
            </div>
            <dl className="mt-4 grid gap-1.5">
              {[
                ["Comissão", te.comissao, "bg-cinza-grafico"],
                ["Taxa de pagamento", te.taxaPagamento, "bg-linha"],
                ["Promoções bancadas", te.promocoes, "bg-grafite-2"],
              ].map(([rotulo, valor, cor]) => (
                <div key={rotulo as string} className="flex items-center gap-2">
                  <span aria-hidden className={clsx("size-2.5 rounded-sm", cor as string)} />
                  <dt className="text-grafite-2">{rotulo as string}</dt>
                  <dd className="num ml-auto">
                    {formatarBRLInteiro(valor as number)} <span className="text-sm text-grafite-2">· {formatarPct((valor as number) / te.faturamento, 1)}</span>
                  </dd>
                </div>
              ))}
              <div className="mt-1 flex items-center gap-2 border-t border-linha pt-2 font-medium">
                <dt>Total que ficou com o iFood</dt>
                <dd className="num ml-auto">
                  {formatarBRLInteiro(te.total)} <span className="text-sm text-grafite-2">· {formatarPct(te.pct, 1)}</span>
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 rounded-sm bg-comanda" />
                <dt className="text-grafite-2">Sobrou para você</dt>
                <dd className="num ml-auto">{formatarBRLInteiro(te.faturamento - te.total)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-grafite-2">
              No período anterior, a taxa efetiva era {formatarPct(te.pctAnterior, 1)}.
            </p>
          </Painel>

          <Painel exemplo={ex.funil} titulo="Funil da loja" descricao={`De cada 100 visitas, ${formatarInteiro(v.funil.conversao * 100)} viram pedido (antes: ${formatarInteiro(v.funil.conversaoAnterior * 100)}).`}>
            <ol className="grid gap-3">
              {v.funil.etapas.map((e, idx) => {
                const largura = (e.valor / v.funil.etapas[0].valor) * 100;
                const anterior = v.funil.etapas[idx - 1];
                return (
                  <li key={e.rotulo}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span>{e.rotulo}</span>
                      <span className="num font-medium">{formatarInteiro(e.valor)}</span>
                    </div>
                    <div className="mt-1 h-2.5 rounded-full bg-bancada" aria-hidden>
                      <div className={clsx("h-full rounded-full", idx === 3 ? "bg-comanda" : "bg-cinza-grafico")} style={{ width: `${Math.max(largura, 1)}%` }} />
                    </div>
                    {anterior && <p className="num mt-0.5 text-sm text-grafite-2">{formatarPct(e.valor / anterior.valor)} da etapa anterior</p>}
                  </li>
                );
              })}
            </ol>
          </Painel>
        </div>

        <Painel
          exemplo={ex.pratos}
          titulo="Os 10 pratos que mais vendem"
          descricao={`Margem de contribuição no iFood: preço − imposto − comissão − taxa de pagamento − CMV − embalagem. Margem mínima: ${formatarPct(v.margemMinimaPct)}.`}
        >
          <TabelaRolavel legenda="Os 10 pratos que mais vendem no iFood, com margem">
            <thead>
              <tr>
                <th scope="col" className={th}>Prato</th>
                <th scope="col" className={clsx(th, "text-right")}>Qtd.</th>
                <th scope="col" className={clsx(th, "text-right")}>Vendas</th>
                <th scope="col" className={clsx(th, "text-right")}>Margem por item</th>
                <th scope="col" className={clsx(th, "text-right")}>Margem total</th>
              </tr>
            </thead>
            <tbody>
              {v.pratos.map((p) => (
                <tr key={p.id}>
                  <td className={td}>
                    <span className="block">{p.nome}</span>
                    {p.vendeMuitoMargemBaixa && (
                      <span className="mt-1 block">
                        <Etiqueta icone={AlertTriangle} cor="text-acafrao">Vende muito, margem baixa</Etiqueta>
                      </span>
                    )}
                  </td>
                  <td className={clsx(td, "text-right")}>{formatarInteiro(p.qtd)}</td>
                  <td className={clsx(td, "text-right")}>{formatarBRLInteiro(p.faturamento)}</td>
                  <td className={clsx(td, "text-right")}>
                    {formatarBRL(p.margemUnitaria)} <span className="block text-sm text-grafite-2">{formatarPct(p.margemPct)}</span>
                  </td>
                  <td className={clsx(td, "text-right")}>{formatarBRLInteiro(p.margemTotal)}</td>
                </tr>
              ))}
            </tbody>
          </TabelaRolavel>
        </Painel>

        <Painel
          exemplo={ex.promocoes}
          titulo="Promoções e cupons"
          descricao="Resultado = margem dos pedidos com a promoção − o que você bancou. Conta como se esses pedidos só existissem por causa da promoção, o cenário mais favorável a ela."
        >
          <ul className="grid gap-3 sm:grid-cols-2">
            {v.promocoes.map((p) => {
              const ganhou = p.resultado >= 0;
              return (
                <li key={p.id} className="rounded-botao border border-linha p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{p.nome}</p>
                      <p className="text-sm text-grafite-2">{p.tipo}</p>
                    </div>
                    <Etiqueta icone={ganhou ? CircleCheck : CircleX} cor={ganhou ? "text-manjericao" : "text-tomate"}>
                      {ganhou ? "Ganhou" : "Perdeu"} {formatarBRLInteiro(Math.abs(p.resultado))}
                    </Etiqueta>
                  </div>
                  <dl className="num mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-grafite-2">Pedidos</dt>
                      <dd className="text-base">{formatarInteiro(p.pedidos)}</dd>
                    </div>
                    <div>
                      <dt className="text-grafite-2">Você bancou</dt>
                      <dd className="text-base">{formatarBRLInteiro(p.custo)}</dd>
                    </div>
                    <div>
                      <dt className="text-grafite-2">Margem dos pedidos</dt>
                      <dd className="text-base">{formatarBRLInteiro(p.margemDosPedidos)}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        </Painel>

        <div className="grid gap-5 lg:grid-cols-2">
          <Painel titulo="Pedidos por dia" descricao={periodo === "ontem" ? "Últimos 7 dias, para dar contexto ao dia de ontem." : undefined}>
            <PedidosPorDia dados={v.pedidosDia} />
          </Painel>
          <Painel exemplo={ex.faixas} titulo="Pedidos por faixa de horário" descricao={periodo === "ontem" ? "Últimos 7 dias." : undefined}>
            <PedidosPorFaixa dados={v.faixas} />
          </Painel>
        </div>
      </div>
    </>
  );
}
