/**
 * Banco de DESENVOLVIMENTO, sem Docker e sem instalar nada no sistema.
 *
 * Sobe um PostgreSQL 17 DE VERDADE (binarios oficiais baixados pelo npm, rodando como
 * processo normal), aplica as migrations que faltam e fica no ar em 127.0.0.1:5433.
 * E o mesmo Postgres do docker-compose: roles reais, RLS real, senha real. O painel e o
 * worker conectam com a MESMA DATABASE_URL que usariam em producao.
 *
 * Nao e producao: fica so no seu computador, sem backup e sem rede.
 *
 * Uso:
 *   npm install          uma vez (baixa os binarios do Postgres)
 *   npm start            sobe e aplica o que falta
 *   npm run zerar        apaga o cluster inteiro e recomeca
 */
import EmbeddedPostgres from "embedded-postgres";
import pkg from "pg";
const { Client } = pkg;
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const pastaMigrations = join(aqui, "..", "migrations");
const pastaCluster = process.env.ALAVANCA_DEV_DATA ?? join(aqui, "cluster");
const arquivoSegredo = join(aqui, ".env.local");
const porta = Number(process.env.ALAVANCA_DEV_PORTA ?? 5433);
const host = "127.0.0.1";
const BANCO = "alavanca";
const DONO = "alavanca_owner";
const APP = "alavanca_app";

if (process.argv.includes("--zerar")) {
  for (const p of [pastaCluster, arquivoSegredo]) {
    if (existsSync(p)) {
      rmSync(p, { recursive: true, force: true });
      console.log(`[dev] apagado: ${p}`);
    }
  }
}

/**
 * Senhas do ambiente de desenvolvimento. Nascem aleatorias na primeira vez e ficam em
 * db/dev/.env.local, que o .gitignore cobre. Nenhuma senha vai para arquivo versionado.
 */
function segredos() {
  if (existsSync(arquivoSegredo)) {
    const lido = Object.fromEntries(
      readFileSync(arquivoSegredo, "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    );
    if (lido.POSTGRES_PASSWORD && lido.ALAVANCA_APP_PASSWORD) return lido;
  }
  const nova = () => randomBytes(18).toString("base64url");
  const s = { POSTGRES_PASSWORD: nova(), ALAVANCA_APP_PASSWORD: nova() };
  writeFileSync(
    arquivoSegredo,
    [
      "# Gerado pelo db/dev/subir.mjs na primeira execucao. Ambiente LOCAL de desenvolvimento.",
      "# O .gitignore cobre este arquivo. Nao reaproveite estas senhas em producao.",
      `POSTGRES_PASSWORD=${s.POSTGRES_PASSWORD}`,
      `ALAVANCA_APP_PASSWORD=${s.ALAVANCA_APP_PASSWORD}`,
      "",
    ].join("\n"),
    "utf8",
  );
  console.log(`[dev] senhas de desenvolvimento geradas em ${arquivoSegredo}`);
  return s;
}

const { POSTGRES_PASSWORD, ALAVANCA_APP_PASSWORD } = segredos();
const primeiraVez = !existsSync(pastaCluster);

const pg = new EmbeddedPostgres({
  databaseDir: pastaCluster,
  user: "postgres",
  password: POSTGRES_PASSWORD,
  port: porta,
  persistent: true,
  // Log do servidor em arquivo: sem isto um backend que morre nao deixa rastro.
  onLog: (m) => appendFileSync(join(aqui, "postgres.log"), `${m}\n`),
  // Sem isto o Postgres pode subir so em IPv6 (::1) e quem conecta em 127.0.0.1
  // fica esperando ate estourar o timeout. Escuta os dois, e so eles.
  postgresFlags: ["-c", "listen_addresses=127.0.0.1,::1"],
});

if (primeiraVez) {
  console.log("[dev] preparando o cluster pela primeira vez (initdb)...");
  await pg.initialise();
}
await pg.start();
console.log(`[dev] Postgres 17 no ar em ${host}:${porta}`);

/**
 * Roda SQL como superusuario, no banco pedido.
 *
 * O banco vai na string de conexao, nao numa propriedade depois de construir o cliente:
 * o pg le a configuracao no construtor, entao mexer em `cliente.database` depois nao tem
 * efeito e tudo acaba indo para o banco `postgres`.
 */
async function comoSuper(banco, fn) {
  const cliente = new Client(
    `postgres://postgres:${encodeURIComponent(POSTGRES_PASSWORD)}@${host}:${porta}/${banco}`,
  );
  await cliente.connect();
  try {
    return await fn(cliente);
  } finally {
    await cliente.end();
  }
}

const aspas = (s) => s.replace(/'/g, "''");

// Banco da aplicacao e dono, se ainda nao existirem.
await comoSuper("postgres", async (c) => {
  const temDono = await c.query("select 1 from pg_roles where rolname = $1", [DONO]);
  if (!temDono.rowCount) {
    await c.query(`create role ${DONO} login password '${aspas(POSTGRES_PASSWORD)}'`);
    console.log(`[dev] role ${DONO} criada`);
  }
  const temBanco = await c.query("select 1 from pg_database where datname = $1", [BANCO]);
  if (!temBanco.rowCount) {
    await c.query(`create database ${BANCO} owner ${DONO}`);
    console.log(`[dev] banco ${BANCO} criado`);
  }
});

// Migrations, na ordem, pulando as que ja rodaram e abortando se alguma mudou.
let novas = 0;
await comoSuper(BANCO, async (c) => {
  const aplicadas = new Map();
  try {
    const r = await c.query("select versao, checksum from alavanca.migrations");
    for (const l of r.rows) aplicadas.set(l.versao, l.checksum);
  } catch {
    /* primeira vez: a tabela nasce na 001 */
  }

  for (const nome of readdirSync(pastaMigrations).filter((n) => n.endsWith(".sql")).sort()) {
    const versao = nome.split("_")[0];
    const corpo = readFileSync(join(pastaMigrations, nome), "utf8");
    const soma = createHash("sha256").update(corpo).digest("hex");
    const antiga = aplicadas.get(versao);

    if (antiga) {
      if (antiga !== soma) {
        throw new Error(
          `a migration ${nome} ja foi aplicada e o arquivo mudou depois. ` +
            `Migration aplicada nao se edita: crie uma nova, ou rode 'npm run zerar'.`,
        );
      }
      continue;
    }

    process.stdout.write(`[dev] aplicando ${nome} ... `);
    await c.query(corpo);
    await c.query(
      `insert into alavanca.migrations (versao, nome, checksum) values ($1, $2, $3)
       on conflict (versao) do update set checksum = excluded.checksum, aplicada_em = now()`,
      [versao, nome, soma],
    );
    console.log("ok");
    novas += 1;
  }

  // A role da aplicacao nasce sem senha nas migrations; aqui ela ganha a de desenvolvimento.
  await c.query(`alter role ${APP} with login password '${aspas(ALAVANCA_APP_PASSWORD)}'`);

  const total = await c.query("select count(*)::int as n from alavanca.migrations");
  console.log(`[dev] ${total.rows[0].n} migrations aplicadas (${novas} nesta rodada).`);
});

const urlApp = `postgres://${APP}:${ALAVANCA_APP_PASSWORD}@${host}:${porta}/${BANCO}`;
// As migrations rodam como superusuario, igual ao docker-compose, entao e ele o dono do
// schema e e a conexao dele que o criar-admin precisa (a RLS esconde `tenants` da app).
const urlDono = `postgres://postgres:${POSTGRES_PASSWORD}@${host}:${porta}/${BANCO}`;

console.log(
  [
    "",
    "  Para o painel (painel/.env.local) e para o worker (worker/.env):",
    `    DATABASE_URL=${urlApp}`,
    "",
    "  So para criar o primeiro usuario (conexao do dono):",
    `    ALAVANCA_ADMIN_DATABASE_URL=${urlDono}`,
    "",
    "  E Postgres de verdade: a RLS vale sozinha, sem ALAVANCA_DB_ROLE.",
    "  Deixe esta janela aberta. Ctrl+C encerra.",
    "",
  ].join("\n"),
);

const encerrar = async () => {
  console.log("\n[dev] encerrando...");
  try {
    await pg.stop();
  } catch {
    /* ja parou */
  }
  process.exit(0);
};
process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);
setInterval(() => {}, 1 << 30);
