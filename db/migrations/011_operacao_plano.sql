-- 011_operacao_plano.sql
-- O que o operador (robo ou gente) fez, e o plano de acao do consultor.
--
-- Tabelas:
--   acoes_operador - log do que foi EXECUTADO no mundo (pausar conjunto,
--                    disparar lote, mudar preco). Append-only, com chave de
--                    idempotencia e o estado antes/depois.
--   plano_acao     - as acoes do plano por pilar (AcaoPlano do painel)
--   acao_sugerida  - o catalogo de acoes por tipo de alerta (Plano.acoesPorAlerta
--                    e Plano.acoesPadrao do painel)
--
-- A diferenca entre acoes_operador e pdca_decisoes: decisao e intencao
-- registrada; acao de operador e o efeito colateral que de fato saiu da
-- plataforma. Uma decisao pode gerar zero, uma ou varias acoes.
--
-- Idempotente.

begin;

-- ---------------------------------------------------------------------------
-- acoes_operador
-- ---------------------------------------------------------------------------
create table if not exists alavanca.acoes_operador (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id  uuid references alavanca.marcas(id) on delete set null,

  ator       text not null check (ator in ('robo', 'operador', 'dono', 'sistema')),
  usuario_id uuid,     -- FK adicionada em 012, depois que usuarios existe
  tipo_acao  text not null,  -- 'pausar_conjunto' | 'disparar_lote' | 'ajustar_orcamento' |
                             -- 'alterar_preco' | 'importar_arquivo' | 'enviar_relatorio' | ...

  alvo_tipo  text,     -- 'flight' | 'sniper_lote' | 'ficha_tecnica' | 'canal' | ...
  alvo_id    uuid,
  alvo_externo text,   -- id do objeto no sistema de fora (adset_id, por exemplo)

  descricao  text not null,
  estado_antes  jsonb,
  estado_depois jsonb,

  decisao_id uuid references alavanca.pdca_decisoes(id) on delete set null,
  resultado  text not null default 'ok' check (resultado in ('ok', 'falhou', 'parcial', 'simulado')),
  erro       text,

  -- Reexecutar o worker nao repete a acao no mundo.
  chave_idempotencia text not null,
  ocorrido_em timestamptz not null default now(),

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  unique (tenant_id, chave_idempotencia)
);
comment on table alavanca.acoes_operador is
  'Log append-only do que a plataforma executou no mundo. Nunca faca UPDATE: corrigir e inserir outra linha.';
select alavanca.proteger_tabela('alavanca.acoes_operador');
create index if not exists ix_acoes_op_data on alavanca.acoes_operador (tenant_id, ocorrido_em desc);
create index if not exists ix_acoes_op_alvo on alavanca.acoes_operador (tenant_id, alvo_tipo, alvo_id);

-- ---------------------------------------------------------------------------
-- plano_acao
-- ---------------------------------------------------------------------------
create table if not exists alavanca.plano_acao (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id  uuid references alavanca.marcas(id) on delete cascade,
  codigo    text not null,              -- AcaoPlano.id ("a01")

  pilar     alavanca.pilar not null,    -- AcaoPlano.pilar
  acao      text not null,              -- AcaoPlano.acao
  responsavel text,                     -- AcaoPlano.responsavel
  prazo     date,                       -- AcaoPlano.prazo
  situacao  text not null default 'a_fazer'
    check (situacao in ('a_fazer', 'fazendo', 'feito', 'cancelada')),
  resultado_esperado_mes numeric(14,2) not null default 0,  -- em R$ de margem/mes
  resultado_real_mes     numeric(14,2),
  concluida_em timestamptz,
  nota      text,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, codigo)
);
comment on table alavanca.plano_acao is 'Acao do plano do consultor, por pilar. AcaoPlano do painel.';
select alavanca.proteger_tabela('alavanca.plano_acao');
select alavanca.trigger_atualizado_em('alavanca.plano_acao');
create index if not exists ix_plano_acao_situacao on alavanca.plano_acao (tenant_id, situacao, prazo);

-- ---------------------------------------------------------------------------
-- acao_sugerida: o catalogo "quando der este alerta, faca isto"
-- ---------------------------------------------------------------------------
create table if not exists alavanca.acao_sugerida (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id  uuid references alavanca.marcas(id) on delete cascade,
  -- 'padrao' = Plano.acoesPadrao; os outros = chaves de Plano.acoesPorAlerta
  gatilho   text not null check (gatilho in ('meta', 'margem', 'pedidos', 'ifood', 'ticket', 'padrao')),
  ordem     smallint not null default 0,
  texto     text not null,
  ativo     boolean not null default true,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, gatilho, texto)
);
comment on table alavanca.acao_sugerida is
  'Catalogo de acoes por tipo de alerta. Alimenta as 3 acoes da comanda do dia (Plano.acoesPorAlerta e acoesPadrao).';
select alavanca.proteger_tabela('alavanca.acao_sugerida');
select alavanca.trigger_atualizado_em('alavanca.acao_sugerida');

-- ---------------------------------------------------------------------------
-- comanda_dia: a comanda emitida, congelada
-- ---------------------------------------------------------------------------
-- Guardar a comanda emitida (e nao so recalcular) e o que permite responder
-- "o que a gente mandou para o dono naquele dia" seis meses depois.
create table if not exists alavanca.comanda_dia (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id  uuid references alavanca.marcas(id) on delete cascade,
  data      date not null,
  numero    integer,
  emitida_em timestamptz not null default now(),

  faturamento numeric(14,2) not null default 0,
  pedidos     integer not null default 0,
  ticket      numeric(12,2),
  cmv         numeric(14,2),
  margem      numeric(14,2),
  margem_pct  numeric(8,6),
  meta        numeric(14,2),
  meta_pct    numeric(8,6),
  situacao_meta text check (situacao_meta in ('bom', 'atencao', 'alerta')),

  alerta_tipo  text check (alerta_tipo in ('meta', 'margem', 'pedidos', 'ifood', 'ticket', 'nenhum')),
  alerta_texto text,
  acoes        jsonb not null default '[]'::jsonb,
  mensagem     text,     -- o texto exato mandado no WhatsApp
  enviada_em   timestamptz,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now()
);
comment on table alavanca.comanda_dia is 'A comanda do dia como foi emitida. Congelada: nao recalcular em cima dela.';
select alavanca.proteger_tabela('alavanca.comanda_dia');
-- marca_id NULL = comanda do grupo inteiro; uma por dia em cada nivel.
create unique index if not exists ux_comanda_dia
  on alavanca.comanda_dia (tenant_id, coalesce(marca_id, '00000000-0000-0000-0000-000000000000'::uuid), data);

commit;
