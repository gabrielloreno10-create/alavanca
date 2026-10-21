# metodo/ — regras para qualquer sessão de IA que trabalhe aqui

Esta pasta é do **Hélio**. É onde mora o método: as réguas, as metas, as ofertas, as
regras de disparo e o comportamento do vendedor de IA. A plataforma lê daqui.

Se você é a IA do Hélio trabalhando nesta pasta, estas regras valem para você.

## A divisão, e por que ela existe

| Quem | Manda em | Onde escreve |
|---|---|---|
| **Hélio** | o método: régua, meta, oferta, cardápio, regra de disparo, prompt do vendedor | **só** `metodo/` |
| **Gabriel** | a plataforma: banco, importador, telas, integrações | `painel/`, `db/`, `worker/`, `docs/` |

A razão não é hierarquia, é segurança. Enquanto cada um escreve num lugar, ninguém
sobrescreve o outro e dá para voltar atrás em qualquer mudança. E tem uma razão de
produto por trás: **tudo que o Hélio decide tem que virar configuração, nunca código.**
Regra que só existe dentro de um fluxo do n8n não é método, é gambiarra com o nome dele.
É essa disciplina que vai permitir ligar o segundo restaurante sem refazer tudo.

## O que você NÃO faz nesta sessão

- Não edita nada fora de `metodo/`. Nem para "só corrigir rapidinho".
- Não mexe em `db/migrations/`. Migration aplicada não se edita, nunca.
- Não roda deploy, não reinicia serviço, não mexe em n8n, Meta, iFood ou Cliente Fiel.
- Não escreve senha, token, chave ou telefone de cliente em arquivo nenhum.
- Não apaga histórico: decisão que mudou vira entrada NOVA em `DECISOES.md`, com a data e
  o motivo. A antiga fica.

## Como escrever um arquivo de método

Todo arquivo tem duas partes. Em cima, um bloco `yaml` com os valores que o sistema lê.
Embaixo, o texto explicando por quê, que é para humano.

```markdown
---
marca: le-tre-farine-pizzaria
vigente_desde: 2026-10-20
fonte: medição no Saipos, julho/2026
---

# Meta por dia da semana

Por que esses números e não outros: ...
```

Regra de ouro do número: **todo valor tem fonte e data.** Se você não sabe de onde veio,
escreva `[CONFIRMAR]` em vez de chutar. Um `[CONFIRMAR]` honesto custa uma pergunta; um
número chutado custa uma decisão errada do dono.

## O fluxo de trabalho

1. Trabalhe na branch `metodo`, nunca direto na `main`.
2. Terminou uma mudança, registre em `DECISOES.md` e faça commit.
3. `git push origin metodo`. O Gabriel junta na `main`.
4. Antes de começar, sempre: `git pull`.

Se algo aqui conflitar com o que você acha certo, escreva a divergência em `DECISOES.md`
em vez de decidir sozinho. Divergência registrada vira conversa; divergência silenciosa
vira retrabalho.
