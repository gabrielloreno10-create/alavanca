#!/usr/bin/env python3
"""Importa o CSV de pedidos do canal proprio (tabela pedidos_site do n8n).

De onde vem: o n8n do Helio grava cada pedido do Cliente Fiel na tabela
`pedidos_site` do Postgres dele, a cada minuto, desde 07/10/2026. O CSV e um
dump dessa tabela SEM as colunas nome e telefone -- dado pessoal de cliente final
nao entra neste banco, e o comando que gera o arquivo ja seleciona coluna a
coluna por causa disso.

Uso:
    python importar_site.py CAMINHO.csv [--conferir]

O que grava: venda_dia do canal proprio, um dia por linha.

DUAS COISAS QUE ESTE IMPORTADOR NAO RESOLVE, e que estao registradas de proposito

1. A coluna `loja` grava sempre 'letre'. O fluxo do n8n nao distingue Pizzaria de
   Pastas na origem, entao a venda do canal proprio entra INTEIRA na Pizzaria.
   Nao e escolha deste codigo: e o dado que chega assim. Separar exige o n8n
   passar a gravar a marca.
2. Todo pedido do arquivo e 'PIX (Online)'. Ou o restaurante so vende por PIX no
   site, ou o fluxo so captura pagamento online. A segunda hipotese significaria
   faturamento subestimado, e nenhum numero aqui resolve isso -- so o dono.
"""
from __future__ import annotations

import csv
import sys
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from alavanca_db import SemBanco, conectar, em_sp, tenant, tenant_id_por_slug

SLUG_TENANT = "grupo-le-tre"
CANAL_POR_LOJA = {"letre": "letre-site", "jerrys": "jerrys-site"}

# Status que NAO conta como venda. O arquivo de 21/10 so tem "Entregue", mas o
# dia em que aparecer um cancelado nao pode entrar somando.
STATUS_NAO_VENDE = {"cancelado", "cancelada", "nao entregue", "recusado"}


def importar(conn, tenant_id: str, arquivo: Path, conferir: bool) -> dict:
    por_dia: dict[tuple[str, date], dict] = defaultdict(lambda: {"pedidos": 0, "total": 0.0, "nao_vendeu": 0})
    lojas_desconhecidas: set[str] = set()
    lidas = 0

    with arquivo.open(encoding="utf-8-sig", newline="") as f:
        for linha in csv.DictReader(f):
            if not (linha.get("id_pedido") or "").strip():
                continue
            lidas += 1
            loja = (linha["loja"] or "").strip().lower()
            canal = CANAL_POR_LOJA.get(loja)
            if canal is None:
                lojas_desconhecidas.add(loja)
                continue
            d = por_dia[(canal, datetime.strptime(linha["data"], "%Y-%m-%d").date())]
            if (linha.get("status") or "").strip().lower() in STATUS_NAO_VENDE:
                d["nao_vendeu"] += 1
                continue
            d["pedidos"] += 1
            d["total"] += float(linha["total"])

    if lojas_desconhecidas:
        raise AssertionError(
            f"loja fora de CANAL_POR_LOJA: {', '.join(sorted(lojas_desconhecidas))}. "
            "Cadastre o canal antes de importar.")
    if not por_dia:
        print("  nenhum pedido no arquivo")
        return {"venda_dia": 0}

    datas = sorted(d for _, d in por_dia)
    print(f"  lido {arquivo.name}: {lidas} pedidos, {datas[0]} a {datas[-1]}")

    fonte = (
        f"Canal proprio (Cliente Fiel) pela tabela pedidos_site do n8n; dump {arquivo.name} "
        f"de {datas[0].isoformat()} a {datas[-1].isoformat()}, sem nome e sem telefone. "
        "A coluna loja grava sempre 'letre', entao a venda do site entra inteira na "
        "Pizzaria: Pastas e Pizzaria nao se separam na origem."
    )
    agora = datetime.now()
    coletado = em_sp(agora.year, agora.month, agora.day)

    if conferir:
        print(f"\n  {'CANAL':16} {'DIAS':>5} {'PEDIDOS':>8} {'TOTAL':>12}")
        por_canal: dict[str, dict] = defaultdict(lambda: {"dias": 0, "pedidos": 0, "total": 0.0})
        for (canal, _), d in por_dia.items():
            c = por_canal[canal]
            c["dias"] += 1
            c["pedidos"] += d["pedidos"]
            c["total"] += d["total"]
        for canal, c in sorted(por_canal.items()):
            print(f"  {canal:16} {c['dias']:5d} {c['pedidos']:8d} {c['total']:12,.2f}")
        print("\n  --conferir: nada foi gravado")
        return {"venda_dia": 0}

    with tenant(conn, tenant_id) as cur:
        cur.execute(
            "select slug, id, marca_id from alavanca.canais where tenant_id = %s and tipo = 'proprio'",
            (tenant_id,),
        )
        canais = {slug: (cid, mid) for slug, cid, mid in cur.fetchall()}
        faltando = sorted({c for c, _ in por_dia} - set(canais))
        if faltando:
            raise AssertionError(f"canal proprio nao cadastrado: {', '.join(faltando)}")

        # Mesma estimativa de CMV que as outras cargas usam, para a margem do canal
        # proprio continuar comparavel com a do iFood.
        cur.execute(
            """
            select c.slug, sum(v.cmv)::float8 / nullif(sum(v.faturamento), 0)::float8
              from alavanca.venda_dia v join alavanca.canais c on c.id = v.canal_id
             where v.tenant_id = %s and v.cmv is not null and v.faturamento > 0
             group by c.slug
            """,
            (tenant_id,),
        )
        cmv_pct = {slug: pct for slug, pct in cur.fetchall() if pct}

    linhas = []
    for (canal, dia), d in sorted(por_dia.items()):
        canal_id, marca_id = canais[canal]
        faturamento = round(d["total"], 2)
        pct = cmv_pct.get(canal)
        linhas.append((
            tenant_id, marca_id, canal_id, dia, faturamento, d["pedidos"],
            round(faturamento * pct, 2) if pct else None, pct is not None,
            fonte, coletado, fonte[:200],
        ))

    with tenant(conn, tenant_id) as cur:
        cur.executemany(
            """
            insert into alavanca.venda_dia
              (tenant_id, marca_id, canal_id, data, faturamento, pedidos, cmv, cmv_estimado,
               origem, fonte, coletado_em, apuracao, apurado_em, apurado_por)
            values (%s, %s, %s, %s, %s, %s, %s, %s, 'REAL', %s, %s, 'fechado', now(), %s)
            on conflict (tenant_id, canal_id, data) do update
              set faturamento = excluded.faturamento, pedidos = excluded.pedidos,
                  cmv = excluded.cmv, cmv_estimado = excluded.cmv_estimado,
                  fonte = excluded.fonte, coletado_em = excluded.coletado_em,
                  apuracao = excluded.apuracao, apurado_em = excluded.apurado_em,
                  apurado_por = excluded.apurado_por
            """,
            linhas,
        )

    print(f"  venda_dia: {len(linhas)} linhas, {datas[0]} a {datas[-1]}")
    return {"venda_dia": len(linhas)}


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    conferir = "--conferir" in args
    if conferir:
        args.remove("--conferir")
    if not args:
        print(__doc__)
        return 2
    arquivo = Path(args[0])
    if not arquivo.is_file():
        print(f"nao achei: {arquivo}", file=sys.stderr)
        return 1

    try:
        conn = conectar()
    except SemBanco as erro:
        print(f"sem banco: {erro}", file=sys.stderr)
        return 1
    with conn:
        tenant_id = tenant_id_por_slug(conn, SLUG_TENANT)
        if not tenant_id:
            print(f"tenant {SLUG_TENANT} nao existe", file=sys.stderr)
            return 1
        resultado = importar(conn, tenant_id, arquivo, conferir)
    print(f"\npronto: {resultado}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
