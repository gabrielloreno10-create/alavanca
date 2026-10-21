-- 021_meta_grupo_outubro.sql
-- A primeira meta de verdade: R$ 25 mil por semana, do grupo, a partir de outubro.
--
-- O QUE O DONO DITOU, EM 21/10/2026
--   "R$ 25 mil e do grupo inteiro (as 3 lojas) por semana, nao so da Pizzaria.
--    Pode distribuir pela proporcao real da semana."
-- E mandou a proporcao, medida por ele na media de julho por dia:
--   seg 2,6% · ter 6,8% · qua 7,3% · qui 9,0% · sex 22,7% · sab 25,7% · dom 25,9%
--
-- POR QUE E DO GRUPO E NAO DA MARCA
-- Ele foi explicito. marca_id fica NULO: e meta do tenant inteiro, e o painel soma
-- as tres marcas para comparar. Meta por marca entra quando ele ditar uma -- e o
-- dia em que entrar, esta linha nao se edita: ganha vigente_ate e nasce outra.
--
-- POR QUE 25 MIL E UMA META E NAO UM PISO
-- Medido no banco em 21/10: outubro esta correndo a R$ 20.947 por semana no grupo
-- (R$ 59.849,98 em 20 dias). A meta fica 19% acima do ritmo atual, que e esticada
-- o suficiente para significar alguma coisa e perto o suficiente para ser levada a
-- serio. Contra julho ela seria FROUXA: a referencia de julho era R$ 27.295 por
-- semana. A diferenca nao e queda de desempenho, e mudanca de operacao -- o dono
-- avisou no mesmo dia: "desde outubro a gente abre so a noite".
--
-- A PROPORCAO E DELE, NAO MINHA
-- Medi julho por conta propria e deu parecido, mas nao igual (seg 3,8% contra 2,6%,
-- dom 23,4% contra 25,9%). A diferenca tem explicacao: a minha conta nao tinha a
-- Jerry's, que faltava no export do Saipos. A dele e mais completa, entao vale a
-- dele. Fica registrado que as duas existem, para ninguem se assustar ao recalcular.
--
-- QUANDO REVISAR
-- O proprio dono deu o gatilho: "quando fechar as primeiras 4 semanas, vale
-- ajustar a proporcao com os dados novos". Ou seja, por volta de 04/11/2026, com
-- outubro inteiro medido sob a operacao nova.
--
-- Idempotente.

begin;

do $meta$
declare
  v_tenant uuid;
  v_fonte  text := 'Helio, 21/10/2026: R$ 25.000 por semana para o grupo (3 lojas), distribuidos pela proporcao media de julho/2026 que ele mesmo calculou. Vigencia a partir de 01/10/2026, quando a operacao passou a abrir so a noite.';
  -- dia_semana segue extract(dow): 0 = domingo
  v_dias   smallint[] := array[0, 1, 2, 3, 4, 5, 6];
  v_valor  numeric[]  := array[6480, 640, 1710, 1810, 2260, 5670, 6440];
  i        integer;
  v_soma   numeric := 0;
begin
  select id into v_tenant from alavanca.tenants where slug = 'grupo-le-tre';
  if v_tenant is null then
    raise notice '021: grupo-le-tre nao existe neste banco, nada a semear';
    return;
  end if;
  perform set_config('app.tenant_id', v_tenant::text, true);

  -- A soma dos sete dias tem que ficar perto dos R$ 25.000 que o dono ditou.
  --
  -- Perto, e nao exato, de proposito: os valores por dia sao dele, ja arredondados
  -- para a dezena, e somam R$ 25.010 -- dez reais a mais, 0,04% da semana. Preferi
  -- manter o numero que o dono ditou a ajustar um dia qualquer para fechar a conta
  -- na unha: quem olhar a tela e a mensagem dele tem que ver o mesmo numero.
  --
  -- O guarda continua existindo porque o risco real e outro: alguem mexer num dia
  -- solto mais tarde e esquecer do resto, e a meta da semana virar outra coisa sem
  -- ninguem perceber. A folga de R$ 50 cobre arredondamento e nao cobre engano.
  for i in 1..7 loop
    v_soma := v_soma + v_valor[i];
  end loop;
  if abs(v_soma - 25000) > 50 then
    raise exception '021: a soma dos sete dias da % e a meta ditada foi 25000', v_soma;
  end if;

  for i in 1..7 loop
    insert into alavanca.meta_dia_semana
      (tenant_id, marca_id, dia_semana, valor, vigente_de, vigente_ate, origem, fonte, coletado_em)
    values
      (v_tenant, null, v_dias[i], v_valor[i], date '2026-10-01', null, 'REAL', v_fonte, now())
    on conflict do nothing;
  end loop;

  perform set_config('app.tenant_id', '', true);
  raise notice '021: meta semanal do grupo gravada, 7 dias somando R$ 25.000';
end
$meta$;

commit;
