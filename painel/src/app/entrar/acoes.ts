"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

/** Só caminhos internos viram destino depois do login. Nada de redirect aberto. */
function destinoSeguro(de: unknown): string {
  const s = typeof de === "string" ? de : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function entrar(_estado: string | null, dados: FormData): Promise<string | null> {
  const email = String(dados.get("email") ?? "").trim();
  const senha = String(dados.get("senha") ?? "");
  if (!email || !senha) return "Preencha e-mail e senha.";
  try {
    await signIn("credentials", { email, senha, redirectTo: destinoSeguro(dados.get("de")) });
  } catch (erro) {
    // signIn sinaliza o redirect lançando: só o erro de autenticação vira mensagem.
    if (erro instanceof AuthError) return "E-mail ou senha incorretos.";
    throw erro;
  }
  return null;
}

export async function sair(): Promise<void> {
  await signOut({ redirectTo: "/entrar" });
}
