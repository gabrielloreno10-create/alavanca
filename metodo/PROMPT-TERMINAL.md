# O prompt do terminal do Hélio

Cole o texto abaixo como **primeira mensagem** toda vez que abrir uma sessão nova dentro
da pasta do projeto. Ele situa a IA em dez segundos e evita que ela saia mexendo no que
não é dela.

Antes de colar, abra o terminal na pasta certa:

```bash
cd ~/alavanca && git checkout metodo && git pull && claude
```

---

## Cole isto

```text
Você está no repositório da plataforma que eu e o Gabriel estamos construindo para
restaurantes. Eu sou o Hélio: dono do Grupo Le Tre Farine (Le Tre Farine Pizzaria, Le Tre
Farine Pastas e Jerry's Burger, em Belo Horizonte) e autor do método que a plataforma
executa. O Gabriel cuida do código; eu cuido do método.

ANTES DE QUALQUER COISA, leia nesta ordem e não pule:
1. metodo/CLAUDE.md — as regras desta pasta e o que você não pode fazer
2. metodo/DECISOES.md — as últimas 10 entradas, para saber o que já foi decidido
3. docs/plano-pizzaria-2026-10-20.md — onde o projeto está

MINHA PASTA É metodo/. Não edite nada fora dela. Se o que eu pedir exigir mexer em
painel/, db/ ou worker/, não faça: escreva o pedido em metodo/DECISOES.md como uma
entrada do tipo PEDIDO e me diga que vai pelo Gabriel.

COMO EU TRABALHO: eu opero três marcas de verdade, todo dia, e vou te trazer decisões
tomadas na operação (régua de anúncio, meta, oferta da semana, regra de disparo, o que o
vendedor de IA pode ou não oferecer). Seu trabalho é transformar isso em arquivo
estruturado nesta pasta, com fonte e data, não em texto solto.

REGRAS DE NÚMERO, que são as minhas regras de sempre:
- Todo número tem fonte e período. "CPA R$ 19,15 (Meta, 29/09 a 05/10)", nunca "CPA 19".
- Não sei de onde veio? Escreve [CONFIRMAR]. Nunca chuta.
- Lucro é margem de contribuição, não faturamento.
- Dado de cliente do iFood nunca vira base de disparo. É regra deles e risco de suspensão.
- Disparo só para quem tem consentimento registrado, com origem e data.

AO TERMINAR qualquer mudança: registre em metodo/DECISOES.md (data, o que mudou, por quê,
o que isso afeta), faça commit na branch metodo e me lembre de dar push.

Agora me pergunte o que eu quero fazer nesta sessão.
```

---

## Quando pedir uma coisa que é do Gabriel

Vai acontecer, e é normal: você vai querer uma tela nova, um número que não existe, uma
integração. Não tente fazer. Peça à sua IA para registrar como **PEDIDO** no
`DECISOES.md`, assim:

```markdown
## 2026-10-21 · PEDIDO · Ver a margem da Pastas separada do canal próprio

Hoje o site do Cliente Fiel soma Pizzaria e Pastas num número só, e eu preciso separar
para decidir preço da massa. Não dá para resolver no método: depende de o sistema puxar o
pedido com os itens.

Para: Gabriel. Urgência: média.
```

Assim o pedido não se perde numa conversa e o Gabriel vê no `git pull` seguinte.
