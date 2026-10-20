-- 008_ifood.sql
-- O que e especifico do iFood e nao cabe em venda_dia: taxa do canal, operacao
-- (nota, tempo de entrega, cancelamento), funil da loja, faixas de valor de
-- pedido e as promocoes bancadas pelo restaurante.
--
-- Por que taxa de canal tem tabela propria (canal_taxa_mes) alem da coluna
-- canais.taxa_pct: a taxa muda de mes para mes (o fechamento de agosto mostrou
-- 34,5% na Pizzaria contra 47,0% na Pastas). canais.taxa_pct e a taxa vigente
-- do cadastro, que o painel usa para projetar; canal_taxa_mes e o que de fato
-- aconteceu em cada mes, vindo do fechamento.
--
-- Idempotente.

begin;

-- ---------------------------------------------------------------------------
-- canal_taxa_mes: o fechamento mensal, por canal
-- ---------------------------------------------------------------------------
create table if not exists alavanca.canal_taxa_mes (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  canal_id  uuid not null references alavanca.canais(id) on delete cascade,
  mes       date not null,  -- sempre o dia 1 do mes

  vendas_brutas       numeric(14,2) not null default 0,
  taxas_comissoes     numeric(14,2) not null default 0,
  servicos_promocoes  numeric(14,2) not null default 0,
  ajustes             numeric(14,2) not null default 0,
  liquido             numeric(14,2) not null default 0,
  take_rate_pct       numeric(8,6),

  comissao_pct        numeric(8,6),
  taxa_pagamento_pct  numeric(8,6),
  embalagem_por_item  numeric(10,2),

  -- repasses
  total_repasses      numeric(14,2),
  ja_recebido         numeric(14,2),
  a_receber           numeric(14,2),
  recebido_na_loja    numeric(14,2),

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, canal_id, mes),
  constraint canal_taxa_mes_dia_1 check (extract(day from mes) = 1)
);
comment on table alavanca.canal_taxa_mes is
  'Fechamento mensal por canal: bruto, o que o canal ficou e o que entrou na conta. Fonte do take-rate real e do repasse do iFood.';
select alavanca.proteger_tabela('alavanca.canal_taxa_mes');
select alavanca.trigger_atualizado_em('alavanca.canal_taxa_mes');

-- ---------------------------------------------------------------------------
-- ifood_operacao_dia
-- ---------------------------------------------------------------------------
create table if not exists alavanca.ifood_operacao_dia (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  canal_id  uuid not null references alavanca.canais(id) on delete cascade,
  data      date not null,

  nota                numeric(4,2) check (nota >= 0 and nota <= 5),
  tempo_entrega_min   numeric(8,2),
  cancelados          integer not null default 0 check (cancelados >= 0),
  minutos_fora_do_ar  integer,
  pedidos_atrasados   integer,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, canal_id, data)
);
comment on table alavanca.ifood_operacao_dia is 'Nota, tempo de entrega e cancelamento por loja do iFood por dia.';
select alavanca.proteger_tabela('alavanca.ifood_operacao_dia');
select alavanca.trigger_atualizado_em('alavanca.ifood_operacao_dia');

-- ---------------------------------------------------------------------------
-- ifood_funil_dia
-- ---------------------------------------------------------------------------
create table if not exists alavanca.ifood_funil_dia (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  canal_id  uuid not null references alavanca.canais(id) on delete cascade,
  data      date not null,

  visitas  bigint not null default 0,
  cardapio bigint not null default 0,
  sacola   bigint not null default 0,
  pedidos  bigint not null default 0,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, canal_id, data)
);
comment on table alavanca.ifood_funil_dia is 'Funil da loja no iFood: visita -> cardapio -> sacola -> pedido.';
select alavanca.proteger_tabela('alavanca.ifood_funil_dia');
select alavanca.trigger_atualizado_em('alavanca.ifood_funil_dia');

-- ---------------------------------------------------------------------------
-- ifood_faixa_dia
-- ---------------------------------------------------------------------------
create table if not exists alavanca.ifood_faixa_dia (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  canal_id  uuid not null references alavanca.canais(id) on delete cascade,
  data      date not null,
  faixa     text not null,   -- "ate 50", "50 a 80", ...
  ordem     smallint not null default 0,
  pedidos   integer not null default 0 check (pedidos >= 0),

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  unique (tenant_id, canal_id, data, faixa)
);
comment on table alavanca.ifood_faixa_dia is 'Pedidos por faixa de valor, por loja e por dia.';
select alavanca.proteger_tabela('alavanca.ifood_faixa_dia');

-- ---------------------------------------------------------------------------
-- promocoes bancadas pelo restaurante
-- ---------------------------------------------------------------------------
create table if not exists alavanca.promocoes (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  canal_id  uuid references alavanca.canais(id) on delete cascade,
  codigo    text not null,         -- Promocao.id do painel
  nome      text not null,
  tipo      text,                  -- "Desconto %", "Leve 2 pague 1", "Frete gratis"
  quem_banca text,                 -- "Restaurante" | "iFood" | "Dividido"
  ativo     boolean not null default true,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, codigo)
);
comment on table alavanca.promocoes is 'Promocao de canal. "quem_banca" decide se o custo entra na taxa efetiva do restaurante.';
select alavanca.proteger_tabela('alavanca.promocoes');
select alavanca.trigger_atualizado_em('alavanca.promocoes');

create table if not exists alavanca.promocao_dia (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references alavanca.tenants(id) on delete cascade,
  promocao_id uuid not null references alavanca.promocoes(id) on delete cascade,
  data        date not null,

  pedidos     integer not null default 0 check (pedidos >= 0),
  faturamento numeric(14,2) not null default 0,
  custo       numeric(14,2) not null default 0,  -- quanto o RESTAURANTE bancou

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  unique (tenant_id, promocao_id, data)
);
comment on table alavanca.promocao_dia is 'Resultado de uma promocao num dia. O custo e so a parte bancada pelo restaurante.';
select alavanca.proteger_tabela('alavanca.promocao_dia');

commit;
