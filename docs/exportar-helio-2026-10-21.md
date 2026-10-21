# O que o Hélio precisa exportar e mandar

**Para:** Hélio · **De:** Gabriel · **Data:** 21/10/2026
**Revisado** no mesmo dia, depois de abrir o portal do iFood e achar o que havia lá.

Com isto o painel passa a mostrar outubro e para de depender de CSV digitado à mão.
Tempo estimado: **15 minutos**, porque a maior parte saiu da sua lista.

---

## Regra que vale para tudo aqui

**Nenhum dado pessoal de cliente final sai da sua máquina.** Sem nome, sem telefone,
sem e-mail. O comando do banco abaixo já seleciona coluna por coluna justamente para
isso — não troque por `select *`. O banco da Alavanca tem zero dado pessoal hoje e vai
continuar tendo.

Se algum comando reclamar, **não conserte mandando mais colunas**. Manda o erro.

---

## O que MUDOU nesta revisão

Abri o portal do iFood com a sessão que já estava aberta e achei
`Análise › Relatórios`. Ele exporta, com período **Personalizado**:

| Relatório | O que preenche no painel |
|---|---|
| **Vendas** — métricas por período e canal | a venda diária das três lojas |
| **Pedidos** — dados financeiros, taxas e comissões | **a comissão real**, que hoje é chute de 41% |
| **Qualidade da operação** | nota da loja |
| **Logística** — tempo de preparo, atrasos | tempo de entrega |
| **Cancelamentos** — com motivo e perda | cancelamentos |
| **Cardápio** — vendas por item | o que cada prato vendeu |

Esses seis cobrem o pilar 1 inteiro e matam a estimativa de comissão.
**Você não precisa exportar nenhum deles**: o Gabriel puxa daí, com a sua sessão.
A lista abaixo é só o que o iFood **não** tem.

---

## 1. Os pedidos do site, ao vivo desde 07/10

O mais importante. A tabela `pedidos_site`, que o n8n alimenta a cada minuto, tem o
canal próprio pedido a pedido — inclusive outubro inteiro, que hoje falta no painel.

```bash
psql "$DATABASE_URL" -c "\copy (select id_pedido, loja, data, hora, dia_semana, total, pagamento, status, visto_em from pedidos_site order by data, hora) to 'pedidos_site.csv' csv header"
```

`nome` e `telefone` ficaram de fora de propósito.

**E este, que é uma linha e vale ouro:**

```bash
psql "$DATABASE_URL" -c "select loja, count(*) pedidos, min(data) de, max(data) ate from pedidos_site group by loja order by loja"
```

Cola o resultado na resposta. Ele decide se dá para separar a venda da **Pastas** da
venda da **Pizzaria** no site — hoje os R$ 76.327,98 do canal próprio vão inteiros para
a Pizzaria, e a margem da Pastas fica invisível.

## 2. O histórico do relatório diário

Treze dias de outubro já calculados, com faturamento, pedidos, iFood, site, comissão,
CMV e sobra:

```bash
mkdir -p ~/Desktop/para-gabriel && cd ~/marco-zero/relatorio_diario && cp historico.jsonl ifood_*.json ~/Desktop/para-gabriel/
```

## 3. Os parâmetros do método

```bash
cp ~/marco-zero/pdca/guardrails.json ~/Desktop/para-gabriel/
```

## 4. Como mandar

```bash
cd ~/Desktop && zip -r para-gabriel-2026-10-21.zip para-gabriel/
```

**A string de conexão não vai no zip.** Manda separado, e crie um usuário só de leitura:

```sql
create user alavanca_leitura with password 'troque-por-uma-senha-forte';
grant connect on database <nome_do_banco> to alavanca_leitura;
grant usage on schema public to alavanca_leitura;
grant select on pedidos_site to alavanca_leitura;
```

Assim a gente lê o que precisa e não consegue escrever nada no seu banco, nem por engano.

---

## O e-mail para o Saipos

Continua valendo, e segue sendo o único relógio que não é nosso. Com os relatórios do
iFood na mão, ele deixa de ser urgente para a demonstração — mas é ele que elimina o
robô de navegador no dia a dia.

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

## O que precisamos que você responda

Rápido, em texto mesmo:

1. **A Jerry's vendeu entre maio e setembro?** No banco ela não tem uma linha sequer de
   venda. Ou ficou de fora do export do Saipos, ou não vendeu. Qual dos dois?
2. **Meta de faturamento por dia da semana**, só da Pizzaria, os sete dias. Sem isso o
   painel inteiro diz "sem meta" e nenhum semáforo funciona.
3. **A alíquota de imposto** sobre a venda. Hoje a margem do painel não desconta imposto
   nenhum, então ela está otimista.
4. **O custo de entrega por pedido é R$ 8,50?** Era o número do material antigo, nunca
   confirmado.
5. **A integração Saipos↔iFood está "atualização pendente"** no portal. Vale conferir:
   pode estar afetando a entrada de pedidos.
6. **Avalyo AI e Eneway estão ativas** no seu iFood. Se você não contratou as duas,
   olha isso — integração ativa enxerga dado de pedido da loja.

---

## Para a reunião com o Samuel

O argumento fica mais forte com o painel cheio, e é por isso que a ordem acima importa.
O que pedir a ele: **acesso à integração oficial do iFood** (homologação do aplicativo
no portal do desenvolvedor, em nome da Tapaggo, CNPJ 31.729.932/0001-01), para a leitura
de vendas e repasses das três lojas deixar de depender de exportação manual.
