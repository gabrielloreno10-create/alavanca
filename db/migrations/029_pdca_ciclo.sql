-- 029_pdca_ciclo.sql
-- O ciclo fecha: Plan existe, entram Check e Act.
--
-- O QUE O DONO PEDIU, EM 21/10/2026
--   "Queria um PDCA da melhoria continua. A gente planeja, executa, checa de
--    novo, e volta pro planejamento. Gestao de qualidade de todos os servicos,
--    sempre visando margem, lucro e maximizacao de resultado."
--
-- O QUE JA EXISTIA, E O QUE FALTAVA
-- As estrategias da 022/023 ja sao o PLAN inteiro: hipotese ("se eu fizer X
-- espero Y porque Z"), evidencia (o numero que motivou), metrica_sucesso e
-- valor_alvo. O DO e a situacao andando de a_fazer para fazendo.
--
-- O que nao existia era o CHECK e o ACT -- e sem eles PDCA e so uma lista de
-- tarefas com nome bonito. resultado_real_mes esta na tabela desde o inicio e
-- NUNCA foi preenchido em nenhuma das quinze linhas: e a prova de que o ciclo
-- nunca fechou.
--
-- O CHECK TEM QUE SER MEDIDO, PELO MESMO MOTIVO DA JORNADA
-- Se quem executou e quem avalia se funcionou, toda acao funciona. Por isso o
-- plano_acao ganha `verificacao`: o mesmo mecanismo da jornada_passo -- um SQL
-- guardado no banco, sem parametro, que roda sob RLS e devolve o numero de hoje.
-- Check declarado nao e check, e opiniao com data.
--
-- E O ACT TEM QUE TER AS QUATRO SAIDAS, INCLUSIVE AS FEIAS
--   padronizar  funcionou: vira regra da casa e sai do radar
--   ajustar     funcionou em parte: nova hipotese, ciclo novo
--   abandonar   nao funcionou: para, e o motivo fica escrito
--   continuar   cedo demais para dizer: mantem e remarca
-- Sem 'abandonar' explicito, estrategia ruim nao morre -- ela so para de ser
-- mencionada, e seis meses depois alguem tenta de novo sem saber.
--
-- Idempotente.

begin;

-- ---------------------------------------------------------------------------
-- 1. o Plan ganha como se mede
-- ---------------------------------------------------------------------------
alter table alavanca.plano_acao
  add column if not exists verificacao text,
  add column if not exists linha_base  numeric,
  add column if not exists unidade     text;

comment on column alavanca.plano_acao.verificacao is
  'SQL sem parametro que devolve (valor numeric) com a medicao de HOJE da metrica_sucesso. Roda sob RLS, igual a verificacao da jornada. Sem ele o Check depende de alguem dizer que deu certo, e quem executou nunca e bom juiz do proprio resultado.';
comment on column alavanca.plano_acao.linha_base is
  'O valor da metrica quando a estrategia foi planejada. Sem linha de base nao ha com o que comparar, e "melhorou" vira sensacao.';

-- ---------------------------------------------------------------------------
-- 2. o ciclo
-- ---------------------------------------------------------------------------
create table if not exists alavanca.pdca_ciclo (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references alavanca.tenants (id) on delete cascade,
  plano_acao_id uuid not null references alavanca.plano_acao (id) on delete cascade,
  numero        smallint not null,          -- 1, 2, 3... o mesmo plano pode rodar varios
  aberto_em     date not null default current_date,
  revisado_em   date,

  linha_base    numeric,                    -- de onde partiu
  valor_alvo    numeric,                    -- aonde queria chegar
  medido        numeric,                    -- onde chegou
  unidade       text,

  veredito      text check (veredito in ('melhorou', 'piorou', 'igual', 'nao_medido')),
  decisao       text check (decisao in ('padronizar', 'ajustar', 'abandonar', 'continuar')),
  motivo        text,                       -- por que esta decisao, em uma frase
  decidido_por  text,

  criado_em     timestamptz not null default now(),
  unique (plano_acao_id, numero)
);

comment on table alavanca.pdca_ciclo is
  'Uma linha por volta do ciclo. Guarda de onde partiu (linha_base), aonde queria chegar (valor_alvo), onde chegou (medido) e o que se decidiu (decisao). O historico nao se apaga: ciclo 2 nasce ao lado do ciclo 1, e e a sequencia que mostra se a melhoria e continua ou se a gente anda em circulo.';
comment on column alavanca.pdca_ciclo.veredito is
  'Comparacao fria entre medido e linha_base. nao_medido quando a verificacao nao devolveu numero -- diferente de "igual", que afirma que nao mudou.';
comment on column alavanca.pdca_ciclo.decisao is
  'O ACT. padronizar = virou regra da casa; ajustar = nova hipotese; abandonar = para, com motivo escrito; continuar = cedo para dizer. Sem abandonar explicito, estrategia ruim nao morre: so para de ser mencionada, e alguem tenta de novo em seis meses.';

alter table alavanca.pdca_ciclo enable row level security;

do $rls$
begin
  if not exists (select 1 from pg_policies where schemaname = 'alavanca'
                   and tablename = 'pdca_ciclo' and policyname = 'tenant_isolado') then
    create policy tenant_isolado on alavanca.pdca_ciclo
      using (tenant_id = current_setting('app.tenant_id', true)::uuid)
      with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
  end if;
end
$rls$;

grant select, insert, update on alavanca.pdca_ciclo to alavanca_app;

-- Estrategia padronizada sai do radar sem ser apagada.
alter table alavanca.plano_acao drop constraint if exists plano_acao_situacao_check;
alter table alavanca.plano_acao add constraint plano_acao_situacao_check
  check (situacao in ('rascunho', 'a_fazer', 'fazendo', 'feito', 'padronizado', 'cancelada'));

-- ---------------------------------------------------------------------------
-- 3. como se mede cada uma das cinco estrategias de outubro
-- ---------------------------------------------------------------------------
-- Duas das cinco sao medidas por numero que ainda nao entra no banco (promocao
-- bancada e chamado do Super vem do repasse e do portal). Elas ficam sem
-- verificacao de proposito, e o ciclo delas vai acusar 'nao_medido' ate a carga
-- existir -- que e mais honesto do que inventar uma consulta que sempre acerta.
update alavanca.plano_acao set
  verificacao = $v$select round(100.0 * sum(a.investimento) / nullif(sum(v.faturamento), 0), 2) as valor
                  from alavanca.anuncio_dia a
                  join alavanca.marcas m on m.id = a.marca_id
                  join alavanca.canais c on c.marca_id = m.id
                  join alavanca.venda_dia v on v.canal_id = c.id
                                           and to_char(v.data, 'YYYY-MM') = to_char(a.data, 'YYYY-MM')
                 where m.slug = 'jerrys-burger'
                   and to_char(a.data, 'YYYY-MM') = to_char(current_date, 'YYYY-MM')$v$,
  linha_base = 19.0, unidade = '%'
 where codigo = 'EST-002';

-- EST-005 fica SEM verificacao de proposito: a mensalidade do iFood nao entra no
-- banco (ela so existe no repasse, fora do relatorio de pedidos). Escrever aqui
-- uma consulta que devolve zero faria o ciclo acusar "melhorou" todo mes sem
-- ninguem ter feito nada -- que e pior do que nao medir.
update alavanca.plano_acao set linha_base = 2.7,  unidade = '%'          where codigo = 'EST-005';
update alavanca.plano_acao set linha_base = 9.4,  unidade = '%'          where codigo = 'EST-001';
update alavanca.plano_acao set linha_base = 4.97, unidade = '%'          where codigo = 'EST-003';
update alavanca.plano_acao set linha_base = 2,    unidade = 'por semana' where codigo = 'EST-004';

-- ---------------------------------------------------------------------------
-- 4. a leitura: o que precisa de Check hoje
-- ---------------------------------------------------------------------------
create or replace view alavanca.vw_pdca_a_revisar as
  select p.id, p.codigo, p.pilar, p.acao, p.hipotese,
         p.metrica_sucesso, p.linha_base, p.valor_alvo, p.unidade,
         p.revisar_em, p.situacao, p.verificacao is not null as medivel,
         (current_date - p.revisar_em)                       as dias_vencida,
         coalesce(max(c.numero), 0)                          as ciclos_rodados,
         max(c.revisado_em)                                  as ultima_revisao
    from alavanca.plano_acao p
    left join alavanca.pdca_ciclo c on c.plano_acao_id = p.id
   where p.situacao in ('a_fazer', 'fazendo')
     and p.revisar_em is not null
   group by p.id;

comment on view alavanca.vw_pdca_a_revisar is
  'As estrategias em andamento com data de revisao. dias_vencida negativo = ainda nao chegou a hora. medivel = false significa que o Check vai precisar de alguem olhando, porque o numero ainda nao entra no banco.';

grant select on alavanca.vw_pdca_a_revisar to alavanca_app;

commit;
