export function Carregando() {
  return (
    <div aria-busy="true" className="grid gap-4">
      <span className="sr-only">Carregando…</span>
      <div className="h-8 w-56 rounded-botao bg-linha/60" />
      <div className="h-64 rounded-painel border border-linha bg-papel" />
    </div>
  );
}
