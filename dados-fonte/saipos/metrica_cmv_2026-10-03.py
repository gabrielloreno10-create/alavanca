"""Métrica de CMV de todos os produtos (03/10/2026).

Custos: ingredientes do Saipos já corrigidos com nota fiscal / preço do Hélio
(valor real, sem o arredondamento de 2 casas do Saipos). Receitas: fichas do
Saipos (pizzas e burgers lidos em 03/10), cardápio do chatbot do Jerry's
(bots_prompts/jerrys/prompt_conversao_upsell_NOVO.txt) e respostas do Hélio.
Vendas: Saipos › Itens vendidos 03/07–01/10 (somando a versão "Diversos -" do iFood).
Coluna 'base' diz de onde veio cada receita; 'estimado' = gramagem não confirmada.
"""
import csv, os

C = {  # custo real por g / ml / un
 "massa": 0.0072, "molho": 0.014, "mucarela": 0.032, "bufala": 0.054, "gorgonzola": 0.062,
 "parmesao": 0.046, "parma": 0.1674, "cream": 0.042, "meltruf": 0.056, "pepperoni": 0.0899,
 "calabresa": 0.017, "cebola_roxa": 0.005, "azeitona": 0.058, "aliche": 0.406, "carne_seca": 0.05,
 "frango_desf": 0.02, "lombinho": 0.04, "fonduta": 0.04, "mix_cog": 0.08, "azeite_truf": 0.174,
 "linguica_cost": 0.045, "nutella": 0.068, "doce_leite": 0.021, "alho": 0.03, "azeite": 0.025,
 "caixa25": 2.59, "caixa35": 2.95,
 "pao": 2.43, "smash80": 2.48, "alto180": 5.57, "cheddar": 0.043, "prato": 0.035, "bacon": 0.032,
 "picles": 0.052, "maionese": 0.011, "ketchup": 0.012, "mostarda": 0.0045, "america": 0.02,
 "cebola_carm_truf": 0.03, "embal_burger": 0.50, "papel": 0.27, "batata": 0.014, "oleo_fritura_porcao": 0.30,
 "embal_fritura": 0.30, "chicken": 0.0234, "nuggets6": 5.00, "refri": 3.39,
}
def custo(rec): return round(sum(C[k]*q for k, q in rec.items()), 2)

PIZZA_BASE_P = {"massa": 250, "molho": 30, "caixa25": 1}
PIZZA_BASE_G = {"massa": 370, "molho": 60, "caixa35": 1}
def pz(p, g): return ({**PIZZA_BASE_P, **p}, {**PIZZA_BASE_G, **g})

PIZZAS = {  # quantidades das fichas do Saipos (03/10) + caixa
 "Pizza 5 Queijos ao Mel Trufado e Parma": pz({"mucarela":80,"gorgonzola":5,"parmesao":5,"bufala":10,"parma":40,"cream":25,"meltruf":30},{"mucarela":200,"gorgonzola":10,"parmesao":10,"bufala":15,"parma":50,"cream":40,"meltruf":70}),
 "Pizza Parma e Cogumelos": pz({"fonduta":50,"mix_cog":30,"parma":40},{"fonduta":100,"mix_cog":60,"parma":50}),
 "Pizza Marguerita": pz({"mucarela":20,"bufala":20,"parmesao":5},{"mucarela":40,"bufala":40,"parmesao":10}),
 "Pizza Pepperoni": pz({"mucarela":80,"pepperoni":30},{"mucarela":200,"pepperoni":78}),
 "Pizza 5 Queijos com Mel Trufado e Pepperoni": pz({"mucarela":80,"gorgonzola":5,"bufala":20,"cream":25,"meltruf":35,"pepperoni":30},{"mucarela":200,"gorgonzola":10,"bufala":15,"cream":40,"meltruf":70,"pepperoni":78}),
 "Pizza Cinco Queijos ao Mel Trufado": pz({"mucarela":80,"bufala":20,"cream":25,"meltruf":35},{"mucarela":200,"gorgonzola":10,"parmesao":10,"bufala":15,"cream":40,"meltruf":70}),
 "Pizza Calabresa com Mel Trufado e Gorgonzola": pz({"mucarela":80,"calabresa":45,"gorgonzola":10,"meltruf":30,"cebola_roxa":10},{"mucarela":200,"calabresa":90,"gorgonzola":20,"meltruf":60,"cebola_roxa":20}),
 "Pizza Frango com Cream Cheese": pz({"mucarela":80,"cream":25,"frango_desf":80},{"mucarela":200,"cream":40,"frango_desf":140}),
 "Pizza A Moda Le Tre": pz({"mucarela":80,"cebola_roxa":20,"calabresa":45,"azeitona":10},{"mucarela":200,"cebola_roxa":10,"calabresa":90,"azeitona":10}),
 "Pizza Carne Seca": pz({"mucarela":80,"carne_seca":100,"cream":40,"cebola_roxa":10},{"mucarela":200,"carne_seca":200,"cream":80,"cebola_roxa":20}),
 "Pizza Parma e Rúcula": pz({"mucarela":80,"parma":40},{"mucarela":200,"parma":50}),
 "Pizza Lombinho Canadense": pz({"mucarela":80,"lombinho":75,"cream":25},{"mucarela":200,"lombinho":150,"cream":40}),
 "Pizza Cogumelos Formaggi Trufado": pz({"fonduta":50,"mix_cog":30,"azeite_truf":5},{"fonduta":100,"mix_cog":60,"azeite_truf":10}),
}
BURG = {
 "Monte seu Burguer (Smash M 2x80g, queijo, molho)": {"pao":1,"smash80":2,"cheddar":28,"maionese":15,"embal_burger":1,"papel":1},
 "Smash Cheese & Bacon": {"pao":1,"smash80":2,"cheddar":28,"prato":28,"bacon":20,"ketchup":10,"mostarda":10,"embal_burger":1,"papel":1},
 "Jerrys Smash Trufado": {"pao":1,"smash80":2,"cheddar":14,"prato":14,"cebola_carm_truf":30,"america":20,"azeite_truf":3,"embal_burger":1,"papel":1},
 "Classic Smash": {"pao":1,"smash80":2,"cheddar":28,"cebola_roxa":15,"picles":15,"ketchup":10,"mostarda":10,"embal_burger":1,"papel":1},
 "Tibauulf Trufado": {"pao":1,"smash80":2,"cheddar":14,"prato":14,"cebola_carm_truf":30,"picles":15,"bacon":20,"america":20,"embal_burger":1,"papel":1},
 "Jerrys Jr.": {"pao":1,"smash80":1,"cheddar":14,"embal_burger":1,"papel":1},
 "Chicken Burger": {"pao":1,"chicken":150,"embal_burger":1,"papel":1},
 "Porção de Fritas 300g": {"batata":300,"oleo_fritura_porcao":1,"embal_fritura":1},
 "Nuggets Crocantes 6 un": {"nuggets6":1,"embal_fritura":1},
 "Nuggets Crocantes 12 un": {"nuggets6":2,"embal_fritura":1},
}
# vendas 90d (03/07–01/10, Saipos, cardápio próprio + "Diversos -" do iFood): (qtd, receita)
V = {
 "Pizza 5 Queijos ao Mel Trufado e Parma": (389,41670.30), "Pizza Parma e Cogumelos": (123,11625.70),
 "Pizza Marguerita": (87,7380.10), "Pizza Pepperoni": (74+65,6160.10+4656.10), "Pizza 5 Queijos com Mel Trufado e Pepperoni": (71,6468.20),
 "Pizza Cinco Queijos ao Mel Trufado": (76,7387.10), "Pizza Calabresa com Mel Trufado e Gorgonzola": (54,5505.20),
 "Pizza Frango com Cream Cheese": (72,6335.30), "Pizza A Moda Le Tre": (68,6321.70), "Pizza Carne Seca": (25,2235.40),
 "Pizza Parma e Rúcula": (72,6548.70), "Pizza Lombinho Canadense": (43,3879.90), "Pizza Cogumelos Formaggi Trufado": (24,2290.30),
 "Monte seu Burguer (Smash M 2x80g, queijo, molho)": (350,23184.00), "Smash Cheese & Bacon": (216,13833.00),
 "Jerrys Smash Trufado": (182,12837.00), "Classic Smash": (183,10641.00), "Tibauulf Trufado": (120,9033.60),
 "Jerrys Jr.": (89,3769.90), "Chicken Burger": (102,5115.40), "Porção de Fritas 300g": (266,6597.39),
 "Nuggets Crocantes 6 un": (31,700.00), "Nuggets Crocantes 12 un": (73,2734.70),
}
BASE = {k:"ficha Saipos 03/10 + caixa" for k in PIZZAS}
for k in ["Pizza Pepperoni","Pizza 5 Queijos com Mel Trufado e Pepperoni"]: BASE[k]="sem ficha; base + pepperoni 5/13 fatias (Hélio)"
BASE["Pizza Calabresa com Mel Trufado e Gorgonzola"]="ESTIMADO (ficha atual é de carne seca)"
for k in BURG: BASE[k]="cardápio do bot + fatias 14/10 g (pesquisa)"
BASE["Porção de Fritas 300g"]="batata NF + óleo estimado R$ 0,30/porção"
BASE["Chicken Burger"]="ficha Saipos (150 g frango)"

rows=[]
for nome,(p,g) in PIZZAS.items():
    q,rec=V.get(nome,(0,0)); preco=rec/q if q else 0
    cp,cg=custo(p),custo(g); cmed=cg if preco>=85 else cp   # ticket médio >= R$85 ≈ mix majoritário de G
    rows.append([nome,"Pizzaria",cp,cg,q,round(rec,2),round(preco,2),round(cmed,2),round(100*cmed/preco,1) if preco else "",round(preco-cmed,2),BASE[nome]])
for nome,r in BURG.items():
    q,rec=V.get(nome,(0,0)); preco=rec/q if q else 0; c=custo(r)
    rows.append([nome,"Jerry's",c,"",q,round(rec,2),round(preco,2),c,round(100*c/preco,1) if preco else "",round(preco-c,2),BASE[nome]])
out=os.path.expanduser("~/marco-zero/saipos/metrica_cmv_2026-10-03.csv")
with open(out,"w",newline="") as f:
    w=csv.writer(f); w.writerow(["produto","marca","custo_P_ou_unico","custo_G","qtd_90d","receita_90d","preco_medio","custo_usado","cmv_%","margem_R$","base"]); w.writerows(rows)
tq=sum(r[4] for r in rows); tr=sum(r[5] for r in rows); tc=sum(r[4]*r[7] for r in rows)
print(f"{'produto':46} {'P/un':>6} {'G':>6} {'qtd':>4} {'preço':>7} {'CMV%':>5} {'margem':>7}")
for r in sorted(rows,key=lambda r:-r[5]):
    print(f"{r[0][:46]:46} {r[2]:6.2f} {str(r[3]):>6} {r[4]:4d} {r[6]:7.2f} {r[8]:5} {r[9]:7.2f}")
print(f"\nTOTAL medido: {tq} un · receita R$ {tr:,.2f} · custo R$ {tc:,.2f} · CMV ponderado {100*tc/tr:.1f}%")
print("csv:",out)
