#!/usr/bin/env python3
"""Cria o tenant de demonstração "Pizzaria Exemplo" no banco da Alavanca.

Serve para o painel ter o que mostrar — telas cheias, gráficos com forma, a
comanda do dia funcionando — sem precisar de um cliente real na tela. Tudo que
este script grava sai de painel/src/data/clientes/pizzaria-exemplo/*.json e
entra com origem='EXEMPLO'.

Por que isso importa: com origem no banco, qualquer tela, relatório ou consulta
consegue separar o que é medição do que é demonstração. Número de exemplo nunca
vira número de reunião por engano.

Nenhum dado pessoal entra: as conversas de whatsapp.json (com "Cliente 4821" e
transcrições) ficam de fora de propósito. O que entra delas é só o agregado
diário.

Rodar duas vezes não duplica.

Uso:
    python seed_exemplo.py
    python seed_exemplo.py --slug outra-demo --apagar
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from datetime import date, timedelta
from pathlib import Path

from alavanca_db import PAINEL_DADOS, SemBanco, conectar, em_sp, tenant, tenant_id_por_slug

PASTA = PAINEL_DADOS / "pizzaria-exemplo"
SLUG = "pizzaria-exemplo"
COLETA = em_sp(2026, 10, 8)  # data dos arquivos do esboço do painel
FONTE = (
    "Dados de DEMONSTRAÇÃO gerados pelo esboço do painel "
    "(painel/src/data/clientes/pizzaria-exemplo/*.json, 08/10/2026). "
    "Não é medição de nenhum restaurante."
)
# dom = 0, como na coluna dia_semana
DIA_SEMANA = {"dom": 0, "seg": 1, "ter": 2, "qua": 3, "qui": 4, "sex": 5, "sab": 6}
MARCA_SLUG = "pizzaria-exemplo"


def ler(nome: str) -> dict:
    return json.loads((PASTA / f"{nome}.json").read_text(encoding="utf-8"))


def semear(conn, slug: str) -> dict[str, int]:
    cliente = ler("cliente")
    metricas = ler("metricas")
    lucro = ler("lucro")
    ifood = ler("ifood")
    proprio = ler("canal-proprio")
    crm = ler("crm")
    plano = ler("plano")
    whats = ler("whatsapp")
    n: dict[str, int] = {}

    tenant_id = tenant_id_por_slug(conn, slug) or str(uuid.uuid4())

    with tenant(conn, tenant_id) as cur:
        # -- tenant / marca / canais -------------------------------------
        cur.execute(
            """
            insert into alavanca.tenants (id, slug, nome, segmento, imposto_pct, nota_margem,
                                          origem, fonte, coletado_em)
            values (%s, %s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
            on conflict (slug) do update
              set nome = excluded.nome, segmento = excluded.segmento,
                  imposto_pct = excluded.imposto_pct, nota_margem = excluded.nota_margem,
                  origem = excluded.origem, fonte = excluded.fonte,
                  coletado_em = excluded.coletado_em
            returning id
            """,
            (tenant_id, slug, cliente["nome"], cliente.get("segmento"),
             cliente.get("impostoPct") or 0,
             "Tenant de demonstração. Nenhum número aqui é medição.", FONTE, COLETA),
        )
        tenant_id = str(cur.fetchone()[0])
        n["tenants"] = 1

        cur.execute(
            """
            insert into alavanca.marcas (tenant_id, slug, nome, segmento, ordem, origem, fonte, coletado_em)
            values (%s, %s, %s, %s, 1, 'EXEMPLO', %s, %s)
            on conflict (tenant_id, slug) do update set nome = excluded.nome
            returning id
            """,
            (tenant_id, MARCA_SLUG, cliente["nome"], cliente.get("segmento"), FONTE, COLETA),
        )
        marca_id = str(cur.fetchone()[0])
        n["marcas"] = 1

        canais: dict[str, str] = {}
        for ordem, (chave, cfg) in enumerate(cliente["canais"].items(), 1):
            cur.execute(
                """
                insert into alavanca.canais (tenant_id, marca_id, slug, nome, tipo, taxa_pct,
                                             custo_por_pedido, ordem, origem, fonte, coletado_em)
                values (%s, %s, %s, %s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
                on conflict (tenant_id, slug) do update
                  set nome = excluded.nome, taxa_pct = excluded.taxa_pct,
                      custo_por_pedido = excluded.custo_por_pedido, ordem = excluded.ordem
                returning id
                """,
                (tenant_id, marca_id, chave, cfg["nome"], chave, cfg["taxaPct"],
                 cfg.get("custoPorPedido") or 0, ordem, FONTE, COLETA),
            )
            canais[chave] = str(cur.fetchone()[0])
        n["canais"] = len(canais)

        lim = cliente["limites"]
        cur.execute(
            """
            insert into alavanca.limites_alerta
              (tenant_id, marca_id, meta_minima_pct, margem_minima_pct, queda_pedidos_pct,
               ifood_maximo_pct, queda_ticket_pct, origem, fonte, coletado_em)
            values (%s, null, %s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
            on conflict (tenant_id) where marca_id is null do update
              set meta_minima_pct = excluded.meta_minima_pct,
                  margem_minima_pct = excluded.margem_minima_pct,
                  queda_pedidos_pct = excluded.queda_pedidos_pct,
                  ifood_maximo_pct = excluded.ifood_maximo_pct,
                  queda_ticket_pct = excluded.queda_ticket_pct
            """,
            (tenant_id, lim["metaMinimaPct"], lim["margemMinimaPct"], lim["quedaPedidosPct"],
             lim["ifoodMaximoPct"], lim["quedaTicketPct"], FONTE, COLETA),
        )
        n["limites_alerta"] = 1

        # -- meta por dia da semana --------------------------------------
        metas = cliente.get("metaPorDiaSemana") or {}
        cur.executemany(
            """
            insert into alavanca.meta_dia_semana
              (tenant_id, marca_id, dia_semana, valor, vigente_de, origem, fonte, coletado_em)
            values (%s, null, %s, %s, date '1900-01-01', 'EXEMPLO', %s, %s)
            on conflict (tenant_id, dia_semana, vigente_de) where marca_id is null
            do update set valor = excluded.valor
            """,
            [(tenant_id, DIA_SEMANA[d], v, FONTE, COLETA) for d, v in metas.items()],
        )
        n["meta_dia_semana"] = len(metas)

        # -- venda_dia + producao_dia ------------------------------------
        # O esboço traz o CMV do DIA inteiro, não por canal. Rateio pelo
        # faturamento; é número de demonstração e a fonte diz isso.
        vendas, producoes = [], []
        for dia in metricas["dias"]:
            total = sum(c["faturamento"] for c in dia["canais"].values()) or 1.0
            for chave, c in dia["canais"].items():
                vendas.append((
                    tenant_id, marca_id, canais[chave], dia["data"], c["faturamento"],
                    c["pedidos"], round(dia.get("cmv", 0) * c["faturamento"] / total, 2),
                    FONTE + " CMV do dia rateado entre os canais pelo faturamento.", COLETA,
                ))
            prod = dia.get("producao") or {}
            producoes.append((tenant_id, marca_id, dia["data"],
                              prod.get("pizzas", 0), prod.get("perdas", 0), FONTE, COLETA))
        cur.executemany(
            """
            insert into alavanca.venda_dia (tenant_id, marca_id, canal_id, data, faturamento,
                                            pedidos, cmv, cmv_estimado, origem, fonte, coletado_em)
            values (%s, %s, %s, %s, %s, %s, %s, true, 'EXEMPLO', %s, %s)
            on conflict (tenant_id, canal_id, data) do update
              set faturamento = excluded.faturamento, pedidos = excluded.pedidos,
                  cmv = excluded.cmv, fonte = excluded.fonte
            """, vendas)
        n["venda_dia"] = len(vendas)
        cur.executemany(
            """
            insert into alavanca.producao_dia (tenant_id, marca_id, data, unidades, perdas,
                                               origem, fonte, coletado_em)
            values (%s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
            on conflict (tenant_id, marca_id, data) do update
              set unidades = excluded.unidades, perdas = excluded.perdas
            """, producoes)
        n["producao_dia"] = len(producoes)

        # -- fichas + preço do iFood + venda por prato -------------------
        preco_ifood = {p["id"]: p.get("precoIfood") for p in ifood.get("pratos", [])}
        fichas: dict[str, str] = {}
        for f in lucro["fichas"]:
            cur.execute(
                """
                insert into alavanca.ficha_tecnica
                  (tenant_id, marca_id, codigo, nome, categoria, preco, custo, preco_ifood,
                   origem, fonte, coletado_em)
                values (%s, %s, %s, %s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
                on conflict (tenant_id, marca_id, codigo) do update
                  set nome = excluded.nome, categoria = excluded.categoria,
                      preco = excluded.preco, custo = excluded.custo,
                      preco_ifood = excluded.preco_ifood
                returning id
                """,
                (tenant_id, marca_id, f["id"], f["nome"], f.get("categoria"),
                 f["preco"], f["custo"], preco_ifood.get(f["id"]), FONTE, COLETA),
            )
            fichas[f["id"]] = str(cur.fetchone()[0])
        n["ficha_tecnica"] = len(fichas)

        # Série CONSOLIDADA (canal_id null = todos os canais juntos). É a que a tela
        # de Lucro usa para a engenharia de cardápio.
        pratos = []
        for dia in lucro.get("vendasPratosDia", []):
            for codigo, qtd in dia["qtd"].items():
                if codigo in fichas:
                    pratos.append((tenant_id, fichas[codigo], dia["data"], dia["data"], qtd, FONTE, COLETA))
        cur.executemany(
            """
            insert into alavanca.venda_prato (tenant_id, ficha_id, canal_id, periodo_inicio,
                                              periodo_fim, qtd, origem, fonte, coletado_em)
            values (%s, %s, null, %s, %s, %s, 'EXEMPLO', %s, %s)
            on conflict (tenant_id, ficha_id, periodo_inicio, periodo_fim) where canal_id is null
            do update set qtd = excluded.qtd
            """, pratos)
        n["venda_prato"] = len(pratos)

        # Série POR CANAL do iFood. Sem ela a tela de iFood nunca tem prato: a query do
        # painel casa venda_prato com canais por canal_id, e a série consolidada acima
        # tem canal_id nulo de propósito. São duas séries diferentes do esboço
        # (lucro.vendasPratosDia e ifood.vendasPratosDia), não uma repetida.
        canal_ifood_id = canais.get("ifood")
        pratos_ifood = []
        if canal_ifood_id:
            for dia in ifood.get("vendasPratosDia", []):
                for codigo, qtd in dia["qtd"].items():
                    if codigo in fichas:
                        pratos_ifood.append((tenant_id, fichas[codigo], canal_ifood_id,
                                             dia["data"], dia["data"], qtd, FONTE, COLETA))
            cur.executemany(
                """
                insert into alavanca.venda_prato (tenant_id, ficha_id, canal_id, periodo_inicio,
                                                  periodo_fim, qtd, origem, fonte, coletado_em)
                values (%s, %s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
                on conflict (tenant_id, ficha_id, canal_id, periodo_inicio, periodo_fim)
                  where canal_id is not null
                do update set qtd = excluded.qtd
                """, pratos_ifood)
        n["venda_prato"] += len(pratos_ifood)

        # -- iFood: funil, operação, faixas, promoções -------------------
        canal_ifood = canais.get("ifood")
        if canal_ifood:
            cur.executemany(
                """
                insert into alavanca.ifood_funil_dia (tenant_id, canal_id, data, visitas,
                                                      cardapio, sacola, pedidos, origem, fonte, coletado_em)
                values (%s, %s, %s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
                on conflict (tenant_id, canal_id, data) do update
                  set visitas = excluded.visitas, cardapio = excluded.cardapio,
                      sacola = excluded.sacola, pedidos = excluded.pedidos
                """,
                [(tenant_id, canal_ifood, d["data"], d["visitas"], d["cardapio"],
                  d["sacola"], d["pedidos"], FONTE, COLETA) for d in ifood.get("funilDia", [])],
            )
            n["ifood_funil_dia"] = len(ifood.get("funilDia", []))

            cur.executemany(
                """
                insert into alavanca.ifood_operacao_dia (tenant_id, canal_id, data, nota,
                                                         tempo_entrega_min, cancelados, origem, fonte, coletado_em)
                values (%s, %s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
                on conflict (tenant_id, canal_id, data) do update
                  set nota = excluded.nota, tempo_entrega_min = excluded.tempo_entrega_min,
                      cancelados = excluded.cancelados
                """,
                [(tenant_id, canal_ifood, d["data"], d.get("nota"), d.get("tempoEntregaMin"),
                  d.get("cancelados", 0), FONTE, COLETA) for d in ifood.get("operacaoDia", [])],
            )
            n["ifood_operacao_dia"] = len(ifood.get("operacaoDia", []))

            faixas = []
            for d in ifood.get("pedidosPorFaixaDia", []):
                for ordem, (faixa, pedidos) in enumerate(d["faixas"].items(), 1):
                    faixas.append((tenant_id, canal_ifood, d["data"], faixa, ordem, pedidos, FONTE, COLETA))
            cur.executemany(
                """
                insert into alavanca.ifood_faixa_dia (tenant_id, canal_id, data, faixa, ordem,
                                                      pedidos, origem, fonte, coletado_em)
                values (%s, %s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
                on conflict (tenant_id, canal_id, data, faixa) do update
                  set ordem = excluded.ordem, pedidos = excluded.pedidos
                """, faixas)
            n["ifood_faixa_dia"] = len(faixas)

            promos: dict[str, str] = {}
            for p in ifood.get("promocoes", []):
                cur.execute(
                    """
                    insert into alavanca.promocoes (tenant_id, canal_id, codigo, nome, tipo,
                                                    quem_banca, origem, fonte, coletado_em)
                    values (%s, %s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
                    on conflict (tenant_id, codigo) do update
                      set nome = excluded.nome, tipo = excluded.tipo, quem_banca = excluded.quem_banca
                    returning id
                    """,
                    (tenant_id, canal_ifood, p["id"], p["nome"], p.get("tipo"),
                     p.get("quemBanca"), FONTE, COLETA),
                )
                promos[p["id"]] = str(cur.fetchone()[0])
            n["promocoes"] = len(promos)

            linhas = []
            for d in ifood.get("promocoesDia", []):
                for codigo, v in d["promocoes"].items():
                    if codigo in promos:
                        linhas.append((tenant_id, promos[codigo], d["data"], v.get("pedidos", 0),
                                       v.get("faturamento", 0), v.get("custo", 0), FONTE, COLETA))
            cur.executemany(
                """
                insert into alavanca.promocao_dia (tenant_id, promocao_id, data, pedidos,
                                                   faturamento, custo, origem, fonte, coletado_em)
                values (%s, %s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
                on conflict (tenant_id, promocao_id, data) do update
                  set pedidos = excluded.pedidos, faturamento = excluded.faturamento,
                      custo = excluded.custo
                """, linhas)
            n["promocao_dia"] = len(linhas)

        # -- canal próprio: campanhas, criativos, anúncio por dia --------
        campanhas: dict[str, str] = {}
        for c in proprio.get("campanhas", []):
            cur.execute(
                """
                insert into alavanca.campanhas (tenant_id, marca_id, provedor, external_id, nome,
                                                status, objetivo, orcamento_dia, origem, fonte, coletado_em)
                values (%s, %s, 'meta_ads', %s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
                on conflict (tenant_id, provedor, external_id) do update
                  set nome = excluded.nome, status = excluded.status,
                      objetivo = excluded.objetivo, orcamento_dia = excluded.orcamento_dia
                returning id
                """,
                (tenant_id, marca_id, c["id"], c["nome"], c.get("status", "ativa"),
                 c.get("objetivo"), c.get("orcamentoDia"), FONTE, COLETA),
            )
            campanhas[c["id"]] = str(cur.fetchone()[0])
        n["campanhas"] = len(campanhas)

        criativos: dict[str, tuple[str, str | None]] = {}
        for k in proprio.get("criativos", []):
            campanha_id = campanhas.get(k.get("campanhaId"))
            cur.execute(
                """
                insert into alavanca.criativos (tenant_id, campanha_id, external_id, nome,
                                                formato, origem, fonte, coletado_em)
                values (%s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
                on conflict (tenant_id, external_id) do update
                  set nome = excluded.nome, formato = excluded.formato, campanha_id = excluded.campanha_id
                returning id
                """,
                (tenant_id, campanha_id, k["id"], k["nome"], k.get("formato"), FONTE, COLETA),
            )
            criativos[k["id"]] = (str(cur.fetchone()[0]), campanha_id)
        n["criativos"] = len(criativos)

        anuncios = 0
        for d in proprio.get("anunciosDia", []):
            for codigo, v in d["criativos"].items():
                if codigo not in criativos:
                    continue
                criativo_id, campanha_id = criativos[codigo]
                cur.execute(
                    """
                    select id from alavanca.anuncio_dia
                     where tenant_id = %s and data = %s and criativo_id = %s and hora is null
                    """, (tenant_id, d["data"], criativo_id))
                achou = cur.fetchone()
                dados = (v.get("investimento", 0), v.get("impressoes", 0), v.get("cliques", 0),
                         v.get("pedidos", 0), v.get("faturamento", 0))
                if achou:
                    cur.execute(
                        "update alavanca.anuncio_dia set investimento=%s, impressoes=%s, cliques=%s, "
                        "pedidos=%s, faturamento=%s where id=%s and tenant_id=%s",
                        (*dados, achou[0], tenant_id))
                else:
                    cur.execute(
                        """
                        insert into alavanca.anuncio_dia (tenant_id, marca_id, campanha_id, criativo_id,
                                                          data, hora, investimento, impressoes, cliques,
                                                          pedidos, faturamento, origem, fonte, coletado_em)
                        values (%s, %s, %s, %s, %s, null, %s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
                        """,
                        (tenant_id, marca_id, campanha_id, criativo_id, d["data"], *dados, FONTE, COLETA))
                anuncios += 1
        n["anuncio_dia"] = anuncios

        datas = sorted(d["data"] for d in metricas["dias"])
        fim = date.fromisoformat(datas[-1])
        alc = (proprio.get("alcance") or {}).get("30d")
        if isinstance(alc, dict):
            valor = alc.get("atual", 0)
            cur.execute(
                """
                insert into alavanca.midia_alcance (tenant_id, marca_id, periodo_inicio, periodo_fim,
                                                    alcance, origem, fonte, coletado_em)
                values (%s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
                on conflict (tenant_id, coalesce(marca_id, '00000000-0000-0000-0000-000000000000'::uuid),
                             periodo_inicio, periodo_fim)
                do update set alcance = excluded.alcance
                """,
                (tenant_id, marca_id, fim - timedelta(days=29), fim, valor, FONTE, COLETA))
            n["midia_alcance"] = 1

        # -- CRM: segmentos, retrato do dia e disparos -------------------
        segmentos: dict[str, str] = {}
        for ordem, s in enumerate(crm.get("segmentos", []), 1):
            cur.execute(
                """
                insert into alavanca.crm_segmento (tenant_id, codigo, nome, criterio, acao_sugerida,
                                                   ordem, origem, fonte, coletado_em)
                values (%s, %s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
                on conflict (tenant_id, codigo) do update
                  set nome = excluded.nome, criterio = excluded.criterio,
                      acao_sugerida = excluded.acao_sugerida, ordem = excluded.ordem
                returning id
                """,
                (tenant_id, s["id"], s["nome"], s["criterio"], s.get("acao"), ordem, FONTE, COLETA))
            segmentos[s["id"]] = str(cur.fetchone()[0])
        n["crm_segmento"] = len(segmentos)

        cur.executemany(
            """
            insert into alavanca.crm_segmento_snapshot (tenant_id, segmento_id, data, clientes,
                                                        com_opt_in, valor_90d, origem, fonte, coletado_em)
            values (%s, %s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
            on conflict (tenant_id, segmento_id, data) do update
              set clientes = excluded.clientes, com_opt_in = excluded.com_opt_in,
                  valor_90d = excluded.valor_90d
            """,
            [(tenant_id, segmentos[s["id"]], fim, s["clientes"], s["comOptIn"],
              s.get("valor90d", 0), FONTE, COLETA) for s in crm.get("segmentos", [])],
        )
        n["crm_segmento_snapshot"] = len(segmentos)

        # sniper_lotes não tem chave natural: para o seed ser repetível,
        # apago os lotes EXEMPLO deste tenant e reescrevo.
        cur.execute("delete from alavanca.sniper_lotes where tenant_id = %s and origem = 'EXEMPLO'",
                    (tenant_id,))
        cur.executemany(
            """
            insert into alavanca.sniper_lotes (tenant_id, marca_id, segmento_id, nome, motor,
                                               template_corpo, status, agendado_para, total_alvo,
                                               custo_por_mensagem, finalidade, concluido_em,
                                               origem, fonte, coletado_em)
            values (%s, %s, %s, %s, 'manual', %s, 'concluido', %s, %s, %s, 'marketing', %s,
                    'EXEMPLO', %s, %s)
            """,
            [(tenant_id, marca_id, segmentos.get(d["segmento"]),
              f"Disparo {d['id']} · {d['data']}", d["mensagem"], f"{d['data']} 18:00-03",
              d["enviados"], crm.get("custoPorMensagem", 0), f"{d['data']} 19:00-03", FONTE, COLETA)
             for d in crm.get("disparos", [])],
        )
        n["sniper_lotes"] = len(crm.get("disparos", []))

        # -- WhatsApp: agregado diário, transferências e regras ----------
        dias_w, transf = [], []
        for d in whats.get("dias", []):
            dias_w.append((tenant_id, marca_id, d["data"], d.get("conversas", 0), d.get("pedidos", 0),
                           d.get("faturamento", 0), d.get("sugestoes", 0), d.get("sugestoesAceitas", 0),
                           d.get("valorAdicionais", 0), d.get("followups", 0),
                           d.get("followupsRespondidos", 0), d.get("pedidosRecuperados", 0),
                           FONTE, COLETA))
            for motivo, qtd in (d.get("transferencias") or {}).items():
                transf.append((tenant_id, marca_id, d["data"], motivo, qtd, FONTE, COLETA))
        cur.executemany(
            """
            insert into alavanca.whatsapp_dia (tenant_id, marca_id, data, conversas, pedidos,
                                               faturamento, sugestoes, sugestoes_aceitas, valor_adicionais,
                                               followups, followups_respondidos, pedidos_recuperados,
                                               origem, fonte, coletado_em)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
            on conflict (tenant_id, marca_id, data) do update
              set conversas = excluded.conversas, pedidos = excluded.pedidos,
                  faturamento = excluded.faturamento, sugestoes = excluded.sugestoes,
                  sugestoes_aceitas = excluded.sugestoes_aceitas,
                  valor_adicionais = excluded.valor_adicionais, followups = excluded.followups,
                  followups_respondidos = excluded.followups_respondidos,
                  pedidos_recuperados = excluded.pedidos_recuperados
            """, dias_w)
        n["whatsapp_dia"] = len(dias_w)
        if transf:
            cur.executemany(
                """
                insert into alavanca.whatsapp_transferencia_dia (tenant_id, marca_id, data, motivo,
                                                                 quantidade, origem, fonte, coletado_em)
                values (%s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
                on conflict (tenant_id, marca_id, data, motivo) do update
                  set quantidade = excluded.quantidade
                """, transf)
        n["whatsapp_transferencia_dia"] = len(transf)

        cur.execute("delete from alavanca.whatsapp_regras where tenant_id = %s and origem = 'EXEMPLO'",
                    (tenant_id,))
        cur.executemany(
            """
            insert into alavanca.whatsapp_regras (tenant_id, marca_id, ordem, texto, origem, fonte, coletado_em)
            values (%s, %s, %s, %s, 'EXEMPLO', %s, %s)
            """,
            [(tenant_id, marca_id, i, texto, FONTE, COLETA)
             for i, texto in enumerate(whats.get("regras", []), 1)],
        )
        n["whatsapp_regras"] = len(whats.get("regras", []))

        # -- plano do consultor e catálogo de ações ----------------------
        cur.executemany(
            """
            insert into alavanca.plano_acao (tenant_id, marca_id, codigo, pilar, acao, responsavel,
                                             prazo, situacao, resultado_esperado_mes,
                                             origem, fonte, coletado_em)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'EXEMPLO', %s, %s)
            on conflict (tenant_id, codigo) do update
              set pilar = excluded.pilar, acao = excluded.acao, responsavel = excluded.responsavel,
                  prazo = excluded.prazo, situacao = excluded.situacao,
                  resultado_esperado_mes = excluded.resultado_esperado_mes
            """,
            [(tenant_id, marca_id, a["id"], a["pilar"], a["acao"], a.get("responsavel"),
              a.get("prazo"), a.get("situacao", "a_fazer"), a.get("resultadoEsperadoMes", 0),
              FONTE, COLETA) for a in plano.get("acoes", [])],
        )
        n["plano_acao"] = len(plano.get("acoes", []))

        sugeridas = []
        for gatilho, textos in (plano.get("acoesPorAlerta") or {}).items():
            for ordem, texto in enumerate(textos, 1):
                sugeridas.append((tenant_id, gatilho, ordem, texto, FONTE, COLETA))
        for ordem, texto in enumerate(plano.get("acoesPadrao", []), 1):
            sugeridas.append((tenant_id, "padrao", ordem, texto, FONTE, COLETA))
        cur.executemany(
            """
            insert into alavanca.acao_sugerida (tenant_id, gatilho, ordem, texto, origem, fonte, coletado_em)
            values (%s, %s, %s, %s, 'EXEMPLO', %s, %s)
            on conflict (tenant_id, gatilho, texto) do update set ordem = excluded.ordem
            """, sugeridas)
        n["acao_sugerida"] = len(sugeridas)

        cur.execute(
            """
            insert into alavanca.tenant_config (tenant_id, chave, valor, descricao)
            values (%s, 'crm.custo_por_mensagem', %s::jsonb, 'Custo por mensagem usado na conta de retorno (demonstração).')
            on conflict (tenant_id, chave) do update set valor = excluded.valor
            """, (tenant_id, json.dumps(crm.get("custoPorMensagem", 0))))
        n["tenant_config"] = 1

    return n


def apagar(conn, slug: str) -> bool:
    tenant_id = tenant_id_por_slug(conn, slug)
    if not tenant_id:
        return False
    with tenant(conn, tenant_id) as cur:
        # on delete cascade em todas as tabelas de domínio
        cur.execute("delete from alavanca.tenants where id = %s and origem = 'EXEMPLO'", (tenant_id,))
        return cur.rowcount > 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Cria o tenant de demonstração Pizzaria Exemplo.")
    ap.add_argument("--slug", default=SLUG)
    ap.add_argument("--apagar", action="store_true", help="remove o tenant de demonstração e sai")
    args = ap.parse_args(argv)

    try:
        conn = conectar()
    except SemBanco as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 1

    with conn:
        if args.apagar:
            print("apagado" if apagar(conn, args.slug) else "nada para apagar")
            return 0
        print(f"Semeando o tenant de demonstração '{args.slug}' (tudo com origem=EXEMPLO)")
        for tabela, qtd in semear(conn, args.slug).items():
            print(f"  {tabela:28s} {qtd:>5}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
