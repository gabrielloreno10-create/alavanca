#!/usr/bin/env node
/**
 * Cadastra (ou atualiza) um usuário do painel e, se pedido, liga ele a tenants.
 *
 * A senha vem SEMPRE de variável de ambiente, nunca de argumento de linha de comando
 * (argumento aparece no histórico do shell e na lista de processos) e nunca de arquivo.
 * No banco entra só o hash bcrypt.
 *
 *   ALAVANCA_ADMIN_EMAIL=...  ALAVANCA_ADMIN_NOME=...  ALAVANCA_ADMIN_SENHA=...  \
 *   npm run criar-admin -- grupo-le-tre
 *
 * Só gerar o hash (modo sem banco, para ALAVANCA_SEED_ADMIN_SENHA_HASH):
 *   ALAVANCA_ADMIN_SENHA=... npm run criar-admin -- --hash
 *
 * Para LIGAR o usuário a um tenant é preciso uma conexão que enxergue a tabela
 * `tenants` sem o app.tenant_id setado — ou seja, a role dona (ALAVANCA_ADMIN_DATABASE_URL).
 * Com a role de aplicação a RLS esconde os tenants, e o script avisa em vez de fingir.
 */
import { hash } from "bcryptjs";
import postgres from "postgres";

const CUSTO = 12;

function exigir(nome) {
  const v = process.env[nome]?.trim();
  if (!v) {
    console.error(`Falta a variável de ambiente ${nome}.`);
    process.exit(1);
  }
  return v;
}

const args = process.argv.slice(2);
const senha = exigir("ALAVANCA_ADMIN_SENHA");
if (senha.length < 12) {
  console.error("ALAVANCA_ADMIN_SENHA: use pelo menos 12 caracteres.");
  process.exit(1);
}
const senhaHash = await hash(senha, CUSTO);

if (args.includes("--hash")) {
  console.log(senhaHash);
  console.log("\nColoque em ALAVANCA_SEED_ADMIN_SENHA_HASH (modo sem banco). Não comite este valor.");
  process.exit(0);
}

const email = exigir("ALAVANCA_ADMIN_EMAIL");
const nome = process.env.ALAVANCA_ADMIN_NOME?.trim() || email;
const papel = process.env.ALAVANCA_ADMIN_PAPEL?.trim() || "platform_admin";
const slugs = args.filter((a) => !a.startsWith("-"));

const url = process.env.ALAVANCA_ADMIN_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("Falta DATABASE_URL (ou ALAVANCA_ADMIN_DATABASE_URL).");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  const [usuario] = await sql`
    insert into alavanca.usuarios (email, nome, senha_hash)
    values (${email}, ${nome}, ${senhaHash})
    on conflict (lower(email)) do update
      set nome = excluded.nome, senha_hash = excluded.senha_hash, ativo = true, atualizado_em = now()
    returning id::text as id, email, nome
  `;
  console.log(`usuário ${usuario.email} (${usuario.id}) gravado.`);

  for (const slug of slugs) {
    const [tenant] = await sql`select id::text as id, nome from alavanca.tenants where slug = ${slug}`;
    if (!tenant) {
      console.error(
        `tenant "${slug}" não encontrado nesta conexão. Se você conectou com a role de aplicação, ` +
          "a RLS esconde os tenants: rode de novo com ALAVANCA_ADMIN_DATABASE_URL (role dona).",
      );
      continue;
    }
    await sql.begin(async (tx) => {
      await tx`select set_config('app.tenant_id', ${tenant.id}, true)`;
      await tx`select set_config('app.usuario_id', ${usuario.id}, true)`;
      await tx`
        insert into alavanca.usuario_tenant (tenant_id, usuario_id, papel)
        values (${tenant.id}::uuid, ${usuario.id}::uuid, ${papel})
        on conflict (tenant_id, usuario_id) do update set papel = excluded.papel, ativo = true
      `;
    });
    console.log(`  ligado a ${tenant.nome} (${slug}) como ${papel}.`);
  }

  if (!slugs.length) console.log("nenhum tenant informado: passe os slugs como argumento para dar acesso.");
} catch (erro) {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
