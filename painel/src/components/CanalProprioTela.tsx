"use client";

import clsx from "clsx";
import { CircleCheck, CircleDot, CirclePause, Clock3, Film, Image as ImageIcon, Images, TrendingDown, TrendingUp } from "lucide-react";
import { formatarBRL, formatarBRLInteiro, formatarInteiro, formatarPct } from "@/lib/formato";
import { PERIODOS, type StatusCampanha, type VisaoCanalProprio } from "@/lib/types";
import { CanaisPorSemana } from "./graficos";
import { usePeriodo } from "./PeriodoContexto";
import { CabecalhoArea, Etiqueta, GradeIndicadores, Indicador, Painel } from "./ui";

const STATUS: Record<StatusCampanha, { rotulo: string; icone: typeof CircleDot; cor: string }> = {
  ativa: { rotulo: "Ativa", icone: CircleDot, cor: "text-manjericao" },
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
  const ctr = t.impressoes ? t.cliques / t.impressoes : 0;
  const ex = v.exemplo;

  return (
    <>
      <CabecalhoArea numero={2} nome="Canal próprio e tráfego" frase={v.frase} origem={v.origem} />

      <div className="grid gap-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Painel titulo="Vendas por canal, semana a semana" descricao="Últimas 8 semanas, em % do faturamento.">
            <CanaisPorSemana dados={v.semanas} meta={v.metaPct} canais={v.canais} />
          </Painel>

          <Painel exemplo={ex.economia} titulo="O que o canal próprio economizou" descricao="Comparado com vender os mesmos pedidos pelo iFood, com a taxa do iFood cadastrada.">
            <p className="text-sm text-grafite-2">Você deixou de pagar</p>
            <p className="num font-display text-3xl font-semibold tracking-tight">{formatarBRLInteiro(e.economia)}</p>
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
            <div className="mt-4 border-t border-linha pt-3">
              <Indicador rotulo="Participação do canal próprio" valor={formatarPct(v.proprioPct.atual)} comparacao={v.proprioPct} emPontos detalhe={v.metaPct === null ? "meta: [PREENCHER]" : `meta ${formatarPct(v.metaPct)}`} />
            </div>
          </Painel>
        </div>

        <Painel exemplo={ex.anuncios} titulo="Tráfego pago (Meta Ads)" descricao={`Pedidos atribuídos pelo pixel. Variações ${comparacao}.`}>
          <GradeIndicadores>
            <Indicador rotulo="Investimento" valor={formatarBRLInteiro(t.investimento.atual)} comparacao={t.investimento} />
            <Indicador rotulo="Alcance" valor={formatarInteiro(t.alcance.atual)} comparacao={t.alcance} detalhe="pessoas" />
            <Indicador rotulo="Cliques" valor={formatarInteiro(t.cliques)} detalhe={`${formatarPct(ctr, 1)} de quem viu`} />
            <Indicador rotulo="Pedidos atribuídos" valor={formatarInteiro(t.pedidos.atual)} comparacao={t.pedidos} />
            <Indicador rotulo="Custo por pedido" valor={t.pedidos.atual ? formatarBRL(t.custoPorPedido.atual) : "sem pedidos"} comparacao={t.pedidos.atual && t.pedidos.anterior ? t.custoPorPedido : undefined} />
            <Indicador rotulo="Retorno em vendas (ROAS)" valor={`${t.roas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x`} detalhe={`${formatarBRLInteiro(t.faturamento)} vendidos`} />
          </GradeIndicadores>
          <div className="mt-5 grid gap-3 rounded-botao bg-bancada p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6">
            <div>
              <p className="text-sm text-grafite-2">Retorno em margem</p>
              <p className="num font-display text-2xl font-semibold">{t.roasMargem.toLocaleString("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}x</p>
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
        </Painel>

        <div className="grid gap-5 lg:grid-cols-2">
          <Painel exemplo={ex.anuncios} titulo="Ranking de criativos" descricao="Do menor para o maior custo por pedido. Melhor e pior só entre quem teve 3 pedidos ou mais.">
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
                      <span className="block font-medium">{k.custoPorPedido === null ? "—" : formatarBRL(k.custoPorPedido)}</span>
                      <span className="block text-sm text-grafite-2">{k.pedidos} pedidos</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </Painel>

          <Painel exemplo={ex.anuncios} titulo="Campanhas">
            <ul className="divide-y divide-linha">
              {v.campanhas.map((c) => {
                const s = STATUS[c.status];
                return (
                  <li key={c.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-3 first:pt-0">
                    <span className="min-w-0">
                      <span className="block font-medium">{c.nome}</span>
                      <span className="block text-sm text-grafite-2">
                        {c.objetivo} · {formatarBRLInteiro(c.orcamentoDia)}/dia
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <Etiqueta icone={s.icone} cor={s.cor}>{s.rotulo}</Etiqueta>
                      <span className="num text-sm text-grafite-2">
                        {formatarBRLInteiro(c.investimento)} · {c.pedidos} pedidos
                        {c.custoPorPedido !== null && ` · ${formatarBRL(c.custoPorPedido)}/pedido`}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Painel>
        </div>
      </div>
    </>
  );
}
