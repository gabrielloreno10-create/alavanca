-- 019_funcionamento_e_inicio.sql
-- Fechado nao e zero, e tambem nao e "nao medido".
--
-- O QUE O DONO DISSE, EM 21/10/2026
--   "segunda-feira eu abro somente a pizzaria. A hamburgueria e a pasta abrem de
--    terca a domingo. A pizzaria de segunda a segunda."
--   "a Le Tre Farine Pastas e um restaurante muito novo... deve ter 3 meses. Eu ja
--    trabalhava com as pastas, mas dentro do canal da pizzaria, e mudei para o
--    canal exclusivo de culinaria italiana."
--
-- O QUE O BANCO DIZIA, E QUE ESTAVA ERRADO DE DUAS MANEIRAS
--
-- 1. SEGUNDA-FEIRA FECHADA VIRAVA VENDA DE R$ 0.
--    Medido em 21/10: a Pastas tem 21 segundas-feiras gravadas com faturamento 0 --
--    praticamente toda segunda do periodo. Elas nao sao medicao de venda nenhuma:
--    a loja nao abriu. Mas estavam no banco como dia normal que vendeu zero, e isso
--    contamina tudo que e media, meta por dia da semana, grafico semanal e alerta:
--    "0 pedidos" numa segunda da Pastas nao e problema, e o horario.
--    A regra da 017 e da fase 0 era "ausencia nao e zero". Esta migration acrescenta
--    a irma dela: FECHADO tambem nao e zero, e fechado nao e ausencia -- a gente
--    sabe exatamente por que nao houve venda.
--
-- 2. O CANAL DA PASTAS TINHA VENDA ANTES DE EXISTIR.
--    Medido: a primeira venda da Pastas no canal proprio dela e 03/06/2026. Mesmo
--    assim havia 31 linhas de maio, todas com faturamento 0. Nao e que a loja vendeu
--    zero em maio: o canal exclusivo nao existia, e a pasta era vendida dentro do
--    canal da pizzaria. Linha de venda antes do canal existir e numero inventado com
--    cara de medicao -- e pior, empurra para baixo qualquer media da marca.
--
--    Consequencia que fica REGISTRADA e nao resolvida aqui: o faturamento da
--    Pizzaria de maio e comeco de junho INCLUI venda de pasta. Separar isso exigiria
--    o pedido com itens, que nao temos para aquele periodo. Entao nao se separa; se
--    declara.
--
-- POR QUE ISTO E CONFIGURACAO E NAO CODIGO
-- Dia de funcionamento varia de restaurante para restaurante e e a primeira coisa
-- que muda quando entra o segundo cliente. Gravado em tabela, o segundo restaurante
-- e um insert. Escrito dentro de uma funcao, e mais um clone.
--
-- Idempotente.

begin;

-- ---------------------------------------------------------------------------
-- 1. desde quando o canal existe
-- ---------------------------------------------------------------------------
alter table alavanca.canais
  add column if not exists inicio_operacao date;

comment on column alavanca.canais.inicio_operacao is
  'Primeiro dia em que este canal pode ter venda. Antes disso o canal nao existia, e linha de venda anterior a esta data e numero inventado -- o importador recusa, o gatilho barra. Nulo = nao se sabe, e nada e barrado.';

-- ---------------------------------------------------------------------------
-- 2. que dias a marca abre
-- ---------------------------------------------------------------------------
create table if not exists alavanca.marca_funcionamento (
  tenant_id   uuid not null,
  marca_id    uuid not null,
  dia_semana  smallint not null check (dia_semana between 0 and 6),  -- 0 = domingo (extract(dow))
  abre        boolean not null,
  origem      text not null default 'REAL',
  fonte       text not null,
  coletado_em timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  primary key (tenant_id, marca_id, dia_semana),
  foreign key (tenant_id) references alavanca.tenants (id) on delete cascade,
  foreign key (marca_id)  references alavanca.marcas  (id) on delete cascade
);

comment on table alavanca.marca_funcionamento is
  'Em que dias da semana a marca abre. Dia fechado nao gera meta, nao entra em media e nao vira alerta de "vendeu zero" -- a tela diz FECHADO, que e diferente de "nao medido". Uma linha por dia da semana; a ausencia da linha significa que ninguem declarou.';
comment on column alavanca.marca_funcionamento.dia_semana is
  '0=domingo ... 6=sabado, igual a extract(dow from data), para a juncao ser direta.';

alter table alavanca.marca_funcionamento enable row level security;

do $rls$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'alavanca' and tablename = 'marca_funcionamento'
                    and policyname = 'tenant_isolado') then
    create policy tenant_isolado on alavanca.marca_funcionamento
      using (tenant_id = current_setting('app.tenant_id', true)::uuid)
      with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
  end if;
end
$rls$;

grant select on alavanca.marca_funcionamento to alavanca_app;

-- ---------------------------------------------------------------------------
-- 3. o que o dono ditou em 21/10/2026
-- ---------------------------------------------------------------------------
do $dados$
declare
  v_tenant uuid;
  v_fonte  text := 'Helio, 21/10/2026, por voz: "segunda-feira eu abro somente a pizzaria; a hamburgueria e a pasta abrem de terca a domingo; a pizzaria de segunda a segunda".';
  m        record;
  d        smallint;
begin
  select tenant_id into v_tenant from alavanca.tenant_diretorio td
    join alavanca.tenants t on t.id = td.tenant_id where t.slug = 'grupo-le-tre';
  if v_tenant is null then
    raise notice '019: grupo-le-tre nao existe neste banco, nada a semear';
    return;
  end if;
  perform set_config('app.tenant_id', v_tenant::text, true);

  for m in select id, slug from alavanca.marcas where tenant_id = v_tenant loop
    for d in 0..6 loop
      insert into alavanca.marca_funcionamento (tenant_id, marca_id, dia_semana, abre, fonte)
      values (
        v_tenant, m.id, d,
        -- a pizzaria abre todo dia; as outras duas fecham segunda (dow = 1)
        case when m.slug = 'le-tre-pizzaria' then true else d <> 1 end,
        v_fonte
      )
      on conflict (tenant_id, marca_id, dia_semana) do update
        set abre = excluded.abre, fonte = excluded.fonte, coletado_em = excluded.coletado_em;
    end loop;
  end loop;

  -- O canal exclusivo da Pastas comecou em 03/06/2026: e a primeira venda medida,
  -- e bate com o "tem uns 3 meses" do dono. Antes disso a pasta era vendida dentro
  -- do canal da pizzaria.
  update alavanca.canais set inicio_operacao = date '2026-06-03'
   where tenant_id = v_tenant and slug = 'letre-ifood-pastas' and inicio_operacao is null;

  perform set_config('app.tenant_id', '', true);
end
$dados$;

-- ---------------------------------------------------------------------------
-- 4. tirar as linhas anteriores ao canal existir
-- ---------------------------------------------------------------------------
-- Nao e perda de dado: e retirada de linha que afirmava uma medicao que nunca
-- houve. Reversivel reimportando o CSV, se um dia se decidir o contrario.
do $limpar$
declare
  t      record;
  n      integer;
  total  integer := 0;
begin
  for t in select tenant_id from alavanca.tenant_diretorio loop
    perform set_config('app.tenant_id', t.tenant_id::text, true);
    delete from alavanca.venda_dia v
      using alavanca.canais c
     where c.id = v.canal_id
       and v.tenant_id = t.tenant_id
       and c.inicio_operacao is not null
       and v.data < c.inicio_operacao;
    get diagnostics n = row_count;
    total := total + n;
  end loop;
  perform set_config('app.tenant_id', '', true);
  raise notice '019: % linha(s) de venda anteriores ao inicio do canal removidas', total;
end
$limpar$;

-- E impedir que voltem na proxima carga.
create or replace function alavanca.venda_dia_depois_do_inicio() returns trigger
language plpgsql
as $fn$
declare
  v_inicio date;
  v_slug   text;
begin
  select inicio_operacao, slug into v_inicio, v_slug
    from alavanca.canais where id = new.canal_id;
  if v_inicio is not null and new.data < v_inicio then
    raise exception
      'venda em % no canal % e anterior ao inicio de operacao dele (%)', new.data, v_slug, v_inicio
      using hint = 'O canal nao existia nessa data. Confira o periodo do arquivo antes de importar; '
                   'se o inicio estiver errado, corrija canais.inicio_operacao. Ver migration 019.';
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_venda_dia_depois_do_inicio on alavanca.venda_dia;
create trigger trg_venda_dia_depois_do_inicio
  before insert or update on alavanca.venda_dia
  for each row execute function alavanca.venda_dia_depois_do_inicio();

-- ---------------------------------------------------------------------------
-- 5. a leitura pronta: o dia estava aberto?
-- ---------------------------------------------------------------------------
create or replace view alavanca.vw_venda_dia_funcionamento as
  select v.*,
         c.marca_id as canal_marca_id,
         coalesce(f.abre, true) as marca_abre_no_dia,
         -- Fechado e zero sao coisas diferentes, e so esta coluna sabe distinguir.
         (not coalesce(f.abre, true)) as dia_fechado
    from alavanca.venda_dia v
    join alavanca.canais c on c.id = v.canal_id
    left join alavanca.marca_funcionamento f
           on f.tenant_id = v.tenant_id
          and f.marca_id  = c.marca_id
          and f.dia_semana = extract(dow from v.data)::smallint;

comment on view alavanca.vw_venda_dia_funcionamento is
  'venda_dia com a informacao de se a marca abria naquele dia da semana. dia_fechado = true significa que o zero e horario, nao desempenho: nao vira alerta, nao entra em media e nao recebe meta. coalesce(abre, true) = quem nao declarou funcionamento e tratado como aberto, para nao esconder dia por omissao.';

grant select on alavanca.vw_venda_dia_funcionamento to alavanca_app;

commit;
