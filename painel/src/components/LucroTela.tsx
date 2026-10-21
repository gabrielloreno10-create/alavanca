"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { NAO_MEDIDO, formatarBRL, formatarBRLInteiro, formatarInteiro, formatarPct, ouNaoMedido } from "@/lib/formato";
import { maiorDe } from "@/lib/calculos";
import { PERIODOS, type Quadrante, type VisaoLucro } from "@/lib/types";
import { MapaCardapio, NOMES_QUADRANTE } from "./graficos";
import { usePeriodo } from "./PeriodoContexto";
import { Sinal } from "./Sinal";
import { CabecalhoArea, Etiqueta, Indicador, Painel, SemDado, TabelaRolavel, td, th } from "./ui";

type Coluna = "nome" | "custo" | "preco" | "cmvPct" | "margem" | "qtd";
const COLUNAS: { id: Coluna; rotulo: string; num?: boolean }[] = [
  { id: "nome", rotulo: "Prato" },
  { id: "custo", rotulo: "Custo", num: true },
  { id: "preco", rotulo: "Preço", num: true },
  { id: "cmvPct", rotulo: "CMV %", num: true },
  { id: "margem", rotulo: "Margem", num: true },
  { id: "qtd", rotulo: "Vendidos", num: true },
];

function Fichas({ pratos, precoMedio }: { pratos: VisaoLucro["pratos"]; precoMedio: boolean }) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [ordem, setOrdem] = useState<{ col: Coluna; desc: boolean }>({ col: "margem", desc: true });
  const categorias = [...new Set(pratos.map((p) => p.categoria))];
  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return pratos
      .filter((p) => (categoria === "todas" || p.categoria === categoria) && (!termo || p.nome.toLowerCase().includes(termo)))
      .sort((a, b) => {
        const x = a[ordem.col];
        const y = b[ordem.col];
        const c = typeof x === "string" ? x.localeCompare(y as string, "pt-BR") : (x as number) - (y as number);
        return ordem.desc ? -c : c;
      });
  }, [pratos, busca, categoria, ordem]);

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <label className="relative min-w-0 flex-1 basis-48">
          <span className="sr-only">Buscar prato</span>
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-grafite-2" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar prato"
            className="h-11 w-full rounded-botao border border-linha bg-papel pl-8 pr-3 lg:h-9"
          />
        </label>
        <label>
          <span className="sr-only">Categoria</span>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="h-11 rounded-botao border border-linha bg-papel px-2 lg:h-9">
            <option value="todas">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <TabelaRolavel legenda="Fichas técnicas: custo, preço, CMV e margem por prato">
        <thead>
          <tr>
            {COLUNAS.map((c) => {
              const ativa = ordem.col === c.id;
              const Icone = ativa ? (ordem.desc ? ArrowDown : ArrowUp) : ArrowUpDown;
              return (
                <th key={c.id} scope="col" aria-sort={ativa ? (ordem.desc ? "descending" : "ascending") : "none"} className={clsx(th, c.num && "text-right")}>
                  <button
                    type="button"
                    onClick={() => setOrdem((o) => ({ col: c.id, desc: o.col === c.id ? !o.desc : c.id !== "nome" }))}
                    className={clsx("inline-flex min-h-8 items-center gap-1 hover:text-grafite", ativa && "text-grafite")}
                  >
                    {c.id === "preco" && precoMedio ? "Preço médio" : c.rotulo}
                    <Icone aria-hidden className="size-3.5" />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {linhas.map((p) => (
            <tr key={p.id}>
              <td className={td}>
                {p.nome}
                <span className="block text-sm text-grafite-2">
                  {p.categoria} · {NOMES_QUADRANTE[p.quadrante]}
                </span>
                {p.estimado && (
                  <span className="mt-1 block" title={p.base ?? undefined}>
                    <Etiqueta icone={AlertTriangle} cor="text-acafrao">Custo estimado</Etiqueta>
                    {p.base && <span className="mt-0.5 block text-sm text-grafite-2">{p.base}</span>}
                  </span>
                )}
              </td>
              <td className={clsx(td, "text-right")}>{formatarBRL(p.custo)}</td>
              <td className={clsx(td, "text-right")}>{formatarBRL(p.preco)}</td>
              <td className={clsx(td, "text-right")}>{formatarPct(p.cmvPct, 1)}</td>
              <td className={clsx(td, "text-right font-medium")}>{formatarBRL(p.margem)}</td>
              <td className={clsx(td, "text-right")}>{formatarInteiro(p.qtd)}</td>
            </tr>
          ))}
          {!linhas.length && (
            <tr>
              <td colSpan={COLUNAS.length} className="py-6 text-center text-grafite-2">
                Nenhum prato encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </TabelaRolavel>
    </>
  );
}

const DESCRICAO_QUADRANTE: Record<Quadrante, string> = {
  estrela: "Vende muito, margem alta: proteger e destacar.",
  cavalo: "Vende muito, margem baixa: rever preço ou receita.",
  joia: "Vende pouco, margem alta: dar mais vitrine.",
  rever: "Vende pouco, margem baixa: candidato a sair.",
};

export function LucroTela({ visao }: { visao: VisaoLucro }) {
  const { periodo } = usePeriodo();
  const v = visao;
  const comparacao = PERIODOS.find((p) => p.id === periodo)!.comparacao;
  // maiorDe em vez de Math.max(...): lista vazia daria -Infinity, e a barra sumiria.
  const maxMargemPct = Math.max(maiorDe(v.porCanal.map((c) => c.margemPct).filter((x): x is number => x !== null)) ?? 0, 0.01);
  const b = v.blocos;
  /** cmv.valor e margem.valor em R$ continuam number, mas só podem ser lidos aqui. */
  const semCmv = b.cmv === "SEM_DADO";
  const semMetas = b.metas === "SEM_DADO";
  // Sem pct medido não existe semáforo: verde por falta de número é o que a fase 0 mata.
  const situacaoCmv =
    v.cmv.meta === null || v.cmv.pct === null ? null : v.cmv.pct <= v.cmv.meta ? "bom" : v.cmv.pct <= v.cmv.meta + 0.02 ? "atencao" : "alerta";
  const situacaoMargem =
    v.margem.meta === null || v.margem.pct === null ? null : v.margem.pct >= v.margem.meta ? "bom" : v.margem.pct >= v.margem.meta - 0.05 ? "atencao" : "alerta";
  /** Só compara quando as duas pontas foram medidas. */
  const comp = (a: number | null, b: number | null) => (a === null || b === null ? undefined : { atual: a, anterior: b });
  const textoMeta = (m: number | null) => (m === null ? "meta: [PREENCHER]" : `meta ${formatarPct(m)}`);
  const qualVenda = v.janelaVendas ? `Vendidos de ${v.janelaVendas} (relatório de 90 dias do Saipos; não muda com o período escolhido)` : "Vendidos no período";

  return (
    <>
      <CabecalhoArea numero={5} nome="Gestão de lucro" frase={v.frase} origem={v.origem} blocos={b} />

      <div className="grid gap-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Painel origem={b.cmv} titulo="CMV e margem" descricao={`Variações ${comparacao}.${v.notaMargem ? ` ${v.notaMargem}` : ""}`}>
            {semCmv ? (
              <SemDado>
                Não há venda medida neste filtro, então não existe CMV nem margem a calcular. Um CMV zerado diria que a cozinha não gastou nada; a
                verdade é que não há faturamento para dividir.
              </SemDado>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                <div>
                  <Indicador rotulo={v.cmvEstimado ? "CMV estimado" : "CMV do período"} valor={ouNaoMedido(v.cmv.pct, (x) => formatarPct(x, 1))} comparacao={comp(v.cmv.pct, v.cmv.pctAnterior)} emPontos detalhe={v.cmv.pct === null ? "sem faturamento não há percentual" : textoMeta(v.cmv.meta)} />
                  {/* situacao null quando falta meta OU falta o pct: verde por falta de
                      número é exatamente o achado B. */}
                  <Sinal className="mt-1" situacao={situacaoCmv} semDado={v.cmv.pct === null} />
                </div>
                <Indicador rotulo="CMV em R$" valor={formatarBRLInteiro(v.cmv.valor)} />
                <div>
                  <Indicador rotulo={v.cmvEstimado ? "Margem estimada" : "Margem de contribuição"} valor={ouNaoMedido(v.margem.pct, (x) => formatarPct(x, 1))} comparacao={comp(v.margem.pct, v.margem.pctAnterior)} emPontos detalhe={v.margem.pct === null ? "sem faturamento não há percentual" : textoMeta(v.margem.meta)} />
                  <Sinal className="mt-1" situacao={situacaoMargem} semDado={v.margem.pct === null} />
                </div>
                <Indicador rotulo="Margem em R$" valor={formatarBRLInteiro(v.margem.valor)} />
              </div>
            )}
          </Painel>

          <Painel origem={b.cmv} titulo="Margem por canal" descricao="O CMV do dia é dividido entre os canais pela proporção de vendas.">
            {semCmv || !v.porCanal.length ? (
              <SemDado>Nenhum canal com venda medida neste filtro, então não há margem para repartir entre eles.</SemDado>
            ) : (
              <ul className="grid gap-4">
                {v.porCanal.map((c) => (
                  <li key={c.canal}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-medium">{c.operacao && <span className="text-grafite-2">{c.operacao} · </span>}{c.nome}</span>
                      <span className="num">
                        {/* margemPct null = canal sem faturamento no período. Sem o
                            percentual, o R$ ao lado também não diz nada: some os dois. */}
                        <span className={c.margemPct === null ? "text-base text-grafite-2" : "font-display text-lg font-semibold"}>
                          {ouNaoMedido(c.margemPct, (x) => formatarPct(x, 1))}
                        </span>
                        <span className="text-sm text-grafite-2">
                          {c.margemPct === null ? " · sem venda neste canal no período" : ` · ${formatarBRLInteiro(c.margem)} de ${formatarBRLInteiro(c.faturamento)}`}
                        </span>
                      </span>
                    </div>
                    {c.margemPct !== null && (
                      <div className="mt-1 h-2.5 rounded-full bg-bancada" aria-hidden>
                        <div className={clsx("h-full rounded-full", c.tipo === "proprio" ? "bg-comanda" : "bg-cinza-grafico")} style={{ width: `${Math.max(0, c.margemPct / maxMargemPct) * 100}%` }} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Painel>
        </div>

        <Painel
          origem={b.cardapio}
          titulo="Engenharia de cardápio"
          descricao={`Cada ponto é um prato. Popular = vendeu pelo menos 70% da média por prato. Margem alta = acima da margem média ponderada pelas vendas. Margem aqui é ${v.janelaVendas ? "preço médio vendido" : "preço"} − custo da ficha.${v.janelaVendas ? ` ${qualVenda}.` : ""}`}
        >
          {!v.pratos.length && (
            <SemDado>Nenhuma ficha técnica cadastrada para este filtro: sem prato não há engenharia de cardápio.</SemDado>
          )}
          {v.pratos.length > 0 && <MapaCardapio pratos={v.pratos} cortes={v.cortes} />}
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(["estrela", "cavalo", "joia", "rever"] as Quadrante[]).map((q) => {
              const lista = v.pratos.filter((p) => p.quadrante === q);
              return (
                <li key={q} className="rounded-botao border border-linha p-3">
                  <p className="font-display text-lg font-semibold">
                    {NOMES_QUADRANTE[q]} <span className="num text-sm font-normal text-grafite-2">· {lista.length}</span>
                  </p>
                  <p className="text-sm text-grafite-2">{DESCRICAO_QUADRANTE[q]}</p>
                  <p className="mt-2 text-sm">{lista.map((p) => p.nome).join(", ") || "Nenhum prato"}</p>
                </li>
              );
            })}
          </ul>
        </Painel>

        <Painel origem={b.cardapio} titulo="Fichas técnicas" descricao={`${qualVenda}. Clique no título da coluna para ordenar.`}>
          <Fichas pratos={v.pratos} precoMedio={!!v.janelaVendas} />
        </Painel>

        <Painel
          origem={b.metas}
          titulo={`Metas de ${v.metasMes.mes}`}
          descricao={`${v.metasMes.diasPassados} de ${v.metasMes.diasNoMes} dias fechados. A projeção segue o ritmo dos dias que já passaram. Não muda com o período escolhido acima.`}
        >
          {semMetas && (
            <div className="mb-4">
              <SemDado>
                Nenhum dia de venda fechado no mês para este filtro. O realizado de cada meta abaixo seria zero por falta de parcela, não por
                desempenho.
              </SemDado>
            </div>
          )}
          <ul className="grid gap-5 md:grid-cols-2">
            {v.metasMes.itens.map((m) => {
              const fmt = m.tipo === "brl" ? formatarBRLInteiro : (x: number) => formatarPct(x, 1);
              /**
               * Sem dia fechado não há realizado: a barra de progresso e o semáforo
               * julgariam um mês que ninguém mediu. E com meta cadastrada o "menorMelhor"
               * do CMV chegaria a dar VERDE com realizado zero (0% <= meta) — que é o
               * achado B na sua forma mais cara.
               */
              if (semMetas || m.meta === null) {
                return (
                  <li key={m.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-medium">{m.rotulo}</span>
                      <Sinal situacao={null} semDado={semMetas} />
                    </div>
                    <p className="mt-1">
                      {semMetas ? (
                        <span className="text-base text-grafite-2">{NAO_MEDIDO}: nenhum dia fechado no mês para este filtro</span>
                      ) : (
                        <span className="num">
                          <span className="font-display text-2xl font-semibold">{fmt(m.realizado)}</span>
                          <span className="text-grafite-2"> · meta: [PREENCHER]</span>
                        </span>
                      )}
                    </p>
                  </li>
                );
              }
              const atingiu = m.menorMelhor ? m.realizado <= m.meta : (m.projecao ?? m.realizado) >= m.meta;
              const progresso = m.tipo === "brl" ? m.realizado / m.meta : m.menorMelhor ? m.meta / Math.max(m.realizado, 0.0001) : m.realizado / m.meta;
              const projPct = m.projecao !== null ? m.projecao / m.meta : null;
              return (
                <li key={m.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">{m.rotulo}</span>
                    <Sinal situacao={atingiu ? "bom" : progresso >= 0.9 || (projPct !== null && projPct >= 0.9) ? "atencao" : "alerta"} />
                  </div>
                  <p className="num mt-1">
                    <span className="font-display text-2xl font-semibold">{fmt(m.realizado)}</span>
                    <span className="text-grafite-2"> {m.tipo === "brl" ? "de" : m.menorMelhor ? "· meta até" : "· meta"} {fmt(m.meta)}</span>
                  </p>
                  <div
                    className="relative mt-2 h-2.5 rounded-full bg-bancada"
                    role="progressbar"
                    aria-label={`${m.rotulo}: progresso contra a meta`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(Math.min(progresso, 1) * 100)}
                  >
                    <div className="h-full rounded-full bg-comanda" style={{ width: `${Math.min(progresso, 1) * 100}%` }} />
                    {projPct !== null && (
                      <span aria-hidden className="absolute -top-1 h-[18px] w-0.5 rounded bg-grafite" style={{ left: `calc(${Math.min(projPct, 1) * 100}% - 1px)` }} />
                    )}
                  </div>
                  {m.projecao !== null && projPct !== null && (
                    <p className="num mt-1 text-sm text-grafite-2">
                      Projeção de fechamento: {fmt(m.projecao)} ({formatarPct(projPct)} da meta)
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Painel>
      </div>
    </>
  );
}
