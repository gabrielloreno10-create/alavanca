-- 015_diretorio_tenant.sql
-- Resolver slug -> tenant_id sem furar a RLS.
--
-- POR QUE ESTA MIGRATION EXISTE
-- A policy de alavanca.tenants e  using (id = alavanca.tenant_atual()).
-- Antes de setar app.tenant_id a aplicacao nao enxerga NENHUMA linha de
-- tenants -- nem para descobrir qual e o uuid do slug que acabou de chegar na
-- rota /[cliente]. Ou seja: o painel e o worker nao tinham como dar o primeiro
-- passo. Um SECURITY DEFINER sobre tenants tambem nao resolve, porque a tabela
-- esta com FORCE ROW LEVEL SECURITY e o proprio dono e barrado.
--
-- A saida e um diretorio minusculo, mantido por trigger, com SO o que precisa
-- ser publico para rotear: uuid, slug, nome e ativo. Nenhum numero de negocio,
-- nenhum dado pessoal. Ele e GLOBAL de proposito (sem tenant_id, sem RLS), do
-- mesmo jeito que papeis e usuarios ja sao.
--
-- O diretorio NAO da acesso a nada: descobrir o uuid nao libera uma linha
-- sequer. Toda leitura de dado continua passando pela policy de cada tabela,
-- que exige app.tenant_id setado na transacao, e o painel continua obrigado a
-- checar usuario_tenant antes de setar esse valor.
--
-- Idempotente.

begin;

set local row_security = off;

-- ---------------------------------------------------------------------------
-- tenant_diretorio
-- ---------------------------------------------------------------------------
create table if not exists alavanca.tenant_diretorio (
  tenant_id     uuid primary key references alavanca.tenants(id) on delete cascade,
  slug          text not null unique,
  nome          text not null,
  ativo         boolean not null default true,
  atualizado_em timestamptz not null default now()
);
comment on table alavanca.tenant_diretorio is
  'GLOBAL de proposito (sem tenant_id, sem RLS): mapeia o slug da rota para o uuid do tenant. So o necessario para rotear; nao da acesso a dado nenhum.';

-- Somente leitura para a aplicacao. Quem escreve e a trigger, nao a app.
revoke all on alavanca.tenant_diretorio from alavanca_app;
grant select on alavanca.tenant_diretorio to alavanca_app;

-- ---------------------------------------------------------------------------
-- trigger que mantem o diretorio em dia
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER porque alavanca_app nao tem (e nao deve ter) insert/update
-- no diretorio: quem pode criar tenant pode fazer o diretorio acompanhar, mas
-- nao pode mexer nele por fora.
create or replace function alavanca.sincronizar_tenant_diretorio() returns trigger
language plpgsql security definer set search_path = alavanca, pg_temp
as $fn$
begin
  insert into alavanca.tenant_diretorio (tenant_id, slug, nome, ativo, atualizado_em)
  values (new.id, new.slug, new.nome, new.ativo, now())
  on conflict (tenant_id) do update
    set slug = excluded.slug,
        nome = excluded.nome,
        ativo = excluded.ativo,
        atualizado_em = now();
  return new;
end
$fn$;

drop trigger if exists trg_tenant_diretorio on alavanca.tenants;
create trigger trg_tenant_diretorio
  after insert or update of slug, nome, ativo on alavanca.tenants
  for each row execute function alavanca.sincronizar_tenant_diretorio();

-- Backfill do que ja existe (o tenant semeado pela 014).
insert into alavanca.tenant_diretorio (tenant_id, slug, nome, ativo)
select id, slug, nome, ativo from alavanca.tenants
on conflict (tenant_id) do update
  set slug = excluded.slug, nome = excluded.nome, ativo = excluded.ativo, atualizado_em = now();

-- ---------------------------------------------------------------------------
-- o resolvedor que o painel e o worker chamam
-- ---------------------------------------------------------------------------
create or replace function alavanca.tenant_id_por_slug(p_slug text) returns uuid
language sql stable
as $fn$
  select tenant_id from alavanca.tenant_diretorio where slug = p_slug and ativo
$fn$;

comment on function alavanca.tenant_id_por_slug(text) is
  'Primeiro passo de todo request: traduz o [cliente] da rota no uuid que vai para set_config(''app.tenant_id'', ..., true).';

revoke all on function alavanca.tenant_id_por_slug(text) from public;
grant execute on function alavanca.tenant_id_por_slug(text) to alavanca_app;

commit;
