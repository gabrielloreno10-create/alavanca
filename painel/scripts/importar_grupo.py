#!/usr/bin/env python3
"""Importa os dados REAIS do grupo (Le Tre Farine e, quando houver o arquivo diário, Jerry's) para a plataforma.

Cada loja vira um canal de venda com taxa e CMV próprios, agrupado na sua operação (marca):
  Le Tre Farine: iFood Pizzaria, iFood Pastas, Site (Cliente Fiel)
  Jerry's:       iFood, Site (Cliente Fiel)   -- só se cases/jerrys/dados-brutos/<ARQ_DIARIO_JERRYS> existir

Lê os arquivos de cases/le-tre-farine/dados-brutos/ (e cases/jerrys/dados-brutos/) e gera, em src/data/clientes/grupo-le-tre/:
  cliente.json   configuração: canais e taxas reais de agosto/2026; metas e imposto ficam null ([PREENCHER])
  metricas.json  vendas por dia e canal (Saipos), CMV do dia estimado pelas fichas técnicas
  lucro.json     fichas técnicas e quantidades vendidas em 90 dias (Saipos)

Regras:
  - Só entram números que estão nos arquivos. O que falta fica null e a tela mostra [PREENCHER].
  - Nenhum nome ou telefone de cliente final entra nos JSON (os arquivos usados não têm dado pessoal).
  - Os blocos sem fonte real (iFood detalhado, anúncios, CRM, WhatsApp, plano) continuam EXEMPLO:
    depois de importar, rode  python3 scripts/gerar_exemplo.py --sobre-reais grupo-le-tre

Rodar: python3 scripts/importar_letre.py
"""
import csv, json, os, re
from collections import defaultdict

AQUI = os.path.dirname(os.path.abspath(__file__))
BRUTOS = os.path.join(AQUI, "..", "..", "cases", "le-tre-farine", "dados-brutos")
BRUTOS_JERRYS = os.path.join(AQUI, "..", "..", "cases", "jerrys", "dados-brutos")
SLUG = "grupo-le-tre"
SAIDA = os.path.join(AQUI, "..", "src", "data", "clientes", SLUG)
ARQ_DIARIO_JERRYS = "saipos_faturamento_diario_jerrys_2026-05_a_09.csv"

ARQ_DIARIO = "saipos_faturamento_diario_letre_2026-05_a_09.csv"
ARQ_MENSAL = "saipos_faturamento_mensal_2026-05_a_09.csv"
ARQ_CMV = "saipos_cmv_por_produto_90d_2026-07-03_a_10-01.csv"
ARQ_FECHAMENTO = "ifood_clientefiel_fechamento_liquido_2026-08.md"
JANELA_CMV = ("2026-07-03", "2026-10-01")  # período do relatório de CMV por produto


def ler_csv(nome, pasta=BRUTOS):
    with open(os.path.join(pasta, nome), encoding="utf-8") as f:
        return list(csv.DictReader(l for l in f if not l.startswith("#")))


def salvar(nome, obj):
    os.makedirs(SAIDA, exist_ok=True)
    with open(os.path.join(SAIDA, nome), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def brl(txt):
    """'39.324,18' -> 39324.18"""
    return float(txt.replace("*", "").replace(".", "").replace(",", ".").strip())


# ---------- Taxas reais: fechamento líquido de agosto x vendas do Saipos em agosto ----------
def liquido_agosto():
    """Líquido recebido por loja em agosto/2026, da tabela 'Resumo por loja' do fechamento."""
    with open(os.path.join(BRUTOS, ARQ_FECHAMENTO), encoding="utf-8") as f:
        texto = f.read()
    lojas = {
        "PZ": "Le Tre Farine — Pizzaria (iFood)",
        "PA": "Le Tre Farine Pastas (iFood)",
        "LCF": "Le Tre Farine (Cliente Fiel)",
        "JIF": "Jerry's (iFood)",
        "JCF": "Jerry's (Cliente Fiel)",
    }
    out = {}
    for sigla, rotulo in lojas.items():
        linha = next(l for l in texto.splitlines() if l.startswith(f"| {rotulo} |"))
        colunas = [c.strip() for c in linha.strip("|").split("|")]
        out[sigla] = brl(colunas[5])  # coluna "Líquido"
    return out


mensal = ler_csv(ARQ_MENSAL)
vendas_ago = {l["marca"]: float(l["valor_vendas"]) for l in mensal if l["mes"] == "2026-08" and l["canal"] == "todos"}
liq = liquido_agosto()
# Taxa efetiva de cada loja sobre a venda registrada no Saipos: quanto da venda de agosto não chegou na conta
taxa = {m: round((vendas_ago[m] - liq[m]) / vendas_ago[m], 4) for m in liq}

pct = lambda v: f"{v * 100:.1f}".replace(".", ",") + "%"
fmt = lambda iso: f"{iso[8:10]}/{iso[5:7]}"

# ---------- Fichas técnicas e CMV médio por marca ----------
OPERACAO = {"Pizzaria": "Le Tre Farine", "Jerry's": "Jerry's"}
produtos = ler_csv(ARQ_CMV)
cmv_pct = {}
for marca in OPERACAO:
    linhas = [p for p in produtos if p["marca"] == marca]
    cmv_pct[marca] = round(sum(float(p["custo_usado"]) * int(p["qtd_90d"]) for p in linhas) / sum(float(p["receita_90d"]) for p in linhas), 4)


def categoria(p):
    nome = p["produto"].lower()
    if p["marca"] == "Pizzaria":
        return "Pizzas"
    return "Acompanhamentos" if ("fritas" in nome or "nuggets" in nome) else "Burgers"


def base_cliente(base):
    """Texto da origem do custo como o cliente vê: sem anotação interna nem nome de quem estimou."""
    b = base.lower()
    if b.startswith("estimado"):
        return "Ficha cadastrada não corresponde ao prato; custo estimado"
    if b.startswith("sem ficha"):
        return "Sem ficha técnica; custo montado pela receita base"
    if "pesquisa" in b or "estimado" in b:
        return "Custo de insumo estimado por pesquisa de preço"
    return None  # ficha do Saipos: nada a explicar


fichas, qtd = [], {}
for i, p in enumerate(sorted(produtos, key=lambda p: -int(p["qtd_90d"])), 1):
    fid = f"f{i:02d}"
    base = p["base"].strip()
    fichas.append({
        "id": fid,
        "nome": p["produto"].strip(),
        "categoria": categoria(p),
        "operacao": OPERACAO[p["marca"]],
        "preco": float(p["preco_medio"]),
        "custo": float(p["custo_usado"]),
        "estimado": base.upper().startswith("ESTIMADO") or base.lower().startswith("sem ficha") or "estimado" in base.lower(),
        "base": base_cliente(base),
    })
    qtd[fid] = int(p["qtd_90d"])

# ---------- Canais de venda: um por loja ----------
CANAIS = {
    # id: (nome, tipo, operação, sigla no Saipos/fechamento, CMV % usado)
    "letre-ifood-pizzaria": ("iFood Pizzaria", "ifood", "Le Tre Farine", "PZ", cmv_pct["Pizzaria"]),
    "letre-ifood-pastas": ("iFood Pastas", "ifood", "Le Tre Farine", "PA", cmv_pct["Pizzaria"]),
    "letre-site": ("Site", "proprio", "Le Tre Farine", "LCF", cmv_pct["Pizzaria"]),
    "jerrys-ifood": ("iFood", "ifood", "Jerry's", "JIF", cmv_pct["Jerry's"]),
    "jerrys-site": ("Site", "proprio", "Jerry's", "JCF", cmv_pct["Jerry's"]),
}
COLUNAS = {  # colunas de cada canal nos CSVs diários
    "letre-ifood-pizzaria": ("pizzaria_ifood_pedidos", "pizzaria_ifood_valor"),
    "letre-ifood-pastas": ("pastas_ifood_pedidos", "pastas_ifood_valor"),
    "letre-site": ("clientefiel_pedidos", "clientefiel_valor"),
    "jerrys-ifood": ("ifood_pedidos", "ifood_valor"),
    "jerrys-site": ("clientefiel_pedidos", "clientefiel_valor"),
}

diario = {"letre": ler_csv(ARQ_DIARIO)}
tem_jerrys = os.path.exists(os.path.join(BRUTOS_JERRYS, ARQ_DIARIO_JERRYS))
if tem_jerrys:
    diario["jerrys"] = ler_csv(ARQ_DIARIO_JERRYS, BRUTOS_JERRYS)
ativos = [c for c in CANAIS if c.split("-")[0] in diario]

por_data = defaultdict(dict)
for prefixo, linhas in diario.items():
    for l in linhas:
        for c in ativos:
            if not c.startswith(prefixo + "-"):
                continue
            col_ped, col_val = COLUNAS[c]
            fat = float(l[col_val])
            por_data[l["data"]][c] = {"faturamento": round(fat, 2), "pedidos": int(l[col_ped]), "cmv": round(fat * CANAIS[c][4], 2)}

datas = sorted(por_data)
assert all(set(por_data[d]) == set(ativos) for d in datas), "Algum dia está faltando em um dos arquivos diários"
dias = [{"data": d, "canais": por_data[d], "cmv": round(sum(v["cmv"] for v in por_data[d].values()), 2)} for d in datas]

# Conferência: a soma diária de cada loja tem que bater com o total mensal do Saipos
for c in ativos:
    sigla = CANAIS[c][3]
    por_mes = defaultdict(float)
    for d in dias:
        por_mes[d["data"][:7]] += d["canais"][c]["faturamento"]
    for mes, total in sorted(por_mes.items()):
        esperado = next(float(l["valor_vendas"]) for l in mensal if l["mes"] == mes and l["canal"] == "todos" and l["marca"] == sigla)
        assert abs(total - esperado) < 1, f"{c} {mes}: diário {total:.2f} x mensal {esperado:.2f}"
print(f"Conferido com o mensal do Saipos: {', '.join(ativos)}")

inicio, fim = dias[0]["data"], dias[-1]["data"]
operacoes = sorted({CANAIS[c][2] for c in ativos}, key=lambda o: o != "Le Tre Farine")
nota_cmv = f"CMV estimado pela média das fichas técnicas de 90 dias (Le Tre {pct(cmv_pct['Pizzaria'])}"
nota_cmv += (", Jerry's " + pct(cmv_pct["Jerry's"]) + ")") if tem_jerrys else ")"
nota_cmv += "; a Pastas não tem ficha e usa a média das pizzas"

salvar("cliente.json", {
    "origem": "REAL",
    "slug": SLUG,
    "nome": " e ".join(operacoes) if len(operacoes) > 1 else operacoes[0],
    "segmento": "Delivery multimarca: " + ", ".join(operacoes),
    "fonte": f"Vendas reais do Saipos de {fmt(inicio)} a {fmt(fim)}/{fim[:4]}, loja por loja.",
    "metaPorDiaSemana": None,
    "impostoPct": 0,
    "canais": {c: {"nome": CANAIS[c][0], "tipo": CANAIS[c][1], "operacao": CANAIS[c][2], "taxaPct": taxa[CANAIS[c][3]], "custoPorPedido": 0} for c in ativos},
    "notaMargem": (
        f"Margem estimada: {nota_cmv}. Taxa de cada loja pelo fechamento de agosto (o que não chegou na conta). "
        "Ainda sem imposto e sem custo de entrega: [PREENCHER]."
    ),
    "limites": {"metaMinimaPct": 0.8, "margemMinimaPct": 0.35, "quedaPedidosPct": 0.2, "ifoodMaximoPct": 0.6, "quedaTicketPct": 0.1},
})
salvar("metricas.json", {"origem": "REAL", "cmvEstimado": True, "dias": dias})
salvar("lucro.json", {
    "origem": "REAL",
    "metaCmvPct": None,
    "metaMargemPct": None,
    "metaFaturamentoMes": None,
    "fichas": [f for f in fichas if f["operacao"] in operacoes],
    "vendasPratosDia": [],
    "vendasPratos": {"inicio": JANELA_CMV[0], "fim": JANELA_CMV[1], "qtd": {f["id"]: qtd[f["id"]] for f in fichas if f["operacao"] in operacoes}},
})

print(f"{len(dias)} dias ({inicio} a {fim}) · operações: {', '.join(operacoes)} · "
      + " · ".join(f"{c} taxa {pct(taxa[CANAIS[c][3]])}" for c in ativos))
