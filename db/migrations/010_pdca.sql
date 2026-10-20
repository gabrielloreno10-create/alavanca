-- 010_pdca.sql
-- Ciclo PDCA da midia: relatorio do dia, violacoes de guardrail e as decisoes
-- tomadas em cima delas.
--
-- Hoje isso vive em arquivos: pdca/relatorios/AAAA-MM-DD.json (check.py) e
-- REGISTRO_DECISOES.md (act.py). Aqui vira tabela, com tres niveis separados:
--
--   pdca_relatorios - o retrato do dia (gasto, compras, roas, por hora, por
--                     conjunto, combustivel). Fica em jsonb porque o formato
--                     ainda muda; as colunas de cima sao as que o painel le.
--   pdca_violacoes  - uma linha por guardrail furado, com gravidade e a acao
--                     sugerida ('pausar' | 'revisar' | 'alertar').
--   pdca_decisoes   - o que foi DECIDIDO. Separado da violacao de proposito:
--                     o robo acusa, a pessoa decide, e as duas coisas ficam
--                     registradas com autor e horario.
--
-- Idempotente.

begin;

-- ---------------------------------------------------------------------------
-- pdca_relatorios
-- ---------------------------------------------------------------------------
create table if not exists alavanca.pdca_relatorios (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  data      date not null,
  gerado_em timestamptz not null default now(),

  -- resumo do dia, nas colunas que o painel realmente le
  gasto        numeric(14,2) not null default 0,
  compras      numeric(14,2) not null default 0,
  receita      numeric(14,2) not null default 0,
  roas         numeric(10,4),
  cpa          numeric(12,2),
  gasto_fora_da_janela numeric(14,2) not null default 0,

  -- o resto do retrato, do jeito que o check.py produz
  janela_do_dia    jsonb,
  por_marca        jsonb,
  semana           jsonb,
  por_hora         jsonb,
  conjuntos_dia    jsonb,
  conjuntos_semana jsonb,
  combustivel      jsonb,   -- saldo, spend_cap, folga e queima de cada voo
  bruto            jsonb,   -- o json inteiro, para nao perder nada

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, data)
);
comment on table alavanca.pdca_relatorios is 'Retrato diario do PDCA de midia. Um por tenant por dia. Substitui pdca/relatorios/AAAA-MM-DD.json.';
select alavanca.proteger_tabela('alavanca.pdca_relatorios');
select alavanca.trigger_atualizado_em('alavanca.pdca_relatorios');
create index if not exists ix_pdca_rel_data on alavanca.pdca_relatorios (tenant_id, data desc);

-- ---------------------------------------------------------------------------
-- pdca_violacoes
-- ---------------------------------------------------------------------------
create table if not exists alavanca.pdca_violacoes (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references alavanca.tenants(id) on delete cascade,
  relatorio_id uuid references alavanca.pdca_relatorios(id) on delete cascade,
  marca_id     uuid references alavanca.marcas(id) on delete set null,
  flight_id    uuid references alavanca.flights(id) on delete set null,

  data  date not null,
  tipo  text not null,   -- 'gasto_sem_compra' | 'gasto_sem_visita' | 'cpa_alto' |
                         -- 'roas_abaixo_do_corte' | 'gasto_fora_da_janela' |
                         -- 'gasto_em_dia_sem_midia' | 'marca_sem_conversao_medida' | ...
  gravidade text not null check (gravidade in ('critica', 'alta', 'media', 'baixa')),
  acao      text not null check (acao in ('pausar', 'revisar', 'alertar')),

  external_adset_id text,
  nome      text,
  mensagem  text not null,
  detalhe   jsonb not null default '{}'::jsonb,

  -- quando a violacao foi rebaixada por uma excecao vigente
  rebaixada_por_excecao uuid references alavanca.guardrail_excecoes(id) on delete set null,
  resolvido_em timestamptz,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now()
);
comment on table alavanca.pdca_violacoes is 'Um guardrail furado. "acao" e a sugestao do robo, nao a decisao: a decisao esta em pdca_decisoes.';
select alavanca.proteger_tabela('alavanca.pdca_violacoes');
create index if not exists ix_pdca_viol_data on alavanca.pdca_violacoes (tenant_id, data desc, gravidade);

-- ---------------------------------------------------------------------------
-- pdca_decisoes
-- ---------------------------------------------------------------------------
create table if not exists alavanca.pdca_decisoes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id    uuid references alavanca.marcas(id) on delete set null,
  violacao_id uuid references alavanca.pdca_violacoes(id) on delete set null,
  flight_id   uuid references alavanca.flights(id) on delete set null,

  data     date not null,
  decisao  text not null,   -- o que foi decidido, em portugues
  tipo     text not null check (tipo in ('pausar', 'religar', 'ajustar_orcamento',
                                         'trocar_publico', 'criar_excecao', 'ignorar', 'outro')),
  motivo   text,
  decidido_por text not null,     -- 'robo' | 'Helio' | 'Gabriel' | ...
  aprovado_por text,              -- quem autorizou, quando a acao precisa de aprovacao
  executado_em timestamptz,
  resultado    text,
  payload      jsonb not null default '{}'::jsonb,

  -- Repetir o mesmo act.py no mesmo dia nao cria decisao duplicada.
  chave_idempotencia text not null,

  origem      alavanca.origem_dado not null,
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  unique (tenant_id, chave_idempotencia)
);
comment on table alavanca.pdca_decisoes is 'Decisao tomada em cima de uma violacao. Substitui o REGISTRO_DECISOES.md, com autor e horario.';
select alavanca.proteger_tabela('alavanca.pdca_decisoes');
create index if not exists ix_pdca_dec_data on alavanca.pdca_decisoes (tenant_id, data desc);

commit;
