#!/usr/bin/env node
/**
 * Aplica as migrations do Alavanca em QUALQUER Postgres 17, sem psql e sem Docker.
 *
 * Existe porque aplicar.sh e aplicar.ps1 dependem de `psql` instalado ou de
 * `docker compose exec`. Numa maquina Windows sem nenhum dos dois, e contra um
 * banco gerenciado na nuvem (Neon, Supabase, RDS, o que for), eles nao servem.
 * Este aqui so precisa de Node e do pacote "pg" — a mesma receita que o
 * db/dev/subir.mjs ja usa localmente, soltada do Postgres embarcado.
 *
 * Uso:
 *   npm run status     lista o que ja foi aplicado (nao escreve nada)
 *   npm run dry-run    diz o que aplicaria (nao escreve nada)
 *   npm run aplicar    aplica o que falta
 *
 * De onde vem a conexao (nesta ordem):
 *   1. ALAVANCA_ADMIN_DATABASE_URL  -> use esta: e a conexao do DONO do banco
 *   2. DATABASE_URL                 -> so se a de cima faltar
 *   Se existir um db/.env, as variaveis que faltarem no ambiente sao lidas de la.
 *
 * Contra banco gerenciado use a URL DIRETA (nao a "pooled"/PgBouncer): migration
 * e DDL longa, e o pooler em modo transaction nao e lugar para isso. A URL
 * pooled e para o painel em runtime, nao para aqui.
 *
 * TLS: obrigatorio quando o host nao e local. `sslmode=require` na propria URL
 * e aceito (criptografa sem validar o certificado, igual ao libpq);
 * `sslmode=verify-full` valida a cadeia.
 *
 * Nenhuma senha e escrita em arquivo nem impressa na tela.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const aqui = dirname(fileURLToPath(import.meta.url));

const USO = `
Uso:
  node aplicar.mjs             aplica as migrations que faltam
  node aplicar.mjs --status    lista o que ja foi aplicado (nao escreve nada)
  node aplicar.mjs --dry-run   diz o que aplicaria (nao escreve nada)

Opcoes:
  --migrations=<pasta>  usa outra pasta de migrations (so para teste)
  --ajuda               mostra isto

Variaveis de ambiente:
  ALAVANCA_ADMIN_DATABASE_URL  conexao do dono do banco (a direta, nao a pooled)
  DATABASE_URL                 usada so se a de cima faltar
  ALAVANCA_APP_PASSWORD        senha dada a role alavanca_app no fim; sem ela,
                               o passo e pulado com aviso
  ALAVANCA_DB_CA_FILE          arquivo PEM da CA, para sslmode=verify-ca/verify-full
`;

const log = (m) => console.log(`[aplicar] ${m}`);
const aviso = (m) => console.warn(`[aplicar] AVISO: ${m}`);

// NOTICEs do Postgres. As migrations sao idempotentes e por isso disparam uma
// enxurrada de "does not exist, skipping" / "already exists, skipping" a cada
// `drop ... if exists` e `create ... if not exists`. Esse ruido esconde o que
// importa, entao fica de fora; o resto (raise notice das proprias migrations)
// e guardado e impresso depois que a linha da migration fecha.
const RUIDO = /(does not exist, skipping|already exists, skipping)$/i;
const notas = [];
const guardarNota = (n) => {
  if (!RUIDO.test(n.message ?? "")) notas.push(n.message);
};
function despejarNotas() {
  while (notas.length) console.log(`       postgres: ${notas.shift()}`);
}

function morrer(mensagem) {
  console.error(`\n[aplicar] ERRO: ${mensagem}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------
function lerArgumentos(argv) {
  const opcoes = { status: false, dryRun: false, ajuda: false, migrations: null };
  for (const a of argv) {
    if (a === "--status") opcoes.status = true;
    else if (a === "--dry-run" || a === "--dry") opcoes.dryRun = true;
    else if (a === "--ajuda" || a === "--help" || a === "-h") opcoes.ajuda = true;
    else if (a.startsWith("--migrations=")) opcoes.migrations = a.slice("--migrations=".length);
    else morrer(`opcao desconhecida: ${a}\n${USO}`);
  }
  return opcoes;
}

// ---------------------------------------------------------------------------
// db/.env, se existir: preenche o que faltar no ambiente. Nunca sobrescreve
// uma variavel que ja veio de fora, e nunca imprime valor.
// ---------------------------------------------------------------------------
function completarComEnvLocal() {
  const caminho = join(aqui, ".env");
  if (!existsSync(caminho)) return;
  let achou = 0;
  for (const linha of readFileSync(caminho, "utf8").split(/\r?\n/)) {
    const l = linha.trim();
    if (!l || l.startsWith("#") || !l.includes("=")) continue;
    const chave = l.slice(0, l.indexOf("=")).trim();
    const valor = l
      .slice(l.indexOf("=") + 1)
      .trim()
      .replace(/^["'](.*)["']$/, "$1");
    if (valor && process.env[chave] === undefined) {
      process.env[chave] = valor;
      achou += 1;
    }
  }
  if (achou) log(`${achou} variavel(is) lida(s) de ${caminho}`);
}

// ---------------------------------------------------------------------------
// Conexao: a URL vira configuracao explicita do pg.
//
// Nao passamos `connectionString` para o pg de proposito. O pg deixa o que vem
// da string vencer o que vem do objeto, entao a decisao de TLS ficaria refem da
// versao do pg-connection-string. Parseando aqui, o que mandamos e o que vale.
// ---------------------------------------------------------------------------
const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function ehLocal(host) {
  const h = host.toLowerCase();
  return HOSTS_LOCAIS.has(h) || h.endsWith(".localhost") || h.startsWith("127.");
}

function configurarTls(sslmode, local, host) {
  const modo = (sslmode ?? "").toLowerCase();

  if (local) {
    // No Postgres embarcado do db/dev nao ha TLS. So liga se pedirem.
    if (["require", "no-verify", "prefer"].includes(modo)) return { rejectUnauthorized: false };
    if (["verify-ca", "verify-full"].includes(modo)) return { rejectUnauthorized: true, ...caDoAmbiente() };
    return false;
  }

  if (["disable", "allow", "prefer"].includes(modo)) {
    morrer(
      `a URL aponta para ${host}, que nao e local, e pede sslmode=${modo}.\n` +
        `       Senha de banco nao viaja sem TLS. Troque para sslmode=require na URL\n` +
        `       (ou verify-full, se voce tiver o certificado da CA do provedor).`,
    );
  }
  if (modo === "verify-ca" || modo === "verify-full") {
    return { rejectUnauthorized: true, servername: host, ...caDoAmbiente() };
  }
  if (modo === "require" || modo === "no-verify") {
    // Semantica do libpq: criptografa, nao valida a cadeia. E o que os
    // provedores gerenciados colocam na string que eles mesmos entregam.
    return { rejectUnauthorized: false, servername: host };
  }
  // Sem sslmode na URL: exigimos TLS validado. Se o certificado do provedor nao
  // validar, a mensagem de erro la embaixo manda acrescentar sslmode=require.
  return { rejectUnauthorized: true, servername: host };
}

function caDoAmbiente() {
  const arquivo = process.env.ALAVANCA_DB_CA_FILE?.trim();
  if (!arquivo) return {};
  if (!existsSync(arquivo)) morrer(`ALAVANCA_DB_CA_FILE aponta para um arquivo que nao existe: ${arquivo}`);
  return { ca: readFileSync(arquivo, "utf8") };
}

function configDaUrl(bruta) {
  let u;
  try {
    u = new URL(bruta);
  } catch {
    morrer(
      "a URL de conexao nao foi entendida.\n" +
        "       Formato esperado: postgres://usuario:senha@host:5432/banco?sslmode=require\n" +
        "       Se a senha tem @ : / ou #, ela precisa vir percent-encoded.",
    );
  }
  if (!/^postgres(ql)?:$/i.test(u.protocol)) {
    morrer(`a URL comeca com "${u.protocol}//" e deveria comecar com "postgres://" ou "postgresql://".`);
  }

  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host) morrer("a URL de conexao nao traz o host.");
  const banco = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!banco) morrer("a URL de conexao nao traz o nome do banco (a parte depois da ultima barra).");
  const usuario = decodeURIComponent(u.username);
  if (!usuario) morrer("a URL de conexao nao traz o usuario.");

  const local = ehLocal(host);
  const cfg = {
    host,
    port: Number(u.port || 5432),
    user: usuario,
    password: decodeURIComponent(u.password),
    database: banco,
    ssl: configurarTls(u.searchParams.get("sslmode"), local, host),
    application_name: "alavanca-aplicar",
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
  };
  // Alguns provedores pedem parametros de servidor na URL (ex.: options=endpoint%3D...).
  const options = u.searchParams.get("options");
  if (options) cfg.options = options;
  return { cfg, local };
}

function urlDoAmbiente() {
  const admin = process.env.ALAVANCA_ADMIN_DATABASE_URL?.trim();
  const comum = process.env.DATABASE_URL?.trim();
  if (admin) return { url: admin, de: "ALAVANCA_ADMIN_DATABASE_URL" };
  if (comum) {
    aviso(
      "usando DATABASE_URL porque ALAVANCA_ADMIN_DATABASE_URL nao foi definida.\n" +
        "       DATABASE_URL costuma ser a conexao da role alavanca_app, que nao tem\n" +
        "       permissao para criar schema nem rodar DDL. Se der erro de permissao,\n" +
        "       e isso.",
    );
    return { url: comum, de: "DATABASE_URL" };
  }
  morrer(
    "nenhuma URL de conexao no ambiente.\n" +
      "       Defina ALAVANCA_ADMIN_DATABASE_URL com a conexao do DONO do banco\n" +
      "       (a URL direta do provedor, nao a pooled) e rode de novo.\n" +
      "\n" +
      "       PowerShell:  $env:ALAVANCA_ADMIN_DATABASE_URL = 'postgres://...'\n" +
      "       bash:        export ALAVANCA_ADMIN_DATABASE_URL='postgres://...'\n" +
      "       ou escreva a variavel no db/.env (que o .gitignore cobre).",
  );
}

// ---------------------------------------------------------------------------
// Migrations em disco
// ---------------------------------------------------------------------------
function pastaDasMigrations(opcao) {
  const escolhida = opcao ?? process.env.ALAVANCA_MIGRATIONS_DIR ?? join(aqui, "migrations");
  const caminho = isAbsolute(escolhida) ? escolhida : resolve(process.cwd(), escolhida);
  if (!existsSync(caminho) || !statSync(caminho).isDirectory()) {
    morrer(`pasta de migrations nao encontrada: ${caminho}`);
  }
  return caminho;
}

function lerMigrations(pasta) {
  const arquivos = readdirSync(pasta)
    .filter((n) => n.toLowerCase().endsWith(".sql"))
    .sort();
  if (!arquivos.length) morrer(`nenhum arquivo .sql em ${pasta}`);

  const vistas = new Map();
  return arquivos.map((nome) => {
    const versao = nome.split("_")[0];
    if (!/^\d+$/.test(versao)) {
      morrer(`o arquivo ${nome} nao comeca com um numero de versao (ex.: 016_assunto.sql).`);
    }
    if (vistas.has(versao)) {
      morrer(`duas migrations com a mesma versao ${versao}: ${vistas.get(versao)} e ${nome}.`);
    }
    vistas.set(versao, nome);
    // Mesmo calculo do db/dev/subir.mjs e do aplicar.sh: sha256 do conteudo do
    // arquivo. Tem que bater, senao um banco aplicado por um acusa o outro.
    const corpo = readFileSync(join(pasta, nome), "utf8");
    return { versao, nome, corpo, checksum: createHash("sha256").update(corpo).digest("hex") };
  });
}

// Arquivo que ja abre e fecha a propria transacao (todas as 001..015 fazem).
const TEM_TRANSACAO_PROPRIA = (corpo) => /^[ \t]*begin[ \t]*;/im.test(corpo);

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------
const BOOTSTRAP = `
create schema if not exists alavanca;
create table if not exists alavanca.migrations (
  versao      text primary key,
  nome        text not null,
  checksum    text not null,
  aplicada_em timestamptz not null default now()
);
`;

const SQL_INSERIR =
  `insert into alavanca.migrations (versao, nome, checksum) values ($1, $2, $3)
   on conflict (versao) do update set nome = excluded.nome,
                                      checksum = excluded.checksum,
                                      aplicada_em = now()`;

async function lerAplicadas(cliente) {
  const existe = await cliente.query("select to_regclass('alavanca.migrations') is not null as tem");
  if (!existe.rows[0].tem) return null;
  const r = await cliente.query(
    "select versao, nome, checksum, aplicada_em from alavanca.migrations order by versao",
  );
  return new Map(r.rows.map((l) => [l.versao, l]));
}

const quando = (d) => (d instanceof Date ? d.toISOString().replace("T", " ").slice(0, 19) : String(d));

function abortarPorChecksum(m, registro) {
  morrer(
    `a migration ${m.nome} ja foi aplicada neste banco e o arquivo mudou depois.\n` +
      `       aplicada em: ${quando(registro.aplicada_em)}\n` +
      `       checksum no banco:   ${registro.checksum}\n` +
      `       checksum do arquivo: ${m.checksum}\n` +
      "\n" +
      "       Migration aplicada nao se edita. Desfaca a alteracao no arquivo e crie\n" +
      "       a proxima numerada (016_..., 017_...) com a mudanca que voce queria.\n" +
      "       Em banco de desenvolvimento descartavel da para recomecar do zero\n" +
      "       (db/dev: npm run zerar).",
  );
}

// ---------------------------------------------------------------------------
// Senha da role de aplicacao. A 001 cria alavanca_app SEM senha de proposito;
// sem este passo o painel nao conecta. A senha vem do ambiente, nunca de
// arquivo versionado, e nunca aparece na tela nem no log.
// ---------------------------------------------------------------------------
async function senhaDaRoleApp(cliente) {
  const senha = process.env.ALAVANCA_APP_PASSWORD;
  if (!senha || !senha.trim()) {
    aviso(
      "ALAVANCA_APP_PASSWORD nao foi definida, entao a role alavanca_app continua\n" +
        "       sem senha e o painel NAO vai conseguir conectar com ela.\n" +
        "       Defina a variavel e rode de novo (so este passo roda outra vez).\n" +
        "       Nenhuma senha e inventada aqui.",
    );
    return false;
  }
  if (/[\r\n]/.test(senha)) morrer("ALAVANCA_APP_PASSWORD contem quebra de linha. Gere outra sem isso.");

  const existe = await cliente.query("select 1 from pg_roles where rolname = 'alavanca_app'");
  if (!existe.rowCount) {
    aviso("a role alavanca_app nao existe neste banco. A 001 deveria te-la criado; nada a fazer.");
    return false;
  }

  // ALTER ROLE nao aceita parametro ligado: a senha entra como literal escapado.
  // standard_conforming_strings e on por padrao, entao dobrar a aspa basta.
  const literal = `'${senha.replace(/'/g, "''")}'`;
  try {
    await cliente.query(`alter role alavanca_app with login password ${literal}`);
  } catch (e) {
    if (e.code === "42501") {
      morrer(
        "sem permissao para dar senha a role alavanca_app.\n" +
          "       Conecte com o DONO do banco (ALAVANCA_ADMIN_DATABASE_URL) ou peca ao\n" +
          "       provedor uma role com CREATEROLE.",
      );
    }
    throw e;
  }
  // Alguns provedores tiram CONNECT do PUBLIC. Melhor garantir, sem quebrar se
  // esta conexao nao tiver poder para isso.
  await cliente.query(`
    do $$
    begin
      execute format('grant connect on database %I to alavanca_app', current_database());
    exception when others then
      raise notice 'nao consegui dar connect no database para alavanca_app (%) - confira no provedor', sqlerrm;
    end
    $$;
  `);
  log("senha da role alavanca_app definida (valor nao impresso).");
  return true;
}

// ---------------------------------------------------------------------------
// Erros de conexao em portugues util
// ---------------------------------------------------------------------------
function explicarFalha(e, cfg) {
  const onde = `${cfg.host}:${cfg.port}/${cfg.database}`;
  switch (e.code) {
    case "ECONNREFUSED":
      return `nada atendeu em ${onde}. O banco esta no ar? A porta esta certa?`;
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `o host "${cfg.host}" nao resolveu. Confira o endereco na URL.`;
    case "ETIMEDOUT":
      return `tempo esgotado conectando em ${onde}. Firewall, VPN ou IP nao liberado no provedor.`;
    case "28P01":
      return `usuario ou senha recusados por ${onde} (usuario "${cfg.user}").`;
    case "28000":
      return `${onde} recusou a autenticacao do usuario "${cfg.user}" (${e.message}).`;
    case "3D000":
      return `o banco "${cfg.database}" nao existe no servidor ${cfg.host}. Crie-o no provedor antes.`;
    case "42501":
      return `sem permissao: ${e.message}\n       Use a conexao do DONO do banco (ALAVANCA_ADMIN_DATABASE_URL).`;
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "CERT_HAS_EXPIRED":
      return (
        `o certificado TLS de ${cfg.host} nao foi validado (${e.code}).\n` +
        "       Acrescente ?sslmode=require na URL para criptografar sem validar a cadeia,\n" +
        "       ou aponte ALAVANCA_DB_CA_FILE para o PEM da CA e use sslmode=verify-full."
      );
    default:
      if (/does not support SSL|server does not support SSL/i.test(e.message ?? "")) {
        return `${cfg.host} nao fala TLS. Se for um banco local de teste, tire o sslmode da URL.`;
      }
      return `${e.message}${e.code ? ` (codigo ${e.code})` : ""}`;
  }
}

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------
async function principal() {
  const opcoes = lerArgumentos(process.argv.slice(2));
  if (opcoes.ajuda) {
    console.log(USO);
    return;
  }
  if (opcoes.status && opcoes.dryRun) morrer("--status e --dry-run nao andam juntos.");

  completarComEnvLocal();
  const { url, de } = urlDoAmbiente();
  const { cfg, local } = configDaUrl(url);
  const pasta = pastaDasMigrations(opcoes.migrations);
  const migrations = lerMigrations(pasta);

  log(`migrations: ${pasta} (${migrations.length} arquivo(s))`);
  log(
    `conexao: ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database} ` +
      `[${de}, TLS ${cfg.ssl ? (cfg.ssl.rejectUnauthorized ? "validado" : "sem validar cadeia") : "desligado (host local)"}]`,
  );
  if (!local && /pooler|pgbouncer|-pooler\./i.test(cfg.host)) {
    aviso(
      "o host parece ser o endpoint POOLED do provedor. Migration deve ir pela URL\n" +
        "       direta; a pooled e para o painel em runtime.",
    );
  }

  const cliente = new Client(cfg);
  cliente.on("notice", guardarNota);
  try {
    await cliente.connect();
  } catch (e) {
    morrer(explicarFalha(e, cfg));
  }

  let travou = false;
  try {
    // ---- status: so le ----------------------------------------------------
    if (opcoes.status) {
      const aplicadas = await lerAplicadas(cliente);
      if (aplicadas === null) {
        log("a tabela alavanca.migrations ainda nao existe: nenhuma migration aplicada aqui.");
        for (const m of migrations) console.log(`  pendente  ${m.nome}`);
        return;
      }
      console.log("");
      console.log("  situacao   versao  nome                              aplicada em");
      for (const m of migrations) {
        const r = aplicadas.get(m.versao);
        const estado = !r ? "pendente " : r.checksum === m.checksum ? "ok       " : "ALTERADA ";
        console.log(
          `  ${estado}  ${m.versao.padEnd(6)}  ${m.nome.padEnd(32)}  ${r ? quando(r.aplicada_em) : "-"}`,
        );
      }
      const orfas = [...aplicadas.values()].filter((r) => !migrations.some((m) => m.versao === r.versao));
      for (const r of orfas) {
        console.log(`  SEM ARQUIVO ${r.versao.padEnd(6)}  ${r.nome.padEnd(32)}  ${quando(r.aplicada_em)}`);
      }
      console.log("");
      const alteradas = migrations.filter((m) => {
        const r = aplicadas.get(m.versao);
        return r !== undefined && r.checksum !== m.checksum;
      });
      const pendentes = migrations.filter((m) => !aplicadas.has(m.versao));
      log(`${aplicadas.size} aplicada(s), ${pendentes.length} pendente(s), ${alteradas.length} alterada(s) depois de aplicada(s).`);
      if (orfas.length) aviso(`${orfas.length} linha(s) em alavanca.migrations sem arquivo correspondente nesta pasta.`);
      if (alteradas.length) process.exitCode = 1;
      return;
    }

    // ---- dry-run: so le ---------------------------------------------------
    if (opcoes.dryRun) {
      const aplicadas = (await lerAplicadas(cliente)) ?? new Map();
      for (const m of migrations) {
        const r = aplicadas.get(m.versao);
        if (r && r.checksum !== m.checksum) abortarPorChecksum(m, r);
      }
      const pendentes = migrations.filter((m) => !aplicadas.has(m.versao));
      if (!pendentes.length) {
        log(`nada a fazer: as ${aplicadas.size} migrations ja estao aplicadas.`);
      } else {
        log(`aplicaria ${pendentes.length} migration(s), nesta ordem:`);
        for (const m of pendentes) console.log(`    ${m.nome}  (sha256 ${m.checksum.slice(0, 12)}...)`);
      }
      const temSenha = !!process.env.ALAVANCA_APP_PASSWORD?.trim();
      log(
        temSenha
          ? "depois disso, daria senha a role alavanca_app (ALAVANCA_APP_PASSWORD esta definida)."
          : "nao daria senha a role alavanca_app: ALAVANCA_APP_PASSWORD nao esta definida.",
      );
      log("dry-run: nada foi escrito no banco.");
      return;
    }

    // ---- aplicacao de verdade --------------------------------------------
    // Trava de sessao: dois aplicadores ao mesmo tempo no mesmo banco quebram
    // feio. O numero e arbitrario e fixo, so precisa ser o mesmo nos dois lados.
    const trava = await cliente.query("select pg_try_advisory_lock(7201431) as peguei");
    if (!trava.rows[0].peguei) {
      morrer("outro aplicador esta rodando contra este banco agora. Espere ele terminar.");
    }
    travou = true;

    await cliente.query(BOOTSTRAP);
    const aplicadas = (await lerAplicadas(cliente)) ?? new Map();

    // Confere TUDO antes de escrever qualquer coisa: se alguma ja aplicada
    // mudou, abortamos sem ter aplicado nada nesta rodada.
    for (const m of migrations) {
      const r = aplicadas.get(m.versao);
      if (r && r.checksum !== m.checksum) abortarPorChecksum(m, r);
    }

    let novas = 0;
    for (const m of migrations) {
      if (aplicadas.has(m.versao)) {
        console.log(`   ja aplicada  ${m.nome}`);
        continue;
      }
      process.stdout.write(`-> aplicando    ${m.nome} ... `);
      const proprias = TEM_TRANSACAO_PROPRIA(m.corpo);
      try {
        if (proprias) {
          // O arquivo abre e fecha a propria transacao (begin; ... commit;).
          // O registro entra logo depois, fora dela — igual ao db/dev e ao
          // aplicar.sh. As migrations sao idempotentes, entao uma queda entre
          // os dois passos se resolve rodando de novo.
          await cliente.query(m.corpo);
          await cliente.query(SQL_INSERIR, [m.versao, m.nome, m.checksum]);
        } else {
          // Arquivo sem transacao propria: DDL e registro no mesmo commit.
          await cliente.query("begin");
          await cliente.query(m.corpo);
          await cliente.query(SQL_INSERIR, [m.versao, m.nome, m.checksum]);
          await cliente.query("commit");
        }
      } catch (e) {
        console.log("FALHOU");
        despejarNotas();
        if (!proprias) {
          try {
            await cliente.query("rollback");
          } catch {
            /* a transacao ja morreu */
          }
        }
        morrer(
          `${m.nome} nao foi aplicada.\n` +
            `       ${e.message}${e.position ? ` (caractere ${e.position} do comando)` : ""}` +
            `${e.code ? `\n       codigo ${e.code}` : ""}\n` +
            `${e.hint ? `       dica do postgres: ${e.hint}\n` : ""}` +
            "       Nada depois dela foi aplicado. Corrija e rode de novo.",
        );
      }
      console.log("ok");
      despejarNotas();
      novas += 1;
    }

    await senhaDaRoleApp(cliente);
    despejarNotas();

    const total = await cliente.query("select count(*)::int as n from alavanca.migrations");
    const tabelas = await cliente.query(
      `select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'alavanca' and c.relkind = 'r'`,
    );
    console.log("");
    log(`pronto: ${novas} migration(s) nova(s).`);
    log(`${total.rows[0].n} migrations aplicadas, ${tabelas.rows[0].n} tabelas no schema alavanca.`);
    if (novas) {
      console.log("");
      console.log("  Conexao do painel e do worker (a senha e a ALAVANCA_APP_PASSWORD que voce usou):");
      console.log(
        `    postgres://alavanca_app:SENHA@${cfg.host}:${cfg.port}/${cfg.database}` +
          `${local ? "" : "?sslmode=require"}`,
      );
      console.log("");
    }
  } finally {
    if (travou) {
      try {
        await cliente.query("select pg_advisory_unlock(7201431)");
      } catch {
        /* a conexao ja caiu; a trava morre com ela */
      }
    }
    await cliente.end().catch(() => {});
  }
}

principal().catch((e) => {
  morrer(`${e.message}${e.code ? ` (codigo ${e.code})` : ""}`);
});
