#!/usr/bin/env bash
# Aplica as migrations na ordem do nome do arquivo, pulando as que ja rodaram.
#
# Uso:
#   ./aplicar.sh            aplica o que falta
#   ./aplicar.sh --status   so mostra o que ja foi aplicado
#
# Dois modos, escolhidos sozinho:
#   - docker (padrao): roda psql DE DENTRO do container, entao nao precisa ter
#     psql instalado na maquina;
#   - psql: usado quando ALAVANCA_ADMIN_DATABASE_URL esta definida no .env,
#     para apontar para um Postgres que nao e o do compose.
#
# Nenhuma senha e escrita em arquivo. A senha da role de aplicacao vem da
# variavel ALAVANCA_APP_PASSWORD do .env e e aplicada por ALTER ROLE no fim.
# (Ela aparece por um instante na lista de processos local; e um banco de
# desenvolvimento na propria maquina.)

set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$AQUI"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
else
  echo "ERRO: .env nao existe. Copie o .env.example e preencha as senhas." >&2
  exit 1
fi

POSTGRES_DB="${POSTGRES_DB:-alavanca}"
POSTGRES_USER="${POSTGRES_USER:-alavanca_owner}"
MODO="docker"
[ -n "${ALAVANCA_ADMIN_DATABASE_URL:-}" ] && MODO="psql"

sha() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# Executa SQL vindo do stdin.
psql_stdin() {
  if [ "$MODO" = "psql" ]; then
    psql "$ALAVANCA_ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"
  else
    docker compose exec -T db psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
  fi
}

# Executa um arquivo de migration. No modo docker o arquivo e lido do volume
# /migrations montado read-only pelo compose.
psql_arquivo() {
  local nome="$1"
  if [ "$MODO" = "psql" ]; then
    psql "$ALAVANCA_ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "./migrations/$nome"
  else
    docker compose exec -T db psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "/migrations/$nome"
  fi
}

# --- banco de pe? -----------------------------------------------------------
if [ "$MODO" = "docker" ]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERRO: docker nao encontrado. Instale o Docker Desktop, ou defina" >&2
    echo "      ALAVANCA_ADMIN_DATABASE_URL no .env para usar um Postgres ja existente." >&2
    exit 1
  fi
  echo "-> subindo o Postgres (docker compose up -d)"
  docker compose up -d
  echo "-> esperando o banco responder"
  for _ in $(seq 1 60); do
    if docker compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  docker compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null
fi

# --- bootstrap da tabela de controle ---------------------------------------
psql_stdin <<'SQL'
create schema if not exists alavanca;
create table if not exists alavanca.migrations (
  versao      text primary key,
  nome        text not null,
  checksum    text not null,
  aplicada_em timestamptz not null default now()
);
SQL

if [ "${1:-}" = "--status" ]; then
  echo "-> migrations aplicadas:"
  psql_stdin -t -A -F '  ' -c "select versao, aplicada_em from alavanca.migrations order by versao"
  exit 0
fi

aplicadas="$(psql_stdin -t -A -c "select versao || ' ' || checksum from alavanca.migrations")"

# --- loop ------------------------------------------------------------------
novas=0
for caminho in ./migrations/*.sql; do
  nome="$(basename "$caminho")"
  versao="${nome%%_*}"
  soma="$(sha "$caminho")"
  linha="$(printf '%s\n' "$aplicadas" | grep "^$versao " || true)"

  if [ -n "$linha" ]; then
    antiga="${linha#* }"
    if [ "$antiga" != "$soma" ]; then
      echo "ERRO: $nome mudou depois de aplicada." >&2
      echo "      Migration ja aplicada nao se edita: crie a proxima numerada." >&2
      exit 1
    fi
    echo "   ja aplicada  $nome"
    continue
  fi

  echo "-> aplicando    $nome"
  psql_arquivo "$nome"
  psql_stdin -v versao="$versao" -v nome="$nome" -v soma="$soma" <<'SQL'
insert into alavanca.migrations (versao, nome, checksum)
values (:'versao', :'nome', :'soma')
on conflict (versao) do update set checksum = excluded.checksum, aplicada_em = now();
SQL
  novas=$((novas + 1))
done

# --- senha da role de aplicacao --------------------------------------------
if [ -n "${ALAVANCA_APP_PASSWORD:-}" ]; then
  echo "-> definindo a senha da role alavanca_app"
  psql_stdin -v senha="$ALAVANCA_APP_PASSWORD" <<'SQL'
alter role alavanca_app with login password :'senha';
SQL
else
  echo "AVISO: ALAVANCA_APP_PASSWORD vazia no .env. A role alavanca_app existe"
  echo "       mas nao consegue conectar ate ter senha."
fi

echo
echo "pronto: $novas migration(s) nova(s)."
psql_stdin -t -A -c "select count(*) || ' migrations aplicadas' from alavanca.migrations"
psql_stdin -t -A -c "select count(*) || ' tabelas no schema alavanca' from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='alavanca' and c.relkind='r'"
