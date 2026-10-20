import type { NextConfig } from "next";

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
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
