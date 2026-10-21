import { AlertTriangle, CheckCircle2, CircleDashed, Minus, OctagonAlert } from "lucide-react";
import clsx from "clsx";
import type { Situacao } from "@/lib/types";

const MAPA = {
  bom: { rotulo: "Bom", Icone: CheckCircle2, cor: "text-manjericao" },
  atencao: { rotulo: "Atenção", Icone: AlertTriangle, cor: "text-acafrao" },
  alerta: { rotulo: "Alerta", Icone: OctagonAlert, cor: "text-tomate" },
  /** há número, mas não há meta contra a qual julgá-lo */
  nenhum: { rotulo: "Sem meta", Icone: Minus, cor: "text-grafite-2" },
  /** não há número nenhum: nem bom, nem ruim, nem "sem meta" */
  sem_dado: { rotulo: "Não medido", Icone: CircleDashed, cor: "text-grafite-2" },
} as const;

/**
 * Situação sempre com ícone + palavra; a cor nunca vem sozinha.
 *
 * `situacao` null tem DOIS motivos possíveis e eles não podem sair com a mesma palavra:
 * "Sem meta" (existe número, falta a régua) e "Não medido" (não existe número). Verde
 * por falta de meta foi o achado B; "Sem meta" sobre um pilar vazio seria a mesma
 * mentira, só mais discreta.
 */
export function Sinal({ situacao, semDado, className }: { situacao: Situacao | null; semDado?: boolean; className?: string }) {
  const { rotulo, Icone, cor } = MAPA[situacao ?? (semDado ? "sem_dado" : "nenhum")];
  return (
    <span className={clsx("inline-flex items-center gap-1 text-sm font-medium text-grafite", className)}>
      <Icone aria-hidden className={clsx("size-4 shrink-0", cor)} strokeWidth={2.25} />
      {rotulo}
    </span>
  );
}
