/**
 * Roda UMA vez, quando uma instância do servidor sobe, e tem que terminar antes do
 * primeiro request ser atendido (Next.js, "instrumentation.js").
 *
 * Serve para uma coisa só: conferir o ambiente. Em produção, faltar DATABASE_URL ou
 * AUTH_SECRET derruba a inicialização com uma mensagem legível, em vez de o painel subir
 * e servir os JSON de exemplo como se fossem dados do cliente. Em desenvolvimento e
 * durante o `next build` as mesmas faltas viram aviso no console.
 */
export async function register(): Promise<void> {
  // Só no runtime Node: no Edge (o proxy) não há banco nem sessão para conferir.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;

  const { exigirAmbiente } = await import("@/lib/ambiente");
  exigirAmbiente();
}
