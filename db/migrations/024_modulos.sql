-- 024_modulos.sql
-- O Mordomo e uma plataforma de modulos, e o catalogo precisa existir no banco.
--
-- O QUE O DONO DESCREVEU, EM 21/10/2026
--   "Tem que ter um modulo que o cara conecta o KDS dele. Toda a parte de
--    trafego pago, campanha de WhatsApp, tudo dividido em modulos, para ele ter
--    sucesso na operacao. Cada modulo responsavel por um processo."
--
-- POR QUE ISTO VIRA TABELA E NAO LISTA NO CODIGO
-- Porque e a diferenca entre vender um produto e vender uma pasta de scripts.
-- Com catalogo em tabela: o cliente novo liga modulo por modulo, a tela sabe o
-- que mostrar e o que esconder, o comercial sabe o que esta vendendo, e o
-- roadmap para de morar em conversa. Sem ele, "modulo" e so uma palavra na
-- reuniao.
--
-- A REGRA QUE FAZ ESTE CATALOGO VALER ALGUMA COISA
--   O estado de cada modulo e MEDIDO, nao desejado.
--   'operando'     tem codigo, tem dado real passando, da para demonstrar hoje
--   'parcial'      existe, mas com buraco conhecido, declarado em `limitacao`
--   'no_n8n'       funciona, mas mora nos fluxos do Helio e ainda nao e produto
--   'planejado'    nao existe linha de codigo
--
-- Um catalogo que chama de pronto o que nao esta e pior do que nao ter catalogo:
-- vira promessa de venda que a implantacao nao cumpre. E a mesma disciplina das
-- migrations 017 e 022 -- nao afirmar com mais certeza do que se tem.
--
-- Idempotente.

begin;

create table if not exists alavanca.modulo (
  slug        text primary key,
  nome        text not null,
  pilar       text,
  promessa    text not null,   -- o que o modulo entrega ao dono, em uma frase
  processo    text not null,   -- que parte da operacao ele assume
  estado      text not null check (estado in ('operando', 'parcial', 'no_n8n', 'planejado')),
  limitacao   text,            -- o buraco conhecido; obrigatorio quando parcial
  depende_de  text[],          -- outros modulos ou integracoes que precisam existir antes
  ordem       smallint not null default 0,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table alavanca.modulo is
  'Catalogo do produto. O estado e medido, nao desejado: operando = da para demonstrar hoje; parcial = tem buraco declarado; no_n8n = funciona mas mora nos fluxos do dono e ainda nao e produto; planejado = nao existe codigo. Catalogo que chama de pronto o que nao esta vira promessa que a implantacao nao cumpre.';
comment on column alavanca.modulo.limitacao is
  'O que falta, em uma frase que o comercial consiga repetir sem mentir. Obrigatorio quando o estado e parcial.';

do $ck$
begin
  if not exists (select 1 from pg_constraint where conname = 'modulo_parcial_declara_limitacao') then
    alter table alavanca.modulo add constraint modulo_parcial_declara_limitacao
      check (estado <> 'parcial' or (limitacao is not null and length(limitacao) > 10));
  end if;
end
$ck$;

-- Que modulos cada cliente tem ligados.
create table if not exists alavanca.tenant_modulo (
  tenant_id   uuid not null references alavanca.tenants (id) on delete cascade,
  modulo_slug text not null references alavanca.modulo (slug) on delete cascade,
  ativo       boolean not null default false,
  ativado_em  timestamptz,
  nota        text,
  primary key (tenant_id, modulo_slug)
);

comment on table alavanca.tenant_modulo is
  'Que modulos estao ligados para cada cliente. E o que permite o mesmo deploy atender restaurantes diferentes sem clonar codigo -- a alternativa seria um sistema por cliente, que e o que estamos substituindo.';

alter table alavanca.tenant_modulo enable row level security;

do $rls$
begin
  if not exists (select 1 from pg_policies where schemaname = 'alavanca'
                   and tablename = 'tenant_modulo' and policyname = 'tenant_isolado') then
    create policy tenant_isolado on alavanca.tenant_modulo
      using (tenant_id = current_setting('app.tenant_id', true)::uuid)
      with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
  end if;
end
$rls$;

grant select on alavanca.modulo to alavanca_app;
grant select on alavanca.tenant_modulo to alavanca_app;

-- ---------------------------------------------------------------------------
-- O catalogo de hoje, 21/10/2026, com o estado medido
-- ---------------------------------------------------------------------------
insert into alavanca.modulo (slug, nome, pilar, promessa, processo, estado, limitacao, depende_de, ordem) values

 ('venda-ifood', 'Venda no iFood', 'ifood',
  'Saber quanto o iFood realmente fica, separando o que e taxa do que e decisao sua',
  'Importa o extrato de pedidos, apura taxa por pedido e reconcilia com o repasse',
  'parcial',
  'A carga e por exportacao manual do portal, que volta no maximo 90 dias. A API oficial exige homologacao do aplicativo.',
  null, 10),

 ('venda-canal-proprio', 'Venda no canal proprio', 'canal-proprio',
  'Ver a venda do site com a margem que ela realmente tem',
  'Le o pedido do Cliente Fiel e grava venda por dia e por marca',
  'parcial',
  'A origem grava todas as vendas como uma loja so, entao Pizzaria e Pastas nao se separam no site.',
  null, 20),

 ('lucro', 'Margem e lucro', 'lucro',
  'Margem de contribuicao por marca e por canal, com o custo que sai de verdade',
  'Cruza venda, CMV, taxa apurada, imposto e custo de entrega',
  'parcial',
  'Imposto e custo de entrega acabaram de ser informados e ainda nao entraram na conta.',
  array['venda-ifood', 'venda-canal-proprio'], 30),

 ('metas', 'Metas e metricas', 'metricas',
  'Meta por dia da semana, com vigencia, comparada com a venda medida',
  'Guarda a meta ditada pelo dono e confronta com o realizado',
  'operando', null, array['venda-ifood'], 40),

 ('estrategias', 'Estrategias', null,
  'O plano de acao em que toda estrategia carrega o numero que a motivou',
  'Propoe a partir do que foi medido; o dono aprova, executa e revisa',
  'parcial',
  'As estrategias sao propostas a partir de medicao, mas ainda nao ha tela: hoje so existem no banco.',
  array['lucro'], 50),

 ('gerente-virtual', 'Gerente virtual', null,
  'O fechamento do dia chega no WhatsApp do dono, sem ele abrir tela nenhuma',
  'Monta e envia a mensagem diaria com venda, margem, alerta e o que fazer hoje',
  'no_n8n', null, array['lucro', 'estrategias'], 60),

 ('vendedor-ia', 'Vendedor de IA no WhatsApp', 'whatsapp',
  'Atende e fecha pedido no WhatsApp, 24 horas',
  'Conversa com o cliente final, monta o pedido e envia ao canal proprio',
  'no_n8n', null, null, 70),

 ('crm-disparo', 'CRM e disparo', 'crm',
  'Campanha para a base propria, so para quem autorizou',
  'Monta audiencia por segmento, respeita consentimento e regua, e dispara',
  'parcial',
  'O modelo de consentimento existe com data, mas a base herdada nao tem aceite registrado: hoje ninguem esta elegivel.',
  array['vendedor-ia'], 80),

 ('trafego-pago', 'Trafego pago', 'canal-proprio',
  'Regua de anuncio com teto, ROAS de equilibrio e corte automatico',
  'Monitora gasto e retorno por conjunto e pausa o que nao paga',
  'no_n8n', null, array['venda-canal-proprio'], 90),

 ('instagram', 'Instagram', null,
  'Responde DM e publica story sem alguem lembrar de fazer',
  'Atende a caixa de entrada do Instagram e mantem a vitrine viva',
  'no_n8n', null, null, 100),

 ('kds', 'KDS - tela de cozinha', null,
  'Uma tela so com o pedido de todos os canais, em vez de um tablet por canal',
  'Recebe o pedido em tempo real, mostra na cozinha e marca pronto',
  'planejado', null, array['venda-ifood', 'venda-canal-proprio'], 110),

 ('inteligencia-mercado', 'Inteligencia de mercado', null,
  'Como a loja se compara com os restaurantes parecidos do mesmo bairro',
  'Confronta ticket, tempo, nota e cancelamento com a praca',
  'planejado', null, array['venda-ifood'], 120)

on conflict (slug) do update set
  nome = excluded.nome, pilar = excluded.pilar, promessa = excluded.promessa,
  processo = excluded.processo, estado = excluded.estado,
  limitacao = excluded.limitacao, depende_de = excluded.depende_de,
  ordem = excluded.ordem, atualizado_em = now();

-- O grupo Le Tre liga tudo que existe de alguma forma; o que e so planejado, nao.
do $ligar$
declare
  v_tenant uuid;
begin
  select id into v_tenant from alavanca.tenants where slug = 'grupo-le-tre';
  if v_tenant is null then return; end if;
  perform set_config('app.tenant_id', v_tenant::text, true);
  insert into alavanca.tenant_modulo (tenant_id, modulo_slug, ativo, ativado_em, nota)
  select v_tenant, slug, estado <> 'planejado',
         case when estado <> 'planejado' then now() end,
         'Cliente piloto: liga tudo que ja existe, para o que falta aparecer na tela como falta.'
    from alavanca.modulo
  on conflict (tenant_id, modulo_slug) do nothing;
  perform set_config('app.tenant_id', '', true);
end
$ligar$;

commit;
