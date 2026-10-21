-- 022_estrategia.sql
-- A aba de Estrategias: o que separa plano de acao de biscoito da sorte.
--
-- O QUE O DONO PEDIU, EM 21/10/2026
--   "Preciso que esse sistema seja o meu braco direito em paralelo e me ajude a
--    tracar estrategias diarias, semanais, metas e um plano de acao. A gente
--    esta sempre em paralelo tracando estrategia. Precisamos ter uma aba de
--    estrategias."
--
-- O RISCO DESTA FUNCIONALIDADE, E E GRANDE
-- "Sistema que sugere estrategia" e a coisa mais facil de fingir que existe e a
-- mais cara de errar. Ja aconteceu aqui: a seed 014 gravou 13 acoes sugeridas
-- com frases plausiveis que ninguem mediu -- "colocar o QR do site no folheto",
-- "conferir o preco do queijo" -- e elas apareciam na Comanda do dono sem selo,
-- como se fossem metodo da casa. A migration 017 teve que desativar as 13 e
-- instalar um gatilho para nao voltarem.
--
-- Entao esta tabela nasce com a regra que faltava la:
--
--   NENHUMA ESTRATEGIA SEM O NUMERO QUE A SUSTENTA.
--
-- Nao e burocracia. E a diferenca entre "aumente suas vendas no fim de semana"
-- (que qualquer um escreve sem olhar nada) e "a loja bancou R$ 5.500 de promocao
-- em agosto contra R$ 2.589 do iFood; igualar ao iFood devolve R$ 2.900 no mes"
-- (que so sai de quem leu o repasse). A segunda e vendavel; a primeira e ruido.
--
-- O QUE ESTA MIGRATION ACRESCENTA A plano_acao
--   hipotese         o raciocinio: se eu fizer X, espero Y, porque Z
--   evidencia        o numero que motivou, com metrica, valor, periodo e fonte
--   metrica_sucesso  como se sabe que funcionou
--   valor_alvo       o numero que define sucesso
--   horizonte        diario | semanal | mensal | pontual
--   revisar_em       quando voltar nela -- estrategia sem data de revisao morre
--   confianca        alta | media | baixa, declarada por quem propos
--
-- E o gatilho: proposta sem evidencia nao entra. Quem quiser escrever uma acao
-- solta ainda pode -- basta deixar `evidencia` nula e `situacao` em 'rascunho'.
-- O que nao se pode e uma estrategia ATIVA sem o numero que a sustenta.
--
-- Idempotente.

begin;

alter table alavanca.plano_acao
  add column if not exists hipotese        text,
  add column if not exists evidencia       jsonb,
  add column if not exists metrica_sucesso text,
  add column if not exists valor_alvo      numeric,
  add column if not exists horizonte       text,
  add column if not exists revisar_em      date,
  add column if not exists confianca       text;

do $checks$
begin
  if not exists (select 1 from pg_constraint where conname = 'plano_acao_horizonte_ck') then
    alter table alavanca.plano_acao add constraint plano_acao_horizonte_ck
      check (horizonte is null or horizonte in ('diario', 'semanal', 'mensal', 'pontual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plano_acao_confianca_ck') then
    alter table alavanca.plano_acao add constraint plano_acao_confianca_ck
      check (confianca is null or confianca in ('alta', 'media', 'baixa'));
  end if;
end
$checks$;

comment on column alavanca.plano_acao.hipotese is
  'Se eu fizer X, espero Y, porque Z. E o raciocinio que pode ser conferido depois -- sem ele nao da para aprender com o que deu errado, so repetir.';
comment on column alavanca.plano_acao.evidencia is
  'O numero que motivou a estrategia: {metrica, valor, unidade, periodo, fonte}. Estrategia ativa sem isto e chute com cara de metodo, e o gatilho barra.';
comment on column alavanca.plano_acao.metrica_sucesso is
  'Que numero vai dizer se funcionou. Diferente do resultado_esperado_mes, que e quanto vale: aqui e COMO se mede.';
comment on column alavanca.plano_acao.horizonte is
  'diario, semanal, mensal ou pontual. E o que separa "o que eu faco hoje" de "o que eu persigo no mes" na aba de Estrategias.';
comment on column alavanca.plano_acao.revisar_em is
  'Quando voltar nesta estrategia. Estrategia sem data de revisao nao e acompanhada: ela so e lembrada quando da errado.';

-- ---------------------------------------------------------------------------
-- O gatilho: estrategia ativa precisa do numero
-- ---------------------------------------------------------------------------
create or replace function alavanca.plano_acao_exige_evidencia() returns trigger
language plpgsql
as $fn$
begin
  -- Rascunho e acao ja concluida passam direto: o rascunho ainda esta sendo
  -- pensado, e a concluida ja foi julgada pelo resultado.
  if new.situacao in ('rascunho', 'feito', 'descartada') then
    return new;
  end if;
  if new.evidencia is null or new.evidencia = '{}'::jsonb then
    raise exception
      'estrategia "%" nao pode ficar ativa sem evidencia', coalesce(new.codigo, new.acao)
      using hint =
        'Grave em evidencia o numero que motivou, no formato '
        '{"metrica": "...", "valor": 0, "unidade": "...", "periodo": "...", "fonte": "..."}. '
        'Se ainda nao ha numero, deixe situacao = ''rascunho''. Ver migration 022.';
  end if;
  return new;
end
$fn$;

comment on function alavanca.plano_acao_exige_evidencia() is
  'Nenhuma estrategia ativa sem o numero que a sustenta. E a mesma doenca que a 017 tratou na acao_sugerida: frase plausivel que ninguem mediu chegando ao dono como se fosse metodo.';

drop trigger if exists trg_plano_acao_exige_evidencia on alavanca.plano_acao;
create trigger trg_plano_acao_exige_evidencia
  before insert or update on alavanca.plano_acao
  for each row execute function alavanca.plano_acao_exige_evidencia();

-- ---------------------------------------------------------------------------
-- A leitura da aba: o que fazer hoje, o que revisar, o que esta no ar
-- ---------------------------------------------------------------------------
create or replace view alavanca.vw_estrategia as
  select p.*,
         m.slug as marca_slug,
         m.nome as marca_nome,
         (p.revisar_em is not null and p.revisar_em <= current_date) as vencida,
         (p.prazo is not null and p.prazo < current_date
          and p.situacao not in ('feito', 'descartada'))             as atrasada,
         p.evidencia ->> 'metrica'                                   as evidencia_metrica,
         p.evidencia ->> 'valor'                                     as evidencia_valor,
         p.evidencia ->> 'periodo'                                   as evidencia_periodo,
         p.evidencia ->> 'fonte'                                     as evidencia_fonte
    from alavanca.plano_acao p
    left join alavanca.marcas m on m.id = p.marca_id;

comment on view alavanca.vw_estrategia is
  'O plano de acao com a evidencia aberta em colunas, mais atrasada e vencida calculadas. A tela nao recalcula prazo: le daqui.';

grant select on alavanca.vw_estrategia to alavanca_app;

commit;
