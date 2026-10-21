#!/usr/bin/env python3
"""Roda as verificacoes da jornada e descobre onde o cliente esta.

Por que existe: a jornada so vale alguma coisa se o passo for concluido por
MEDICAO. Se o dono marca sozinho que fez, todo mundo chega a 100% sem mudar nada
na operacao, e o progresso vira enfeite. Este script e o que da dente ao flow:
pega o SQL guardado em jornada_passo.verificacao, roda, e grava o resultado com
o numero que provou.

Passo de tipo 'manual' nao tem verificacao e NAO e tocado aqui -- ele existe
porque alguem precisa fazer (pedir acesso, renegociar contrato), mas nao conta
para o nivel justamente por nao ser verificavel.

Uso:
    python jornada.py                 # roda e grava
    python jornada.py --conferir      # roda e mostra, sem gravar
"""
from __future__ import annotations

import sys

from alavanca_db import SemBanco, conectar, tenant, tenant_id_por_slug

SLUG_TENANT = "grupo-le-tre"


def rodar(conn, tenant_id: str, conferir: bool) -> dict:
    with tenant(conn, tenant_id) as cur:
        cur.execute(
            """
            select p.slug, p.fase, p.ordem, p.nome, p.tipo, p.peso, p.verificacao,
                   f.nome as fase_nome
              from alavanca.jornada_passo p
              join alavanca.jornada_fase f on f.numero = p.fase
             order by p.fase, p.ordem
            """
        )
        passos = cur.fetchall()

    resultados = []
    for slug, fase, ordem, nome, tipo, peso, sql, fase_nome in passos:
        if tipo == "manual":
            resultados.append((fase, fase_nome, slug, nome, tipo, peso, None, None))
            continue
        # Cada verificacao roda na sua propria transacao com o tenant setado: uma
        # consulta mal escrita derruba o proprio passo, nao a rodada inteira.
        try:
            with tenant(conn, tenant_id) as cur:
                # Sem parametro: a RLS da transacao e quem limita ao tenant (migration 028).
                cur.execute(sql)
                linha = cur.fetchone()
            feito, medido = (bool(linha[0]), str(linha[1])) if linha else (False, "sem resultado")
        except Exception as erro:  # pragma: no cover - depende do SQL guardado
            feito, medido = False, f"verificacao falhou: {str(erro).splitlines()[0][:80]}"
        resultados.append((fase, fase_nome, slug, nome, tipo, peso, feito, medido))

    if not conferir:
        linhas = [
            (tenant_id, slug, feito, medido)
            for _, _, slug, _, tipo, _, feito, medido in resultados
            if tipo == "medido"
        ]
        with tenant(conn, tenant_id) as cur:
            cur.executemany(
                """
                insert into alavanca.tenant_passo
                  (tenant_id, passo_slug, marca_id, feito, medido, verificado_em)
                values (%s, %s, null, %s, %s, now())
                on conflict (tenant_id, passo_slug, marca_id) do update
                  set feito = excluded.feito, medido = excluded.medido,
                      verificado_em = excluded.verificado_em
                """,
                linhas,
            )

    # Relatorio
    fase_atual = None
    peso_feito = peso_total = 0
    for fase, fase_nome, slug, nome, tipo, peso, feito, medido in resultados:
        if fase != fase_atual:
            print(f"\n  FASE {fase} — {fase_nome}")
            fase_atual = fase
        if tipo == "manual":
            print(f"    -  {nome}  (manual, não conta para o nível)")
            continue
        peso_total += peso
        if feito:
            peso_feito += peso
        marca = "[x]" if feito else "[ ]"
        print(f"    {marca} {nome}  — {medido}")

    pct = round(100 * peso_feito / peso_total) if peso_total else 0
    print(f"\n  {peso_feito} de {peso_total} pontos verificáveis cumpridos ({pct}%)")
    if conferir:
        print("  --conferir: nada foi gravado")
    return {"pontos": peso_feito, "total": peso_total, "pct": pct}


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    conferir = "--conferir" in args
    try:
        conn = conectar()
    except SemBanco as erro:
        print(f"sem banco: {erro}", file=sys.stderr)
        return 1
    with conn:
        tenant_id = tenant_id_por_slug(conn, SLUG_TENANT)
        if not tenant_id:
            print(f"tenant {SLUG_TENANT} não existe", file=sys.stderr)
            return 1
        print(f"jornada de {SLUG_TENANT}")
        rodar(conn, tenant_id, conferir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
