"use client";

import { useSyncExternalStore } from "react";
import { formatarDataLonga } from "@/lib/formato";

const nada = () => () => {};

function cumprimento(h: number) {
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

/** A data vem do relógio de quem abre a tela, não do servidor. */
export function Saudacao({ nome }: { nome: string }) {
  const texto = useSyncExternalStore(
    nada,
    () => {
      const d = new Date();
      return `${cumprimento(d.getHours())}|${formatarDataLonga(d)}`;
    },
    () => "|",
  );
  const [ola, data] = texto.split("|");
  return (
    <div className="mb-5 min-h-[62px] lg:mb-7">
      <p className="text-sm text-grafite-2">{ola ? `${ola}, ${nome}` : " "}</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight">{data || " "}</h1>
    </div>
  );
}
