/**
 * Leitura do ambiente: o que é desenvolvimento, o que é produção de verdade, e quais
 * variáveis precisam existir ANTES do primeiro request.
 *
 * Existe por causa do modo de semente (src/lib/fonte/seed.ts). Sem `DATABASE_URL` o
 * painel abre lendo os JSON de `src/data/clientes/` — ótimo em desenvolvimento e no
 * teste, inaceitável em produção: seria servir número de exemplo como se fosse o
 * faturamento do cliente. Em produção, variável faltando é ERRO, não fallback.
 *
 * Nada aqui abre conexão nem importa driver: é só leitura de `process.env`. Por isso
 * roda na inicialização do servidor (src/instrumentation.ts) e dentro do teste.
 */

export type Env = Record<string, string | undefined>;

const VERDADE = new Set(["1", "true", "sim", "yes", "on"]);
const FALSIDADE = new Set(["0", "false", "nao", "não", "no", "off"]);
const SSL_DESLIGADO = new Set(["disable", "disabled", "off", "false", "0", "no", "nao", "não"]);

/** "1"/"true"/"on" => true, "0"/"false"/"off" => false, vazio ou lixo => null (use o padrão). */
export function bandeira(valor: string | undefined): boolean | null {
  const v = valor?.trim().toLowerCase();
  if (!v) return null;
  if (VERDADE.has(v)) return true;
  if (FALSIDADE.has(v)) return false;
  return null;
}

/** Inteiro > 0 ou null. String vazia vira null — `Number("")` é 0 e 0 aqui é bug. */
export function inteiroPositivo(valor: string | undefined): number | null {
  const v = valor?.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** `next build` roda com NODE_ENV=production; isto distingue o build do servidor no ar. */
export function emBuild(env: Env = process.env): boolean {
  return env.NEXT_PHASE === "phase-production-build";
}

/** Produção DE VERDADE: servidor atendendo request, não o build. */
export function emProducao(env: Env = process.env): boolean {
  return env.NODE_ENV === "production" && !emBuild(env);
}

/**
 * Função serverless (Vercel, Lambda, Netlify): processo curto, muitas instâncias, cada
 * uma abrindo conexão própria. É o que define o tamanho do pool e se dá para usar
 * prepared statement. `ALAVANCA_SERVERLESS` força, para quem roda em container.
 */
export function emServerless(env: Env = process.env): boolean {
  const explicito = bandeira(env.ALAVANCA_SERVERLESS);
  if (explicito !== null) return explicito;
  return Boolean(env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME || env.NETLIFY);
}

const HOSTS_LOCAIS = new Set(["", "localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/** Host da URL de conexão, ou null se a URL não for sequer analisável. */
export function hostDoBanco(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Banco na própria máquina (db/dev, Docker local, socket unix). URL quebrada NÃO é local. */
export function bancoLocal(url: string): boolean {
  const h = hostDoBanco(url);
  if (h === null) return false;
  return HOSTS_LOCAIS.has(h) || h.endsWith(".localhost") || h.startsWith("/");
}

/** Usuário da URL de conexão. Em produção tem que ser `alavanca_app` — a dona fura a RLS. */
export function usuarioDoBanco(url: string): string | null {
  try {
    return decodeURIComponent(new URL(url).username) || null;
  } catch {
    return null;
  }
}

export function parametroDaUrl(url: string, nome: string): string | null {
  try {
    return new URL(url).searchParams.get(nome);
  } catch {
    return null;
  }
}

export function sslForcadoDesligado(env: Env = process.env): boolean {
  return SSL_DESLIGADO.has((env.DATABASE_SSL ?? "").trim().toLowerCase());
}

export type Severidade = "erro" | "aviso";

export interface ProblemaDeAmbiente {
  severidade: Severidade;
  variavel: string;
  mensagem: string;
}

export class AmbienteInvalido extends Error {
  readonly problemas: ProblemaDeAmbiente[];

  constructor(problemas: ProblemaDeAmbiente[]) {
    super(
      [
        "Ambiente de produção incompleto — o painel não sobe assim:",
        ...problemas.map((p) => `  • ${p.variavel}: ${p.mensagem}`),
        "Defina estas variáveis no provedor (na Vercel: Settings → Environment Variables) e implante de novo.",
      ].join("\n"),
    );
    this.name = "AmbienteInvalido";
    this.problemas = problemas;
  }
}

/**
 * Lista o que está errado no ambiente. Em produção os itens essenciais são `erro`;
 * em desenvolvimento e no teste os mesmos itens viram `aviso`, porque lá o modo de
 * semente é um recurso, não um acidente.
 */
export function conferirAmbiente(env: Env = process.env): ProblemaDeAmbiente[] {
  const prod = emProducao(env);
  const grave: Severidade = prod ? "erro" : "aviso";
  const problemas: ProblemaDeAmbiente[] = [];

  const url = env.DATABASE_URL?.trim() ?? "";
  const urlOk = url !== "" && hostDoBanco(url) !== null;

  if (!url) {
    problemas.push({
      severidade: grave,
      variavel: "DATABASE_URL",
      mensagem: prod
        ? "não definida. Sem ela o painel cairia no modo de semente e serviria os JSON de exemplo como se fossem dados do cliente."
        : "não definida: o painel vai ler os JSON de src/data/clientes/, não o Postgres.",
    });
  } else if (!urlOk) {
    problemas.push({
      severidade: "erro",
      variavel: "DATABASE_URL",
      mensagem: "não é uma URL de conexão analisável (esquema postgres:// com usuário, senha, host, porta e banco).",
    });
  }

  const segredo = (env.AUTH_SECRET ?? env.NEXTAUTH_SECRET ?? "").trim();
  if (!segredo) {
    problemas.push({
      severidade: grave,
      variavel: "AUTH_SECRET",
      mensagem: prod
        ? "não definida. É o segredo que assina o JWT da sessão. Gere com: openssl rand -base64 32"
        : "não definida: o Auth.js usa um segredo volátil e a sessão cai a cada reinício.",
    });
  } else if (prod && segredo.length < 32) {
    problemas.push({
      severidade: "aviso",
      variavel: "AUTH_SECRET",
      mensagem: "tem menos de 32 caracteres. Gere um novo com: openssl rand -base64 32",
    });
  }

  if (prod && urlOk) {
    if (bancoLocal(url)) {
      // Só reclama em serverless: `next start` na máquina do dev também é NODE_ENV=production,
      // e ali apontar para 127.0.0.1 é exatamente o certo.
      if (emServerless(env)) {
        problemas.push({
          severidade: "aviso",
          variavel: "DATABASE_URL",
          mensagem: "aponta para a própria máquina (localhost), e em função serverless não há Postgres na mesma máquina.",
        });
      }
    } else if (sslForcadoDesligado(env)) {
      problemas.push({
        severidade: "aviso",
        variavel: "DATABASE_SSL",
        mensagem: "desliga o TLS para um banco remoto: senha e dados trafegam em claro.",
      });
    }

    const usuario = usuarioDoBanco(url);
    if (usuario && usuario !== "alavanca_app") {
      problemas.push({
        severidade: "aviso",
        variavel: "DATABASE_URL",
        mensagem: `conecta como "${usuario}", não como alavanca_app. A role dona passa por cima da RLS e um tenant enxergaria o outro.`,
      });
    }

    const role = env.ALAVANCA_DB_ROLE?.trim();
    if (role && role !== "alavanca_app") {
      problemas.push({
        severidade: "aviso",
        variavel: "ALAVANCA_DB_ROLE",
        mensagem: `está "${role}". Em produção deixe vazio (a conexão já é da role de aplicação) ou use alavanca_app.`,
      });
    }

    if ((env.ALAVANCA_SEED_ADMIN_SENHA_HASH ?? "").trim()) {
      problemas.push({
        severidade: "aviso",
        variavel: "ALAVANCA_SEED_ADMIN_SENHA_HASH",
        mensagem: "é o login do modo de semente e não tem por que existir em produção. Remova.",
      });
    }
  }

  return problemas;
}

/**
 * Conferência de inicialização: avisa o que der para tolerar e LANÇA no que não der.
 * Chamada por src/instrumentation.ts, antes do servidor aceitar o primeiro request.
 */
export function exigirAmbiente(env: Env = process.env): ProblemaDeAmbiente[] {
  const problemas = conferirAmbiente(env);

  for (const p of problemas) {
    if (p.severidade === "aviso") console.warn(`[alavanca] ambiente — ${p.variavel}: ${p.mensagem}`);
  }

  const erros = problemas.filter((p) => p.severidade === "erro");
  if (erros.length > 0) throw new AmbienteInvalido(erros);

  return problemas;
}
