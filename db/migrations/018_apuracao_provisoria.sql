-- 018_apuracao_provisoria.sql
-- O dia do iFood nao fecha no dia. Fecha depois.
--
-- O QUE O DONO DISSE, EM 21/10/2026
--   "o pedido, principalmente do iFood, demora um dia para ser computado, validado e
--    taxado com as devidas taxas. Entao tem que criar um fluxo: todo fechamento do dia
--    e atualizado."
--
-- Ele esta certo, e o banco hoje nao sabe disso. venda_dia tem UMA linha por dia por
-- canal, sem nenhum campo dizendo se aquele numero ja e o final ou se ainda vai mudar.
-- Quem le a tabela nao consegue distinguir "a Pizzaria faturou R$ 2.100 ontem" de
-- "a Pizzaria faturou R$ 2.100 ontem, ate agora, e esse numero ainda vai mexer".
--
-- POR QUE ISSO IMPORTA MAIS DO QUE PARECE
-- Nao e preciosismo contabil. Sao tres consequencias medidas neste projeto:
--
--   1. A mensagem das 7h sai com o numero de ontem. Se ontem ainda e provisorio, o dono
--      recebe no WhatsApp um fechamento que vai mudar, e ninguem avisa quando mudar.
--   2. canal_taxa_mes, medido em 20/10: take_rate_pct preenchido nas 5 linhas,
--      comissao_pct, taxa_pagamento_pct e embalagem_por_item NULOS nas 5. A taxa real so
--      aparece no fechamento; o que existe no dia e estimativa. O painel hoje estima
--      comissao com take fixo de 41% (guardrails.json do relatorio do dono).
--   3. Reimportar um dia ja importado passa a ser o comportamento CERTO, nao um bug de
--      duplicacao. O importador precisa poder voltar e corrigir, e a verificacao de
--      idempotencia precisa saber a diferenca entre "gravou duas vezes" e "apurou de novo".
--
-- A REGRA
--   Toda linha de venda nasce 'provisorio'. Ela vira 'fechado' quando a fonte entrega o
--   valor apurado -- no iFood, o relatorio financeiro de pedidos, taxas e comissoes.
--   Enquanto for provisorio, a tela e a mensagem dizem que e provisorio. Nunca se finge
--   que um numero que vai mudar ja e final.
--
-- Isto e irmao da regra que a 017 instalou. La: ausencia nao e zero. Aqui: provisorio
-- nao e fechado. As duas tratam da mesma doenca -- afirmar com mais certeza do que se tem.
--
-- O QUE ESTA MIGRATION NAO FAZ
--   - nao decide o prazo de fechamento: o prazo e medido, nao chutado. Quem marca
--     'fechado' e o importador, quando le a fonte apurada;
--   - nao mexe em nenhum valor ja gravado: so classifica;
--   - nao toca em canal_taxa_mes, que e mensal e ja tem o seu proprio ciclo.
--
-- As linhas que ja existem entram como 'fechado': vieram do CSV de fechamento do Saipos,
-- de maio a setembro, que e justamente a fonte apurada. Outubro, que entra pelo
-- relatorio do iFood e por pedidos_site, nasce provisorio.
--
-- Idempotente.

begin;

-- ---------------------------------------------------------------------------
-- 1. o estado da apuracao
-- ---------------------------------------------------------------------------
do $tipo$
begin
  if not exists (select 1 from pg_type t
                   join pg_namespace n on n.oid = t.typnamespace
                  where t.typname = 'situacao_apuracao' and n.nspname = 'alavanca') then
    create type alavanca.situacao_apuracao as enum ('provisorio', 'fechado');
  end if;
end
$tipo$;

alter table alavanca.venda_dia
  add column if not exists apuracao    alavanca.situacao_apuracao not null default 'provisorio',
  add column if not exists apurado_em  timestamptz,
  add column if not exists apurado_por text;

comment on column alavanca.venda_dia.apuracao is
  'provisorio = o numero ainda pode mudar na fonte (pedido do iFood leva cerca de um dia para ser computado, validado e taxado). fechado = veio da fonte apurada. A tela e a mensagem das 7h precisam dizer qual dos dois e.';
comment on column alavanca.venda_dia.apurado_em is
  'Quando a linha passou a fechado. Nulo enquanto provisoria.';
comment on column alavanca.venda_dia.apurado_por is
  'Que fonte fechou a linha, em texto legivel: "iFood, relatorio de Pedidos (taxas e comissoes), puxado em 21/10/2026", por exemplo. Sem isso, fechado vira carimbo sem procedencia.';

-- O que ja esta no banco veio do CSV de fechamento do Saipos (maio a setembro), que e
-- fonte apurada. Marcado uma vez so: o `where apurado_em is null` torna o passo repetivel.
do $existente$
declare
  t record;
  n integer;
  total integer := 0;
begin
  for t in select tenant_id from alavanca.tenant_diretorio loop
    perform set_config('app.tenant_id', t.tenant_id::text, true);
    update alavanca.venda_dia
       set apuracao   = 'fechado',
           apurado_em = coletado_em,
           apurado_por = fonte
     where tenant_id = t.tenant_id
       and apurado_em is null;
    get diagnostics n = row_count;
    total := total + n;
  end loop;
  perform set_config('app.tenant_id', '', true);
  raise notice '018: % linha(s) de venda ja existentes marcadas como fechadas', total;
end
$existente$;

-- Consultar "o que ainda vai mudar" e a pergunta do fluxo de reconciliacao, entao ela
-- merece indice proprio. Parcial: so a fatia provisoria, que e pequena por construcao.
create index if not exists venda_dia_provisorio
  on alavanca.venda_dia (tenant_id, data)
  where apuracao = 'provisorio';

-- ---------------------------------------------------------------------------
-- 2. o que a reconciliacao precisa reler
-- ---------------------------------------------------------------------------
-- Nao embute prazo nenhum: devolve o que esta provisorio e ha quantos dias esta assim.
-- Quem decide reler e o importador, com o prazo que a medicao mostrar -- e `dias_aberto`
-- e justamente como se mede esse prazo, olhando quando as linhas param de mudar.
create or replace view alavanca.vw_venda_a_reconciliar as
  select v.tenant_id,
         v.marca_id,
         v.canal_id,
         c.tipo as canal_tipo,
         v.data,
         (current_date - v.data) as dias_aberto,
         v.faturamento,
         v.pedidos,
         v.fonte,
         v.coletado_em
    from alavanca.venda_dia v
    join alavanca.canais c on c.id = v.canal_id
   where v.apuracao = 'provisorio'
   order by v.data, c.tipo;

comment on view alavanca.vw_venda_a_reconciliar is
  'Os dias de venda que ainda podem mudar na fonte, com ha quantos dias estao abertos. E a fila do fluxo de fechamento: o importador le daqui, volta na fonte apurada e fecha. Respeita RLS pelas policies de venda_dia e canais.';

commit;
