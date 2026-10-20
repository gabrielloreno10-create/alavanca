"use client";

import clsx from "clsx";
import { CalendarClock, ShieldCheck } from "lucide-react";
import { lerData } from "@/lib/calculos";
import { formatarBRL, formatarBRLInteiro, formatarDataCurta, formatarDiaSemanaCurto, formatarInteiro, formatarPct } from "@/lib/formato";
import { PERIODOS, type VisaoCrm } from "@/lib/types";
import { usePeriodo } from "./PeriodoContexto";
import { CabecalhoArea, GradeIndicadores, Indicador, Painel, TabelaRolavel, td, th } from "./ui";

const dia = (iso: string) => `${formatarDiaSemanaCurto(lerData(iso))} ${formatarDataCurta(lerData(iso))}`;

export function CrmTela({ visao }: { visao: VisaoCrm }) {
  const { periodo } = usePeriodo();
  const v = visao;
  const comparacao = PERIODOS.find((p) => p.id === periodo)!.comparacao;
  const tot = v.totaisDisparos;

  return (
    <>
      <CabecalhoArea numero={3} nome="CRM sniper" frase={v.frase} origem={v.origem} />

      <div className="grid gap-5">
        <p className="flex items-start gap-3 rounded-painel border border-linha bg-papel p-4 text-base">
          <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-comanda" />
          <span>
            <span className="font-medium">Só recebe disparo quem aceitou receber mensagens (opt-in).</span> Quem não aceitou conta na base, mas nunca na
            contagem de disparo. Os envios saem pela API oficial do WhatsApp Business, seguindo a LGPD.
          </span>
        </p>

        <Painel titulo="Sua base" descricao={`Novos clientes ${comparacao}.`}>
          <GradeIndicadores>
            <Indicador rotulo="Clientes na base" valor={formatarInteiro(v.base.total)} />
            <Indicador rotulo="Podem receber WhatsApp" valor={formatarInteiro(v.base.comOptIn)} detalhe={`${formatarPct(v.base.pctOptIn)} da base`} />
            <Indicador rotulo="Novos clientes" valor={formatarInteiro(v.novos.atual)} comparacao={v.novos} />
            <Indicador rotulo="Novos com opt-in" valor={formatarInteiro(v.novosComOptIn.atual)} comparacao={v.novosComOptIn} />
          </GradeIndicadores>
        </Painel>

        <Painel titulo="Segmentos" descricao="Quem é quem na base, quanto cada grupo vale e o que fazer com ele. Valor = faturamento dos últimos 90 dias.">
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {v.segmentos.map((s) => (
              <li key={s.id} className="flex flex-col rounded-botao border border-linha p-3">
                <p className="font-display text-lg font-semibold">{s.nome}</p>
                <p className="text-sm text-grafite-2">{s.criterio}</p>
                <dl className="num mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-grafite-2">Clientes</dt>
                    <dd className="text-base">{formatarInteiro(s.clientes)}</dd>
                  </div>
                  <div>
                    <dt className="text-grafite-2">Disparáveis</dt>
                    <dd className="text-base font-medium">{formatarInteiro(s.comOptIn)}</dd>
                  </div>
                  <div>
                    <dt className="text-grafite-2">Valor</dt>
                    <dd className="text-base">{s.valor90d ? formatarBRLInteiro(s.valor90d) : "—"}</dd>
                  </div>
                </dl>
                <div className="mt-2 h-1.5 rounded-full bg-bancada" role="img" aria-label={`${formatarPct(s.pctOptIn)} com opt-in`}>
                  <div className="h-full rounded-full bg-comanda" style={{ width: `${s.pctOptIn * 100}%` }} />
                </div>
                <p className="num mt-1 text-sm text-grafite-2">{formatarPct(s.pctOptIn)} com opt-in</p>
                <p className="mt-3 border-t border-linha pt-2 text-base">
                  <span className="text-sm text-grafite-2">Ação recomendada: </span>
                  {s.acao}
                </p>
              </li>
            ))}
          </ul>
        </Painel>

        <Painel
          titulo="Disparos feitos"
          descricao={`Custo = mensagens enviadas × tarifa da API do WhatsApp. ${v.disparos.length ? "" : v.ultimoDisparo ? `Nenhum disparo no período; o último foi em ${dia(v.ultimoDisparo)}.` : "Nenhum disparo ainda."}`}
        >
          {v.disparos.length > 0 && (
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
                      <span className="block text-sm text-grafite-2">{formatarPct(d.respostas / d.enviados)}</span>
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
                  <td className="py-2.5 pr-3 text-right">{tot.respostas}</td>
                  <td className="py-2.5 pr-3 text-right">{tot.pedidos}</td>
                  <td className="py-2.5 pr-3 text-right">{formatarBRLInteiro(tot.faturamento)}</td>
                  <td className="py-2.5 text-right">{formatarBRL(tot.custo)}</td>
                </tr>
              </tfoot>
            </TabelaRolavel>
          )}
        </Painel>

        <Painel titulo="Próximos disparos" descricao="Só os clientes com opt-in do segmento entram no envio.">
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
                    {formatarInteiro(d.disparaveis)} vão receber · {formatarInteiro(d.foraDoDisparo)} ficam de fora (sem opt-in)
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Painel>
      </div>
    </>
  );
}
