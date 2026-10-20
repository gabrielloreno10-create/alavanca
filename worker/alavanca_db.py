"""Conexão, contexto de tenant e lote de importação.

Três coisas que todo script deste pacote precisa fazer igual:

1. conectar como a role de aplicação (`alavanca_app`), nunca como o dono;
2. abrir a transação e, como PRIMEIRA instrução dela, setar `app.tenant_id`.
   Sem isso a Row Level Security devolve ZERO linha, sem erro nenhum —
   o script leria e gravaria nada e pareceria ter funcionado;
3. registrar em `importacao_lote` de onde veio cada carga, com o sha256 do
   arquivo, e carimbar o mesmo texto de `fonte` em toda linha que ela gerar.

Nenhuma senha mora aqui: tudo vem de variável de ambiente / `.env`.
"""

from __future__ import annotations

import hashlib
import os
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg

# Fuso do tenant. Toda data de negócio e todo coletado_em nascem aqui.
FUSO_BR = timezone(timedelta(hours=-3))

RAIZ = Path(__file__).resolve().parent.parent
DADOS_FONTE = RAIZ / "dados-fonte"
REFERENCIA = RAIZ / "referencia"
PAINEL_DADOS = RAIZ / "painel" / "src" / "data" / "clientes"


def em_sp(ano: int, mes: int, dia: int, hora: int = 0) -> datetime:
    """Instante no fuso do tenant. Usado para coletado_em."""
    return datetime(ano, mes, dia, hora, tzinfo=FUSO_BR)


# ---------------------------------------------------------------------------
# .env
# ---------------------------------------------------------------------------
def carregar_env(caminho: Path | None = None) -> None:
    """Lê um .env simples (CHAVE=valor) sem sobrescrever o ambiente real.

    Procura worker/.env e, se não achar, db/.env — é comum a pessoa ter
    preenchido só o do banco.
    """
    candidatos = [caminho] if caminho else [RAIZ / "worker" / ".env", RAIZ / "db" / ".env"]
    for arq in candidatos:
        if not arq or not arq.exists():
            continue
        for linha in arq.read_text(encoding="utf-8").splitlines():
            linha = linha.strip()
            if not linha or linha.startswith("#") or "=" not in linha:
                continue
            chave, _, valor = linha.partition("=")
            chave = chave.strip()
            valor = valor.strip().strip('"').strip("'")
            if chave and valor and chave not in os.environ:
                os.environ[chave] = valor


# ---------------------------------------------------------------------------
# conexão
# ---------------------------------------------------------------------------
class SemBanco(RuntimeError):
    """DATABASE_URL não foi configurada."""


def conectar() -> psycopg.Connection:
    carregar_env()
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise SemBanco(
            "DATABASE_URL vazia. Copie worker/.env.example para worker/.env e preencha "
            "com a conexão da role alavanca_app (nunca a do dono do banco)."
        )
    # autocommit=False: cada carga é uma transação. Erro no meio não deixa
    # meia importação gravada.
    #
    # prepare_threshold=None desliga o prepared statement automático. Um
    # importador que roda uma vez por dia não ganha nada com ele, e é
    # justamente o que quebra atrás de um pooler em modo transação (PgBouncer)
    # e em Postgres embarcado, onde a sessão não é só sua.
    return psycopg.connect(url, autocommit=False, prepare_threshold=None)


@contextmanager
def tenant(conn: psycopg.Connection, tenant_id: str):
    """Abre a transação já com o tenant setado e devolve o cursor.

    `set_config(..., true)` = local à transação: o valor morre junto com ela e
    não vaza para a próxima request que pegar a mesma conexão do pool.
    """
    with conn.transaction():
        with conn.cursor() as cur:
            # ALAVANCA_DB_ROLE existe para o ambiente de teste (PGlite), onde só
            # há um usuário e seria fácil rodar sem RLS sem perceber. Em
            # produção a conexão já é alavanca_app e a variável fica vazia.
            papel = os.environ.get("ALAVANCA_DB_ROLE", "").strip()
            if papel:
                cur.execute(f'set local role "{papel}"')
            cur.execute("select set_config('app.tenant_id', %s, true)", (str(tenant_id),))
            yield cur


def tenant_id_por_slug(conn: psycopg.Connection, slug: str) -> str | None:
    """Traduz o slug da rota no uuid do tenant (migration 015)."""
    with conn.transaction():
        with conn.cursor() as cur:
            papel = os.environ.get("ALAVANCA_DB_ROLE", "").strip()
            if papel:
                cur.execute(f'set local role "{papel}"')
            cur.execute("select alavanca.tenant_id_por_slug(%s)", (slug,))
            linha = cur.fetchone()
    return str(linha[0]) if linha and linha[0] else None


# ---------------------------------------------------------------------------
# lote de importação
# ---------------------------------------------------------------------------
def sha256(caminho: Path) -> str:
    return hashlib.sha256(caminho.read_bytes()).hexdigest()


class Lote:
    """Contador de linhas de uma carga. O importador só mexe nos contadores."""

    def __init__(self, id_: str, fonte: str) -> None:
        self.id = id_
        self.fonte = fonte
        self.lidas = 0
        self.gravadas = 0
        self.ignoradas = 0

    def __repr__(self) -> str:  # pragma: no cover - diagnóstico
        return f"<Lote {self.lidas} lidas / {self.gravadas} gravadas / {self.ignoradas} ignoradas>"


@contextmanager
def lote(
    conn: psycopg.Connection,
    tenant_id: str,
    *,
    tipo: str,
    fonte: str,
    arquivo: str | None,
    arquivo_hash: str | None,
    coletado_em: datetime,
    periodo: tuple[str | None, str | None] = (None, None),
    origem: str = "REAL",
):
    """Uma carga = um lote = uma transação.

    Reabrir o mesmo arquivo (mesmo hash) reaproveita o lote em vez de estourar
    no índice único — é o que torna o importador repetível. Se a carga falhar,
    a transação volta inteira e o lote é marcado `falhou` numa transação nova,
    para o rastro não se perder junto com os dados.
    """
    registro: Lote | None = None
    try:
        with tenant(conn, tenant_id) as cur:
            cur.execute(
                """
                insert into alavanca.importacao_lote
                  (tenant_id, tipo, fonte, arquivo, arquivo_hash, periodo_inicio, periodo_fim,
                   status, origem, coletado_em, iniciado_em, terminado_em,
                   linhas_lidas, linhas_gravadas, linhas_ignoradas, erros)
                values (%s, %s, %s, %s, %s, %s, %s, 'rodando', %s, %s, now(), null, 0, 0, 0, '[]'::jsonb)
                on conflict (tenant_id, tipo, arquivo_hash) where arquivo_hash is not null
                do update set fonte = excluded.fonte,
                              arquivo = excluded.arquivo,
                              periodo_inicio = excluded.periodo_inicio,
                              periodo_fim = excluded.periodo_fim,
                              status = 'rodando',
                              coletado_em = excluded.coletado_em,
                              iniciado_em = now(),
                              terminado_em = null,
                              erros = '[]'::jsonb
                returning id
                """,
                (tenant_id, tipo, fonte, arquivo, arquivo_hash,
                 periodo[0], periodo[1], origem, coletado_em),
            )
            registro = Lote(str(cur.fetchone()[0]), fonte)
            yield cur, registro
            cur.execute(
                """
                update alavanca.importacao_lote
                   set status = 'concluido', terminado_em = now(),
                       linhas_lidas = %s, linhas_gravadas = %s, linhas_ignoradas = %s
                 where id = %s and tenant_id = %s
                """,
                (registro.lidas, registro.gravadas, registro.ignoradas, registro.id, tenant_id),
            )
    except Exception as erro:  # a transação já voltou atrás; só o rastro é salvo
        if registro is not None:
            try:
                with tenant(conn, tenant_id) as cur:
                    cur.execute(
                        """
                        update alavanca.importacao_lote
                           set status = 'falhou', terminado_em = now(),
                               erros = jsonb_build_array(jsonb_build_object('erro', %s))
                         where tenant_id = %s and tipo = %s and arquivo_hash = %s
                        """,
                        (f"{type(erro).__name__}: {erro}"[:500], tenant_id, tipo, arquivo_hash),
                    )
            except Exception:  # pragma: no cover - banco fora do ar
                pass
        raise
