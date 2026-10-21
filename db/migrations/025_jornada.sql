-- 025_jornada.sql
-- O sistema deixa de observar e passa a conduzir.
--
-- O QUE O DONO DISSE, EM 21/10/2026
--   "O sistema ta acompanhando os dados, beleza, mas a gente tem que configurar
--    para vender. Tem que funcionar tipo num flow: fase 1, fase 2, fase 3, vai
--    seguindo os processos e vai dando certo. Como se fosse um jogo. Os passos
--    sao os mesmos que a gente adaptou na Le Tre e no Jerry's; ele tem que
--    seguir os mesmos passos para chegar no objetivo."
--
-- A REGRA QUE SEPARA ISTO DE UMA LISTA DE TAREFAS COM BARRINHA
--
--   O PASSO E CONCLUIDO POR MEDICAO, NUNCA POR DECLARACAO.
--
-- Se o dono marca sozinho que fez, vira checklist com enfeite de jogo, e todo
-- mundo chega em 100% sem mudar nada na operacao. Se o sistema confere no dado,
-- o progresso significa alguma coisa -- e so ai ele pode ser mostrado numa
-- reuniao de venda sem constrangimento.
--
-- Por isso todo passo carrega `verificacao`: a pergunta em SQL que o proprio
-- banco responde. Passo sem verificacao e passo que o cliente marca, e esse fica
-- explicitamente marcado como `manual` -- existe, mas nao conta para o nivel.
--
-- NAO INVENTAMOS PLACAR: O IFOOD JA TEM UM
-- O programa Super e um placar externo, publico e crivel: nivel 1 a 5, metas
-- declaradas, data de atualizacao. Medido em 21/10 na Pizzaria: nivel 2 de 5,
-- com chamados em 4,97% contra meta de 2,5%. O Mordomo nao compete com isso --
-- ele e o caminho do 2 ao 5. Onde o iFood nao pontua (canal proprio, margem,
-- CRM), a jornada usa a mesma estrutura com metas nossas.
--
-- AS FASES SAO AS QUE A LE TRE PERCORREU DE VERDADE
-- Nao sao etapas inventadas para parecer metodo. Cada uma tem o numero que a
-- Le Tre produziu ao passar por ela, e e isso que torna a jornada vendavel:
-- "voce vai fazer o que este restaurante fez, na ordem em que funcionou".
--
-- Idempotente.

begin;

-- ---------------------------------------------------------------------------
-- 1. as fases
-- ---------------------------------------------------------------------------
create table if not exists alavanca.jornada_fase (
  numero      smallint primary key,
  slug        text not null unique,
  nome        text not null,
  promessa    text not null,  -- o que o dono ganha ao terminar a fase
  porque      text not null,  -- por que ela vem nesta ordem e nao em outra
  prova       text            -- o que a Le Tre mediu ao passar por aqui
);

comment on table alavanca.jornada_fase is
  'As fases da jornada, na ordem em que funcionaram na Le Tre. A ordem nao e estetica: cada fase depende do que a anterior tornou visivel.';
comment on column alavanca.jornada_fase.prova is
  'O numero que a Le Tre produziu nesta fase. E o que transforma a jornada de promessa em case.';

-- ---------------------------------------------------------------------------
-- 2. os passos
-- ---------------------------------------------------------------------------
create table if not exists alavanca.jornada_passo (
  slug          text primary key,
  fase          smallint not null references alavanca.jornada_fase (numero),
  ordem         smallint not null,
  nome          text not null,
  o_que_fazer   text not null,
  por_que       text not null,
  -- Como o sistema sabe que foi feito. SQL que devolve uma linha com
  -- (feito boolean, medido text). Nulo = o passo e manual.
  verificacao   text,
  tipo          text not null check (tipo in ('medido', 'manual')),
  peso          smallint not null default 1,
  unique (fase, ordem)
);

comment on column alavanca.jornada_passo.verificacao is
  'SQL que o proprio banco roda para saber se o passo foi cumprido. Devolve (feito boolean, medido text). Passo sem isto e tipo=manual e NAO conta para o nivel -- o cliente marcar que fez nao e o mesmo que ter feito.';

do $ck$
begin
  if not exists (select 1 from pg_constraint where conname = 'passo_medido_tem_verificacao') then
    alter table alavanca.jornada_passo add constraint passo_medido_tem_verificacao
      check (tipo <> 'medido' or verificacao is not null);
  end if;
end
$ck$;

-- ---------------------------------------------------------------------------
-- 3. onde cada cliente esta
-- ---------------------------------------------------------------------------
create table if not exists alavanca.tenant_passo (
  tenant_id    uuid not null references alavanca.tenants (id) on delete cascade,
  passo_slug   text not null references alavanca.jornada_passo (slug) on delete cascade,
  marca_id     uuid references alavanca.marcas (id) on delete cascade,
  feito        boolean not null default false,
  medido       text,          -- o numero que provou, no momento em que provou
  verificado_em timestamptz,
  primary key (tenant_id, passo_slug, marca_id)
);

alter table alavanca.tenant_passo enable row level security;

do $rls$
begin
  if not exists (select 1 from pg_policies where schemaname = 'alavanca'
                   and tablename = 'tenant_passo' and policyname = 'tenant_isolado') then
    create policy tenant_isolado on alavanca.tenant_passo
      using (tenant_id = current_setting('app.tenant_id', true)::uuid)
      with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
  end if;
end
$rls$;

grant select on alavanca.jornada_fase to alavanca_app;
grant select on alavanca.jornada_passo to alavanca_app;
grant select on alavanca.tenant_passo to alavanca_app;

-- ---------------------------------------------------------------------------
-- 4. as cinco fases, como a Le Tre percorreu
-- ---------------------------------------------------------------------------
insert into alavanca.jornada_fase (numero, slug, nome, promessa, porque, prova) values
 (0, 'setup', 'Setup',
  'Tudo conectado: contas, numero, cardapio e os numeros do dono',
  'E a unica fase que NOS fazemos junto com o cliente, e e por isso que ela e cobrada a parte. Nenhum passo das fases seguintes funciona sem acesso -- e acesso nao se automatiza, se pede, se autoriza e se confere.',
  'Na Le Tre o setup levou um dia e revelou tres coisas antes de qualquer tela: uma loja inteira faltando no sistema, duas integracoes de terceiros ativas que o dono nao lembrava de ter autorizado, e um relatorio diario quebrado havia onze dias.'),

 (1, 'enxergar', 'Enxergar',
  'Saber o que realmente entra e o que realmente sai, por canal e por marca',
  'Nao da para consertar o que ninguem mede. Toda fase seguinte depende de um numero que so existe depois desta.',
  'Na Le Tre, a Jerry''s tinha R$ 89.125 em vendas que o sistema anterior nao enxergava -- tres meses inteiros de uma loja.'),

 (2, 'parar-de-sangrar', 'Parar de sangrar',
  'Separar o que o canal cobra do que voce escolheu gastar, e cortar o que nao paga',
  'Vem antes de crescer porque e mais barato: parar de perder nao exige vender mais um pedido.',
  'Na Le Tre, de cada R$ 100 que "o iFood ficava", quase metade era decisao da propria loja: R$ 5.500 de promocao bancada e R$ 8.295 de anuncio num mes so.'),

 (3, 'operar-bem', 'Operar bem',
  'Subir no programa Super do iFood, que e visibilidade na busca',
  'O placar e do iFood, nao nosso: nivel baixo tira a loja da vitrine, e nenhuma campanha compensa isso.',
  'Na Pizzaria o unico indicador fora da meta era pedido com chamado, em 4,97% contra teto de 2,5% -- e dois acordos de atraso sem resposta em sete dias explicavam parte.'),

 (4, 'canal-proprio', 'Crescer o que e seu',
  'Mover pedido do marketplace para o canal proprio, onde a taxa e outra',
  'So faz sentido depois de operar bem: mandar cliente para um site de uma loja mal avaliada queima o cliente duas vezes.',
  'Medido na Le Tre: a taxa do canal proprio e 1,05%, contra 30,9% do iFood no mesmo periodo.'),

 (5, 'automatizar', 'Deixar rodando',
  'O atendimento, o disparo e o relatorio acontecem sem alguem lembrar',
  'Automatizar antes de acertar o processo so faz o erro acontecer mais rapido e em escala.',
  null)
on conflict (numero) do update set
  slug = excluded.slug, nome = excluded.nome, promessa = excluded.promessa,
  porque = excluded.porque, prova = excluded.prova;

-- ---------------------------------------------------------------------------
-- 5. os passos, com a pergunta que o banco responde sozinho
-- ---------------------------------------------------------------------------
insert into alavanca.jornada_passo (slug, fase, ordem, nome, o_que_fazer, por_que, tipo, verificacao, peso) values

 -- Fase 0: o que a implantacao faz COM o cliente. Nenhum destes se automatiza:
 -- sao acessos, autorizacoes e numeros que so o dono tem.
 ('acesso-ifood', 0, 1,
  'Acesso ao portal do iFood',
  'Conta Dono liberada e o aplicativo autorizado por codigo em cada loja',
  'Sem isso nao ha extrato de pedido, e sem extrato a taxa volta a ser chute.',
  'manual', null, 3),

 ('acesso-canal-proprio', 0, 2,
  'Acesso a plataforma do canal proprio',
  'Painel do site de pedidos liberado, com historico exportavel',
  'E a unica fonte do canal proprio; o espelho gravado por automacao sempre comeca depois e perde o inicio.',
  'manual', null, 3),

 ('meta-conectada', 0, 3,
  'Conta de anuncios e numero do WhatsApp conectados',
  'Conta na Meta, aplicativo criado, numero oficial ligado e verificado',
  'E o que permite medir midia e atender; e e o passo mais demorado, porque depende de verificacao de terceiro.',
  'manual', null, 3),

 ('cadastro-marcas', 0, 4,
  'Marcas e canais cadastrados',
  'Cada loja e cada canal de venda criados no sistema',
  'E a hierarquia que faz o resto existir: sem marca e canal, nao ha onde pendurar venda nem margem.',
  'medido',
  $v$select count(*) > 0 as feito,
            count(distinct m.id)::text || ' marcas, ' || count(c.id)::text || ' canais' as medido
       from alavanca.marcas m left join alavanca.canais c on c.marca_id = m.id
      where m.tenant_id = $1$v$, 2),

 ('cardapio-carregado', 0, 5,
  'Cardapio e ficha tecnica carregados',
  'Produtos com preco e custo, para a margem sair do palpite',
  'Sem ficha tecnica o CMV e estimado por percentual, e percentual medio esconde o prato que da prejuizo.',
  'medido',
  $v$select count(*) > 0 as feito, count(*)::text || ' fichas tecnicas' as medido
       from alavanca.ficha_tecnica where tenant_id = $1$v$, 2),

 ('numeros-do-dono', 0, 6,
  'Os numeros que so o dono sabe',
  'Imposto sobre a venda, custo de entrega por pedido e custo fixo do mes',
  'Sao tres numeros que nenhuma integracao entrega e sem os quais a margem fica otimista.',
  'manual', null, 2),

 ('venda-ifood-carregada', 1, 1,
  'Venda do iFood no sistema',
  'Importar o extrato de pedidos do portal, todas as lojas',
  'E a unica fonte que traz taxa por pedido; o relatorio agregado nao serve para margem.',
  'medido',
  $v$select count(*) > 0 as feito, count(*)::text || ' dias de venda de iFood' as medido
       from alavanca.venda_dia v join alavanca.canais c on c.id = v.canal_id
      where v.tenant_id = $1 and c.tipo = 'ifood'$v$, 2),

 ('venda-propria-carregada', 1, 2,
  'Venda do canal proprio no sistema',
  'Importar o historico de pedidos do site',
  'Sem ele a comparacao entre canais nao existe, e e a comparacao que sustenta a fase 4.',
  'medido',
  $v$select count(*) > 0 as feito, count(*)::text || ' dias de venda propria' as medido
       from alavanca.venda_dia v join alavanca.canais c on c.id = v.canal_id
      where v.tenant_id = $1 and c.tipo = 'proprio'$v$, 2),

 ('todas-as-marcas', 1, 3,
  'Nenhuma loja faltando',
  'Conferir que toda marca cadastrada tem venda registrada',
  'Uma loja ausente nao aparece como zero: ela some da conta do grupo e ninguem percebe.',
  'medido',
  $v$select count(*) = 0 as feito,
            coalesce(string_agg(m.nome, ', '), 'nenhuma faltando') as medido
       from alavanca.marcas m
      where m.tenant_id = $1 and m.ativo
        and not exists (select 1 from alavanca.venda_dia v
                         join alavanca.canais c on c.id = v.canal_id
                        where c.marca_id = m.id)$v$, 3),

 ('funcionamento-declarado', 1, 4,
  'Horario de funcionamento declarado',
  'Dizer em que dias cada marca abre',
  'Sem isso, dia fechado entra como dia que vendeu zero e estraga toda media e toda meta.',
  'medido',
  $v$select count(*) > 0 as feito, count(*)::text || ' linhas de funcionamento' as medido
       from alavanca.marca_funcionamento where tenant_id = $1$v$, 1),

 ('taxa-apurada', 2, 1,
  'Taxa do canal apurada, nao estimada',
  'Trazer a taxa real por pedido do extrato, em vez de um percentual fixo',
  'Take fixo chutado esconde justamente a parte que da para mudar.',
  'medido',
  $v$select count(*) > 0 as feito, count(*)::text || ' meses com taxa apurada' as medido
       from alavanca.canal_taxa_mes where tenant_id = $1 and take_rate_pct is not null$v$, 3),

 ('promocao-separada', 2, 2,
  'Promocao bancada pela loja separada da taxa',
  'Reconciliar o repasse e isolar quanto a loja subsidiou de desconto',
  'E o maior componente controlavel e quase sempre aparece somado a comissao, como se fosse imposto.',
  'manual', null, 3),

 ('teto-de-anuncio', 2, 3,
  'Teto de anuncio proporcional ao faturamento',
  'Amarrar o limite de midia a um percentual da venda, nao a um valor fixo por dia',
  'Teto em reais por dia nao cobre pacote cobrado por fora, e foi assim que uma loja gastou 19% do faturamento em anuncio sem alarme.',
  'medido',
  $v$select count(*) > 0 as feito, count(*)::text || ' marcas com guardrail' as medido
       from alavanca.brand_guardrails where tenant_id = $1$v$, 2),

 ('meta-definida', 3, 1,
  'Meta por dia da semana definida',
  'O dono dita a meta; o sistema nao inventa',
  'Sem meta nao existe semaforo, e sem semaforo o painel e so um extrato bonito.',
  'medido',
  $v$select count(*) > 0 as feito, count(*)::text || ' metas vigentes' as medido
       from alavanca.meta_dia_semana where tenant_id = $1 and vigente_ate is null$v$, 2),

 ('operacao-medida', 3, 2,
  'Tempo de entrega e cancelamento medidos',
  'Carregar os indicadores operacionais do canal',
  'Sao eles que movem o nivel no programa Super, e Super baixo tira visibilidade na busca.',
  'medido',
  $v$select count(*) > 0 as feito, count(*)::text || ' dias de operacao' as medido
       from alavanca.ifood_operacao_dia where tenant_id = $1$v$, 2),

 ('chamados-na-meta', 3, 3,
  'Pedidos com chamado dentro da meta do Super',
  'Derrubar a taxa de chamado abaixo de 2,5%',
  'Na Le Tre era o unico indicador fora da meta, e sozinho segurava a loja no nivel 2 de 5.',
  'manual', null, 3),

 ('consentimento-registrado', 4, 1,
  'Consentimento com data registrado',
  'Importar a base com a data em que cada cliente aceitou receber',
  'Sem data de aceite nao ha disparo legal, e nenhum sistema contorna isso.',
  'medido',
  $v$select count(*) > 0 as feito,
            count(*) filter (where estado = 'opt_in')::text || ' com opt-in de ' ||
            count(*)::text || ' registros' as medido
       from alavanca.consents where tenant_id = $1$v$, 3),

 ('primeira-campanha', 4, 2,
  'Primeira campanha enviada para base propria',
  'Disparar para quem autorizou, dentro da regua',
  'E o primeiro retorno visivel do canal proprio, e o que justifica o resto da fase.',
  'medido',
  $v$select count(*) > 0 as feito, count(*)::text || ' envios registrados' as medido
       from alavanca.sniper_envios where tenant_id = $1$v$, 2),

 ('gerente-virtual-ligado', 5, 1,
  'Gerente virtual ligado',
  'O fechamento do dia chega no WhatsApp do dono',
  'E o que faz o dono usar o sistema sem abrir o sistema.',
  'manual', null, 2),

 ('vendedor-ligado', 5, 2,
  'Vendedor de IA atendendo',
  'O atendimento do WhatsApp responde e fecha pedido sozinho',
  'Fecha o ciclo: o canal proprio cresce sem depender de alguem olhando o celular.',
  'manual', null, 2)

on conflict (slug) do update set
  fase = excluded.fase, ordem = excluded.ordem, nome = excluded.nome,
  o_que_fazer = excluded.o_que_fazer, por_que = excluded.por_que,
  tipo = excluded.tipo, verificacao = excluded.verificacao, peso = excluded.peso;

-- ---------------------------------------------------------------------------
-- 6. a leitura: onde o cliente esta
-- ---------------------------------------------------------------------------
create or replace view alavanca.vw_jornada as
  select f.numero as fase, f.nome as fase_nome, f.promessa, f.prova,
         p.slug, p.ordem, p.nome, p.o_que_fazer, p.por_que, p.tipo, p.peso,
         tp.tenant_id, coalesce(tp.feito, false) as feito, tp.medido, tp.verificado_em
    from alavanca.jornada_fase f
    join alavanca.jornada_passo p on p.fase = f.numero
    left join alavanca.tenant_passo tp
           on tp.passo_slug = p.slug and tp.marca_id is null;

comment on view alavanca.vw_jornada is
  'A jornada inteira com o estado do cliente em cada passo. Passo sem linha em tenant_passo e passo nunca verificado -- diferente de passo verificado e nao cumprido.';

grant select on alavanca.vw_jornada to alavanca_app;

commit;
