"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { Bot, Check, ChevronRight, Headset, Lock, RotateCcw, ShoppingBag, UserRound } from "lucide-react";
import { NAO_MEDIDO, formatarBRL, formatarBRLInteiro, formatarInteiro, formatarPct, ouNaoMedido } from "@/lib/formato";
import { PERIODOS, type Conversa, type VisaoWhatsapp } from "@/lib/types";
import { MarcaOrigem } from "./FaixaExemplo";
import { usePeriodo } from "./PeriodoContexto";
import { CabecalhoArea, Etiqueta, GradeIndicadores, Indicador, Painel, SemDado } from "./ui";

const DESFECHO: Record<Conversa["desfecho"], { rotulo: string; icone: typeof ShoppingBag; cor: string }> = {
  pedido: { rotulo: "Virou pedido", icone: ShoppingBag, cor: "text-manjericao" },
  recuperado: { rotulo: "Recuperado no follow-up", icone: RotateCcw, cor: "text-manjericao" },
  humano: { rotulo: "Passou para atendente", icone: Headset, cor: "text-acafrao" },
  sem_pedido: { rotulo: "Sem pedido", icone: ChevronRight, cor: "text-grafite-2" },
};

const hora = (iso: string) => {
  const [d, h] = iso.split("T");
  const [, m, dia] = d.split("-");
  return `${dia}/${m} ${h}`;
};

function Chat({ conversa }: { conversa: Conversa }) {
  return (
    <div className="rounded-botao bg-bancada p-3 sm:p-4">
      <p className="mb-3 text-center text-sm text-grafite-2">
        {conversa.cliente} · {hora(conversa.inicio)}
      </p>
      <ol className="grid gap-2">
        {conversa.mensagens.map((m, i) => {
          const doCliente = m.autor === "cliente";
          const Icone = m.autor === "ia" ? Bot : m.autor === "humano" ? Headset : UserRound;
          return (
            <li key={i} className={clsx("flex", doCliente ? "justify-start" : "justify-end")}>
              <div
                className={clsx(
                  "max-w-[85%] rounded-[10px] px-3 py-2 text-base",
                  doCliente ? "rounded-tl-[3px] bg-papel" : m.autor === "ia" ? "rounded-tr-[3px] bg-comanda-claro" : "rounded-tr-[3px] bg-acafrao-fundo",
                )}
              >
                <p className="mb-0.5 flex items-center gap-1 text-sm text-grafite-2">
                  <Icone aria-hidden className="size-3.5" />
                  {doCliente ? conversa.cliente : m.autor === "ia" ? "Vendedor IA" : "Atendente"}
                </p>
                {m.texto}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function WhatsappTela({ visao }: { visao: VisaoWhatsapp }) {
  const { periodo } = usePeriodo();
  const v = visao;
  const comparacao = PERIODOS.find((p) => p.id === periodo)!.comparacao;
  const [aberta, setAberta] = useState(v.conversasRecentes[0]?.id);
  const visor = useRef<HTMLDivElement>(null);
  const conversa = v.conversasRecentes.find((c) => c.id === aberta);
  const vs = v.vendaSugestiva;
  const fu = v.followups;
  const b = v.blocos;
  /**
   * Achado F: `whatsapp_dia` da Le Tre tem ZERO linha (medido), e a tela levava o selo
   * "Exemplo" estando vazia. Agora o bloco inteiro é SEM_DADO, e nenhum contador deste
   * painel pode sair como zero: ninguém contou conversa nenhuma.
   */
  const semConversas = b.conversas === "SEM_DADO";

  return (
    <>
      <CabecalhoArea numero={4} nome="Vendedor IA no WhatsApp" frase={v.frase} origem={v.origem} blocos={b} />

      <div className="grid gap-5">
        <Painel origem={b.conversas} titulo="Resumo do período" descricao={`Variações ${comparacao}.`}>
          {semConversas && (
            <div className="mb-4">
              <SemDado>
                Não há nenhum dia de WhatsApp registrado para este filtro. Os números abaixo seriam zeros de contagem, e o vendedor IA pode nem
                estar ligado nesta operação.
              </SemDado>
            </div>
          )}
          <GradeIndicadores>
            <Indicador
              rotulo="Conversas"
              valor={semConversas ? NAO_MEDIDO : formatarInteiro(v.conversas.atual)}
              comparacao={semConversas ? undefined : v.conversas}
              detalhe={semConversas ? "nenhum dia de WhatsApp na fonte" : undefined}
            />
            <Indicador
              rotulo="Pedidos fechados"
              valor={semConversas ? NAO_MEDIDO : formatarInteiro(v.pedidos.atual)}
              comparacao={semConversas ? undefined : v.pedidos}
              detalhe={semConversas ? "sem conversa não há pedido pelo canal" : undefined}
            />
            {/* conversao null = nenhuma conversa no período; 0% afirmaria que houve */}
            <Indicador
              rotulo="Conversão"
              valor={ouNaoMedido(v.conversao, (c) => formatarPct(c.atual))}
              comparacao={v.conversao ?? undefined}
              emPontos
              detalhe={v.conversao === null ? "sem conversa não há taxa de conversão" : undefined}
            />
            <Indicador
              rotulo="Faturamento"
              valor={semConversas ? NAO_MEDIDO : formatarBRLInteiro(v.faturamento)}
              detalhe={semConversas ? "nenhuma venda pelo WhatsApp registrada" : undefined}
            />
            <Indicador
              rotulo="Ticket no WhatsApp"
              valor={ouNaoMedido(v.ticketWhatsapp, formatarBRL)}
              detalhe={v.ticketWhatsapp === null ? "sem pedido pelo WhatsApp não há ticket" : `geral ${formatarBRL(v.ticketGeral)}`}
            />
          </GradeIndicadores>
        </Painel>

        <div className="grid gap-5 lg:grid-cols-3">
          <Painel origem={b.conversas} titulo="Venda sugestiva" descricao="Adicionais que a IA ofereceu: borda, bebida, sobremesa.">
            {semConversas ? (
              <SemDado>A IA não registrou nenhuma sugestão neste filtro. Um contador zerado diria que ela conversou e não ofereceu nada.</SemDado>
            ) : (
              <dl className="num grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-grafite-2">Sugestões</dt>
                  <dd className="font-display text-2xl font-semibold">{formatarInteiro(vs.sugestoes)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-grafite-2">Aceitas</dt>
                  <dd className="font-display text-2xl font-semibold">{formatarInteiro(vs.aceitas)}</dd>
                  <dd className="text-sm text-grafite-2">
                    {vs.taxaAceite === null ? "nenhuma sugestão feita: não há taxa de aceite" : `${formatarPct(vs.taxaAceite)} das sugestões`}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-grafite-2">Somou em vendas</dt>
                  <dd className="text-lg font-medium">{formatarBRL(vs.valor)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-grafite-2">Em margem</dt>
                  <dd className="text-lg font-medium">{formatarBRL(vs.margem)}</dd>
                </div>
              </dl>
            )}
          </Painel>

          <Painel origem={b.conversas} titulo="Follow-ups" descricao="Mensagem para quem conversou e não fechou, dentro de 24 horas.">
            {semConversas ? (
              <SemDado>Nenhum follow-up registrado neste filtro, porque não há conversa registrada para seguir.</SemDado>
            ) : (
              <>
                <ol className="num grid gap-2">
                  {[
                    ["Enviados", fu.enviados],
                    ["Respondidos", fu.respondidos],
                    ["Pedidos recuperados", fu.recuperados],
                  ].map(([rotulo, n], i) => (
                    <li key={rotulo as string} className="flex items-center justify-between gap-2 border-b border-linha pb-2 last:border-0">
                      <span className={clsx(i === 2 && "font-medium")}>{rotulo}</span>
                      <span className={clsx("text-lg", i === 2 && "font-display font-semibold")}>{formatarInteiro(n as number)}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-sm text-grafite-2">
                  {v.ticketWhatsapp === null
                    ? "Sem ticket médio no WhatsApp não dá para estimar o faturamento recuperado."
                    : `Cerca de ${formatarBRLInteiro(fu.faturamentoRecuperado)} em pedidos recuperados, pelo ticket médio do WhatsApp.`}
                </p>
              </>
            )}
          </Painel>

          <Painel origem={b.conversas} titulo="Passou para atendente" descricao="Quando a IA chama uma pessoa da equipe, e por quê.">
            {v.transferencias.length ? (
              <ul className="grid gap-2">
                {v.transferencias.map((t) => (
                  <li key={t.motivo} className="flex items-center justify-between gap-2 border-b border-linha pb-2 last:border-0">
                    <span className="flex items-center gap-2">
                      <Headset aria-hidden className="size-4 text-grafite-2" />
                      {t.motivo}
                    </span>
                    <span className="num text-lg">{t.quantidade}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <SemDado>
                {semConversas
                  ? "Sem conversa registrada não há transferência para contar."
                  : "Nenhuma transferência para atendente no período: a IA deu conta sozinha."}
              </SemDado>
            )}
          </Painel>
        </div>

        <Painel origem={b.conversas} titulo="Conversas recentes" descricao="Para revisão do consultor. Clientes sempre anonimizados.">
          {!v.conversasRecentes.length && (
            <div className="mb-4">
              <SemDado>Nenhuma conversa registrada para este filtro. Não há transcrição para o consultor revisar.</SemDado>
            </div>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <ul className="grid grid-cols-[minmax(0,1fr)] content-start gap-2">
              {v.conversasRecentes.map((c) => {
                const d = DESFECHO[c.desfecho];
                const ativa = c.id === aberta;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      aria-pressed={ativa}
                      onClick={() => {
                        setAberta(c.id);
                        if (window.matchMedia("(max-width: 1023px)").matches) requestAnimationFrame(() => visor.current?.scrollIntoView({ block: "start" }));
                      }}
                      className={clsx(
                        "flex min-h-11 w-full items-center gap-3 rounded-botao border p-3 text-left transition-colors",
                        ativa ? "border-comanda bg-comanda-claro" : "border-linha hover:border-grafite-2/40",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="font-medium">{c.cliente}</span>
                          <span className="num shrink-0 text-sm text-grafite-2">{hora(c.inicio)}</span>
                        </span>
                        {/* conversa pode chegar SEM mensagem nenhuma: mensagens[length-1] era undefined */}
                        <span className="block truncate text-sm text-grafite-2">{c.mensagens.at(-1)?.texto ?? "sem mensagem registrada"}</span>
                        <span className="mt-1 block">
                          <Etiqueta icone={d.icone} cor={d.cor}>{d.rotulo}</Etiqueta>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div ref={visor} className="scroll-mt-28" aria-live="polite">
              {conversa && <Chat conversa={conversa} />}
            </div>
          </div>
        </Painel>

        <Painel
          origem={b.cardapio}
          titulo="O que a IA sabe"
          descricao={
            <span className="inline-flex items-center gap-1">
              <Lock aria-hidden className="size-3.5" /> Só leitura nesta etapa. Margem = preço − imposto − taxa de pagamento − custo da ficha.
            </span>
          }
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <div>
              <h3 className="mb-2 font-medium">Cardápio, do mais para o menos lucrativo</h3>
              {!v.cardapio.length && <SemDado>Nenhuma ficha técnica cadastrada para este filtro: não há cardápio para a IA conhecer.</SemDado>}
              <ul className="num divide-y divide-linha">
                {v.cardapio.map((i) => (
                  <li key={i.nome} className="flex items-baseline gap-3 py-2">
                    <span className="min-w-0 flex-1">
                      {i.nome} <span className="text-sm text-grafite-2">· {i.categoria}</span>
                    </span>
                    <span className="w-20 text-right text-grafite-2">{formatarBRL(i.preco)}</span>
                    <span className="w-24 text-right font-medium">
                      {formatarBRL(i.margem)}
                      <span className="block text-sm font-normal text-grafite-2">{formatarPct(i.margemPct)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 font-medium">
                Regras de venda ativas
                {b.conversas !== b.cardapio && <MarcaOrigem origem={b.conversas} className="ml-2" />}
              </h3>
              {!v.regras.length && <SemDado>Nenhuma regra de venda cadastrada para este filtro.</SemDado>}
              <ul className="grid gap-2">
                {v.regras.map((r) => (
                  <li key={r} className="flex items-start gap-2">
                    <Check aria-hidden className="mt-1 size-4 shrink-0 text-comanda" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Painel>
      </div>
    </>
  );
}
