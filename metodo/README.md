# metodo/

O método do Hélio, em arquivo. A plataforma lê daqui; nada aqui é código.

## Por que esta pasta existe

Porque conhecimento que mora em conversa não sobrevive a seis semanas. No pacote de
passagem de 18/10 havia documento contradizendo script, nove agendamentos apontando para
arquivos que não existiam e um registro de decisões desatualizado. Não foi desleixo: foi
o custo de o método viver em três lugares ao mesmo tempo. Aqui ele vive em um.

## Quem escreve onde

| Quem | Manda em | Escreve em |
|---|---|---|
| Hélio | método: régua, meta, oferta, cardápio, disparo, vendedor | `metodo/` |
| Gabriel | plataforma: banco, importador, telas, integrações | `painel/`, `db/`, `worker/`, `docs/` |

## Como começar, uma vez só

**Gabriel faz:** adiciona o Hélio como colaborador no repositório e cria a branch:

```bash
git checkout -b metodo && git push -u origin metodo
```

**Hélio faz, na máquina dele:**

```bash
git clone https://github.com/gabrielloreno10-create/alavanca.git ~/alavanca
cd ~/alavanca && git checkout metodo
```

## O dia a dia

```bash
cd ~/alavanca && git checkout metodo && git pull && claude
```

Cole a primeira mensagem de `PROMPT-TERMINAL.md`. Trabalhe. No fim:

```bash
git add metodo/ && git commit -m "o que mudou" && git push origin metodo
```

O Gabriel junta na `main` quando revisar.

## O que tem aqui

| Arquivo ou pasta | Para quê |
|---|---|
| `CLAUDE.md` | as regras que valem para qualquer sessão de IA nesta pasta |
| `PROMPT-TERMINAL.md` | o texto que o Hélio cola ao abrir uma sessão |
| `DECISOES.md` | o registro, append-only, de toda decisão de método |
| `guardrails/` | a régua da mídia paga: ROAS de equilíbrio, CPA teto, janela, teto diário |
| `metas/` | meta de faturamento por dia da semana, por marca, com vigência |
| `ofertas/` | as ofertas da semana, com preço, margem e período |
| `disparo/` | a régua do CRM: teto por noite, janela, intervalo, segmentos |
| `vendedor/` | o comportamento do atendente de IA: o que pode e o que não pode oferecer |

## As três regras que não mudam

1. **Todo número tem fonte e período.** Sem isso, `[CONFIRMAR]`.
2. **Decisão não se apaga.** Mudou, vira entrada nova em `DECISOES.md` citando a antiga.
3. **Método vira configuração, nunca código.** Regra que só existe dentro de um fluxo do
   n8n não é método: é gambiarra com o nome de quem a inventou.
