# Modelo de dados v1 — plataforma Alavanca

Escrito em 19/10/2026. Vale para as migrations `001` a `014` em `db/migrations/`.

Resumo em uma frase: **um tenant é um grupo de restaurantes; dentro dele há
marcas; dentro de cada marca há canais; e nenhuma linha de negócio existe sem
dizer de onde veio.**

---

## 1. Como subir

```bash
cd db
cp .env.example .env     # preencha POSTGRES_PASSWORD e ALAVANCA_APP_PASSWORD
docker compose up -d
./aplicar.sh             # no Windows: .\aplicar.ps1
```

O Postgres sobe na porta **5433** do host (ligado só em `127.0.0.1`), com volume
nomeado `alavanca_pgdata`. É um banco **separado** do Postgres do n8n do Hélio —
nada aqui toca a produção dele.

`aplicar.sh` / `aplicar.ps1` aplicam só o que falta, gravam cada arquivo em
`alavanca.migrations` com o SHA-256 e **recusam rodar se uma migration já
aplicada tiver sido editada**. Migration aplicada não se edita: cria-se a
próxima numerada.

Sem Docker na máquina, defina `ALAVANCA_ADMIN_DATABASE_URL` no `.env` e os
scripts usam `psql` direto contra esse banco.

---

## 2. As três camadas do cadastro

```
tenants            um grupo de restaurantes = um cliente da Alavanca
  └── marcas       as operações ("Le Tre Farine Pizzaria", "Jerry's Burger")
        └── canais uma loja/canal de venda (iFood, site Cliente Fiel, salão)
```

O grupo Le Tre Farine é o tenant 1, semeado pela migration `014`:

| marca | canal | tipo | marca no Saipos |
|---|---|---|---|
| Le Tre Farine Pizzaria | `letre-ifood-pizzaria` | ifood | PZ |
| Le Tre Farine Pastas | `letre-ifood-pastas` | ifood | PA |
| Le Tre Farine Pizzaria | `letre-site` | proprio | LCF |
| Jerry's Burger | `jerrys-ifood` | ifood | JIF |
| Jerry's Burger | `jerrys-site` | proprio | JCF |

O dono confirmou em 19/10 que é a mesma operação, só muda a marca — por isso
marca é uma linha dentro do tenant, e não um tenant separado.

**Pendência conhecida:** o Cliente Fiel da Le Tre (marca `LCF` no Saipos) atende
Pizzaria *e* Pastas, mas está atribuído à Pizzaria. Isso está registrado em
`tenant_config`, chave `canal.cliente_fiel_le_tre`, para não virar um erro
silencioso quando alguém olhar a margem por marca.

`canais.slug` é exatamente o `CanalId` que o painel já usa hoje
(`letre-ifood-pizzaria` etc.), e `marcas.nome` é exatamente o
`ConfigCanal.operacao`. Isso é de propósito: o painel continua funcionando sem
reescrever a camada de tipos.

---

## 3. As regras que o modelo impõe

### 3.1 `tenant_id` em tudo, com RLS desde a primeira migration

Toda tabela de domínio tem `tenant_id uuid NOT NULL`. Logo depois do
`create table`, a migration chama:

```sql
select alavanca.proteger_tabela('alavanca.<tabela>');
```

que liga `ENABLE ROW LEVEL SECURITY` **e** `FORCE ROW LEVEL SECURITY`, cria a
policy `tenant_isolado` e dá o grant para `alavanca_app`. Não existe janela em
que uma tabela exista sem RLS.

A policy é sempre a mesma:

```sql
using      (tenant_id = alavanca.tenant_atual())
with check (tenant_id = alavanca.tenant_atual())
```

`alavanca.tenant_atual()` lê `current_setting('app.tenant_id', true)`. **Se o
valor não estiver setado, a função devolve NULL, a comparação dá NULL e nenhuma
linha aparece.** O padrão é não ver nada, não ver tudo.

Ficam fora da RLS por tenant, de propósito: `alavanca.migrations`,
`alavanca.papeis` e `alavanca.usuarios` (um `platform_admin` não pertence a
tenant nenhum). `usuario_tenant` tem RLS com uma policy própria, explicada em 3.6.

### 3.2 Como o painel seta o tenant por request

A role `alavanca_app` **não é superuser e não tem `BYPASSRLS`**. É com ela que o
painel e o worker conectam. Cada request abre uma transação, seta o tenant
*local a ela* e consulta dentro dela:

```ts
// painel: um helper por request, usando a lib `postgres` (porsager)
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 10 });

export async function comTenant<T>(
  tenantId: string,
  usuarioId: string | null,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    // o terceiro argumento `true` = local à transação: o valor morre com ela e
    // NÃO vaza para a próxima request que pegar a mesma conexão do pool.
    await tx`select set_config('app.tenant_id', ${tenantId}, true)`;
    if (usuarioId) await tx`select set_config('app.usuario_id', ${usuarioId}, true)`;
    return fn(tx);
  });
}
```

Três coisas que **não** podem ser feitas:

1. `set_config(..., false)` ou `SET` sem `LOCAL` — o valor fica grudado na
   conexão do pool e a próxima request lê o tenant errado;
2. conectar como `alavanca_owner` (ou qualquer superuser) na aplicação — superuser
   passa por cima da RLS e o isolamento vira decoração;
3. criar view sem `security_invoker = true` — uma view normal roda com os
   privilégios do dono e fura a RLS das tabelas de baixo. Todas as views deste
   modelo declaram `security_invoker`.

Um `platform_admin` da Tapaggo não ganha uma policy especial: ele simplesmente
pode trocar o `app.tenant_id` (a permissão `trocar_tenant` em `papeis`). O banco
continua enxergando um tenant de cada vez.

### 3.3 Origem, fonte e coletado_em

Toda tabela de dado de negócio tem:

```sql
origem      alavanca.origem_dado not null,  -- 'REAL' | 'EXEMPLO'
fonte       text not null,                  -- de onde veio, em texto legível
coletado_em timestamptz not null
```

É o que faz o painel conseguir marcar "este bloco ainda é exemplo" e o que
permite responder, meses depois, de onde um número saiu. `importacao_lote`
guarda o rastro de cada arquivo importado, inclusive o SHA-256 do conteúdo.

Não têm o trio (são configuração, não medida): `tenant_config`,
`campaign_brand_map`, `integracao_config`, `guardrail_excecoes`, `usuarios`,
`usuario_tenant`, `papeis`, `migrations`.

### 3.4 Telefone em E.164

`alavanca.telefone_e164` é um domínio com `CHECK (value ~ '^\+[1-9][0-9]{7,14}$')`.
`customers` tem `UNIQUE (tenant_id, telefone_e164)`. Gravar `31999998888` é
erro de banco, não bug silencioso — a normalização é obrigação do importador.

### 3.5 Pagamento nunca é inferido

`orders` **não tem coluna `pago`**. O que existe:

- `orders.rotulo_pagamento_externo` e `orders.status_externo` guardam o texto
  cru da fonte (`"PIX Online"`, `"Entregue"`). É rótulo, não fato.
- `payment_evidence` guarda uma linha por evidência, com `tipo_evidencia`,
  `forca` (`fraca` | `media` | `forte`), `fonte` e `chave_idempotencia`.
- Um `CHECK` impede que `tipo_evidencia = 'rotulo_canal'` entre com força
  diferente de `fraca`. O rótulo do Cliente Fiel é estruturalmente fraco.
- `vw_pedido_pagamento` devolve a melhor evidência por pedido
  (`sem_evidencia` | `fraca` | `media` | `forte`). Quem decide o corte é quem
  consulta — o banco se recusa a opinar.

### 3.6 Consentimento com estado explícito

`consents` é **append-only**: um opt-out é uma linha nova, nunca um UPDATE.
Os estados são `opt_in`, `opt_out`, `legado_sem_registro`, `pendente`, `expirado`.

`legado_sem_registro` existe para os ~2.092 contatos herdados de
`cliente_memoria`, que nunca tiveram opt-in documentado. Não é opt-in nem
opt-out: é dívida declarada. `vw_consentimento_atual.pode_receber` só é `true`
com `opt_in` vigente, e `vw_sniper_elegivel` já filtra por isso — quem está como
legado **não entra em disparo de marketing**.

O estado do consentimento está em `tenant_config`, chave
`consentimento.base_legada`, com `"decidido": false`. Enquanto isso for `false`,
nenhum lote de marketing deve rodar em cima da base herdada.

### 3.7 Herança tenant → marca

`brand_guardrails` e `limites_alerta` têm `marca_id` nullable: `NULL` é a raiz
do tenant, e a linha da marca sobrescreve só as colunas que preenche. É a mesma
ideia do `guardrails.json` de hoje.

Um detalhe que o JSON não resolvia: o Jerry's tem `ticket_medio: null` querendo
dizer *"não me avalie por ticket"*, e não *"use o ticket da Le Tre"*. Um
`COALESCE` daria o número errado. Por isso `brand_guardrails.anulados text[]`
lista as colunas que a marca zera de propósito. `vw_guardrail_efetivo` respeita
isso e é o equivalente ao `lib_meta.guardrails(marca)` de hoje.

### 3.8 Segredo nunca em claro

`integracao_config.segredo_ref` aponta para o cofre (`env:NOME_DA_VARIAVEL` ou
`vault://caminho`). Se um dia o valor for guardado no banco, vai em
`segredo_cifrado bytea` com `cifra_kid` identificando a chave. Três `CHECK`
garantem isso:

- `config` jsonb não pode ter chave chamada `token`, `senha`, `password`,
  `secret`, `api_key`, `access_token`, `refresh_token`, `client_secret` ou
  `private_key`;
- `segredo_cifrado` sem `cifra_kid` é recusado;
- integração com `ativo = true` sem `segredo_ref` nem `segredo_cifrado` é recusada.

`tenant_config` tem o mesmo `CHECK` contra chaves com cara de segredo.

---

## 4. As tabelas, por assunto

### Cadastro (001)
| tabela | o que é |
|---|---|
| `tenants` | o grupo de restaurantes. Vira o `Cliente` do painel |
| `marcas` | as operações dentro do grupo |
| `canais` | lojas/canais, com `taxa_pct`, `custo_por_pedido` e os ids externos |
| `tenant_config` | chave/valor jsonb por tenant |
| `brand_guardrails` | regras duras do PDCA, com herança tenant → marca |
| `guardrail_excecoes` | conjunto liberado do corte automático até uma data |
| `limites_alerta` | os limites que disparam alerta (`Cliente.limites`) |
| `meta_dia_semana` | meta de faturamento por dia da semana, com vigência |

### Venda e custo (002)
`venda_dia`, `producao_dia`, `ficha_tecnica`, `venda_prato`.

`venda_prato` usa `periodo_inicio`/`periodo_fim` em vez de uma data: um dia é
`inicio = fim`, e o relatório de 90 dias do Saipos é um intervalo maior. O
painel já consome os dois formatos.

### Clientes e consentimento (003)
`customers`, `consents`, view `vw_consentimento_atual`.

### Pedidos (004)
`orders`, `order_items`, `payment_evidence`, view `vw_pedido_pagamento`.

### Conversas (005)
`conversation_state`, `messages`.

### CRM (006)
`crm_segmento`, `crm_segmento_snapshot`, `sniper_lotes`, `sniper_envios`,
view `vw_sniper_elegivel`.

`sniper_envios` é **uma linha por envio**, com
`UNIQUE (tenant_id, chave_idempotencia)` e `UNIQUE (lote_id, customer_id)`.
Reexecutar o worker bate no índice em vez de mandar a mensagem duas vezes.

### Mídia paga (007)
`campaign_brand_map`, `campanhas`, `flights`, `criativos`, `anuncio_dia`,
`midia_alcance`.

`campaign_brand_map` substitui o `if "jerry" in nome` do `lib_meta.marca()`:
vira regra com prioridade, auditável. `midia_alcance` é separado de
`anuncio_dia` porque alcance não se soma dia a dia.

### iFood (008)
`canal_taxa_mes`, `ifood_operacao_dia`, `ifood_funil_dia`, `ifood_faixa_dia`,
`promocoes`, `promocao_dia`.

`canais.taxa_pct` é a taxa de cadastro, que o painel usa para projetar.
`canal_taxa_mes` é o que de fato aconteceu em cada mês (take-rate de 34,5% na
Pizzaria contra 47,0% na Pastas em agosto). São coisas diferentes de propósito.

### WhatsApp (009)
`whatsapp_dia`, `whatsapp_transferencia_dia`, `whatsapp_regras`, `reclamacoes`.

### PDCA (010)
`pdca_relatorios`, `pdca_violacoes`, `pdca_decisoes`.

Três níveis separados: o retrato do dia, o guardrail furado, e a decisão tomada.
O robô acusa; a pessoa decide; as duas coisas ficam registradas com autor e hora.

### Operação e plano (011)
`acoes_operador`, `plano_acao`, `acao_sugerida`, `comanda_dia`.

`acoes_operador` é append-only, com `chave_idempotencia`, `estado_antes` e
`estado_depois`. `comanda_dia` guarda a comanda **como foi emitida**, para
responder meses depois o que foi mandado ao dono naquele dia.

### Acesso e integração (012)
`papeis`, `usuarios`, `usuario_tenant`, `integracao_config`, `importacao_lote`.

Papéis: `platform_admin` (time Tapaggo), `dono_restaurante`, `operador`.
`usuario_tenant` tem policy própria:

```sql
using (tenant_id = alavanca.tenant_atual() or usuario_id = alavanca.usuario_atual())
```

O segundo termo é o que permite o login listar os tenants do usuário **antes**
de escolher um — sem isso o login não tem como começar.

### Views do painel (013)
`vw_cliente_painel`, `vw_canal_painel`, `vw_venda_dia_painel`,
`vw_meta_dia_semana_vigente`, `vw_limites_efetivos`, `vw_guardrail_efetivo`,
`vw_ficha_painel`.

---

## 5. Migração: tabela de hoje no n8n → tabela nova

As 9 tabelas de negócio que hoje vivem no mesmo database do n8n, e para onde
cada uma vai. Nada disso é alterado na produção do Hélio: a migração copia.

| hoje (n8n) | linhas em 18/10 | vai para | observações |
|---|---:|---|---|
| `cliente_memoria` | 2.092 | `customers` + `consents` | `telefone` precisa ser normalizado para E.164 antes de entrar. `opt_out = true` vira uma linha em `consents` com `estado='opt_out'`; **todo o resto vira `legado_sem_registro`**, não opt-in. `id_cliente_fiel` → `ext_cliente_fiel_id`. O perfil (prato favorito, bairro, segmento, estágio) vai direto para as colunas de `customers` |
| `conversa_estado` | 0 | `conversation_state` | `chat_id` vira a chave natural; a marca sai do prefixo do `session_id` (`letre_` / `jerrys_`) |
| `n8n_chat_histories` | 11.350 | `messages` (+ `conversation_state`) | `session_id` no formato `letre_{telefone}_chats` se decompõe em marca + telefone → `customer_id`. O `message jsonb` vai para `payload`; `texto`, `autor` e `direcao` saem dele. As ~34 sessões antigas do WAHA, com chave fora do padrão, entram com `marca` indefinida e precisam de decisão |
| `pedidos_site` | 44 | `orders` + `order_items` + `payment_evidence` | `source='cliente_fiel_site'`, `external_id = id_pedido`, `loja` → `canal_id` pelos ids externos. `pagamento` (`"PIX Online"`) → `orders.rotulo_pagamento_externo` **e** uma linha em `payment_evidence` com `tipo_evidencia='rotulo_canal'`, `forca='fraca'`. `status` (`"Entregue"`) → `status_externo`. **Nenhum dos dois marca o pedido como pago** |
| `sniper_fila` | 2.234 | `sniper_lotes` + `sniper_envios` | a coluna `lote` agrupa; `motor` vira `sniper_lotes.motor`; cada linha vira um `sniper_envios` com `chave_idempotencia = '<lote_id>:<telefone_e164>'`. `msg_id` → `external_msg_id`, `erro_detalhe` e `data_envio` idem |
| `sniper_optout` | 26 | `consents` | uma linha com `canal='whatsapp'`, `finalidade='marketing'`, `estado='opt_out'`, `origem_consentimento = origem`, `ocorrido_em = criado_em`, `evidencia = {"motivo": ...}` |
| `sniper_controle` | 4 | `tenant_config` | chave/valor direto, com prefixo `sniper.` |
| `luiza_reclamacoes` | 136 | `reclamacoes` | `telefone` → `customer_id` (criando o customer se não existir); `status` mapeia para o CHECK (`aberta`/`em_andamento`/`resolvida`/`descartada`) |
| `pauta_posts` | 218 | **sem destino no v1** | conteúdo/Instagram ficou fora deste modelo. Quando entrar, vira `pauta_conteudo (tenant_id, marca_id, quando, formato, tema, legenda, status, ext_ig_post_id)`. Não migrar agora |

Fora do banco do n8n, mas que também vira tabela:

| hoje (arquivo) | vai para |
|---|---|
| `referencia/pdca/guardrails.json` (raiz + `por_marca`) | `brand_guardrails` (já semeado em `014`) |
| `guardrails.json` → `excecoes_corte_automatico` | `guardrail_excecoes` |
| `referencia/pdca/relatorios/AAAA-MM-DD.json` | `pdca_relatorios` + `pdca_violacoes` |
| `referencia/pdca/REGISTRO_DECISOES.md` | `pdca_decisoes` |
| `referencia/relatorio_diario/historico.jsonl` | `comanda_dia` |
| `dados-fonte/saipos_faturamento_diario_*.csv` | `venda_dia` |
| `dados-fonte/saipos_cmv_por_produto_90d_*.csv` | `ficha_tecnica` + `venda_prato` (janela 03/07–01/10) |
| `dados-fonte/ifood_clientefiel_fechamento_liquido_*.md` | `canal_taxa_mes` |
| `dados-fonte/meta_ads_mensal_*.json` | `campanhas` + `anuncio_dia` (grão mensal: `data` = dia 1 do mês, com `fonte` dizendo que é mensal) |

Ordem sugerida da migração, por causa das chaves estrangeiras:

```
tenants → marcas → canais
  → ficha_tecnica → venda_dia / venda_prato
  → customers → consents
  → orders → order_items → payment_evidence
  → conversation_state → messages
  → crm_segmento → sniper_lotes → sniper_envios
  → campanhas → flights → criativos → anuncio_dia
  → pdca_relatorios → pdca_violacoes → pdca_decisoes
```

---

## 6. O que ainda está em aberto

- **Consentimento da base herdada.** 2.092 contatos como `legado_sem_registro`.
  Precisa de decisão do dono antes de qualquer disparo de marketing em cima deles.
- **Cliente Fiel da Le Tre atribuído à Pizzaria.** Atende Pizzaria e Pastas; hoje
  a margem por marca fica enviesada. Registrado em `tenant_config`.
- **Metas.** `meta_dia_semana` está vazia: o painel mostra "sem meta cadastrada".
- **Imposto.** `tenants.imposto_pct = 0`. A margem calculada hoje é antes de imposto.
- **Custo de entrega.** Não entra em nenhum cálculo: `canais.custo_por_pedido = 0`
  nos cinco canais.
- **Taxa do Jerry's.** `taxa_pct` foi semeada com o take-rate de agosto (50,8% no
  iFood, 4,1% no Cliente Fiel), que é uma base diferente da usada nos canais da
  Le Tre. Uniformizar quando o importador ler o fechamento mês a mês.
- **Repasse do iFood.** `canal_taxa_mes` tem as colunas (`total_repasses`,
  `ja_recebido`, `a_receber`, `recebido_na_loja`), mas nada foi importado ainda.
