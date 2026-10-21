-- 027_passo_por_tenant_ou_marca.sql
-- Um passo pode valer para o grupo inteiro ou para uma marca so.
--
-- O ERRO DA 025
-- tenant_passo nasceu com primary key (tenant_id, passo_slug, marca_id) e com
-- marca_id pensado como anulavel: passo do grupo grava null, passo de uma loja
-- grava o id dela. Só que coluna de chave primaria e NOT NULL por definicao no
-- Postgres, entao a primeira gravacao estourou:
--   null value in column "marca_id" violates not-null constraint
--
-- POR QUE NAO SIMPLESMENTE TIRAR marca_id
-- Porque a distincao e real e vai aparecer logo. "Venda do iFood carregada" e do
-- grupo; "chamados dentro da meta do Super" e de CADA loja -- na Le Tre a
-- Pizzaria esta em 4,97% e as outras duas nao. Jogar tudo no nivel do grupo
-- esconderia exatamente a loja que precisa de atencao.
--
-- A SAIDA
-- Chave unica com NULLS NOT DISTINCT, que o Postgres 15 em diante suporta. Sem
-- ela, o indice unico comum trata cada null como diferente de todos os outros, e
-- o mesmo passo do grupo poderia ser gravado varias vezes sem conflito -- o
-- `on conflict do update` do importador nunca dispararia e as linhas se
-- acumulariam em silencio.
--
-- Idempotente.

begin;

alter table alavanca.tenant_passo drop constraint if exists tenant_passo_pkey;
alter table alavanca.tenant_passo alter column marca_id drop not null;

-- id proprio, porque a identidade agora e o indice unico abaixo
alter table alavanca.tenant_passo
  add column if not exists id uuid not null default gen_random_uuid();

do $pk$
begin
  if not exists (select 1 from pg_constraint where conname = 'tenant_passo_pkey') then
    alter table alavanca.tenant_passo add constraint tenant_passo_pkey primary key (id);
  end if;
end
$pk$;

create unique index if not exists tenant_passo_unico
  on alavanca.tenant_passo (tenant_id, passo_slug, marca_id) nulls not distinct;

comment on column alavanca.tenant_passo.marca_id is
  'Nulo = o passo vale para o grupo inteiro (carregar venda, cadastrar marcas). Preenchido = o passo e de UMA loja, porque o estado difere entre elas -- "chamados na meta do Super" e o caso: na Le Tre a Pizzaria esta fora e as outras nao.';

commit;
