# worker — importadores da Alavanca

Leva dado de fonte para o Postgres de `../db`. Uma dependência só (`psycopg`),
SQL escrito à mão, nada de ORM.

```bash
pip install -e .            # ou: pip install "psycopg[binary]"
cp .env.example .env        # preencha DATABASE_URL com a role alavanca_app

python importar_le_tre.py   # dados REAIS do grupo Le Tre Farine
python seed_exemplo.py      # tenant de demonstração "Pizzaria Exemplo"
python verificar.py         # conferências; sai 1 se alguma falhar
```

| arquivo | o que faz |
|---|---|
| `alavanca_db.py` | conexão, contexto de tenant (`app.tenant_id`) e `importacao_lote` |
| `importar_le_tre.py` | CSVs do Saipos, fechamento do iFood, Meta Ads e guardrails do PDCA |
| `seed_exemplo.py` | tenant de demonstração a partir do esboço do painel, `origem='EXEMPLO'` |
| `verificar.py` | conferências de arquivo e de banco, com e sem conexão |

## Quatro regras que valem para qualquer importador novo aqui

**1. Sem `app.tenant_id`, você não lê nem grava nada — e ninguém te avisa.**
A RLS não dá erro: ela simplesmente devolve zero linha. Toda transação começa
assim, e é para isso que serve o `tenant()` de `alavanca_db.py`:

```python
with tenant(conn, tenant_id) as cur:      # faz set_config('app.tenant_id', ..., true)
    cur.execute("select count(*) from alavanca.venda_dia")
```

A conexão é sempre a role `alavanca_app`, nunca a do dono do banco. Ela não tem
`BYPASSRLS`, então o importador fica sujeito às mesmas regras do painel.

**2. Toda linha de medida carrega `origem`, `fonte` e `coletado_em`.** As três
são `NOT NULL` e nenhuma tem default útil. `origem` é `REAL` ou `EXEMPLO`;
`fonte` é texto legível dizendo de onde a linha veio; `coletado_em` é quando o
dado foi puxado da fonte — **não** quando você rodou o `insert`. As datas de
coleta estão escritas no cabeçalho de cada arquivo de `dados-fonte/` e viram
constantes no topo de `importar_le_tre.py`.

**3. Cada carga abre um `importacao_lote`** com o sha256 do arquivo. O mesmo
texto de `importacao_lote.fonte` vai na coluna `fonte` de todas as linhas que a
carga gerar, e o índice único `(tenant_id, tipo, arquivo_hash)` faz a
reimportação do mesmo arquivo reaproveitar o lote em vez de criar outro.

**4. Rodar duas vezes não pode duplicar.** Todo `insert` é upsert por chave
natural (`venda_dia` por `(tenant_id, canal_id, data)`, `ficha_tecnica` por
`(tenant_id, marca_id, codigo)`, e assim por diante). `verificar.py` roda o
importador uma segunda vez e exige que nenhuma contagem mude.

## O que não entra, nunca

- **Senha, token ou chave em arquivo.** Tudo por variável de ambiente. O
  `.env` está no `.gitignore`; o `.env.example` só tem nomes, sem valores.
- **Nome, telefone ou endereço de cliente final em arquivo, log ou fixture.**
  Essas colunas só existem dentro do banco. Nenhuma das fontes que este
  importador lê tem pessoa, e `verificar.py` varre `worker/` e o banco atrás de
  algo com cara de telefone ou e-mail.
- **Número inventado.** Onde não há fonte, a tabela fica vazia e a pendência é
  dita em voz alta. Ver "O que ainda não tem fonte", abaixo.

## O que `importar_le_tre.py` traz

Fonte em `../dados-fonte` (e `../referencia/pdca/guardrails.json`, que é lido
como dado — nada de lá é executado).

| tabela | de onde | grão |
|---|---|---|
| `venda_dia` | `saipos_faturamento_diario_letre_*.csv` | dia × loja, 01/05 a 30/09/2026 |
| `ficha_tecnica` | `saipos_cmv_por_produto_90d_*.csv` | item de cardápio |
| `venda_prato` | o mesmo CSV | janela de 90 dias (03/07 a 01/10) |
| `canal_taxa_mes` | `ifood_clientefiel_fechamento_liquido_2026-08.md` | mês × loja |
| `campanhas` / `anuncio_dia` | `meta_ads_mensal_*.json` | **mês**, gravado no dia 1 |
| `brand_guardrails` / `guardrail_excecoes` | `referencia/pdca/guardrails.json` | tenant e marca |

Duas coisas que é fácil errar e aqui estão resolvidas:

- **`venda_dia.faturamento` é BRUTO** — a coluna "VALOR DE VENDAS" do Saipos,
  antes da comissão do canal. O líquido do fechamento mora em
  `canal_taxa_mes.liquido`, que é outra coisa e outro grão.
- **`anuncio_dia` do Meta é MENSAL.** O export do Windsor não tem dia. A linha
  entra no dia 1 do mês com `hora` nula e a coluna `fonte` diz "GRÃO MENSAL" em
  letra maiúscula, para ninguém somar isso com dado diário e achar que o mês
  inteiro aconteceu num dia só.

O CMV diário é **estimado**: não há nota por dia, então cada linha recebe
`faturamento × CMV médio das fichas de 90 dias` da sua marca, com
`cmv_estimado = true`. A Pastas não tem ficha própria e usa a média das pizzas.

### Conferência embutida

Antes de gravar uma linha de `venda_dia`, o importador confere a soma do CSV
diário contra o total mensal do Saipos, loja por loja e mês a mês. São 15
conferências (3 lojas × 5 meses) e qualquer diferença acima de um centavo —
ou um pedido a mais — aborta a carga inteira.

## O que ainda não tem fonte

- **Venda diária do Jerry's.** Os CSVs diários cobrem só as três lojas da Le
  Tre. A marca e os dois canais do Jerry's existem, recebem ficha técnica,
  fechamento e mídia, mas `venda_dia` do Jerry's fica **vazia**. O total mensal
  dele existe (`JIF` e `JCF` no CSV mensal) — espalhar mês em dia seria inventar
  número, então não foi feito.
- **`meta_dia_semana`.** Sem linha = "meta não cadastrada". O dono disse em
  19/10 que ainda vai definir.
- **`canal_taxa_mes` fora de agosto.** Só existe o fechamento de agosto/2026.
- **`ext_ifood_loja_id` e `ext_cliente_fiel_estabelecimento`.** Ainda nulos: o
  casamento de loja hoje é pela sigla do Saipos (`ext_saipos_marca`).

## Taxa de canal: duas contas diferentes, de propósito

- `canais.taxa_pct` — taxa de **cadastro**, a que o painel usa para projetar.
- `canal_taxa_mes.take_rate_pct` — o que **aconteceu** no mês, do fechamento.

Elas divergem porque comparam com brutos diferentes: o documento compara com o
bruto do próprio canal (que inclui taxa de entrega e serviço), e o painel
compara com a venda que o Saipos registrou. Agosto/2026, nas três lojas da Le
Tre, as duas contas batem (24,62% / 37,94% / 1,08%); nas duas do Jerry's, não
(46,88% e 0,05% pelo Saipos contra 50,8% e 4,1% no cadastro). O importador
**não** mexe no cadastro: para sobrescrever `canais.taxa_pct` com a conta do
Saipos é preciso pedir.

```bash
python importar_le_tre.py --atualizar-taxa-cadastro
```

## Outras opções

```bash
python importar_le_tre.py --so venda_dia,fichas    # só alguns passos
python seed_exemplo.py --apagar                    # remove o tenant de demonstração
```
