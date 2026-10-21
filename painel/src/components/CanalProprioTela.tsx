"use client";

import clsx from "clsx";
import { CircleCheck, CircleDot, CirclePause, Clock3, Film, Image as ImageIcon, Images, TrendingDown, TrendingUp } from "lucide-react";
import { razao } from "@/lib/calculos";
import { NAO_MEDIDO, formatarBRL, formatarBRLInteiro, formatarInteiro, formatarPct, ouNaoMedido } from "@/lib/formato";
import { PERIODOS, type StatusCampanha, type VisaoCanalProprio } from "@/lib/types";
import { CanaisPorSemana } from "./graficos";
import { usePeriodo } from "./PeriodoContexto";
import { CabecalhoArea, Etiqueta, GradeIndicadores, Indicador, Painel, SemDado } from "./ui";

/**
 * "Ativa" é um ESTADO da campanha, não um julgamento dela. O DESIGN.md reserva o
 * manjericão para "bom", e campanha ligada não quer dizer campanha boa — numa tela sem
 * nenhum número medido, vinte bolinhas verdes eram a única coisa colorida e liam-se
 * como "está tudo certo". Azul comanda é a cor de "ligado/ativo" no sistema.
 */
const STATUS: Record<StatusCampanha, { rotulo: string; icone: typeof CircleDot; cor: string }> = {
  ativa: { rotulo: "Ativa", icone: CircleDot, cor: "text-comanda" },
  pausada: { rotulo: "Pausada", icone: CirclePause, cor: "text-grafite-2" },
  em_analise: { rotulo: "Em análise", icone: Clock3, cor: "text-acafrao" },
};

const ICONE_FORMATO: Record<string, typeof Film> = { Vídeo: Film, Imagem: ImageIcon, Carrossel: Images };

export function CanalProprioTela({ visao }: { visao: VisaoCanalProprio }) {
  const { periodo } = usePeriodo();
  const v = visao;
  const comparacao = PERIODOS.find((p) => p.id === periodo)!.comparacao;
  const t = v.trafego;
  const e = v.economia;
  // razao em vez de dividir: sem impressão não existe CTR, e "0,0% de quem viu" diria
  // que o anúncio apareceu para alguém e ninguém clicou.
  const ctr = razao(t.cliques, t.impressoes);
  const b = v.blocos;
  const semVendas = b.vendas === "SEM_DADO";
  const semEconomia = b.economia === "SEM_DADO";
  // Achado F: 20 campanhas REAIS e zero criativo deixavam este bloco se declarar REAL
  // mostrando investimento R$ 0 e ROAS 0,0x, sem selo nenhum. Era a tela que mais
  // enganava e a única sem aviso.
  const semAnuncios = b.anuncios === "SEM_DADO";

  return (
    <>
      <CabecalhoArea numero={2} nome="Canal próprio e tráfego" frase={v.frase} origem={v.origem} blocos={b} />

      <div className="grid gap-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Painel origem={b.vendas} titulo="Vendas por canal, semana a semana" descricao="Últimas 8 semanas, em % do faturamento.">
            <CanaisPorSemana dados={v.semanas} meta={v.metaPct} canais={v.canais} semDado={semVendas} />
          </Painel>

          <Painel origem={b.economia} titulo="O que o canal próprio economizou" descricao="Comparado com vender os mesmos pedidos pelo iFood, com a taxa do iFood cadastrada.">
            {semEconomia ? (
              <SemDado>
                Não há pedido medido no canal próprio para este filtro, então não existe economia a comparar. Uma economia zerada diria que o canal
                próprio rodou e não rendeu nada.
              </SemDado>
            ) : (
              <>
                <p className="text-sm text-grafite-2">Você deixou de pagar</p>
                <p className="num font-display text-3xl font-semibold">{formatarBRLInteiro(e.economia)}</p>
                <p className="mt-1 text-base">
                  em <span className="num font-medium">{formatarInteiro(e.pedidos)}</span> pedidos que vieram pelo canal próprio ({formatarBRLInteiro(e.faturamento)} em vendas).
                </p>
                <dl className="num mt-4 grid gap-1.5 border-t border-linha pt-3">
                  <div className="flex justify-between gap-2">
                    <dt className="text-grafite-2">Se fossem pelo iFood</dt>
                    <dd>{formatarBRLInteiro(e.custoSeFosseIfood)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-grafite-2">Custo no canal próprio (taxa e entrega)</dt>
                    <dd>− {formatarBRLInteiro(e.custoNoCanalProprio)}</dd>
                  </div>
                </dl>
              </>
            )}
            <div className="mt-4 border-t border-linha pt-3">
              {/* metaPct null = a chave tenant_config 'canal_proprio.meta_pct' não existe
                  (achado B). Sem meta não há régua: [PREENCHER], nunca "meta 0,0%". */}
              <Indicador
                rotulo="Participação do canal próprio"
                valor={semVendas ? NAO_MEDIDO : formatarPct(v.proprioPct.atual)}
                comparacao={semVendas ? undefined : v.proprioPct}
                emPontos
                detalhe={semVendas ? "sem venda medida não há participação" : v.metaPct === null ? "meta: [PREENCHER]" : `meta ${formatarPct(v.metaPct)}`}
              />
            </div>
          </Painel>
        </div>

        <Painel origem={b.anuncios} titulo="Tráfego pago (Meta Ads)" descricao={`Pedidos atribuídos pelo pixel. Variações ${comparacao}.`}>
          <GradeIndicadores>
            <Indicador
              rotulo="Investimento"
              valor={semAnuncios ? NAO_MEDIDO : formatarBRLInteiro(t.investimento.atual)}
              comparacao={semAnuncios ? undefined : t.investimento}
              detalhe={
                !semAnuncios ? undefined
                : t.naoAtribuido ? "há investimento gravado que o painel ainda não sabe atribuir"
                : "nenhum anúncio com investimento no período"
              }
            />
            <Indicador
              rotulo="Alcance"
              valor={semAnuncios ? NAO_MEDIDO : formatarInteiro(t.alcance.atual)}
              comparacao={semAnuncios ? undefined : t.alcance}
              detalhe={!semAnuncios ? "pessoas" : t.naoAtribuido ? "anúncio houve; o alcance do período é que não foi medido" : "sem anúncio rodando não há alcance"}
            />
            <Indicador
              rotulo="Cliques"
              valor={semAnuncios ? NAO_MEDIDO : formatarInteiro(t.cliques)}
              detalhe={!semAnuncios ? `${ouNaoMedido(ctr, (x) => formatarPct(x, 1))} de quem viu` : t.naoAtribuido ? "anúncio houve; os cliques é que não vieram atribuídos" : "sem anúncio rodando não há clique"}
            />
            <Indicador
              rotulo="Pedidos atribuídos"
              valor={semAnuncios ? NAO_MEDIDO : formatarInteiro(t.pedidos.atual)}
              comparacao={semAnuncios ? undefined : t.pedidos}
              detalhe={
                !semAnuncios ? undefined
                : t.naoAtribuido ? "há pedido gravado que o painel ainda não sabe atribuir"
                : "o pixel não atribuiu nenhum pedido"
              }
            />
            {/* custoPorPedido mudou de Comparacao para duas pontas nullable: só vira
                comparação quando as duas foram medidas. */}
            <Indicador
              rotulo="Custo por pedido"
              valor={ouNaoMedido(t.custoPorPedido.atual, formatarBRL)}
              comparacao={t.custoPorPedido.atual !== null && t.custoPorPedido.anterior !== null ? { atual: t.custoPorPedido.atual, anterior: t.custoPorPedido.anterior } : undefined}
              detalhe={t.custoPorPedido.atual === null ? "sem pedido atribuído não há custo por pedido" : undefined}
            />
            {/* roas null = investimento zero no período. "0,0x" afirmaria retorno nulo. */}
            <Indicador
              rotulo="Retorno em vendas (ROAS)"
              valor={ouNaoMedido(t.roas, (x) => `${x.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x`)}
              detalhe={t.roas !== null ? `${formatarBRLInteiro(t.faturamento)} vendidos` : t.naoAtribuido ? "há investimento no período, mas o painel não consegue ligá-lo a venda" : "sem investimento no período"}
            />
          </GradeIndicadores>
          {t.roasMargem === null ? (
            <div className="mt-5">
              {/* Dizer "não houve investimento" quando HÁ investimento gravado é a
                  mentira da fase 0 virada do avesso. Enquanto a leitura agregar por
                  criativo e o criativo_id vier nulo, a tela declara o valor que existe
                  e diz por que ele não aparece nos indicadores acima. */}
              {t.naoAtribuido ? (
                <SemDado>
                  O retorno não pode ser calculado, mas isto não é ausência de campanha: há{" "}
                  {formatarBRLInteiro(t.naoAtribuido.investimento)} de investimento e {formatarInteiro(t.naoAtribuido.pedidos)} pedidos gravados
                  no período sem criativo identificado. O painel agrega o tráfego por criativo, então esse dinheiro não entra em nenhum número
                  desta tela — está no banco, e é só o painel que ainda não sabe onde pendurá-lo.
                </SemDado>
              ) : (
                <SemDado>
                  Não houve investimento em anúncio neste período, então não há retorno a medir. Isto não é um retorno de zero: é a ausência de
                  campanha rodando.
                </SemDado>
              )}
            </div>
          ) : (
            <div className="mt-5 grid gap-3 rounded-botao bg-bancada p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6">
              <div>
                <p className="text-sm text-grafite-2">Retorno em margem</p>
                <p className="num font-display text-2xl font-semibold">
                  {t.roasMargem.toLocaleString("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}x
                </p>
              </div>
              <p className="flex items-start gap-2 text-base">
                {t.sobraDepoisDoAnuncio >= 0 ? (
                  <TrendingUp aria-hidden className="mt-0.5 size-5 shrink-0 text-manjericao" />
                ) : (
                  <TrendingDown aria-hidden className="mt-0.5 size-5 shrink-0 text-tomate" />
                )}
                <span>
                  Cada R$ 1 em anúncio trouxe {formatarBRL(t.roasMargem)} de margem de contribuição. Depois de pagar o anúncio,{" "}
                  {t.sobraDepoisDoAnuncio >= 0 ? "sobraram" : "faltaram"} <span className="num font-medium">{formatarBRLInteiro(Math.abs(t.sobraDepoisDoAnuncio))}</span>.
                </span>
              </p>
            </div>
          )}
        </Painel>

        <div className="grid gap-5 lg:grid-cols-2">
          <Painel origem={b.anuncios} titulo="Ranking de criativos" descricao="Do menor para o maior custo por pedido. Melhor e pior só entre quem teve 3 pedidos ou mais.">
            {!v.criativos.length ? (
              // A lista é agregada por criativo e filtrada por investimento > 0; com o
              // criativo_id nulo na fonte ela sai vazia mesmo havendo anúncio gravado.
              // Afirmar "não há anúncio registrado" nesse caso é o zero fabricado do
              // avesso: a tela nega o que o banco tem.
              t.naoAtribuido ? (
                <SemDado>
                  O ranking está vazio porque nenhuma linha de anúncio do período veio com criativo identificado — não porque não houve anúncio:
                  há {formatarBRLInteiro(t.naoAtribuido.investimento)} de investimento e {formatarInteiro(t.naoAtribuido.pedidos)} pedidos
                  gravados no período. O painel agrega o tráfego por criativo, então esse dinheiro não aparece em nenhuma linha desta lista.
                </SemDado>
              ) : (
                <SemDado>
                  Nenhum criativo com investimento no período: a tabela de criativos está vazia para este filtro. Um ranking em branco não quer
                  dizer que os anúncios foram mal — quer dizer que não há anúncio registrado.
                </SemDado>
              )
            ) : (
              <ol className="grid grid-cols-[minmax(0,1fr)] gap-2">
                {v.criativos.map((k, idx) => {
                  const Icone = ICONE_FORMATO[k.formato] ?? ImageIcon;
                  return (
                    <li key={k.id} className={clsx("flex items-center gap-3 rounded-botao border p-2.5", k.marca ? "border-grafite-2/40" : "border-linha")}>
                      <span className="num w-5 text-right text-sm text-grafite-2">{idx + 1}</span>
                      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-botao bg-bancada text-grafite-2">
                        <Icone className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{k.nome}</span>
                        <span className="block truncate text-sm text-grafite-2">{k.campanha}</span>
                        {k.marca && (
                          <span className="mt-1 block">
                            <Etiqueta icone={k.marca === "melhor" ? CircleCheck : TrendingDown} cor={k.marca === "melhor" ? "text-manjericao" : "text-tomate"}>
                              {k.marca === "melhor" ? "Melhor custo" : "Pior custo"}
                            </Etiqueta>
                          </span>
                        )}
                      </span>
                      <span className="num shrink-0 text-right">
                        <span className={clsx("block", k.custoPorPedido === null ? "text-sm text-grafite-2" : "font-medium")}>
                          {ouNaoMedido(k.custoPorPedido, formatarBRL)}
                        </span>
                        <span className="block text-sm text-grafite-2">{k.pedidos} pedidos</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Painel>

          <Painel
            origem={b.anuncios}
            titulo="Campanhas"
            descricao="Até a fase 1 a lista de campanhas não é filtrada por marca: ela é de todas as marcas do grupo, não só da escolhida no filtro acima."
          >
            {!v.campanhas.length ? (
              <SemDado>Nenhuma campanha cadastrada para este filtro.</SemDado>
            ) : (
              <ul className="divide-y divide-linha">
                {v.campanhas.map((c) => {
                  const s = STATUS[c.status];
                  return (
                    <li key={c.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-3 first:pt-0">
                      <span className="min-w-0">
                        <span className="block font-medium">{c.nome}</span>
                        {/* orcamento_dia vem NULL para as 20 campanhas da Le Tre (medido
                            em 20/10/2026) e a camada de dados converte NULL em 0, então
                            a tela escrevia "R$ 0/dia" numa campanha ATIVA — orçamento
                            zero não existe. Enquanto o campo não for nullable na fonte,
                            o zero aqui só pode ser lido como ausência. */}
                        <span className="block text-sm text-grafite-2">
                          {c.objetivo} · {c.orcamentoDia > 0 ? `${formatarBRLInteiro(c.orcamentoDia)}/dia` : `orçamento diário ${NAO_MEDIDO}`}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <Etiqueta icone={s.icone} cor={s.cor}>{s.rotulo}</Etiqueta>
                        {/* Sem linha de anúncio no período, "R$ 0 · 0 pedidos" afirmaria
                            uma campanha que rodou sem resultado. Ela pode nem ter rodado. */}
                        <span className="num text-sm text-grafite-2">
                          {semAnuncios
                            ? `${NAO_MEDIDO} no período`
                            : `${formatarBRLInteiro(c.investimento)} · ${c.pedidos} pedidos${c.custoPorPedido !== null ? ` · ${formatarBRL(c.custoPorPedido)}/pedido` : ""}`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Painel>
        </div>
      </div>
    </>
  );
}
