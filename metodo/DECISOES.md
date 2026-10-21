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
