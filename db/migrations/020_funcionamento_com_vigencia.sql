-- 020_funcionamento_com_vigencia.sql
-- Horario de funcionamento muda, e o banco tem que saber desde quando.
--
-- O QUE A 019 ERROU
-- Ela gravou o funcionamento declarado pelo dono em 21/10/2026 -- pizzaria todo
-- dia, hamburgueria e pasta de terca a domingo -- como se valesse para sempre,
-- para tras inclusive. Uma linha por marca e dia da semana, sem data nenhuma.
--
-- O QUE OS DADOS MOSTRARAM, LOGO DEPOIS
-- Sobraram 5 dias da Pizzaria gravados como "aberto e vendeu R$ 0". Olhados de
-- perto, sao estes:
--     2026-05-04, 2026-05-11, 2026-05-18, 2026-05-25, 2026-06-01
-- De sete em sete dias. Todas segundas-feiras. E param em 01/06: a partir de
-- 08/06 a Pizzaria vende normalmente nas segundas.
--
-- Isso nao e dado faltando, e o contrario: e a medicao registrando com exatidao
-- uma loja fechada. A Pizzaria NAO abria as segundas ate o inicio de junho de
-- 2026, e passou a abrir depois. O "de segunda a segunda" que o dono falou em
-- 21/10 e verdade HOJE, nao era em maio.
--
-- Os 6 zeros de segunda no canal proprio (letre-site) sao a mesma loja fechada,
-- vista pelo outro canal, e confirmam a leitura.
--
-- POR QUE ISTO IMPORTA, E NAO E DETALHE
-- Sem vigencia, essas 5 segundas entram como desempenho ruim: puxam para baixo a
-- media de segunda, estragam a meta por dia da semana que ainda vai ser cadastrada
-- e podem virar alerta de "vendeu zero" num dia em que a loja estava de portas
-- fechadas. O erro e pequeno em reais e grande em confianca: o dono abre a tela,
-- ve uma segunda vermelha que ele sabe que era folga, e para de acreditar no resto.
--
-- A REGRA, QUE VALE PARA QUALQUER RESTAURANTE
--   Funcionamento e um fato COM DATA. Mudou a escala? Entra linha nova com
--   vigencia nova; a antiga fica, porque ela explica o passado.
-- E a mesma disciplina do DECISOES.md do metodo: decisao que mudou nao se apaga,
-- vira entrada nova.
--
-- Idempotente.

begin;

-- ---------------------------------------------------------------------------
-- 1. funcionamento passa a ter comeco e fim
-- ---------------------------------------------------------------------------
alter table alavanca.marca_funcionamento
  add column if not exists vigencia_inicio date not null default date '1900-01-01',
  add column if not exists vigencia_fim    date;

comment on column alavanca.marca_funcionamento.vigencia_inicio is
  'Primeiro dia em que esta escala vale. Escala que mudou nao se edita: entra linha nova com vigencia nova, e a antiga continua explicando o passado.';
comment on column alavanca.marca_funcionamento.vigencia_fim is
  'Ultimo dia em que esta escala valeu. Nulo = vale ate hoje.';

-- A chave passa a incluir a vigencia: a mesma marca pode ter a mesma segunda-feira
-- aberta num periodo e fechada noutro.
alter table alavanca.marca_funcionamento
  drop constraint if exists marca_funcionamento_pkey;
alter table alavanca.marca_funcionamento
  add constraint marca_funcionamento_pkey
  primary key (tenant_id, marca_id, dia_semana, vigencia_inicio);

-- Duas escalas nao podem valer ao mesmo tempo para o mesmo dia da semana.
create unique index if not exists marca_funcionamento_vigente
  on alavanca.marca_funcionamento (tenant_id, marca_id, dia_semana)
  where vigencia_fim is null;

-- ---------------------------------------------------------------------------
-- 2. a escala antiga da Pizzaria: fechada as segundas ate 01/06/2026
-- ---------------------------------------------------------------------------
do $historico$
declare
  v_tenant uuid;
  v_marca  uuid;
  v_fonte  text := 'Medido no proprio banco em 21/10/2026: faturamento zero nas segundas 04/05, 11/05, 18/05, 25/05 e 01/06/2026, nos dois canais da marca, e venda normal nas segundas a partir de 08/06. Confirmado pelo padrao de 7 em 7 dias.';
begin
  select t.id into v_tenant from alavanca.tenants t where t.slug = 'grupo-le-tre';
  if v_tenant is null then
    raise notice '020: grupo-le-tre nao existe neste banco, nada a semear';
    return;
  end if;
  perform set_config('app.tenant_id', v_tenant::text, true);

  select id into v_marca from alavanca.marcas
   where tenant_id = v_tenant and slug = 'le-tre-pizzaria';
  if v_marca is null then
    perform set_config('app.tenant_id', '', true);
    return;
  end if;

  -- A escala que a 019 gravou passa a valer a partir de 08/06/2026, que e a
  -- primeira segunda em que a Pizzaria vendeu.
  update alavanca.marca_funcionamento
     set vigencia_inicio = date '2026-06-08'
   where tenant_id = v_tenant and marca_id = v_marca and dia_semana = 1
     and vigencia_inicio = date '1900-01-01';

  -- E antes disso ela fechava segunda.
  insert into alavanca.marca_funcionamento
    (tenant_id, marca_id, dia_semana, abre, vigencia_inicio, vigencia_fim, fonte)
  values
    (v_tenant, v_marca, 1, false, date '1900-01-01', date '2026-06-07', v_fonte)
  on conflict (tenant_id, marca_id, dia_semana, vigencia_inicio) do update
    set abre = excluded.abre, vigencia_fim = excluded.vigencia_fim, fonte = excluded.fonte;

  perform set_config('app.tenant_id', '', true);
end
$historico$;

-- ---------------------------------------------------------------------------
-- 3. a view passa a escolher a escala que valia NAQUELE dia
-- ---------------------------------------------------------------------------
create or replace view alavanca.vw_venda_dia_funcionamento as
  select v.*,
         c.marca_id as canal_marca_id,
         coalesce(f.abre, true) as marca_abre_no_dia,
         (not coalesce(f.abre, true)) as dia_fechado
    from alavanca.venda_dia v
    join alavanca.canais c on c.id = v.canal_id
    left join alavanca.marca_funcionamento f
           on f.tenant_id  = v.tenant_id
          and f.marca_id   = c.marca_id
          and f.dia_semana = extract(dow from v.data)::smallint
          and v.data >= f.vigencia_inicio
          and (f.vigencia_fim is null or v.data <= f.vigencia_fim);

comment on view alavanca.vw_venda_dia_funcionamento is
  'venda_dia com a escala que valia NAQUELE dia, nao a de hoje. dia_fechado = true significa que o zero e horario, nao desempenho: nao vira alerta, nao entra em media e nao recebe meta. coalesce(abre, true) = dia sem escala declarada e tratado como aberto, para nao esconder dia por omissao.';

grant select on alavanca.vw_venda_dia_funcionamento to alavanca_app;

commit;
