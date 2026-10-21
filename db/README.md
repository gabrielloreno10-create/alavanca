# db — Postgres da plataforma Alavanca

Modelo explicado em [`../docs/modelo-dados.md`](../docs/modelo-dados.md).

As migrations em [`migrations/`](migrations) são a única fonte da verdade do
schema. O que muda é **onde** elas rodam. São três caminhos, e eles aplicam
exatamente os mesmos arquivos, na mesma ordem, com o mesmo controle de
checksum.

| caminho | quando usar | precisa de |
|---|---|---|
| **dev embarcado** (`dev/subir.mjs`) | desenvolver na sua máquina | só Node |
| **banco gerenciado** (`aplicar.mjs`) | Neon, Supabase, RDS, qualquer Postgres 17 na nuvem | só Node |
| **docker** (`aplicar.sh` / `aplicar.ps1`) | quem já tem Docker e prefere | Docker, ou `psql` instalado |

## 1. Desenvolvimento, sem Docker e sem instalar nada

```bash
cd dev
npm install     # uma vez: baixa os binários do Postgres 17
npm start       # sobe em 127.0.0.1:5433 e aplica o que falta
npm run zerar   # apaga o cluster e recomeça do zero
```

Postgres de verdade: roles reais, RLS real, senha real. As senhas nascem
aleatórias em `dev/.env.local` (coberto pelo `.gitignore`) e o próprio
`subir.mjs` imprime as duas `DATABASE_URL` — a da aplicação (`alavanca_app`) e
a do dono, que o `painel/scripts/criar-admin.mjs` precisa.

É este o caminho usado no dia a dia, e é o único que fica de pé sozinho: deixe
a janela aberta enquanto estiver trabalhando.

## 2. Banco gerenciado (produção / staging)

`aplicar.mjs` é o mesmo aplicador do `dev/subir.mjs`, solto do Postgres
embarcado: **Node e nada mais**. Sem `psql`, sem Docker, sem cliente nativo.

```bash
npm install                 # uma vez, aqui no db/ (instala o pacote "pg")

# a URL vai por variável de ambiente — nunca em arquivo versionado
# PowerShell:
$env:ALAVANCA_ADMIN_DATABASE_URL = 'postgres://dono:senha@host:5432/alavanca?sslmode=require'
$env:ALAVANCA_APP_PASSWORD       = '...'      # senha que a role alavanca_app vai ganhar
# bash:
export ALAVANCA_ADMIN_DATABASE_URL='postgres://dono:senha@host:5432/alavanca?sslmode=require'
export ALAVANCA_APP_PASSWORD='...'

npm run status      # o que já foi aplicado (não escreve nada)
npm run dry-run     # o que seria aplicado (não escreve nada)
npm run aplicar     # aplica o que falta
```

O que ele faz, nesta ordem:

1. lê `ALAVANCA_ADMIN_DATABASE_URL` (ou `DATABASE_URL`, se a primeira faltar —
   com aviso, porque essa costuma ser a conexão sem poder de DDL);
2. exige TLS quando o host não é local, e aceita `sslmode` na própria URL;
3. aplica, em ordem, **só** as migrations que faltam, e grava
   versão/nome/checksum em `alavanca.migrations`;
4. **aborta** se um arquivo já aplicado tiver mudado — e aborta *antes* de
   aplicar qualquer coisa, então uma rodada recusada não deixa meio caminho;
5. dá senha à role `alavanca_app` a partir de `ALAVANCA_APP_PASSWORD`. Sem essa
   variável ele **pula o passo e avisa** — não inventa senha. A senha nunca é
   impressa nem escrita em arquivo.

Pontos que custam caro se forem ignorados:

- **Use a URL direta, não a "pooled".** Provedores gerenciados entregam duas
  strings: a direta e a do pooler (PgBouncer em modo *transaction*). Migration é
  DDL longa e não é trabalho de pooler; a pooled é para o painel em runtime. Se
  o host tiver cara de pooler, o `aplicar.mjs` avisa.
- **Conecte como o dono do banco.** `create schema`, `create role`, `alter
  role` e os `grant` das migrations precisam disso. Com a conexão da aplicação
  o erro é `42501 / sem permissão`.
- **O banco precisa existir antes.** O `aplicar.mjs` não cria database: isso se
  faz no painel do provedor. Ele também não é específico de nenhum provedor —
  qualquer Postgres 17 gerenciado serve.
- **`sslmode`:** `require` criptografa sem validar a cadeia (é o que os
  provedores colocam na string que eles mesmos entregam). `verify-full` valida —
  para isso aponte `ALAVANCA_DB_CA_FILE` para o PEM da CA. Sem `sslmode` na
  URL, a validação é exigida. `disable` em host remoto é recusado.

Opções: `--status`, `--dry-run`, `--ajuda` e `--migrations=<pasta>` (esta
última só serve para teste, para rodar contra uma cópia da pasta).

Se existir um `db/.env` (coberto pelo `.gitignore`), as variáveis que faltarem
no ambiente são lidas de lá. Nenhum valor é impresso.

## 3. Docker — **nunca foi testado**

```bash
cp .env.example .env     # preencha POSTGRES_PASSWORD e ALAVANCA_APP_PASSWORD
docker compose up -d     # Postgres 17 em 127.0.0.1:5433
./aplicar.sh             # Windows: .\aplicar.ps1
./aplicar.sh --status
```

Aviso honesto: **`aplicar.sh` e `aplicar.ps1` nunca foram executados nem uma
vez.** Foram escritos antes do `dev/subir.mjs` existir e dependem de `psql`
instalado ou de `docker compose exec`, que é justamente o que não havia na
máquina. Eles continuam aqui porque o `docker-compose.yml` é um caminho
legítimo para quem já usa Docker, mas trate-os como código não verificado: na
primeira vez, rode com `--status` antes.

O `aplicar.mjs` (caminho 2) funciona contra o banco do compose também — basta
apontar `ALAVANCA_ADMIN_DATABASE_URL` para `127.0.0.1:5433`. É o atalho se o
`aplicar.sh` der problema.

## Três regras ao mexer aqui

1. **Migration aplicada não se edita.** Os três aplicadores guardam o SHA-256
   de cada arquivo e recusam rodar se um deles mudou. Para corrigir, crie a
   próxima numerada (`016_...`). O checksum é o mesmo cálculo nos três, então um
   banco aplicado por um não acusa o outro.
2. **Toda tabela nova de domínio** tem `tenant_id uuid NOT NULL` e chama
   `select alavanca.proteger_tabela('alavanca.<tabela>');` logo depois do
   `create table`. Não existe janela sem RLS.
3. **Toda view** declara `with (security_invoker = true)`. Sem isso ela roda com
   os privilégios do dono e fura o isolamento por tenant.

Convém que cada migration abra e feche a própria transação (`begin;` … `commit;`),
como fazem as 001–015. O `aplicar.mjs` respeita isso; num arquivo sem transação
própria ele abre uma, e aí o DDL e o registro em `alavanca.migrations` entram no
mesmo commit.

## Conexões

| role | para quê | poderes |
|---|---|---|
| dono do banco (`alavanca_owner` no compose, `postgres` no dev, o que o provedor der no gerenciado) | rodar migrations e criar o primeiro usuário | dono dos objetos |
| `alavanca_app` | painel e worker | sem superuser, sem `BYPASSRLS` |

A aplicação **sempre** conecta como `alavanca_app` e seta `app.tenant_id` por
transação. Detalhes e o snippet em `../docs/modelo-dados.md`, seção 3.2.

`alavanca_app` nasce **sem senha** na 001, de propósito: a senha é dada por
`ALTER ROLE` a partir de `ALAVANCA_APP_PASSWORD`, em qualquer um dos três
caminhos. Nenhuma senha mora em arquivo versionado.
