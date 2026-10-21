# Lista para fazer na máquina do Hélio, agora

**21/10/2026** · Gabriel está na casa do Hélio. Esta lista é para ser executada
de uma vez só, na ordem. Tempo estimado: **30 a 40 minutos.**

Ordenada por quanto destrava. Se o tempo acabar no meio, os itens 1 a 4 são os
que mudam o painel esta semana.

---

## Antes de tudo: a regra

**Nada de nome, telefone ou e-mail de cliente final sai dessa máquina.** Os
comandos abaixo já selecionam coluna por coluna para isso. Não troque por
`select *`. Se der erro, manda o erro — não "conserta" mandando mais coluna.

---

## 1. Os pedidos do site (2 min) — tapa o buraco de outubro

```bash
mkdir -p ~/Desktop/para-gabriel && cd ~/Desktop/para-gabriel
psql "$DATABASE_URL" -c "\copy (select id_pedido, loja, data, hora, dia_semana, total, pagamento, status, visto_em from pedidos_site order by data, hora) to 'pedidos_site.csv' csv header"
```

> O banco não é alcançável de fora: `10.11.0.14` é endereço interno do servidor.
> Por isso o CSV, e não a conexão direta.

## 2. O relatório diário e os parâmetros (1 min)

```bash
cd ~/marco-zero/relatorio_diario && cp historico.jsonl ifood_*.json ~/Desktop/para-gabriel/
cp ~/marco-zero/pdca/guardrails.json ~/Desktop/para-gabriel/
```

## 3. Os fluxos do n8n (5 min) — é aqui que mora o método

No n8n: **Workflows → selecionar todos → Download**. Salva em
`~/Desktop/para-gabriel/n8n/`.

Precisamos de todos, mas os que importam mais:

- o que grava em `pedidos_site`
- o do **vendedor de IA / chatbot** do WhatsApp — com o prompt e o cardápio
- os de **Instagram**
- os de disparo / sniper

> Por que: hoje cada marca é um fluxo clonado com cardápio, prompt, número e
> token colados dentro. É exatamente isso que precisa virar configuração em
> tabela, ou o segundo restaurante é outro fim de semana de trabalho manual.

## 4. A Jerry's de maio a julho (5 min) — o buraco que sobrou

No Saipos, o **mesmo relatório de vendas por dia** que você exportou para
agosto e setembro, agora:

- período **01/05/2026 a 31/07/2026**
- **as três lojas, com a Jerry's inclusa**

> Por que: o export anterior veio sem a Jerry's — 896 pedidos e R$ 91.910 que o
> painel não via. Agosto, setembro e outubro eu já peguei direto no iFood, mas o
> portal do iFood só volta **90 dias**. Maio, junho e julho só saem pelo Saipos.

## 5. O e-mail para o suporte do Saipos (2 min) — manda hoje

É o único relógio que não é nosso.

> Assunto: Habilitar API de Dados na conta
>
> Olá,
>
> Sou cliente e gostaria de habilitar a **API de Dados** na minha conta. Na tela
> `Canais de venda e Integrações › API de Dados` aparece "Nenhum acesso
> configurado" e não há opção de criar acesso por autoatendimento.
>
> Preciso de: a API habilitada; a documentação dos endpoints; o formato de
> autenticação; o limite de requisições; e se há custo adicional.
>
> O uso é leitura de vendas por loja e por dia, para um painel de gestão próprio.
>
> Obrigado.

## 6. Duas perguntas para responder DENTRO do Cliente Fiel (5 min)

Com o painel aberto em `painel.clientefiel.app`:

1. Em **Clientes**, a ficha de um cliente mostra **a data em que ele aceitou**
   receber promoção? A lista tem "Receber notificações manuais", mas a coluna
   "Cadastro" é a data de entrada na base, não a do aceite.
2. Existe em algum lugar **API, integração, webhook ou token**?

> Por que estas duas valem mais que todo o resto: **é a data do aceite que
> destrava o CRM inteiro.** Sem ela não há disparo, e isso não é escolha técnica
> — nenhum sistema resolve, nem o Chatti, que também não tem consentimento.

## 7. Meta Ads (3 min)

Precisamos do **ID da conta de anúncios** e de acesso de leitura a ela.

> Por que: temos R$ 16.901 de investimento gravado em 27 linhas mensais, todas
> com criativo nulo. Sem o criativo não dá para dizer qual anúncio deu retorno —
> só que gastou.

## 8. Trocar três segredos (5 min) — não é opcional

Estes estão expostos hoje:

1. **Token do bot do Telegram**, escrito dentro de 3 fluxos do n8n (Stories Le
   Tre, Stories Jerry's, Pauta Publicador)
2. **Senha do Postgres**, escrita em `onboarding-socio.sh` e no
   `RUNBOOK_postgres_easypanel.md`
3. **A senha do `alavanca_leitura`** que você mandou pelo chat hoje

Gera novos, atualiza onde usa, e manda o novo por canal fechado — não por chat.

---

## O que só o Hélio decide (pode responder por áudio)

1. **Qual taxa entra na margem de contribuição?** Medi os dois números, e eles
   contam histórias diferentes:
   - só a coluna `TAXAS E COMISSOES`: **12% a 15%**
   - de item até líquido (inclui o incentivo promocional que a loja bancou):
     **24,7% a 37,7%**

   O relatório que você recebe hoje usa **41% fixo** — que não aconteceu em
   nenhuma loja, em nenhum mês. São ~10 pontos de diferença, cerca de **R$ 24
   mil de margem** em três meses.

2. **Alíquota de imposto** sobre a venda. Hoje a margem do painel não desconta
   imposto nenhum, então está otimista.

3. **Custo de entrega por pedido é R$ 8,50?** Era o número do material antigo,
   nunca confirmado.

4. **Meta por dia da semana, da Pizzaria sozinha.** As médias de julho que você
   mandou são do grupo inteiro — aplicá-las à Pizzaria inflaria a meta dela em
   cerca de um terço. E média do que foi é linha de base; meta é onde se quer
   chegar.

5. **A integração Saipos↔iFood está "atualização pendente"** no portal do iFood.
   Pode estar afetando entrada de pedido.

6. **Avalyo AI e Eneway estão ativas** no seu iFood. Se você não contratou as
   duas, olha isso — integração ativa enxerga dado de pedido da loja.

---

## Como mandar

```bash
cd ~/Desktop && zip -r para-gabriel-2026-10-21.zip para-gabriel/
```

Senha nenhuma vai no zip.
