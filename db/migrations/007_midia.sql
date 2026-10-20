-- 007_midia.sql
-- Midia paga (Meta Ads): campanha, criativo, resultado diario, alcance,
-- o mapa nome-da-campanha -> marca e os voos (flights).
--
-- Hoje a conta do Meta e UNICA para Le Tre e Jerry's, e a marca e deduzida pelo
-- nome da campanha (lib_meta.marca faz 'jerry' in nome). Isso vira a tabela
-- campaign_brand_map: regra explicita, com prioridade, auditavel - em vez de um
-- if escondido no codigo.
--
-- flights = voo. Um conjunto (adset) com orcamento vitalicio, data de inicio e
-- fim, que o PDCA acompanha pela queima ("combustivel").
--
-- Idempotente.

begin;

-- ---------------------------------------------------------------------------
-- campaign_brand_map
-- ---------------------------------------------------------------------------
create table if not exists alavanca.campaign_brand_map (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id  uuid not null references alavanca.marcas(id) on delete cascade,

  tipo_padrao text not null default 'contem' check (tipo_padrao in ('contem', 'prefixo', 'regex', 'exato')),
  padrao      text not null,              -- ex.: 'jerry'
  campo       text not null default 'campanha' check (campo in ('campanha', 'conjunto', 'conta')),
  prioridade  smallint not null default 100,  -- menor = avaliado antes
  ativo       boolean not null default true,
  nota        text,

  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, campo, padrao)
);
comment on table alavanca.campaign_brand_map is
  'Regra que liga o nome da campanha/conjunto a uma marca. Substitui o if de lib_meta.marca(). Regra sem match cai na marca padrao do tenant (tenant_config).';
select alavanca.proteger_tabela('alavanca.campaign_brand_map');
select alavanca.trigger_atualizado_em('alavanca.campaign_brand_map');

-- ---------------------------------------------------------------------------
-- campanhas
-- ---------------------------------------------------------------------------
create table if not exists alavanca.campanhas (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id  uuid references alavanca.marcas(id) on delete set null,

  provedor      text not null default 'meta_ads' check (provedor in ('meta_ads', 'google_ads', 'ifood_ads', 'outro')),
  external_id   text not null,
  nome          text not null,
  status        text not null default 'ativa' check (status in ('ativa', 'pausada', 'em_analise', 'encerrada')),
  objetivo      text,
  orcamento_dia numeric(12,2),
  conta_externa text,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, provedor, external_id)
);
comment on table alavanca.campanhas is 'Campanha de midia paga. Campanha.* do painel.';
select alavanca.proteger_tabela('alavanca.campanhas');
select alavanca.trigger_atualizado_em('alavanca.campanhas');

-- ---------------------------------------------------------------------------
-- flights (voos / conjuntos)
-- ---------------------------------------------------------------------------
create table if not exists alavanca.flights (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id    uuid references alavanca.marcas(id) on delete set null,
  campanha_id uuid references alavanca.campanhas(id) on delete cascade,

  external_id text not null,     -- adset_id
  nome        text not null,
  status      text not null default 'ativo' check (status in ('ativo', 'pausado', 'encerrado', 'rascunho')),
  evento_otimizado text,         -- PURCHASE | ADD_TO_CART | LINK_CLICKS ...
  atribuicao  jsonb,             -- {"clique_dias":7,"view_dias":1,"video_dias":1}
  conversion_domain text,

  orcamento_vitalicio numeric(12,2),
  orcamento_diario    numeric(12,2),
  inicio   timestamptz,
  fim      timestamptz,
  -- janela de entrega por dia da semana: {"5":[19,22],"6":[19,22]}
  agenda   jsonb,
  geografia jsonb,
  publicos  jsonb not null default '[]'::jsonb,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, external_id)
);
comment on table alavanca.flights is
  'Voo: conjunto de anuncios com orcamento e janela. E a unidade que o PDCA corta, pausa ou libera por excecao.';
select alavanca.proteger_tabela('alavanca.flights');
select alavanca.trigger_atualizado_em('alavanca.flights');
create index if not exists ix_flights_marca on alavanca.flights (tenant_id, marca_id, status);

-- ---------------------------------------------------------------------------
-- criativos
-- ---------------------------------------------------------------------------
create table if not exists alavanca.criativos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references alavanca.tenants(id) on delete cascade,
  campanha_id uuid references alavanca.campanhas(id) on delete cascade,
  flight_id   uuid references alavanca.flights(id) on delete set null,

  external_id text not null,
  nome        text not null,
  formato     text,            -- "Video" | "Imagem" | "Carrossel"

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, external_id)
);
comment on table alavanca.criativos is 'Anuncio/criativo. Criativo.* do painel.';
select alavanca.proteger_tabela('alavanca.criativos');
select alavanca.trigger_atualizado_em('alavanca.criativos');

-- ---------------------------------------------------------------------------
-- anuncio_dia: resultado diario, no nivel mais fino que a fonte entrega
-- ---------------------------------------------------------------------------
create table if not exists alavanca.anuncio_dia (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id    uuid references alavanca.marcas(id) on delete set null,
  campanha_id uuid references alavanca.campanhas(id) on delete cascade,
  flight_id   uuid references alavanca.flights(id) on delete set null,
  criativo_id uuid references alavanca.criativos(id) on delete set null,
  data        date not null,
  hora        smallint check (hora between 0 and 23),  -- NULL = o dia inteiro

  investimento numeric(14,2) not null default 0 check (investimento >= 0),
  impressoes   bigint  not null default 0,
  cliques      bigint  not null default 0,
  visitas      bigint  not null default 0,   -- landing_page_view
  carrinhos    bigint  not null default 0,   -- add_to_cart
  checkouts    bigint  not null default 0,
  conversas    bigint  not null default 0,
  pedidos      bigint  not null default 0,   -- omni_purchase atribuido
  faturamento  numeric(14,2) not null default 0,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table alavanca.anuncio_dia is
  'Resultado de midia por dia (e por hora, quando a fonte entrega). O painel soma por periodo; alcance NAO entra aqui porque nao se soma.';
select alavanca.proteger_tabela('alavanca.anuncio_dia');
select alavanca.trigger_atualizado_em('alavanca.anuncio_dia');
-- Chave unica tolerante a NULL nos ids: identifica a granularidade exata da linha.
create unique index if not exists ux_anuncio_dia_grao
  on alavanca.anuncio_dia (
    tenant_id, data,
    coalesce(criativo_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(flight_id,   '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(campanha_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(hora, -1)
  );
create index if not exists ix_anuncio_dia_tenant_data on alavanca.anuncio_dia (tenant_id, data);

-- ---------------------------------------------------------------------------
-- midia_alcance: alcance nao se soma dia a dia, vem pronto por periodo
-- ---------------------------------------------------------------------------
create table if not exists alavanca.midia_alcance (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id    uuid references alavanca.marcas(id) on delete set null,
  periodo_inicio date not null,
  periodo_fim    date not null,
  alcance     bigint not null default 0 check (alcance >= 0),
  frequencia  numeric(8,4),

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  check (periodo_fim >= periodo_inicio)
);
comment on table alavanca.midia_alcance is
  'Alcance por periodo. A mesma pessoa conta uma vez, entao nao da para somar dia a dia: a fonte precisa entregar fechado.';
select alavanca.proteger_tabela('alavanca.midia_alcance');
create unique index if not exists ux_midia_alcance_marca
  on alavanca.midia_alcance (tenant_id, coalesce(marca_id, '00000000-0000-0000-0000-000000000000'::uuid), periodo_inicio, periodo_fim);

commit;
