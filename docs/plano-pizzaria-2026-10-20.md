# Plano — Le Tre Farine Pizzaria como primeiro cliente

20/10/2026. Tudo aqui foi medido no banco, no código ou nas contas reais. Onde não foi,
está escrito que não foi.

A pergunta do Gabriel era: fazer a Pizzaria sozinha virar cliente completo, com dado
real, meta, plano de ação, CRM e atendimento no painel; depois somar Jerry's e Pastas.

---

## A resposta curta

**Dá para fazer só a Pizzaria sem tocar no banco.** `marca_id` já existe em venda_dia,
ficha_tecnica, meta_dia_semana, limites_alerta, plano_acao, producao_dia, comanda_dia,
acao_sugerida, anuncio_dia, campanhas, midia_alcance, whatsapp_dia, sniper_lotes, orders
e consents. O que falta é o filtro **atravessar** as telas: hoje quatro consultas ignoram
a marca e leem o tenant inteiro.

**A maior parte do que falta é arquivo, não código.** Somando os quatro levantamentos,
menos de um terço dos itens é "o dev resolve sozinho". Os quatro blocos que o Gabriel
mais quer ver cheios (iFood detalhado, CRM, WhatsApp, Plano de ação) estão quase todos
esperando dado de fora. Um plano que prometa tela cheia em duas semanas estaria mentindo.
O que cabe em duas semanas é uma tela **honesta** da Pizzaria.

---

## O que mudou hoje, olhando as contas reais

Três descobertas no Chrome que melhoram o plano:

**1. O Saipos tem "API de Dados" e está desligada.** Aba própria em Canais de venda e
Integrações, dizendo "Nenhum acesso configurado". Existe como produto, não é
autoatendimento: é pedir ao suporte para habilitar. Isso mata o robô de navegador e
resolve o problema mais grave do painel hoje, que é estar 20 dias atrás da realidade
porque a carga depende de alguém exportar CSV à mão.

**2. O Cliente Fiel implementa OpenDelivery.** Em Configurações › Parâmetros de
Integração › OpenDelivery. O texto da tela diz, com todas as letras: *"Você pode manter
mais de um parceiro conectado ao mesmo tempo — cada um recebe os mesmos pedidos, de forma
independente."* Ou seja: dá para a nossa plataforma receber os **mesmos** pedidos, por um
padrão aberto e documentado, sem desligar o Saipos e sem depender da API interna não
suportada que o robô usa hoje. A loja já expõe nome, CNPJ, URL base e App ID na tela.
Os parceiros conectáveis hoje aparecem como lista fixa (SisChefe, Teste PDV), então falta
descobrir como nos tornarmos um parceiro conectável.

**3. O iFood tem "Ativar integração por código".** Em Serviços e soluções › Integrações.
É a ponta visível do fluxo que a pesquisa já tinha mapeado: nosso app é homologado no
portal do desenvolvedor, em nome de um CNPJ com CNAE de tecnologia (a Tapaggo tem), e
cada loja autoriza por aqui.

Duas observações de operação, de brinde: a integração do **Saipos no iFood está com
"atualização pendente"**, e há dois apps ativos na loja, **Avalyo AI** e **Eneway**, que
vale conferir se foram contratados de propósito.

---

## O que está errado no painel hoje, e é culpa nossa

Nada disto depende do Hélio. Medido:

- O bloco de taxa efetiva do iFood **afirma** que de cada R$ 100 vendidos sobram R$ 100 e
  que o iFood ficou com 0,0%. O fechamento de agosto mede 34,45% na Pizzaria.
- As 13 ações que o dono lê na Comanda e na mensagem do WhatsApp têm origem EXEMPLO e
  aparecem **sem nenhum selo**. Ele está lendo recomendação fabricada como se fosse o
  método.
- A tela de Canal próprio **se declara REAL** enquanto mostra investimento R$ 0 e ROAS
  0,0x. A tela que mais engana é a única sem aviso.
- Há **R$ 15.536,85 de investimento e 648 pedidos atribuídos da Pizzaria gravados no
  banco** sendo descartados por uma linha de código: `if (!a.criativo) continue`, e
  `criativo_id` é nulo em 27 de 27 linhas. Não é dado faltando, é dado presente sendo
  jogado fora em silêncio.

---

## As fases

Cada uma com entrega visível. Nenhuma fase longa sem nada para ver.

| # | Fase | Duração | Dono | Depende de |
|---|---|---|---|---|
| 0 | Parar de afirmar o que não foi medido | 2 a 3 dias | dev | nada |
| 1 | O filtro de marca atravessar as seis telas | 3 a 5 dias | dev | fase 0 |
| 2 | Acender o tráfego pago que já está no banco | 2 a 3 dias | dev | fase 1 |
| 3 | Os cinco números do Hélio | 1 semana de ida e volta | Hélio | fase 1 |
| 3b | **Pedir a API de Dados do Saipos** | prazo deles | Hélio | nada |
| 4 | Mídia diária pela API do Meta | 1 semana | dev | fase 2 |
| 5 | CRM honesto, sem disparar nada | 1 a 2 semanas | dev | decisão escrita |
| 6 | Pilar 4 sem guardar conversa | 2 a 3 semanas | dev | fase 5 |
| 7 | iFood detalhado, ou a decisão de esconder | 2 semanas | Hélio | fase 3 |
| 8 | As três marcas juntas | 1 a 2 semanas | ambos | fases 3 e 6 |

A fase 3b é nova, entrou hoje, e é a de melhor retorno por esforço do plano inteiro:
custa uma mensagem ao suporte do Saipos e, se sair, torna a fase 3 automática e resolve o
atraso crônico do painel.

**Critério de pronto da fase 0:** abrir a tela com o filtro no Jerry's, que tem zero
linhas de venda, e nenhum pilar aparecer verde, nenhuma frase afirmar número, e a Comanda
não dizer "nenhum alerta: dia dentro do plano". Hoje ela diz.

**Critério de pronto da fase 1:** com o filtro na Pizzaria, 2 canais e não 5, 15 campanhas
e não 20, 13 fichas e não 23, e nenhuma linha do Jerry's em nenhuma tela.

---

## O que o Hélio precisa dar

Em ordem de retorno:

1. **Os 7 valores de meta por dia da semana, da Pizzaria.** Destrava de uma vez a barra da
   Comanda, o calendário de Métricas, a coluna de meta, a linha do gráfico, o card de dias
   batidos e a linha de meta da mensagem do WhatsApp. **Cuidado medido:** a régua que ele
   usa hoje é do grupo com o Jerry's junto (sexta R$ 6.189, sábado R$ 7.027, domingo
   R$ 7.073). A Pizzaria sozinha em julho fez sexta R$ 4.063, sábado R$ 4.366, domingo
   R$ 3.997. Se a meta da Pizzaria for a régua do grupo, ela nasce impossível.
2. **Alíquota efetiva de imposto.** É o único insumo da margem que não existe em nenhuma
   fonte dele. Cada ponto percentual tira um ponto de margem.
3. **Confirmar o custo por pedido.** Aqui é confirmação, não coleta: o `margem.py` dele já
   registra R$ 8,50 de entrega, informado por ele em 28/08. Isso sozinho derruba a margem
   da Pizzaria em cerca de 7,8 pontos.
4. **Pedir a API de Dados ao suporte do Saipos.**
5. **CSV diário de outubro**, enquanto a API não sai.
6. **Decisão escrita sobre a base legada**: os 2.092 contatos não têm registro de
   consentimento no banco. O Gabriel informou que todos aceitaram no checkout do Cliente
   Fiel. Falta o export com a data do aceite para virar prova.

---

## WhatsApp: não migrar agora

Medido: o WhatsApp do restaurante **não passa pelo Kapso**. A Le Tre atende cliente final
direto na Cloud API da Meta, chamada de dentro do n8n, em seis fluxos ativos. O Jerry's
ainda atende por WAHA, que não é oficial. Busca por "kapso" no repositório inteiro: zero
ocorrências.

Então "o sistema que eu uso hoje" é o do Gabriel, não o do restaurante. Adotar Kapso para
a Le Tre seria uma **migração de provedor no meio da construção do primeiro cliente**.

O Kapso é bom e resolve coisas que hoje não existem: campanha de template por API com
métrica por destinatário, webhook de inbound com assinatura e chave de idempotência, e
**estados de entrega por webhook**, que é justamente o que falta hoje. O disparo atual só
sabe que a Meta aceitou, nunca que chegou ou foi lido, e reexecutar o fluxo remanda para a
mesma pessoa.

**Recomendação:** construir a nossa camada de recepção num formato que aceite os dois. Os
payloads são quase idênticos, o próprio Kapso diz que código escrito para a Meta funciona
sem mudança. Isso adia a decisão para depois do primeiro cliente estar de pé, que é
quando ela fica barata.

Detalhe que importa e precisa ser checado antes: o Cliente Fiel também tem uma integração
**"WhatsApp API Oficial"** na mesma tela de Parâmetros de Integração. Um número só pode
estar registrado numa plataforma por vez.

---

## O que não fazer agora

- Não migrar o WhatsApp para o Kapso antes da Pizzaria estar de pé.
- Não adicionar Jerry's e Pastas antes da Pizzaria fechada. Hoje o Jerry's é o pior
  arranjo possível: 10 fichas e 1.612 unidades em venda_prato, que entram no mapa de
  cardápio, e zero linhas de venda. Ele pesa onde não devia e some onde devia pesar.
- Não prometer os blocos detalhados do iFood sem resolver se a coleta será semanal e
  manual ou se os blocos saem da tela.
- Não disparar nenhuma mensagem de marketing enquanto o consentimento não estiver
  registrado. A tela deve mostrar "0 podem receber" e dizer por quê.

---

## Uma coisa para escrever na tela, não esconder

"Só a Pizzaria" nos pilares 3 e 4 vai significar Pizzaria mais Pastas. A origem não
separa: o campo de marca na fila do sniper só tem "letre" e "jerrys", a chave da conversa
só distingue letre de jerrys, e o canal do Cliente Fiel da Le Tre cobre as duas marcas,
estando hoje atribuído inteiro à Pizzaria. São R$ 76.327,98 e 699 pedidos, no canal de
maior margem. Melhor escrever isso na tela do que fingir precisão que a fonte não tem.
