import { CircleDashed, Database, Info } from "lucide-react";
import clsx from "clsx";
import { NAO_MEDIDO } from "@/lib/formato";
import type { BlocosOrigem, Origem, OrigemTela } from "@/lib/types";

/**
 * DUAS AUSÊNCIAS DIFERENTES, DUAS FORMAS DIFERENTES.
 *
 * O DESIGN.md já reservou o açafrão para "dado de exemplo" e proíbe inventar uma quarta
 * cor. Então "sem dado ainda" não ganha cor nenhuma: ganha a forma que o calendário de
 * Métricas já usava para o dia sem registro — borda TRACEJADA em cinza-linha.
 *
 *   açafrão sólido  = existe número, mas fomos nós que o fabricamos (EXEMPLO)
 *   traço cinza     = não existe número nenhum para mostrar (SEM_DADO)
 *
 * Um dono que vê o selo açafrão sabe que pode ler o número com ressalva. Um dono que vê
 * o traço cinza sabe que não há número para ler. Confundir os dois é o achado F.
 */

const selo = "inline-flex items-center rounded-[4px] px-1.5 align-middle font-sans text-[13px] font-medium leading-5";

/** Marca de bloco com número fabricado por nós, ao lado do título */
export function MarcaExemplo({ className }: { className?: string }) {
  return <span className={clsx(selo, "border border-acafrao/50 bg-acafrao-fundo text-acafrao-texto", className)}>Exemplo</span>;
}

/** Marca de bloco sem nenhuma linha na fonte: não há número, e por isso não há selo colorido */
export function MarcaSemDado({ className }: { className?: string }) {
  return (
    <span className={clsx(selo, "border border-dashed border-linha bg-bancada text-grafite-2", className)}>{NAO_MEDIDO}</span>
  );
}

/** O selo certo para a origem do bloco. REAL não leva selo: é o caso normal. */
export function MarcaOrigem({ origem, className }: { origem?: Origem; className?: string }) {
  if (origem === "EXEMPLO") return <MarcaExemplo className={className} />;
  if (origem === "SEM_DADO") return <MarcaSemDado className={className} />;
  return null;
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);

/**
 * A faixa no topo da tela. Só é açafrão quando existe mesmo bloco de EXEMPLO: uma tela
 * REAL + SEM_DADO não tem exemplo nenhum e pintá-la de açafrão seria mentir ao contrário.
 */
export function FaixaExemplo({ origem, fonte, blocos }: { origem: OrigemTela; fonte?: string; blocos?: BlocosOrigem }) {
  if (origem === "REAL") {
    if (!fonte) return null;
    return (
      <p role="note" className="mb-5 flex items-start gap-2 text-sm text-grafite-2">
        <Database aria-hidden className="mt-0.5 size-4 shrink-0" />
        {fonte}
      </p>
    );
  }

  const estados = Object.values(blocos ?? {});
  const nExemplo = estados.filter((o) => o === "EXEMPLO").length;
  const nSemDado = estados.filter((o) => o === "SEM_DADO").length;
  // Sem `blocos` não dá para afirmar que não há exemplo; o caminho conservador é o selo.
  const temExemplo = origem === "EXEMPLO" || nExemplo > 0 || (origem === "MISTO" && !blocos);

  const texto =
    origem === "EXEMPLO"
      ? "Dados de exemplo nesta tela. Os números existem, mas fomos nós que os semeamos: os reais entram quando houver arquivo com esses dados."
      : origem === "SEM_DADO"
        ? `Nada nesta tela foi medido para este filtro: a fonte não trouxe nenhuma linha. Não é zero, é ausência — por isso cada campo diz "${NAO_MEDIDO}" em vez de um número.`
        : temExemplo
          ? `Parte desta tela não é dado real do cliente: ${[
              nExemplo > 0 ? `${plural(nExemplo, "bloco é de exemplo", "blocos são de exemplo")}` : "",
              nSemDado > 0 ? `${plural(nSemDado, "bloco ainda não foi medido", "blocos ainda não foram medidos")}` : "",
            ]
              .filter(Boolean)
              .join(" e ")}. O selo ao lado de cada título diz qual é qual.`
          : `Parte desta tela ainda não foi medida: ${plural(nSemDado, "bloco não tem", "blocos não têm")} nenhuma linha na fonte. ` +
            `Esses blocos dizem "${NAO_MEDIDO}" em vez de mostrar zero.`;

  return (
    <p
      role="note"
      className={clsx(
        "mb-5 flex items-start gap-2 rounded-botao border px-3 py-2 text-sm",
        temExemplo ? "border-acafrao/50 bg-acafrao-fundo text-acafrao-texto" : "border-dashed border-linha bg-papel text-grafite-2",
      )}
    >
      {temExemplo ? (
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-acafrao" />
      ) : (
        <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0" />
      )}
      <span>
        {texto}
        {fonte && ` ${fonte}`}
      </span>
    </p>
  );
}
