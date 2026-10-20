/**
 * Proxy (o que o Next.js chamava de middleware até a versão 16).
 *
 * Faz só a checagem OTIMISTA do cookie de sessão, que é para o que o proxy serve: quem
 * não tem cookie nenhum vai direto para o login sem gastar um render. A autorização de
 * verdade é `exigirSessao()` em cada página — o cookie aqui não é validado.
 */
import { NextResponse, type NextRequest } from "next/server";

const COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];
const PUBLICO = ["/entrar", "/api/auth"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLICO.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (COOKIES.some((c) => request.cookies.has(c))) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/entrar";
  url.search = "";
  url.searchParams.set("de", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  // Tudo, menos os arquivos estáticos do próprio Next.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
