"use client";

import clsx from "clsx";
import { AlertTriangle, CircleCheck, CircleX } from "lucide-react";
import { NAO_MEDIDO, formatarBRL, formatarBRLInteiro, formatarInteiro, formatarPct, ouNaoMedido } from "@/lib/formato";
import { PERIODOS, type VisaoIfood } from "@/lib/types";
import { PedidosPorDia, PedidosPorFaixa } from "./graficos";
import { usePeriodo } from "./PeriodoContexto";
import { CabecalhoArea, Etiqueta, GradeIndicadores, Indicador, Painel, SemDado, TabelaRolavel, td, th } from "./ui";

export function IfoodTela({ visao }: { visao: VisaoIfood }) {
  const { periodo } = usePeriodo();
  const v = visao;
  const comparacao = PERIODOS.find((p) => p.id === periodo)!.comparacao;
  const i = v.indicadores;
  // te null = comissao_pct e taxa_pagamento_pct nao foram medidas (achado C).
  const te = v.taxaEfetiva;
  // `blocos` e nao `exemplo`: exemplo[k] e false tanto para REAL quanto para SEM_DADO,
  // e e justamente essa diferenca que a tela precisa mostrar.
  const b = v.blocos;
  const semVendas = b.vendas === "SEM_DADO";
  const mesPorExtenso = (m: string) => {
    const [ano, mes] = m.split("-");
    return `${new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(Number(ano), Number(mes) - 1, 15))} de ${ano}`;
  };
  /** Nota com 1 casa, ou a ausencia declarada. */
  const umaCasa = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <>
      <CabecalhoArea numero={1} nome="Vendas no iFood" frase={v.frase} origem={v.origem} blocos={b} />

      <div className="grid gap-5">
        <Painel origem={b.vendas} titulo="Resumo do período" descricao={`Variações ${comparacao}.`}>
          <GradeIndicadores>
            {/* Sem linha de venda no filtro, faturamento/pedidos/ticket somam zero por
                falta de parcela, não por medição: nenhum deles pode virar "R$ 0,00". */}
            <Indicador
              rotulo="Faturamento"
              valor={semVendas ? NAO_MEDIDO : formatarBRLInteiro(i.faturamento.atual)}
              comparacao={i.faturamento}
              detalhe={semVendas ? "nenhuma venda de iFood neste filtro" : undefined}
            />
            <Indicador
              rotulo="Pedidos"
              valor={semVendas ? NAO_MEDIDO : formatarInteiro(i.pedidos.atual)}
              comparacao={i.pedidos}
              detalhe={semVendas ? "nenhum pedido registrado" : undefined}
            />
            <Indicador
              rotulo="Ticket médio"
              valor={semVendas ? NAO_MEDIDO : formatarBRL(i.ticket.atual)}
              comparacao={i.ticket}
              detalhe={semVendas ? "sem pedido não há ticket" : undefined}
            />
            {/* Achado D: sem linha em ifood_operacao_dia nao existe nota, tempo nem
                cancelamento. "Nota 0,0" seria uma loja pessimamente avaliada e
                "Tempo 0 min" seria entrega instantanea — nenhuma das duas aconteceu. */}
            <Indicador
              origem={b.operacao}
              rotulo="Nota da loja"
              valor={ouNaoMedido(i.nota, (c) => umaCasa(c.atual))}
              detalhe={i.nota ? `antes ${umaCasa(i.nota.anterior)}` : "não há linha de operação do iFood na fonte"}
            />
            <Indicador
              origem={b.operacao}
              rotulo="Tempo médio de entrega"
              valor={ouNaoMedido(i.tempoEntregaMin, (c) => `${Math.round(c.atual)} min`)}
              detalhe={i.tempoEntregaMin ? `antes ${Math.round(i.tempoEntregaMin.anterior)} min` : "não há linha de operação do iFood na fonte"}
            />
            <Indicador
              origem={b.operacao}
              rotulo="Cancelamentos"
              valor={ouNaoMedido(i.cancelamentoPct, (c) => formatarPct(c.atual, 1))}
              comparacao={i.cancelamentoPct ?? undefined}
              emPontos
              detalhe={i.cancelamentoPct ? undefined : "não há linha de operação do iFood na fonte"}
            />
          </GradeIndicadores>
        </Painel>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Painel origem={b.taxa} titulo="Taxa efetiva do iFood" descricao="Comissão + taxa de pagamento + promoções bancadas por você.">
            {te ? (
              <>
                <p className="text-base">
                  De cada <span className="num font-medium">R$ 100</span> vendidos no iFood, sobram{" "}
                  <span className="num font-display text-2xl font-semibold">{formatarBRL(100 * (1 - te.pct))}</span> para pagar a pizza, a equipe e o lucro.
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
              </>
            ) : v.takeRateMedido ? (
              /* Achado C: o detalhamento nao existe (comissao e taxa de pagamento vem
                 nulas do banco), mas o take-rate do fechamento mensal EXISTE e e
                 verdadeiro. Mostrar ele e melhor do que mostrar o zero que era falso. */
              <>
                <p className="text-base">
                  No fechamento de <span className="font-medium">{mesPorExtenso(v.takeRateMedido.mes)}</span>, de cada{" "}
                  <span className="num font-medium">R$ 100</span> vendidos no iFood ficaram com a plataforma{" "}
                  <span className="num font-display text-2xl font-semibold">{formatarBRL(100 * v.takeRateMedido.pct)}</span>.
                </p>
                <p className="mt-3 text-sm text-grafite-2">
                  Este é o <span className="font-medium">take-rate medido no fechamento</span> ({formatarPct(v.takeRateMedido.pct, 2)} sobre{" "}
                  {formatarBRLInteiro(v.takeRateMedido.vendasBrutas)} de vendas brutas) de <span className="font-medium">todas as lojas de iFood do grupo</span>,
                  não do período nem da marca escolhidos acima.
                </p>
                <p className="mt-2 text-sm text-grafite-2">
                  A quebra entre comissão, taxa de pagamento e promoções ainda não foi medida: essas colunas estão vazias na fonte. Por isso o
                  detalhamento aparece como {NAO_MEDIDO} em vez de zero.
                </p>
              </>
            ) : (
              <SemDado>
                A taxa efetiva do iFood ainda não foi medida para este filtro: comissão, taxa de pagamento e take-rate estão todos ausentes na fonte.
                Não é uma taxa de zero — é a ausência do número.
              </SemDado>
            )}
          </Painel>

          <Painel
            origem={b.funil}
            titulo="Funil da loja"
            descricao={
              v.funil && v.funil.conversao !== null
                ? `De cada 100 visitas, ${formatarInteiro(v.funil.conversao * 100)} viram pedido (antes: ${v.funil.conversaoAnterior === null ? NAO_MEDIDO : formatarInteiro(v.funil.conversaoAnterior * 100)}).`
                : undefined
            }
          >
            {/* v.funil null = nenhuma linha de funil no periodo. Era daqui que saia a
                largura "NaN%": valor 0 sobre etapa[0] 0. */}
            {v.funil ? (
              <ol className="grid gap-3">
                {v.funil.etapas.map((e, idx) => {
                  const base = v.funil!.etapas[0].valor;
                  const largura = base > 0 ? (e.valor / base) * 100 : 0;
                  const anterior = v.funil!.etapas[idx - 1];
                  return (
                    <li key={e.rotulo}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span>{e.rotulo}</span>
                        <span className="num font-medium">{formatarInteiro(e.valor)}</span>
                      </div>
                      <div className="mt-1 h-2.5 rounded-full bg-bancada" aria-hidden>
                        <div className={clsx("h-full rounded-full", idx === 3 ? "bg-comanda" : "bg-cinza-grafico")} style={{ width: `${Math.max(largura, 1)}%` }} />
                      </div>
                      {anterior && (
                        <p className="num mt-0.5 text-sm text-grafite-2">
                          {anterior.valor > 0 ? `${formatarPct(e.valor / anterior.valor)} da etapa anterior` : `${NAO_MEDIDO} na etapa anterior`}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <SemDado>
                Não há nenhum dia de funil medido neste período: a tabela de funil do iFood está vazia para este filtro. Quatro barras zeradas
                afirmariam zero visita à loja, que é coisa bem diferente.
              </SemDado>
            )}
          </Painel>
        </div>

        <Painel
          origem={b.pratos}
          titulo="Os 10 pratos que mais vendem"
          descricao={`Margem de contribuição no iFood: preço − imposto − comissão − taxa de pagamento − CMV − embalagem. Margem mínima: ${formatarPct(v.margemMinimaPct)}.`}
        >
          {!v.pratos.length ? (
            <SemDado>Nenhum prato de iFood cadastrado para este filtro, então não há o que ranquear nem margem que calcular.</SemDado>
          ) : (
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
                  {/* margem null = taxas do iFood nao medidas; sem elas a margem sairia
                      INFLADA, que engana mais do que um zero. */}
                  <td className={clsx(td, "text-right")}>
                    {ouNaoMedido(p.margemUnitaria, formatarBRL)}{" "}
                    {p.margemPct !== null && <span className="block text-sm text-grafite-2">{formatarPct(p.margemPct)}</span>}
                  </td>
                  <td className={clsx(td, "text-right")}>{ouNaoMedido(p.margemTotal, formatarBRLInteiro)}</td>
                </tr>
              ))}
            </tbody>
          </TabelaRolavel>
          )}
        </Painel>

        <Painel
          origem={b.promocoes}
          titulo="Promoções e cupons"
          descricao="Resultado = margem dos pedidos com a promoção − o que você bancou. Conta como se esses pedidos só existissem por causa da promoção, o cenário mais favorável a ela."
        >
          {!v.promocoes.length && <SemDado>Nenhuma promoção cadastrada para este filtro. Não há cupom medido — nem um que tenha dado certo, nem um que tenha dado errado.</SemDado>}
          <ul className="grid gap-3 sm:grid-cols-2">
            {v.promocoes.map((p) => {
              // resultado null = sem as taxas do iFood nao da para dizer se a promocao
              // ganhou ou perdeu; dizer "Ganhou" por falta de custo seria o pior erro.
              const ganhou = p.resultado !== null && p.resultado >= 0;
              return (
                <li key={p.id} className="rounded-botao border border-linha p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{p.nome}</p>
                      <p className="text-sm text-grafite-2">{p.tipo}</p>
                    </div>
                    {p.resultado === null ? (
                      <Etiqueta icone={AlertTriangle} cor="text-grafite-2">Resultado {NAO_MEDIDO}</Etiqueta>
                    ) : (
                      <Etiqueta icone={ganhou ? CircleCheck : CircleX} cor={ganhou ? "text-manjericao" : "text-tomate"}>
                        {ganhou ? "Ganhou" : "Perdeu"} {formatarBRLInteiro(Math.abs(p.resultado))}
                      </Etiqueta>
                    )}
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
                      <dd className="text-base">{ouNaoMedido(p.margemDosPedidos, formatarBRLInteiro)}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        </Painel>

        <div className="grid gap-5 lg:grid-cols-2">
          <Painel origem={b.vendas} titulo="Pedidos por dia" descricao={periodo === "ontem" ? "Últimos 7 dias, para dar contexto ao dia de ontem." : undefined}>
            <PedidosPorDia dados={v.pedidosDia} />
          </Painel>
          <Painel origem={b.faixas} titulo="Pedidos por faixa de horário" descricao={periodo === "ontem" ? "Últimos 7 dias." : undefined}>
            <PedidosPorFaixa dados={v.faixas} />
          </Painel>
        </div>
      </div>
    </>
  );
}
