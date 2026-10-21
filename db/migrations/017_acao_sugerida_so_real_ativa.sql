-- 017_acao_sugerida_so_real_ativa.sql
-- Fase 0: parar de mandar o dono fazer o que ninguem mediu nem validou.
--
-- O QUE FOI MEDIDO (20/10/2026, banco de desenvolvimento com as 16 migrations
-- aplicadas e o importador rodado)
--
--   select t.slug, a.origem, count(*)
--     from alavanca.acao_sugerida a join alavanca.tenants t on t.id = a.tenant_id
--    group by 1, 2;
--      grupo-le-tre      | EXEMPLO | 13
--      pizzaria-exemplo  | EXEMPLO | 13
--
-- As 13 linhas do tenant REAL nasceram na 014 com ativo = true e
-- fonte = 'Esboco do painel (plano.json).'. O painel le
-- "select gatilho, texto, origem from alavanca.acao_sugerida where ativo" e
-- mostra tres delas por dia, na Comanda e na mensagem das 7h. Sao frases de
-- esboco -- "Colocar o QR do site no folheto da sacola do iFood", "Conferir o
-- preco do queijo na ultima nota fiscal". Ninguem do restaurante ditou, ninguem
-- conferiu, e duas delas mandam disparar marketing para uma base cujo
-- consentimento o proprio banco registra como 'legado_sem_registro', com
-- decidido = false (tenant_config, chave consentimento.base_legada).
--
-- POR QUE DESATIVAR, E NAO APENAS SELAR COMO "EXEMPLO"
-- Numero fabricado com selo ainda e um fato com procedencia: quem le
-- "16% (exemplo)" sabe descontar. Ordem fabricada com selo continua sendo uma
-- ordem -- ela ocupa o lugar das tres coisas que o dono vai fazer hoje, e
-- obedecer custa dinheiro (ligar anuncio) ou expoe o restaurante (disparar
-- mensagem para base sem consentimento registrado). Medido tambem: o tenant
-- REAL nao tem meta_dia_semana, nem plano_acao, nem promocoes. A unica coisa
-- "de plano" que ele tem hoje sao estas 13 frases inventadas. A Comanda dizer
-- que ainda nao ha acao combinada e mais verdadeiro do que encher o espaco.
--
-- O selo no painel continua existindo e continua necessario: o tenant de
-- demonstracao segue com as 13 acoes ativas, e qualquer acao nao-REAL que
-- reapareca precisa chegar marcada na tela.
--
-- A REGRA, QUE NAO E ESPECIFICA DE CLIENTE
--   Em tenant com origem REAL, acao sugerida so fica ativa se a origem dela for
--   REAL. Rascunho pode existir: grave com ativo = false. Quando o dono ditar
--   as acoes dele, elas entram com origem = 'REAL', fonte dizendo quem ditou e
--   quando, e aparecem sozinhas -- sem nova migration.
-- O gatilho no fim do arquivo faz a regra valer na proxima carga, inclusive
-- para quem rodar o seed de demonstracao apontando para um tenant real.
--
-- O QUE ESTA MIGRATION NAO FAZ
--   - nao apaga linha nenhuma: desativa, e reativar e um update;
--   - nao toca em tenant de demonstracao (origem EXEMPLO);
--   - nao inventa acao no lugar das que saem;
--   - nao mexe em crm_segmento, que tem o mesmo problema em grau menor
--     (medido hoje: 5 definicoes EXEMPLO ativas no tenant real). Aquilo e
--     definicao, chega na tela com selo e nao manda ninguem fazer nada; fica
--     para quando o CRM tiver dado.
--
-- SEM BYPASSRLS, DE PROPOSITO: em vez de desligar row_security, a migration
-- entra tenant por tenant com set_config('app.tenant_id', ...), do mesmo jeito
-- que a aplicacao faz. Assim ela roda tambem em banco gerenciado, onde o dono
-- do schema normalmente nao tem BYPASSRLS.
--
-- Idempotente.

begin;

-- ---------------------------------------------------------------------------
-- 1. o que ja esta no banco
-- ---------------------------------------------------------------------------
do $desativar$
declare
  t      record;
  n      integer;
  total  integer := 0;
begin
  -- tenant_diretorio (015) e global e sem RLS: e a unica forma de listar os
  -- tenants antes de entrar em cada um.
  for t in select tenant_id from alavanca.tenant_diretorio loop
    perform set_config('app.tenant_id', t.tenant_id::text, true);

    perform 1 from alavanca.tenants where id = t.tenant_id and origem = 'REAL';
    if not found then
      continue;  -- tenant de demonstracao: as acoes de exemplo sao o produto dele
    end if;

    update alavanca.acao_sugerida
       set ativo = false
     where tenant_id = t.tenant_id
       and ativo
       and origem <> 'REAL';
    get diagnostics n = row_count;
    total := total + n;
  end loop;

  perform set_config('app.tenant_id', '', true);
  raise notice '017: % acao(oes) sugerida(s) nao validada(s) desativada(s) em tenant REAL', total;
end
$desativar$;

-- ---------------------------------------------------------------------------
-- 2. para nao voltar na proxima carga
-- ---------------------------------------------------------------------------
create or replace function alavanca.acao_sugerida_so_real_ativa() returns trigger
language plpgsql
as $fn$
declare
  v_tenant_origem text;
begin
  -- Rascunho (ativo = false) e acao do proprio cliente (REAL) passam direto.
  if new.ativo is not true or new.origem = 'REAL' then
    return new;
  end if;

  select origem into v_tenant_origem from alavanca.tenants where id = new.tenant_id;

  -- Quem nao enxerga o proprio tenant tambem nao consegue gravar aqui: a policy
  -- tenant_isolado barra antes. Nada a decidir neste caso.
  if v_tenant_origem is distinct from 'REAL' then
    return new;
  end if;

  raise exception
    'acao sugerida com origem % nao pode ficar ativa em tenant REAL (%)', new.origem, new.tenant_id
    using hint =
      'grave com ativo = false enquanto for rascunho; quando o dono ditar a acao, '
      'grave com origem = ''REAL'' e fonte dizendo quem ditou e quando. '
      'Ver o cabecalho da migration 017.';
end
$fn$;

comment on function alavanca.acao_sugerida_so_real_ativa() is
  'Em tenant REAL, so acao de origem REAL fica ativa. A Comanda e a mensagem das 7h mandam o dono fazer coisas: nenhuma delas pode ser texto que nos inventamos.';

drop trigger if exists trg_acao_sugerida_so_real_ativa on alavanca.acao_sugerida;
create trigger trg_acao_sugerida_so_real_ativa
  before insert or update on alavanca.acao_sugerida
  for each row execute function alavanca.acao_sugerida_so_real_ativa();

comment on column alavanca.acao_sugerida.ativo is
  'Se a acao aparece na Comanda e na mensagem das 7h. Em tenant REAL so pode ser true quando origem = REAL; o gatilho trg_acao_sugerida_so_real_ativa (017) barra o resto. Rascunho que o dono ainda nao validou entra com ativo = false.';

commit;
