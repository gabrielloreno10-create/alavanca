import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // .tsx entra para os testes de tela: eles renderizam os componentes de verdade
  // (react-dom/server) e conferem o que o dono veria, não só o que a camada de dados devolve.
  test: { include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
