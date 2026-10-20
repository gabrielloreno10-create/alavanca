-- 012_acesso_integracoes.sql
-- Autenticacao do painel e configuracao de integracao.
--
-- Papeis:
--   platform_admin    - time Tapaggo. Pode entrar em qualquer tenant.
--   dono_restaurante  - dono do grupo. Ve tudo do tenant dele.
--   operador          - gerente/consultor. Ve tudo do tenant, mas nao mexe em
--                       cadastro, integracao nem usuario.
--
-- Por que usuarios e papeis NAO tem tenant_id:
--   um platform_admin nao pertence a tenant nenhum, e um dia um consultor pode
--   atender dois grupos. O vinculo mora em usuario_tenant, que e a tabela
--   tenant-scoped. usuarios e papeis ficam fora da RLS por tenant e sao
--   protegidos por grant (a app so le o que precisa para o login).
--
-- Segredo NUNCA em claro:
--   integracao_config.segredo_ref aponta para o cofre ('env:NOME_DA_VARIAVEL'
--   ou 'vault://caminho'). Se um dia o valor for guardado no banco, ele entra
--   em segredo_cifrado (bytea) com a chave identificada em cifra_kid - e a
--   CHECK recusa guardar valor em claro dentro de config.
--
-- Idempotente.

begin;

-- ---------------------------------------------------------------------------
-- papeis (catalogo global)
-- ---------------------------------------------------------------------------
create table if not exists alavanca.papeis (
  chave      text primary key check (chave in ('platform_admin', 'dono_restaurante', 'operador')),
  nome       text not null,
  descricao  text not null,
  permissoes jsonb not null default '{}'::jsonb,
  criado_em  timestamptz not null default now()
);
comment on table alavanca.papeis is 'Catalogo de papeis. Global: nao tem tenant_id e nao tem RLS por tenant.';
grant select on alavanca.papeis to alavanca_app;

insert into alavanca.papeis (chave, nome, descricao, permissoes) values
  ('platform_admin', 'Administrador da plataforma',
   'Time da Tapaggo. Entra em qualquer tenant, roda importacao e mexe em integracao.',
   '{"trocar_tenant": true, "gerir_integracao": true, "gerir_usuario": true, "importar": true, "executar_acao": true}'),
  ('dono_restaurante', 'Dono do restaurante',
   'Dono do grupo. Ve tudo do tenant dele e aprova as acoes que precisam de aprovacao.',
   '{"trocar_tenant": false, "gerir_integracao": true, "gerir_usuario": true, "importar": false, "executar_acao": true}'),
  ('operador', 'Operador',
   'Gerente ou consultor. Ve tudo do tenant e executa o dia a dia, sem mexer em cadastro, integracao ou usuario.',
   '{"trocar_tenant": false, "gerir_integracao": false, "gerir_usuario": false, "importar": false, "executar_acao": true}')
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------------
-- usuarios (global)
-- ---------------------------------------------------------------------------
create table if not exists alavanca.usuarios (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  nome       text not null,
  -- hash da senha (argon2id ou bcrypt). Nunca senha em claro, nunca em migration.
  senha_hash text,
  -- quando o login e por provedor externo
  provedor_externo text,
  sub_externo      text,
  -- referencia ao segredo do 2FA no cofre, nunca o segredo
  mfa_segredo_ref  text,

  ativo        boolean not null default true,
  ultimo_login_em timestamptz,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint usuarios_tem_credencial check (senha_hash is not null or sub_externo is not null)
);
comment on table alavanca.usuarios is 'Usuario do painel. Global: um platform_admin nao pertence a tenant nenhum.';
comment on column alavanca.usuarios.senha_hash is 'Hash, nunca senha. Nenhum valor e semeado por migration.';
create unique index if not exists ux_usuarios_email on alavanca.usuarios (lower(email));
create unique index if not exists ux_usuarios_externo
  on alavanca.usuarios (provedor_externo, sub_externo) where sub_externo is not null;
select alavanca.trigger_atualizado_em('alavanca.usuarios');
grant select, insert, update on alavanca.usuarios to alavanca_app;

-- ---------------------------------------------------------------------------
-- usuario_tenant: o vinculo, e e aqui que o papel vale
-- ---------------------------------------------------------------------------
create table if not exists alavanca.usuario_tenant (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references alavanca.tenants(id) on delete cascade,
  usuario_id uuid not null references alavanca.usuarios(id) on delete cascade,
  papel      text not null references alavanca.papeis(chave),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, usuario_id)
);
comment on table alavanca.usuario_tenant is 'Qual usuario acessa qual tenant, e com que papel.';
select alavanca.trigger_atualizado_em('alavanca.usuario_tenant');

-- Policy propria: alem do tenant do request, o usuario precisa poder listar os
-- tenants DELE antes de escolher um (senao o login nao tem como comecar).
alter table alavanca.usuario_tenant enable row level security;
alter table alavanca.usuario_tenant force row level security;
drop policy if exists tenant_isolado on alavanca.usuario_tenant;
create policy tenant_isolado on alavanca.usuario_tenant
  using (tenant_id = alavanca.tenant_atual() or usuario_id = alavanca.usuario_atual())
  with check (tenant_id = alavanca.tenant_atual());
grant select, insert, update, delete on alavanca.usuario_tenant to alavanca_app;
create index if not exists ix_usuario_tenant_usuario on alavanca.usuario_tenant (usuario_id);

-- FK que ficou pendente em 011 (acoes_operador criada antes de usuarios).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'acoes_operador_usuario_fk'
  ) then
    alter table alavanca.acoes_operador
      add constraint acoes_operador_usuario_fk
      foreign key (usuario_id) references alavanca.usuarios(id) on delete set null;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- integracao_config
-- ---------------------------------------------------------------------------
create table if not exists alavanca.integracao_config (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,
  marca_id  uuid references alavanca.marcas(id) on delete cascade,

  tipo     text not null check (tipo in (
    'whatsapp', 'ifood', 'cliente_fiel', 'saipos', 'meta_ads',
    'google_ads', 'instagram', 'pagamento', 'llm', 'email', 'outro'
  )),
  provider text not null,   -- 'waha' | 'whatsapp_cloud_api' | 'evolution' | 'anthropic' | ...
  rotulo   text,
  ativo    boolean not null default false,

  -- Config NAO SECRETA: numero, id de conta, dominio, nomes de template.
  config jsonb not null default '{}'::jsonb,

  -- O segredo NUNCA fica aqui em claro. segredo_ref aponta para o cofre:
  --   'env:ALAVANCA_WA_TOKEN'  |  'vault://alavanca/letre/whatsapp'
  segredo_ref     text,
  -- Alternativa: ciphertext no banco, com a chave identificada fora dele.
  segredo_cifrado bytea,
  cifra_kid       text,
  segredo_rodado_em timestamptz,

  ultimo_ok_em    timestamptz,
  ultimo_erro     text,
  ultimo_erro_em  timestamptz,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  -- nenhuma chave com cara de segredo pode estar no jsonb de config
  constraint integracao_sem_segredo_em_claro check (
    not (config ?| array['token','senha','password','secret','api_key','apikey',
                         'access_token','refresh_token','client_secret','private_key'])
  ),
  -- ciphertext sempre com a chave identificada
  constraint integracao_cifra_identificada check (
    segredo_cifrado is null or cifra_kid is not null
  ),
  -- integracao ligada precisa ter de onde tirar o segredo
  constraint integracao_ativa_tem_segredo check (
    ativo = false or segredo_ref is not null or segredo_cifrado is not null
  )
);
comment on table alavanca.integracao_config is
  'Configuracao de integracao por tenant. Segredo so por referencia ao cofre (segredo_ref) ou cifrado (segredo_cifrado). Valor em claro e recusado pela CHECK.';
select alavanca.proteger_tabela('alavanca.integracao_config');
select alavanca.trigger_atualizado_em('alavanca.integracao_config');
create unique index if not exists ux_integracao_tenant_tipo
  on alavanca.integracao_config (
    tenant_id, tipo, provider,
    coalesce(marca_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- ---------------------------------------------------------------------------
-- importacao_lote: rastro de cada arquivo/puxada que entrou no banco
-- ---------------------------------------------------------------------------
-- E o que permite responder "de onde veio esta linha" e refazer uma importacao
-- sem duplicar. O importador cria o lote antes e carimba lote_id no payload.
create table if not exists alavanca.importacao_lote (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references alavanca.tenants(id) on delete cascade,

  tipo       text not null,   -- 'saipos_faturamento_diario' | 'ifood_fechamento' | 'meta_ads_mensal' | ...
  fonte      text not null,   -- descricao legivel, vai parar na coluna "fonte" das linhas
  arquivo    text,            -- nome do arquivo de origem, sem caminho absoluto
  arquivo_hash text,          -- sha256 do conteudo: reimportar o mesmo arquivo e detectavel
  periodo_inicio date,
  periodo_fim    date,

  status text not null default 'rodando'
    check (status in ('rodando', 'concluido', 'falhou', 'parcial')),
  linhas_lidas    integer not null default 0,
  linhas_gravadas integer not null default 0,
  linhas_ignoradas integer not null default 0,
  erros   jsonb not null default '[]'::jsonb,

  origem      alavanca.origem_dado not null,
  coletado_em timestamptz not null default now(),
  iniciado_em timestamptz not null default now(),
  terminado_em timestamptz,
  criado_em   timestamptz not null default now()
);
comment on table alavanca.importacao_lote is
  'Um lote de importacao. arquivo_hash permite detectar reimportacao do mesmo arquivo; a coluna fonte e copiada para as linhas que o lote gerou.';
select alavanca.proteger_tabela('alavanca.importacao_lote');
create index if not exists ix_importacao_tipo on alavanca.importacao_lote (tenant_id, tipo, iniciado_em desc);
create unique index if not exists ux_importacao_hash
  on alavanca.importacao_lote (tenant_id, tipo, arquivo_hash) where arquivo_hash is not null;

commit;
