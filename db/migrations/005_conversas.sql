-- 005_conversas.sql
-- Conversa do vendedor IA no WhatsApp.
--
-- Tabelas:
--   conversation_state - o estado vivo de uma conversa (substitui conversa_estado do n8n)
--   messages           - o historico de mensagens (substitui n8n_chat_histories)
--
-- Hoje o n8n guarda a memoria do chat em n8n_chat_histories, com session_id no
-- formato "letre_{telefone}_chats" / "jerrys_{telefone}_chats". Aqui isso vira
-- dado estruturado: a marca sai do prefixo, o telefone vira customer_id.
--
-- Idempotente.

begin;

-- ---------------------------------------------------------------------------
-- conversation_state
-- ---------------------------------------------------------------------------
create table if not exists alavanca.conversation_state (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id    uuid not null references alavanca.marcas(id) on delete cascade,
  customer_id uuid references alavanca.customers(id) on delete set null,

  canal   text not null default 'whatsapp' check (canal in ('whatsapp', 'instagram', 'site')),
  chat_id text not null,                 -- session_id da fonte ("letre_5531...._chats")

  estagio text not null default 'navegando',
  ultimo_item_mencionado text,
  ultimo_inbound_em  timestamptz,
  ultimo_outbound_em timestamptz,
  followup_count     integer not null default 0 check (followup_count >= 0),
  followup_ultimo_em timestamptz,
  pedido_confirmado  boolean not null default false,
  order_id           uuid references alavanca.orders(id) on delete set null,

  -- 'pedido' | 'sem_pedido' | 'humano' | 'recuperado' (Conversa.desfecho do painel)
  desfecho text check (desfecho in ('pedido', 'sem_pedido', 'humano', 'recuperado')),
  transferida_em     timestamptz,
  motivo_transferencia text,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  iniciada_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, chat_id)
);
comment on table alavanca.conversation_state is 'Estado vivo de uma conversa do vendedor IA. Uma linha por chat_id.';
select alavanca.proteger_tabela('alavanca.conversation_state');
select alavanca.trigger_atualizado_em('alavanca.conversation_state');
create index if not exists ix_conv_customer on alavanca.conversation_state (tenant_id, customer_id);
create index if not exists ix_conv_iniciada on alavanca.conversation_state (tenant_id, iniciada_em desc);

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create table if not exists alavanca.messages (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references alavanca.tenants(id) on delete cascade,
  conversation_id uuid not null references alavanca.conversation_state(id) on delete cascade,

  autor    text not null check (autor in ('cliente', 'ia', 'humano', 'sistema')),
  direcao  text not null check (direcao in ('inbound', 'outbound')),
  texto    text,
  midia    jsonb,
  payload  jsonb not null default '{}'::jsonb,  -- mensagem crua do provedor

  external_id text,        -- id da mensagem no provedor, quando existe
  template_nome text,      -- quando foi template aprovado
  ocorrido_em timestamptz not null,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  -- autor e direcao tem que combinar: cliente so manda inbound
  constraint messages_autor_direcao check (
    (autor = 'cliente' and direcao = 'inbound')
    or (autor in ('ia', 'humano', 'sistema'))
  )
);
comment on table alavanca.messages is 'Mensagem de uma conversa. Substitui n8n_chat_histories, com marca e cliente ja resolvidos.';
select alavanca.proteger_tabela('alavanca.messages');
create index if not exists ix_messages_conv on alavanca.messages (tenant_id, conversation_id, ocorrido_em);
create unique index if not exists ux_messages_external
  on alavanca.messages (tenant_id, external_id) where external_id is not null;

commit;
