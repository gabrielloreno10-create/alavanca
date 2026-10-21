# O que o repasse do iFood cobra e o relatório de Pedidos não mostra

**21/10/2026** · Fonte: Toqan (`work.toqan.ai`), agente financeiro do iFood,
consultado na conta do Grupo Le Tre Farine. Nove consultas, três lojas × três meses.

---

## A pergunta que estava travando a margem

Eu tinha medido, pedido a pedido no relatório exportado, uma taxa efetiva de
**30,9%** de agosto a outubro. O Hélio tinha dito **~41%**, da conta teórica do
contrato. E o fechamento mensal de agosto dizia outra coisa ainda — batendo na
Pizzaria (34,45%) e divergindo 21 pontos na Jerry's (50,82% contra 29,9%).

**Nenhum dos dois estava errado. Faltava uma camada.**

## O que o repasse desconta e o relatório de Pedidos não mostra

| Categoria | Natureza | No relatório? |
|---|---|---|
| Mensalidade iFood | taxa fixa mensal do plano | ❌ |
| **Pacote de anúncios (Hits/CPV)** | cobrado sobre o pacote, não por pedido | ❌ |
| Taxa de antecipação | sobre o volume antecipado | ❌ |
| Frota Garantida / Sob Demanda | por rota | ❌ |
| Cobrança de entrega cancelada | lançamento avulso | ❌ |
| Ressarcimento / ajuste manual | crédito ou débito pontual | ❌ |
| Desconto de antecipação por exclusividade | ajuste contratual | ❌ |
| Comissão de retirada | agregado | ⚠️ parcial |

O relatório de Pedidos traz **o bruto menos comissão e menos desconto de
promoção**. Tudo o que não tem pedido associado fica de fora.

## O número que explica a divergência da Jerry's

> **A Jerry's gastou R$ 8.295,21 em pacote de anúncios em agosto.**
> Sobre um GMV de R$ 44 mil, isso é **19% de custo adicional** que não aparece
> em pedido nenhum.

A Pizzaria, no mesmo mês: R$ 3.908,82 sobre R$ 51 mil = **7,7%**.

É isso, e não erro de medição, que produzia os 21 pontos de diferença.

## Agosto, componente a componente

### Le Tre Farine Pizzaria

| | Agosto | Setembro | Outubro |
|---|---:|---:|---:|
| Comissão iFood | 6.190,61 | 4.397,56 | 3.960,34 |
| — exclusividade | 4.667,66 | 3.353,70 | 3.083,00 |
| — entrega parceira | 1.522,95 | 1.018,80 | 848,19 |
| Taxa de pagamento online | 1.387,10 | 993,93 | 901,32 |
| Taxa de serviço | 0 | 0 | **661,81** |
| **Promoção bancada pela LOJA** | **5.500,26** | **4.004,53** | **3.662,97** |
| Promoção bancada pelo iFood | 2.589,33 | 1.872,70 | 1.737,01 |
| Mensalidade | 150,00 | 150,00 | — |
| **Anúncios (Hits/CPV)** | **3.908,82** | 1.751,50 | — |
| Frota Garantida + entregas | 2.561,23 | 573,29 | — |
| Taxa de antecipação | 738,16 | 528,78 | — |

### Jerry's

| | Agosto | Setembro | Outubro |
|---|---:|---:|---:|
| Comissão iFood | 5.205,93 | 3.199,63 | 1.769,11 |
| Taxa de pagamento online | 1.210,99 | 715,41 | 424,88 |
| **Promoção bancada pela LOJA** | **5.564,97** | 2.642,63 | 2.077,54 |
| Promoção bancada pelo iFood | 2.638,96 | 1.285,41 | 504,35 |
| Mensalidade | 150,00 | 150,00 | — |
| **Anúncios (Hits/CPV)** | **8.295,21** | — | — |
| Frota Garantida + entregas | 4.085,78 | — | — |

### Le Tre Farine Pastas

| | Agosto | Setembro | Outubro |
|---|---:|---:|---:|
| Comissão iFood | 446,90 | 397,14 | 319,59 |
| Taxa de pagamento online | 113,67 | 100,92 | 81,31 |
| Taxa de serviço | 74,95 | 110,00 | 0 |
| **Promoção bancada pela LOJA** | **662,80** | 819,22 | 574,38 |
| Promoção bancada pelo iFood | 250,08 | 490,54 | 199,40 |
| Mensalidade | 110,00 | (na tx. serviço) | — |
| Anúncios (Hits/CPV) | 489,15 | — | — |
| Frota Garantida + entregas | 419,73 | — | — |

## As três coisas que isto revela

**1. A loja banca mais promoção que o iFood, nas três, em todos os meses.**
Pizzaria em agosto: R$ 5.500 da loja contra R$ 2.589 do iFood — mais que o
dobro. É o maior componente isolado depois da comissão, e é decisão da loja,
não imposição do canal. É a alavanca mais direta que existe aqui.

**2. Custo fixo pune quem vende menos.** R$ 150 de mensalidade sobre os R$ 51 mil
da Pizzaria é 0,3%. Os R$ 110 da Pastas sobre R$ 4 mil é **2,7%** — nove vezes
mais pesado, pelo mesmo serviço.

**3. Anúncio não é taxa de canal, e não pode entrar na mesma conta.** Os
R$ 8.295 da Jerry's são mídia, e a plataforma já os mede em `anuncio_dia`.
Somá-los à "taxa do iFood" contaria o mesmo dinheiro duas vezes e esconderia que
são gasto controlável, não custo de operar no canal.

## O que muda no modelo de dados

`canal_taxa_mes` guarda hoje uma taxa só. Precisa separar:

- **por pedido** (sai do relatório exportado): comissão, taxa de pagamento,
  taxa de serviço, promoção bancada pela loja
- **por mês, sem pedido associado** (só existe no repasse): mensalidade,
  antecipação, frota, cobrança avulsa, ajuste

São naturezas diferentes e respondem a perguntas diferentes. A primeira escala
com a venda; a segunda não.

## Uma inconsistência a conferir

A taxa de serviço da Pizzaria aparece **só em outubro** (R$ 661,81), zerada em
agosto e setembro. E na Pastas de setembro o agente devolveu R$ 110,00 como
"taxa de serviço", que é exatamente o valor da mensalidade — provavelmente
reclassificação de linha no extrato. O próprio Toqan sinalizou as duas.

## Pendente

O Toqan ofereceu fazer a reconciliação completa contra o relatório exportado.
Vale aceitar: é o que fecha o número final da margem por canal.
