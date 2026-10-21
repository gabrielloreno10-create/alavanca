"use client";

import clsx from "clsx";
import { CalendarClock, ShieldCheck } from "lucide-react";
import { lerData } from "@/lib/calculos";
import { NAO_MEDIDO, formatarBRL, formatarBRLInteiro, formatarDataCurta, formatarDiaSemanaCurto, formatarInteiro, formatarPct, ouNaoMedido } from "@/lib/formato";
import { PERIODOS, type VisaoCrm } from "@/lib/types";
import { usePeriodo } from "./PeriodoContexto";
import { CabecalhoArea, GradeIndicadores, Indicador, Painel, SemDado, TabelaRolavel, td, th } from "./ui";

const dia = (iso: string) => `${formatarDiaSemanaCurto(lerData(iso))} ${formatarDataCurta(lerData(iso))}`;

export function CrmTela({ visao }: { visao: VisaoCrm }) {
  const { periodo } = usePeriodo();
  const v = visao;
  const comparacao = PERIODOS.find((p) => p.id === periodo)!.comparacao;
  const tot = v.totaisDisparos;
  const b = v.blocos;
  /**
   * Achado F: a Le Tre tem ZERO linha em `customers` (medido). A tela levava o selo
   * "Exemplo" estando vazia, e os contadores mostravam 0 como se alguém tivesse contado
   * a base e achado ninguém. Base vazia é base inexistente.
   */
  const semBase = b.base === "SEM_DADO";
  const semSegmentos = b.segmentos === "SEM_DADO";
  const semDisparos = b.disparos === "SEM_DADO";

  return (
    <>
      <CabecalhoArea numero={3} nome="CRM sniper" frase={v.frase} origem={v.origem} blocos={b} />

      <div className="grid gap-5">
        <p className="flex items-start gap-3 rounded-painel border border-linha bg-papel p-4 text-base">
          <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-comanda" />
          <span>
            <span className="font-medium">Só recebe disparo quem aceitou receber mensagens (opt-in).</span> Quem não aceitou conta na base, mas nunca na
            contagem de disparo. Os envios saem pela API oficial do WhatsApp Business, seguindo a LGPD.
          </span>
        </p>

        <Painel origem={b.base} titulo="Sua base" descricao={`Novos clientes ${comparacao}.`}>
          {semBase && (
            <div className="mb-4">
              <SemDado>
                Não há nenhum cliente importado para este filtro. Os quatro números abaixo seriam zeros de contagem — e contar zero é diferente de
                nunca ter contado.
              </SemDado>
            </div>
          )}
          <GradeIndicadores>
            <Indicador
              rotulo="Clientes na base"
              valor={semBase ? NAO_MEDIDO : formatarInteiro(v.base.total)}
              detalhe={semBase ? "nenhum cliente importado ainda" : undefined}
            />
            <Indicador
              rotulo="Podem receber WhatsApp"
              valor={semBase ? NAO_MEDIDO : formatarInteiro(v.base.comOptIn)}
              detalhe={v.base.pctOptIn === null ? "sem base não há percentual de opt-in" : `${formatarPct(v.base.pctOptIn)} da base`}
            />
            <Indicador
              rotulo="Novos clientes"
              valor={semBase ? NAO_MEDIDO : formatarInteiro(v.novos.atual)}
              comparacao={semBase ? undefined : v.novos}
              detalhe={semBase ? "sem base não há cliente novo a contar" : undefined}
            />
            <Indicador
              rotulo="Novos com opt-in"
              valor={semBase ? NAO_MEDIDO : formatarInteiro(v.novosComOptIn.atual)}
              comparacao={semBase ? undefined : v.novosComOptIn}
              detalhe={semBase ? "sem base não há aceite a contar" : undefined}
            />
          </GradeIndicadores>
        </Painel>

        <Painel origem={b.segmentos} titulo="Segmentos" descricao="Quem é quem na base, quanto cada grupo vale e o que fazer com ele. Valor = faturamento dos últimos 90 dias.">
          {semSegmentos || !v.segmentos.length ? (
            <SemDado>Nenhum segmento montado para este filtro. Sem cliente na base não há como separar quem é quem.</SemDado>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {v.segmentos.map((s) => (
                <li key={s.id} className="flex flex-col rounded-botao border border-linha p-3">
                  <p className="font-display text-lg font-semibold">{s.nome}</p>
                  <p className="text-sm text-grafite-2">{s.criterio}</p>
                  <dl className="num mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-grafite-2">Clientes</dt>
                      <dd className="text-base">{ouNaoMedido(s.clientes, formatarInteiro)}</dd>
                    </div>
                    <div>
                      <dt className="text-grafite-2">Disparáveis</dt>
                      <dd className="text-base font-medium">{ouNaoMedido(s.comOptIn, formatarInteiro)}</dd>
                    </div>
                    <div>
                      <dt className="text-grafite-2">Valor</dt>
                      <dd className="text-base">{ouNaoMedido(s.valor90d, formatarBRLInteiro)}</dd>
                    </div>
                  </dl>
                  {/* Dois motivos diferentes para não haver percentual, e eles não podem
                      sair com a mesma frase: o segmento foi contado e está vazio, ou o
                      segmento nunca foi contado (há definição em crm_segmento, não há
                      linha em crm_segmento_snapshot). Dizer "sem nenhum cliente" no
                      segundo caso afirmaria uma contagem que ninguém fez. */}
                  {s.clientes === null ? (
                    <p className="mt-2 text-sm text-grafite-2">{NAO_MEDIDO}: este segmento tem definição, mas nunca foi apurado — não existe contagem de clientes nem de opt-in.</p>
                  ) : s.pctOptIn === null ? (
                    <p className="mt-2 text-sm text-grafite-2">{NAO_MEDIDO}: segmento sem nenhum cliente, não há percentual de opt-in.</p>
                  ) : (
                    <>
                      <div className="mt-2 h-1.5 rounded-full bg-bancada" role="img" aria-label={`${formatarPct(s.pctOptIn)} com opt-in`}>
                        <div className="h-full rounded-full bg-comanda" style={{ width: `${s.pctOptIn * 100}%` }} />
                      </div>
                      <p className="num mt-1 text-sm text-grafite-2">{formatarPct(s.pctOptIn)} com opt-in</p>
                    </>
                  )}
                  <p className="mt-3 border-t border-linha pt-2 text-base">
                    <span className="text-sm text-grafite-2">Ação recomendada: </span>
                    {s.acao}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Painel>

        <Painel origem={b.disparos} titulo="Disparos feitos" descricao="Custo = mensagens enviadas × tarifa da API do WhatsApp.">
          {!v.disparos.length ? (
            <SemDado>
              {semDisparos
                ? "Nenhum disparo foi registrado para este filtro: a tabela de envios está vazia. Nenhuma linha não é o mesmo que um disparo sem resposta."
                : v.ultimoDisparo
                  ? `Nenhum disparo dentro do período escolhido. O último registrado foi em ${dia(v.ultimoDisparo)}.`
                  : "Nenhum disparo registrado até agora."}
            </SemDado>
          ) : (
            <TabelaRolavel legenda="Disparos feitos no período">
              <thead>
                <tr>
                  <th scope="col" className={th}>Data e segmento</th>
                  <th scope="col" className={th}>Mensagem</th>
                  <th scope="col" className={clsx(th, "text-right")}>Enviados</th>
                  <th scope="col" className={clsx(th, "text-right")}>Respostas</th>
                  <th scope="col" className={clsx(th, "text-right")}>Pedidos</th>
                  <th scope="col" className={clsx(th, "text-right")}>Faturamento</th>
                  <th scope="col" className={clsx(th, "text-right")}>Custo</th>
                </tr>
              </thead>
              <tbody>
                {v.disparos.map((d) => (
                  <tr key={d.id}>
                    <td className={clsx(td, "whitespace-nowrap")}>
                      {dia(d.data)}
                      <span className="block text-sm text-grafite-2">{d.nomeSegmento}</span>
                    </td>
                    <td className={clsx(td, "min-w-[200px] font-sans")}>{d.mensagem}</td>
                    <td className={clsx(td, "text-right")}>{formatarInteiro(d.enviados)}</td>
                    <td className={clsx(td, "text-right")}>
                      {d.respostas}
                      {/* achado E: `respostas / enviados` com enviados = 0 virava NaN e a
                          célula escrevia "NaN%". taxaResposta já chega null nesse caso. */}
                      <span className="block text-sm text-grafite-2">{ouNaoMedido(d.taxaResposta, (x) => formatarPct(x))}</span>
                    </td>
                    <td className={clsx(td, "text-right")}>{d.pedidos}</td>
                    <td className={clsx(td, "text-right")}>{formatarBRLInteiro(d.faturamento)}</td>
                    <td className={clsx(td, "text-right")}>{formatarBRL(d.custo)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <th scope="row" colSpan={2} className="py-2.5 pr-3 text-left">Total do período</th>
                  <td className="py-2.5 pr-3 text-right">{formatarInteiro(tot.enviados)}</td>
                  <td className="py-2.5 pr-3 text-right">
                    {tot.respostas}
                    <span className="block text-sm font-normal text-grafite-2">{ouNaoMedido(tot.taxaResposta, (x) => formatarPct(x))}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-right">{tot.pedidos}</td>
                  <td className="py-2.5 pr-3 text-right">{formatarBRLInteiro(tot.faturamento)}</td>
                  <td className="py-2.5 text-right">{formatarBRL(tot.custo)}</td>
                </tr>
              </tfoot>
            </TabelaRolavel>
          )}
        </Painel>

        <Painel titulo="Próximos disparos" descricao="Só os clientes com opt-in do segmento entram no envio.">
          {!v.proximos.length ? (
            <SemDado>Nenhum disparo agendado para este filtro.</SemDado>
          ) : (
            <ol className="grid gap-3 md:grid-cols-2">
              {v.proximos.map((d) => (
                <li key={`${d.data}-${d.segmento}`} className="flex gap-3 rounded-botao border border-linha p-3">
                  <span className="grid w-14 shrink-0 place-items-center rounded-botao bg-bancada py-2 text-center">
                    <span className="text-sm text-grafite-2">{formatarDiaSemanaCurto(lerData(d.data))}</span>
                    <span className="num font-display text-lg font-semibold leading-tight">{lerData(d.data).getDate()}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm text-grafite-2">
                      <CalendarClock aria-hidden className="size-4" /> {formatarDataCurta(lerData(d.data))} às {d.hora} · {d.nomeSegmento}
                    </span>
                    <span className="mt-0.5 block font-medium">{d.mensagem}</span>
                    <span className="num mt-1 block text-sm text-grafite-2">
                      {ouNaoMedido(d.disparaveis, formatarInteiro)} vão receber · {ouNaoMedido(d.foraDoDisparo, formatarInteiro)} ficam de fora (sem opt-in)
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Painel>
      </div>
    </>
  );
}
