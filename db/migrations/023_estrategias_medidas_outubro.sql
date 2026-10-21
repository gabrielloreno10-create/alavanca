-- 023_estrategias_medidas_outubro.sql
-- As cinco primeiras estrategias, e todas saem de numero medido em 21/10/2026.
--
-- POR QUE ELAS ENTRAM COMO RASCUNHO
-- Porque quem decide e o dono. A 017 desativou 13 acoes que chegavam na Comanda
-- como se fossem metodo da casa sem ninguem ter ditado. A licao nao foi "nao
-- sugerir": foi "nao mandar". Rascunho aparece como proposta, com o numero ao
-- lado, e so vira acao ativa quando ele aprovar.
--
-- DE ONDE SAIU CADA NUMERO
--   Toqan (agente financeiro do iFood), consultado em 21/10: o detalhamento do
--   repasse por loja e por mes -- comissao, pagamento, servico, promocao bancada
--   pela loja e pelo iFood, mensalidade, anuncios, frota, antecipacao.
--   Portal do Parceiro, painel operacional e programa Super, na mesma data.
--   Extrato de Pedidos exportado, 2.282 pedidos de agosto a outubro.
--
-- Idempotente: a chave e (tenant, codigo).

begin;

-- ---------------------------------------------------------------------------
-- 0. conserto do que a 022 deixou pela metade
-- ---------------------------------------------------------------------------
-- A 022 criou a nocao de rascunho mas nao mexeu na constraint de situacao, que
-- so aceitava a_fazer, fazendo, feito e cancelada. E o gatilho dela cita
-- 'descartada', que nunca existiu -- o nome certo nesta base e 'cancelada'.
-- A 022 ja esta aplicada e migration aplicada nao se edita: conserta-se adiante.
-- Nem toda estrategia vale um numero em reais por mes, e forcar um valor seria a
-- mesma mentira que a fase 0 tirou da tela. "Subir o nivel do Super" e "decidir o
-- plano do iFood" valem dinheiro de um jeito que ninguem consegue cravar antes de
-- fazer; gravar 0,00 ali diria que nao valem nada. Ausencia nao e zero, e isso
-- vale tambem para o resultado esperado.
alter table alavanca.plano_acao alter column resultado_esperado_mes drop not null;

comment on column alavanca.plano_acao.resultado_esperado_mes is
  'Quanto a estrategia vale por mes, em reais, quando da para estimar. NULO quando o ganho e real mas nao e cravavel antes de executar -- nivel de programa, qualidade, decisao estrutural. Nulo e diferente de zero.';

alter table alavanca.plano_acao drop constraint if exists plano_acao_situacao_check;
alter table alavanca.plano_acao add constraint plano_acao_situacao_check
  check (situacao in ('rascunho', 'a_fazer', 'fazendo', 'feito', 'cancelada'));

comment on column alavanca.plano_acao.situacao is
  'rascunho = proposta do sistema, esperando o dono aprovar; a_fazer/fazendo/feito = o ciclo normal; cancelada = descartada. Rascunho e o unico estado que dispensa evidencia, porque ainda esta sendo pensado.';

create or replace function alavanca.plano_acao_exige_evidencia() returns trigger
language plpgsql
as $fn$
begin
  if new.situacao in ('rascunho', 'feito', 'cancelada') then
    return new;
  end if;
  if new.evidencia is null or new.evidencia = '{}'::jsonb then
    raise exception
      'estrategia "%" nao pode ficar ativa sem evidencia', coalesce(new.codigo, new.acao)
      using hint =
        'Grave em evidencia o numero que motivou, no formato '
        '{"metrica": "...", "valor": 0, "unidade": "...", "periodo": "...", "fonte": "..."}. '
        'Se ainda nao ha numero, deixe situacao = ''rascunho''. Ver migrations 022 e 023.';
  end if;
  return new;
end
$fn$;

do $semear$
declare
  v_tenant    uuid;
  v_pizzaria  uuid;
  v_jerrys    uuid;
  v_pastas    uuid;
begin
  select id into v_tenant from alavanca.tenants where slug = 'grupo-le-tre';
  if v_tenant is null then
    raise notice '023: grupo-le-tre nao existe neste banco, nada a semear';
    return;
  end if;
  perform set_config('app.tenant_id', v_tenant::text, true);

  select id into v_pizzaria from alavanca.marcas where tenant_id = v_tenant and slug = 'le-tre-pizzaria';
  select id into v_jerrys   from alavanca.marcas where tenant_id = v_tenant and slug = 'jerrys-burger';
  select id into v_pastas   from alavanca.marcas where tenant_id = v_tenant and slug = 'le-tre-pastas';

  insert into alavanca.plano_acao
    (tenant_id, marca_id, codigo, pilar, acao, hipotese, evidencia, metrica_sucesso,
     valor_alvo, horizonte, revisar_em, confianca, responsavel, prazo, situacao,
     resultado_esperado_mes, origem, fonte, coletado_em)
  values
  -- 1 ------------------------------------------------------------------------
  (v_tenant, v_pizzaria, 'EST-001', 'ifood',
   'Reduzir a promocao bancada pela loja no iFood da Pizzaria',
   'A loja banca mais que o dobro do que o iFood banca. Se o subsidio proprio cair ao nivel do iFood, sobra margem sem o cliente perder desconto, porque a promocao do iFood continua de pe. O risco e perder posicao na vitrine: por isso medir pedido junto, nao so margem.',
   '{"metrica": "promocao bancada pela loja", "valor": 5500.26, "unidade": "BRL", "periodo": "agosto/2026", "fonte": "Toqan, detalhamento do repasse, 21/10/2026", "comparacao": "iFood bancou 2589.33 no mesmo mes", "sobre_faturamento": "9,4% do bruto de 58.474,49"}'::jsonb,
   'promocao bancada pela loja dividida pelo faturamento bruto do iFood, por mes',
   5.0, 'mensal', date '2026-11-10', 'alta',
   'Helio', date '2026-11-30', 'rascunho', 2900.00,
   'REAL', 'Toqan + extrato de Pedidos, 21/10/2026', now()),

  -- 2 ------------------------------------------------------------------------
  (v_tenant, v_jerrys, 'EST-002', 'canal-proprio',
   'Por o pacote de anuncios da Jerry''s dentro de um teto proporcional ao faturamento',
   'O teto diario de R$ 60 do guardrail nao cobre o pacote de Hits, que e cobrado fora da linha do pedido. Em agosto o anuncio comeu 19% do faturamento da loja. Amarrar o teto ao faturamento, e nao a um valor fixo por dia, impede que isso se repita sem ninguem ver.',
   '{"metrica": "pacote de anuncios (Hits/CPV)", "valor": 8295.21, "unidade": "BRL", "periodo": "agosto/2026", "fonte": "Toqan, detalhamento do repasse, 21/10/2026", "sobre_faturamento": "19% do GMV de ~44.000", "comparacao": "Pizzaria gastou 3.908,82 sobre 51.000, ou 7,7%"}'::jsonb,
   'gasto com anuncio dividido pelo faturamento da marca, por mes',
   10.0, 'mensal', date '2026-11-10', 'alta',
   'Helio', date '2026-11-05', 'rascunho', 4000.00,
   'REAL', 'Toqan, detalhamento do repasse, 21/10/2026', now()),

  -- 3 ------------------------------------------------------------------------
  (v_tenant, v_pizzaria, 'EST-003', 'ifood',
   'Derrubar a taxa de pedidos com chamado da Pizzaria abaixo da meta do Super',
   'O Super da Pizzaria esta em nivel 2 de 5 e o unico indicador fora da meta e pedido com chamado, no dobro do teto. Cancelamento ja esta em nivel 5 e a nota esta a 0,2 da meta. Resolver chamado e o caminho mais curto para subir de nivel, e nivel baixo tira visibilidade na busca.',
   '{"metrica": "pedidos com chamado", "valor": 4.97, "unidade": "%", "periodo": "ultimos 3 meses, lido em 21/10/2026", "fonte": "Portal do Parceiro, programa Super", "meta_ifood": "abaixo de 2,5%", "nivel_atual": "2 de 5", "proxima_avaliacao": "10/11/2026"}'::jsonb,
   'percentual de pedidos com chamado no programa Super',
   2.5, 'mensal', date '2026-11-10', 'alta',
   'Helio', date '2026-11-09', 'rascunho', null,
   'REAL', 'Portal do Parceiro, programa Super, 21/10/2026', now()),

  -- 4 ------------------------------------------------------------------------
  (v_tenant, v_pizzaria, 'EST-004', 'ifood',
   'Responder todo acordo de atraso no chat, no mesmo dia',
   'Em sete dias houve tres pedidos de nova previsao de entrega e dois ficaram sem resposta da loja. Cliente sem resposta abre chamado, e chamado e exatamente o indicador que esta derrubando o Super. E a acao mais barata da lista: nao custa dinheiro, custa alguem olhando o chat.',
   '{"metrica": "acordos de atraso sem resposta da loja", "valor": 2, "unidade": "de 3 solicitacoes", "periodo": "07/10 a 13/10/2026", "fonte": "Portal do Parceiro, painel operacional", "variacao": "+100% contra o periodo anterior"}'::jsonb,
   'acordos de atraso sem resposta da loja, por semana',
   0, 'diario', date '2026-10-28', 'alta',
   'Helio', date '2026-10-27', 'rascunho', null,
   'REAL', 'Portal do Parceiro, painel operacional, 21/10/2026', now()),

  -- 5 ------------------------------------------------------------------------
  (v_tenant, v_pastas, 'EST-005', 'lucro',
   'Decidir o plano do iFood da Pastas: crescer o volume ou trocar o plano',
   'A mensalidade e quase a mesma das outras lojas, mas o faturamento da Pastas e um decimo. O mesmo servico custa nove vezes mais em proporcao. Ou o volume sobe e o custo fixo dilui, ou o plano esta grande demais para o tamanho atual da operacao. Sao caminhos opostos e a escolha e do dono.',
   '{"metrica": "mensalidade iFood sobre faturamento", "valor": 2.7, "unidade": "%", "periodo": "agosto/2026", "fonte": "Toqan, detalhamento do repasse, 21/10/2026", "comparacao": "mesma mensalidade pesa 0,3% na Pizzaria", "valores": "R$ 110 sobre ~4.000 contra R$ 150 sobre ~51.000"}'::jsonb,
   'mensalidade dividida pelo faturamento da marca, por mes',
   1.0, 'mensal', date '2026-11-15', 'media',
   'Helio', date '2026-11-15', 'rascunho', null,
   'REAL', 'Toqan, detalhamento do repasse, 21/10/2026', now())

  on conflict do nothing;

  perform set_config('app.tenant_id', '', true);
  raise notice '023: cinco estrategias medidas gravadas como rascunho, para o dono aprovar';
end
$semear$;

commit;
