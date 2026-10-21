import { describe, expect, it } from "vitest";
import {
  AmbienteInvalido,
  bandeira,
  bancoLocal,
  conferirAmbiente,
  emProducao,
  emServerless,
  exigirAmbiente,
  inteiroPositivo,
  usuarioDoBanco,
  type Env,
} from "./ambiente";
import { modoSsl, opcoesDeConexao } from "./db";

/**
 * Todas as funções conferidas aqui recebem o ambiente por parâmetro: o teste não mexe em
 * process.env, então não há ordem de execução nem vazamento de um caso para o outro.
 */

const URL_LOCAL = "postgres://alavanca_app@127.0.0.1:5433/alavanca";
const URL_REMOTA = "postgres://alavanca_app@ep-abc-123.sa-east-1.exemplo.com/alavanca?sslmode=require";
const SEGREDO = "a".repeat(44);

const producao = (extra: Env = {}): Env => ({
  NODE_ENV: "production",
  DATABASE_URL: URL_REMOTA,
  AUTH_SECRET: SEGREDO,
  ...extra,
});

describe("leitura do ambiente", () => {
  it("bandeira entende 1/0 e devolve null para vazio ou lixo", () => {
    expect(bandeira("1")).toBe(true);
    expect(bandeira("TRUE")).toBe(true);
    expect(bandeira("0")).toBe(false);
    expect(bandeira("off")).toBe(false);
    expect(bandeira("")).toBeNull();
    expect(bandeira(undefined)).toBeNull();
    expect(bandeira("talvez")).toBeNull();
  });

  it("inteiroPositivo trata string vazia como ausente (Number('') é 0, e 0 aqui seria bug)", () => {
    expect(inteiroPositivo("5")).toBe(5);
    expect(inteiroPositivo("")).toBeNull();
    expect(inteiroPositivo("0")).toBeNull();
    expect(inteiroPositivo("-1")).toBeNull();
    expect(inteiroPositivo("2.5")).toBeNull();
    expect(inteiroPositivo(undefined)).toBeNull();
  });

  it("o build de produção não conta como produção", () => {
    expect(emProducao({ NODE_ENV: "production" })).toBe(true);
    expect(emProducao({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" })).toBe(false);
    expect(emProducao({ NODE_ENV: "development" })).toBe(false);
  });

  it("serverless é detectado pelo provedor e pode ser forçado nos dois sentidos", () => {
    expect(emServerless({})).toBe(false);
    expect(emServerless({ VERCEL: "1" })).toBe(true);
    expect(emServerless({ AWS_LAMBDA_FUNCTION_NAME: "painel" })).toBe(true);
    expect(emServerless({ VERCEL: "1", ALAVANCA_SERVERLESS: "0" })).toBe(false);
    expect(emServerless({ ALAVANCA_SERVERLESS: "1" })).toBe(true);
  });

  it("reconhece host local e usuário da URL de conexão", () => {
    expect(bancoLocal(URL_LOCAL)).toBe(true);
    expect(bancoLocal("postgres://u@localhost:5432/a")).toBe(true);
    expect(bancoLocal(URL_REMOTA)).toBe(false);
    expect(bancoLocal("isto-não-é-url")).toBe(false);
    expect(usuarioDoBanco(URL_REMOTA)).toBe("alavanca_app");
  });
});

describe("conferência de ambiente", () => {
  it("fora de produção, faltar banco e segredo é só aviso", () => {
    const problemas = conferirAmbiente({ NODE_ENV: "development" });
    expect(problemas.map((p) => p.variavel).sort()).toEqual(["AUTH_SECRET", "DATABASE_URL"]);
    expect(problemas.every((p) => p.severidade === "aviso")).toBe(true);
  });

  it("em produção, faltar banco e segredo é ERRO", () => {
    const problemas = conferirAmbiente({ NODE_ENV: "production" });
    const erros = problemas.filter((p) => p.severidade === "erro").map((p) => p.variavel);
    expect(erros.sort()).toEqual(["AUTH_SECRET", "DATABASE_URL"]);
  });

  it("produção completa não reclama de nada", () => {
    expect(conferirAmbiente(producao())).toEqual([]);
  });

  it("URL de conexão ilegível é erro mesmo fora de produção", () => {
    const problemas = conferirAmbiente({ NODE_ENV: "development", DATABASE_URL: "@@", AUTH_SECRET: SEGREDO });
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatchObject({ severidade: "erro", variavel: "DATABASE_URL" });
  });

  it("avisa quando produção conecta com uma role que não é alavanca_app", () => {
    const problemas = conferirAmbiente(producao({ DATABASE_URL: "postgres://postgres@banco.exemplo.com/alavanca" }));
    expect(problemas).toHaveLength(1);
    expect(problemas[0].severidade).toBe("aviso");
    expect(problemas[0].mensagem).toContain("RLS");
  });

  it("avisa quando o login do modo de semente fica ligado em produção", () => {
    const problemas = conferirAmbiente(producao({ ALAVANCA_SEED_ADMIN_SENHA_HASH: "$2b$10$qualquercoisa" }));
    expect(problemas.map((p) => p.variavel)).toEqual(["ALAVANCA_SEED_ADMIN_SENHA_HASH"]);
  });

  it("exigirAmbiente lança em produção e passa quando está tudo no lugar", () => {
    expect(() => exigirAmbiente({ NODE_ENV: "production" })).toThrow(AmbienteInvalido);
    expect(() => exigirAmbiente({ NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
    expect(() => exigirAmbiente(producao())).not.toThrow();
  });
});

describe("opções de conexão", () => {
  it("local segue igual ao que sempre foi: pool 5, prepared statement ligado, sem TLS", () => {
    expect(opcoesDeConexao(URL_LOCAL, {})).toEqual({
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: true,
      ssl: false,
    });
  });

  it("em serverless o pool cai para 1 e o prepared statement sai (PgBouncer em transaction)", () => {
    expect(opcoesDeConexao(URL_REMOTA, { VERCEL: "1" })).toEqual({
      max: 1,
      idle_timeout: 10,
      connect_timeout: 5,
      prepare: false,
      ssl: "require",
    });
  });

  it("cada padrão pode ser forçado por variável", () => {
    const env: Env = {
      VERCEL: "1",
      DATABASE_POOL_MAX: "3",
      DATABASE_IDLE_TIMEOUT: "30",
      DATABASE_CONNECT_TIMEOUT: "8",
      DATABASE_PREPARE: "1",
      DATABASE_SSL: "verify-full",
    };
    expect(opcoesDeConexao(URL_REMOTA, env)).toEqual({
      max: 3,
      idle_timeout: 30,
      connect_timeout: 8,
      prepare: true,
      ssl: "verify-full",
    });
  });

  it("DATABASE_POOL_MAX vazio não vira pool zero", () => {
    expect(opcoesDeConexao(URL_LOCAL, { DATABASE_POOL_MAX: "" }).max).toBe(5);
  });
});

describe("TLS", () => {
  it("localhost dispensa, host remoto exige", () => {
    expect(modoSsl(URL_LOCAL, {})).toBe(false);
    expect(modoSsl("postgres://u@banco.exemplo.com/alavanca", {})).toBe("require");
  });

  it("a URL não consegue rebaixar o TLS de um banco remoto", () => {
    expect(modoSsl("postgres://u@banco.exemplo.com/a?sslmode=disable", {})).toBe("require");
  });

  it("mas consegue subir: verify-full na URL continua verify-full", () => {
    expect(modoSsl("postgres://u@banco.exemplo.com/a?sslmode=verify-full", {})).toBe("verify-full");
    expect(modoSsl("postgres://u@banco.exemplo.com/a?sslrootcert=system", {})).toBe("verify-full");
  });

  it("DATABASE_SSL manda em tudo, inclusive para desligar", () => {
    expect(modoSsl(URL_REMOTA, { DATABASE_SSL: "disable" })).toBe(false);
    expect(modoSsl(URL_LOCAL, { DATABASE_SSL: "require" })).toBe("require");
  });

  it("DATABASE_SSL com valor desconhecido falha alto, em vez de virar silêncio", () => {
    expect(() => modoSsl(URL_REMOTA, { DATABASE_SSL: "talvez" })).toThrow(/DATABASE_SSL/);
  });
});
