-- 002_vendas.sql
-- Venda e custo: o que alimenta as telas Metricas, Lucro e o indicador do Hoje.
--
-- Tabelas:
--   venda_dia      - uma linha por canal por dia (faturamento, pedidos, CMV)
--   producao_dia   - producao e perda do dia por marca (pizzas/perdas do painel)
--   ficha_tecnica  - preco e custo de cada item do cardapio
--   venda_prato    - quantidade vendida por item num intervalo de datas
--
-- Por que venda_prato tem periodo_inicio/periodo_fim em vez de uma data:
-- o painel consome dois formatos, "vendas por dia" e "total de uma janela fixa
-- de 90 dias". Um dia e simplesmente inicio = fim; a janela de 90 dias e
-- inicio < fim. O painel decide qual usar olhando se inicio = fim.
--
-- Idempotente.

begin;

-- ---------------------------------------------------------------------------
-- venda_dia
-- ---------------------------------------------------------------------------
create table if not exists alavanca.venda_dia (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id    uuid not null references alavanca.marcas(id) on delete cascade,
  canal_id    uuid not null references alavanca.canais(id) on delete cascade,
  data        date not null,

  faturamento numeric(14,2) not null default 0 check (faturamento >= 0),  -- venda BRUTA (Saipos "valor de vendas")
  pedidos     integer       not null default 0 check (pedidos >= 0),
  cmv         numeric(14,2) check (cmv >= 0),
  -- true quando o CMV nao veio de nota: foi estimado pela media das fichas.
  cmv_estimado boolean not null default false,

  -- opcionais, quando a fonte entrega: ajudam a fechar com o extrato
  descontos         numeric(14,2),
  valor_cancelado   numeric(14,2),
  qtd_cancelada     integer,
  faturamento_liquido numeric(14,2),  -- depois de comissao/taxas, quando ha fechamento

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, canal_id, data)
);
comment on table alavanca.venda_dia is
  'Venda de um canal num dia. O total do dia do painel (DiaVendas.cmv e faturamento) e a soma das linhas do dia.';
comment on column alavanca.venda_dia.faturamento is 'Venda bruta, antes de comissao do canal. Equivale a coluna VALOR DE VENDAS do Saipos.';
select alavanca.proteger_tabela('alavanca.venda_dia');
select alavanca.trigger_atualizado_em('alavanca.venda_dia');
create index if not exists ix_venda_dia_tenant_data on alavanca.venda_dia (tenant_id, data);
create index if not exists ix_venda_dia_marca_data  on alavanca.venda_dia (tenant_id, marca_id, data);

-- ---------------------------------------------------------------------------
-- producao_dia
-- ---------------------------------------------------------------------------
create table if not exists alavanca.producao_dia (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id    uuid not null references alavanca.marcas(id) on delete cascade,
  data        date not null,
  unidades    integer not null default 0 check (unidades >= 0),  -- DiaVendas.producao.pizzas
  perdas      integer not null default 0 check (perdas >= 0),    -- DiaVendas.producao.perdas
  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, marca_id, data)
);
comment on table alavanca.producao_dia is 'Producao e perda do dia por marca (colunas pizzas/perdas da tela Metricas).';
select alavanca.proteger_tabela('alavanca.producao_dia');
select alavanca.trigger_atualizado_em('alavanca.producao_dia');

-- ---------------------------------------------------------------------------
-- ficha_tecnica
-- ---------------------------------------------------------------------------
create table if not exists alavanca.ficha_tecnica (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id   uuid not null references alavanca.marcas(id) on delete cascade,
  codigo     text not null,   -- Ficha.id do painel ("f01") ou o id do PDV
  nome       text not null,
  categoria  text,

  preco           numeric(12,2) not null check (preco >= 0),  -- preco no salao / canal proprio
  custo           numeric(12,2) not null check (custo >= 0),  -- CMV unitario da ficha
  preco_ifood     numeric(12,2) check (preco_ifood >= 0),     -- Prato.precoIfood (preco inflacionado do marketplace)
  custo_tamanho_p numeric(12,2),
  custo_tamanho_g numeric(12,2),

  -- true quando o custo nao saiu de ficha completa, foi montado por receita base
  estimado   boolean not null default false,
  base       text,            -- Ficha.base: de onde saiu o custo
  ativo      boolean not null default true,

  ext_saipos_item_id text,
  ext_ifood_item_id  text,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, marca_id, codigo)
);
comment on table alavanca.ficha_tecnica is 'Item de cardapio com preco e custo. Alimenta a engenharia de cardapio da tela Lucro e o cardapio que a IA usa no WhatsApp.';
select alavanca.proteger_tabela('alavanca.ficha_tecnica');
select alavanca.trigger_atualizado_em('alavanca.ficha_tecnica');
create index if not exists ix_ficha_tenant_marca on alavanca.ficha_tecnica (tenant_id, marca_id);

-- ---------------------------------------------------------------------------
-- venda_prato
-- ---------------------------------------------------------------------------
create table if not exists alavanca.venda_prato (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references alavanca.tenants(id) on delete cascade,
  ficha_id       uuid not null references alavanca.ficha_tecnica(id) on delete cascade,
  canal_id       uuid references alavanca.canais(id) on delete cascade,  -- NULL = todos os canais juntos
  periodo_inicio date not null,
  periodo_fim    date not null,

  qtd         numeric(14,3) not null default 0 check (qtd >= 0),
  faturamento numeric(14,2),
  preco_medio numeric(12,2),

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (periodo_fim >= periodo_inicio)
);
comment on table alavanca.venda_prato is
  'Quantidade vendida de um item num intervalo. Um dia = periodo_inicio igual a periodo_fim; janela de 90d = intervalo maior.';
select alavanca.proteger_tabela('alavanca.venda_prato');
select alavanca.trigger_atualizado_em('alavanca.venda_prato');
create unique index if not exists ux_venda_prato_canal
  on alavanca.venda_prato (tenant_id, ficha_id, canal_id, periodo_inicio, periodo_fim) where canal_id is not null;
create unique index if not exists ux_venda_prato_sem_canal
  on alavanca.venda_prato (tenant_id, ficha_id, periodo_inicio, periodo_fim) where canal_id is null;
create index if not exists ix_venda_prato_periodo on alavanca.venda_prato (tenant_id, periodo_inicio, periodo_fim);

commit;
