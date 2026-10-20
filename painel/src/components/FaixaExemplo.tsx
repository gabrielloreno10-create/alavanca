import { Database, Info } from "lucide-react";
import type { OrigemTela } from "@/lib/types";

const TEXTO: Record<Exclude<OrigemTela, "REAL">, string> = {
  EXEMPLO: "Dados de exemplo nesta tela. Os números reais entram quando houver arquivo com esses dados.",
  MISTO: "Parte desta tela já usa dados reais. Os blocos marcados com Exemplo ainda são de exemplo.",
};

export function FaixaExemplo({ origem, fonte }: { origem: OrigemTela; fonte?: string }) {
  if (origem === "REAL") {
    if (!fonte) return null;
    return (
      <p role="note" className="mb-5 flex items-start gap-2 text-sm text-grafite-2">
        <Database aria-hidden className="mt-0.5 size-4 shrink-0" />
        {fonte}
      </p>
    );
  }
  return (
    <p
      role="note"
      className="mb-5 flex items-start gap-2 rounded-botao border border-acafrao/50 bg-acafrao-fundo px-3 py-2 text-sm text-acafrao-texto"
    >
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-acafrao" />
      <span>
        {TEXTO[origem]}
        {fonte && ` ${fonte}`}
      </span>
    </p>
  );
}

/** Marca de bloco ainda de exemplo, ao lado do título */
export function MarcaExemplo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-[4px] border border-acafrao/50 bg-acafrao-fundo px-1.5 align-middle font-sans text-[13px] font-medium leading-5 text-acafrao-texto ${className ?? ""}`}>
      Exemplo
    </span>
  );
}
