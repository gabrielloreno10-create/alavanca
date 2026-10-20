"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useRef } from "react";
import clsx from "clsx";
import {
  BarChart3,
  ChefHat,
  ClipboardList,
  Ellipsis,
  Home,
  LayoutGrid,
  LogOut,
  MessageCircle,
  Megaphone,
  Store,
  Target,
  Users,
  X,
  type LucideIcon } from "lucide-react";
import { sair } from "@/app/entrar/acoes";
import { PILARES, PLANO } from "@/lib/pilares";
import { PERIODOS } from "@/lib/types";
import { comFiltros, MARCA_PADRAO, usePeriodo } from "./PeriodoContexto";
import { Logo } from "./Logo";

const ICONES: Record<string, LucideIcon> = {
  "": Home,
  ifood: Store,
  "canal-proprio": Megaphone,
  crm: Target,
  whatsapp: MessageCircle,
  lucro: ChefHat,
  metricas: BarChart3,
  plano: ClipboardList,
};

const ITENS = [
  { rota: "", nome: "Hoje", nomeCurto: "Hoje" },
  ...PILARES.map((p) => ({ rota: p.rota, nome: `${p.numero}. ${p.nome}`, nomeCurto: p.nomeCurto })),
  { rota: PLANO.rota, nome: PLANO.nome, nomeCurto: PLANO.nomeCurto },
];
const BARRA_CELULAR = ["", "ifood", "lucro", "plano"];

interface Props {
  clientes: { slug: string; nome: string }[];
  /** opções do filtro de operação de cada cliente; só aparece quando há mais de uma */
  operacoes: Record<string, { id: string; nome: string }[]>;
  /** quem está logado: vem da sessão, não é mais fixo */
  usuario: { nome: string };
  /** "seed" = sem DATABASE_URL, lendo os JSON de semente */
  modo: "postgres" | "seed";
  children: React.ReactNode;
}

export function Shell({ clientes, operacoes, usuario, modo, children }: Props) {
  const { cliente: slug } = useParams<{ cliente: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { periodo, setPeriodo, operacao, setOperacao } = usePeriodo();
  const opcoesOperacao = operacoes[slug] ?? [];
  const mais = useRef<HTMLDialogElement>(null);

  const rotaAtual = pathname.split("/")[2] ?? "";
  // Os filtros viajam na URL: trocar de área não perde o período nem a marca.
  const href = (rota: string) => comFiltros(`/${slug}${rota ? `/${rota}` : ""}`, periodo, operacao);

  const seletorCliente = (
    <label className="flex min-w-0 items-center gap-2">
      <span className="sr-only">Cliente</span>
      <Users aria-hidden className="size-4 shrink-0 text-grafite-2" />
      <select
        value={slug}
        onChange={(e) => {
          // A marca é de um cliente só: trocar de cliente volta para "todas".
          router.push(comFiltros(`/${e.target.value}${rotaAtual ? `/${rotaAtual}` : ""}`, periodo, MARCA_PADRAO));
        }}
        className="h-11 min-w-0 truncate rounded-botao border border-linha bg-papel px-2 text-base font-medium text-grafite lg:h-9"
      >
        {clientes.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.nome}
          </option>
        ))}
      </select>
    </label>
  );

  const seletorOperacao =
    opcoesOperacao.length > 1 ? (
      <label className="flex min-w-0 items-center gap-2">
        <span className="sr-only">Operação</span>
        <Store aria-hidden className="size-4 shrink-0 text-grafite-2" />
        <select
          value={opcoesOperacao.some((o) => o.id === operacao) ? operacao : "todas"}
          onChange={(e) => setOperacao(e.target.value)}
          className="h-11 min-w-0 truncate rounded-botao border border-linha bg-papel px-2 text-base font-medium text-grafite lg:h-9"
        >
          {opcoesOperacao.map((o) => (
            <option key={o.id} value={o.id}>
              {o.id === "todas" ? "Todas as operações" : o.nome}
            </option>
          ))}
        </select>
      </label>
    ) : null;

  const seletorPeriodo = (
    <div role="group" aria-label="Período" className="flex rounded-botao border border-linha bg-papel p-0.5">
      {PERIODOS.map((p) => (
        <button
          key={p.id}
          type="button"
          aria-pressed={periodo === p.id}
          onClick={() => setPeriodo(p.id)}
          className={clsx(
            "h-10 flex-1 whitespace-nowrap rounded-[5px] px-3 text-sm font-medium transition-colors lg:h-8",
            periodo === p.id ? "bg-comanda text-white" : "text-grafite-2 hover:text-grafite",
          )}
        >
          {p.rotulo}
        </button>
      ))}
    </div>
  );

  const inicial = usuario.nome.trim().charAt(0).toUpperCase() || "?";
  const blocoUsuario = (
    <span className="flex items-center gap-2 text-sm text-grafite-2">
      <span aria-hidden className="grid size-8 place-items-center rounded-full bg-grafite font-display text-sm font-semibold text-white">
        {inicial}
      </span>
      <span className="hidden sm:inline">{usuario.nome}</span>
      <span className="sr-only sm:hidden">Logado como {usuario.nome}</span>
      <form action={sair}>
        <button type="submit" className="grid size-9 place-items-center rounded-botao text-grafite-2 hover:text-grafite">
          <LogOut aria-hidden className="size-4" />
          <span className="sr-only">Sair</span>
        </button>
      </form>
    </span>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      {/* Menu lateral (computador) */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-linha bg-papel lg:flex">
        <div className="px-5 py-5">
          <Logo />
        </div>
        <nav aria-label="Áreas" className="flex-1 overflow-y-auto px-3">
          <Link
            href="/"
            className="mb-2 flex min-h-10 items-center gap-3 rounded-botao px-3 py-2 text-base leading-snug text-grafite-2 transition-colors hover:bg-bancada hover:text-grafite"
          >
            <LayoutGrid aria-hidden className="size-[18px] shrink-0" />
            <span>Todos os restaurantes</span>
          </Link>
          <ul className="space-y-0.5">
            {ITENS.map((item) => {
              const Icone = ICONES[item.rota];
              const ativo = rotaAtual === item.rota;
              return (
                <li key={item.rota}>
                  <Link
                    href={href(item.rota)}
                    aria-current={ativo ? "page" : undefined}
                    className={clsx(
                      "flex min-h-10 items-center gap-3 rounded-botao px-3 py-2 text-base leading-snug transition-colors",
                      ativo ? "bg-comanda-claro font-medium text-comanda" : "text-grafite-2 hover:bg-bancada hover:text-grafite",
                    )}
                  >
                    <Icone aria-hidden className="size-[18px] shrink-0" />
                    <span>{item.nome}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <p className="px-5 py-4 text-sm text-grafite-2">Criado pelos donos da Le Tre Farine e da Jerry&apos;s</p>
      </aside>

      <div className="min-w-0">
        {/* Topo */}
        <header className="sticky top-0 z-20 border-b border-linha bg-bancada/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-2 lg:px-8 lg:py-3">
            <div className="lg:hidden">
              <Logo />
            </div>
            <div className="ml-auto flex min-w-0 items-center gap-3 lg:ml-0">
              {seletorCliente}
              <span className="hidden lg:contents">{seletorOperacao}</span>
            </div>
            <div className="hidden lg:ml-auto lg:block">{seletorPeriodo}</div>
            {blocoUsuario}
          </div>
          {modo === "seed" ? (
            <p className="bg-bancada px-4 pb-2 text-sm text-grafite-2 lg:px-8">
              Modo de semente: sem <code>DATABASE_URL</code>, estes números vêm dos JSON de exemplo, não do banco.
            </p>
          ) : null}
          <div className="grid gap-2 px-4 pb-2 lg:hidden">
            {seletorOperacao}
            {seletorPeriodo}
          </div>
        </header>

        <main id="conteudo" className="mx-auto max-w-[1200px] px-4 pb-28 pt-5 lg:px-8 lg:pb-12 lg:pt-8">
          {children}
        </main>
      </div>

      {/* Barra inferior (celular) */}
      <nav aria-label="Áreas" className="fixed inset-x-0 bottom-0 z-30 border-t border-linha bg-papel pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="grid grid-cols-5">
          {BARRA_CELULAR.map((rota) => {
            const item = ITENS.find((i) => i.rota === rota)!;
            const Icone = ICONES[rota];
            const ativo = rotaAtual === rota;
            return (
              <li key={rota}>
                <Link
                  href={href(rota)}
                  aria-current={ativo ? "page" : undefined}
                  className={clsx("flex h-14 flex-col items-center justify-center gap-0.5 text-sm", ativo ? "text-comanda" : "text-grafite-2")}
                >
                  <Icone aria-hidden className="size-5" />
                  {item.nomeCurto}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => mais.current?.showModal()}
              aria-haspopup="dialog"
              className={clsx(
                "flex h-14 w-full flex-col items-center justify-center gap-0.5 text-sm",
                !BARRA_CELULAR.includes(rotaAtual) ? "text-comanda" : "text-grafite-2",
              )}
            >
              <Ellipsis aria-hidden className="size-5" />
              Mais
            </button>
          </li>
        </ul>
      </nav>

      {/* Menu "Mais" (celular) */}
      <dialog
        ref={mais}
        aria-label="Todas as áreas"
        onClick={(e) => e.target === mais.current && mais.current?.close()}
        className="m-0 mt-auto w-full max-w-none rounded-t-painel border border-linha bg-papel p-0 text-grafite lg:hidden"
      >
        <div className="flex items-center justify-between border-b border-linha px-4 py-3">
          <h2 className="font-display text-lg font-semibold">Todas as áreas</h2>
          <button type="button" onClick={() => mais.current?.close()} className="grid size-11 place-items-center rounded-botao text-grafite-2">
            <X aria-hidden className="size-5" />
            <span className="sr-only">Fechar</span>
          </button>
        </div>
        <ul className="px-2 py-2 pb-[calc(env(safe-area-inset-bottom)+8px)]">
          {ITENS.map((item) => {
            const Icone = ICONES[item.rota];
            const ativo = rotaAtual === item.rota;
            return (
              <li key={item.rota}>
                <Link
                  href={href(item.rota)}
                  onClick={() => mais.current?.close()}
                  aria-current={ativo ? "page" : undefined}
                  className={clsx("flex h-12 items-center gap-3 rounded-botao px-3 text-base", ativo ? "bg-comanda-claro font-medium text-comanda" : "text-grafite")}
                >
                  <Icone aria-hidden className="size-5 shrink-0 text-grafite-2" />
                  {item.nome}
                </Link>
              </li>
            );
          })}
        </ul>
      </dialog>
    </div>
  );
}
