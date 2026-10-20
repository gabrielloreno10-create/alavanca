-- 003_clientes_consentimento.sql
-- Base de clientes finais e o consentimento deles.
--
-- Tabelas:
--   customers - uma linha por pessoa, chaveada por telefone E.164 dentro do tenant
--   consents  - historico append-only de consentimento por canal e finalidade
--
-- Decisoes travadas que aparecem aqui:
--   - telefone sempre em E.164 e unico por tenant (dominio alavanca.telefone_e164);
--   - consentimento tem estado EXPLICITO, incluindo 'legado_sem_registro' para
--     a base atual (2.092 linhas em cliente_memoria) que nunca teve opt-in
--     documentado. Ausencia de linha nao e opt-in: e desconhecido.
--
-- O estado atual nao e uma coluna de customers: e a linha mais recente de
-- consents por (customer, canal, finalidade). A view vw_consentimento_atual
-- resolve isso.
--
-- Nenhum dado pessoal vai para arquivo versionado: aqui so tem o schema.
--
-- Idempotente.

begin;

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
create table if not exists alavanca.customers (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references alavanca.tenants(id) on delete cascade,
  telefone_e164  alavanca.telefone_e164 not null,
  nome           text,

  primeiro_contato timestamptz,
  ultimo_contato   timestamptz,
  ultimo_pedido_em date,
  total_pedidos    integer not null default 0 check (total_pedidos >= 0),
  total_conversas  integer not null default 0 check (total_conversas >= 0),
  ticket_medio     numeric(12,2),

  -- perfil montado pelo CRM, usado na segmentacao
  prato_favorito  text,
  dia_habitual    text,
  bairro          text,
  segmento        text,
  estagio_funil   text not null default 'descoberta',
  preferencias    text,
  objecoes        text,
  ultima_intencao text,
  suspeito        boolean not null default false,

  -- de onde a pessoa entrou na base
  ext_cliente_fiel_id text,
  ids_externos        jsonb not null default '{}'::jsonb,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, telefone_e164)
);
comment on table alavanca.customers is 'Cliente final do restaurante. Chave de negocio: tenant + telefone em E.164.';
comment on column alavanca.customers.telefone_e164 is 'Sempre E.164 (+5531999998888). O importador normaliza antes de gravar; o dominio recusa o resto.';
select alavanca.proteger_tabela('alavanca.customers');
select alavanca.trigger_atualizado_em('alavanca.customers');
create index if not exists ix_customers_segmento on alavanca.customers (tenant_id, segmento);
create index if not exists ix_customers_ultimo_pedido on alavanca.customers (tenant_id, ultimo_pedido_em desc);
create unique index if not exists ux_customers_cliente_fiel
  on alavanca.customers (tenant_id, ext_cliente_fiel_id) where ext_cliente_fiel_id is not null;

-- ---------------------------------------------------------------------------
-- consents
-- ---------------------------------------------------------------------------
create table if not exists alavanca.consents (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references alavanca.tenants(id) on delete cascade,
  customer_id uuid not null references alavanca.customers(id) on delete cascade,
  marca_id    uuid references alavanca.marcas(id) on delete cascade,  -- NULL = vale para o tenant inteiro

  canal     text not null check (canal in ('whatsapp', 'sms', 'email', 'push', 'ligacao')),
  finalidade text not null check (finalidade in ('transacional', 'marketing', 'pesquisa')),

  -- Estado EXPLICITO. 'legado_sem_registro' existe para a base herdada que nunca
  -- teve opt-in documentado: nao e opt-in nem opt-out, e divida tecnica declarada.
  estado text not null check (estado in (
    'opt_in',
    'opt_out',
    'legado_sem_registro',
    'pendente',
    'expirado'
  )),

  origem_consentimento text not null,  -- 'formulario_site' | 'whatsapp_resposta' | 'importacao_cliente_fiel' | ...
  evidencia  jsonb not null default '{}'::jsonb,  -- print, id da mensagem, ip, texto aceito
  ocorrido_em timestamptz not null,
  expira_em   timestamptz,
  registrado_por text,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now()
);
comment on table alavanca.consents is
  'Historico append-only de consentimento. Nunca faca UPDATE: um opt-out e uma linha NOVA. Estado atual = vw_consentimento_atual.';
comment on column alavanca.consents.estado is
  'legado_sem_registro = base herdada sem opt-in documentado. Nao disparar marketing com esse estado sem decisao do dono.';
select alavanca.proteger_tabela('alavanca.consents');
create index if not exists ix_consents_customer on alavanca.consents (tenant_id, customer_id, canal, finalidade, ocorrido_em desc);

-- Estado vigente por (cliente, canal, finalidade).
-- security_invoker = true: a view respeita a RLS de quem consulta, e nao a do
-- dono da view. Sem isso, qualquer view viraria um buraco no isolamento.
create or replace view alavanca.vw_consentimento_atual
with (security_invoker = true) as
select distinct on (c.tenant_id, c.customer_id, c.canal, c.finalidade)
  c.tenant_id,
  c.customer_id,
  c.marca_id,
  c.canal,
  c.finalidade,
  c.estado,
  c.origem_consentimento,
  c.ocorrido_em,
  c.expira_em,
  (c.estado = 'opt_in' and (c.expira_em is null or c.expira_em > now())) as pode_receber
from alavanca.consents c
order by c.tenant_id, c.customer_id, c.canal, c.finalidade, c.ocorrido_em desc, c.criado_em desc;
comment on view alavanca.vw_consentimento_atual is
  'Ultimo estado de consentimento por cliente/canal/finalidade. pode_receber = true SO com opt_in vigente.';
grant select on alavanca.vw_consentimento_atual to alavanca_app;

commit;
