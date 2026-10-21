import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança, em toda resposta.
 *
 * O `Cache-Control: no-store` das telas NÃO está aqui: ele é carimbado em src/proxy.ts,
 * que já sabe separar página de estático do Next. Aqui ficam só os que valem para tudo,
 * inclusive para um .js do bundle.
 */
const SEGURANCA = [
  // Nada de adivinhar tipo: um JSON servido como HTML vira XSS.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // O caminho do painel carrega o slug do restaurante. Não vaza para fora do site.
  { key: "Referrer-Policy", value: "same-origin" },
  // Clickjacking: o painel não roda dentro de iframe de ninguém.
  { key: "X-Frame-Options", value: "DENY" },
  // Mesma coisa, na versão que os navegadores atuais obedecem.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // O painel não usa nada disto; negar é mais barato do que auditar depois.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // Ignorado em http, então é seguro mandar sempre. Sem includeSubDomains: o domínio da
  // Tapaggo tem outros subdomínios e não é este painel que decide por eles.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  // cacheComponents e partialPrefetching vieram ligados do esboço e foram DESLIGADOS em
  // 19/10/2026, ao trocar os JSON estáticos pelo Postgres.
  //
  // Motivo, medido: com eles ligados o Next renderiza a casca da página e aborta o
  // trabalho pendente para servir o resto por streaming. Esse abort derruba a conexão
  // que a consulta estava usando, o driver emite `read ECONNRESET` e a tela fica presa
  // em "Carregando…". O Postgres não registra erro nenhum, porque o problema não é dele.
  // Aconteceu na tela de Lucro (3 blocos de dados) com Postgres real e com embarcado.
  //
  // Religar só quando houver motivo e com as telas de dado dinâmico testadas uma a uma.
  cacheComponents: false,
  partialPrefetching: false,
  // Não anuncia o framework em toda resposta.
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:caminho*", headers: SEGURANCA }];
  },
};

export default nextConfig;
