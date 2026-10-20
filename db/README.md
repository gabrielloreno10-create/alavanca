# db — Postgres da plataforma Alavanca

Modelo explicado em [`../docs/modelo-dados.md`](../docs/modelo-dados.md).

```bash
cp .env.example .env     # preencha POSTGRES_PASSWORD e ALAVANCA_APP_PASSWORD
docker compose up -d     # Postgres 17 em 127.0.0.1:5433
./aplicar.sh             # Windows: .\aplicar.ps1
./aplicar.sh --status    # o que já foi aplicado
```

Sem Docker: defina `ALAVANCA_ADMIN_DATABASE_URL` no `.env` e os scripts usam
`psql` direto contra esse banco.

## Três regras ao mexer aqui

1. **Migration aplicada não se edita.** O `aplicar` guarda o SHA-256 de cada
   arquivo e recusa rodar se um deles mudou. Para corrigir, crie a próxima
   numerada.
2. **Toda tabela nova de domínio** tem `tenant_id uuid NOT NULL` e chama
   `select alavanca.proteger_tabela('alavanca.<tabela>');` logo depois do
   `create table`. Não existe janela sem RLS.
3. **Toda view** declara `with (security_invoker = true)`. Sem isso ela roda com
   os privilégios do dono e fura o isolamento por tenant.

## Conexões

| role | para quê | poderes |
|---|---|---|
| `alavanca_owner` (`POSTGRES_USER`) | rodar migrations | dono dos objetos |
| `alavanca_app` | painel e worker | sem superuser, sem `BYPASSRLS` |

A aplicação **sempre** conecta como `alavanca_app` e seta `app.tenant_id` por
transação. Detalhes e o snippet em `../docs/modelo-dados.md`, seção 3.2.

Nenhuma senha mora em arquivo versionado: o `.env` está no `.gitignore` e a
senha da role de aplicação é aplicada por `ALTER ROLE` a partir de
`ALAVANCA_APP_PASSWORD`.
