# DESIGN.md: sistema visual da Plataforma Alavanca

Toda tela nova segue este arquivo. Se uma regra precisar mudar, mude aqui primeiro.

## Conceito

A cozinha profissional. O dono de restaurante vive de comandas, da praça e do passe. A plataforma fala essa língua: **limpa como uma bancada de inox, direta como uma comanda.**

## Cores

Tokens em `src/app/globals.css` (CSS variables + `@theme` do Tailwind). Nunca escreva hex solto num componente: use a classe do token.

| Token | Hex | Classe | Uso |
|---|---|---|---|
| bancada | `#F2F3EF` | `bg-bancada` | fundo da página |
| papel | `#FFFFFF` | `bg-papel` | painéis, comanda |
| grafite | `#18222B` | `text-grafite` | texto principal |
| grafite-2 | `#5B6670` | `text-grafite-2` | texto secundário, rótulos, eixos |
| comanda (azul) | `#2B4ACB` | `text-comanda` / `bg-comanda` | ações, links, item ativo do menu, **a série principal dos gráficos** |
| comanda-claro | `#E9EDFB` | `bg-comanda-claro` | fundo do item ativo do menu |
| manjericão | `#2F7D57` | `text-manjericao` | bom: meta batida, margem saudável |
| açafrão | `#C98A12` | `text-acafrao` | atenção (ícone e borda) |
| açafrão-texto | `#7A5208` | `text-acafrao-texto` | texto sobre fundo açafrão (o açafrão puro não passa AA como texto) |
| açafrão-fundo | `#FBF3E1` | `bg-acafrao-fundo` | faixa de "dados de exemplo" |
| tomate | `#C93B2B` | `text-tomate` | alerta: **só para problema real** |
| linha | `#DADDD6` | `border-linha` | bordas e divisórias |
| cinza-gráfico | `#A3AAA1` | `--cinza-grafico` | séries secundárias, linha de meta |

**Regras de cor**
- Gráfico: tudo em cinza, com **uma** série em azul comanda (a que importa).
- Verde, amarelo e vermelho só quando significam bom, atenção e problema. Nunca como "cor da série 4".
- Situação sempre com **ícone + palavra** (componente `Sinal`): a cor nunca aparece sozinha.
- Variação (+8%, −2 p.p.) vai em grafite com seta. Subir nem sempre é bom (CMV, % iFood), então a variação não ganha cor.

## Tipografia

- Títulos e números grandes: **Bricolage Grotesque**, peso 600 (`font-display font-semibold`).
- Texto e interface: **Instrument Sans** (`font-sans`, padrão do body).
- Números sempre com algarismos tabulares (`tabular-nums` já no body; classe `num` para reforçar).
- Escala: 32 (`text-3xl`) · 24 (`text-2xl`) · 18 (`text-lg`) · 15 (`text-base`) · 13 (`text-sm`). Nada fora dela.
- Nada de rótulo em CAIXA ALTA. Nada de palavra solta pintada de cor dentro de título.

## Forma

- Cantos: 10px nos painéis (`rounded-painel`), 6px em botões e etiquetas (`rounded-botao`).
- Sem sombra pesada: separação por borda fina `border-linha`.
- Nem tudo é card igual. A hierarquia vem do tamanho e da posição: o número principal é grande, o rótulo é pequeno e cinza.

## Movimento

Quase nenhum. Só transições que respondem a uma ação (abrir, expandir, salvar, hover). Nada anima sozinho. Gráficos sem animação de entrada. `prefers-reduced-motion` zera as transições (`globals.css`).

## O elemento memorável: a Comanda do dia

O resumo do dia aparece como uma comanda de cozinha (`src/components/Comanda.tsx`): papel branco, borda de cima e de baixo serrilhada (máscara CSS `.comanda` em `globals.css`), número da comanda, horário de emissão, linhas com pontilhado entre rótulo e valor, separadores tracejados.

**É o único lugar com esse tratamento.** Não use serrilhado, pontilhado ou cara de papel em nenhuma outra tela. O resto da interface fica quieto.

## Dados e honestidade

**Zero é uma medição; ausência não é zero.** São três origens, e duas delas precisam aparecer na tela (`Origem` em `src/lib/types.ts`):

| Origem | O que é | Como aparece |
|---|---|---|
| `REAL` | há linha, e é do cliente | sem selo; é o caso normal |
| `EXEMPLO` | HÁ número, mas nós o semeamos | selo **açafrão sólido** `Exemplo` (`MarcaExemplo`) |
| `SEM_DADO` | NÃO há linha: não existe número | selo **cinza tracejado** `não medido` (`MarcaSemDado`) |

Regras da ausência, nesta ordem:

1. **Nenhuma cor nova.** Açafrão continua sendo só "exemplo". A ausência não ganha cor: ganha **forma** — borda tracejada em `border-linha`, texto em `grafite-2`, ícone `CircleDashed`. É o mesmo tracejado que o calendário de Métricas já usava para o dia sem registro.
2. **Nunca um número.** No lugar do valor vai `NAO_MEDIDO` (`"não medido"`, de `src/lib/formato.ts`), via `ouNaoMedido(v, formatar)`. Se você está prestes a escrever "R$ 0,00", "0%", "0,0x" ou "nota 0,0", pergunte se é medição ou ausência. Nada de barra, largura, gráfico ou projeção derivados de um número que não existe.
3. **Nunca um número disfarçado de texto.** O `Indicador` tira o `font-display` e o tamanho de display quando o valor é `NAO_MEDIDO`: ausência não pode ser lida de relance como se fosse valor.
4. **Sempre o motivo.** Toda ausência vem com uma frase curta dizendo POR QUE não há número ("não há linha de operação do iFood na fonte"), no `detalhe` do indicador ou num bloco `SemDado`. Traço solto não explica nada.
5. **Semáforo nenhum.** `situacao` é `null` sempre que o insumo não foi medido — a condição é `meta === null || valor === null ? null : …`. E `<Sinal situacao={null} semDado />` diz **"Não medido"**, não "Sem meta": "sem meta" afirma que existe número e falta só a régua.
6. **Verde só significa bom.** Nada colorido de manjericão por falta de dado, por falta de meta ou por estado ligado/desligado (campanha "Ativa" é azul comanda, não verde).

A faixa do topo (`FaixaExemplo`) só fica açafrão quando existe mesmo bloco `EXEMPLO`. `REAL` + `SEM_DADO` também é `MISTO`, mas não tem exemplo nenhum: a faixa fica neutra e tracejada, e o selo de cada painel diz qual bloco é qual.

- Dado com `"origem": "EXEMPLO"` faz aparecer a faixa açafrão (`FaixaExemplo`): "Dados de exemplo. Os números reais da Le Tre Farine entram na próxima etapa."
- Telas nunca leem JSON direto: só `src/lib/dados.ts`. Cálculos só em `src/lib/calculos.ts`, com teste.
- Moeda com `Intl.NumberFormat("pt-BR")` (`src/lib/formato.ts`). Datas no formato brasileiro.

## Gráficos

- Recharts. Linha de 2px, sem pontos (ponto só no hover), grade só horizontal e clara.
- Tooltip com crosshair em todo gráfico de linha.
- Todo gráfico tem: título, legenda (2 ou mais séries), uma frase de resumo em texto e "Ver os números em tabela".

## Qualidade mínima

- Desenhar a partir de **375px**. Sem rolagem lateral. Barra inferior + "Mais" no celular; menu lateral a partir de 1024px.
- Alvos de toque com no mínimo 44px de altura no celular.
- Foco de teclado visível (contorno azul de 2px, `:focus-visible`).
- Contraste AA em todo texto.
- Idioma pt-BR em tudo, linguagem de dono de restaurante, botão dizendo exatamente o que faz.
