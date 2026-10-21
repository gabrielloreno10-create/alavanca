# iFood apurado: 2.282 pedidos, três lojas, agosto a outubro

**Data:** 21/10/2026 · **Fonte:** Portal do Parceiro, `Pedidos › Exportar`, relatório
Personalizado com "Todas as lojas" e os 61 campos (padrão, agendamento, cancelamento,
entrega, negociação). Três exportações, uma por mês, porque a lista limita 31 dias.

## O que veio

| Mês | Pedidos | Itens (R$) | Taxas (R$) | Líquido (R$) | Efetivo |
|---|---:|---:|---:|---:|---:|
| Agosto | 1.062 | 110.701,05 | −15.311,62 | 75.272,82 | 32,0% |
| Setembro | 687 | 73.471,21 | −10.279,70 | 50.289,40 | 31,6% |
| Outubro (1–19) | 533 | 55.556,53 | −7.972,86 | 40.137,32 | 27,8% |
| **Total** | **2.282** | **239.728,79** | **−33.564,18** | **165.699,54** | **30,9%** |

Por loja, no acumulado dos três meses:

| Loja | Pedidos | Itens (R$) | Efetivo |
|---|---:|---:|---:|
| Le Tre Farine Pizzaria | 1.229 | 135.373,86 | 32,1% |
| **Jerry's** | **896** | **91.910,40** | **28,2%** |
| Le Tre Farine Pastas | 157 | 12.444,53 | 35,2% |

## Os dois achados que mudam número no painel

### 1. A Jerry's tem R$ 91.910 que o banco não conhece

896 pedidos em três meses. No banco, zero linha. Confirma o que o Hélio disse e o que a
segunda-feira de julho já provava (ver `metodo/metas/referencia-julho-2026.md`): o export
do Saipos veio incompleto, não é que a loja não vendeu.

Em agosto a Jerry's fez **464 pedidos e R$ 47.577** — 81% do volume da Pizzaria no mesmo
mês. Tratar o grupo sem ela não é imprecisão, é outra empresa.

### 2. O take do iFood não é 41%

O relatório diário que o dono recebe hoje estima a comissão com take fixo de **41%**
(`pdca/guardrails.json`). Medido, pedido a pedido:

| Loja | Agosto | Setembro | Outubro |
|---|---:|---:|---:|
| Pizzaria | 33,6% | 33,3% | 28,5% |
| Jerry's | 29,9% | 28,1% | 24,7% |
| Pastas | 32,7% | 37,7% | 35,2% |

Nunca 41%, em nenhuma loja, em nenhum mês. A diferença média é de **10 pontos**. Sobre os
R$ 239.728 do período, são cerca de **R$ 24 mil de margem** que o dono acha que não tem.

**Antes de jogar isso no painel falta fechar uma definição.** "Efetivo" aqui é
`1 − líquido/itens`, que embute taxas, comissões, taxa de serviço e os incentivos
promocionais da loja. A coluna `TAXAS E COMISSOES` sozinha dá 12% a 15%. Qual das duas
entra na margem de contribuição é decisão, não medição — e tem que ser tomada antes,
porque as duas contam histórias diferentes.

## O que mais veio no arquivo, e ainda não foi usado

Os 61 campos trazem, por pedido: tempo de preparo, tempo prometido × realizado, atraso,
distância percorrida, motivo e origem de cancelamento, se era contestável, e o incentivo
promocional separado em iFood / loja / rede. Isso preenche `ifood_operacao_dia`, que hoje
tem zero linha, e substitui quatro relatórios que eu ia puxar à parte.

## Limites do portal, medidos

| Limite | Valor |
|---|---|
| Relatórios de `Análise` | não voltam mais de **90 dias** |
| Lista de `Pedidos` | **31 dias** por consulta |
| Validade da exportação | 3 dias |
| Lojas por exportação | **todas**, pelo seletor "Todas as lojas" |
| Entrega | download no portal **e** cópia por e-mail |

O relatório de `Análise › Vendas` vem **agregado do período**, não dia a dia — serve para
conferência, não para carga. Quem tem o diário é a exportação de `Pedidos`.

## O que isto não resolve

Maio, junho e julho estão fora da janela de 90 dias do portal. Para esses meses a única
fonte continua sendo o Saipos — e é justamente o export que veio sem a Jerry's.
