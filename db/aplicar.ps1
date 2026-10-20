# Aplica as migrations na ordem do nome do arquivo, pulando as que ja rodaram.
#
# Uso:
#   .\aplicar.ps1            aplica o que falta
#   .\aplicar.ps1 -Status    so mostra o que ja foi aplicado
#
# Dois modos, escolhidos sozinho:
#   - docker (padrao): roda psql DE DENTRO do container, entao nao precisa ter
#     psql instalado na maquina;
#   - psql: usado quando ALAVANCA_ADMIN_DATABASE_URL esta definida no .env.
#
# Nenhuma senha e escrita em arquivo. A senha da role de aplicacao vem da
# variavel ALAVANCA_APP_PASSWORD do .env e e aplicada por ALTER ROLE no fim.

[CmdletBinding()]
param(
  [switch]$Status
)

$ErrorActionPreference = 'Stop'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $aqui

# ---- .env -------------------------------------------------------------------
$envPath = Join-Path $aqui '.env'
if (-not (Test-Path $envPath)) {
  Write-Error "ERRO: .env nao existe. Copie o .env.example e preencha as senhas."
}
$cfg = @{}
foreach ($linha in Get-Content $envPath) {
  $l = $linha.Trim()
  if ($l -eq '' -or $l.StartsWith('#') -or -not $l.Contains('=')) { continue }
  $par = $l.Split('=', 2)
  $cfg[$par[0].Trim()] = $par[1].Trim().Trim('"').Trim("'")
}

$pgDb   = if ($cfg['POSTGRES_DB'])   { $cfg['POSTGRES_DB'] }   else { 'alavanca' }
$pgUser = if ($cfg['POSTGRES_USER']) { $cfg['POSTGRES_USER'] } else { 'alavanca_owner' }
$adminUrl = $cfg['ALAVANCA_ADMIN_DATABASE_URL']
$appSenha = $cfg['ALAVANCA_APP_PASSWORD']
$modo = 'docker'
if ($adminUrl) { $modo = 'psql' }

# ---- helpers ----------------------------------------------------------------
function Invoke-PsqlStdin {
  param([string]$Sql, [string[]]$Extra = @())
  if ($modo -eq 'psql') {
    $saida = $Sql | & psql $adminUrl -v ON_ERROR_STOP=1 -q @Extra
  } else {
    $saida = $Sql | & docker compose exec -T db psql -v ON_ERROR_STOP=1 -q -U $pgUser -d $pgDb @Extra
  }
  if ($LASTEXITCODE -ne 0) { Write-Error "psql falhou (codigo $LASTEXITCODE)" }
  return $saida
}

function Invoke-PsqlArquivo {
  param([string]$Nome)
  if ($modo -eq 'psql') {
    & psql $adminUrl -v ON_ERROR_STOP=1 -q -f (Join-Path '.\migrations' $Nome)
  } else {
    & docker compose exec -T db psql -v ON_ERROR_STOP=1 -q -U $pgUser -d $pgDb -f "/migrations/$Nome"
  }
  if ($LASTEXITCODE -ne 0) { Write-Error "falhou ao aplicar $Nome" }
}

# ---- banco de pe? -----------------------------------------------------------
if ($modo -eq 'docker') {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error @"
ERRO: docker nao encontrado nesta maquina.
      Instale o Docker Desktop, ou defina ALAVANCA_ADMIN_DATABASE_URL no .env
      para aplicar as migrations num Postgres que ja exista.
"@
  }
  Write-Host '-> subindo o Postgres (docker compose up -d)'
  & docker compose up -d
  if ($LASTEXITCODE -ne 0) { Write-Error 'docker compose up falhou' }

  Write-Host '-> esperando o banco responder'
  $pronto = $false
  for ($i = 0; $i -lt 60; $i++) {
    & docker compose exec -T db pg_isready -U $pgUser -d $pgDb *> $null
    if ($LASTEXITCODE -eq 0) { $pronto = $true; break }
    Start-Sleep -Seconds 2
  }
  if (-not $pronto) { Write-Error 'o Postgres nao respondeu em 2 minutos' }
}

# ---- bootstrap da tabela de controle ---------------------------------------
$bootstrap = @'
create schema if not exists alavanca;
create table if not exists alavanca.migrations (
  versao      text primary key,
  nome        text not null,
  checksum    text not null,
  aplicada_em timestamptz not null default now()
);
'@
Invoke-PsqlStdin -Sql $bootstrap | Out-Null

if ($Status) {
  Write-Host '-> migrations aplicadas:'
  Invoke-PsqlStdin -Sql 'select versao, aplicada_em from alavanca.migrations order by versao;' -Extra @('-t','-A','-F','  ')
  exit 0
}

$aplicadas = @{}
$linhas = Invoke-PsqlStdin -Sql 'select versao || '' '' || checksum from alavanca.migrations;' -Extra @('-t','-A')
foreach ($l in $linhas) {
  $l = "$l".Trim()
  if ($l -eq '') { continue }
  $p = $l.Split(' ', 2)
  $aplicadas[$p[0]] = $p[1]
}

# ---- loop -------------------------------------------------------------------
$novas = 0
foreach ($arq in Get-ChildItem -Path '.\migrations' -Filter '*.sql' | Sort-Object Name) {
  $nome = $arq.Name
  $versao = $nome.Split('_')[0]
  $soma = (Get-FileHash -Path $arq.FullName -Algorithm SHA256).Hash.ToLower()

  if ($aplicadas.ContainsKey($versao)) {
    if ($aplicadas[$versao] -ne $soma) {
      Write-Error @"
ERRO: $nome mudou depois de aplicada.
      Migration ja aplicada nao se edita: crie a proxima numerada.
"@
    }
    Write-Host "   ja aplicada  $nome"
    continue
  }

  Write-Host "-> aplicando    $nome"
  Invoke-PsqlArquivo -Nome $nome
  $reg = @'
insert into alavanca.migrations (versao, nome, checksum)
values (:'versao', :'nome', :'soma')
on conflict (versao) do update set checksum = excluded.checksum, aplicada_em = now();
'@
  Invoke-PsqlStdin -Sql $reg -Extra @('-v', "versao=$versao", '-v', "nome=$nome", '-v', "soma=$soma") | Out-Null
  $novas++
}

# ---- senha da role de aplicacao --------------------------------------------
if ($appSenha) {
  Write-Host '-> definindo a senha da role alavanca_app'
  Invoke-PsqlStdin -Sql "alter role alavanca_app with login password :'senha';" -Extra @('-v', "senha=$appSenha") | Out-Null
} else {
  Write-Host 'AVISO: ALAVANCA_APP_PASSWORD vazia no .env. A role alavanca_app existe'
  Write-Host '       mas nao consegue conectar ate ter senha.'
}

Write-Host ''
Write-Host "pronto: $novas migration(s) nova(s)."
Invoke-PsqlStdin -Sql "select count(*) || ' migrations aplicadas' from alavanca.migrations;" -Extra @('-t','-A')
Invoke-PsqlStdin -Sql "select count(*) || ' tabelas no schema alavanca' from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='alavanca' and c.relkind='r';" -Extra @('-t','-A')
