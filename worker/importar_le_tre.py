#!/usr/bin/env python3
"""Leva os dados REAIS do grupo Le Tre Farine para o banco da Alavanca.

Mesma lógica do painel/scripts/importar_grupo.py — lê os CSVs do Saipos, apura
a taxa de cada loja pelo fechamento líquido de agosto, calcula o CMV médio pelas
fichas técnicas e confere a soma diária contra o total mensal — só que o destino
agora é Postgres em vez de JSON.

O que entra:

  venda_dia          153 dias × 3 lojas da Le Tre (01/05 a 30/09/2026)
  ficha_tecnica      23 itens com preço e custo (13 Pizzaria + 10 Jerry's)
  venda_prato        os mesmos 23 itens na janela de 90 dias do relatório
  canal_taxa_mes     o fechamento de agosto/2026, loja por loja
  campanhas          as campanhas de Meta Ads que aparecem no export
  anuncio_dia        investimento MENSAL (grão do arquivo), dia 1 de cada mês
  brand_guardrails   as regras do PDCA, derivadas do guardrails.json
  guardrail_excecoes as exceções de corte ainda escritas no mesmo arquivo

O que NÃO entra, porque não existe nos arquivos:

  - venda diária do Jerry's. Os CSVs diários do Saipos cobrem só as três lojas
    da Le Tre. A marca e os dois canais do Jerry's existem no cadastro e
    recebem ficha, fechamento e mídia — mas nenhuma linha de venda_dia é
    inventada a partir do total mensal.
  - meta por dia da semana. O dono disse em 19/10 que ainda vai definir.

Regras duras deste script:

  - conecta como alavanca_app e seta app.tenant_id como primeira instrução da
    transação (sem isso a RLS devolve zero linha, em silêncio);
  - toda linha gravada carrega origem='REAL', fonte e coletado_em;
  - cada carga abre um importacao_lote com o sha256 do arquivo, e o texto de
    fonte do lote é o mesmo texto que vai nas linhas;
  - rodar duas vezes não duplica: tudo é upsert por chave natural;
  - nenhum nome, telefone ou endereço de cliente final é lido ou gravado —
    nenhuma das fontes aqui contém dado pessoal.

Uso:
    python importar_le_tre.py
    python importar_le_tre.py --so venda_dia,fichas
    python importar_le_tre.py --atualizar-taxa-cadastro
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path

from alavanca_db import (
    DADOS_FONTE,
    REFERENCIA,
    SemBanco,
    conectar,
    em_sp,
    lote,
    sha256,
    tenant,
    tenant_id_por_slug,
)

SLUG_TENANT = "grupo-le-tre"

ARQ_DIARIO = DADOS_FONTE / "saipos_faturamento_diario_letre_2026-05_a_09.csv"
ARQ_MENSAL = DADOS_FONTE / "saipos_faturamento_mensal_2026-05_a_09.csv"
ARQ_CMV = DADOS_FONTE / "saipos_cmv_por_produto_90d_2026-07-03_a_10-01.csv"
ARQ_FECHAMENTO = DADOS_FONTE / "ifood_clientefiel_fechamento_liquido_2026-08.md"
ARQ_META = DADOS_FONTE / "meta_ads_mensal_2026-05_a_10.json"
ARQ_GUARDRAILS = REFERENCIA / "pdca" / "guardrails.json"

# coletado_em: a data em que o dado foi PUXADO da fonte, não a de hoje.
# Cada uma está escrita dentro do próprio arquivo, no cabeçalho.
COLETA_SAIPOS = em_sp(2026, 10, 7)      # "puxado em 2026-10-07", cabeçalho dos CSVs
COLETA_CMV = em_sp(2026, 10, 3)         # fichas "Saipos 03/10"; gêmeo em saipos/metrica_cmv_2026-10-03.csv
COLETA_FECHAMENTO = em_sp(2026, 9, 3)   # "Coletado em: 03/09/2026"
COLETA_META = em_sp(2026, 10, 7)        # "Windsor.ai ... puxado em 2026-10-07"
COLETA_GUARDRAILS = em_sp(2026, 10, 16)  # última calibragem citada no arquivo

JANELA_CMV = (date(2026, 7, 3), date(2026, 10, 1))
PERIODO_DIARIO = (date(2026, 5, 1), date(2026, 9, 30))

# Sigla do Saipos -> slug do canal. É assim que arquivo casa com loja.
CANAL_POR_SIGLA = {
    "PZ": "letre-ifood-pizzaria",
    "PA": "letre-ifood-pastas",
    "LCF": "letre-site",
    "JIF": "jerrys-ifood",
    "JCF": "jerrys-site",
}
# Colunas do CSV diário, por sigla. O arquivo traz pedidos e valor POR LOJA:
# cada loja vira uma linha de venda_dia, nunca uma soma.
COLUNAS_DIARIO = {
    "PZ": ("pizzaria_ifood_pedidos", "pizzaria_ifood_valor"),
    "PA": ("pastas_ifood_pedidos", "pastas_ifood_valor"),
    "LCF": ("clientefiel_pedidos", "clientefiel_valor"),
}
# Rótulo da loja na tabela "Resumo por loja" do fechamento.
ROTULO_FECHAMENTO = {
    "PZ": "Le Tre Farine — Pizzaria (iFood)",
    "PA": "Le Tre Farine Pastas (iFood)",
    "LCF": "Le Tre Farine (Cliente Fiel)",
    "JIF": "Jerry's (iFood)",
    "JCF": "Jerry's (Cliente Fiel)",
}
# Rótulo da loja na tabela "Situação dos repasses". Só as três do iFood têm.
ROTULO_REPASSE = {
    "PZ": "Le Tre Pizzaria",
    "JIF": "Jerry's",
    "PA": "Le Tre Pastas",
}
# Coluna "marca" do CSV de CMV -> slug da marca.
MARCA_POR_ROTULO_CMV = {"Pizzaria": "le-tre-pizzaria", "Jerry's": "jerrys-burger"}
# Nome da marca no guardrails.json -> slug da marca.
MARCA_POR_ROTULO_GUARDRAIL = {"Le Tre Farine": "le-tre-pizzaria", "Jerry's": "jerrys-burger"}
# De qual marca sai o % de CMV aplicado a cada loja. A Pastas não tem ficha
# técnica própria: usa a média das pizzas, como o esboço do painel já fazia.
MARCA_CMV_POR_SIGLA = {"PZ": "Pizzaria", "PA": "Pizzaria", "LCF": "Pizzaria",
                       "JIF": "Jerry's", "JCF": "Jerry's"}


# ---------------------------------------------------------------------------
# leitura dos arquivos
# ---------------------------------------------------------------------------
def ler_csv(caminho: Path) -> list[dict]:
    """CSV do Saipos: a primeira linha com '#' é o cabeçalho de procedência."""
    with caminho.open(encoding="utf-8") as f:
        return list(csv.DictReader(l for l in f if not l.startswith("#")))


def brl(texto: str) -> float:
    """'−12.859,31' / '39.324,18' / '−148,87 (taxa Pix)' -> float."""
    limpo = texto.split("(")[0]
    limpo = limpo.replace("*", "").replace("R$", "").replace("+", "")
    limpo = limpo.replace("−", "-").replace("–", "-").replace("—", "-")
    limpo = limpo.replace(".", "").replace(",", ".").strip()
    return float(limpo) if limpo not in ("", "-") else 0.0


def codigo_item(nome: str) -> str:
    """Código estável da ficha, derivado do nome.

    Não usamos f01..f23 por posição: a ordem muda quando as quantidades mudam e
    o mesmo prato passaria a ter outro código na próxima importação.
    """
    sem_acento = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", sem_acento.lower())).strip("-")[:60]


def celulas(linha: str) -> list[str]:
    return [c.strip() for c in linha.strip().strip("|").split("|")]


def linha_da_tabela(texto: str, rotulo: str) -> list[str] | None:
    for linha in texto.splitlines():
        if linha.strip().startswith(f"| {rotulo} |"):
            return celulas(linha)
    return None


def sem_chaves_internas(obj):
    """Tira as chaves de documentação ('_leia', '_nota_...') dos blocos jsonb."""
    if isinstance(obj, dict):
        return {k: sem_chaves_internas(v) for k, v in obj.items() if not k.startswith("_")}
    return obj


# ---------------------------------------------------------------------------
# cadastro (tenant / marcas / canais)
# ---------------------------------------------------------------------------
# Em banco já migrado, a 014 semeou tudo isto e o importador só RESOLVE os ids.
# O cadastro abaixo existe para um banco cru (ou outro ambiente) não ficar sem
# estrutura: ele só insere o que falta, nunca sobrescreve o que a 014 deixou.
MARCAS = [
    ("le-tre-pizzaria", "Le Tre Farine Pizzaria", "Pizzaria", 1),
    ("le-tre-pastas", "Le Tre Farine Pastas", "Massas", 2),
    ("jerrys-burger", "Jerry's Burger", "Hamburgueria", 3),
]
CANAIS = [
    # slug, nome, tipo, marca, taxa de cadastro, ordem, sigla Saipos
    ("letre-ifood-pizzaria", "iFood Pizzaria", "ifood", "le-tre-pizzaria", 0.2462, 1, "PZ"),
    ("letre-ifood-pastas", "iFood Pastas", "ifood", "le-tre-pastas", 0.3794, 2, "PA"),
    ("letre-site", "Site", "proprio", "le-tre-pizzaria", 0.0108, 3, "LCF"),
    ("jerrys-ifood", "iFood Jerry's", "ifood", "jerrys-burger", 0.5080, 4, "JIF"),
    ("jerrys-site", "Site Jerry's", "proprio", "jerrys-burger", 0.0410, 5, "JCF"),
]
FONTE_CADASTRO = (
    "Cadastro do grupo Le Tre Farine: marcas e lojas confirmadas pelo dono em 19/10/2026 "
    "(mesma operação, muda a marca); taxas de cadastro do fechamento de agosto/2026."
)


def garantir_cadastro(conn, slug: str) -> tuple[str, dict, dict]:
    """Devolve (tenant_id, marcas por slug, canais por sigla do Saipos).

    Cria tenant/marcas/canais só se não existirem. Num banco que já rodou a
    014 isto é puro SELECT.
    """
    import uuid as _uuid

    tenant_id = tenant_id_por_slug(conn, slug)
    criado = False
    if tenant_id is None:
        tenant_id = str(_uuid.uuid4())
        criado = True
        with tenant(conn, tenant_id) as cur:
            cur.execute(
                """
                insert into alavanca.tenants (id, slug, nome, segmento, imposto_pct, nota_margem,
                                              origem, fonte, coletado_em)
                values (%s, %s, %s, %s, 0, %s, 'REAL', %s, %s)
                """,
                (tenant_id, slug, "Le Tre Farine",
                 "Delivery multimarca: pizzaria, pastas e hamburgueria",
                 "Margem estimada: CMV pela média das fichas de 90 dias. Ainda sem imposto "
                 "e sem custo de entrega: [PREENCHER].",
                 FONTE_CADASTRO, em_sp(2026, 10, 19)),
            )

    with tenant(conn, tenant_id) as cur:
        for slug_marca, nome, segmento, ordem in MARCAS:
            cur.execute(
                """
                insert into alavanca.marcas (tenant_id, slug, nome, segmento, ordem, origem, fonte, coletado_em)
                values (%s, %s, %s, %s, %s, 'REAL', %s, %s)
                on conflict (tenant_id, slug) do nothing
                """,
                (tenant_id, slug_marca, nome, segmento, ordem, FONTE_CADASTRO, em_sp(2026, 10, 19)),
            )
        cur.execute("select slug, id from alavanca.marcas where tenant_id = %s", (tenant_id,))
        marcas = {s: str(i) for s, i in cur.fetchall()}

        for slug_canal, nome, tipo, slug_marca, taxa, ordem, sigla in CANAIS:
            cur.execute(
                """
                insert into alavanca.canais (tenant_id, marca_id, slug, nome, tipo, taxa_pct,
                                             custo_por_pedido, ordem, ext_saipos_marca,
                                             origem, fonte, coletado_em)
                values (%s, %s, %s, %s, %s, %s, 0, %s, %s, 'REAL', %s, %s)
                on conflict (tenant_id, slug) do nothing
                """,
                (tenant_id, marcas[slug_marca], slug_canal, nome, tipo, taxa, ordem, sigla,
                 FONTE_CADASTRO, em_sp(2026, 10, 19)),
            )
        cur.execute(
            "select ext_saipos_marca, id, marca_id, slug from alavanca.canais "
            "where tenant_id = %s and ext_saipos_marca is not null",
            (tenant_id,),
        )
        canais = {sig: {"id": str(cid), "marca_id": str(mid), "slug": s}
                  for sig, cid, mid, s in cur.fetchall()}

    print(f"  tenant {slug} = {tenant_id}" + ("  (criado agora)" if criado else "  (já cadastrado)"))
    return tenant_id, marcas, canais


# ---------------------------------------------------------------------------
# CMV médio por marca, a partir das fichas de 90 dias
# ---------------------------------------------------------------------------
def cmv_por_marca(produtos: list[dict]) -> dict[str, float]:
    """CMV % de cada marca: custo vendido / receita, na janela de 90 dias."""
    saida = {}
    for rotulo in MARCA_POR_ROTULO_CMV:
        linhas = [p for p in produtos if p["marca"] == rotulo]
        if not linhas:
            continue
        custo = sum(float(p["custo_usado"]) * int(p["qtd_90d"]) for p in linhas)
        receita = sum(float(p["receita_90d"]) for p in linhas)
        saida[rotulo] = round(custo / receita, 6)
    return saida


# ---------------------------------------------------------------------------
# venda_dia
# ---------------------------------------------------------------------------
def conferir_diario_contra_mensal(diario: list[dict], mensal: list[dict]) -> list[str]:
    """A soma de cada loja, mês a mês, tem que bater com o total do Saipos."""
    conferidos = []
    for sigla, (col_ped, col_val) in COLUNAS_DIARIO.items():
        por_mes = defaultdict(lambda: [0, 0.0])
        for linha in diario:
            mes = linha["data"][:7]
            por_mes[mes][0] += int(linha[col_ped])
            por_mes[mes][1] += float(linha[col_val])
        for mes, (pedidos, valor) in sorted(por_mes.items()):
            esperado = next(
                (m for m in mensal if m["mes"] == mes and m["canal"] == "todos" and m["marca"] == sigla),
                None,
            )
            if esperado is None:
                raise AssertionError(f"{sigla} {mes}: não há total mensal para conferir")
            if abs(valor - float(esperado["valor_vendas"])) >= 0.01:
                raise AssertionError(
                    f"{sigla} {mes}: diário R$ {valor:.2f} x mensal R$ {float(esperado['valor_vendas']):.2f}"
                )
            if pedidos != int(esperado["pedidos"]):
                raise AssertionError(
                    f"{sigla} {mes}: diário {pedidos} pedidos x mensal {esperado['pedidos']}"
                )
            conferidos.append(f"{sigla} {mes}")
    return conferidos


def importar_venda_dia(conn, tenant_id: str, canais: dict, cmv: dict[str, float]) -> dict:
    diario = ler_csv(ARQ_DIARIO)
    mensal = ler_csv(ARQ_MENSAL)
    conferidos = conferir_diario_contra_mensal(diario, mensal)

    datas = sorted({l["data"] for l in diario})
    esperadas = (PERIODO_DIARIO[1] - PERIODO_DIARIO[0]).days + 1
    if len(datas) != esperadas or len(datas) != len(diario):
        raise AssertionError(
            f"esperava {esperadas} dias sem repetição, li {len(diario)} linhas e {len(datas)} datas"
        )

    fonte = (
        "Saipos > Relatórios > Faturamento por dia, um filtro por marca, todas as origens, "
        "coluna VALOR DE VENDAS (bruto, antes da comissão do canal); arquivo "
        f"dados-fonte/{ARQ_DIARIO.name}, puxado em 07/10/2026. CMV do dia estimado pela média "
        "das fichas técnicas de 90 dias: Pizzaria "
        f"{cmv['Pizzaria'] * 100:.2f}%".replace(".", ",")
        + " (a Pastas não tem ficha própria e usa a média das pizzas)."
    )

    with lote(conn, tenant_id, tipo="saipos_faturamento_diario", fonte=fonte,
              arquivo=ARQ_DIARIO.name, arquivo_hash=sha256(ARQ_DIARIO),
              coletado_em=COLETA_SAIPOS,
              periodo=(PERIODO_DIARIO[0].isoformat(), PERIODO_DIARIO[1].isoformat())) as (cur, reg):
        linhas = []
        for registro in diario:
            reg.lidas += 1
            for sigla, (col_ped, col_val) in COLUNAS_DIARIO.items():
                canal = canais[sigla]
                faturamento = round(float(registro[col_val]), 2)
                pct = cmv[MARCA_CMV_POR_SIGLA[sigla]]
                linhas.append((
                    tenant_id, canal["marca_id"], canal["id"], registro["data"],
                    faturamento, int(registro[col_ped]), round(faturamento * pct, 2), True,
                    fonte, COLETA_SAIPOS,
                ))
        cur.executemany(
            """
            insert into alavanca.venda_dia
              (tenant_id, marca_id, canal_id, data, faturamento, pedidos, cmv, cmv_estimado,
               origem, fonte, coletado_em)
            values (%s, %s, %s, %s, %s, %s, %s, %s, 'REAL', %s, %s)
            on conflict (tenant_id, canal_id, data) do update
              set marca_id = excluded.marca_id,
                  faturamento = excluded.faturamento,
                  pedidos = excluded.pedidos,
                  cmv = excluded.cmv,
                  cmv_estimado = excluded.cmv_estimado,
                  origem = excluded.origem,
                  fonte = excluded.fonte,
                  coletado_em = excluded.coletado_em
            """,
            linhas,
        )
        reg.gravadas = len(linhas)

    print(f"  venda_dia: {reg.gravadas} linhas ({reg.lidas} dias × {len(COLUNAS_DIARIO)} lojas), "
          f"{len(conferidos)} conferências mês×loja bateram com o mensal")
    return {"venda_dia": reg.gravadas, "conferencias": len(conferidos)}


# ---------------------------------------------------------------------------
# ficha_tecnica + venda_prato
# ---------------------------------------------------------------------------
def categoria_do_item(produto: str, rotulo_marca: str) -> str:
    nome = produto.lower()
    if rotulo_marca == "Pizzaria":
        return "Pizzas"
    return "Acompanhamentos" if ("fritas" in nome or "nuggets" in nome) else "Burgers"


def importar_fichas(conn, tenant_id: str, marcas: dict) -> dict:
    produtos = ler_csv(ARQ_CMV)
    fonte = (
        "Saipos > CMV por produto, janela de 90 dias 03/07/2026 a 01/10/2026; arquivo "
        f"dados-fonte/{ARQ_CMV.name}. Custo por ficha do Saipos de 03/10/2026; onde a ficha "
        "não existe ou não corresponde ao prato, o custo é estimado (coluna 'base' diz qual)."
    )
    contagem = {"ficha_tecnica": 0, "venda_prato": 0}

    with lote(conn, tenant_id, tipo="saipos_cmv_produto_90d", fonte=fonte,
              arquivo=ARQ_CMV.name, arquivo_hash=sha256(ARQ_CMV),
              coletado_em=COLETA_CMV,
              periodo=(JANELA_CMV[0].isoformat(), JANELA_CMV[1].isoformat())) as (cur, reg):
        for p in produtos:
            reg.lidas += 1
            rotulo = p["marca"]
            if rotulo not in MARCA_POR_ROTULO_CMV:
                reg.ignoradas += 1
                continue
            marca_id = marcas[MARCA_POR_ROTULO_CMV[rotulo]]
            nome = p["produto"].strip()
            base = p["base"].strip()
            estimado = "estimado" in base.lower() or base.lower().startswith("sem ficha")
            custo_g = float(p["custo_G"]) if p["custo_G"].strip() else None

            cur.execute(
                """
                insert into alavanca.ficha_tecnica
                  (tenant_id, marca_id, codigo, nome, categoria, preco, custo,
                   custo_tamanho_p, custo_tamanho_g, estimado, base, origem, fonte, coletado_em)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'REAL', %s, %s)
                on conflict (tenant_id, marca_id, codigo) do update
                  set nome = excluded.nome, categoria = excluded.categoria,
                      preco = excluded.preco, custo = excluded.custo,
                      custo_tamanho_p = excluded.custo_tamanho_p,
                      custo_tamanho_g = excluded.custo_tamanho_g,
                      estimado = excluded.estimado, base = excluded.base,
                      fonte = excluded.fonte, coletado_em = excluded.coletado_em
                returning id
                """,
                (tenant_id, marca_id, codigo_item(nome), nome,
                 categoria_do_item(nome, rotulo), float(p["preco_medio"]), float(p["custo_usado"]),
                 float(p["custo_P_ou_unico"]), custo_g, estimado, base or None,
                 fonte, COLETA_CMV),
            )
            ficha_id = cur.fetchone()[0]
            contagem["ficha_tecnica"] += 1

            # canal_id NULL = o relatório é da marca inteira, sem separar loja.
            cur.execute(
                """
                insert into alavanca.venda_prato
                  (tenant_id, ficha_id, canal_id, periodo_inicio, periodo_fim,
                   qtd, faturamento, preco_medio, origem, fonte, coletado_em)
                values (%s, %s, null, %s, %s, %s, %s, %s, 'REAL', %s, %s)
                on conflict (tenant_id, ficha_id, periodo_inicio, periodo_fim)
                  where canal_id is null
                do update set qtd = excluded.qtd, faturamento = excluded.faturamento,
                              preco_medio = excluded.preco_medio, fonte = excluded.fonte,
                              coletado_em = excluded.coletado_em
                """,
                (tenant_id, ficha_id, JANELA_CMV[0], JANELA_CMV[1],
                 int(p["qtd_90d"]), float(p["receita_90d"]), float(p["preco_medio"]),
                 fonte, COLETA_CMV),
            )
            contagem["venda_prato"] += 1
            reg.gravadas += 2

    print(f"  ficha_tecnica: {contagem['ficha_tecnica']} itens · "
          f"venda_prato: {contagem['venda_prato']} linhas na janela de 90 dias")
    return contagem


# ---------------------------------------------------------------------------
# canal_taxa_mes (fechamento de agosto)
# ---------------------------------------------------------------------------
def importar_fechamento(conn, tenant_id: str, canais: dict, atualizar_cadastro: bool) -> dict:
    texto = ARQ_FECHAMENTO.read_text(encoding="utf-8")
    mensal = ler_csv(ARQ_MENSAL)
    vendas_saipos = {
        m["marca"]: float(m["valor_vendas"])
        for m in mensal if m["mes"] == "2026-08" and m["canal"] == "todos"
    }

    fonte = (
        "Fechamento de agosto/2026: Portal do Parceiro iFood (Financeiro) e painel Cliente Fiel, "
        f"coletado em 03/09/2026; arquivo dados-fonte/{ARQ_FECHAMENTO.name}. "
        "Vendas brutas são as do próprio canal (iFood conta taxa de entrega e serviço), "
        "por isso diferem da venda registrada no Saipos."
    )
    taxas_efetivas: dict[str, float] = {}

    with lote(conn, tenant_id, tipo="ifood_fechamento_mensal", fonte=fonte,
              arquivo=ARQ_FECHAMENTO.name, arquivo_hash=sha256(ARQ_FECHAMENTO),
              coletado_em=COLETA_FECHAMENTO,
              periodo=("2026-08-01", "2026-08-31")) as (cur, reg):
        for sigla, rotulo in ROTULO_FECHAMENTO.items():
            colunas = linha_da_tabela(texto, rotulo)
            if colunas is None:
                reg.ignoradas += 1
                continue
            reg.lidas += 1
            bruto, taxas, servicos, ajustes, liquido = (brl(c) for c in colunas[1:6])
            take_rate = round((bruto - liquido) / bruto, 6) if bruto else None

            repasse = linha_da_tabela(texto, ROTULO_REPASSE.get(sigla, "\0"))
            total_rep = ja_rec = a_rec = na_loja = None
            if repasse:
                total_rep, ja_rec, a_rec, na_loja = (brl(c) for c in repasse[1:5])

            cur.execute(
                """
                insert into alavanca.canal_taxa_mes
                  (tenant_id, canal_id, mes, vendas_brutas, taxas_comissoes, servicos_promocoes,
                   ajustes, liquido, take_rate_pct, total_repasses, ja_recebido, a_receber,
                   recebido_na_loja, origem, fonte, coletado_em)
                values (%s, %s, date '2026-08-01', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        'REAL', %s, %s)
                on conflict (tenant_id, canal_id, mes) do update
                  set vendas_brutas = excluded.vendas_brutas,
                      taxas_comissoes = excluded.taxas_comissoes,
                      servicos_promocoes = excluded.servicos_promocoes,
                      ajustes = excluded.ajustes,
                      liquido = excluded.liquido,
                      take_rate_pct = excluded.take_rate_pct,
                      total_repasses = excluded.total_repasses,
                      ja_recebido = excluded.ja_recebido,
                      a_receber = excluded.a_receber,
                      recebido_na_loja = excluded.recebido_na_loja,
                      fonte = excluded.fonte, coletado_em = excluded.coletado_em
                """,
                (tenant_id, canais[sigla]["id"], bruto, taxas, servicos, ajustes, liquido,
                 take_rate, total_rep, ja_rec, a_rec, na_loja, fonte, COLETA_FECHAMENTO),
            )
            reg.gravadas += 1

            # Taxa efetiva sobre a venda que o Saipos registrou: quanto da venda
            # de agosto não chegou na conta. É a conta que o painel já usa, e é
            # diferente do take-rate do documento, que compara com o bruto do
            # próprio canal.
            venda = vendas_saipos.get(sigla, 0.0)
            if venda > 0:
                taxas_efetivas[sigla] = round(max(0.0, (venda - liquido) / venda), 6)

        if atualizar_cadastro:
            for sigla, taxa in taxas_efetivas.items():
                cur.execute(
                    "update alavanca.canais set taxa_pct = %s, fonte = %s, coletado_em = %s "
                    "where tenant_id = %s and id = %s",
                    (taxa, fonte, COLETA_FECHAMENTO, tenant_id, canais[sigla]["id"]),
                )

    print(f"  canal_taxa_mes: {reg.gravadas} lojas em 2026-08")
    for sigla, taxa in sorted(taxas_efetivas.items()):
        print(f"    taxa efetiva sobre a venda do Saipos · {CANAL_POR_SIGLA[sigla]}: "
              f"{taxa * 100:.2f}%".replace(".", ","))
    if atualizar_cadastro:
        print("    canais.taxa_pct atualizado com essas taxas (--atualizar-taxa-cadastro)")
    return {"canal_taxa_mes": reg.gravadas, "taxas_efetivas": taxas_efetivas}


# ---------------------------------------------------------------------------
# campanhas + anuncio_dia (Meta Ads, grão MENSAL)
# ---------------------------------------------------------------------------
def resolver_marca_campanha(cur, tenant_id: str, nome: str, padrao: str | None) -> str | None:
    """Aplica campaign_brand_map por prioridade; sem match, a marca padrão."""
    cur.execute(
        "select marca_id, tipo_padrao, padrao from alavanca.campaign_brand_map "
        "where tenant_id = %s and ativo and campo = 'campanha' order by prioridade",
        (tenant_id,),
    )
    alvo = nome.lower()
    for marca_id, tipo_padrao, texto in cur.fetchall():
        texto = texto.lower()
        casou = (
            (tipo_padrao == "contem" and texto in alvo)
            or (tipo_padrao == "prefixo" and alvo.startswith(texto))
            or (tipo_padrao == "exato" and alvo == texto)
            or (tipo_padrao == "regex" and re.search(texto, alvo))
        )
        if casou:
            return str(marca_id)
    return padrao


def importar_meta_ads(conn, tenant_id: str) -> dict:
    bruto = json.loads(ARQ_META.read_text(encoding="utf-8"))
    conta = "act_729176045647334"  # conta única das duas marcas (guardrails.json)

    fonte = (
        "Meta Ads via Windsor.ai, conector facebook, conta CA - Le Tre Farine "
        f"({conta}); arquivo dados-fonte/{ARQ_META.name}, puxado em 07/10/2026. "
        "GRÃO MENSAL: cada linha é o mês inteiro, gravada no dia 1 do mês com hora nula. "
        "NÃO somar com dado diário. Outubro é parcial (até 06/10). O export não traz o id "
        "da campanha, então external_id é derivado do nome (prefixo 'nome-sha256:')."
    )

    with lote(conn, tenant_id, tipo="meta_ads_mensal", fonte=fonte,
              arquivo=ARQ_META.name, arquivo_hash=sha256(ARQ_META),
              coletado_em=COLETA_META, periodo=("2026-05-01", "2026-10-06")) as (cur, reg):
        cur.execute(
            "select valor #>> '{}' from alavanca.tenant_config "
            "where tenant_id = %s and chave = 'midia.marca_padrao'",
            (tenant_id,),
        )
        linha = cur.fetchone()
        marca_padrao = linha[0] if linha else None

        campanhas: dict[str, tuple[str, str | None]] = {}
        gravadas_anuncio = 0
        for registro in bruto["linhas"]:
            reg.lidas += 1
            nome = registro["campaign"]
            if nome not in campanhas:
                externo = "nome-sha256:" + hashlib.sha256(nome.encode("utf-8")).hexdigest()[:24]
                marca_id = resolver_marca_campanha(cur, tenant_id, nome, marca_padrao)
                cur.execute(
                    """
                    insert into alavanca.campanhas
                      (tenant_id, marca_id, provedor, external_id, nome, conta_externa,
                       origem, fonte, coletado_em)
                    values (%s, %s, 'meta_ads', %s, %s, %s, 'REAL', %s, %s)
                    on conflict (tenant_id, provedor, external_id) do update
                      set nome = excluded.nome, marca_id = excluded.marca_id,
                          conta_externa = excluded.conta_externa,
                          fonte = excluded.fonte, coletado_em = excluded.coletado_em
                    returning id
                    """,
                    (tenant_id, marca_id, externo, nome, conta, fonte, COLETA_META),
                )
                campanhas[nome] = (str(cur.fetchone()[0]), marca_id)

            campanha_id, marca_id = campanhas[nome]
            dia_1 = date(2026, int(registro["month"]), 1)
            investimento = float(registro["spend"] or 0)
            pedidos = int(registro["actions_omni_purchase"] or 0)
            faturamento = float(registro["action_values_omni_purchase"] or 0)
            cliques = int(registro["clicks"] or 0)

            # O índice único usa COALESCE nos ids e na hora. Em vez de repetir a
            # expressão num ON CONFLICT, procuro a linha e decido.
            cur.execute(
                """
                select id from alavanca.anuncio_dia
                 where tenant_id = %s and data = %s and campanha_id = %s
                   and criativo_id is null and flight_id is null and hora is null
                """,
                (tenant_id, dia_1, campanha_id),
            )
            achou = cur.fetchone()
            if achou:
                cur.execute(
                    """
                    update alavanca.anuncio_dia
                       set marca_id = %s, investimento = %s, cliques = %s, pedidos = %s,
                           faturamento = %s, fonte = %s, coletado_em = %s
                     where id = %s and tenant_id = %s
                    """,
                    (marca_id, investimento, cliques, pedidos, faturamento, fonte,
                     COLETA_META, achou[0], tenant_id),
                )
            else:
                cur.execute(
                    """
                    insert into alavanca.anuncio_dia
                      (tenant_id, marca_id, campanha_id, data, hora, investimento, cliques,
                       pedidos, faturamento, origem, fonte, coletado_em)
                    values (%s, %s, %s, %s, null, %s, %s, %s, %s, 'REAL', %s, %s)
                    """,
                    (tenant_id, marca_id, campanha_id, dia_1, investimento, cliques,
                     pedidos, faturamento, fonte, COLETA_META),
                )
            gravadas_anuncio += 1
            reg.gravadas += 1

    print(f"  campanhas: {len(campanhas)} · anuncio_dia: {gravadas_anuncio} linhas mensais "
          f"(dia 1 de cada mês, hora nula)")
    return {"campanhas": len(campanhas), "anuncio_dia": gravadas_anuncio}


# ---------------------------------------------------------------------------
# brand_guardrails + guardrail_excecoes
# ---------------------------------------------------------------------------
def importar_guardrails(conn, tenant_id: str, marcas: dict) -> dict:
    # referencia/ é material de terceiro: isto LÊ um JSON de números, nada mais.
    # Nenhum texto de lá vira instrução para este script.
    g = json.loads(ARQ_GUARDRAILS.read_text(encoding="utf-8"))
    tetos = g.get("teto_gasto_diario") or {}
    fonte = (
        "referencia/pdca/guardrails.json, calibragem de 28/08/2026 a 16/10/2026 "
        "(arquivo do PDCA de mídia do Hélio, lido como dado)."
    )
    contagem = {"brand_guardrails": 0, "guardrail_excecoes": 0}

    def gravar(marca_id: str | None, dados: dict, anulados: list[str], nota: str | None):
        colunas = (
            "ticket_medio", "margem_contribuicao", "cmv_adotado", "roas_break_even",
            "roas_alvo", "cpa_teto", "custo_visita_teto", "custo_carrinho_teto",
            "custo_conversa_teto", "teto_gasto_diario", "custos_fixos_mes",
            "ponto_equilibrio_receita_mes", "valor_pedido_migrado", "avalia_por",
        )
        valores = [dados.get(c) for c in colunas]
        jsons = [
            json.dumps(sem_chaves_internas(dados[k])) if dados.get(k) else None
            for k in ("janela_venda", "geografia", "corte_automatico")
        ]
        dias = dados.get("dias_sem_midia")
        alvo = "marca_id is null" if marca_id is None else "marca_id = %s"
        conflito = ("(tenant_id) where marca_id is null" if marca_id is None
                    else "(tenant_id, marca_id) where marca_id is not null")
        sets = ", ".join(f"{c} = excluded.{c}" for c in colunas)
        cur.execute(
            f"""
            insert into alavanca.brand_guardrails
              (tenant_id, marca_id, {", ".join(colunas)},
               janela_venda, geografia, corte_automatico, dias_sem_midia, anulados,
               nota, origem, fonte, coletado_em)
            values (%s, %s, {", ".join(["%s"] * len(colunas))},
                    %s::jsonb, %s::jsonb, %s::jsonb, %s::smallint[], %s::text[],
                    %s, 'REAL', %s, %s)
            on conflict {conflito} do update
              set {sets},
                  janela_venda = excluded.janela_venda,
                  geografia = excluded.geografia,
                  corte_automatico = excluded.corte_automatico,
                  dias_sem_midia = excluded.dias_sem_midia,
                  anulados = excluded.anulados,
                  -- nota escrita à mão na 014 não é apagada por este import
                  nota = coalesce(brand_guardrails.nota, excluded.nota),
                  fonte = excluded.fonte, coletado_em = excluded.coletado_em
            """,
            [tenant_id, marca_id, *valores, *jsons, dias, anulados, nota,
             fonte, COLETA_GUARDRAILS],
        )

    with lote(conn, tenant_id, tipo="pdca_guardrails", fonte=fonte,
              arquivo="guardrails.json", arquivo_hash=sha256(ARQ_GUARDRAILS),
              coletado_em=COLETA_GUARDRAILS) as (cur, reg):
        # raiz do tenant
        reg.lidas += 1
        raiz = dict(g)
        raiz["teto_gasto_diario"] = tetos.get("_default")
        raiz["valor_pedido_migrado"] = g.get("valor_pedido_migrado_do_ifood")
        gravar(None, raiz, [], None)
        contagem["brand_guardrails"] += 1
        reg.gravadas += 1

        for rotulo, bloco in (g.get("por_marca") or {}).items():
            if rotulo.startswith("_") or rotulo not in MARCA_POR_ROTULO_GUARDRAIL:
                reg.ignoradas += 1
                continue
            reg.lidas += 1
            marca_id = marcas[MARCA_POR_ROTULO_GUARDRAIL[rotulo]]
            dados = dict(bloco)
            dados["teto_gasto_diario"] = tetos.get(rotulo)
            # "null no bloco da marca" quer dizer "não avalie por isto", não
            # "herde a raiz". É exatamente o que a coluna anulados registra.
            anulados = sorted(k for k, v in bloco.items() if not k.startswith("_") and v is None)
            nota = (bloco.get("_leia") or "")[:400] or None
            gravar(marca_id, dados, anulados, nota)
            contagem["brand_guardrails"] += 1
            reg.gravadas += 1

        for adset_id, excecao in (g.get("excecoes_corte_automatico") or {}).items():
            if adset_id.startswith("_"):
                continue
            reg.lidas += 1
            cur.execute(
                """
                insert into alavanca.guardrail_excecoes
                  (tenant_id, external_adset_id, nome, motivo, vale_ate, criado_por)
                values (%s, %s, %s, %s, %s, 'guardrails.json')
                on conflict (tenant_id, external_adset_id, vale_ate) do update
                  set nome = excluded.nome, motivo = excluded.motivo
                """,
                (tenant_id, adset_id, excecao.get("nome"), excecao.get("motivo"), excecao["ate"]),
            )
            contagem["guardrail_excecoes"] += 1
            reg.gravadas += 1

    print(f"  brand_guardrails: {contagem['brand_guardrails']} linhas "
          f"(raiz + marcas) · guardrail_excecoes: {contagem['guardrail_excecoes']}")
    return contagem


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
PASSOS = ("venda_dia", "fichas", "fechamento", "meta_ads", "guardrails")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Importa os dados reais do grupo Le Tre para o Postgres da Alavanca.")
    ap.add_argument("--tenant-slug", default=SLUG_TENANT)
    ap.add_argument("--so", default="", help=f"só estes passos, separados por vírgula: {', '.join(PASSOS)}")
    ap.add_argument("--atualizar-taxa-cadastro", action="store_true",
                    help="além de canal_taxa_mes, grava a taxa efetiva de agosto em canais.taxa_pct")
    args = ap.parse_args(argv)
    passos = [p.strip() for p in args.so.split(",") if p.strip()] or list(PASSOS)
    desconhecidos = set(passos) - set(PASSOS)
    if desconhecidos:
        print(f"passo desconhecido: {', '.join(sorted(desconhecidos))}", file=sys.stderr)
        return 2

    try:
        conn = conectar()
    except SemBanco as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 1

    resultado: dict[str, object] = {}
    with conn:
        print("Importando o grupo Le Tre Farine")
        tenant_id, marcas, canais = garantir_cadastro(conn, args.tenant_slug)
        produtos = ler_csv(ARQ_CMV)
        cmv = cmv_por_marca(produtos)
        print("  CMV médio de 90 dias: " + " · ".join(
            f"{m} {v * 100:.2f}%".replace(".", ",") for m, v in sorted(cmv.items())))

        if "venda_dia" in passos:
            resultado |= importar_venda_dia(conn, tenant_id, canais, cmv)
        if "fichas" in passos:
            resultado |= importar_fichas(conn, tenant_id, marcas)
        if "fechamento" in passos:
            resultado |= importar_fechamento(conn, tenant_id, canais, args.atualizar_taxa_cadastro)
        if "meta_ads" in passos:
            resultado |= importar_meta_ads(conn, tenant_id)
        if "guardrails" in passos:
            resultado |= importar_guardrails(conn, tenant_id, marcas)

        with tenant(conn, tenant_id) as cur:
            cur.execute(
                "select count(*) from alavanca.venda_dia v join alavanca.canais c on c.id = v.canal_id "
                "where v.tenant_id = %s and c.slug like 'jerrys-%%'",
                (tenant_id,),
            )
            jerrys = cur.fetchone()[0]

    print("\nPENDÊNCIA conhecida, não é erro:")
    print(f"  Jerry's Burger segue com {jerrys} linhas de venda_dia. Os CSVs diários do Saipos "
          "cobrem só as três lojas da Le Tre.")
    print("  O total MENSAL do Jerry's existe (JIF e JCF no saipos_faturamento_mensal), mas "
          "distribuir mês em dia seria inventar número: não foi feito.")
    print("  meta_dia_semana continua vazia: o dono ainda vai definir as metas.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
