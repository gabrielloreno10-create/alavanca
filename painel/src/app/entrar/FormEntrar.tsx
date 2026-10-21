"use client";

import { useActionState } from "react";
import { entrar } from "./acoes";

export function FormEntrar({ de }: { de: string }) {
  const [erro, acao, enviando] = useActionState(entrar, null);

  return (
    <form action={acao} className="grid gap-4">
      <input type="hidden" name="de" value={de} />

      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-grafite">E-mail ou usuário</span>
        {/*
          type="text", não "email": com type="email" o próprio navegador barra o envio de
          qualquer coisa sem arroba, e contas internas de serviço (ex.: "admin") nunca
          chegariam ao servidor para serem recusadas com uma mensagem nossa. A validação
          de quem pode entrar é do servidor, não do atributo do input.
        */}
        <input
          name="email"
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
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
