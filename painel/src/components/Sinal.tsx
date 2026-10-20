import { AlertTriangle, CheckCircle2, Minus, OctagonAlert } from "lucide-react";
import clsx from "clsx";
import type { Situacao } from "@/lib/types";

const MAPA = {
  bom: { rotulo: "Bom", Icone: CheckCircle2, cor: "text-manjericao" },
  atencao: { rotulo: "Atenção", Icone: AlertTriangle, cor: "text-acafrao" },
  alerta: { rotulo: "Alerta", Icone: OctagonAlert, cor: "text-tomate" },
  nenhum: { rotulo: "Sem meta", Icone: Minus, cor: "text-grafite-2" },
} as const;

/** Situação sempre com ícone + palavra; a cor nunca vem sozinha. */
/** null = não há meta para comparar */
export function Sinal({ situacao, className }: { situacao: Situacao | null; className?: string }) {
  const { rotulo, Icone, cor } = MAPA[situacao ?? "nenhum"];
  return (
    <span className={clsx("inline-flex items-center gap-1 text-sm font-medium text-grafite", className)}>
      <Icone aria-hidden className={clsx("size-4 shrink-0", cor)} strokeWidth={2.25} />
      {rotulo}
    </span>
  );
}
