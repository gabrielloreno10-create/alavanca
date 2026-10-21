# Decisões do método

Uma entrada por decisão. **Nunca apague nem edite entrada antiga**: decisão que mudou
vira entrada nova, com a data e o motivo. O histórico é o que evita a gente rediscutir
em janeiro o que já foi resolvido em outubro.

Mais recente em cima.

## Formato

```markdown
## AAAA-MM-DD · TIPO · título curto

O que mudou, em uma ou duas frases.

**Por quê:** o motivo, com o número que sustenta, se houver.
**Afeta:** que parte do sistema ou da operação muda por causa disso.
**Fonte:** de onde veio o número. Se não houver, escreva [CONFIRMAR].
```

Os tipos: **REGRA** (régua, limite, política), **META** (número a bater), **OFERTA**
(promoção, preço, combo), **PEDIDO** (algo que depende do Gabriel), **REVOGA** (desfaz
uma decisão anterior, citando a data dela).

---

## 2026-10-21 · REGRA · A Jerry's vendeu; o export do Saipos e que veio incompleto

O banco tem ZERO linha de venda da Jerry's. Nao e que ela nao vendeu: o Helio confirmou
em 21/10 que ela vendeu de maio a setembro, com ROAS de 2,9x no iFood em agosto.

**Por que:** comparando a referencia de julho do Helio (media por noite, todas as marcas)
com julho medido no banco (so Pizzaria e Pastas), a **segunda-feira bate exatamente**
(R$ 696 contra R$ 696) e os outros seis dias faltam de 28% a 40%, somando R$ 9.211 por
semana. Se fosse erro de medicao, a segunda erraria junto. O encaixe da segunda prova que
o que falta e uma marca que nao abre segunda.
**Afeta:** a visao de grupo inteira, e o modulo 1. Enquanto nao entrar, o painel diz
"nao medido" na Jerry's -- o que esta certo, mas deixa o grupo subestimado em um terco.
**Fonte:** medicao no banco em 21/10/2026, contra metodo/metas/referencia-julho-2026.md.
Para: Gabriel. Urgencia: alta. Resolve-se com um export completo do Saipos, ou pelo
relatorio de Pedidos do iFood em "Todas as lojas", que cobre agosto a outubro.

## 2026-10-21 · REGRA · Provisorio nao e fechado: o dia do iFood fecha depois

Toda linha de venda nasce 'provisorio' e so vira 'fechado' quando a fonte entrega o valor
apurado. A tela e a mensagem das 7h tem que dizer qual dos dois e.

**Por que:** o Helio apontou que o pedido do iFood "demora um dia para ser computado,
validado e taxado com as devidas taxas". O banco nao sabia disso: canal_taxa_mes tem
take_rate_pct preenchido e comissao_pct, taxa_pagamento_pct e embalagem_por_item NULOS
nas 5 linhas, e o relatorio do dono estima comissao com take fixo de 41%.
**Afeta:** venda_dia (migration 018), o importador e a mensagem das 7h.
**Fonte:** medicao no banco em 20/10/2026; fala do Helio em 21/10/2026.

## 2026-10-21 · PEDIDO · O site grava tudo como "letre": falta a marca

A tabela pedidos_site tem a coluna `loja`, mas o n8n grava sempre 'letre'. Medido pelo
Helio em 21/10: 46 pedidos de 07/10 a 20/10, uma unica loja.

**Por que:** sem a marca na origem, nao da para separar a venda da Pastas da venda da
Pizzaria no canal proprio, e a margem da Pastas segue invisivel justamente no canal de
maior margem.
**Afeta:** modulo 1, e a leitura por marca do canal proprio.
**Fonte:** Helio, 21/10/2026.
Para: Helio. Urgencia: media. Resolve-se fazendo o fluxo do n8n gravar a marca ao inserir.

## 2026-10-21 · META · Referencia de julho registrada; meta de verdade ainda nao existe

As medias por noite de julho entraram em metodo/metas/referencia-julho-2026.md marcadas
como referencia, nao como meta.

**Por que:** sao do grupo todo, nao da Pizzaria, e o Helio disse que define a meta depois.
Media do que foi e linha de base; meta e onde se quer chegar. Enquanto as duas forem a
mesma coisa, bater a meta nao significa nada.
**Afeta:** o painel segue dizendo "sem meta cadastrada", que e o correto.
**Fonte:** Helio, 21/10/2026.

## 2026-10-20 · REGRA · Método mora no repositório, não no chat

Toda decisão de método passa a ser arquivo nesta pasta. A IA do Hélio trabalha dentro do
repositório clonado, na branch `metodo`, e o Gabriel junta na `main`.

**Por quê:** no pacote de passagem de 18/10, nove dos dezessete agendamentos apontavam
para scripts que não existiam, e documentos de método se contradiziam. O conhecimento
estava em três lugares ao mesmo tempo: a cabeça do Hélio, o Mac dele e o histórico de
conversa. Nenhum dos três sobrevive a seis semanas.
**Afeta:** o jeito de trabalhar dos dois. Nada no sistema.
**Fonte:** inventário do pacote, em `docs/integracoes-apuracao-2026-10-20.md`.

## 2026-10-20 · REGRA · Nada específico de cliente dentro do código

Tudo que varia de restaurante para restaurante mora em tabela ou em arquivo desta pasta.
Nunca dentro de um fluxo ou de uma função.

**Por quê:** o piloto na Le Tre existe para virar produto vendável. Hoje os fluxos do n8n
são um por marca, com cardápio, prompt, número e token colados dentro. Do jeito que está,
cada restaurante novo é um clone feito à mão, e três clones já são impossíveis de manter.
**Afeta:** a construção do módulo 2 (CRM e WhatsApp), que é quando isso precisa cair.
**Fonte:** `docs/plano-pizzaria-2026-10-20.md`, seção do piloto.

## 2026-10-20 · PEDIDO · Separar a venda da Pastas dentro do canal próprio

O site do Cliente Fiel vende Pizzaria e Pastas, e hoje os R$ 76.327,98 e 699 pedidos vão
inteiros para a Pizzaria. Falta a visão "Pastas pelo Cliente Fiel".

**Por quê:** sem separar, a margem da Pastas fica invisível e a da Pizzaria fica melhor do
que é, justamente no canal de maior margem.
**Afeta:** módulo 1. Resolve-se puxando o pedido com os itens em vez do resumo diário.
**Fonte:** medição no banco em 20/10/2026.
Para: Gabriel. Urgência: alta, é pré-requisito da leitura por marca.
