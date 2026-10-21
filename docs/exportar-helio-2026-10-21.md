# O que o Hélio precisa exportar e mandar

**Para:** Hélio · **De:** Gabriel · **Data:** 21/10/2026

Com isto o painel passa a mostrar outubro e para de depender de CSV digitado à mão.
São quatro arquivos e um e-mail. Tempo estimado: 20 minutos.

---

## Regra que vale para tudo aqui

**Nenhum dado pessoal de cliente final sai da sua máquina.** Sem nome, sem telefone,
sem e-mail. Os comandos abaixo já selecionam coluna por coluna justamente para isso —
não troque por `select *`. O banco da Alavanca tem zero dado pessoal hoje e vai
continuar tendo; é o que nos deixa dormir à noite quando a LGPD aparecer.

Se algum comando reclamar, **não conserte por conta própria mandando mais colunas**.
Manda o erro que a gente resolve.

---

## 1. Os pedidos do site, ao vivo desde 07/10

É o mais importante. A tabela `pedidos_site`, que o n8n alimenta a cada minuto, tem o
canal próprio pedido a pedido — inclusive outubro inteiro, que hoje falta no painel.

No terminal da máquina onde você acessa o Postgres (ou no EasyPanel, console do banco):

```bash
psql "$DATABASE_URL" -c "\copy (select id_pedido, loja, data, hora, dia_semana, total, pagamento, status, visto_em from pedidos_site order by data, hora) to 'pedidos_site.csv' csv header"
```

Note que `nome` e `telefone` ficaram de fora de propósito.

**E rode também este, que é uma linha só e vale ouro:**

```bash
psql "$DATABASE_URL" -c "select loja, count(*) pedidos, min(data) de, max(data) ate from pedidos_site group by loja order by loja"
```

Cola o resultado na resposta. Ele decide se a gente consegue separar a venda da **Pastas**
da venda da **Pizzaria** no site — hoje os R$ 76.327,98 do canal próprio vão inteiros
para a Pizzaria, e a margem da Pastas fica invisível.

## 2. O histórico do relatório diário

Treze dias de outubro já calculados, com faturamento, pedidos, iFood, site, comissão,
CMV e sobra. São dois caminhos na sua pasta `~/marco-zero/relatorio_diario/`:

```bash
cd ~/marco-zero/relatorio_diario && cp historico.jsonl ifood_*.json ~/Desktop/para-gabriel/
```

(Se a pasta `para-gabriel` não existir: `mkdir -p ~/Desktop/para-gabriel` antes.)

## 3. Os parâmetros do método

O arquivo que guarda o take do iFood, o CMV adotado e o custo fixo:

```bash
cp ~/marco-zero/pdca/guardrails.json ~/Desktop/para-gabriel/
```

## 4. O Saipos de outubro

Enquanto a API de Dados não é liberada (ver abaixo), ainda é export manual. No Saipos,
o mesmo relatório de vendas por loja e por dia que você exportou para agosto e setembro,
agora de **01/10 a ontem**, as três lojas.

---

## O e-mail para o Saipos, pronto para enviar

Este é o que destrava tudo. Manda hoje — a resposta deles é que define o prazo.

> Assunto: Habilitar API de Dados na conta
>
> Olá,
>
> Sou cliente e gostaria de habilitar a **API de Dados** na minha conta. Na tela
> `Canais de venda e Integrações › API de Dados` aparece "Nenhum acesso configurado"
> e não há opção de criar acesso por autoatendimento.
>
> Preciso de:
> 1. a API de Dados habilitada para a conta;
> 2. a documentação dos endpoints disponíveis;
> 3. o formato de autenticação;
> 4. o limite de requisições;
> 5. se há custo adicional.
>
> O uso é leitura de vendas por loja e por dia, para um painel de gestão próprio.
>
> Obrigado.

---

## O que a gente precisa que você responda

Rápido, em texto mesmo:

1. **A Jerry's vendeu entre maio e setembro?** No banco ela não tem uma linha sequer de
   venda. Ou ela ficou de fora do export do Saipos, ou não vendeu. Precisamos saber qual.
2. **Meta de faturamento por dia da semana**, só da Pizzaria, os sete dias. Sem isso o
   painel inteiro diz "sem meta" e nenhum semáforo funciona.
3. **A alíquota de imposto** que vocês pagam sobre a venda. Hoje a margem do painel não
   desconta imposto nenhum, então ela está otimista.
4. **O custo de entrega por pedido é R$ 8,50?** Era o número do material antigo, nunca
   confirmado.
5. **A integração do Saipos com o iFood está "atualização pendente"** no portal do iFood.
   Vale conferir: pode estar afetando a entrada de pedidos.
6. **Avalyo AI e Eneway estão ativas** no seu iFood. Se você não contratou as duas,
   olha isso — integração ativa enxerga dado de pedido da loja.

---

## Como mandar

Zipa a pasta e manda pelo canal combinado:

```bash
cd ~/Desktop && zip -r para-gabriel-2026-10-21.zip para-gabriel/
```

**A string de conexão do banco não vai no zip.** Manda separado, e de preferência crie
um usuário só de leitura para isso:

```sql
create user alavanca_leitura with password 'troque-por-uma-senha-forte';
grant connect on database <nome_do_banco> to alavanca_leitura;
grant usage on schema public to alavanca_leitura;
grant select on pedidos_site to alavanca_leitura;
```

Assim a gente lê o que precisa e não consegue escrever nada no seu banco, nem por engano.
