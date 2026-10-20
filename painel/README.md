# painel — Alavanca

Next.js 16 (App Router, Cache Components) + React 19 + Tailwind 4 + Vitest.
Lê o Postgres da plataforma (`../db`), um tenant por vez, com Row Level Security.

```bash
npm ci
cp .env.example .env.local     # preencha DATABASE_URL e AUTH_SECRET
npm run dev                    # http://localhost:3000
npm test
npm run build
```

## Como os dados chegam na tela

```
rota  →  src/lib/pagina.ts     exige sessão, lê ?periodo= e ?marca= da URL
      →  src/lib/dados.ts      uma função get* por tela (assinatura (slug, periodo, marca, acesso))
      →  src/lib/fonte/        postgres.ts (produção) | seed.ts (fallback)
      →  src/lib/calculos.ts   toda conta mora aqui, e só aqui
```

Cada `get*` consulta **só a janela de dias que a sua tela precisa** — não existe mais
pré-computação de todas as visões por período e por marca. A única exceção é Métricas,
que pede a série inteira porque desenha o calendário mês a mês.

### Conexão e tenant

`src/lib/db.ts` abre uma transação por carga e seta o tenant como primeira instrução:

```ts
await tx`select set_config('app.tenant_id', ${tenantId}, true)`;
```

O terceiro argumento `true` é **local à transação**. Sem ele o valor gruda na conexão do
pool e a próxima request de outro cliente lê o tenant errado. O painel conecta sempre com
a role `alavanca_app`; a role dona passaria por cima da RLS.

Quais tenants a sessão pode abrir vem de `usuario_tenant` e viaja no JWT. É daí que sai o
`tenantId` — o `where slug = $1` das views é só para pegar o resto do cadastro.

### Modo de semente (fallback)

Sem `DATABASE_URL`, a fonte cai nos JSON de `src/data/clientes/<slug>/`. É o que faz o
painel abrir e os testes rodarem sem Postgres no ar. **Nunca é silencioso**: o console
avisa no primeiro uso e o painel mostra a faixa "Modo de semente" no topo de toda tela.
Não é modo de produção.

## Autenticação

Auth.js (next-auth v5) com provider de credenciais contra `alavanca.usuarios`
(senha em bcrypt, só o hash no banco).

- `src/proxy.ts` — checagem **otimista** do cookie (o Next 16 chama de proxy, não
  middleware). Não valida nada: só evita renderizar para quem não tem sessão nenhuma.
- `src/lib/sessao.ts` — `exigirSessao()` é a autorização de verdade, e toda página com
  dado real passa por ela.

Primeiro usuário:

```bash
ALAVANCA_ADMIN_EMAIL=... ALAVANCA_ADMIN_NOME=... ALAVANCA_ADMIN_SENHA=... \
ALAVANCA_ADMIN_DATABASE_URL=...  npm run criar-admin -- grupo-le-tre
```

A senha vem de variável de ambiente, nunca de argumento nem de arquivo. Ligar o usuário a
um tenant precisa da conexão da role dona: a RLS esconde `tenants` da role de aplicação.

## Filtros na URL

Período e marca são `?periodo=ontem|7d|30d|mes` e `?marca=<nome da marca>`, lidos no
servidor (`src/lib/filtros.ts`) e no cliente (`src/components/PeriodoContexto.tsx`).
Valor inválido cai no padrão; marca que não existe no cliente cai no consolidado.

## Telas

`/` lista todos os restaurantes da sessão. `/[cliente]` é a comanda do dia e os 6 pilares;
`/[cliente]/{ifood,canal-proprio,crm,whatsapp,lucro,metricas,plano}` são as áreas.

Cada bloco carrega `origem` (`REAL` | `EXEMPLO`) do banco, e a tela marca o que ainda é
exemplo. Meta ausente é `null` — "não cadastrada", nunca zero.
