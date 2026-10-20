#!/usr/bin/env python3
"""Gera JSON de EXEMPLO (dados fictícios, só para desenhar e demonstrar as telas).

Dois usos:
  python3 scripts/gerar_exemplo.py
      cliente de demonstração "Pizzaria Exemplo" (src/data/clientes/pizzaria-exemplo/), tudo EXEMPLO.
  python3 scripts/gerar_exemplo.py --sobre-reais le-tre-farine
      completa um cliente que já tem dados reais: lê o metricas.json REAL dele e gera só os
      blocos que ainda não têm fonte (iFood detalhado, anúncios, CRM, WhatsApp, plano), com as
      mesmas datas. Não toca em cliente.json, metricas.json nem lucro.json.
"""
import json, os, random, sys
from datetime import date, timedelta

random.seed(7)
RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "data", "clientes")
ORIGEM = "EXEMPLO"
SOBRE_REAIS = sys.argv[1:2] == ["--sobre-reais"]
SLUG = sys.argv[2] if SOBRE_REAIS else "pizzaria-exemplo"
NOME = "Pizzaria Exemplo"
D = os.path.join(RAIZ, SLUG)
os.makedirs(D, exist_ok=True)
BASE = {0: 2300, 1: 2400, 2: 2700, 3: 3300, 4: 6300, 5: 7300, 6: 6500}  # seg..dom

def salvar(nome, obj):
    if SOBRE_REAIS and nome in ("cliente.json", "metricas.json", "lucro.json"):
        return
    with open(os.path.join(D, nome), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")

if SOBRE_REAIS:
    with open(os.path.join(D, "metricas.json"), encoding="utf-8") as f:
        reais = json.load(f)
    assert reais["origem"] == "REAL", "--sobre-reais exige metricas.json com origem REAL"
    with open(os.path.join(D, "cliente.json"), encoding="utf-8") as f:
        tipos = {c: cfg.get("tipo", c) for c, cfg in json.load(f)["canais"].items()}
    # Os exemplos derivam dos totais por tipo de canal (iFood, próprio, salão), somando as lojas
    for d in reais["dias"]:
        soma = {t: {"faturamento": 0, "pedidos": 0} for t in ("ifood", "proprio", "salao")}
        for c, v in d["canais"].items():
            soma[tipos[c]]["faturamento"] += v["faturamento"]
            soma[tipos[c]]["pedidos"] += v["pedidos"]
        d["canais"] = soma
    FIM = date.fromisoformat(reais["dias"][-1]["data"])
else:
    FIM = date(2026, 10, 7)

# Datas fixas dos exemplos (disparos, conversas, prazos) foram escritas para terminar em 07/10; desloca junto com o FIM
DESLOC = FIM - date(2026, 10, 7)
def dt(iso):
    if "T" in iso:
        d, h = iso.split("T")
        return f"{(date.fromisoformat(d) + DESLOC).isoformat()}T{h}"
    return (date.fromisoformat(iso) + DESLOC).isoformat()

salvar("cliente.json", {
    "origem": ORIGEM,
    "slug": SLUG,
    "nome": NOME,
    "segmento": "Pizzaria com delivery e salão",
    "metaPorDiaSemana": {"seg": 2500, "ter": 2500, "qua": 2800, "qui": 3400, "sex": 6500, "sab": 7500, "dom": 6500},
    "impostoPct": 0.06,
    "canais": {
        "ifood": {"nome": "iFood", "taxaPct": 0.262, "custoPorPedido": 3},
        "proprio": {"nome": "Próprio", "taxaPct": 0.03, "custoPorPedido": 8},
        "salao": {"nome": "Salão", "taxaPct": 0.025, "custoPorPedido": 0},
    },
    "limites": {"metaMinimaPct": 0.8, "margemMinimaPct": 0.35, "quedaPedidosPct": 0.2, "ifoodMaximoPct": 0.6, "quedaTicketPct": 0.1},
})

dias = [] if not SOBRE_REAIS else reais["dias"]
for i in (range(59, -1, -1) if not SOBRE_REAIS else []):
    d = FIM - timedelta(days=i)
    fat = BASE[d.weekday()] * random.uniform(0.85, 1.15)
    if d == FIM:
        fat = BASE[d.weekday()] * 0.82
    mix_if = random.uniform(0.52, 0.66)
    mix_pr = random.uniform(0.16, 0.24)
    ifood, proprio = fat * mix_if, fat * mix_pr
    salao = fat - ifood - proprio
    pedidos = lambda v, t: max(1, round(v / t))
    dias.append({
        "data": d.isoformat(),
        "canais": {
            "ifood": {"faturamento": round(ifood, 2), "pedidos": pedidos(ifood, random.uniform(84, 96))},
            "proprio": {"faturamento": round(proprio, 2), "pedidos": pedidos(proprio, random.uniform(92, 104))},
            "salao": {"faturamento": round(salao, 2), "pedidos": pedidos(salao, random.uniform(70, 85))},
        },
        "cmv": round(fat * random.uniform(0.28, 0.32), 2),
    })
    tot_ped = sum(c["pedidos"] for c in dias[-1]["canais"].values())
    dias[-1]["producao"] = {"pizzas": round(tot_ped * random.uniform(1.25, 1.45)), "perdas": random.choice([0, 1, 1, 2, 2, 3, 4])}
salvar("metricas.json", {"origem": ORIGEM, "dias": dias})

# ---------- Pilar 1: iFood ----------
PRATOS = [
    ("p01", "Pizza 5 Queijos com Parma", 109.9, 29.5, 18), ("p02", "Pizza Margherita", 79.9, 12.4, 14),
    ("p03", "Pizza Calabresa", 74.9, 14.8, 12), ("p04", "Pizza Frango com Catupiry", 84.9, 21.9, 11),
    ("p05", "Pizza Parma e Cogumelos", 99.9, 24.1, 8), ("p06", "Pizza Pepperoni", 89.9, 19.7, 9),
    ("p07", "Combo 2 Pizzas 25cm", 99.9, 38.6, 10), ("p08", "Pizza Portuguesa", 79.9, 26.3, 6),
    ("p09", "Pizza Quatro Queijos", 84.9, 27.9, 5), ("p10", "Pizza de Nutella", 59.9, 16.2, 4),
    ("p11", "Refrigerante 2L", 16.9, 7.9, 9), ("p12", "Pizza Vegana", 89.9, 23.5, 2),
]
PROMOS = [
    ("pr1", "30% off na 5 Queijos com Parma", "Desconto em item", "Restaurante"),
    ("pr2", "Cupom R$ 15 primeira compra", "Cupom", "Restaurante"),
    ("pr3", "Frete grátis acima de R$ 80", "Frete", "Restaurante"),
    ("pr4", "Combo 2 pizzas 25cm", "Combo", "Restaurante"),
]
FAIXAS = [("11–14h", 0.06), ("14–18h", 0.07), ("18–20h", 0.27), ("20–22h", 0.43), ("22–24h", 0.17)]
vendas_pratos, promos_dia, funil, faixas, operacao = [], [], [], [], []
for d in dias:
    ped = d["canais"]["ifood"]["pedidos"]
    fat = d["canais"]["ifood"]["faturamento"]
    n_dia = len(promos_dia)
    itens = round(ped * 1.4)
    pesos = [p[4] * random.uniform(0.7, 1.3) for p in PRATOS]
    tot = sum(pesos)
    q = [int(itens * w / tot) for w in pesos]
    q[0] += itens - sum(q)
    vendas_pratos.append({"data": d["data"], "qtd": {p[0]: n for p, n in zip(PRATOS, q)}})
    ticket = fat / ped if ped else 0
    pr = {}
    rampa = 1 + max(0, n_dia - (len(dias) - 60)) / 40  # promoções crescendo nos últimos 60 dias
    for pid, base_ped, custo_ped in (("pr1", 0.08, 33.0), ("pr2", 0.06, 15.0), ("pr3", 0.10, 7.9), ("pr4", 0.07, 18.0)):
        n = max(0, round(ped * base_ped * rampa * random.uniform(0.6, 1.4)))
        pr[pid] = {"pedidos": n, "faturamento": round(n * ticket * random.uniform(0.9, 1.1), 2), "custo": round(n * custo_ped, 2)}
    promos_dia.append({"data": d["data"], "promocoes": pr})
    sacola = max(ped, round(ped / random.uniform(0.62, 0.72)))
    cardapio = round(sacola / random.uniform(0.30, 0.38))
    visitas = round(cardapio / random.uniform(0.38, 0.46))
    funil.append({"data": d["data"], "visitas": visitas, "cardapio": cardapio, "sacola": sacola, "pedidos": ped})
    fx = [ped * w * random.uniform(0.8, 1.2) for _, w in FAIXAS]
    t = sum(fx)
    fx = [int(ped * v / t) for v in fx] if t else fx
    fx = fx if t else [0] * len(FAIXAS)
    fx[3] += ped - sum(fx)
    faixas.append({"data": d["data"], "faixas": {n: v for (n, _), v in zip(FAIXAS, fx)}})
    operacao.append({"data": d["data"], "nota": round(min(5, 4.62 + 0.004 * len(operacao) + random.uniform(-0.03, 0.03)), 2),
                     "tempoEntregaMin": round(random.uniform(36, 48)), "cancelados": random.choice([0, 0, 0, 1, 1, 2])})
salvar("ifood.json", {
    "origem": ORIGEM,
    "comissaoPct": 0.23, "taxaPagamentoPct": 0.032, "embalagemPorItem": 2.5,
    "pratos": [{"id": p[0], "nome": p[1], "precoIfood": p[2], "cmvUnitario": p[3]} for p in PRATOS],
    "promocoes": [{"id": p[0], "nome": p[1], "tipo": p[2], "quemBanca": p[3]} for p in PROMOS],
    "vendasPratosDia": vendas_pratos, "promocoesDia": promos_dia, "funilDia": funil,
    "pedidosPorFaixaDia": faixas, "operacaoDia": operacao,
})

# ---------- Pilar 2: canal próprio e tráfego ----------
CAMPANHAS = [
    ("c1", "Le Tre · Jantar sex–dom", "ativa", "Vendas no site", 120),
    ("c2", "Le Tre · Remarketing quente", "ativa", "Vendas no site", 60),
    ("c3", "Le Tre · Terça em dobro", "em_analise", "Vendas no site", 40),
    ("c4", "Le Tre · Bairros novos", "pausada", "Vendas no site", 50),
]
CRIATIVOS = [
    ("k1", "Vídeo · Forno a lenha", "c1", "Vídeo", 1.0, 1.25), ("k2", "Vídeo · 5 Queijos derretendo", "c1", "Vídeo", 1.2, 1.4),
    ("k3", "Foto · Margherita", "c1", "Imagem", 0.6, 0.7), ("k4", "Carrossel · Cardápio", "c2", "Carrossel", 0.7, 1.1),
    ("k5", "Vídeo · Depoimento cliente", "c2", "Vídeo", 0.5, 0.9), ("k6", "Foto · Bairros", "c4", "Imagem", 0.5, 0.35),
]
anuncios = []
for d in dias:
    dia_sem = date.fromisoformat(d["data"]).weekday()
    ativo_fds = dia_sem >= 4
    pr_ped = d["canais"]["proprio"]["pedidos"]
    pr_tk = d["canais"]["proprio"]["faturamento"] / pr_ped if pr_ped else 0
    cr = {}
    restante = int(pr_ped * 0.6)
    for kid, _, cid, _, peso_inv, eficiencia in CRIATIVOS:
        if cid == "c4" and d["data"] >= dt("2026-09-20"):
            continue
        inv = round(peso_inv * (42 if ativo_fds else 14) * random.uniform(0.8, 1.2), 2)
        imp = round(inv * random.uniform(55, 75))
        cli = round(imp * random.uniform(0.012, 0.022))
        ped = min(restante, max(0, round(inv / 28 * eficiencia * random.uniform(0.6, 1.4))))
        restante -= ped
        cr[kid] = {"investimento": inv, "impressoes": imp, "cliques": cli, "pedidos": ped, "faturamento": round(ped * pr_tk, 2)}
    anuncios.append({"data": d["data"], "criativos": cr})
salvar("canal-proprio.json", {
    "origem": ORIGEM, "metaPctCanalProprio": 0.3,
    "campanhas": [{"id": c[0], "nome": c[1], "status": c[2], "objetivo": c[3], "orcamentoDia": c[4]} for c in CAMPANHAS],
    "criativos": [{"id": k[0], "nome": k[1], "campanhaId": k[2], "formato": k[3]} for k in CRIATIVOS],
    "anunciosDia": anuncios,
    "alcance": {"ontem": {"atual": 2140, "anterior": 2380}, "7d": {"atual": 11850, "anterior": 10920},
                "30d": {"atual": 31400, "anterior": 28750}, "mes": {"atual": 11850, "anterior": 12300}},
})

def por_periodo(gen):
    return {p: gen(p) for p in ("ontem", "7d", "30d", "mes")}
ESC = {"ontem": 1, "7d": 7, "30d": 30, "mes": 7}
SEGMENTOS = [
    ("novos", "Novos", "1º pedido nos últimos 30 dias", 214, 168, 19420, "Mandar boas-vindas com cupom do 2º pedido no site"),
    ("recorrentes", "Recorrentes", "2 ou mais pedidos em 90 dias", 486, 402, 88450, "Avisar lançamentos e o prato da semana"),
    ("vip", "VIP", "5 ou mais pedidos em 90 dias ou acima de R$ 600", 92, 88, 61230, "Convite antecipado e mimo na entrega, sem desconto"),
    ("em-risco", "Em risco", "Sem pedir há 30 a 60 dias", 538, 364, 41210, "Oferta do prato favorito para voltar esta semana"),
    ("sumidos", "Sumidos", "Sem pedir há mais de 60 dias", 1790, 852, 0, "Uma mensagem de reativação por mês, no máximo"),
]
base_total = sum(x[3] for x in SEGMENTOS)
com_opt = sum(x[4] for x in SEGMENTOS)
DISPAROS = [
    ("d1", "2026-08-12", "em-risco", "Saudade da 5 Queijos? Hoje com borda recheada grátis no site", 290, 41, 22, 2310.0),
    ("d2", "2026-08-21", "recorrentes", "Chegou a Parma e Cogumelos: peça pelo site", 380, 57, 31, 3190.0),
    ("d3", "2026-09-02", "novos", "Seu 2º pedido com R$ 10 de desconto no site", 140, 25, 14, 1260.0),
    ("d4", "2026-09-16", "em-risco", "Terça em dobro: 2ª pizza pela metade no site", 330, 39, 19, 1880.0),
    ("d5", "2026-09-26", "vip", "Vocês provam primeiro: pizza nova do mês", 85, 33, 18, 2240.0),
    ("d6", "2026-10-01", "recorrentes", "Fim de semana com forno aceso: peça pelo site", 395, 52, 27, 2780.0),
    ("d7", "2026-10-06", "sumidos", "Faz tempo! Sua próxima pizza com frete grátis no site", 600, 37, 11, 1010.0),
]
salvar("crm.json", {"origem": ORIGEM,
    "custoPorMensagem": 0.35,
    "resumo": {
        "baseTotal": base_total, "comOptIn": com_opt,
        "novosComOptIn": por_periodo(lambda p: {"atual": 6 * ESC[p], "anterior": 5 * ESC[p]}),
        "novosClientes": por_periodo(lambda p: {"atual": 8 * ESC[p], "anterior": 7 * ESC[p]}),
    },
    "segmentos": [{"id": x[0], "nome": x[1], "criterio": x[2], "clientes": x[3], "comOptIn": x[4], "valor90d": x[5], "acao": x[6]} for x in SEGMENTOS],
    "disparos": [{"id": x[0], "data": dt(x[1]), "segmento": x[2], "mensagem": x[3], "enviados": x[4], "respostas": x[5], "pedidos": x[6], "faturamento": x[7]} for x in DISPAROS],
    "proximos": [
        {"data": dt("2026-10-09"), "hora": "18:30", "segmento": "recorrentes", "mensagem": "Sexta de forno aceso: a pizza da semana"},
        {"data": dt("2026-10-13"), "hora": "17:00", "segmento": "em-risco", "mensagem": "Terça em dobro: 2ª pizza pela metade"},
        {"data": dt("2026-10-16"), "hora": "18:00", "segmento": "vip", "mensagem": "Prévia da pizza de outubro"},
        {"data": dt("2026-10-22"), "hora": "17:30", "segmento": "novos", "mensagem": "Seu 2º pedido com R$ 10 de desconto"},
    ],
})
# ---------- Pilar 4: vendedor IA no WhatsApp ----------
MOTIVOS = ["Reclamação de pedido", "Pedido para evento", "Dúvida de alergia", "Pediu para falar com pessoa"]
wa_dias = []
for d in dias:
    pr = d["canais"]["proprio"]
    conversas = round(pr["pedidos"] * random.uniform(1.6, 2.1))
    pedidos = min(pr["pedidos"], round(conversas * random.uniform(0.26, 0.34)))
    sug = round(pedidos * random.uniform(0.85, 1.0))
    aceitas = round(sug * random.uniform(0.28, 0.40))
    fu = round(conversas * random.uniform(0.15, 0.22))
    resp = round(fu * random.uniform(0.35, 0.5))
    rec = round(resp * random.uniform(0.3, 0.5))
    tr = {}
    for _ in range(random.choice([0, 0, 1, 1, 2])):
        m = random.choice(MOTIVOS)
        tr[m] = tr.get(m, 0) + 1
    wa_dias.append({"data": d["data"], "conversas": conversas, "pedidos": pedidos,
        "faturamento": round(pedidos * pr["faturamento"] / pr["pedidos"] * random.uniform(1.0, 1.08), 2) if pr["pedidos"] else 0,
        "sugestoes": sug, "sugestoesAceitas": aceitas, "valorAdicionais": round(aceitas * random.uniform(14, 22), 2),
        "followups": fu, "followupsRespondidos": resp, "pedidosRecuperados": rec, "transferencias": tr})
CONVERSAS = [
    ("c4821", "Cliente 4821", "2026-10-07T20:14", "pedido", [
        ("cliente", "Boa noite! Quero uma pizza grande pra entrega"), ("ia", "Boa noite! Qual sabor? A mais pedida hoje é a 5 Queijos com Parma 🍕"),
        ("cliente", "Pode ser essa"), ("ia", "Ótima escolha. Quer borda recheada de catupiry por R$ 12? Fica bem cremosa com essa pizza."),
        ("cliente", "Quero sim"), ("ia", "Fechado: 5 Queijos com Parma grande + borda de catupiry, R$ 121,90. Confirma o endereço da Rua das Flores, 120?"),
        ("cliente", "Isso"), ("ia", "Pedido confirmado! Chega em 40 a 50 minutos. Obrigado 😊")]),
    ("c3307", "Cliente 3307", "2026-10-07T19:52", "pedido", [
        ("cliente", "Vcs tem pizza sem lactose?"), ("ia", "Temos a Vegana, feita sem nenhum derivado de leite. Quer ver os ingredientes?"),
        ("cliente", "Manda"), ("ia", "Molho de tomate, abobrinha, berinjela, cogumelos, rúcula e azeite. R$ 89,90 a grande."), ("cliente", "Fechou, uma grande"),
        ("ia", "Anotado! Quer um refrigerante 2L junto por R$ 16,90?"), ("cliente", "Não, obrigado"), ("ia", "Sem problema. Pedido confirmado, chega em até 50 minutos.")]),
    ("c9154", "Cliente 9154", "2026-10-07T18:40", "humano", [
        ("cliente", "Meu pedido de ontem veio frio"), ("ia", "Poxa, sinto muito. Vou chamar alguém da equipe para resolver isso com você agora."),
        ("humano", "Oi, aqui é a Ana, da pizzaria. Me passa o número do pedido? Vamos resolver.")]),
    ("c2290", "Cliente 2290", "2026-10-06T21:05", "sem_pedido", [
        ("cliente", "Qual o horário de vocês?"), ("ia", "Hoje até 23h30. Quer adiantar seu pedido? A Margherita sai em 35 minutos."), ("cliente", "Hoje não, valeu")]),
    ("c6612", "Cliente 6612", "2026-10-06T20:31", "pedido", [
        ("cliente", "Quero 2 pizzas médias"), ("ia", "Claro! Temos o Combo 2 Pizzas 25cm por R$ 99,90. Quais sabores?"),
        ("cliente", "Calabresa e frango com catupiry"), ("ia", "Perfeito. Quer adicionar uma Pizza de Nutella pequena por R$ 29,90 para a sobremesa?"), ("cliente", "Bora"),
        ("ia", "Pedido fechado: Combo (Calabresa + Frango com Catupiry) + Nutella pequena, R$ 129,80. Confirmado!")]),
    ("c7740", "Cliente 7740", "2026-10-05T19:12", "recuperado", [
        ("ia", "Oi! Vi que você montou um pedido ontem e não finalizou. Quer que eu deixe pronto pra hoje?"), ("cliente", "Ah verdade, quero sim, a mesma"),
        ("ia", "Feito: Pizza Pepperoni grande, R$ 89,90. Confirmado para entrega às 20h!")]),
]
salvar("whatsapp.json", {"origem": ORIGEM, "dias": wa_dias,
    "conversas": [{"id": c[0], "cliente": c[1], "inicio": dt(c[2]), "desfecho": c[3], "mensagens": [{"autor": a, "texto": t} for a, t in c[4]]} for c in CONVERSAS],
    "regras": [
        "Sempre oferecer borda recheada nas pizzas grandes",
        "Sugerir a pizza de maior margem quando o cliente pede indicação",
        "Oferecer bebida em todo pedido sem bebida",
        "Nunca oferecer desconto que não esteja na campanha ativa",
        "Passar para uma pessoa em reclamação, alergia ou pedido acima de 5 pizzas",
        "Follow-up só para quem conversou nas últimas 24 horas (regra da API oficial)",
    ],
})

# ---------- Pilar 5: lucro (fichas técnicas, cardápio e metas) ----------
FICHAS = [
    ("p01", "Pizza 5 Queijos com Parma", "Pizzas", 99.9, 29.5, 22), ("p02", "Pizza Margherita", "Pizzas", 72.9, 12.4, 17),
    ("p03", "Pizza Calabresa", "Pizzas", 69.9, 14.8, 15), ("p04", "Pizza Frango com Catupiry", "Pizzas", 76.9, 21.9, 13),
    ("p05", "Pizza Parma e Cogumelos", "Pizzas", 92.9, 24.1, 6), ("p06", "Pizza Pepperoni", "Pizzas", 82.9, 19.7, 11),
    ("p07", "Combo 2 Pizzas 25cm", "Combos", 92.9, 38.6, 12), ("p08", "Pizza Portuguesa", "Pizzas", 72.9, 26.3, 8),
    ("p09", "Pizza Quatro Queijos", "Pizzas", 78.9, 27.9, 4), ("p10", "Pizza de Nutella", "Doces", 54.9, 16.2, 5),
    ("p11", "Refrigerante 2L", "Bebidas", 15.9, 7.9, 12), ("p12", "Pizza Vegana", "Pizzas", 82.9, 23.5, 2),
    ("p13", "Borda recheada", "Adicionais", 12.0, 3.1, 9), ("p14", "Cerveja long neck", "Bebidas", 14.9, 6.2, 7),
]
vendas_ficha = []
for d in dias:
    ped = sum(c["pedidos"] for c in d["canais"].values())
    itens = round(ped * 1.6)
    pesos = [f[5] * random.uniform(0.7, 1.3) for f in FICHAS]
    tot = sum(pesos)
    q = [int(itens * w / tot) for w in pesos]
    q[0] += itens - sum(q)
    vendas_ficha.append({"data": d["data"], "qtd": {f[0]: n for f, n in zip(FICHAS, q)}})
salvar("lucro.json", {"origem": ORIGEM,
    "metaCmvPct": 0.3, "metaMargemPct": 0.4, "metaFaturamentoMes": 135000,
    "fichas": [{"id": f[0], "nome": f[1], "categoria": f[2], "preco": f[3], "custo": f[4]} for f in FICHAS],
    "vendasPratosDia": vendas_ficha,
})

ACOES = [
    ("a01", "ifood", "Tirar o 30% off da 5 Queijos e passar o desconto para a Margherita (CMV menor)", "Consultor", "2026-10-10", "fazendo", 1800),
    ("a02", "ifood", "Refazer foto e descrição dos 5 pratos que mais vendem", "Gerente", "2026-10-15", "a_fazer", 900),
    ("a03", "canal-proprio", "Pausar o criativo de pior custo por pedido e dobrar o melhor", "Consultor", "2026-10-09", "feito", 600),
    ("a04", "canal-proprio", "Folheto com QR do site em toda sacola do iFood", "Dono", "2026-10-12", "a_fazer", 1500),
    ("a05", "crm", "Disparo semanal para o segmento Em risco (só opt-in)", "Consultor", "2026-10-13", "fazendo", 1200),
    ("a06", "crm", "Pedir opt-in no balcão e no site em todo pedido", "Gerente", "2026-10-11", "feito", 0),
    ("a07", "whatsapp", "Ativar regra de borda recheada nas pizzas grandes", "Consultor", "2026-10-08", "feito", 700),
    ("a08", "lucro", "Atualizar ficha técnica com a nota fiscal do queijo de outubro", "Dono", "2026-10-14", "a_fazer", 400),
    ("a09", "lucro", "Subir R$ 3 na Portuguesa (CMV acima de 35%)", "Dono", "2026-10-16", "a_fazer", 350),
    ("a10", "metricas", "Equipe dar baixa de todo pedido no PDV no fechamento", "Gerente", "2026-10-09", "fazendo", 0),
]
salvar("plano.json", {"origem": ORIGEM,
    "acoesPorAlerta": {
        "meta": ["Ligar o anúncio do jantar às 18h para recuperar o dia", "Disparar a oferta do dia para quem tem opt-in e não pede há 30 dias"],
        "margem": ["Revisar a promoção do iFood que mais vendeu ontem", "Conferir o preço do queijo na última nota fiscal"],
        "pedidos": ["Conferir se a loja ficou pausada no iFood ontem", "Mandar mensagem para quem pediu no mesmo dia da semana passada"],
        "ifood": ["Mandar cupom do site para quem pediu no iFood esta semana", "Colocar o QR do site no folheto da sacola do iFood"],
        "ticket": ["Oferecer borda recheada em toda pizza grande hoje", "Destacar o combo de maior margem no topo do cardápio"],
    },
    "acoesPadrao": ["Destacar no iFood a pizza de maior margem", "Postar story do prato do dia com link do site", "Conferir se os pedidos de ontem foram baixados no PDV"],
    "acoes": [{"id": a[0], "pilar": a[1], "acao": a[2], "responsavel": a[3], "prazo": dt(a[4]), "situacao": a[5], "resultadoEsperadoMes": a[6]} for a in ACOES],
})
print("ok", len(dias), "dias")
