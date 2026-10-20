"use client";

import { useActionState } from "react";
import { entrar } from "./acoes";

export function FormEntrar({ de }: { de: string }) {
  const [erro, acao, enviando] = useActionState(entrar, null);

  return (
    <form action={acao} className="grid gap-4">
      <input type="hidden" name="de" value={de} />

      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-grafite">E-mail</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="h-11 rounded-botao border border-linha bg-papel px-3 text-base text-grafite"
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-grafite">Senha</span>
        <input
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 rounded-botao border border-linha bg-papel px-3 text-base text-grafite"
        />
      </label>

      {erro ? (
        <p role="alert" className="rounded-botao border border-linha bg-bancada px-3 py-2 text-sm text-grafite">
          {erro}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enviando}
        className="h-11 rounded-botao bg-comanda px-4 text-base font-medium text-white disabled:opacity-60"
      >
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
