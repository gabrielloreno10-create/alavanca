#!/usr/bin/env python3
"""Verificação do importador. Roda tudo e diz o que passou e o que não passou.

Divide-se em duas partes:

  ARQUIVO  — conferências que não precisam de banco: a soma diária bate com o
             total mensal do Saipos, os 153 dias estão todos lá, o fechamento
             fecha, e nenhum arquivo deste pacote carrega dado pessoal.
  BANCO    — só roda se DATABASE_URL estiver preenchida: nenhuma linha sem
             tenant_id, o trio origem/fonte/coletado_em preenchido em tudo,
             a RLS barrando quem não setou app.tenant_id, nenhum cliente final
             gravado, e o importador rodando duas vezes sem duplicar nada.

    python verificar.py
"""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

import psycopg

import importar_le_tre as imp
from alavanca_db import RAIZ, SemBanco, conectar, tenant, tenant_id_por_slug

# Tabelas que o contrato manda ter origem / fonte / coletado_em em toda linha.
TRIO_OBRIGATORIO = (
    "venda_dia producao_dia ficha_tecnica venda_prato customers consents orders order_items "
    "payment_evidence conversation_state messages crm_segmento crm_segmento_snapshot "
    "sniper_lotes sniper_envios campanhas flights criativos anuncio_dia midia_alcance "
    "canal_taxa_mes ifood_operacao_dia ifood_funil_dia ifood_faixa_dia promocoes promocao_dia "
    "whatsapp_dia whatsapp_transferencia_dia whatsapp_regras reclamacoes pdca_relatorios "
    "pdca_violacoes pdca_decisoes acoes_operador plano_acao acao_sugerida comanda_dia "
    "importacao_lote tenants marcas canais brand_guardrails limites_alerta meta_dia_semana"
).split()

# Tabelas onde mora dado pessoal de cliente final. Este importador não escreve
# em nenhuma delas: as fontes que ele lê não têm pessoa.
TABELAS_PESSOAIS = ("customers", "consents", "conversation_state", "messages",
                    "sniper_envios", "orders", "order_items", "reclamacoes")

RESULTADOS: list[tuple[bool, str, str]] = []


def checar(nome: str):
    def envolver(fn):
        def rodar(*a, **kw):
            try:
                detalhe = fn(*a, **kw) or ""
                RESULTADOS.append((True, nome, str(detalhe)))
            except Exception as erro:
                RESULTADOS.append((False, nome, f"{type(erro).__name__}: {erro}"))
        rodar.__name__ = fn.__name__
        return rodar
    return envolver


# ---------------------------------------------------------------------------
# parte 1: arquivos
# ---------------------------------------------------------------------------
@checar("soma do diário bate com o total mensal do Saipos, loja por loja, mês a mês")
def t_diario_bate_mensal():
    conferidos = imp.conferir_diario_contra_mensal(
        imp.ler_csv(imp.ARQ_DIARIO), imp.ler_csv(imp.ARQ_MENSAL))
    assert len(conferidos) == 15, f"esperava 15 conferências, fiz {len(conferidos)}"
    return f"{len(conferidos)} conferências mês×loja"


@checar("o CSV diário tem os 153 dias de 01/05 a 30/09/2026, sem buraco e sem repetição")
def t_153_dias():
    linhas = imp.ler_csv(imp.ARQ_DIARIO)
    datas = sorted(l["data"] for l in linhas)
    esperado = (imp.PERIODO_DIARIO[1] - imp.PERIODO_DIARIO[0]).days + 1
    assert len(linhas) == esperado, f"{len(linhas)} linhas, esperava {esperado}"
    assert len(set(datas)) == esperado, "há data repetida"
    assert datas[0] == "2026-05-01" and datas[-1] == "2026-09-30"
    return f"{esperado} dias"


@checar("CMV médio de 90 dias cai numa faixa plausível (0 a 100%) nas duas marcas")
def t_cmv():
    cmv = imp.cmv_por_marca(imp.ler_csv(imp.ARQ_CMV))
    assert set(cmv) == {"Pizzaria", "Jerry's"}, f"marcas apuradas: {sorted(cmv)}"
    for marca, pct in cmv.items():
        assert 0 < pct < 1, f"{marca}: CMV de {pct}"
    return " · ".join(f"{m} {v * 100:.2f}%" for m, v in sorted(cmv.items()))


@checar("o fechamento de agosto fecha: as 5 lojas somam o TOTAL da tabela")
def t_fechamento_fecha():
    texto = imp.ARQ_FECHAMENTO.read_text(encoding="utf-8")
    bruto = liquido = 0.0
    for rotulo in imp.ROTULO_FECHAMENTO.values():
        colunas = imp.linha_da_tabela(texto, rotulo)
        assert colunas, f"loja não encontrada no fechamento: {rotulo}"
        bruto += imp.brl(colunas[1])
        liquido += imp.brl(colunas[5])
    total = imp.linha_da_tabela(texto, "**TOTAL**")
    assert total, "linha TOTAL não encontrada"
    assert abs(bruto - imp.brl(total[1])) < 0.01, f"bruto {bruto:.2f} x TOTAL {imp.brl(total[1]):.2f}"
    assert abs(liquido - imp.brl(total[5])) < 0.01, f"líquido {liquido:.2f} x TOTAL {imp.brl(total[5]):.2f}"
    return f"bruto R$ {bruto:,.2f} · líquido R$ {liquido:,.2f}"


@checar("nenhum arquivo do worker carrega telefone, e-mail ou nome de cliente final")
def t_sem_dado_pessoal_em_arquivo():
    padroes = [
        # celular brasileiro com ou sem DDI/DDD. As bordas de não-dígito
        # impedem que um id comprido (conta de anúncio, hash) passe por telefone.
        re.compile(r"(?<![0-9])(?:\+?55[ .-]?)?\(?[1-9][0-9]\)?[ .-]?9[0-9]{4}[ .-]?[0-9]{4}(?![0-9])"),
        # e-mail de verdade: TLD de letras, então "SENHA@127.0.0.1" não conta
        re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b"),
    ]
    achados = []
    extensoes = (".py", ".md", ".toml", ".txt", ".cfg")
    for arq in sorted((RAIZ / "worker").glob("*")):
        if not arq.is_file() or (arq.suffix not in extensoes and arq.name != ".env.example"):
            continue
        texto = arq.read_text(encoding="utf-8")
        for p in padroes:
            for achado in p.findall(texto):
                # o E.164 citado na documentação é um número inventado
                if achado in ("+5531999998888", "5531999998888"):
                    continue
                achados.append(f"{arq.name}: {achado}")
    assert not achados, "possível dado pessoal em arquivo: " + "; ".join(achados)
    return "worker/ limpo"


# ---------------------------------------------------------------------------
# parte 2: banco
# ---------------------------------------------------------------------------
def contar_tudo(cur, tabelas) -> dict[str, int]:
    saida = {}
    for t in tabelas:
        cur.execute(f"select count(*) from alavanca.{t}")
        saida[t] = cur.fetchone()[0]
    return saida


@checar("RLS: sem app.tenant_id a aplicação não vê nenhuma linha de venda")
def t_rls(conn):
    import os
    with conn.transaction():
        with conn.cursor() as cur:
            papel = os.environ.get("ALAVANCA_DB_ROLE", "").strip()
            if papel:
                cur.execute(f'set local role "{papel}"')
            cur.execute("select count(*) from alavanca.venda_dia")
            visiveis = cur.fetchone()[0]
    assert visiveis == 0, f"a app viu {visiveis} linhas sem setar app.tenant_id"
    return "0 linhas visíveis, como tem que ser"


@checar("toda tabela de domínio tem tenant_id NOT NULL e nenhuma linha sem tenant")
def t_tenant_id(conn, tenant_id):
    with tenant(conn, tenant_id) as cur:
        cur.execute("""
            select c.table_name, c.is_nullable
              from information_schema.columns c
              join information_schema.tables t
                on t.table_schema = c.table_schema and t.table_name = c.table_name
             where c.table_schema = 'alavanca' and c.column_name = 'tenant_id'
               and t.table_type = 'BASE TABLE'
        """)
        colunas = cur.fetchall()
        anulaveis = [t for t, nulo in colunas if nulo == "YES"]
        assert not anulaveis, f"tenant_id anulável em: {anulaveis}"
        vazias = []
        for tabela, _ in colunas:
            cur.execute(f"select count(*) from alavanca.{tabela} where tenant_id is null")
            if cur.fetchone()[0]:
                vazias.append(tabela)
        assert not vazias, f"linha sem tenant_id em: {vazias}"
    return f"{len(colunas)} tabelas com tenant_id NOT NULL"


@checar("trio origem/fonte/coletado_em preenchido em todas as linhas gravadas")
def t_trio(conn, tenant_id):
    faltando = []
    with tenant(conn, tenant_id) as cur:
        for tabela in TRIO_OBRIGATORIO:
            cur.execute(
                f"select count(*) from alavanca.{tabela} "
                "where origem is null or fonte is null or coletado_em is null")
            if cur.fetchone()[0]:
                faltando.append(tabela)
    assert not faltando, f"trio incompleto em: {faltando}"
    return f"{len(TRIO_OBRIGATORIO)} tabelas conferidas"


@checar("nenhum cliente final no banco: as tabelas de pessoa seguem vazias")
def t_sem_cliente_final(conn, tenant_id):
    com_linha = []
    with tenant(conn, tenant_id) as cur:
        for tabela in TABELAS_PESSOAIS:
            cur.execute(f"select count(*) from alavanca.{tabela}")
            qtd = cur.fetchone()[0]
            if qtd:
                com_linha.append(f"{tabela}={qtd}")
    assert not com_linha, "este importador não deveria ter escrito aqui: " + ", ".join(com_linha)
    return ", ".join(TABELAS_PESSOAIS[:3]) + " … todas vazias"


@checar("nenhum texto gravado parece telefone de cliente final")
def t_sem_telefone_no_banco(conn, tenant_id):
    suspeitos = []
    with tenant(conn, tenant_id) as cur:
        for tabela, coluna in (("venda_dia", "fonte"), ("ficha_tecnica", "fonte"),
                               ("ficha_tecnica", "nome"), ("ficha_tecnica", "base"),
                               ("campanhas", "nome"), ("importacao_lote", "fonte"),
                               ("brand_guardrails", "nota")):
            cur.execute(
                f"select count(*) from alavanca.{tabela} "
                # bordas de não-dígito: um id de conta de anúncio (act_7291...)
                # não pode passar por celular só por ser comprido
                f"where {coluna} ~ '(^|[^0-9])(\\+?55[ -]?)?\\(?[1-9][0-9]\\)?[ -]?"
                f"9[0-9]{{4}}[- ]?[0-9]{{4}}([^0-9]|$)'")
            if cur.fetchone()[0]:
                cur.execute(
                    f"select distinct left({coluna}, 120) from alavanca.{tabela} "
                    f"where {coluna} ~ '(^|[^0-9])(\\+?55[ -]?)?\\(?[1-9][0-9]\\)?[ -]?"
                    f"9[0-9]{{4}}[- ]?[0-9]{{4}}([^0-9]|$)' limit 2")
                suspeitos.append(f"{tabela}.{coluna} -> {cur.fetchall()}")
    assert not suspeitos, f"texto com cara de telefone em: {suspeitos}"
    return "7 colunas de texto varridas"


@checar("venda_dia bate com o Saipos onde o Saipos é a fonte, e corrobora onde o iFood assumiu")
def t_venda_dia_no_banco(conn, tenant_id):
    # Até 21/10/2026 o Saipos era a única fonte e isto era uma igualdade. Depois
    # da carga do iFood (importar_ifood.py), o canal de iFood de agosto em diante
    # passou a vir do extrato do próprio iFood, que é quem tem a taxa real.
    #
    # Então são duas perguntas diferentes, e misturá-las esconderia as duas:
    #   onde a fonte ainda é o Saipos  -> tem que bater no centavo;
    #   onde o iFood assumiu           -> são dois sistemas independentes medindo
    #                                     a mesma venda, e o que se checa é se
    #                                     corroboram. Divergência grande é notícia.
    mensal = imp.ler_csv(imp.ARQ_MENSAL)
    with tenant(conn, tenant_id) as cur:
        cur.execute("""
            select c.ext_saipos_marca, to_char(v.data, 'YYYY-MM'),
                   sum(v.faturamento)::numeric, sum(v.pedidos)::int,
                   bool_or(v.fonte ilike '%%iFood%%')
              from alavanca.venda_dia v
              join alavanca.canais c on c.id = v.canal_id
             where v.origem = 'REAL'
             group by 1, 2
        """)
        linhas = cur.fetchall()
    assert linhas, "nenhuma linha REAL em venda_dia"

    exatas = 0
    divergencias = []
    for sigla, mes, valor, pedidos, tem_ifood in linhas:
        esperado = next(
            (m for m in mensal if m["mes"] == mes and m["canal"] == "todos" and m["marca"] == sigla),
            None,
        )
        if esperado is None:
            continue  # mês que o CSV mensal do Saipos não cobre (outubro)
        saipos = float(esperado["valor_vendas"])
        banco = float(valor)
        if not tem_ifood:
            assert abs(banco - saipos) < 0.01, f"{sigla} {mes}: banco {banco} x Saipos {saipos}"
            assert pedidos == int(esperado["pedidos"]), \
                f"{sigla} {mes}: banco {pedidos} pedidos x Saipos {esperado['pedidos']}"
            exatas += 1
            continue
        pct = 100 * (banco - saipos) / saipos if saipos else 0.0
        divergencias.append((sigla, mes, pct))
        assert abs(pct) < 15, (
            f"{sigla} {mes}: iFood {banco:,.2f} x Saipos {saipos:,.2f} ({pct:+.1f}%). "
            "Divergência grande demais entre as duas fontes para ser arredondamento — "
            "confira antes de confiar na margem desse mês.")

    if divergencias:
        pior = max(divergencias, key=lambda d: abs(d[2]))
        extra = (f"; {len(divergencias)} com iFood como fonte corroboram o Saipos "
                 f"(pior: {pior[0]} {pior[1]} {pior[2]:+.1f}%)")
    else:
        extra = ""
    return f"{exatas} combinações loja×mês batem no centavo com o CSV{extra}"


@checar("faturamento gravado é o BRUTO do Saipos, não o líquido do fechamento")
def t_bruto_nao_liquido(conn, tenant_id):
    with tenant(conn, tenant_id) as cur:
        cur.execute("""
            select sum(v.faturamento) from alavanca.venda_dia v
              join alavanca.canais c on c.id = v.canal_id
             where v.origem = 'REAL' and c.ext_saipos_marca = 'PZ'
               and v.data between date '2026-08-01' and date '2026-08-31'
        """)
        bruto = float(cur.fetchone()[0])
        cur.execute("""
            select liquido from alavanca.canal_taxa_mes m
              join alavanca.canais c on c.id = m.canal_id
             where c.ext_saipos_marca = 'PZ' and m.mes = date '2026-08-01'
        """)
        liquido = float(cur.fetchone()[0])
    assert abs(bruto - 52165.55) < 0.01, f"agosto da Pizzaria: {bruto}"
    assert liquido < bruto, "líquido deveria ser menor que o bruto"
    return f"agosto PZ: bruto R$ {bruto:,.2f} · líquido R$ {liquido:,.2f}"


@checar("anuncio_dia mensal está no dia 1 e com hora nula, para ninguém somar com dado diário")
def t_anuncio_mensal(conn, tenant_id):
    with tenant(conn, tenant_id) as cur:
        cur.execute("""
            select count(*) filter (where extract(day from data) <> 1 or hora is not null),
                   count(*)
              from alavanca.anuncio_dia where origem = 'REAL'
        """)
        fora, total = cur.fetchone()
    assert total > 0, "nenhuma linha de mídia importada"
    assert fora == 0, f"{fora} linhas mensais fora do dia 1 / com hora"
    return f"{total} linhas mensais"


@checar("Jerry's existe no banco COM venda: o buraco do export do Saipos está tapado")
def t_jerrys(conn, tenant_id):
    # Esta checagem já afirmou o contrário. Até 20/10/2026 ela guardava um buraco
    # conhecido — "venda_dia continua vazia, não foi inventado número" — porque o
    # CSV diário do Saipos veio sem a Jerry's e o certo era o painel dizer "não
    # medido" em vez de zero.
    #
    # Em 21/10 o Hélio confirmou que a loja vendeu, a aritmética de julho provou
    # (a segunda-feira batia no centavo e os outros seis dias faltavam 28% a 40%),
    # e o extrato do iFood trouxe os números. Agora o invariante é o oposto: se a
    # venda da Jerry's sumir de novo, é regressão, não pendência.
    with tenant(conn, tenant_id) as cur:
        cur.execute("select count(*) from alavanca.marcas where slug = 'jerrys-burger'")
        assert cur.fetchone()[0] == 1, "marca do Jerry's não existe"
        cur.execute("select count(*) from alavanca.canais where slug like 'jerrys-%'")
        canais = cur.fetchone()[0]
        cur.execute("""
            select count(*), coalesce(sum(v.faturamento), 0)::numeric, min(v.data), max(v.data)
              from alavanca.venda_dia v join alavanca.canais c on c.id = v.canal_id
             where c.slug like 'jerrys-%'
        """)
        dias, faturamento, de, ate = cur.fetchone()
        cur.execute("""
            select count(*) from alavanca.ficha_tecnica f join alavanca.marcas m on m.id = f.marca_id
             where m.slug = 'jerrys-burger'
        """)
        fichas = cur.fetchone()[0]
    assert dias > 0, "a Jerry's voltou a ficar sem nenhuma linha de venda — regressão da carga"
    assert float(faturamento) > 0, f"a Jerry's tem {dias} dias gravados somando zero"
    assert fichas > 0, "o Jerry's deveria ter fichas técnicas"
    return (f"{canais} canais, {fichas} fichas, {dias} dias de venda "
            f"({de} a {ate}) somando R$ {float(faturamento):,.2f}")


@checar("rodar o importador de novo não duplica nem muda nenhuma contagem")
def t_idempotente(conn, tenant_id):
    tabelas = ("venda_dia", "ficha_tecnica", "venda_prato", "canal_taxa_mes", "campanhas",
               "anuncio_dia", "brand_guardrails", "guardrail_excecoes", "importacao_lote",
               "marcas", "canais", "tenants")
    with tenant(conn, tenant_id) as cur:
        antes = contar_tudo(cur, tabelas)

    _, marcas, canais = imp.garantir_cadastro(conn, imp.SLUG_TENANT)
    cmv = imp.cmv_por_marca(imp.ler_csv(imp.ARQ_CMV))
    imp.importar_venda_dia(conn, tenant_id, canais, cmv)
    imp.importar_fichas(conn, tenant_id, marcas)
    imp.importar_fechamento(conn, tenant_id, canais, False)
    imp.importar_meta_ads(conn, tenant_id)
    imp.importar_guardrails(conn, tenant_id, marcas)

    with tenant(conn, tenant_id) as cur:
        depois = contar_tudo(cur, tabelas)
    difs = {t: (antes[t], depois[t]) for t in tabelas if antes[t] != depois[t]}
    assert not difs, f"contagem mudou na 2a rodada: {difs}"
    return " · ".join(f"{t}={depois[t]}" for t in ("venda_dia", "ficha_tecnica", "anuncio_dia"))


class _Desfazer(Exception):
    """Sentinela: desfaz o savepoint da tentativa de reativação, dê no que der."""


@checar("ação sugerida de exemplo não fica ativa no cliente real, e o gatilho da 017 impede que volte")
def t_acao_sugerida_nao_validada(conn, tenant_id):
    # Achado A (20/10/2026): as 13 linhas de acao_sugerida da Le Tre têm
    # origem EXEMPLO, vieram da seed 014 e apareciam na Comanda e na mensagem
    # das 7h. A migration 017 desativou as 13 e instalou o gatilho
    # trg_acao_sugerida_so_real_ativa. Esta verificação cobre as duas pontas:
    # o estado de hoje e a regra que impede o problema de voltar.
    with tenant(conn, tenant_id) as cur:
        cur.execute("select count(*) from alavanca.acao_sugerida where ativo and origem <> 'REAL'")
        ativas = cur.fetchone()[0]
        assert ativas == 0, (
            f"{ativas} ação(ões) de exemplo ativas na Comanda de um cliente real — "
            "o dono leria recomendação fabricada como método da casa")

        cur.execute("select count(*) from alavanca.acao_sugerida where origem <> 'REAL'")
        guardadas = cur.fetchone()[0]

        barrou = False
        try:
            with conn.transaction():  # savepoint: nada daqui fica gravado
                cur.execute("update alavanca.acao_sugerida set ativo = true where origem <> 'REAL'")
                raise _Desfazer
        except _Desfazer:
            barrou = False
        except psycopg.errors.RaiseException:
            barrou = True
        assert barrou, "o gatilho trg_acao_sugerida_so_real_ativa deixou reativar ação de exemplo"

        cur.execute("select count(*) from alavanca.acao_sugerida where ativo and origem = 'REAL'")
        reais = cur.fetchone()[0]
    return (f"0 ativas de exemplo · {guardadas} guardadas inativas · {reais} ativas do próprio dono · "
            "gatilho barrou a reativação")


@checar("tempo de entrega do iFood está em minutos de gente, não em número corrompido")
def t_tempo_entrega_plausivel(conn, tenant_id):
    # Na primeira carga de 21/10/2026 o tempo médio saiu 2.630 minutos — 44 horas.
    # Causa: a exportação do iFood manda as colunas de DINHEIRO como número e as de
    # TEMPO como texto com ponto decimal ('31.83'), e o conversor normalizava tudo
    # como formato brasileiro, tirando o ponto por achar que era separador de milhar.
    # 31,83 virou 3.183. O número era absurdo e ninguém teria notado numa média.
    # Esta verificação existe para que a próxima corrupção morra aqui, e não na tela.
    with tenant(conn, tenant_id) as cur:
        cur.execute(
            """
            select count(*), min(tempo_entrega_min), max(tempo_entrega_min),
                   round(avg(tempo_entrega_min), 1)
              from alavanca.ifood_operacao_dia
             where tenant_id = %s and tempo_entrega_min is not null
            """,
            (tenant_id,),
        )
        n, menor, maior, media = cur.fetchone()
    if not n:
        return "nenhuma linha de operação com tempo gravado (nada a conferir)"
    assert 5 <= menor, f"entrega em {menor} min é rápida demais para ser verdade"
    assert maior <= 180, (
        f"entrega em {maior} min (={maior / 60:.1f} h): número corrompido ou "
        "unidade trocada na importação")
    return f"{n} dias · de {menor} a {maior} min · média {media} min"


@checar("o painel consegue ler pelas views (vw_venda_dia_painel e vw_guardrail_efetivo)")
def t_views(conn, tenant_id):
    with tenant(conn, tenant_id) as cur:
        cur.execute("select count(*) from alavanca.vw_venda_dia_painel")
        dias = cur.fetchone()[0]
        cur.execute("""
            select marca, ticket_medio, teto_gasto_diario, avalia_por
              from alavanca.vw_guardrail_efetivo order by marca
        """)
        guard = cur.fetchall()
    assert dias > 0, "vw_venda_dia_painel vazia"
    jerrys = next(g for g in guard if "Jerry" in g[0])
    assert jerrys[1] is None, "ticket_medio do Jerry's deveria continuar nulo (está em 'anulados')"
    assert float(jerrys[2]) == 60.0, f"teto do Jerry's: {jerrys[2]}"
    assert jerrys[3] == "proxy", f"avalia_por do Jerry's: {jerrys[3]}"
    return f"{dias} linhas no painel · herança de guardrail respeitada"


# ---------------------------------------------------------------------------
def main() -> int:
    print("=" * 78)
    print("ARQUIVO — não precisa de banco")
    print("=" * 78)
    t_diario_bate_mensal()
    t_153_dias()
    t_cmv()
    t_fechamento_fecha()
    t_sem_dado_pessoal_em_arquivo()

    print()
    print("=" * 78)
    print("BANCO")
    print("=" * 78)
    try:
        conn = conectar()
    except SemBanco as erro:
        print(f"  PULADO: {erro}")
        conn = None

    if conn is not None:
        with conn:
            tenant_id = tenant_id_por_slug(conn, imp.SLUG_TENANT)
            if tenant_id is None:
                RESULTADOS.append((False, "tenant grupo-le-tre existe no banco",
                                   "não existe — rode importar_le_tre.py antes"))
            else:
                t_rls(conn)
                t_tenant_id(conn, tenant_id)
                t_trio(conn, tenant_id)
                t_sem_cliente_final(conn, tenant_id)
                t_sem_telefone_no_banco(conn, tenant_id)
                t_venda_dia_no_banco(conn, tenant_id)
                t_bruto_nao_liquido(conn, tenant_id)
                t_anuncio_mensal(conn, tenant_id)
                t_jerrys(conn, tenant_id)
                t_acao_sugerida_nao_validada(conn, tenant_id)
                t_tempo_entrega_plausivel(conn, tenant_id)
                t_views(conn, tenant_id)
                t_idempotente(conn, tenant_id)

    print()
    print("=" * 78)
    falhas = 0
    for ok, nome, detalhe in RESULTADOS:
        marca = "OK   " if ok else "FALHA"
        falhas += 0 if ok else 1
        print(f"{marca} {nome}")
        if detalhe:
            print(f"      {detalhe}")
    print("=" * 78)
    print(f"{len(RESULTADOS) - falhas} de {len(RESULTADOS)} verificações passaram")
    return 1 if falhas else 0


if __name__ == "__main__":
    raise SystemExit(main())
