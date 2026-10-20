-- 014_seed_le_tre.sql
-- Cadastro do tenant 1: o grupo Le Tre Farine.
--
-- O que ENTRA aqui: estrutura (tenant, marcas, canais, ids externos), limites
-- de alerta, guardrails do PDCA, mapa campanha -> marca, definicao dos
-- segmentos de CRM e o catalogo de acoes sugeridas.
--
-- O que NAO entra aqui, por regra:
--   - nenhum dado pessoal de cliente final (telefone, nome, endereco);
--   - nenhuma senha, token ou chave;
--   - nenhum numero de venda. Venda vem do importador, nao de migration.
--
-- Cada linha declara origem / fonte / coletado_em. Onde o numero e exemplo (os
-- segmentos de CRM e as acoes sugeridas ainda nao validados com o dono), a
-- origem e 'EXEMPLO' de proposito.
--
-- Idempotente: on conflict do update nas chaves naturais.

begin;

-- As migrations rodam como dono do banco, que passa por cima da RLS. Se esta
-- linha der erro, a conexao esta usando a role errada (a de aplicacao).
set local row_security = off;

do $seed$
declare
  v_tenant   uuid;
  v_pizzaria uuid;
  v_pastas   uuid;
  v_jerrys   uuid;
  v_fonte_cad   text := 'Cadastro montado em 19/10/2026 a partir de painel/src/data/clientes/grupo-le-tre/cliente.json e do fechamento de agosto/2026 (dados-fonte/ifood_clientefiel_fechamento_liquido_2026-08.md).';
  v_fonte_guard text := 'referencia/pdca/guardrails.json, calibragem de 28/08/2026 a 16/10/2026.';
  v_agora   timestamptz := timestamptz '2026-10-19 00:00:00-03';
begin

  -- -------------------------------------------------------------------------
  -- tenant
  -- -------------------------------------------------------------------------
  insert into alavanca.tenants (slug, nome, segmento, imposto_pct, nota_margem, origem, fonte, coletado_em)
  values (
    'grupo-le-tre',
    'Le Tre Farine',
    'Delivery multimarca: pizzaria, pastas e hamburgueria',
    0,
    'Margem estimada: CMV pela media das fichas de 90 dias (Le Tre 22,2%); a Pastas nao tem ficha e usa a media das pizzas. Taxa de cada loja pelo fechamento de agosto. Ainda sem imposto e sem custo de entrega: [PREENCHER].',
    'REAL', v_fonte_cad, v_agora
  )
  on conflict (slug) do update
    set nome = excluded.nome,
        segmento = excluded.segmento,
        nota_margem = excluded.nota_margem,
        fonte = excluded.fonte
  returning id into v_tenant;

  if v_tenant is null then
    select id into v_tenant from alavanca.tenants where slug = 'grupo-le-tre';
  end if;

  -- -------------------------------------------------------------------------
  -- marcas (operacoes)
  -- -------------------------------------------------------------------------
  -- O dono confirmou em 19/10/2026: e a mesma operacao, so muda a marca.
  insert into alavanca.marcas (tenant_id, slug, nome, segmento, ordem, origem, fonte, coletado_em) values
    (v_tenant, 'le-tre-pizzaria', 'Le Tre Farine Pizzaria', 'Pizzaria',      1, 'REAL', v_fonte_cad, v_agora),
    (v_tenant, 'le-tre-pastas',   'Le Tre Farine Pastas',   'Massas',        2, 'REAL', v_fonte_cad, v_agora),
    (v_tenant, 'jerrys-burger',   'Jerry''s Burger',        'Hamburgueria',  3, 'REAL', v_fonte_cad, v_agora)
  on conflict (tenant_id, slug) do update
    set nome = excluded.nome, segmento = excluded.segmento, ordem = excluded.ordem;

  select id into v_pizzaria from alavanca.marcas where tenant_id = v_tenant and slug = 'le-tre-pizzaria';
  select id into v_pastas   from alavanca.marcas where tenant_id = v_tenant and slug = 'le-tre-pastas';
  select id into v_jerrys   from alavanca.marcas where tenant_id = v_tenant and slug = 'jerrys-burger';

  -- -------------------------------------------------------------------------
  -- canais (uma loja por linha)
  -- -------------------------------------------------------------------------
  -- taxa_pct das tres lojas Le Tre: a mesma do cliente.json que o painel usa
  -- hoje. taxa_pct do Jerry's: take-rate medido no fechamento de agosto/2026
  -- (iFood 50,8%, Cliente Fiel 4,1%). Quando o importador ler o fechamento
  -- mes a mes, a taxa de verdade passa a viver em canal_taxa_mes.
  insert into alavanca.canais
    (tenant_id, marca_id, slug, nome, tipo, taxa_pct, custo_por_pedido, ordem,
     ext_saipos_marca, origem, fonte, coletado_em)
  values
    (v_tenant, v_pizzaria, 'letre-ifood-pizzaria', 'iFood Pizzaria', 'ifood',   0.246200, 0, 1, 'PZ',  'REAL', v_fonte_cad, v_agora),
    (v_tenant, v_pastas,   'letre-ifood-pastas',   'iFood Pastas',   'ifood',   0.379400, 0, 2, 'PA',  'REAL', v_fonte_cad, v_agora),
    (v_tenant, v_pizzaria, 'letre-site',           'Site',           'proprio', 0.010800, 0, 3, 'LCF', 'REAL', v_fonte_cad, v_agora),
    (v_tenant, v_jerrys,   'jerrys-ifood',         'iFood Jerry''s', 'ifood',   0.508000, 0, 4, 'JIF', 'REAL', v_fonte_cad, v_agora),
    (v_tenant, v_jerrys,   'jerrys-site',          'Site Jerry''s',  'proprio', 0.041000, 0, 5, 'JCF', 'REAL', v_fonte_cad, v_agora)
  on conflict (tenant_id, slug) do update
    set marca_id = excluded.marca_id,
        nome = excluded.nome,
        tipo = excluded.tipo,
        taxa_pct = excluded.taxa_pct,
        ordem = excluded.ordem,
        ext_saipos_marca = excluded.ext_saipos_marca,
        fonte = excluded.fonte;

  -- -------------------------------------------------------------------------
  -- limites de alerta (raiz do tenant)
  -- -------------------------------------------------------------------------
  insert into alavanca.limites_alerta
    (tenant_id, marca_id, meta_minima_pct, margem_minima_pct, queda_pedidos_pct,
     ifood_maximo_pct, queda_ticket_pct, origem, fonte, coletado_em)
  select v_tenant, null, 0.8000, 0.3500, 0.2000, 0.6000, 0.1000, 'REAL', v_fonte_cad, v_agora
  where not exists (
    select 1 from alavanca.limites_alerta where tenant_id = v_tenant and marca_id is null
  );

  -- -------------------------------------------------------------------------
  -- guardrails: raiz do tenant (hoje calibrada na Le Tre Farine)
  -- -------------------------------------------------------------------------
  insert into alavanca.brand_guardrails (
    tenant_id, marca_id, ticket_medio, margem_contribuicao, cmv_adotado,
    roas_break_even, roas_alvo, cpa_teto, teto_gasto_diario,
    custos_fixos_mes, ponto_equilibrio_receita_mes, valor_pedido_migrado,
    avalia_por, janela_venda, geografia, corte_automatico, nota,
    origem, fonte, coletado_em
  )
  select
    v_tenant, null,
    111.96, 0.6460, 0.2180,
    1.5500, 3.1000, 72.35, 80.00,
    42483.92, 72152.70, 43.52,
    'roas',
    '{"0":[19,22],"1":[19,22],"2":[19,22],"3":[19,22],"4":[19,22],"5":[19,22],"6":[19,22]}'::jsonb,
    '{"loja_lat":-19.9591387,"loja_lon":-43.9349669,"raio_km_maximo":6,"loja_endereco":"Rua Patagonia, Sion, Belo Horizonte"}'::jsonb,
    '{"gasto_sem_compra":60.0,"cpa_ruim_min_gasto":90.0,"dias_avaliacao_roas":7,"roas_corte":1.5}'::jsonb,
    'Ticket do canal proprio (Cliente Fiel julho/2026). CMV de 21,8% e o ritmo de agosto, primeiro mes com compras sem nota na planilha. Janela 19h-22h desde 28/08/2026.',
    'REAL', v_fonte_guard, v_agora
  where not exists (
    select 1 from alavanca.brand_guardrails where tenant_id = v_tenant and marca_id is null
  );

  -- Le Tre Farine Pizzaria: so o teto de gasto diario muda.
  insert into alavanca.brand_guardrails
    (tenant_id, marca_id, teto_gasto_diario, avalia_por, nota, origem, fonte, coletado_em)
  select v_tenant, v_pizzaria, 210.00, 'roas',
    'Teto subiu de 150 para 210 em 28/08/2026: o remarketing quente ja rodou R$ 200-250/dia com ROAS 2,2-3,5.',
    'REAL', v_fonte_guard, v_agora
  where not exists (
    select 1 from alavanca.brand_guardrails where tenant_id = v_tenant and marca_id = v_pizzaria
  );

  -- Jerry's: nao pode ser julgado por ROAS hoje (nenhuma compra atribuida).
  -- ticket, margem, roas e cpa sao ANULADOS de proposito - nao herdam a raiz.
  insert into alavanca.brand_guardrails (
    tenant_id, marca_id, teto_gasto_diario, avalia_por,
    custo_visita_teto, custo_carrinho_teto, dias_sem_midia,
    corte_automatico, anulados, nota, origem, fonte, coletado_em
  )
  select
    v_tenant, v_jerrys, 60.00, 'proxy',
    0.60, 20.00, '{1,2,3}'::smallint[],
    '{"gasto_sem_visita":25.0}'::jsonb,
    '{ticket_medio,margem_contribuicao,roas_break_even,roas_alvo,cpa_teto,custo_conversa_teto}'::text[],
    'Avaliado por proxy (visita e carrinho), nao por ROAS: volume abaixo do minimo de aprendizado da Meta. Segunda a quarta o playbook e nao anunciar.',
    'REAL', v_fonte_guard, v_agora
  where not exists (
    select 1 from alavanca.brand_guardrails where tenant_id = v_tenant and marca_id = v_jerrys
  );

  -- -------------------------------------------------------------------------
  -- campaign_brand_map: a conta do Meta e unica para as duas marcas
  -- -------------------------------------------------------------------------
  insert into alavanca.campaign_brand_map (tenant_id, marca_id, tipo_padrao, padrao, campo, prioridade, nota) values
    (v_tenant, v_jerrys,   'contem', 'jerry', 'campanha', 10, 'Mesma regra do lib_meta.marca() de hoje.'),
    (v_tenant, v_jerrys,   'contem', 'jry',   'campanha', 11, 'Prefixo usado nas campanhas novas do Jerry''s (JRY | VENDAS | ...).'),
    (v_tenant, v_pizzaria, 'contem', 'le tre', 'campanha', 20, 'Fallback explicito; sem match a marca padrao do tenant e usada.'),
    (v_tenant, v_pizzaria, 'contem', 'lt-',    'campanha', 21, 'Prefixo LT- das campanhas semanais da Le Tre.')
  on conflict (tenant_id, campo, padrao) do update
    set marca_id = excluded.marca_id, prioridade = excluded.prioridade, nota = excluded.nota;

  -- -------------------------------------------------------------------------
  -- tenant_config
  -- -------------------------------------------------------------------------
  insert into alavanca.tenant_config (tenant_id, chave, valor, descricao) values
    (v_tenant, 'midia.marca_padrao', to_jsonb(v_pizzaria::text),
     'Marca usada quando nenhuma regra de campaign_brand_map casa com o nome da campanha.'),
    (v_tenant, 'crm.custo_por_mensagem', '0.35'::jsonb,
     'Custo por mensagem de WhatsApp usado na conta de retorno dos disparos. [CONFIRMAR com o provedor].'),
    (v_tenant, 'canal.cliente_fiel_le_tre',
     '{"canal":"letre-site","cobre":["le-tre-pizzaria","le-tre-pastas"],"atribuido_a":"le-tre-pizzaria"}'::jsonb,
     'O Cliente Fiel da Le Tre (marca LCF no Saipos) atende Pizzaria e Pastas, mas esta atribuido a Pizzaria. Separar quando a fonte permitir.'),
    (v_tenant, 'comanda.hora_envio', '"07:00"'::jsonb,
     'Hora em que a comanda do dia anterior e enviada no WhatsApp.'),
    (v_tenant, 'consentimento.base_legada',
     '{"estado":"legado_sem_registro","linhas_na_origem":2092,"tabela_origem":"cliente_memoria","decidido":false}'::jsonb,
     'A base herdada do n8n nunca teve opt-in documentado. Entra como legado_sem_registro ate o dono decidir.')
  on conflict (tenant_id, chave) do update
    set valor = excluded.valor, descricao = excluded.descricao;

  -- -------------------------------------------------------------------------
  -- segmentos de CRM (definicao; os numeros ainda sao do esboco)
  -- -------------------------------------------------------------------------
  insert into alavanca.crm_segmento
    (tenant_id, marca_id, codigo, nome, criterio, regra, acao_sugerida, ordem, origem, fonte, coletado_em)
  values
    (v_tenant, null, 'novos', 'Novos', '1o pedido nos ultimos 30 dias',
     '{"primeiro_pedido_ha_dias_max":30}'::jsonb,
     'Mandar boas-vindas com cupom do 2o pedido no site', 1,
     'EXEMPLO', 'Esboco do painel (crm.json). Criterios ainda nao validados com o dono.', v_agora),
    (v_tenant, null, 'recorrentes', 'Recorrentes', '2 ou mais pedidos em 90 dias',
     '{"pedidos_90d_min":2}'::jsonb,
     'Avisar lancamentos e o prato da semana', 2,
     'EXEMPLO', 'Esboco do painel (crm.json). Criterios ainda nao validados com o dono.', v_agora),
    (v_tenant, null, 'vip', 'VIP', '5 ou mais pedidos em 90 dias ou acima de R$ 600',
     '{"pedidos_90d_min":5,"valor_90d_min":600}'::jsonb,
     'Convite antecipado e mimo na entrega, sem desconto', 3,
     'EXEMPLO', 'Esboco do painel (crm.json). Criterios ainda nao validados com o dono.', v_agora),
    (v_tenant, null, 'em-risco', 'Em risco', 'Sem pedir ha 30 a 60 dias',
     '{"dias_sem_pedir_min":30,"dias_sem_pedir_max":60}'::jsonb,
     'Oferta do prato favorito para voltar esta semana', 4,
     'EXEMPLO', 'Esboco do painel (crm.json). Criterios ainda nao validados com o dono.', v_agora),
    (v_tenant, null, 'sumidos', 'Sumidos', 'Sem pedir ha mais de 60 dias',
     '{"dias_sem_pedir_min":61}'::jsonb,
     'Uma mensagem de reativacao por mes, no maximo', 5,
     'EXEMPLO', 'Esboco do painel (crm.json). Criterios ainda nao validados com o dono.', v_agora)
  on conflict (tenant_id, codigo) do update
    set nome = excluded.nome, criterio = excluded.criterio, regra = excluded.regra,
        acao_sugerida = excluded.acao_sugerida, ordem = excluded.ordem;

  -- -------------------------------------------------------------------------
  -- acoes sugeridas por tipo de alerta (catalogo da comanda do dia)
  -- -------------------------------------------------------------------------
  insert into alavanca.acao_sugerida (tenant_id, gatilho, ordem, texto, origem, fonte, coletado_em) values
    (v_tenant, 'meta',   1, 'Ligar o anuncio do jantar as 18h para recuperar o dia', 'EXEMPLO', 'Esboco do painel (plano.json).', v_agora),
    (v_tenant, 'meta',   2, 'Disparar a oferta do dia para quem tem opt-in e nao pede ha 30 dias', 'EXEMPLO', 'Esboco do painel (plano.json).', v_agora),
    (v_tenant, 'margem', 1, 'Revisar a promocao do iFood que mais vendeu ontem', 'EXEMPLO', 'Esboco do painel (plano.json).', v_agora),
    (v_tenant, 'margem', 2, 'Conferir o preco do queijo na ultima nota fiscal', 'EXEMPLO', 'Esboco do painel (plano.json).', v_agora),
    (v_tenant, 'pedidos',1, 'Conferir se a loja ficou pausada no iFood ontem', 'EXEMPLO', 'Esboco do painel (plano.json).', v_agora),
    (v_tenant, 'pedidos',2, 'Mandar mensagem para quem pediu no mesmo dia da semana passada', 'EXEMPLO', 'Esboco do painel (plano.json).', v_agora),
    (v_tenant, 'ifood',  1, 'Mandar cupom do site para quem pediu no iFood esta semana', 'EXEMPLO', 'Esboco do painel (plano.json).', v_agora),
    (v_tenant, 'ifood',  2, 'Colocar o QR do site no folheto da sacola do iFood', 'EXEMPLO', 'Esboco do painel (plano.json).', v_agora),
    (v_tenant, 'ticket', 1, 'Oferecer borda recheada em toda pizza grande hoje', 'EXEMPLO', 'Esboco do painel (plano.json).', v_agora),
    (v_tenant, 'ticket', 2, 'Destacar o combo de maior margem no topo do cardapio', 'EXEMPLO', 'Esboco do painel (plano.json).', v_agora),
    (v_tenant, 'padrao', 1, 'Destacar no iFood a pizza de maior margem', 'EXEMPLO', 'Esboco do painel (plano.json).', v_agora),
    (v_tenant, 'padrao', 2, 'Postar story do prato do dia com link do site', 'EXEMPLO', 'Esboco do painel (plano.json).', v_agora),
    (v_tenant, 'padrao', 3, 'Conferir se os pedidos de ontem foram baixados no PDV', 'EXEMPLO', 'Esboco do painel (plano.json).', v_agora)
  on conflict (tenant_id, gatilho, texto) do update set ordem = excluded.ordem;

  raise notice 'Tenant Le Tre semeado: %', v_tenant;
end
$seed$;

commit;
