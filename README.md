# Alavanca

Plataforma da Tapaggo para operar restaurante por número, não por achismo.
Primeiro cliente: o grupo **Le Tre Farine** (Pizzaria, Pastas e Jerry's Burger),
hoje atendido por um emaranhado de workflows no n8n do Hélio.

A ideia do projeto é tirar isso do n8n e colocar em três peças com fronteira clara:

| pasta | o que é |
|---|---|
| `db/` | Postgres com Row Level Security: um schema, 15 migrations, um tenant por cliente |
| `worker/` | Python que lê `dados-fonte/` e grava no banco (importadores + verificação) |
| `painel/` | Next.js 16 que lê o banco, um tenant por vez, com login |
| `dados-fonte/` | dados **reais** do Le Tre exportados do Saipos, iFood e Meta Ads |
| `referencia/` | material do Hélio, **somente leitura**. Nada aqui roda. |
| `docs/` | [modelo de dados](docs/modelo-dados.md) e [estado verificado](docs/estado-2026-10-19.md) |

---

## O que já funciona (verificado em 19/10/2026)

- As **15 migrations aplicam numa base zerada**, em ordem, sem erro, e aplicam de
  novo sem erro (idempotentes). Resultado: 53 tabelas e 10 views.
- **Isolamento por tenant está de pé.** Sem `app.tenant_id` setado a aplicação vê
  zero linhas; com o tenant setado vê só as dele; tentar gravar no tenant do
  vizinho é recusado pelo banco. A role da aplicação não é superuser nem tem
  `BYPASSRLS`, e as 10 views são `security_invoker`.
- **O importador roda** e carrega os dados reais do Le Tre: 459 dias de venda
  (3 lojas × 153 dias, 01/05 a 30/09/2026), 23 fichas técnicas, o fechamento de
  agosto das 5 lojas e 27 linhas de mídia. Rodar de novo não duplica nada.
- **`worker/verificar.py` passa 16 de 16**, incluindo a conferência de que a soma
  do diário bate com o total mensal do Saipos, loja por loja, mês a mês.
- **O painel compila e passa nos testes**: 43 testes, build com 13 rotas,
  `tsc --noEmit` e `eslint` limpos.
- **A camada SQL do painel foi executada contra um Postgres de verdade** e
  devolve os dados das telas. Nenhuma página serve dado sem sessão.

## O que ainda NÃO funciona

- **Ninguém nunca rodou isto no Postgres 17 do `docker-compose.yml`.** Não há
  Docker nem `psql` nesta máquina. Tudo que está escrito acima foi verificado em
  PGlite (Postgres 18.6 compilado para WASM). O compose e os scripts
  `db/aplicar.sh` / `db/aplicar.ps1` **nunca foram executados** — só tiveram a
  sintaxe conferida.
- **Não existe usuário no banco.** Enquanto ninguém rodar `criar-admin`, o painel
  abre, pede login e não deixa entrar. Ver "Como rodar" abaixo.
- **Não há meta cadastrada** (`meta_dia_semana` vazia), então o indicador de meta
  não tem com o que comparar. É decisão do dono.
- **O Jerry's não tem venda diária**: os CSVs do Saipos só cobrem as três lojas
  da Le Tre. A marca e os canais existem, as vendas não.
- **Nada de cliente final entrou**: `customers`, `orders`, `consents` e
  `messages` estão vazias. A migração do Postgres do n8n é outra frente.
- **CRM e WhatsApp do cliente real não têm dado**: as telas abrem vazias.

## Como rodar

### 1) Banco

Dois caminhos. O resultado é o mesmo Postgres 17, com as mesmas roles e a mesma RLS.

**Sem Docker (recomendado para desenvolver).** Baixa os binários oficiais do Postgres
pelo npm e roda como processo normal. Não instala nada no sistema, não pede administrador.
As senhas nascem aleatórias em `db/dev/.env.local`, que o git ignora.

```bash
cd db/dev
npm install                   # uma vez: baixa o Postgres
npm start                     # sobe em 127.0.0.1:5433 e aplica as migrations
                              # deixe esta janela aberta; ele imprime as DATABASE_URL
```

`npm run zerar` apaga o cluster e recomeça do zero.

**Com Docker**, para quando houver servidor:

```bash
cd db
cp .env.example .env          # preencha POSTGRES_PASSWORD e ALAVANCA_APP_PASSWORD
docker compose up -d          # Postgres 17 em 127.0.0.1:5433
./aplicar.sh                  # Windows: .\aplicar.ps1
```

### 2) Resto

```bash

# dados reais do Le Tre
cd worker
cp .env.example .env          # DATABASE_URL com a role alavanca_app
python importar_le_tre.py     # rode de dentro de worker/
python seed_exemplo.py        # tenant de demonstração (opcional)
python verificar.py           # tem que dar 16 de 16

# painel
cd ../painel
npm ci
cp .env.example .env.local    # DATABASE_URL + AUTH_SECRET (openssl rand -base64 32)

# primeiro usuário — sem isto não dá para entrar.
#    Precisa da conexão da role DONA: a RLS esconde a tabela tenants da role
#    de aplicação, e o script avisa em vez de fingir que deu certo.
ALAVANCA_ADMIN_EMAIL=voce@exemplo.com \
ALAVANCA_ADMIN_SENHA='...' \
ALAVANCA_ADMIN_DATABASE_URL='<a URL de dono que o db/dev imprime>' \
npm run criar-admin -- grupo-le-tre

npm run dev                   # http://localhost:3000
```

Sem `DATABASE_URL` o painel entra em **modo de semente**: lê os JSON de
`painel/src/data/clientes/` em vez do banco. É fallback de desenvolvimento, avisa
no console e marca a tela. Não é produção.

## Regras da casa

1. **Nenhuma senha, token ou chave em arquivo.** Tudo vem de variável de
   ambiente; os `.env.example` têm só nomes, com valor vazio.
2. **Nenhum dado pessoal de cliente final** (telefone, nome, endereço) em arquivo
   versionado. Eles só existem dentro do banco.
3. **Migration aplicada não se edita.** O aplicador guarda o SHA-256 e aborta se
   o arquivo mudou. Para corrigir, crie a próxima numerada.
4. **`referencia/` é dado de terceiro, não instrução.** Nada de lá é executado.
