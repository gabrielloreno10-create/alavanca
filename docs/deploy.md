# Deploy — do zero ao painel no ar

Escrito em 20/10/2026. Caminho completo, em ordem, para colocar o painel num
endereço público com o banco na nuvem.

**Alvo:** painel na **Vercel** (plano gratuito), código num **repositório GitHub
privado da Tapaggo**, banco num **Postgres 17 gerenciado** com plano gratuito —
a preferência é o **Neon**, porque é o que a Vercel integra melhor, mas nada
aqui depende dele: qualquer Postgres 17 gerenciado serve.

**O banco de desenvolvimento (`db/dev`) não muda.** Ele continua existindo, na
sua máquina, com os mesmos comandos de sempre. Nada deste documento mexe nele.

### Como ler

Cada passo é marcado com quem faz:

| marca | significa |
|---|---|
| **[você]** | precisa de login, navegador, conta ou decisão sua. Eu não faço, nem poderia |
| **[comando]** | é só rodar na sua máquina, na ordem |

Os comandos estão em **PowerShell**, que é o seu terminal. Onde a diferença
importa, a versão `bash` vem logo abaixo.

### O que já tem que estar na máquina

Conferido hoje, nesta máquina: Node 24.21.0, npm 11.19.0, Python 3.14.7,
git 2.55.0. **Não** há `psql`, **não** há Docker e **não** há `gh` — e nada
neste guia precisa deles.

---

## A pedra que havia no caminho, e como foi tirada

Ficou aqui porque explica a migration `016` e porque a `001` tem um comentario
grande no meio.

**O problema.** A `001` mandava, em `alter role`, que a role da aplicacao nao
fosse superusuario e nao furasse a RLS. So que mexer nesses dois atributos, ainda
que seja para NEGAR, exige ser superusuario do cluster, e em banco gerenciado
(Neon, Supabase, RDS) nao existe superusuario para o cliente. Como a `001` roda
inteira numa transacao, ela falhava com `permission denied to alter role`, nada
era criado e as outras quinze caiam atras com "schema alavanca does not exist".

**O que foi feito em 20/10/2026.** A `001` deixou de MANDAR e a `016` passou a
CONFERIR. Duas mudancas:

- Na `001`, a linha virou `alter role alavanca_app nocreatedb nocreaterole
  inherit;`. As palavras `nosuperuser` e `nobypassrls` sairam. Nao se perde
  garantia: uma role criada por quem nao e superusuario ja nasce sem os dois.
- A `016` levanta excecao se `alavanca_app` aparecer com `SUPERUSER`,
  `BYPASSRLS`, `CREATEROLE` ou `CREATEDB`. Isso vale mais do que o `alter`
  original, porque confere toda vez que roda, inclusive se alguem promover a
  role depois, por engano.

Editar a `001` foi aceitavel porque ela so existia em clusters descartaveis desta
maquina. Nao havia banco permanente com ela. Daqui para a frente a regra volta a
valer: **migration aplicada nao se edita.**

**A prova.** Num cluster Postgres 17 novo, com um dono criado com `CREATEROLE`,
`CREATEDB`, `BYPASSRLS` e `REPLICATION` mas **sem** `SUPERUSER` (os poderes que
um provedor entrega), aplicando tudo como esse dono e sem nenhum superusuario
encostar:

| medido | resultado |
|---|---|
| migrations aplicadas | **16 de 16** |
| objetos criados | 53 tabelas, 10 views |
| `alavanca_app` no fim | `rolsuper=false`, `rolbypassrls=false`, `rolcreaterole=false`, `rolcreatedb=false` |
| `alavanca_app` sem `app.tenant_id` | 0 tenants (fail-closed) |

O ensaio tambem mostrou um detalhe que engana: **role e objeto do cluster, nao do
banco.** Uma primeira tentativa de prova rodou no mesmo cluster de
desenvolvimento, onde `alavanca_app` ja existia criada pelo superusuario; o dono
de teste nao tinha poder sobre ela e o ensaio acusou falha que nao era da
migration. Qualquer ensaio desse tipo precisa de cluster proprio.

---

## Mapa

```
1-2    conferir o que vai subir
3      a decisão da 001
4-7    repositório privado no GitHub
8-10   banco gerenciado criado, as DUAS strings na mão
11-13  migrations aplicadas na nuvem + senha da role de aplicação
14-16  dados reais do Le Tre importados para a nuvem
17     primeiro usuário
18-21  projeto na Vercel, variáveis, deploy
22-25  conferência final
```

---

## Parte 1 — o que vai subir

### 1. [comando] Veja o que está commitado e o que não está

```powershell
cd C:\Users\gabri\projetos\alavanca
git log --oneline -1
git status --short
git ls-files | Measure-Object -Line
```

Em 20/10 havia um commit só (`9e781a9 Base da plataforma Alavanca: banco,
importador e painel`, 150 arquivos) e outras frentes ainda mexendo no código —
o número vai ser maior quando você fizer isto. O que importa: **o que aparecer
em `git status` ainda não está no commit, e o que não está no commit não vai
para a Vercel.** Commite antes de empurrar.

### 2. [comando] Confirme que segredo nenhum entra no commit

```powershell
git ls-files | Select-String -Pattern "\.env$|^referencia/"
git check-ignore -v painel\.env.local worker\.env db\dev\.env.local
```

O primeiro comando tem que devolver **nada**. O segundo tem que dizer, para cada
arquivo, qual regra do `.gitignore` o cobre. Os três `.env` que existem hoje na
sua máquina (`painel/.env.local`, `worker/.env`, `db/dev/.env.local`) têm senha
do ambiente local e ficam de fora.

**Atenção ao que vai junto:** `dados-fonte/` **está** no commit. São o
faturamento diário, as fichas técnicas e o fechamento do iFood do Le Tre — dado
real do cliente, sem nome nem telefone de ninguém, mas dado do negócio dele. É
por isso que o repositório é **privado**, e não "privado por enquanto".

### 3. [comando] Confirme que a migration 016 está presente

A `016` é a guarda da role de aplicação: ela recusa o deploy se `alavanca_app`
aparecer com poder de furar o isolamento entre restaurantes. Sem ela, o banco
sobe sem essa conferência.

```bash
ls db/migrations/016_guarda_role_app.sql
```

Tem que listar o arquivo. Se não listar, pare: alguém removeu a guarda.

---

## Parte 2 — repositório privado no GitHub

### 4. [você] Crie o repositório vazio

Em <https://github.com/new>, na conta/organização da Tapaggo:

- nome: `alavanca`
- visibilidade: **Private**
- **não** marque "Add a README", "Add .gitignore" nem licença — o repositório
  precisa nascer vazio, senão o primeiro push é recusado por histórico divergente

### 5. [comando] Aponte o repositório local para ele e empurre

O repositório local está no branch `master` e não tem nenhum remote. O GitHub
usa `main` como padrão; renomeie antes para não ficar com dois nomes para a
mesma coisa:

```powershell
git branch -M main
git remote add origin https://github.com/TAPAGGO/alavanca.git
git push -u origin main
```

bash: idêntico.

Troque `TAPAGGO` pelo nome real da conta/organização. O push abre a janela de
login do GitHub (ou usa o Credential Manager do Windows, se você já entrou
alguma vez) — essa parte é **[você]**.

### 6. [comando] Confirme o que foi parar lá

```powershell
git ls-remote --heads origin
git log origin/main --oneline -1
```

### 7. [você] Olhe o repositório no navegador

Confira três coisas na página: o cadeado de **Private**; que **não** existe a
pasta `referencia/`; que **não** existe nenhum `.env`. Se qualquer uma falhar,
pare e resolva antes de continuar — segredo empurrado não se desempurra, se
rotaciona.

---

## Parte 3 — banco gerenciado

### 8. [você] Crie o projeto no provedor

No Neon (<https://neon.com>), "New project":

- **Postgres 17**
- **região São Paulo (`sa-east-1`)** — o `painel/vercel.json` fixa a função em
  `gru1`, que é São Paulo. Banco e função na mesma cidade é a diferença entre
  ~5 ms e ~200 ms por ida e volta, e uma tela do painel faz várias
- **nome do banco: `alavanca`** (se o provedor não deixar escolher, pode ser
  `neondb`; só não misture — as duas strings têm que apontar para o mesmo banco)

Qualquer outro Postgres 17 gerenciado serve. O que ele **precisa** oferecer:
uma conexão de dono com `CREATEROLE`, e uma string "pooled". O que ele **não**
precisa: nada específico do Neon.

### 9. [você] Copie as DUAS strings de conexão

Provedor gerenciado entrega duas, e elas servem para coisas diferentes:

| string | como reconhecer | para quê |
|---|---|---|
| **direta** | host sem `-pooler` | migrations, importação, `criar-admin`. Tudo que roda da sua máquina |
| **pooled** | host com `-pooler` (PgBouncer em modo *transaction*) | **só** o painel na Vercel |

No Neon, as duas aparecem no "Connection Details" do projeto; o seletor
"Pooled connection" troca uma pela outra. Guarde as duas num lugar seguro —
gerenciador de senhas, não bloco de notas, e nunca num arquivo do repositório.

**Corte o `channel_binding=require` da string.** O Neon entrega algo como
`...?sslmode=require&channel_binding=require`. Guarde **sem** esse pedaço, nas
duas. O porquê está em "o que pode dar errado", item 6 — é um erro medido, não
uma precaução.

### 10. [comando] Escreva as conexões em `db/.env`

O `db/.env` é coberto pelo `.gitignore` e é de onde o aplicador lê o que faltar
no ambiente. Prefira o arquivo à linha de comando: senha digitada no PowerShell
fica salva no histórico do PSReadLine, em disco.

```powershell
Copy-Item db\.env.example db\.env
node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"
notepad db\.env
```

bash: `cp db/.env.example db/.env`.

O `node -e` imprime uma senha aleatória de 32 caracteres: é a senha da role
`alavanca_app`, que ainda não existe. Copie-a. No `db/.env`, preencha **três**
linhas e deixe as outras como estão:

```
ALAVANCA_APP_PASSWORD=<a senha que o node acabou de imprimir>
ALAVANCA_ADMIN_DATABASE_URL=<a string DIRETA, do dono, com ?sslmode=require>
DATABASE_URL=postgres://alavanca_app:<a senha>@<host direto>:5432/alavanca?sslmode=require
```

- `ALAVANCA_ADMIN_DATABASE_URL` é a do **dono**: é com ela que as migrations
  rodam. Direta, nunca a pooled.
- `DATABASE_URL` aqui é a da **aplicação**, também **direta**: quem vai usá-la é
  o worker, que roda da sua máquina. A pooled é só para a Vercel.
- Se a senha tiver `@`, `:`, `/` ou `#`, ela precisa vir *percent-encoded*
  dentro da URL. A senha gerada pelo comando acima é `base64url` e não tem
  nenhum desses caracteres, de propósito.

---

## Parte 4 — migrations na nuvem

### 11. [comando] Instale a dependência do aplicador e olhe antes de escrever

```powershell
cd db
npm install
node aplicar.mjs --status
node aplicar.mjs --dry-run
```

bash: idêntico (`cd db`).

`--status` e `--dry-run` **não escrevem nada**. O esperado num banco recém
criado é "a tabela alavanca.migrations ainda não existe" e as 15 listadas como
pendentes. O aplicador imprime a conexão que vai usar (usuário, host, banco,
estado do TLS) e **não** imprime senha nenhuma — confira que o host é o direto,
não o do pooler. Se for o pooler, ele avisa.

Detalhes do `aplicar.mjs` estão no [`db/README.md`](../db/README.md), seção 2.

### 12. [comando] Aplique

```powershell
node aplicar.mjs
```

É aqui que a pedra do passo 3 aparece, se ela não tiver sido resolvida:

```
[aplicar] ERRO: 001_base.sql nao foi aplicada.
       permission denied to alter role
       codigo 42501
```

Com a decisão tomada, o esperado é `15 migrations aplicadas, 53 tabelas no
schema alavanca` e a linha `senha da role alavanca_app definida (valor não
impresso)`.

O aplicador confere o SHA-256 de **todas** antes de escrever qualquer coisa, e
aborta sem aplicar nada se um arquivo já aplicado tiver mudado. Rodar de novo é
seguro: ele pula o que já está lá.

### 13. [comando] Confirme o estado do banco

```powershell
node aplicar.mjs --status
cd ..
```

Esperado: `15 aplicada(s), 0 pendente(s), 0 alterada(s)`.

---

## Parte 5 — dados reais do Le Tre

### 14. [comando] Aponte o worker para a nuvem

**Cuidado aqui.** O worker lê `worker/.env` **primeiro** e só depois `db/.env`.
O `worker/.env` existe hoje nesta máquina e aponta para `127.0.0.1:5433`. Se
você não mexer nele, o importador vai gravar no banco **local** enquanto você
acha que está populando a nuvem — e não vai dar erro nenhum.

Medido: uma variável definida no shell vence as duas (`carregar_env` nunca
sobrescreve o que já está no ambiente). Então o jeito mais seguro, e que não
estraga o seu ambiente local, é definir a variável só nesta janela:

```powershell
$env:DATABASE_URL = (Select-String -Path db\.env -Pattern '^DATABASE_URL=').Line.Substring(13)
cd worker
python -c "import os, alavanca_db; alavanca_db.carregar_env(); print(os.environ['DATABASE_URL'].split('@')[1])"
```

bash:

```bash
export DATABASE_URL="$(grep '^DATABASE_URL=' db/.env | cut -d= -f2-)"
cd worker
python -c "import os, alavanca_db; alavanca_db.carregar_env(); print(os.environ['DATABASE_URL'].split('@')[1])"
```

O `python -c` imprime **só o host** (nunca a senha). Ele tem que mostrar o host
do provedor. Se mostrar `127.0.0.1:5433`, a variável não pegou: pare e resolva,
porque o passo seguinte escreve.

### 15. [comando] Importe

```powershell
python importar_le_tre.py
```

Esperado: 459 dias de venda (3 lojas × 153 dias), 23 fichas técnicas, o
fechamento de agosto das 5 lojas e 27 linhas de mídia. O importador é
idempotente — rodar de novo não duplica nada.

Não rode o `seed_exemplo.py`. O tenant de demonstração é para desenvolvimento;
na nuvem ele só serviria para alguém confundir número de exemplo com
faturamento.

### 16. [comando] Confira

```powershell
python verificar.py
cd ..
```

Tem que dar **16 de 16** e sair com código 0. Entre as 16 está a conferência de
que a soma do diário bate com o total mensal do Saipos, loja por loja, mês a
mês. Se der menos que 16, o banco da nuvem não está igual ao de casa — descubra
por quê antes de seguir.

---

## Parte 6 — o primeiro usuário

### 17. [comando] Crie a sua conta no painel

Sem este passo o painel abre, pede login e não deixa ninguém entrar: o banco
nasce sem usuário.

Para **ligar** o usuário ao tenant é preciso a conexão do **dono**: a RLS
esconde a tabela `tenants` da role de aplicação, e o script avisa em vez de
fingir que deu certo.

```powershell
cd painel
$env:ALAVANCA_ADMIN_DATABASE_URL = (Select-String -Path ..\db\.env -Pattern '^ALAVANCA_ADMIN_DATABASE_URL=').Line.Substring(28)
$env:ALAVANCA_ADMIN_EMAIL = 'gabriel@tapaggo.com.br'
$env:ALAVANCA_ADMIN_NOME  = 'Gabriel'
$segura = Read-Host "senha do painel (minimo 12 caracteres)" -AsSecureString
$env:ALAVANCA_ADMIN_SENHA = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
npm run criar-admin -- grupo-le-tre
```

bash:

```bash
cd painel
export ALAVANCA_ADMIN_DATABASE_URL="$(grep '^ALAVANCA_ADMIN_DATABASE_URL=' ../db/.env | cut -d= -f2-)"
export ALAVANCA_ADMIN_EMAIL='gabriel@tapaggo.com.br'
export ALAVANCA_ADMIN_NOME='Gabriel'
read -s -p 'senha do painel: ' ALAVANCA_ADMIN_SENHA; export ALAVANCA_ADMIN_SENHA; echo
npm run criar-admin -- grupo-le-tre
```

O `Read-Host -AsSecureString` existe por um motivo: a senha não aparece na tela
nem no histórico do PowerShell. No banco entra só o hash bcrypt; a senha nunca
é escrita em lugar nenhum.

Esperado, duas linhas:

```
usuário gabriel@tapaggo.com.br (<uuid>) gravado.
  ligado a Grupo Le Tre Farine (grupo-le-tre) como platform_admin.
```

Se aparecer `tenant "grupo-le-tre" não encontrado nesta conexão`, você está
conectado com a role de aplicação e não com a do dono — a RLS está fazendo o
trabalho dela. Refaça a primeira variável.

O `npm run criar-admin` roda com `--env-file-if-exists=.env.local`, e o
`painel/.env.local` desta máquina aponta para o banco local. **Medido:**
variável definida no shell vence a do arquivo. As variáveis acima, portanto,
mandam. Mesmo assim, confira a saída: ela diz qual usuário foi gravado.

Feche esta janela do PowerShell quando terminar, para as variáveis morrerem com
ela.

---

## Parte 7 — Vercel

### 18. [você] Crie o projeto

Em <https://vercel.com/new>, importe o repositório `alavanca` (a Vercel pede
autorização ao GitHub na primeira vez — autorize **só** este repositório, não a
organização inteira).

Na tela de configuração, **uma coisa é obrigatória**:

- **Root Directory: `painel`** — o Next.js não está na raiz do repositório. Sem
  isto o build falha dizendo que não achou `package.json` com `next`.

O resto a Vercel acerta sozinha: framework Next.js, build `next build`, install
`npm ci`. O `painel/vercel.json` já fixa a região em `gru1` (São Paulo).

**Não clique em Deploy ainda.** Cadastre as variáveis antes (passo 19): sem
`DATABASE_URL` e `AUTH_SECRET` o painel **recusa subir**, de propósito.

### 19. [você] Cadastre as variáveis de ambiente

Em **Settings → Environment Variables**. Só **duas** são obrigatórias:

| variável | valor | ambientes |
|---|---|---|
| `DATABASE_URL` | a string **pooled**, com usuário `alavanca_app` e a senha do `ALAVANCA_APP_PASSWORD`, terminando em `?sslmode=require` — **sem** `channel_binding` | Production, Preview |
| `AUTH_SECRET` | 32 bytes aleatórios (comando abaixo) | Production, Preview |

A `DATABASE_URL` da Vercel **não** é a mesma do `db/.env`. Monte assim: pegue a
string **pooled** do provedor (host com `-pooler`) e troque o usuário e a senha
pelos da aplicação. Fica no formato:

```
postgres://alavanca_app:<ALAVANCA_APP_PASSWORD>@<host>-pooler.<região>.aws.neon.tech/alavanca?sslmode=require
```

Para gerar o `AUTH_SECRET`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

bash: `openssl rand -base64 32`.

Ele assina o JWT da sessão. Trocar o valor desloga todo mundo. **Não**
reaproveite o de desenvolvimento.

**O que NÃO cadastrar**, e por quê:

| variável | por que não |
|---|---|
| `DATABASE_POOL_MAX`, `DATABASE_PREPARE`, `DATABASE_SSL`, `DATABASE_CONNECT_TIMEOUT`, `DATABASE_IDLE_TIMEOUT`, `ALAVANCA_SERVERLESS` | o painel detecta a Vercel sozinho e já usa pool 1, prepared statement desligado e TLS obrigatório. Deixe em branco; são escape hatches |
| `ALAVANCA_DB_ROLE` | só serve para o banco embarcado de desenvolvimento. Em produção a conexão **já** é da role de aplicação |
| `ALAVANCA_SEED_ADMIN_EMAIL`, `ALAVANCA_SEED_ADMIN_SENHA_HASH` | é o login do modo de semente, que não existe em produção |
| `ALAVANCA_ADMIN_*` | são do script de linha de comando. Credencial de dono do banco não tem o que fazer num servidor web |
| `AUTH_URL` | opcional. Só quando houver domínio próprio, para os redirects do login apontarem para ele |

A lista completa, com o comentário de cada uma, está em
[`painel/.env.example`](../painel/.env.example).

**Sobre "Preview":** se você marcar as variáveis também para Preview, todo
branch que você empurrar vira um painel no ar **lendo e escrevendo o banco de
produção**. Enquanto for só você, tudo bem. Quando entrar mais gente, ou crie um
banco separado para Preview, ou deixe as variáveis só em Production (os previews
passam a falhar na inicialização, que é o comportamento honesto).

### 20. [você] Deploy

Botão **Deploy**. O build leva alguns minutos. Se falhar, o log diz onde: os dois
erros mais prováveis são Root Directory errado (passo 18) e variável faltando
(passo 19) — este último aparece como `AmbienteInvalido: Ambiente de produção
incompleto`, com a lista do que falta.

### 21. [você] Anote o endereço

A Vercel dá um endereço `https://<projeto>.vercel.app`. Domínio próprio é
**Settings → Domains**, e pode ficar para depois.

---

## Parte 8 — conferência final

### 22. [comando] O painel está vivo e o banco responde?

```powershell
curl.exe -s https://SEU-PROJETO.vercel.app/api/saude
```

bash: `curl -s https://SEU-PROJETO.vercel.app/api/saude`

Esperado: `{"ok":true,"banco":"ok","ms":<número>}` com HTTP 200. Essa rota não
pede login e não conta nada sobre o banco além de "respondeu" e "em quanto
tempo". `{"ok":false,"banco":"erro"}` com 503 significa que o painel subiu mas
não fala com o Postgres — vá para "o que pode dar errado", itens 1, 2 e 6.

**O primeiro acesso pode demorar alguns segundos** e até dar 503 na primeira
tentativa: no plano gratuito o banco suspende depois de 5 minutos parado e
precisa acordar. Rode de novo antes de concluir que está quebrado.

### 23. [você] Entre

Abra `https://SEU-PROJETO.vercel.app`, que manda para `/entrar`. Use o e-mail e
a senha do passo 17.

### 24. [você] Veja o Le Tre

Depois do login você cai na raiz, "Todos os restaurantes", com o **Grupo Le Tre
Farine**. O que tem que bater com o que a máquina local mostrava:

- último dia fechado: **30/09**
- o cartão do dia: **R$ 543 em 6 pedidos**
- alerta de participação do iFood em **81%**

Clique no grupo: a tela "Hoje" abre com a comanda e a quebra pelos 5 canais.

### 25. [você] Veja a tela de Lucro

Em `/grupo-le-tre/lucro`. O que tem que aparecer:

- CMV estimado **22,2%**, margem **55,6%** (R$ 5.775)
- margem por canal: Pizzaria iFood 53,2%, Pastas iFood 39,9%, Site 76,7%,
  Jerry's 0% (por falta de venda diária — é esperado, ver "o que não vai")
- os **23 pratos** da engenharia de cardápio, na janela **03/07 a 01/10**

Se a tela de Lucro ficar presa em "Carregando…" para sempre, o problema não é o
banco: é o `cacheComponents`. Ele está desligado no `next.config.ts` por causa
disso mesmo e não deve ser religado sem testar tela a tela.

Se os números aparecerem **diferentes** destes, o painel pode estar no modo de
semente (item 5 abaixo) — mas em produção isso agora derruba a inicialização, em
vez de mentir.

---

## O que pode dar errado

### 1. Limite de conexões: serverless abre conexão demais

Cada invocação de função na Vercel é um processo curto, e pode haver muitas ao
mesmo tempo. Se cada uma abrir um pool de 5, dez instâncias já são 50 conexões —
e o teto de um Postgres gerenciado de plano gratuito é baixo. O erro aparece como
`too many connections for role` ou `remaining connection slots are reserved`,
intermitente e justamente na hora de pico.

**Já está tratado:** `painel/src/lib/db.ts` detecta a Vercel e usa `max: 1` por
instância, com `idle_timeout` de 10s. Quem multiplexa de verdade é o pooler do
provedor. Por isso a `DATABASE_URL` da Vercel tem que ser a **pooled**: com a
direta, o `max: 1` não salva — são conexões reais no Postgres, uma por instância.

**Se acontecer mesmo assim:** confira que a string cadastrada tem `-pooler` no
host. Não aumente `DATABASE_POOL_MAX`.

### 2. Prepared statement com conexão pooled

A string "pooled" é um PgBouncer em modo *transaction*: a conexão com o Postgres
é devolvida ao pool no fim de **cada transação**, e a próxima consulta pode cair
noutra conexão. Statement preparado é um objeto da **sessão** — ele não
sobrevive à troca. O sintoma é `prepared statement "..." does not exist` ou
`already exists`, aleatório, só em produção, só às vezes.

**Já está tratado nas duas pontas:** o painel desliga `prepare` quando detecta
serverless (`DATABASE_PREPARE=0` força, se um dia precisar), e o worker já
conecta com `prepare_threshold=None` desde sempre.

**O que ainda pode te pegar:** apontar o **worker** para a string pooled. Ele
não quebra por prepared statement, mas migration e carga pesada não são trabalho
de pooler. Use a direta, como está no passo 10.

### 3. O banco suspende por inatividade, e o primeiro acesso demora

No plano gratuito do Neon o *scale-to-zero* é **obrigatório**: depois de 5
minutos sem consulta, a computação suspende. A primeira consulta depois disso
acorda o banco e paga a espera.

Consequência prática: o painel que ninguém abre desde ontem leva alguns segundos
para responder, e o `connect_timeout` de 5 segundos do modo serverless pode
estourar antes — a tela dá erro e, na segunda tentativa, funciona. Para uma
demonstração, **abra o painel cinco minutos antes** e deixe uma tela carregar.

Não dá para desligar isso no plano gratuito. Dá para conviver, e dá para
resolver com plano pago. Não resolva com um "ping" a cada minuto: isso queima as
100 horas de computação do mês para manter acordado um banco que ninguém está
usando.

### 4. Migration aplicada à mão, fora do controle

O editor SQL do provedor é uma tentação: colar os arquivos um a um e pronto.
**O problema não é aplicar — é o registro.** A tabela `alavanca.migrations`
guarda versão, nome e SHA-256 de cada arquivo, e é ela que o aplicador consulta.
Se o SQL rodar sem o registro, o aplicador vai tentar aplicar tudo de novo; se o
registro for inserido à mão com um checksum errado, ele vai abortar para sempre
acusando que o arquivo mudou; e se o SQL rodar **adaptado** (como seria o caso
da 001), o banco fica diferente do arquivo e ninguém mais sabe o que tem lá
dentro.

**Regra:** só o `db/aplicar.mjs` escreve em `alavanca.migrations`. Se um dia
precisar mesmo colar à mão, o conserto é inserir a linha com o **SHA-256 do
arquivo como ele está no disco**:

```powershell
Get-FileHash -Algorithm SHA256 db\migrations\016_exemplo.sql
```

e conferir depois com `node aplicar.mjs --status`, que mostra `ok`, `pendente`
ou `ALTERADA` por arquivo. `ALTERADA` nunca é para ficar assim.

### 5. O painel caindo no modo de semente

Sem `DATABASE_URL`, o painel lê os JSON de `painel/src/data/clientes/` em vez do
Postgres. É ótimo para desenvolver e **inaceitável** em produção: seria servir
número de exemplo como se fosse o faturamento do cliente, com as telas inteiras
preenchidas e plausíveis.

**Já está tratado, em duas trancas:** a inicialização do servidor confere o
ambiente (`src/instrumentation.ts`) e **derruba** o processo em produção se
faltar `DATABASE_URL` ou `AUTH_SECRET`, com a lista do que falta; e, se alguém
apagar a variável com o processo no ar, pedir dado lança em vez de cair na
semente.

Na prática isso vira: a Vercel mostra o deploy com erro e o painel não sobe.
É o certo. O que você **não** pode fazer é "resolver" isso cadastrando as
variáveis de semente (`ALAVANCA_SEED_*`) na Vercel.

### 6. `channel_binding` na URL derruba a conexão — medido

O Neon entrega a string com `&channel_binding=require` no fim. O driver que o
painel usa (`postgres`, da porsager) repassa ao **servidor**, como parâmetro de
sessão, todo parâmetro de query que ele não reconhece — e `channel_binding` é
coisa de cliente, não um parâmetro do Postgres.

Medido contra um Postgres 17 de verdade, com o mesmo driver e a mesma versão do
painel:

| URL | resultado |
|---|---|
| limpa | conectou |
| `?channel_binding=require` | **falhou**: `unrecognized configuration parameter "channel_binding"` (SQLSTATE 42704) |
| `?prepare=false` | conectou (`prepare` o driver consome, não repassa) |

Isso acontece **só** no painel. O `db/aplicar.mjs` monta a conexão campo a campo
e ignora o resto da query, e o worker usa libpq (psycopg), que entende
`channel_binding` de verdade. Ou seja: o aplicador funciona com a string
completa e o painel não — exatamente o tipo de diferença que faz perder uma
tarde. **Tire o parâmetro de todas as strings** (passo 9) e não haverá surpresa.

### 7. O worker importando para o banco errado

`worker/.env` existe nesta máquina e aponta para `127.0.0.1:5433`. O
`carregar_env` lê `worker/.env` **antes** de `db/.env`, então o arquivo local
vence o da nuvem — e a importação "funciona", só que no banco errado, sem erro
nenhum. O passo 14 resolve definindo a variável no shell, que vence os dois
(medido). **Sempre confira o host antes de rodar o importador.**

### 8. `criar-admin` com a conexão errada

Com a role de aplicação, `select ... from tenants where slug = $1` devolve zero
linha — a RLS está escondendo. O script **avisa** e não finge:
`tenant "grupo-le-tre" não encontrado nesta conexão`. O usuário até é criado,
mas fica sem acesso a nada. Use a conexão do dono (passo 17).

### 9. Senha com caractere especial na URL

`@`, `:`, `/`, `#` e `?` dentro da senha quebram a URL de conexão se não vierem
*percent-encoded*. O sintoma é bizarro: "host não resolveu" ou "banco não
existe", porque o parser cortou a string no lugar errado. Por isso o passo 10
gera a senha em `base64url`, que só tem letras, números, `-` e `_`.

### 10. Preview escrevendo no banco de produção

Ver passo 19. Um branch empurrado vira um painel no ar com as mesmas variáveis.
Enquanto for só você, é conveniente; com mais gente, é um acidente esperando.

---

## Custo

Números conferidos hoje, 20/10/2026, nas páginas oficiais. **Preço de nuvem
muda**: confira antes de prometer qualquer coisa a alguém.

### Vercel — plano Hobby (gratuito)

| recurso | incluído por mês |
|---|---|
| Fast Data Transfer | 100 GB |
| Fast Origin Transfer | 10 GB |
| requisições de CDN | 1.000.000 |
| invocações de função | 1.000.000 |
| Active CPU | 4 horas de CPU |
| memória provisionada | 360 GB-hora |
| deploys por dia | 100 |
| log de execução | 1 hora de retenção |

Para um painel interno usado por um punhado de pessoas, isso é folgado: o que
consome é CPU de função, e cada tela são algumas consultas.

**Quando passa:** a Vercel **pausa** o recurso e você espera até completar 30
dias para voltar a usar. Não vira cobrança surpresa — vira painel fora do ar.

**O porém que não é técnico:** o plano Hobby é, pelas regras de uso justo da
Vercel, **restrito a uso pessoal e não comercial**. Um painel operado pela
Tapaggo para atender o Le Tre é uso comercial. Ou seja: o Hobby serve para
**provar que funciona**; no dia em que isso virar entrega a cliente, o lugar
certo é o plano **Pro, US$ 20 por usuário/mês**. Isto é uma decisão sua, e é
melhor tomada agora, de olho aberto, do que num e-mail de suspensão.

### Neon — plano Free

| recurso | incluído |
|---|---|
| computação | 100 CU-hora por projeto/mês |
| armazenamento | 1 GB por projeto (20 GB na conta) |
| *scale-to-zero* | sempre ligado: suspende com 5 min parado, **não dá para desligar** |
| egresso público | 5 GB por projeto |
| branches | 10 por projeto |
| janela de histórico | 6 horas |

O banco do Le Tre hoje são 53 tabelas com algumas centenas de linhas — 1 GB é
muito mais do que o necessário por um bom tempo. O que pode apertar é a
computação, e só se o banco ficar acordado à toa.

**Quando passa:** acabar as CU-hora ou o egresso **suspende a computação até o
próximo ciclo** (o painel para de responder); passar do armazenamento **bloqueia
escrita** e a leitura continua. **O dado não é apagado**, e subir de plano
destrava na hora.

### Resumo

Hoje, para esta fase: **R$ 0**. O primeiro custo real que vai aparecer não é
técnico, é contratual — a licença de uso comercial da Vercel. O segundo, se o
painel passar a ser consultado o dia inteiro, é a computação do banco.

---

## O que NÃO vai para o ar nesta primeira versão

**Nenhum dado pessoal de cliente final.** As tabelas `customers`, `orders`,
`consents` e `messages` estão **vazias** e continuam vazias depois deste deploy.
O que sobe é faturamento por dia, ficha técnica, fechamento de canal e mídia
paga — número do negócio, não gente. Isso é deliberado: a migração dos ~2.092
contatos do Postgres do n8n é outra frente, e ela esbarra numa pendência que não
é técnica — a base herdada entra como `legado_sem_registro`, que não é opt-in, e
**não pode receber disparo de marketing** enquanto o dono não decidir o que
fazer com ela. Subir dado de pessoa para a nuvem antes dessa decisão seria
colocar na frente justamente a parte que exige cuidado.

**O painel é só para o time da Tapaggo.** Os usuários são criados um a um pelo
`criar-admin`, na linha de comando, com a conexão do dono do banco. Não existe
tela de cadastro, não existe convite, não existe "esqueci minha senha". Quem não
foi criado à mão não entra.

**O acesso do dono do restaurante vem depois.** O papel `dono_restaurante` já
existe no banco (migration 012) e a RLS já isola tenant de tenant, então a
fundação está pronta. O que falta não é permissão, é o resto: recuperação de
senha, convite, trilha de auditoria de quem viu o quê, e a decisão sobre quais
telas ele vê — a de Lucro, por exemplo, mostra CMV e margem por canal, que é
conversa diferente de mostrar faturamento. Enquanto isso não existir, o Hélio e
o dono continuam recebendo a comanda pelo caminho de hoje.

**Também não sobe:** o tenant de demonstração "Pizzaria Exemplo"
(`seed_exemplo.py` não é rodado na nuvem) e as telas que hoje abrem vazias por
falta de fonte — CRM, WhatsApp e a venda diária do Jerry's. Elas estão no ar,
abrem, e dizem que não têm dado. Ver a lista completa em
[`estado-2026-10-19.md`](estado-2026-10-19.md), seção 7.

---

## O que, neste documento, eu não rodei

Honestidade sobre a origem de cada afirmação:

- **Rodei de verdade, nesta máquina:** o ensaio das 15 migrations contra um
  Postgres 17 real com dono não-superusuário (a pedra da 001 e a tabela de
  resultados); o teste do `channel_binding` com o driver do painel; a
  precedência de variável de ambiente sobre `.env` no Node e no Python; os
  comandos de geração de senha e segredo; `git log`, `git status`, versões de
  Node, npm, Python e git; a ausência de `psql`, Docker e `gh`.
- **Li, não executei:** `db/aplicar.mjs` (é novo e nunca rodou contra banco
  nenhum), `painel/scripts/criar-admin.mjs` contra a nuvem, e os passos da
  Vercel e do Neon — não criei conta, não fiz deploy, não toquei em nada que
  pedisse login.
- **Os números de preço** vêm das páginas oficiais da Vercel e do Neon lidas em
  20/10/2026.
- **As telas de provedor** (Neon, Vercel, GitHub) mudam de layout sem avisar. Os
  nomes dos campos podem estar diferentes quando você abrir; o que está escrito
  aqui é o que cada campo **significa**.
