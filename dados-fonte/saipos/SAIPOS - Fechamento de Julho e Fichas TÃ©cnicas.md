# Saipos — Fechamento de Julho/2026 e Fichas Técnicas do Jerry's
**Última atualização: 08/08/2026 (rodada 3 — 100% dos ingredientes usados em fichas técnicas com custo cadastrado)**

Documenta o trabalho feito dentro do Saipos (`conta.saipos.com`) — fechamento mensal de vendas e criação das fichas técnicas (CMV) do Jerry's. Complementa o `RESUMO GERAL - Le Tre Farine & Jerry's.md` (pendência "Acesso ao Saipos" — **concluída**).

---

## 1. Acesso e estrutura da conta

- Login: e-mail do usuário **trocado em 08/08/2026** de `[EMAIL]` para `[EMAIL]` (senha mantida). Login pede 2FA por código de e-mail.
- **Le Tre Farine e Jerry's são a mesma conta/loja no Saipos** (CNPJ 43.903.968/0001-30) — Jerry's não é uma "loja" separada, é uma **marca** (filtro "Marcas" nos relatórios): `Jerry's (iFood)`, `Jerry's (ClienteFiel)`, `Le Tre Farine Pastas (iFood)`, `Le Tre Farine - Pizzaria (iFood)`, `Le Tre Farine (ClienteFiel)`.
- Relatório "Vendas por período" permite multi-selecionar marcas; "Itens vendidos" só permite uma marca por vez (precisa rodar/exportar uma vez por marca e somar).

## 2. Fechamento de julho/2026 (01/07–31/07)

Arquivos desta pasta: `relatorio_julho.html` (artifact visual completo), `saipos_julho2026.md`, `faturamento_diario_julho.json`, `itens_todas.json` / `itens_letre.json` / `itens_jerrys.json`, `areas_entrega.json`.

**Números combinados:** R$ 119.808,07 em 1.094 pedidos (17 cancelados, R$2.053,32).
- **Le Tre Farine:** R$ 79.441,76 · 726 pedidos · 66,3% do faturamento
- **Jerry's:** R$ 40.366,31 · 368 pedidos · 33,7% do faturamento
- Canal: iFood 85% (R$102.117,67) · ClienteFiel 15% (R$17.690,40)

**Achados:**
- **Segunda-feira é ~10x mais fraca** que fim de semana (média R$696 vs R$7.000+/dia) — as 4 segundas de julho somaram só R$2.784,23.
- Item #1 combinado: Pizza 5 Queijos ao Mel Trufado e Parma (151 un., R$16.199,80).
- Bairro #1: **Sion** — R$18.255,72 (15,2% do faturamento total, mais que o dobro do 2º colocado Vila da Serra).
- Descontos somaram R$11.622,08 (9,6% do faturamento) — ClienteFiel/iFood.

⚠️ **Nota de reconciliação:** esses números são o que o Saipos registra como "vendas" (bruto, antes de taxas de canal). O `RESUMO GERAL` tem outra reconciliação (repasse real do iFood vs. planilha de custos) com resultado líquido de julho R$36.823,79 — são fontes diferentes (Saipos = vendas; planilha = repasse líquido após taxas do iFood). Não confundir os dois números de "julho".

## 3. Fichas técnicas (CMV) criadas — Jerry's

Nenhuma existia antes (só as pizzas/massas da Le Tre Farine tinham ficha técnica). Criadas 8, cobrindo ~54% do faturamento de julho do Jerry's:

| Item | Custo/un | Preço venda | Observação |
|---|---|---|---|
| Classic Smash | R$ 8,53 | R$ 52,90 | |
| Smash Cheese & Bacon | R$ 10,13 | R$ 59,90 | |
| Jerrys Smash Trufado | R$ 8,53 | R$ 66,00 | |
| Jerrys Burger | R$ 8,53 | R$ 53,91 | |
| Chicken Burger | R$ 20,93 | R$ 44,00 | frango 150g pesou no custo — vale conferir gramagem real |
| Porção de Fritas (300g) | R$ 30,30 | — | confirmar preço de venda |
| Nuggets Crocantes 6un | R$ 5,30 | — | |
| **Tibauulf Trufado** | R$ 12,39 | **R$ 73,90** | produto tinha sido removido do cardápio ativo, recriado em Smashburgers (Jerry's) — usuário confirmou manter R$73,90 mesmo havendo registro de R$69 no Cliente Fiel/campanha Meta Ads |

**Quantidades usadas são estimativas de hamburgueria padrão** (pão 1un, patty 1un, queijo 20-40g, embalagem 1un) — não veio de ficha real do usuário. Ingrediente **linguiça de costela cara preta** teve custo atualizado para R$13,50/300g (R$0,045/g), informado pelo usuário.

**Ficou de fora:**
- **Monte seu Burguer** (R$7.021 em julho, maior item do Jerry's) — é montagem por opções, cada componente precisaria de ficha própria.
- **Jerrys Jr.** (R$1.438 em julho) — ainda não criado. Preço real conhecido pelo Cliente Fiel: **R$37,00** (ver `RESUMO GERAL`, seção 4).
- DRE Gerencial/Financeiro e CMV consolidado do Saipos — dependem de custos fixos cadastrados no sistema (o usuário já tem isso pronto na planilha `Custos_LeTreFarine_LeTreMassas_Jerrys.xlsx`, só não foi replicado dentro do Saipos).

## 4. Ingredientes com custo zerado — auditoria com notas fiscais (08/08/2026)

Cruzei os 31 ingredientes com custo R$0,00 no Saipos contra as planilhas "Notas Fiscais - Jun/Jul/Ago" de `Custos_LeTreFarine_LeTreMassas_Jerrys.xlsx`. A maioria das notas vem com valor agregado (vários itens numa nota só, sem preço por item), então só deu pra confirmar preço real em poucos casos — mas esses já foram corrigidos:

**Corrigidos (dado real da nota fiscal, confirmado pelo usuário):**
- **Cebola roxa** e **Cebola roxa crua**: nota Kakau (2 sacos de 25kg = 50kg por R$160) → **R$3,20/kg**, ambas atualizadas (usadas em Pizza A Moda, Pizza de calabresa, Pizza Costolete)
- **Carne bovina moída** e **Carne moída**: nota "Sion Carnes" 3,108kg a R$42,00/kg → **R$0,04/g**, ambas atualizadas (bolonhesa das massas)
- **Carne seca**: já tinha valor cadastrado, mas errado — **R$0,40/g (R$400/kg)**, 10x acima do real. Nota "Sion Carnes" 4,244kg a R$45,00/kg (usada na Pizza de calabresa, confirmado) → corrigido para **R$0,05/g** (arredondado; Saipos só aceita 2 casas decimais no campo de custo por grama)

**Ainda zerados** (compras sempre vieram misturadas na nota, sem preço por item — precisa nota detalhada ou conferência manual): Carne bovina 90 gramas, Alho, Azeitonas azappas, Cogumelos, Cogumelos salteados, desengordurante, Ervas, Farinha de rosca, Farinha para empanar, Fonduta de parmesão, Fonduta de queijo, Lascas de parmesão, Linguiça calabresa, Massa de pizza, Mel trufado (cadastro duplicado, ver abaixo), Mix de cogumelos salteados, Molho de tomate (cadastro triplicado, ver abaixo), Molho formaggio, Molho formaggio da casa, Molho marinara, Queijo parmesão, Trufa, Óleo para fritura.

⚠️ **Nota de precisão:** o campo "Custo médio" do Saipos só aceita 2 casas decimais para ingredientes em "grama" — não dá pra representar R$0,042/g ou R$0,045/g exatamente, só arredondado (R$0,04 ou R$0,05). Diferença é pequena (centavos por porção), mas fique ciente ao conferir CMV fino.

**Cadastros duplicados encontrados** (provavelmente criados sem querer em momentos diferentes — bagunça o controle de estoque desses itens, vale unificar): "Mel trufado" tem 2 cadastros; "Molho de tomate" tem 3 cadastros.

## 5. Auditoria com fotos reais das notas fiscais (08/08/2026)

Além da planilha (que só tem valor agregado por nota), o usuário tem **fotos das DANFEs reais** em `~/Downloads/PHOTO-2026-*.JPG` (recebidas por WhatsApp) e `IMG_*.PNG`. Essas fotos têm o detalhamento por item — abri ~12 delas (jun/jul) e cruzei com os ingredientes do Saipos.

**Validado — Saipos já está certo, nenhuma ação necessária:**
- Queijo muçarela: nota Atacadão R$31,90/kg → Saipos tem R$0,03/g ✓
- Azeite trufado: nota Espaço Gastronômico R$49,90/250ml (Olitalia trufas brancas) → Saipos tem R$0,20/ml ✓
- Pão brioche: nota De Marchi, Bimbo caixa 72un R$174,45 → R$2,42/un (Saipos tem R$2,43) ✓
- Bacon: nota Lincon/Tropeira 10kg a R$40,93/kg → R$0,04/g (Saipos tem R$0,05/g, bem próximo)

**Corrigido nesta auditoria:**
- **Cogumelos**: nota Alexandre Souza de Faria (09/06) com 4 tipos: Shimeji R$45/kg, Shiitake R$60/kg, Champignon Paris R$45/kg, Portobello R$50/kg → média **R$0,05/g**, atualizado no Saipos

**Discrepância encontrada, não alterada (avaliar):**
- **Álcool** (grupo limpeza): nota Embalapack mostra "Álcool líq. 70% 5L Domus" R$38,00 → R$0,0076/ml, mas o Saipos tem cadastrado R$0,10/ml (13x mais caro). Pode ser um álcool diferente (outro teor/uso) — não mudei sem confirmar.

**Atualização — segunda rodada (mesmo dia), girei as fotos rotacionadas com Python/PIL pra ler direito:**
- **Linguiça calabresa**: achei em 2 notas Seara diferentes — "LINGUIÇA MATA SEARA" R$19,00/kg (NF 2636497) e "LING TIPO CALABRESA 2,5KG" R$18,65/kg (NF 2632525), consistentes entre si → **R$19,00 (unidade=kg)**, atualizado
- **Molho de tomate** (3 cadastros duplicados): achei "Polpa di Pomodoro bag 10kg" R$140,50/10kg = R$0,014/ml → **R$0,01/ml em todos os 3 cadastros**, atualizado. Usado ao todo em 14 pizzas diferentes (Aliche, A Moda, Marinará, Parma e Rúcula, Parma e Cinco Queijos, de calabresa, Cinco Queijos e Mel Trufado, Costolete, Frango e Cream Cheese, Lombinho Canadense, Pepperoni e Cinco Queijos, Margherita, Parma e Cogumelos, Pepperoni) — provavelmente o ingrediente com maior impacto de todos os corrigidos hoje
- **Lombinho canadense**: já tinha valor cadastrado mas errado (R$0,35/g = R$350/kg) — nota Seara "LOMBO CANADENSE S GOURMET" R$41,67/kg → corrigido pra **R$0,04/g**, usado na Pizza Lombinho Canadense

**Achados extras, não corrigidos (fora do escopo dos zerados, mas vale revisar):**
- **Chicken Supreme** (frango): aparece em 3 notas Seara diferentes, sempre ~R$23-27/kg. A ficha técnica do Chicken Burger (Jerry's) usa o ingrediente genérico "Frango" a R$0,12/g (R$120/kg) — quase 5x mais caro que o Chicken Supreme real. Vale criar um ingrediente "Chicken Supreme" específico e trocar na ficha técnica — vai baixar bastante o custo calculado do Chicken Burger.
- **Presunto Cru Ital. Fat. Gourmet**: R$121,53/kg em 3 notas Seara. Pode ser o mesmo produto que "Presunto parma" (cadastrado a R$690/kg no Saipos, 5,7x mais caro) ou pode ser outro corte — nomes diferentes, não tenho certeza suficiente pra unificar sem confirmação.
- **Álcool** (limpeza): nota Embalapack "Álcool líq. 70% 5L Domus" R$7,60/L vs Saipos R$100/L (13x) — já mencionado acima.
- **Orégano**: nota Delly's "Orégano Peruano 250g" R$63,96/kg vs Saipos R$10/kg (6x abaixo do real)
- **Fermento biológico**: nota Delly's R$31,98-34,98/kg vs Saipos R$150/kg (a mais no Saipos)
- **Ketchup**: nota Delly's "Catchup 3,8kg Hemmer" R$3,68/kg vs Saipos R$80/kg (bem a mais no Saipos, mas ketchup é baixo impacto)

**Itens ainda sem nenhum dado encontrado** (vasculhei ~15 fotos de notas fiscais de jun/jul, não apareceram em nenhuma): Alho, Azeitonas azappas, Carne bovina 90 gramas, Cogumelos salteados, desengordurante, Ervas, Farinha de rosca, Farinha para empanar, Fonduta de parmesão, Fonduta de queijo, Lascas de parmesão, Massa de pizza, Mel trufado (2 cadastros duplicados), Mix de cogumelos salteados, Molho formaggio, Molho formaggio da casa, Molho marinara, Queijo parmesão, Trufa, Óleo para fritura. Provavelmente estão em notas de outros fornecedores/meses que não foram fotografadas, ou em compras de mercado sem nota (tipo Sendas/Atacadão) ainda não localizadas.

## 6. Rodada 3 (08/08/2026) — fotos em `~/Desktop/junho` e `~/Desktop/3: sem julho`, planilha Agosto e receitas passadas pelo usuário

O usuário indicou que havia mais fotos de notas fiscais no Mac além da pasta Downloads. Busca ampla (`~/Desktop`, `~/Pictures`, `~/Documents`, iCloud Drive) encontrou duas pastas não vistas antes: `~/Desktop/junho/` (~50 fotos, maio-junho) e `~/Desktop/3: sem julho/` (5 fotos, 17/07). Abri todas. Também usei a aba **"Notas Fiscais - Agosto"** da planilha (que eu não tinha lido antes) e receitas que o usuário passou diretamente no chat.

**Novos dados reais encontrados nas fotos (Frigo Monte, LFP Carnes, Delly's, DPA, DHF, Embalapack, Sendas):**
- **Queijo parmesão**: nota DHF Produtos Alimentícios, "Queijo Parmesão Milk Show" 9,6kg a R$35,99/kg → **R$0,04/g**
- **Queijo azul / Gorgonzola**: nota DPA Distribuidora, "Queijo Azul Paiolzinho" 5,968kg a R$39,90/kg (o Saipos já tinha "Queijo gorgonzola" cadastrado a R$0,09/g — dentro da faixa real, não mexi)
- **Fonduta de parmesão**: sem nota exata, mas achei "Prep. Sabor Cheddar Polenghi" (Delly's) a R$39,98/kg → usei **R$0,04/ml** como estimativa (mesma família de produto)
- **Carne bovina moída / Carne moída**: 3 notas da LFP Carnes e Derivados (02/06, 11/06, 17/06), todas **R$28,95/kg** de forma consistente — mais confiável que o dado usado na rodada anterior (Sion Carnes R$42/kg). Corrigido de R$0,04/g para **R$0,03/g** (também aplicado em "Carne bovina 90 gramas", mesmo ingrediente)
- **Álcool 70%**: nota Embalapack confirma R$39,00/5L = R$0,0078/ml — o "alcool" cadastrado no Saipos (grupo limpeza, R$0,10/ml) não compõe CMV, então não afeta ficha técnica nenhuma; não mexi
- **Linguiça costela cara preta**: nota Delly's "Linguiça Costela Angus Caraprete" R$44,33/kg → confirma a estimativa anterior (R$13,50/pacote 300g ≈ R$45/kg) ✓
- **Lascas de parmesão**: sem nota exata, estimei **R$0,18/un** (~5g por lasca a R$0,036/g)
- **Bacon**: nota Delly's "Bacon Paleta Manta Seara" R$31,49/kg — próximo do R$0,05/g (R$50/kg) já cadastrado
- **Mel trufado**: já era uma ficha técnica (beneficiado) com receita (40ml Mel + 2ml Azeite trufado) mas sem custo médio calculado → **R$0,20/ml**. O outro cadastro "Mel trufado" (unidade, drizzle por pizza) ficou zerado sem nota — estimei **R$5,00/un**
- **Cogumelos salteados** (unidade) e **Mix de cogumelos salteados** (grama): sem nota exata (só a de cogumelos crus, já cadastrada) — estimei R$4,00/un e R$0,08/g respectivamente (cogumelo cru R$0,05/g + gordura de saltear)

**Planilha "Notas Fiscais - Agosto"** confirma que as compras desta semana que o usuário mencionou (carnes, parmesão+gorgonzola) realmente aconteceram, mas só como valor agregado, sem foto/detalhamento por item:
- 04/08: HMF Representação de Alimentos — gorgonzola, presunto espanhol, parmesão — R$829,02 (nota única, 3 itens misturados)
- 07/08: LFP Carnes e Derivados — carne bov. moída costela + acém — R$2.198,95 (mesma fornecedora e mesmo padrão de preço das notas de junho, reforça o R$28,95/kg usado)
- 07/08: Ipiã Distribuidora — alho, ovos, tomate, bebida — R$63,78 (cesta mista, não dá pra isolar preço do alho)
- **Não existe nenhuma foto de nota fiscal datada de agosto/2026 neste Mac** — as fotos param em 17/07. As compras desta semana foram registradas só como texto na planilha, sem o comprovante fotografado (ou o comprovante está só no iPhone, fora do alcance desta sessão).

**Receitas passadas pelo usuário no chat — usadas para estimar/confirmar custos:**
- **Alho**: usado só na Pizza Marinará; sem nota isolada, estimei **R$0,03/g** (~R$30/kg, preço de mercado)
- **Molho marinara**: o usuário esclareceu que é "o molho normal de toda pizza" — ou seja, o mesmo Molho de tomate já cadastrado (R$0,01/ml). Apliquei o mesmo valor no cadastro "Molho marinara" (que, na prática, não é usado em nenhuma ficha técnica hoje — a Pizza Marinará usa "Molho de tomate" + "Alho" diretamente)
- **Molho formaggio / Molho formaggio da casa**: receita = 2 colheres caldo Knorr + 2 colheres manteiga + 1L creme de leite + noz-moscada + 250g parmesão. Sem essas matérias-primas cadastradas individualmente no Saipos, estimei o custo do lote (~R$22,50) dividido pelo rendimento (~1.200ml) → **R$0,02/ml** nos dois cadastros
- **Massa de pizza — achado mais importante da rodada**: esse ingrediente é uma **ficha técnica própria** (beneficiado) usada em **18 pizzas diferentes** (praticamente o cardápio inteiro de pizzas) e estava com custo médio R$0,00 há não sei quanto tempo — ou seja, o CMV de toda pizza do cardápio vinha subestimado pelo custo da massa. A receita já estava cadastrada (10kg farinha, 320g sal, 220g açúcar, 30g fermento, 150ml azeite, 150ml óleo de soja — bateu exatamente com o que o usuário descreveu) e todos os ingredientes dela já tinham custo próprio. Faltava só somar e informar o custo médio final da massa, que o sistema não calcula sozinho (campo "Informado manualmente"). Com a água que o usuário informou depois (5,5L), rendimento real ≈ 16.370g → custo calculado: **R$0,02/g**. Também criei o ingrediente "Água" (R$0,00/ml, não existia) e adicionei na receita para documentação ficar completa.
- **Nuggets e Chicken Burger**: usuário confirmou que vêm industrializados da Seara, sem empanamento feito na casa — por isso "Farinha de rosca" e "Farinha para empanar" seguem zeradas (não são usadas em nenhuma ficha técnica, corretamente)

## 7. Status final de ingredientes (08/08/2026)

**96 ingredientes cadastrados. Todos os que entram em alguma ficha técnica ativa têm custo médio preenchido.** Restam 8 com custo R$0,00, e todos são explicáveis:

| Ingrediente | Por que está zerado |
|---|---|
| desengordurante | Grupo limpeza, "Compõe CMV" desligado — não afeta nenhum custo de produto |
| Água | Criado nesta rodada para a receita da Massa de pizza — água é ~R$0 mesmo |
| Ervas | Não usado em nenhuma ficha técnica hoje |
| Farinha de rosca | Não usado — nuggets/chicken burger são industrializados (Seara) |
| Farinha para empanar | Idem acima |
| Fonduta de queijo | Não usado em nenhuma ficha técnica hoje |
| Trufa | Não usado em nenhuma ficha técnica hoje |
| Óleo para fritura | Não usado em nenhuma ficha técnica hoje (é unidade "UN", não achei conversão confiável) |

Se algum desses 5 "não usados" passar a entrar numa ficha técnica nova, precisa voltar aqui pra dar um valor real.

**Cadastros duplicados que continuam bagunçando o controle de estoque** (mencionado na rodada 2, ainda não resolvido): "Mel trufado" tem 2 cadastros (unidade + ml), "Molho de tomate" tem 3 cadastros. Não uni porque cada um está em uso em fichas técnicas diferentes e mexer arrisca quebrar receita — precisa decisão do usuário sobre qual manter.

## 8. Custos Fixos cadastrados no Saipos + DRE Gerencial (08/08/2026)

Cadastrei os 20 custos fixos da planilha `Custos Fixos Mensais` como lançamentos de despesa no Saipos (`Financeiro > Lançamentos financeiros`), com vencimento em agosto/2026 (a maioria dia 08, Aluguel/Folha Dell dia 05, Energia dia 18 — data real da fatura CEMIG, Caixa de Pizza dia 13 — 1ª parcela). Soma total: **R$32.483,92**, batendo exatamente com o total da planilha. **Atualização 20/08/2026:** pró-labore ajustado para R$15.000/mês (decisão do dono) → fixos passam a **R$42.483,92/mês**. Nos próximos meses lançar o pró-labore direto como 15.000. O "Empréstimo (parcela 4/12)" é o empréstimo da mãe do dono (Rejane Borja); em julho foram pagas 2 parcelas, então agosto é a 5/12 (descrição no Saipos ficou como 4/12). Itens com valor R$0 (Água isenta, iFood e VPS pendentes de valor, Motoboy removido/contabilizado dia a dia, Outros a definir) não geraram lançamento.

| Categoria | Valor | Categoria financeira usada |
|---|---|---|
| Aluguel + condomínio | R$2.876,05 | Aluguel |
| Folha — Dell/Arthur/Simone | R$3.500 / R$2.500 / R$2.075 | Salário dos Funcionários |
| Folha — Luiz (freelancer) | R$1.300 | Mão de obra Não Contratada (Extras) |
| Pró-labore | R$5.000 → **R$15.000 a partir de ago/2026** (lançamento original de 5.000 pago 08/08 + complemento de 10.000 criado em 20/08, venc. 08/08, NÃO pago — Saipos não edita lançamento já pago) | Pró-labore (salário sócios) |
| Energia elétrica (CEMIG, venc. 18/08) | R$2.176,16 | Luz |
| Internet/telefone | R$401,68 | Internet |
| Softwares — Saipos / Cliente Fiel / Claude | R$495,10 / R$340 / R$99 | Outros (não existe categoria própria) |
| Contabilidade | R$675 | Contador |
| Dedetização | R$275 | Outros |
| Manutenção/limpeza fixa | R$1.500 | Manutenção de equipamentos |
| Segurança/alarme | R$342,93 | Segurança |
| Empréstimo (parcela 4/12) | R$3.400 | Empréstimos |
| Consultoria | R$500 | Outros |
| Caixa de Pizza (parcelado 4x, venc. 13/08) | R$3.878 | Embalagem |
| Saco de Delivery | R$900 | Embalagem |
| Papel Acoplado | R$250 | Embalagem |

**Também descobri e corrigi**: o Saipos avisava "26 categorias financeiras não vinculadas ao DRE" — sem isso, nenhum lançamento apareceria no relatório DRE Gerencial, não importa quanto eu cadastrasse. Vinculei todas às seções corretas (Aluguel/Salários/Softwares/etc → Despesas Administrativas; Comissões/Embalagem/Ifood/Motoboy/Fornecedores → Custo com Vendas; Empréstimos/Taxas de cartão → Despesas Financeiras; Pró-labore → Pró-labore; Impostos → Impostos).

⚠️ **Bug encontrado no relatório DRE Gerencial do Saipos — não é erro nos dados, é o cálculo do relatório**: depois de vincular tudo, o "Lucro Operacional" de agosto ficou **maior que a própria Receita Líquida** (R$31.670,77 de lucro sobre R$27.211,16 de receita — impossível). Investigando linha por linha: cada categoria dentro de "Despesas Administrativas" aparece certinha e com valor positivo (Aluguel R$2.876,05, Contador R$675, Salário dos Funcionários R$8.075, etc. — todos batendo com o que cadastrei). O problema é que a **linha-total "(-) DESPESAS ADMINISTRATIVAS"** aparece como **-R$13.428,00**, e o relatório está *subtraindo* esse valor já negativo do lucro — ou seja, dois negativos viram positivo, e a despesa em vez de reduzir o lucro está aumentando. As seções "Custo com Vendas", "Despesas Financeiras" e "Pró-labore" não têm esse problema (subtraem certo). Esse bug já existia antes de eu mexer em qualquer coisa (em junho, antes desta rodada, "Despesas Administrativas" já mostrava -R$121,69 e inflava o lucro de junho em R$121,69 — só não dava pra perceber porque o valor era pequeno). Com os R$13.428 de agosto ficou visível.
**Conclusão prática:** os dados cadastrados (cada lançamento, cada categoria) estão corretos e servem de fonte confiável — é só o "Lucro Operacional" e "Lucro Líquido" finais do DRE Gerencial que não dá pra confiar enquanto esse bug existir. Pra ter o lucro real de um mês, por enquanto é mais seguro somar manualmente: Receita Líquida − CMV − Custo com Vendas − Despesas Administrativas (usando o valor absoluto, ignorando o sinal errado) − Despesas Financeiras − Pró-labore. Vale reportar esse bug pro suporte do Saipos.

**Testei se dava pra contornar o bug e não achei jeito dentro do sistema:**
- O botão de configuração (🔧) do DRE só deixa vincular categoria → seção (o que já foi feito certinho); não tem nenhum controle de "sinal" ou "natureza da conta".
- Existe um segundo tipo de relatório, "DRE Financeiro" (além do "DRE Gerencial") — testei e tem o mesmo bug (também soma Despesas Administrativas em vez de subtrair), além de usar uma base de receita diferente (parece somar só lançamentos manuais de "Receita", não as vendas reais — não serve pra esse propósito de qualquer forma).
- Não existe nenhuma opção de "recalcular fórmula" ou editar a estrutura do DRE nas configurações da loja.
- **Isso é um bug do sistema Saipos, não uma configuração errada que eu tenha feito** — meu único caminho seria abrir chamado no suporte deles. Recomendo o usuário fazer isso diretamente (às vezes esse tipo de contato é mais rápido vindo do dono da conta).

## 9. Agente diário de fechamento (vendas x CMV) — 08/08/2026

Usuário pediu um agente que manda WhatsApp todo dia com fechamento operacional (quanto vendeu, quanto gastou de mercadoria). Como o Saipos não tem API pública, os dados só saem via automação de navegador (não dá pra puxar 100% na nuvem como o vigia de Meta Ads).

**Etapa 1 (feita, provisória):** agendamento local via `CronCreate` (roda nesta máquina, dispara 23:45 todo dia, se auto-renova chamando `CronCreate` de novo a cada disparo). **Limitação: só funciona enquanto esta sessão do Claude Code ficar aberta** — se fechar/reiniciar o Mac, a corrente para sem aviso.

**Etapa 2 (em andamento):** mover para o servidor Easypanel (`http://187.77.24.49:3000/`, login `[EMAIL]`), projeto **letre** (mesmo onde já rodam n8n, n8n-postgres, postgres_geral, waha, waha-jerrys). Plano: serviço Node + Playwright que loga no Saipos uma vez (sessão persistente, precisa de login+código do usuário uma única vez, feito visualmente) e roda todo dia via cron do próprio servidor, sem depender de nenhuma máquina ficar ligada.

**Canal de envio (WhatsApp) — mesmo usado pelo vigia de Meta Ads, já validado e funcionando:**
- Endpoint: `POST https://letre-waha-jerrys.or7iaj.easypanel.host/api/sendText`
- Header: `X-Api-Key: [REMOVIDO]`
- Body: `{"chatId":"56139635028155@lid","text":"<mensagem>","session":"default"}`
- Destino: WhatsApp do dono, [TELEFONE], chatId canônico `56139635028155@lid` (formato `@c.us` com 9º dígito falha — usar sempre o `@lid`)

**Fórmula do fechamento diário (a única confiável, dado o bug do DRE documentado acima):** Vendas do dia (relatório "Vendas por período", campo "Total dos pedidos") vs. CMV do dia (DRE Gerencial → "(-) CUSTO MERCADORIAS VENDIDAS - CMV", com período restrito a hoje). Não usar "Lucro Operacional" do DRE pro fechamento diário — está inflado pelo bug de sinal + pelos lançamentos de custo fixo mensal que caem tudo em cima da data de hoje.

## 10. Próximos passos sugeridos

- [ ] Terminar a etapa 2 do agente diário (serviço no Easypanel) e desligar o CronCreate local (job `c7bd59b4`) pra não duplicar mensagem
- [ ] Reportar ao suporte do Saipos o bug do sinal invertido em "Despesas Administrativas" no DRE Gerencial
- [ ] Criar ficha técnica do **Jerrys Jr.** (preço R$37,00)
- [ ] Fichas técnicas dos componentes do **Monte seu Burguer**
- [ ] Decidir sobre os cadastros duplicados (Mel trufado, Molho de tomate) e unificar
- [ ] Trocar "Frango" genérico (R$0,12/g) por "Chicken Supreme" real (R$0,02-0,03/g) na ficha do Chicken Burger — ainda pendente da rodada 2
- [ ] Repetir o lançamento de custos fixos todo mês (não há recorrência automática no Saipos — precisa recriar os 20 lançamentos manualmente em setembro)
- [ ] Repetir este fechamento mensal (mesma sequência de relatórios) para agosto/2026 em diante

## 11. CMV no Saipos — correção de 20/08/2026

**Diagnóstico.** A linha "(-) CMV" do DRE Gerencial não vem das compras: é o consumo teórico (ficha técnica × itens vendidos) valorizado pelo custo médio do ingrediente **no momento da venda**. Por isso junho = 0 (fichas só existem desde 08/08), julho = 7.416,99 e agosto = 24.920,60 (36,9% da receita — absurdo). Causa principal: ingrediente **"Mel trufado" duplicado em Unidade (UN) a R$ 5,00**, usado na ficha "Pizza Parma e Cinco Queijos" com ~10 un por pizza → 3.710 un consumidas = R$ 17.850 só ele. Outros custos unitários fora da realidade (R$/kg implícito): Queijo parmesão ralado 980, Presunto parma 690, Aliche 500, Nutella 390, Muçarela de búfala 330, Pepperoni 320, Calabresa 200, Mel 200/L, Molho barbecue 200/L, Azeite 150/L, Molho pomodoro pelati 140/L, Fermento biológico 150, Frango 120. Também há 3 "Molho de tomate" e 2 "Mel trufado" duplicados, e estoques negativos em vários itens (contagem inicial nunca feita).

**Feito em 20/08:**
1. "Mel trufado (UN)" custo médio 5,00 → **0,20** (mesmo custo do registro em ml). Só afeta vendas daqui pra frente — o CMV histórico de agosto NÃO recalcula.
2. Compras reais da planilha `Custos_LeTreFarine_LeTreMassas_Jerrys atual.xlsx` (abas Notas Fiscais) lançadas em **Lançamentos financeiros**, NÃO pagas, conta Dinheiro - Caixa Aberto Le, consolidadas por mês/categoria (Custo com Vendas no DRE):
   - JUN/26 (venc. 30/06): Fornecedores 19.868,47 + Embalagem 275,70 = **20.144,17** (40 NF)
   - JUL/26 (venc. 31/07): Fornecedores 15.466,72 + Embalagem 926,49 = **16.393,21** (33 NF)
   - AGO/26 (venc. 31/08): Fornecedores 10.277,93 + 3.111,87 (complemento 08–15/08) + Embalagem 63,44 + 203,40 = **13.656,64** (31 NF) + **Motoboys 2.040,00** (aba Motoboy, categoria Motoboy)
   DRE confirmado após lançar: Custo com Vendas jun 20.144,17 / jul 16.393,21 / ago 20.724,64 (13.656,64 + 2.040 + 5.028 de embalagens fixas).

**Fonte viva das notas: chat do claude.ai "Atualizar notas fiscais em novo chat"** (https://claude.ai/chat/10aadb90-002e-4349-9cea-e85a26b4d087) — o dono manda foto de cada NF e motoboy do dia; o Claude de lá atualiza a planilha `Custos_LeTreFarine_LeTreMassas_Jerrys.xlsx` (botão Baixar na última mensagem = versão mais nova; copiar por cima de `~/Downloads/Custos_LeTreFarine_LeTreMassas_Jerrys atual.xlsx`). As fotos das NFs ficam nessa conversa — é de lá que sai a auditoria de preço unitário dos ingredientes.

**Como ler o DRE agora:** o CMV real de cada mês é a linha **"(-) Custo com vendas"** (compras da planilha). A linha "(-) CMV" é o teórico das fichas — serve pra comparar com o real (desperdício), mas jun–ago está quebrada pelos custos errados; não somar as duas. Agosto lançado até 15/08 (última atualização do chat); no fechamento do mês, baixar a planilha de novo e lançar só a diferença.

**Auditoria de custo unitário (20/08/2026, preços extraídos das fotos das NFs pelo Claude do chat "Atualizar notas fiscais", última compra de cada item):**

| Ingrediente (Saipos) | Antes (R$/g ou ml) | NF real | Agora | Fonte |
|---|---|---|---|---|
| Presunto parma | 0,69 | R$167,41/kg (Seara, 12/08) | **0,17** | NF 2708403 |
| Queijo parmesão ralado | 0,98 | não há NF de ralado; peça R$45,90/kg (HMF, 04/08) | **0,05** (estimado = peça) | NF 000.074.640 |
| Aliche | 0,50 | R$405,83/kg (Delly's, 04/08) | **0,41** | NF 262959 |
| Nutella | 0,39 | R$66,66/kg (Delly's, 04/08) | **0,07** | NF 262959 |
| Muçarela de búfala | 0,33 | R$43,98/kg (Delly's, 04/08) | **0,04** | NF 262959 |
| Fermento biológico | 0,15 | R$31,98/kg (Delly's, 04/08) | **0,03** | NF 262959 |
| Queijo gorgonzola | 0,09 | R$58,90/kg (HMF, 04/08) | **0,06** | NF 000.074.640 |
| Molho barbecue | 0,20 | balde 3,5 kg ≈ R$37 → ~R$10,6/kg (Delly's, 14/08) | **0,01** | NF 2631421 |
| Mel trufado (UN) | 5,00 | — | **0,20** (igual ao registro em ml) | — |

Conferidos e já corretos: bacon 39,11/kg (Tropeira) ≈ 0,05; muçarela 29,65/kg (Lucas Dittz) = 0,03; azeite Olitalia R$160/L = 0,15/ml; cream cheese 30,99/kg = 0,03; cheddar 32,95/kg = 0,03; pão brioche 2,42/un; queijo parmesão (peça) 45,90/kg ≈ 0,04.
**Sem NF no período (ficaram como estavam, provavelmente ainda altos):** pepperoni 0,32/g, calabresa 0,20/g, mel 0,20/ml, azeite trufado 0,20/ml, molho pomodoro pelati 0,14/ml, frango 0,12/g, maionese da casa 0,20/g, molho américa 0,20/ml. Corrigir na próxima compra de cada um (o chat de notas atualiza a planilha; pedir o preço unitário lá).
Observação: o custo só vale pra vendas a partir de 20/08 — o CMV teórico de jun–ago no DRE continua inflado; usar "Custo com Vendas". Pagamento em Saipos: no cadastro de despesa o ícone 👍 verde = pago (padrão) — clicar até ficar cinza ("Marcar como pago") antes de salvar; o clique às vezes não pega na primeira.
