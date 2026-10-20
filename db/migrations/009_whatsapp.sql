-- 009_whatsapp.sql
-- Numeros agregados do vendedor IA no WhatsApp e as regras que ele segue.
--
-- Por que existe agregado diario se ja existem conversation_state e messages:
-- a tela de WhatsApp compara periodos (7d x 7d anteriores) e precisa de soma
-- rapida. O detalhe fica nas conversas; o agregado e recalculado pelo worker.
--
-- Idempotente.

begin;

create table if not exists alavanca.whatsapp_dia (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id  uuid not null references alavanca.marcas(id) on delete cascade,
  data      date not null,

  conversas            integer not null default 0 check (conversas >= 0),
  pedidos              integer not null default 0 check (pedidos >= 0),
  faturamento          numeric(14,2) not null default 0,
  sugestoes            integer not null default 0,
  sugestoes_aceitas    integer not null default 0,
  valor_adicionais     numeric(14,2) not null default 0,
  followups            integer not null default 0,
  followups_respondidos integer not null default 0,
  pedidos_recuperados  integer not null default 0,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, marca_id, data)
);
comment on table alavanca.whatsapp_dia is 'Agregado diario do vendedor IA por marca. Recalculavel a partir de conversation_state + messages + orders.';
select alavanca.proteger_tabela('alavanca.whatsapp_dia');
select alavanca.trigger_atualizado_em('alavanca.whatsapp_dia');

create table if not exists alavanca.whatsapp_transferencia_dia (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id  uuid not null references alavanca.marcas(id) on delete cascade,
  data      date not null,
  motivo    text not null,   -- "Duvida de alergia", "Reclamacao de pedido"
  quantidade integer not null default 0 check (quantidade >= 0),

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  unique (tenant_id, marca_id, data, motivo)
);
comment on table alavanca.whatsapp_transferencia_dia is 'Quantas vezes a IA passou a conversa para humano, por motivo e por dia.';
select alavanca.proteger_tabela('alavanca.whatsapp_transferencia_dia');

-- Regras que a IA segue, mostradas na tela para o dono conferir.
create table if not exists alavanca.whatsapp_regras (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id  uuid references alavanca.marcas(id) on delete cascade,
  ordem     smallint not null default 0,
  texto     text not null,
  ativo     boolean not null default true,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table alavanca.whatsapp_regras is 'Regras do vendedor IA em texto, do jeito que aparecem na tela do WhatsApp.';
select alavanca.proteger_tabela('alavanca.whatsapp_regras');
select alavanca.trigger_atualizado_em('alavanca.whatsapp_regras');

-- Reclamacoes abertas pelo atendimento (substitui luiza_reclamacoes).
create table if not exists alavanca.reclamacoes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id    uuid references alavanca.marcas(id) on delete set null,
  customer_id uuid references alavanca.customers(id) on delete set null,
  conversation_id uuid references alavanca.conversation_state(id) on delete set null,
  order_id    uuid references alavanca.orders(id) on delete set null,

  detalhe          text,
  mensagem_cliente text,
  status      text not null default 'aberta' check (status in ('aberta', 'em_andamento', 'resolvida', 'descartada')),
  resolvido_em timestamptz,
  resolvido_por text,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table alavanca.reclamacoes is 'Reclamacao aberta durante o atendimento. Substitui luiza_reclamacoes do n8n.';
select alavanca.proteger_tabela('alavanca.reclamacoes');
select alavanca.trigger_atualizado_em('alavanca.reclamacoes');
create index if not exists ix_reclamacoes_status on alavanca.reclamacoes (tenant_id, status, criado_em desc);

commit;
