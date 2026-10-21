/**
 * Proxy (o que o Next.js chamava de middleware até a versão 16).
 *
 * Faz só a checagem OTIMISTA do cookie de sessão, que é para o que o proxy serve: quem
 * não tem cookie nenhum vai direto para o login sem gastar um render. A autorização de
 * verdade é `exigirSessao()` em cada página — o cookie aqui não é validado.
 *
 * Também carimba `Cache-Control: no-store` em tudo que passa por aqui. O matcher já
 * exclui os estáticos do Next, então o que sobra é página e rota de API — ou seja, tela
 * com faturamento de cliente. Isso não fica em cache de navegador, de proxy nem de CDN:
 * computador compartilhado e botão "voltar" não podem reexibir o painel de quem saiu.
 */
import { NextResponse, type NextRequest } from "next/server";

const COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];
/** Rotas que respondem sem sessão. `/api/saude` não diz nada que dependa de quem pergunta. */
const PUBLICO = ["/entrar", "/api/auth", "/api/saude"];

const SEM_CACHE = "no-store, max-age=0, must-revalidate";

function semCache(resposta: NextResponse): NextResponse {
  resposta.headers.set("Cache-Control", SEM_CACHE);
  return resposta;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLICO.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return semCache(NextResponse.next());
  if (COOKIES.some((c) => request.cookies.has(c))) return semCache(NextResponse.next());

  const url = request.nextUrl.clone();
  url.pathname = "/entrar";
  url.search = "";
  url.searchParams.set("de", `${pathname}${search}`);
  return semCache(NextResponse.redirect(url));
}

export const config = {
  // Tudo, menos os arquivos estáticos do próprio Next.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
