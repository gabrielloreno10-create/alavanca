-- 028_verificacao_sem_parametro.sql
-- As verificacoes da jornada deixam de receber o tenant por parametro.
--
-- O ERRO DA 025
-- Todas as verificacoes foram escritas com `where tenant_id = $1`, no estilo de
-- placeholder do Postgres. O worker usa psycopg, cujo placeholder e %s, entao
-- todas falharam na primeira execucao com a mesma mensagem:
--   the query has 0 placeholders but 1 parameters were passed
--
-- POR QUE A CORRECAO NAO E TROCAR $1 POR %s
-- Porque o parametro nunca deveria ter existido. A verificacao roda dentro de
-- `tenant(conn, tenant_id)`, que faz set_config('app.tenant_id'). Todas as
-- tabelas consultadas tem policy tenant_isolado. Ou seja: a RLS ja limita o
-- resultado ao tenant da transacao, e o filtro no WHERE era redundante.
--
-- Tirar o parametro nao e so simplificacao -- e defesa. Com `$1` fixo no texto,
-- quem escrevesse uma verificacao nova e esquecesse o filtro teria uma consulta
-- que atravessa tenants no dia em que a RLS falhasse. Sem parametro nenhum, a
-- RLS e a unica fronteira, e ela e a fronteira certa.
--
-- Idempotente: reescreve a coluna verificacao de cada passo medido.

begin;

update alavanca.jornada_passo set verificacao =
  $v$select count(*) > 0 as feito, count(*)::text || ' dias de venda de iFood' as medido
       from alavanca.venda_dia v join alavanca.canais c on c.id = v.canal_id
      where c.tipo = 'ifood'$v$
 where slug = 'venda-ifood-carregada';

update alavanca.jornada_passo set verificacao =
  $v$select count(*) > 0 as feito, count(*)::text || ' dias de venda propria' as medido
       from alavanca.venda_dia v join alavanca.canais c on c.id = v.canal_id
      where c.tipo = 'proprio'$v$
 where slug = 'venda-propria-carregada';

update alavanca.jornada_passo set verificacao =
  $v$select count(*) = 0 as feito,
            coalesce(string_agg(m.nome, ', '), 'nenhuma faltando') as medido
       from alavanca.marcas m
      where m.ativo
        and not exists (select 1 from alavanca.venda_dia v
                         join alavanca.canais c on c.id = v.canal_id
                        where c.marca_id = m.id)$v$
 where slug = 'todas-as-marcas';

update alavanca.jornada_passo set verificacao =
  $v$select count(*) > 0 as feito, count(*)::text || ' linhas de funcionamento' as medido
       from alavanca.marca_funcionamento$v$
 where slug = 'funcionamento-declarado';

update alavanca.jornada_passo set verificacao =
  $v$select count(*) > 0 as feito, count(*)::text || ' meses com taxa apurada' as medido
       from alavanca.canal_taxa_mes where take_rate_pct is not null$v$
 where slug = 'taxa-apurada';

update alavanca.jornada_passo set verificacao =
  $v$select count(*) > 0 as feito, count(*)::text || ' marcas com guardrail' as medido
       from alavanca.brand_guardrails$v$
 where slug = 'teto-de-anuncio';

update alavanca.jornada_passo set verificacao =
  $v$select count(*) > 0 as feito, count(*)::text || ' metas vigentes' as medido
       from alavanca.meta_dia_semana where vigente_ate is null$v$
 where slug = 'meta-definida';

update alavanca.jornada_passo set verificacao =
  $v$select count(*) > 0 as feito, count(*)::text || ' dias de operacao' as medido
       from alavanca.ifood_operacao_dia$v$
 where slug = 'operacao-medida';

update alavanca.jornada_passo set verificacao =
  $v$select count(*) filter (where estado = 'opt_in') > 0 as feito,
            count(*) filter (where estado = 'opt_in')::text || ' com opt-in de ' ||
            count(*)::text || ' registros' as medido
       from alavanca.consents$v$
 where slug = 'consentimento-registrado';

update alavanca.jornada_passo set verificacao =
  $v$select count(*) > 0 as feito, count(*)::text || ' envios registrados' as medido
       from alavanca.sniper_envios$v$
 where slug = 'primeira-campanha';

update alavanca.jornada_passo set verificacao =
  $v$select count(*) > 0 as feito,
            count(distinct m.id)::text || ' marcas, ' ||
            count(c.id)::text || ' canais' as medido
       from alavanca.marcas m left join alavanca.canais c on c.marca_id = m.id$v$
 where slug = 'cadastro-marcas';

update alavanca.jornada_passo set verificacao =
  $v$select count(*) > 0 as feito, count(*)::text || ' fichas tecnicas' as medido
       from alavanca.ficha_tecnica$v$
 where slug = 'cardapio-carregado';

comment on column alavanca.jornada_passo.verificacao is
  'SQL que o proprio banco roda para saber se o passo foi cumprido. Devolve (feito boolean, medido text). NAO recebe parametro: roda dentro da transacao com app.tenant_id setado, e a RLS e quem limita o resultado ao cliente. Verificacao que filtra tenant na mao e redundante e mascara falha de RLS.';

commit;
