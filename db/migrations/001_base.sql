-- 001_base.sql
-- Base da plataforma Alavanca.
--
-- O que esta migration faz:
--   1. cria o schema "alavanca" e o papel de aplicacao "alavanca_app"
--      (sem superuser, sem BYPASSRLS);
--   2. cria as funcoes de contexto por request: alavanca.tenant_atual() e
--      alavanca.usuario_atual(), lidas de current_setting('app.tenant_id') e
--      current_setting('app.usuario_id');
--   3. cria os helpers alavanca.proteger_tabela() (liga RLS + policy + grant)
--      e alavanca.trigger_atualizado_em();
--   4. cria os dominios compartilhados (origem do dado, tipo de canal, fonte
--      de pedido, telefone E.164);
--   5. cria o cadastro raiz: tenants -> marcas -> canais, mais tenant_config,
--      brand_guardrails, limites_alerta e meta_dia_semana.
--
-- Decisoes travadas que aparecem aqui:
--   - tenant_id NOT NULL em toda tabela de dominio, com RLS ligado na mesma
--     migration que cria a tabela (nao existe janela sem RLS);
--   - toda linha de dado de negocio carrega origem / fonte / coletado_em;
--   - telefone sempre em E.164 (dominio alavanca.telefone_e164).
--
-- Idempotente: pode rodar de novo sem quebrar.

begin;

create schema if not exists alavanca;
comment on schema alavanca is 'Modelo de dados v1 da plataforma Alavanca (Tapaggo).';

revoke create on schema public from public;

-- ---------------------------------------------------------------------------
-- Papel de aplicacao
-- ---------------------------------------------------------------------------
-- Criado SEM senha de proposito. A senha e definida pelo aplicar.sh/.ps1 a
-- partir da variavel de ambiente ALAVANCA_APP_PASSWORD. Nenhuma senha entra
-- em arquivo versionado.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'alavanca_app') then
    create role alavanca_app login;
  end if;
end
$$;

alter role alavanca_app nosuperuser nocreatedb nocreaterole nobypassrls noreplication inherit;

grant usage on schema alavanca to alavanca_app;
grant usage on schema public   to alavanca_app;

alter default privileges in schema alavanca
  grant usage, select on sequences to alavanca_app;

-- O painel e o worker nao precisam declarar o schema em cada query.
do $$
begin
  execute format('alter database %I set search_path = alavanca, public', current_database());
exception when others then
  raise notice 'nao foi possivel ajustar search_path do database (%) - defina na conexao', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- Contexto por request
-- ---------------------------------------------------------------------------
-- O painel abre uma transacao por request e faz:
--   select set_config('app.tenant_id', $1, true);
-- "true" = local a transacao, entao o valor morre junto com ela e nao vaza
-- para a proxima request que pegar a mesma conexao do pool.
create or replace function alavanca.tenant_atual() returns uuid
language sql stable
as $fn$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$fn$;

comment on function alavanca.tenant_atual() is
  'Tenant do request atual. NULL quando app.tenant_id nao foi setado - e nesse caso nenhuma policy casa, entao o padrao e nao ver nada.';

create or replace function alavanca.usuario_atual() returns uuid
language sql stable
as $fn$
  select nullif(current_setting('app.usuario_id', true), '')::uuid
$fn$;

-- ---------------------------------------------------------------------------
-- Helpers de RLS e de atualizado_em
-- ---------------------------------------------------------------------------
create or replace function alavanca.proteger_tabela(p_tabela regclass) returns void
language plpgsql
as $fn$
declare
  nome text := p_tabela::text;
begin
  execute format('alter table %s enable row level security', nome);
  -- FORCE: nem o dono da tabela escapa da policy. Quem precisa passar por cima
  -- (migrations, backup) usa uma role com BYPASSRLS, nunca a conexao da app.
  execute format('alter table %s force row level security', nome);
  execute format('drop policy if exists tenant_isolado on %s', nome);
  execute format(
    'create policy tenant_isolado on %s '
    'using (tenant_id = alavanca.tenant_atual()) '
    'with check (tenant_id = alavanca.tenant_atual())', nome);
  execute format('grant select, insert, update, delete on %s to alavanca_app', nome);
end
$fn$;

comment on function alavanca.proteger_tabela(regclass) is
  'Liga RLS + FORCE, cria a policy tenant_isolado e da grant para alavanca_app. Chamada logo depois de cada create table de dominio.';

create or replace function alavanca.tocar_atualizado_em() returns trigger
language plpgsql
as $fn$
begin
  new.atualizado_em := now();
  return new;
end
$fn$;

create or replace function alavanca.trigger_atualizado_em(p_tabela regclass) returns void
language plpgsql
as $fn$
declare
  nome text := p_tabela::text;
  gatilho text := 'trg_atualizado_em';
begin
  execute format('drop trigger if exists %I on %s', gatilho, nome);
  execute format(
    'create trigger %I before update on %s for each row execute function alavanca.tocar_atualizado_em()',
    gatilho, nome);
end
$fn$;

-- ---------------------------------------------------------------------------
-- Dominios compartilhados
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'origem_dado' and n.nspname = 'alavanca') then
    create domain alavanca.origem_dado as text
      check (value in ('REAL', 'EXEMPLO'));
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'tipo_canal' and n.nspname = 'alavanca') then
    create domain alavanca.tipo_canal as text
      check (value in ('ifood', 'proprio', 'salao'));
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'fonte_pedido' and n.nspname = 'alavanca') then
    create domain alavanca.fonte_pedido as text
      check (value in ('cliente_fiel_site', 'luiza', 'ifood', 'saipos'));
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'telefone_e164' and n.nspname = 'alavanca') then
    -- E.164: "+" seguido de 8 a 15 digitos, primeiro digito diferente de zero.
    create domain alavanca.telefone_e164 as text
      check (value ~ '^\+[1-9][0-9]{7,14}$');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'pilar' and n.nspname = 'alavanca') then
    create domain alavanca.pilar as text
      check (value in ('ifood', 'canal-proprio', 'crm', 'whatsapp', 'lucro', 'metricas'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Controle de migrations
-- ---------------------------------------------------------------------------
create table if not exists alavanca.migrations (
  versao      text primary key,
  nome        text not null,
  checksum    text not null,
  aplicada_em timestamptz not null default now()
);
comment on table alavanca.migrations is 'Uma linha por arquivo de migration aplicado. Preenchida pelo aplicar.sh / aplicar.ps1.';
grant select on alavanca.migrations to alavanca_app;

-- ---------------------------------------------------------------------------
-- tenants: um tenant = um grupo de restaurantes (cliente da Alavanca)
-- ---------------------------------------------------------------------------
create table if not exists alavanca.tenants (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,            -- "grupo-le-tre": e o [cliente] da rota do painel
  nome         text not null,                   -- Cliente.nome
  segmento     text,                            -- Cliente.segmento
  imposto_pct  numeric(8,6) not null default 0  -- Cliente.impostoPct
    check (imposto_pct >= 0 and imposto_pct < 1),
  nota_margem  text,                            -- Cliente.notaMargem
  fuso         text not null default 'America/Sao_Paulo',
  ativo        boolean not null default true,
  origem       alavanca.origem_dado not null,   -- Cliente.origem
  fonte        text not null,                   -- Cliente.fonte
  coletado_em  timestamptz not null default now(),
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table alavanca.tenants is 'Grupo de restaurantes que e cliente da Alavanca. O grupo Le Tre Farine e o tenant 1.';

-- tenants e a unica tabela cuja chave de isolamento e o proprio id.
alter table alavanca.tenants enable row level security;
alter table alavanca.tenants force row level security;
drop policy if exists tenant_isolado on alavanca.tenants;
create policy tenant_isolado on alavanca.tenants
  using (id = alavanca.tenant_atual())
  with check (id = alavanca.tenant_atual());
grant select, insert, update, delete on alavanca.tenants to alavanca_app;
select alavanca.trigger_atualizado_em('alavanca.tenants');

-- ---------------------------------------------------------------------------
-- marcas: as operacoes dentro do tenant
-- ---------------------------------------------------------------------------
-- O dono confirmou em 19/10/2026 que Le Tre Farine Pizzaria, Le Tre Farine
-- Pastas e Jerry's Burger sao a MESMA operacao, so muda a marca.
create table if not exists alavanca.marcas (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references alavanca.tenants(id) on delete cascade,
  slug         text not null,
  nome         text not null,     -- precisa casar com ConfigCanal.operacao do painel
  segmento     text,
  ordem        smallint not null default 0,
  ativo        boolean not null default true,
  origem       alavanca.origem_dado not null,
  fonte        text not null,
  coletado_em  timestamptz not null default now(),
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (tenant_id, nome)
);
comment on table alavanca.marcas is 'Marca/operacao dentro do tenant. Mapeia ConfigCanal.operacao do painel.';
select alavanca.proteger_tabela('alavanca.marcas');
select alavanca.trigger_atualizado_em('alavanca.marcas');
create index if not exists ix_marcas_tenant on alavanca.marcas (tenant_id);

-- ---------------------------------------------------------------------------
-- canais: uma loja/canal de venda de uma marca
-- ---------------------------------------------------------------------------
create table if not exists alavanca.canais (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id         uuid not null references alavanca.marcas(id) on delete cascade,
  slug             text not null,                 -- CanalId do painel: "letre-ifood-pizzaria"
  nome             text not null,                 -- ConfigCanal.nome
  tipo             alavanca.tipo_canal not null,  -- ConfigCanal.tipo
  taxa_pct         numeric(8,6) not null default 0  -- ConfigCanal.taxaPct
    check (taxa_pct >= 0 and taxa_pct < 1),
  custo_por_pedido numeric(12,2) not null default 0 -- ConfigCanal.custoPorPedido
    check (custo_por_pedido >= 0),
  ordem            smallint not null default 0,
  ativo            boolean not null default true,

  -- ids externos: e por eles que o importador casa cada arquivo com o canal
  ext_ifood_loja_id                text,
  ext_cliente_fiel_estabelecimento text,
  ext_saipos_marca                 text,   -- "PZ" | "PA" | "LCF" | "JIF" | "JCF"
  ext_saipos_loja_id               text,
  ids_externos                     jsonb not null default '{}'::jsonb,

  origem       alavanca.origem_dado not null,
  fonte        text not null,
  coletado_em  timestamptz not null default now(),
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, slug)
);
comment on table alavanca.canais is 'Loja/canal de venda (uma loja do iFood, o site Cliente Fiel de uma marca, o salao). Um por loja.';
select alavanca.proteger_tabela('alavanca.canais');
select alavanca.trigger_atualizado_em('alavanca.canais');
create index if not exists ix_canais_tenant_marca on alavanca.canais (tenant_id, marca_id);
create unique index if not exists ux_canais_ext_ifood
  on alavanca.canais (tenant_id, ext_ifood_loja_id) where ext_ifood_loja_id is not null;
create unique index if not exists ux_canais_ext_cliente_fiel
  on alavanca.canais (tenant_id, ext_cliente_fiel_estabelecimento) where ext_cliente_fiel_estabelecimento is not null;
create unique index if not exists ux_canais_ext_saipos
  on alavanca.canais (tenant_id, ext_saipos_marca) where ext_saipos_marca is not null;

-- ---------------------------------------------------------------------------
-- tenant_config: chave/valor por tenant
-- ---------------------------------------------------------------------------
create table if not exists alavanca.tenant_config (
  tenant_id     uuid not null references alavanca.tenants(id) on delete cascade,
  chave         text not null,
  valor         jsonb not null,
  descricao     text,
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, chave),
  -- guardrail: config nunca guarda segredo. Segredo mora em integracao_config.
  constraint tenant_config_sem_segredo check (
    not (valor ?| array['token','senha','password','secret','api_key','apikey','access_token','client_secret'])
  )
);
comment on table alavanca.tenant_config is 'Preferencias do tenant em jsonb. Nunca guarda segredo (ver integracao_config).';
select alavanca.proteger_tabela('alavanca.tenant_config');
select alavanca.trigger_atualizado_em('alavanca.tenant_config');

-- ---------------------------------------------------------------------------
-- brand_guardrails: regras duras do PDCA, com heranca tenant -> marca
-- ---------------------------------------------------------------------------
-- Mesma ideia do guardrails.json de hoje: a raiz vale para o tenant inteiro e
-- cada marca sobrescreve SO o que e diferente nela (coluna NULL = herda).
create table if not exists alavanca.brand_guardrails (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id  uuid references alavanca.marcas(id) on delete cascade,  -- NULL = raiz do tenant

  ticket_medio                numeric(12,2),
  margem_contribuicao         numeric(6,4),
  cmv_adotado                 numeric(6,4),
  roas_break_even             numeric(8,4),
  roas_alvo                   numeric(8,4),
  cpa_teto                    numeric(12,2),
  custo_visita_teto           numeric(12,2),
  custo_carrinho_teto         numeric(12,2),
  custo_conversa_teto         numeric(12,2),
  teto_gasto_diario           numeric(12,2),
  custos_fixos_mes            numeric(14,2),
  ponto_equilibrio_receita_mes numeric(14,2),
  valor_pedido_migrado        numeric(12,2),
  avalia_por                  text check (avalia_por in ('roas', 'proxy')),

  -- janela de venda: {"0":[19,22], ..., "6":[19,22]}  (0 = domingo)
  janela_venda      jsonb,
  -- dias em que o playbook manda nao anunciar: [1,2,3]
  dias_sem_midia    smallint[],
  -- {"loja_lat":..,"loja_lon":..,"raio_km_maximo":6,"loja_endereco":".."}
  geografia         jsonb,
  -- {"gasto_sem_compra":60,"cpa_ruim_min_gasto":90,"dias_avaliacao_roas":7,"roas_corte":1.5}
  corte_automatico  jsonb,
  -- qualquer guardrail novo que ainda nao virou coluna
  extras            jsonb not null default '{}'::jsonb,

  -- Nomes de coluna que esta marca zera DE PROPOSITO, em vez de herdar da raiz.
  -- Existe porque "NULL" na linha da marca e ambiguo: hoje o Jerry's tem
  -- ticket_medio null querendo dizer "nao avalie por ticket", e nao "use o da
  -- Le Tre". Sem isso, a heranca por COALESCE daria o numero errado.
  -- Ex.: '{ticket_medio,roas_alvo,cpa_teto}'
  anulados          text[] not null default '{}',

  nota         text,
  origem       alavanca.origem_dado not null,
  fonte        text not null,
  coletado_em  timestamptz not null default now(),
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table alavanca.brand_guardrails is
  'Regras duras do ciclo PDCA. marca_id NULL = raiz do tenant; linha de marca sobrescreve so as colunas nao nulas.';
select alavanca.proteger_tabela('alavanca.brand_guardrails');
select alavanca.trigger_atualizado_em('alavanca.brand_guardrails');
create unique index if not exists ux_guardrail_raiz
  on alavanca.brand_guardrails (tenant_id) where marca_id is null;
create unique index if not exists ux_guardrail_marca
  on alavanca.brand_guardrails (tenant_id, marca_id) where marca_id is not null;

-- Excecoes temporarias ao corte automatico (o bloco excecoes_corte_automatico
-- do guardrails.json). Expiram sozinhas pela data.
create table if not exists alavanca.guardrail_excecoes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id    uuid references alavanca.marcas(id) on delete cascade,
  external_adset_id text not null,
  nome        text,
  motivo      text not null,
  vale_ate    date not null,
  criado_por  text,
  criado_em   timestamptz not null default now(),
  unique (tenant_id, external_adset_id, vale_ate)
);
comment on table alavanca.guardrail_excecoes is 'Conjunto que nao e pausado por desempenho ate a data. Erro estrutural continua sendo cortado.';
select alavanca.proteger_tabela('alavanca.guardrail_excecoes');

-- ---------------------------------------------------------------------------
-- limites_alerta: os limites que disparam alerta no painel (Cliente.limites)
-- ---------------------------------------------------------------------------
create table if not exists alavanca.limites_alerta (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id  uuid references alavanca.marcas(id) on delete cascade,  -- NULL = raiz do tenant

  meta_minima_pct    numeric(6,4),  -- Limites.metaMinimaPct
  margem_minima_pct  numeric(6,4),  -- Limites.margemMinimaPct
  queda_pedidos_pct  numeric(6,4),  -- Limites.quedaPedidosPct
  ifood_maximo_pct   numeric(6,4),  -- Limites.ifoodMaximoPct
  queda_ticket_pct   numeric(6,4),  -- Limites.quedaTicketPct

  origem       alavanca.origem_dado not null,
  fonte        text not null,
  coletado_em  timestamptz not null default now(),
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table alavanca.limites_alerta is 'Limites de alerta do painel (Cliente.limites). Mesma heranca tenant -> marca dos guardrails.';
select alavanca.proteger_tabela('alavanca.limites_alerta');
select alavanca.trigger_atualizado_em('alavanca.limites_alerta');
create unique index if not exists ux_limites_raiz
  on alavanca.limites_alerta (tenant_id) where marca_id is null;
create unique index if not exists ux_limites_marca
  on alavanca.limites_alerta (tenant_id, marca_id) where marca_id is not null;

-- ---------------------------------------------------------------------------
-- meta_dia_semana: a meta de faturamento por dia da semana
-- ---------------------------------------------------------------------------
create table if not exists alavanca.meta_dia_semana (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id    uuid references alavanca.marcas(id) on delete cascade,  -- NULL = meta do grupo
  dia_semana  smallint not null check (dia_semana between 0 and 6),   -- 0 = domingo
  valor       numeric(14,2) not null check (valor >= 0),
  vigente_de  date not null default date '1900-01-01',
  vigente_ate date,                                                   -- NULL = vigente

  origem       alavanca.origem_dado not null,
  fonte        text not null,
  coletado_em  timestamptz not null default now(),
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (vigente_ate is null or vigente_ate >= vigente_de)
);
comment on table alavanca.meta_dia_semana is 'Meta de faturamento por dia da semana (Cliente.metaPorDiaSemana). Sem linha vigente = meta nao cadastrada.';
select alavanca.proteger_tabela('alavanca.meta_dia_semana');
select alavanca.trigger_atualizado_em('alavanca.meta_dia_semana');
create unique index if not exists ux_meta_grupo
  on alavanca.meta_dia_semana (tenant_id, dia_semana, vigente_de) where marca_id is null;
create unique index if not exists ux_meta_marca
  on alavanca.meta_dia_semana (tenant_id, marca_id, dia_semana, vigente_de) where marca_id is not null;

commit;
