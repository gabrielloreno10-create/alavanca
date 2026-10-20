-- 013_views_painel.sql
-- Views que o painel consome. Existem para que a tela nao precise reimplementar
-- a heranca tenant -> marca nem a conversao de uuid para slug.
--
-- TODAS as views usam security_invoker = true. Sem isso a view rodaria com os
-- privilegios do dono e furaria a RLS: o painel veria tenant de outro cliente.
--
-- Idempotente (create or replace view).

begin;

-- ---------------------------------------------------------------------------
-- vw_cliente_painel: o objeto Cliente do painel, menos canais e metas
-- ---------------------------------------------------------------------------
create or replace view alavanca.vw_cliente_painel
with (security_invoker = true) as
select
  t.id            as tenant_id,
  t.slug,
  t.nome,
  t.segmento,
  t.imposto_pct,
  t.nota_margem,
  t.fuso,
  t.origem,
  t.fonte,
  l.meta_minima_pct,
  l.margem_minima_pct,
  l.queda_pedidos_pct,
  l.ifood_maximo_pct,
  l.queda_ticket_pct
from alavanca.tenants t
left join alavanca.limites_alerta l
  on l.tenant_id = t.id and l.marca_id is null
where t.ativo;
comment on view alavanca.vw_cliente_painel is 'Cliente do painel (sem canais e sem metas). Limites sao os da raiz do tenant.';
grant select on alavanca.vw_cliente_painel to alavanca_app;

-- ---------------------------------------------------------------------------
-- vw_canal_painel: ConfigCanal, com a marca ja resolvida em "operacao"
-- ---------------------------------------------------------------------------
create or replace view alavanca.vw_canal_painel
with (security_invoker = true) as
select
  c.tenant_id,
  c.id   as canal_id,
  c.slug as canal,          -- CanalId do painel
  c.nome,
  c.tipo,
  m.nome as operacao,       -- ConfigCanal.operacao
  m.id   as marca_id,
  m.slug as marca_slug,
  c.taxa_pct,
  c.custo_por_pedido,
  c.ordem,
  c.ativo
from alavanca.canais c
join alavanca.marcas m on m.id = c.marca_id and m.tenant_id = c.tenant_id;
comment on view alavanca.vw_canal_painel is 'Canais do tenant no formato ConfigCanal do painel (operacao = nome da marca).';
grant select on alavanca.vw_canal_painel to alavanca_app;

-- ---------------------------------------------------------------------------
-- vw_venda_dia_painel: DiaVendas, linha a linha, com os slugs do painel
-- ---------------------------------------------------------------------------
create or replace view alavanca.vw_venda_dia_painel
with (security_invoker = true) as
select
  v.tenant_id,
  v.data,
  c.slug  as canal,
  c.tipo  as tipo_canal,
  m.nome  as operacao,
  v.faturamento,
  v.pedidos,
  v.cmv,
  v.cmv_estimado,
  v.origem
from alavanca.venda_dia v
join alavanca.canais c on c.id = v.canal_id and c.tenant_id = v.tenant_id
join alavanca.marcas m on m.id = v.marca_id and m.tenant_id = v.tenant_id;
comment on view alavanca.vw_venda_dia_painel is
  'Uma linha por canal por dia, com slug de canal e nome de marca. O painel agrupa por data para montar DiaVendas.';
grant select on alavanca.vw_venda_dia_painel to alavanca_app;

-- ---------------------------------------------------------------------------
-- vw_meta_dia_semana_vigente
-- ---------------------------------------------------------------------------
create or replace view alavanca.vw_meta_dia_semana_vigente
with (security_invoker = true) as
select distinct on (m.tenant_id, coalesce(m.marca_id, '00000000-0000-0000-0000-000000000000'::uuid), m.dia_semana)
  m.tenant_id,
  m.marca_id,
  m.dia_semana,
  m.valor,
  m.vigente_de,
  m.origem,
  m.fonte
from alavanca.meta_dia_semana m
where m.vigente_de <= current_date
  and (m.vigente_ate is null or m.vigente_ate >= current_date)
order by m.tenant_id,
         coalesce(m.marca_id, '00000000-0000-0000-0000-000000000000'::uuid),
         m.dia_semana,
         m.vigente_de desc;
comment on view alavanca.vw_meta_dia_semana_vigente is
  'Meta vigente hoje por dia da semana. Sem linha = metaPorDiaSemana null no painel ("[PREENCHER]").';
grant select on alavanca.vw_meta_dia_semana_vigente to alavanca_app;

-- ---------------------------------------------------------------------------
-- vw_limites_efetivos: heranca tenant -> marca
-- ---------------------------------------------------------------------------
create or replace view alavanca.vw_limites_efetivos
with (security_invoker = true) as
select
  mk.tenant_id,
  mk.id   as marca_id,
  mk.nome as marca,
  coalesce(b.meta_minima_pct,   r.meta_minima_pct)   as meta_minima_pct,
  coalesce(b.margem_minima_pct, r.margem_minima_pct) as margem_minima_pct,
  coalesce(b.queda_pedidos_pct, r.queda_pedidos_pct) as queda_pedidos_pct,
  coalesce(b.ifood_maximo_pct,  r.ifood_maximo_pct)  as ifood_maximo_pct,
  coalesce(b.queda_ticket_pct,  r.queda_ticket_pct)  as queda_ticket_pct
from alavanca.marcas mk
left join alavanca.limites_alerta r on r.tenant_id = mk.tenant_id and r.marca_id is null
left join alavanca.limites_alerta b on b.tenant_id = mk.tenant_id and b.marca_id = mk.id;
comment on view alavanca.vw_limites_efetivos is 'Limites de alerta ja com a heranca raiz -> marca resolvida.';
grant select on alavanca.vw_limites_efetivos to alavanca_app;

-- ---------------------------------------------------------------------------
-- vw_guardrail_efetivo: heranca tenant -> marca, respeitando "anulados"
-- ---------------------------------------------------------------------------
-- Uma coluna da marca que esta em "anulados" vira NULL de verdade em vez de
-- herdar a raiz. E o caso do Jerry's: ticket_medio null quer dizer "nao avalio
-- por ticket", nao "use o ticket da Le Tre".
create or replace view alavanca.vw_guardrail_efetivo
with (security_invoker = true) as
select
  mk.tenant_id,
  mk.id   as marca_id,
  mk.nome as marca,
  case when 'ticket_medio'        = any(coalesce(b.anulados, '{}')) then null else coalesce(b.ticket_medio,        r.ticket_medio)        end as ticket_medio,
  case when 'margem_contribuicao' = any(coalesce(b.anulados, '{}')) then null else coalesce(b.margem_contribuicao, r.margem_contribuicao) end as margem_contribuicao,
  case when 'cmv_adotado'         = any(coalesce(b.anulados, '{}')) then null else coalesce(b.cmv_adotado,         r.cmv_adotado)         end as cmv_adotado,
  case when 'roas_break_even'     = any(coalesce(b.anulados, '{}')) then null else coalesce(b.roas_break_even,     r.roas_break_even)     end as roas_break_even,
  case when 'roas_alvo'           = any(coalesce(b.anulados, '{}')) then null else coalesce(b.roas_alvo,           r.roas_alvo)           end as roas_alvo,
  case when 'cpa_teto'            = any(coalesce(b.anulados, '{}')) then null else coalesce(b.cpa_teto,            r.cpa_teto)            end as cpa_teto,
  case when 'custo_visita_teto'   = any(coalesce(b.anulados, '{}')) then null else coalesce(b.custo_visita_teto,   r.custo_visita_teto)   end as custo_visita_teto,
  case when 'custo_carrinho_teto' = any(coalesce(b.anulados, '{}')) then null else coalesce(b.custo_carrinho_teto, r.custo_carrinho_teto) end as custo_carrinho_teto,
  case when 'custo_conversa_teto' = any(coalesce(b.anulados, '{}')) then null else coalesce(b.custo_conversa_teto, r.custo_conversa_teto) end as custo_conversa_teto,
  coalesce(b.teto_gasto_diario, r.teto_gasto_diario)                       as teto_gasto_diario,
  coalesce(b.custos_fixos_mes, r.custos_fixos_mes)                         as custos_fixos_mes,
  coalesce(b.ponto_equilibrio_receita_mes, r.ponto_equilibrio_receita_mes) as ponto_equilibrio_receita_mes,
  coalesce(b.valor_pedido_migrado, r.valor_pedido_migrado)                 as valor_pedido_migrado,
  coalesce(b.avalia_por, r.avalia_por)               as avalia_por,
  coalesce(b.janela_venda, r.janela_venda)           as janela_venda,
  coalesce(b.dias_sem_midia, r.dias_sem_midia)       as dias_sem_midia,
  coalesce(b.geografia, r.geografia)                 as geografia,
  coalesce(r.corte_automatico, '{}'::jsonb) || coalesce(b.corte_automatico, '{}'::jsonb) as corte_automatico,
  coalesce(r.extras, '{}'::jsonb) || coalesce(b.extras, '{}'::jsonb)                     as extras
from alavanca.marcas mk
left join alavanca.brand_guardrails r on r.tenant_id = mk.tenant_id and r.marca_id is null
left join alavanca.brand_guardrails b on b.tenant_id = mk.tenant_id and b.marca_id = mk.id;
comment on view alavanca.vw_guardrail_efetivo is
  'Guardrails da marca ja com a heranca aplicada. Equivale a lib_meta.guardrails(marca) de hoje. corte_automatico e extras sao mesclados chave a chave.';
grant select on alavanca.vw_guardrail_efetivo to alavanca_app;

-- ---------------------------------------------------------------------------
-- vw_ficha_painel: Ficha do painel, com a operacao resolvida
-- ---------------------------------------------------------------------------
create or replace view alavanca.vw_ficha_painel
with (security_invoker = true) as
select
  f.tenant_id,
  f.id as ficha_id,
  f.codigo,
  f.nome,
  f.categoria,
  m.nome as operacao,
  f.preco,
  f.custo,
  f.preco_ifood,
  f.estimado,
  f.base,
  f.origem
from alavanca.ficha_tecnica f
join alavanca.marcas m on m.id = f.marca_id and m.tenant_id = f.tenant_id
where f.ativo;
comment on view alavanca.vw_ficha_painel is 'Fichas tecnicas no formato Ficha do painel.';
grant select on alavanca.vw_ficha_painel to alavanca_app;

commit;
