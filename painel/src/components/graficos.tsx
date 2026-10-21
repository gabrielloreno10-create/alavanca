"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { lerData, maiorDe } from "@/lib/calculos";
import { NAO_MEDIDO, formatarBRL, formatarDataCurta, formatarDiaSemanaCurto, formatarInteiro, formatarPct } from "@/lib/formato";
import type { CanalId, Quadrante } from "@/lib/types";
import { SemDado } from "./ui";

const eixo = { fill: "var(--grafite-2)", fontSize: 13 };
const diaCurto = (iso: string) => formatarDataCurta(lerData(iso));
const diaLongo = (iso: string) => `${formatarDiaSemanaCurto(lerData(iso))} ${formatarDataCurta(lerData(iso))}`;

interface PropsDica {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
}

function Caixa({ children }: { children: React.ReactNode }) {
  return <div className="rounded-botao border border-linha bg-papel px-3 py-2 text-sm shadow-sm">{children}</div>;
}

/** Tabela escondida atrás de "Ver os números", para leitor de tela e para quem quer o número exato */
export function VerNumeros({ cabecalho, linhas, legenda }: { cabecalho: string[]; linhas: (string | number)[][]; legenda: string }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer py-2 text-comanda">Ver os números em tabela</summary>
      <div className="max-h-64 overflow-y-auto">
        <table className="num w-full text-left">
          <caption className="sr-only">{legenda}</caption>
          <thead className="sticky top-0 bg-papel text-grafite-2">
            <tr>
              {cabecalho.map((c, i) => (
                <th key={c} scope="col" className={`py-1 font-medium ${i ? "text-right" : ""}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={String(l[0])} className="border-t border-linha">
                {l.map((v, i) => (
                  <td key={i} className={`py-1 ${i ? "text-right" : ""}`}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Pedidos por dia: uma série só, em azul */
export function PedidosPorDia({ dados }: { dados: { data: string; pedidos: number }[] }) {
  const total = dados.reduce((s, d) => s + d.pedidos, 0);
  const pico = dados.reduce((m, d) => (d.pedidos > m.pedidos ? d : m), dados[0]);
  // Lista vazia: `pico` é undefined e a legenda saía "Dia mais forte: , com  pedidos".
  // Sem nenhum dia não há "0 pedidos em 0 dias" para afirmar: não houve medição.
  if (!dados.length) {
    return (
      <SemDado>Nenhum dia com pedido medido neste período. Um gráfico vazio diria que não houve pedido; a verdade é que não há registro.</SemDado>
    );
  }
  return (
    <figure>
      <figcaption className="text-sm text-grafite-2">
        {formatarInteiro(total)} pedidos em {dados.length} dias. Dia mais forte: {pico && diaLongo(pico.data)}, com {pico?.pedidos} pedidos.
      </figcaption>
      <div className="mt-3 h-52" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--linha)" strokeOpacity={0.7} />
            <XAxis dataKey="data" tickFormatter={diaCurto} tick={eixo} tickLine={false} axisLine={{ stroke: "var(--linha)" }} minTickGap={20} />
            <YAxis tick={eixo} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "var(--bancada)" }}
              content={({ active, payload }: PropsDica) => {
                const p = payload?.[0]?.payload as { data: string; pedidos: number } | undefined;
                return active && p ? <Caixa><p className="font-medium">{diaLongo(p.data)}</p><p className="num">{p.pedidos} pedidos</p></Caixa> : null;
              }}
            />
            <Bar dataKey="pedidos" fill="var(--comanda)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <VerNumeros legenda="Pedidos por dia" cabecalho={["Dia", "Pedidos"]} linhas={dados.map((d) => [diaLongo(d.data), d.pedidos])} />
    </figure>
  );
}

/** Pedidos por faixa de horário: cinza, com a faixa mais forte em azul */
export function PedidosPorFaixa({ dados }: { dados: { faixa: string; pedidos: number }[] }) {
  const total = dados.reduce((s, d) => s + d.pedidos, 0);
  // maiorDe em vez de Math.max(...): com a lista vazia Math.max() devolve -Infinity, e
  // a legenda saía "A faixa das undefined concentra 0% dos pedidos".
  const max = maiorDe(dados.map((d) => d.pedidos));
  const pico = max === null ? undefined : dados.find((d) => d.pedidos === max);
  if (!pico || max === null || total <= 0) {
    return (
      <SemDado>
        Nenhum pedido por faixa de horário foi medido neste período. Sem linha na fonte não há faixa mais forte — e todas em zero diriam que a loja
        não vendeu a nenhuma hora.
      </SemDado>
    );
  }
  return (
    <figure>
      <figcaption className="text-sm text-grafite-2">
        A faixa das {pico.faixa} concentra {formatarPct(max / total)} dos pedidos.
      </figcaption>
      <div className="mt-3 h-52" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--linha)" strokeOpacity={0.7} />
            <XAxis dataKey="faixa" tick={eixo} tickLine={false} axisLine={{ stroke: "var(--linha)" }} interval={0} />
            <YAxis tick={eixo} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "var(--bancada)" }}
              content={({ active, payload }: PropsDica) => {
                const p = payload?.[0]?.payload as { faixa: string; pedidos: number } | undefined;
                return active && p ? <Caixa><p className="font-medium">{p.faixa}</p><p className="num">{p.pedidos} pedidos · {formatarPct(total ? p.pedidos / total : 0)}</p></Caixa> : null;
              }}
            />
            <Bar dataKey="pedidos" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {dados.map((d) => (
                <Cell key={d.faixa} fill={d.pedidos === max ? "var(--comanda)" : "var(--cinza-grafico)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <VerNumeros legenda="Pedidos por faixa de horário" cabecalho={["Faixa", "Pedidos", "% do total"]} linhas={dados.map((d) => [d.faixa, d.pedidos, formatarPct(total ? d.pedidos / total : 0)])} />
    </figure>
  );
}

const CORES_CANAL = { proprio: "var(--comanda)", ifood: "var(--cinza-grafico)", salao: "var(--linha)" };

/** Uma semana do gráfico; participação null = a fonte já declara que ninguém mediu */
type SemanaCanal = { inicio: string; ifood: number | null; proprio: number | null; salao: number | null };

/**
 * Semana que tem divisão para mostrar. Além do null, barra o zero: `canalPct` sai de
 * `dividir` (calculos.ts), que devolve 0 sem denominador, então a semana sem nenhuma
 * linha em venda_dia chega aqui com 0% nos três canais. Numa semana com venda as três
 * participações somam 1 — as três em zero não são divisão medida, são ausência.
 */
function medida(s: SemanaCanal | undefined): s is { inicio: string; ifood: number; proprio: number; salao: number } {
  if (!s || s.ifood === null || s.proprio === null || s.salao === null) return false;
  return s.ifood + s.proprio + s.salao > 0;
}

/** Divisão das vendas por canal, semana a semana, com a meta do canal próprio */
export function CanaisPorSemana({
  dados,
  meta,
  canais,
  semDado,
}: {
  dados: SemanaCanal[];
  meta: number | null;
  canais: CanalId[];
  /** sem venda medida nas 8 semanas: as participações são zero estrutural, não divisão */
  semDado?: boolean;
}) {
  const ultima = dados[dados.length - 1];
  const primeira = dados[0];
  const temSalao = canais.includes("salao");
  const series = (["proprio", "ifood", "salao"] as const).filter((c) => canais.includes(c));
  const semanasSemVenda = dados.filter((s) => !medida(s)).length;
  // As 8 semanas são fixas, então `dados` nunca é vazio — mas sem venda nenhuma todas as
  // participações saem 0, e "o canal próprio ficou com 0% das vendas" afirmaria uma
  // divisão que não houve. Vale para a lista vazia também: every/filter de vazio diz que
  // nenhuma semana foi medida, que é a verdade.
  if (semDado || semanasSemVenda === dados.length) {
    return (
      <SemDado>
        Não há venda medida nas últimas 8 semanas para este filtro, então não existe divisão entre canais. Barras zeradas diriam que a loja vendeu e
        que nada veio do canal próprio.
      </SemDado>
    );
  }
  return (
    <figure>
      <figcaption className="text-sm text-grafite-2">
        {medida(ultima)
          ? `Na última semana, o canal próprio ficou com ${formatarPct(ultima.proprio)} das vendas`
          : `Na última semana, ${NAO_MEDIDO}: não há venda registrada`}
        ;{" "}
        {/* "8 semanas atrás eram 0%" era a afirmação mais cara do gráfico: o histórico de
            quem começou no meio da janela sai zerado, e o zero dizia que houve venda e que
            nada veio do canal próprio. */}
        {medida(primeira)
          ? `${dados.length} semanas atrás eram ${formatarPct(primeira.proprio)}`
          : `${dados.length} semanas atrás, ${NAO_MEDIDO}: não havia venda registrada`}
        . Meta: {meta === null ? "[PREENCHER]" : formatarPct(meta)}.
        {semanasSemVenda > 0 && ` Semana sem venda registrada não aparece no gráfico: ${semanasSemVenda} de ${dados.length}.`}
      </figcaption>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-grafite-2" aria-hidden>
        {series.map((c) => (
          <li key={c} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: CORES_CANAL[c] }} />
            {c === "proprio" ? "Canal próprio" : c === "ifood" ? "iFood" : "Salão"}
          </li>
        ))}
        {meta !== null && (
          <li className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-grafite" /> Meta do canal próprio
          </li>
        )}
      </ul>
      <div className="mt-3 h-60" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--linha)" strokeOpacity={0.7} />
            <XAxis dataKey="inicio" tickFormatter={diaCurto} tick={eixo} tickLine={false} axisLine={{ stroke: "var(--linha)" }} minTickGap={8} />
            <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v: number) => formatarPct(v)} tick={eixo} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              cursor={{ fill: "var(--bancada)" }}
              content={({ active, payload }: PropsDica) => {
                const p = payload?.[0]?.payload as SemanaCanal | undefined;
                if (!active || !p) return null;
                return (
                  <Caixa>
                    <p className="font-medium">Semana de {diaCurto(p.inicio)}</p>
                    {medida(p) ? (
                      <>
                        <p className="num">Canal próprio {formatarPct(p.proprio)}</p>
                        <p className="num text-grafite-2">iFood {formatarPct(p.ifood)}{temSalao && ` · Salão ${formatarPct(p.salao)}`}</p>
                      </>
                    ) : (
                      <p className="text-grafite-2">{NAO_MEDIDO}: não há venda registrada nesta semana.</p>
                    )}
                  </Caixa>
                );
              }}
            />
            <Bar dataKey="proprio" stackId="c" fill={CORES_CANAL.proprio} stroke="var(--papel)" strokeWidth={1} isAnimationActive={false} />
            <Bar dataKey="ifood" stackId="c" fill={CORES_CANAL.ifood} stroke="var(--papel)" strokeWidth={1} radius={temSalao ? undefined : [4, 4, 0, 0]} isAnimationActive={false} />
            {temSalao && <Bar dataKey="salao" stackId="c" fill={CORES_CANAL.salao} stroke="var(--papel)" strokeWidth={1} radius={[4, 4, 0, 0]} isAnimationActive={false} />}
            {meta !== null && <ReferenceLine y={meta} stroke="var(--grafite)" strokeDasharray="5 4" strokeWidth={1.5} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <VerNumeros
        legenda="Divisão das vendas por canal, por semana"
        cabecalho={["Semana de", "Próprio", "iFood", ...(temSalao ? ["Salão"] : [])]}
        linhas={dados.map((d) =>
          medida(d)
            ? [diaCurto(d.inicio), formatarPct(d.proprio), formatarPct(d.ifood), ...(temSalao ? [formatarPct(d.salao)] : [])]
            : [diaCurto(d.inicio), NAO_MEDIDO, NAO_MEDIDO, ...(temSalao ? [NAO_MEDIDO] : [])],
        )}
      />
    </figure>
  );
}

export const NOMES_QUADRANTE: Record<Quadrante, string> = {
  estrela: "Estrelas",
  cavalo: "Cavalos de batalha",
  joia: "Joias escondidas",
  rever: "Rever",
};

interface PontoCardapio {
  id: string;
  nome: string;
  qtd: number;
  margem: number;
  quadrante: Quadrante;
}

/** Popularidade (quantidade) x margem por prato, dividido em 4 quadrantes. Estrelas em azul, o resto em cinza. */
export function MapaCardapio({ pratos, cortes }: { pratos: PontoCardapio[]; cortes: { qtd: number; margem: number } }) {
  const canto = "pointer-events-none absolute text-sm font-medium text-grafite-2";
  return (
    <figure>
      <figcaption className="sr-only">
        Engenharia de cardápio. {(["estrela", "cavalo", "joia", "rever"] as Quadrante[])
          .map((q) => `${NOMES_QUADRANTE[q]}: ${pratos.filter((p) => p.quadrante === q).map((p) => p.nome).join(", ") || "nenhum"}`)
          .join(". ")}.
      </figcaption>
      <div className="relative h-80 sm:h-96" aria-hidden>
        <span className={`${canto} left-16 top-1`}>Joias escondidas</span>
        <span className={`${canto} right-2 top-1`}>Estrelas</span>
        <span className={`${canto} bottom-[60px] left-16`}>Rever</span>
        <span className={`${canto} bottom-[60px] right-2`}>Cavalos de batalha</span>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 24, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--linha)" strokeOpacity={0.6} />
            <XAxis type="number" dataKey="qtd" name="Vendidos" tick={eixo} tickLine={false} axisLine={{ stroke: "var(--linha)" }} label={{ value: "Vendidos no período", position: "insideBottom", offset: -4, fill: "var(--grafite-2)", fontSize: 13 }} height={44} />
            <YAxis type="number" dataKey="margem" name="Margem" tickFormatter={(v: number) => `R$ ${v}`} tick={eixo} tickLine={false} axisLine={false} width={56} />
            <ZAxis range={[90, 90]} />
            <ReferenceLine x={cortes.qtd} stroke="var(--grafite-2)" strokeDasharray="4 4" />
            <ReferenceLine y={cortes.margem} stroke="var(--grafite-2)" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ strokeDasharray: "3 3", stroke: "var(--grafite-2)" }}
              content={({ active, payload }: PropsDica) => {
                const p = payload?.[0]?.payload as PontoCardapio | undefined;
                return active && p ? (
                  <Caixa>
                    <p className="font-medium">{p.nome}</p>
                    <p className="num">{formatarInteiro(p.qtd)} vendidos · margem {formatarBRL(p.margem)}</p>
                    <p className="text-grafite-2">{NOMES_QUADRANTE[p.quadrante]}</p>
                  </Caixa>
                ) : null;
              }}
            />
            <Scatter data={pratos} isAnimationActive={false}>
              {pratos.map((p) => (
                <Cell key={p.id} fill={p.quadrante === "estrela" ? "var(--comanda)" : "var(--cinza-grafico)"} stroke="var(--papel)" strokeWidth={2} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
