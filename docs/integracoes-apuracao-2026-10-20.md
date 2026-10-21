# O que dá para fazer por API, apurado nas contas reais

20/10/2026, olhando as contas logadas do grupo Le Tre no Chrome do Gabriel. Só leitura:
nada foi ativado, contratado, alterado ou baixado.

O objetivo era responder uma pergunta: **o que dá para puxar por API, em vez de ficar
exportando relatório à mão?** Um sistema por seção, com o que tem, o que falta e quem
destrava.

---

## Saipos

**Tem API de Dados, e ela está desligada.**

Em `Canais de venda e Integrações` existe uma terceira aba chamada **API de Dados**
(`conta.saipos.com/#/app/store/partners/data-api`). Ela abre e diz uma frase só:

> Nenhum acesso configurado para API de Dados

Não há botão de criar, gerar chave ou contratar na tela. Ou seja: **o produto existe no
Saipos, está visível na conta da Pizzaria, e não é autoatendimento.** Tem que pedir a
eles para habilitar.

Isso é a coisa mais importante desta apuração, porque hoje o faturamento por loja sai do
Saipos por um robô de navegador (Playwright) que loga com a sessão do dono e raspa a
tela. Esse robô quebra a cada mudança de layout, depende de alguém ter feito login, e é
o que impede o relatório diário de rodar sozinho. Uma API de dados elimina isso.

**O que pedir ao suporte do Saipos, nestas palavras:** habilitar a API de Dados para a
conta, e mandar a documentação dos endpoints, o formato de autenticação, o limite de
requisições e se cobra a mais.

**O que já está integrado na loja** (aba `Canais de vendas e Integrações`):

| Integração | Estado |
|---|---|
| iFood | ativo, com integração |
| ClienteFiel | ativo, com integração |
| Facebook | ativo, sem integração |
| WhatsApp | ativo, sem integração |
| Cardápio Digital | inativo |
| Saipos Bot | inativo |
| Site Delivery (Saipos) | inativo |
| 99 Food, Aarim, Abrahão, Accon Delivery | inativos |

Há também uma aba `Integração TEF` e um botão `Saiba como ativar Integrações de Pedidos`,
não abertos nesta rodada.

**Observação de operação, não de integração:** ao abrir, o Saipos caiu direto no kanban
da operação ao vivo, com um pedido real de 20/10 às 20:55 e uma caixa de impressão
aberta. Nada foi clicado. Vale lembrar para a próxima: explorar o PDV em horário de pico
é ruim, porque cada pedido novo abre uma caixa dessas por cima da tela.

---

## iFood

**O caminho de integração existe e está na cara, em `portal.ifood.com.br/apps`.**

A página `Serviços e soluções › Integrações` tem um botão **"Ativar integração por
código"**. É por ali que o restaurante autoriza um aplicativo de terceiro a falar com a
loja dele. Não foi clicado: é um botão de ativação e a decisão é do dono.

Isso fecha o desenho que a pesquisa de 09/10 já apontava: nosso aplicativo precisa ser
cadastrado e homologado no portal do desenvolvedor do iFood, em nome de um CNPJ com CNAE
de tecnologia (a Tapaggo tem), e **cada loja autoriza esse aplicativo aqui**, com a conta
Dono. O botão é a ponta visível desse fluxo.

**O que já está autorizado na Pizzaria hoje:**

| Integração | Quem desenvolveu | Estado |
|---|---|---|
| Sistema Saipos | Saipos Serviços | **atualização pendente** |
| Cliente Fiel Pedidos/Cardápio | Cliente Fiel | ativo |
| Avalyo AI | Ubíquo Robotics | ativo |
| Eneway | ENEWAY LTDA | ativo |

Dois pontos para o Hélio olhar:

1. **A integração do Saipos está com "atualização pendente".** Pode ser só uma versão
   nova a aceitar, pode ser algo que já esteja afetando a entrada de pedidos. Vale
   conferir antes de culpar outra coisa quando um número não bater.
2. **Avalyo AI e Eneway estão ativos.** Se ele não lembra de ter contratado os dois,
   é hora de olhar: integração ativa vê dado de pedido da loja.

**Menu lateral do portal, para referência:** Pedidos, Financeiro, Cardápio; em Análise:
Desempenho, Avaliações, Super, Relatórios, Clientes, Ações preventivas; em Central de
Crescimento: Anúncios, Todas as promoções, Minhas promoções, Comer Fora; em Serviços e
soluções: Produtos iFood, Automatize seu WhatsApp, Insumos e embalagens, Integrações.
Em Configurações: Perfil da loja, Horários, Entrega, Usuários, Automações, Formas de
pagamento, Dados bancários.

**Um dado que o Saipos confirmou e que muda o CRM:** o pedido do iFood chega ao Saipos
com o telefone mascarado (um 0800 com código localizador), não com o telefone do cliente.
Passar pelo Saipos não contorna a regra do iFood. **Quem veio do iFood continua fora da
base de disparo**, e isso não é escolha nossa, é como o dado chega.

---

## Cliente Fiel

**Não deu para apurar nesta rodada: a conta pediu login.**

O Saipos e o iFood vieram logados no Chrome, o Cliente Fiel não
(`sistema.appclientefiel.com.br`, versão 7.1.4 do painel). Fica para a próxima.

**O que precisa ser respondido lá dentro, em ordem de importância:**

1. Existe, na ficha do cliente ou na listagem, o campo de **aceite de promoções** que o
   cliente marca no checkout? Dá para filtrar por ele e exportar com a **data** do
   aceite? Esse campo é o que transforma "o Gabriel disse que pode" em consentimento
   provado, e é o que destrava o pilar de CRM inteiro.
2. Existe qualquer área de **API, integração, webhook ou token** no painel?
3. O robô que cria pedido hoje usa uma API interna do site de pedidos, sem contrato e sem
   suporte. Existe caminho oficial?

---

## O retrato, em uma frase por sistema

- **Saipos:** a API existe, está desligada, e habilitá-la é um pedido ao suporte. É o
  maior ganho e o mais barato.
- **iFood:** o caminho é homologar nosso aplicativo no portal do desenvolvedor e o Hélio
  autorizar por código em cada loja. Prazo é de semanas e não depende de nós.
- **Cliente Fiel:** não apurado por falta de login. É onde está o campo de consentimento,
  que vale mais que todos os outros dados juntos.

## O que não foi feito, de propósito

Nenhum botão de ativar, contratar, salvar, imprimir ou exportar foi clicado. Nenhum
arquivo foi baixado. A caixa de impressão do Saipos foi contornada por URL, não
dispensada, até o Gabriel confirmar que aquela máquina não imprime na cozinha.
