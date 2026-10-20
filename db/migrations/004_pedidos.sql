-- 004_pedidos.sql
-- Pedido, itens do pedido e evidencia de pagamento.
--
-- Decisao travada que manda nesta migration: PAGAMENTO NUNCA E INFERIDO.
-- Por isso a tabela orders nao tem coluna "pago". O que existe e:
--   - orders.rotulo_pagamento_externo e orders.status_externo: o texto cru que
--     a fonte mandou ("PIX Online", "Entregue"). Rotulo, nao fato.
--   - payment_evidence: uma linha por evidencia, com o TIPO da evidencia, a
--     FORCA dela e a FONTE. O rotulo do Cliente Fiel entra como forca 'fraca'.
--   - vw_pedido_pagamento: resolve "este pedido esta pago?" olhando a
--     evidencia mais forte. Quem decide o corte e quem consulta, nao o banco.
--
-- external_id e unico por fonte dentro do tenant: a mesma venda importada duas
-- vezes do mesmo lugar nao vira dois pedidos.
--
-- Idempotente.

begin;

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table if not exists alavanca.orders (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id    uuid not null references alavanca.marcas(id) on delete cascade,
  canal_id    uuid references alavanca.canais(id) on delete set null,
  customer_id uuid references alavanca.customers(id) on delete set null,

  source      alavanca.fonte_pedido not null,  -- cliente_fiel_site | luiza | ifood | saipos
  external_id text not null,                   -- id do pedido na fonte

  ocorrido_em timestamptz not null,            -- quando o pedido aconteceu
  data        date not null,                   -- dia de negocio (fuso do tenant); e por ele que o painel agrupa
  dia_semana  smallint generated always as (extract(dow from data)::smallint) stored,

  valor_total    numeric(14,2) not null default 0 check (valor_total >= 0),
  valor_itens    numeric(14,2),
  valor_entrega  numeric(14,2),
  valor_desconto numeric(14,2),
  valor_liquido  numeric(14,2),  -- depois da comissao do canal, quando a fonte informa

  -- TEXTO CRU DA FONTE. Nao e conclusao sobre pagamento nem sobre entrega.
  status_externo             text,
  rotulo_pagamento_externo   text,
  cancelado                  boolean not null default false,

  bairro      text,
  observacao  text,
  payload     jsonb not null default '{}'::jsonb,  -- linha original da fonte, para auditoria

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, source, external_id)
);
comment on table alavanca.orders is 'Pedido individual. Nao tem coluna "pago": pagamento so existe como evidencia (payment_evidence).';
comment on column alavanca.orders.rotulo_pagamento_externo is
  'Texto cru da fonte, ex.: "PIX Online" do Cliente Fiel. E rotulo, nao prova de pagamento.';
comment on column alavanca.orders.data is 'Dia de negocio no fuso do tenant. E a coluna que casa com venda_dia.data.';
select alavanca.proteger_tabela('alavanca.orders');
select alavanca.trigger_atualizado_em('alavanca.orders');
create index if not exists ix_orders_tenant_data     on alavanca.orders (tenant_id, data);
create index if not exists ix_orders_tenant_customer on alavanca.orders (tenant_id, customer_id, data desc);
create index if not exists ix_orders_canal_data      on alavanca.orders (tenant_id, canal_id, data);

-- ---------------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------------
create table if not exists alavanca.order_items (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  order_id  uuid not null references alavanca.orders(id) on delete cascade,
  ficha_id  uuid references alavanca.ficha_tecnica(id) on delete set null,

  linha           smallint not null default 1,
  nome_item       text not null,         -- como veio da fonte, mesmo sem ficha casada
  qtd             numeric(12,3) not null default 1 check (qtd > 0),
  preco_unitario  numeric(12,2) not null default 0,
  custo_unitario  numeric(12,2),         -- snapshot do custo da ficha na hora do pedido
  desconto        numeric(12,2),
  observacao      text,
  adicionais      jsonb not null default '[]'::jsonb,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  unique (tenant_id, order_id, linha)
);
comment on table alavanca.order_items is 'Item de um pedido. ficha_id pode ser NULL quando o nome da fonte ainda nao casou com nenhuma ficha.';
select alavanca.proteger_tabela('alavanca.order_items');
create index if not exists ix_order_items_order on alavanca.order_items (tenant_id, order_id);
create index if not exists ix_order_items_ficha on alavanca.order_items (tenant_id, ficha_id);

-- ---------------------------------------------------------------------------
-- payment_evidence
-- ---------------------------------------------------------------------------
create table if not exists alavanca.payment_evidence (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  order_id  uuid not null references alavanca.orders(id) on delete cascade,

  tipo_evidencia text not null check (tipo_evidencia in (
    'rotulo_canal',          -- "PIX Online" + "Entregue" do Cliente Fiel: so um rotulo
    'comprovante_cliente',   -- print que o cliente mandou
    'webhook_gateway',       -- callback do gateway (Pix, cartao)
    'extrato_bancario',      -- linha conferida no extrato
    'repasse_marketplace',   -- repasse do iFood no financeiro do parceiro
    'baixa_no_pdv',          -- baixa manual no Saipos
    'confirmacao_humana'     -- alguem do restaurante confirmou na mao
  )),

  -- A forca e do TIPO de evidencia, nao do valor. Rotulo de canal e sempre fraca.
  forca text not null check (forca in ('fraca', 'media', 'forte')),

  valor       numeric(14,2),
  moeda       text not null default 'BRL',
  ocorrido_em timestamptz not null,
  detalhe     jsonb not null default '{}'::jsonb,
  conferido_por text,

  -- Reimportar a mesma evidencia nao duplica linha.
  chave_idempotencia text not null,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  unique (tenant_id, chave_idempotencia),
  -- rotulo de canal nunca pode entrar como evidencia forte
  constraint payment_evidence_rotulo_e_fraco
    check (tipo_evidencia <> 'rotulo_canal' or forca = 'fraca')
);
comment on table alavanca.payment_evidence is
  'Evidencia de pagamento de um pedido. Varias linhas por pedido. O rotulo do Cliente Fiel entra aqui como forca fraca, nunca como "pago".';
select alavanca.proteger_tabela('alavanca.payment_evidence');
create index if not exists ix_payment_evidence_order on alavanca.payment_evidence (tenant_id, order_id);

-- ---------------------------------------------------------------------------
-- vw_pedido_pagamento
-- ---------------------------------------------------------------------------
-- Resolve "qual a melhor evidencia que existe para este pedido". Nao decide se
-- o pedido esta pago: devolve a forca maxima e quem consulta aplica a regra.
create or replace view alavanca.vw_pedido_pagamento
with (security_invoker = true) as
select
  o.tenant_id,
  o.id as order_id,
  o.valor_total,
  coalesce(max(case e.forca when 'forte' then 3 when 'media' then 2 when 'fraca' then 1 end), 0) as forca_max,
  case coalesce(max(case e.forca when 'forte' then 3 when 'media' then 2 when 'fraca' then 1 end), 0)
    when 3 then 'forte' when 2 then 'media' when 1 then 'fraca' else 'sem_evidencia'
  end as melhor_evidencia,
  sum(e.valor) filter (where e.forca = 'forte') as valor_evidencia_forte,
  count(e.id) as qtd_evidencias,
  max(e.ocorrido_em) as ultima_evidencia_em
from alavanca.orders o
left join alavanca.payment_evidence e
  on e.order_id = o.id and e.tenant_id = o.tenant_id
group by o.tenant_id, o.id, o.valor_total;
comment on view alavanca.vw_pedido_pagamento is
  'Melhor evidencia de pagamento por pedido. "sem_evidencia" e o padrao; o painel nunca deve chamar um pedido de pago com forca fraca.';
grant select on alavanca.vw_pedido_pagamento to alavanca_app;

commit;
