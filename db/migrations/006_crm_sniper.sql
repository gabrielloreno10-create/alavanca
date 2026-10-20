-- 006_crm_sniper.sql
-- CRM: segmentos, lotes de disparo e envios.
--
-- Tabelas:
--   crm_segmento        - definicao do segmento e o retrato mais recente dele
--   crm_segmento_snapshot - o retrato por data (para a tela de CRM comparar periodos)
--   sniper_lotes        - um lote de disparo (substitui sniper_fila agrupada por lote)
--   sniper_envios       - UMA LINHA POR ENVIO, com chave de idempotencia
--
-- Por que uma linha por envio com chave de idempotencia: hoje a sniper_fila
-- mistura fila e resultado, e reexecutar o workflow pode mandar duas vezes para
-- a mesma pessoa. Aqui a chave e unica por tenant: o segundo insert bate no
-- indice em vez de virar mensagem.
--
-- O opt-out nao mora aqui. Ele e uma linha em consents com estado 'opt_out'.
-- A view vw_sniper_elegivel ja aplica isso.
--
-- Idempotente.

begin;

-- ---------------------------------------------------------------------------
-- crm_segmento
-- ---------------------------------------------------------------------------
create table if not exists alavanca.crm_segmento (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id  uuid references alavanca.marcas(id) on delete cascade,
  codigo    text not null,            -- Segmento.id do painel ("novos", "em-risco")
  nome      text not null,            -- Segmento.nome
  criterio  text not null,            -- Segmento.criterio, em portugues, para a tela
  regra     jsonb not null default '{}'::jsonb,  -- a mesma regra em forma executavel
  acao_sugerida text,                 -- Segmento.acao
  ordem     smallint not null default 0,
  ativo     boolean not null default true,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, codigo)
);
comment on table alavanca.crm_segmento is 'Definicao de um segmento de CRM. O tamanho dele por data esta em crm_segmento_snapshot.';
select alavanca.proteger_tabela('alavanca.crm_segmento');
select alavanca.trigger_atualizado_em('alavanca.crm_segmento');

create table if not exists alavanca.crm_segmento_snapshot (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references alavanca.tenants(id) on delete cascade,
  segmento_id uuid not null references alavanca.crm_segmento(id) on delete cascade,
  data        date not null,
  clientes    integer not null default 0 check (clientes >= 0),   -- Segmento.clientes
  com_opt_in  integer not null default 0 check (com_opt_in >= 0), -- Segmento.comOptIn
  valor_90d   numeric(14,2) not null default 0,                   -- Segmento.valor90d

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  unique (tenant_id, segmento_id, data),
  check (com_opt_in <= clientes)
);
comment on table alavanca.crm_segmento_snapshot is 'Retrato diario de um segmento. E daqui que sai o bloco "base" da tela de CRM.';
select alavanca.proteger_tabela('alavanca.crm_segmento_snapshot');

-- ---------------------------------------------------------------------------
-- sniper_lotes
-- ---------------------------------------------------------------------------
create table if not exists alavanca.sniper_lotes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id    uuid not null references alavanca.marcas(id) on delete cascade,
  segmento_id uuid references alavanca.crm_segmento(id) on delete set null,

  nome   text not null,
  motor  text not null default 'recompra'
    check (motor in ('recompra', 'reativacao', 'boas_vindas', 'lancamento', 'oferta', 'manual')),

  template_nome   text,        -- nome do template aprovado no provedor
  template_corpo  text not null,  -- texto com placeholders, do jeito que vai para a pessoa
  variaveis       jsonb not null default '{}'::jsonb,

  status text not null default 'rascunho'
    check (status in ('rascunho', 'agendado', 'enviando', 'concluido', 'cancelado', 'falhou')),

  agendado_para      timestamptz,
  janela_hora_inicio smallint check (janela_hora_inicio between 0 and 23),
  janela_hora_fim    smallint check (janela_hora_fim between 0 and 23),
  total_alvo         integer not null default 0 check (total_alvo >= 0),
  custo_por_mensagem numeric(10,4) not null default 0,

  -- Exigencia de consentimento deste lote. Marketing nunca deve rodar com
  -- 'legado_sem_registro' sem decisao escrita do dono.
  exige_consentimento boolean not null default true,
  finalidade text not null default 'marketing' check (finalidade in ('transacional', 'marketing', 'pesquisa')),

  iniciado_em  timestamptz,
  concluido_em timestamptz,
  criado_por   text,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table alavanca.sniper_lotes is 'Um disparo de CRM. Vira a linha "Disparo" da tela de CRM quando concluido.';
select alavanca.proteger_tabela('alavanca.sniper_lotes');
select alavanca.trigger_atualizado_em('alavanca.sniper_lotes');
create index if not exists ix_lotes_tenant_data on alavanca.sniper_lotes (tenant_id, agendado_para desc);

-- ---------------------------------------------------------------------------
-- sniper_envios: uma linha por envio
-- ---------------------------------------------------------------------------
create table if not exists alavanca.sniper_envios (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references alavanca.tenants(id) on delete cascade,
  lote_id     uuid not null references alavanca.sniper_lotes(id) on delete cascade,
  customer_id uuid not null references alavanca.customers(id) on delete cascade,
  telefone_e164 alavanca.telefone_e164 not null,  -- congelado no momento do envio

  -- Chave que impede mandar duas vezes. Sugestao de formato:
  --   '<lote_id>:<telefone_e164>'
  chave_idempotencia text not null,

  status text not null default 'pendente' check (status in (
    'pendente',
    'enviado',
    'entregue',
    'lido',
    'falhou',
    'bloqueado_consentimento',  -- nao saiu porque nao havia opt-in
    'bloqueado_janela',         -- fora da janela permitida
    'cancelado'
  )),

  corpo_enviado  text,
  external_msg_id text,
  erro_detalhe   text,
  enviado_em     timestamptz,
  entregue_em    timestamptz,
  respondeu_em   timestamptz,
  order_id       uuid references alavanca.orders(id) on delete set null,  -- pedido atribuido ao disparo
  custo          numeric(10,4),

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, chave_idempotencia),
  unique (lote_id, customer_id)
);
comment on table alavanca.sniper_envios is
  'Uma linha por envio. chave_idempotencia e unica por tenant: reexecutar o worker nao manda a mensagem de novo.';
select alavanca.proteger_tabela('alavanca.sniper_envios');
select alavanca.trigger_atualizado_em('alavanca.sniper_envios');
create index if not exists ix_envios_lote   on alavanca.sniper_envios (tenant_id, lote_id, status);
create index if not exists ix_envios_cliente on alavanca.sniper_envios (tenant_id, customer_id, enviado_em desc);

-- ---------------------------------------------------------------------------
-- vw_sniper_elegivel: quem pode receber marketing no WhatsApp, hoje
-- ---------------------------------------------------------------------------
create or replace view alavanca.vw_sniper_elegivel
with (security_invoker = true) as
select
  c.tenant_id,
  c.id as customer_id,
  c.telefone_e164,
  c.segmento,
  c.ultimo_pedido_em,
  co.estado as estado_consentimento
from alavanca.customers c
left join alavanca.vw_consentimento_atual co
  on co.customer_id = c.id
 and co.tenant_id   = c.tenant_id
 and co.canal       = 'whatsapp'
 and co.finalidade  = 'marketing'
where coalesce(co.pode_receber, false) = true
  and c.suspeito = false;
comment on view alavanca.vw_sniper_elegivel is
  'Clientes com opt-in vigente para marketing no WhatsApp. Quem esta como legado_sem_registro NAO aparece aqui.';
grant select on alavanca.vw_sniper_elegivel to alavanca_app;

commit;
