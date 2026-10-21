#!/usr/bin/env python3
"""Importa a exportação de Pedidos do Portal do Parceiro do iFood.

Por que existe: até 21/10/2026 a venda do iFood entrava no banco pelo CSV de
fechamento do Saipos, que veio SEM a Jerry's — 896 pedidos e R$ 91.910 em três
meses que o painel não enxergava. E a comissão era estimada por um take fixo de
41% do `pdca/guardrails.json`, quando o medido ficou entre 24,7% e 37,7%. Esta
exportação resolve as duas coisas: é pedido a pedido, traz as três lojas e traz
a taxa real de cada pedido.

De onde vem o arquivo (Portal do Parceiro, conta da rede):
    Pedidos › Exportar › Personalizado
      loja:      "Todas as lojas"
      período:   no máximo 31 dias por consulta (limite do portal)
      campos:    os 5 grupos marcados = 61 colunas
    O arquivo fica em Análise › Relatórios › Exportações por 3 dias.
    Uma cópia vai para o e-mail do dono.

Uso:
    python importar_ifood.py PASTA_OU_ARQUIVO...     # .xlsx da exportação
    python importar_ifood.py --conferir PASTA        # só lê e mostra, não grava

O que grava:
    venda_dia            uma linha por canal de iFood por dia
    ifood_operacao_dia   tempo de entrega, atraso e cancelamento por dia

Repetível: rodar de novo sobre o mesmo arquivo não duplica. E, quando um dia já
fechado muda de valor entre duas cargas, o importador AVISA em vez de sobrescrever
calado — é assim que se mede quantos dias o iFood leva para fechar de verdade,
em vez de chutar o prazo (ver migration 018).
"""
from __future__ import annotations

import sys
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

try:
    import openpyxl
except ModuleNotFoundError:  # pragma: no cover - ambiente sem a dependência
    print("falta openpyxl: pip install openpyxl", file=sys.stderr)
    raise SystemExit(2)

from alavanca_db import SemBanco, conectar, em_sp, lote, sha256, tenant, tenant_id_por_slug

SLUG_TENANT = "grupo-le-tre"

# A loja vem pelo ID, não pelo nome: nome muda com reforma de cadastro e ainda
# chega com apóstrofo tipográfico ("Jerry's"), que é fonte garantida de erro de
# comparação. O ID é estável e é o mesmo que aparece no seletor do portal.
CANAL_POR_LOJA = {
    "2047602": "letre-ifood-pizzaria",
    "3184299": "jerrys-ifood",
    "3862509": "letre-ifood-pastas",
}

# Posição das colunas na exportação de 61 campos. Conferidas contra o cabeçalho
# em toda carga (ver `conferir_cabecalho`), então uma mudança de layout do iFood
# estoura aqui e não vira número errado no painel.
COL = {
    "loja_nome": 1,
    "loja_id": 2,
    "data_hora": 3,
    "status": 6,
    "itens": 7,
    "pago_pelo_cliente": 8,
    "taxa_entrega_cliente": 9,
    "incentivo_ifood": 10,
    "incentivo_loja": 11,
    "incentivo_rede": 12,
    "taxa_servico": 13,
    "taxas_e_comissoes": 14,
    "liquido": 15,
    "itens_cancelados": 26,
    "entrega_realizada_min": 45,
    "atraso_min": 46,
}

CABECALHO_ESPERADO = {
    1: "NOME DA LOJA",
    2: "ID DA LOJA",
    3: "DATA E HORA DO PEDIDO",
    6: "STATUS FINAL DO PEDIDO",
    7: "VALOR DOS ITENS",
    14: "TAXAS E COMISSOES",
    15: "VALOR LIQUIDO",
}

# "CANCELADO" é o pedido que não aconteceu: sai do faturamento e da contagem.
# "CANCELAMENTO PARCIAL" aconteceu, com parte dos itens devolvida: conta como
# pedido, e o valor devolvido sai do faturamento pela coluna de itens cancelados.
STATUS_CANCELADO = "CANCELADO"
STATUS_PARCIAL = "CANCELAMENTO PARCIAL"
STATUS_CONCLUIDO = "CONCLUIDO"
STATUS_CONHECIDOS = {STATUS_CANCELADO, STATUS_PARCIAL, STATUS_CONCLUIDO}


def num(valor) -> float:
    """Número da planilha para float. Célula vazia, traço ou texto viram 0,0.

    A exportação mistura dois formatos na MESMA planilha: as colunas de dinheiro
    vêm como número de verdade, e as de tempo vêm como texto com ponto decimal
    ('31.83' = 31 minutos e pouco). Quem normalizar tudo como formato brasileiro
    — tirando o ponto por achar que é separador de milhar — transforma 31,83 em
    3.183, e foi exatamente o que aconteceu na primeira carga: o tempo médio de
    entrega saiu 2.630 minutos. Por isso a regra é pela vírgula: só existe
    separador de milhar onde existe vírgula decimal.
    """
    if valor is None:
        return 0.0
    if isinstance(valor, (int, float, Decimal)):
        return float(valor)
    texto = str(valor).strip().replace("R$", "").replace("\xa0", "").replace(" ", "")
    if not texto or texto == "-":
        return 0.0
    if "," in texto:
        texto = texto.replace(".", "").replace(",", ".")
    try:
        return float(texto)
    except ValueError:
        return 0.0


def dia_do_pedido(valor) -> date:
    """'30/09/2026 23:25:30' -> date(2026, 9, 30).

    O pedido da madrugada pertence ao dia em que foi feito, não ao dia anterior:
    é assim que o dono fecha o caixa e é assim que o Saipos já gravava.
    """
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    texto = str(valor).strip()
    for formato in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            return datetime.strptime(texto, formato).date()
        except ValueError:
            continue
    raise ValueError(f"data de pedido em formato desconhecido: {texto!r}")


def conferir_cabecalho(cabecalho: list, arquivo: Path) -> None:
    """Estoura se o layout mudou, em vez de somar a coluna errada em silêncio."""
    for posicao, trecho in CABECALHO_ESPERADO.items():
        lido = str(cabecalho[posicao] or "").upper()
        if trecho not in lido:
            raise AssertionError(
                f"{arquivo.name}: coluna {posicao} deveria conter {trecho!r} e contém {lido!r}. "
                "O layout da exportação do iFood mudou — confira COL antes de importar."
            )


class DiaDaLoja:
    """O acumulado de um canal num dia. Só soma; não decide nada."""

    __slots__ = ("pedidos", "faturamento", "liquido", "taxas", "incentivo_loja",
                 "cancelados", "valor_cancelado", "atrasados", "entrega_min", "entregas")

    def __init__(self) -> None:
        self.pedidos = 0
        self.faturamento = 0.0
        self.liquido = 0.0
        self.taxas = 0.0
        self.incentivo_loja = 0.0
        self.cancelados = 0
        self.valor_cancelado = 0.0
        self.atrasados = 0
        self.entrega_min = 0.0
        self.entregas = 0


def ler_exportacao(arquivo: Path) -> tuple[dict, dict]:
    """Lê um .xlsx e devolve ((canal_slug, data) -> DiaDaLoja, resumo do arquivo)."""
    livro = openpyxl.load_workbook(arquivo, data_only=True)
    aba = livro.worksheets[0]
    linhas = list(aba.iter_rows(values_only=True))
    if len(linhas) < 2:
        raise AssertionError(f"{arquivo.name}: planilha sem nenhum pedido")
    conferir_cabecalho(list(linhas[0]), arquivo)

    por_dia: dict[tuple[str, date], DiaDaLoja] = defaultdict(DiaDaLoja)
    lojas_desconhecidas: set[str] = set()
    status_desconhecidos: set[str] = set()
    total = 0

    for linha in linhas[1:]:
        if linha[COL["loja_id"]] is None:
            continue  # linha de rodapé ou separador
        total += 1
        loja = str(linha[COL["loja_id"]]).strip()
        canal = CANAL_POR_LOJA.get(loja)
        if canal is None:
            lojas_desconhecidas.add(f'{loja} ({linha[COL["loja_nome"]]})')
            continue

        status = str(linha[COL["status"]] or "").strip().upper()
        if status not in STATUS_CONHECIDOS:
            status_desconhecidos.add(status)

        d = por_dia[(canal, dia_do_pedido(linha[COL["data_hora"]]))]

        # O líquido entra sempre, inclusive do pedido cancelado: é o dinheiro que
        # de fato cai na conta, e cancelado também deixa custo.
        d.liquido += num(linha[COL["liquido"]])
        d.taxas += num(linha[COL["taxas_e_comissoes"]])
        d.incentivo_loja += num(linha[COL["incentivo_loja"]])

        if status == STATUS_CANCELADO:
            d.cancelados += 1
            d.valor_cancelado += num(linha[COL["itens"]])
            continue

        itens = num(linha[COL["itens"]])
        devolvido = num(linha[COL["itens_cancelados"]])
        d.pedidos += 1
        d.faturamento += itens - devolvido
        d.valor_cancelado += devolvido

        atraso = num(linha[COL["atraso_min"]])
        if atraso > 0:
            d.atrasados += 1
        entrega = num(linha[COL["entrega_realizada_min"]])
        if entrega > 0:
            d.entrega_min += entrega
            d.entregas += 1

    if lojas_desconhecidas:
        raise AssertionError(
            f"{arquivo.name}: loja fora de CANAL_POR_LOJA: {', '.join(sorted(lojas_desconhecidas))}. "
            "Cadastre o canal antes de importar — somar na loja errada é pior do que não importar."
        )
    if status_desconhecidos:
        print(f"  ! {arquivo.name}: status não previsto, contado como venda: "
              f"{', '.join(sorted(status_desconhecidos))}")

    datas = sorted({data for _, data in por_dia})
    resumo = {"arquivo": arquivo.name, "pedidos": total,
              "de": datas[0] if datas else None, "ate": datas[-1] if datas else None}
    return por_dia, resumo


def cmv_pct_por_canal(cur, tenant_id: str) -> dict[str, float]:
    """A razão CMV/faturamento que as cargas anteriores já gravaram, por canal.

    Não reinventa ficha técnica: usa a mesma estimativa que o importador do
    Saipos aplicou, para que a margem do iFood e a do canal próprio continuem
    comparáveis. Canal sem histórico fica de fora e grava cmv nulo.
    """
    cur.execute(
        """
        select c.slug, sum(v.cmv)::float8 / nullif(sum(v.faturamento), 0)::float8
          from alavanca.venda_dia v
          join alavanca.canais c on c.id = v.canal_id
         where v.tenant_id = %s and v.cmv is not null and v.faturamento > 0
         group by c.slug
        """,
        (tenant_id,),
    )
    return {slug: pct for slug, pct in cur.fetchall() if pct}


def importar(conn, tenant_id: str, arquivos: list[Path], conferir: bool) -> dict:
    acumulado: dict[tuple[str, date], DiaDaLoja] = defaultdict(DiaDaLoja)
    resumos = []
    for arquivo in arquivos:
        por_dia, resumo = ler_exportacao(arquivo)
        resumos.append(resumo)
        print(f"  lido {resumo['arquivo']}: {resumo['pedidos']} pedidos, "
              f"{resumo['de']} a {resumo['ate']}")
        for chave, d in por_dia.items():
            a = acumulado[chave]
            for campo in DiaDaLoja.__slots__:
                setattr(a, campo, getattr(a, campo) + getattr(d, campo))

    if not acumulado:
        print("  nada para importar")
        return {"venda_dia": 0, "operacao": 0, "mudaram": 0}

    datas = sorted({data for _, data in acumulado})
    fonte = (
        "iFood, Portal do Parceiro > Pedidos > Exportar > Personalizado, "
        '"Todas as lojas", 61 campos (padrão, agendamento, cancelamento, entrega, '
        f"negociação); arquivos {', '.join(r['arquivo'] for r in resumos)}; "
        f"período {datas[0].isoformat()} a {datas[-1].isoformat()}. "
        "Faturamento = VALOR DOS ITENS menos VALOR DOS ITENS CANCELADOS, "
        "sem o pedido de status CANCELADO. Líquido = VALOR LIQUIDO de todos os "
        "pedidos, inclusive cancelados, porque cancelado também deixa custo."
    )
    coletado = em_sp(datetime.now().year, datetime.now().month, datetime.now().day)

    if conferir:
        print(f"\n  {'CANAL':24} {'DIAS':>5} {'PEDIDOS':>8} {'FATURAMENTO':>13} {'LIQUIDO':>12}")
        por_canal: dict[str, DiaDaLoja] = defaultdict(DiaDaLoja)
        dias_canal: dict[str, set] = defaultdict(set)
        for (canal, data), d in acumulado.items():
            dias_canal[canal].add(data)
            for campo in DiaDaLoja.__slots__:
                setattr(por_canal[canal], campo,
                        getattr(por_canal[canal], campo) + getattr(d, campo))
        for canal in sorted(por_canal, key=lambda c: -por_canal[c].faturamento):
            d = por_canal[canal]
            print(f"  {canal:24} {len(dias_canal[canal]):5d} {d.pedidos:8d} "
                  f"{d.faturamento:13,.2f} {d.liquido:12,.2f}")
        print("\n  --conferir: nada foi gravado")
        return {"venda_dia": 0, "operacao": 0, "mudaram": 0}

    with tenant(conn, tenant_id) as cur:
        cur.execute(
            "select slug, id, marca_id from alavanca.canais where tenant_id = %s and tipo = 'ifood'",
            (tenant_id,),
        )
        canais = {slug: (cid, mid) for slug, cid, mid in cur.fetchall()}
        faltando = sorted(set(c for c, _ in acumulado) - set(canais))
        if faltando:
            raise AssertionError(f"canal de iFood não cadastrado: {', '.join(faltando)}")
        cmv_pct = cmv_pct_por_canal(cur, tenant_id)

        # O que já estava gravado, para saber o que MUDOU nesta carga. É a medição
        # do prazo real de fechamento do iFood (migration 018).
        cur.execute(
            """
            select c.slug, v.data, v.faturamento, v.pedidos, v.apuracao::text,
                   coalesce(v.apurado_por, v.fonte, '')
              from alavanca.venda_dia v
              join alavanca.canais c on c.id = v.canal_id
             where v.tenant_id = %s and c.tipo = 'ifood' and v.data between %s and %s
            """,
            (tenant_id, datas[0], datas[-1]),
        )
        antes = {(slug, data): (float(fat), ped, ap, proc)
                 for slug, data, fat, ped, ap, proc in cur.fetchall()}

    # Duas coisas diferentes, que não podem sair com o mesmo nome:
    #   trocou_fonte  = o dia já existia, mas vindo de OUTRA fonte (o CSV do Saipos).
    #                   Divergência de fonte, não de prazo: é esperado na primeira
    #                   carga e merece conferência, não alarme.
    #   mudaram       = o dia já tinha sido fechado POR ESTA MESMA fonte e mudou de
    #                   valor. Isso sim é o iFood reapurando, e é o que mede o prazo
    #                   real de fechamento (migration 018).
    trocou_fonte = []
    mudaram = []
    linhas_venda = []
    linhas_operacao = []
    for (canal, data), d in sorted(acumulado.items()):
        canal_id, marca_id = canais[canal]
        faturamento = round(d.faturamento, 2)
        pct = cmv_pct.get(canal)
        cmv = round(faturamento * pct, 2) if pct else None

        anterior = antes.get((canal, data))
        if anterior and abs(anterior[0] - faturamento) > 0.01:
            veio_do_ifood = "iFood" in anterior[3]
            destino = mudaram if veio_do_ifood else trocou_fonte
            destino.append((canal, data, anterior[0], faturamento))

        linhas_venda.append((
            tenant_id, marca_id, canal_id, data,
            faturamento, d.pedidos, cmv, pct is not None,
            round(d.valor_cancelado, 2), d.cancelados, round(d.liquido, 2),
            fonte, coletado, fonte[:200],
        ))
        linhas_operacao.append((
            tenant_id, canal_id, data,
            round(d.entrega_min / d.entregas, 1) if d.entregas else None,
            d.cancelados, d.atrasados, fonte, coletado,
        ))

    with tenant(conn, tenant_id) as cur:
        cur.executemany(
            """
            insert into alavanca.venda_dia
              (tenant_id, marca_id, canal_id, data, faturamento, pedidos, cmv, cmv_estimado,
               valor_cancelado, qtd_cancelada, faturamento_liquido,
               origem, fonte, coletado_em, apuracao, apurado_em, apurado_por)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    'REAL', %s, %s, 'fechado', now(), %s)
            on conflict (tenant_id, canal_id, data) do update
              set marca_id = excluded.marca_id,
                  faturamento = excluded.faturamento,
                  pedidos = excluded.pedidos,
                  cmv = excluded.cmv,
                  cmv_estimado = excluded.cmv_estimado,
                  valor_cancelado = excluded.valor_cancelado,
                  qtd_cancelada = excluded.qtd_cancelada,
                  faturamento_liquido = excluded.faturamento_liquido,
                  origem = excluded.origem,
                  fonte = excluded.fonte,
                  coletado_em = excluded.coletado_em,
                  apuracao = excluded.apuracao,
                  apurado_em = excluded.apurado_em,
                  apurado_por = excluded.apurado_por
            """,
            linhas_venda,
        )
        cur.executemany(
            """
            insert into alavanca.ifood_operacao_dia
              (tenant_id, canal_id, data, tempo_entrega_min, cancelados, pedidos_atrasados,
               origem, fonte, coletado_em)
            values (%s, %s, %s, %s, %s, %s, 'REAL', %s, %s)
            on conflict (tenant_id, canal_id, data) do update
              set tempo_entrega_min = excluded.tempo_entrega_min,
                  cancelados = excluded.cancelados,
                  pedidos_atrasados = excluded.pedidos_atrasados,
                  origem = excluded.origem,
                  fonte = excluded.fonte,
                  coletado_em = excluded.coletado_em
            """,
            linhas_operacao,
        )

    print(f"\n  venda_dia: {len(linhas_venda)} linhas (canal × dia), {datas[0]} a {datas[-1]}")
    print(f"  ifood_operacao_dia: {len(linhas_operacao)} linhas")
    if trocou_fonte:
        soma_antes = sum(a for _, _, a, _ in trocou_fonte)
        soma_depois = sum(d for _, _, _, d in trocou_fonte)
        print(f"\n  {len(trocou_fonte)} dia(s) trocaram de fonte (Saipos -> iFood).")
        print(f"    Soma antes {soma_antes:,.2f} · agora {soma_depois:,.2f} "
              f"({soma_depois - soma_antes:+,.2f}, "
              f"{100 * (soma_depois - soma_antes) / soma_antes:+.1f}%)")
        print("    Divergência entre as duas fontes, não atraso de fechamento. "
              "Vale conferir antes de confiar na margem desses dias.")
    if mudaram:
        print(f"\n  ! {len(mudaram)} dia(s) já fechados PELO IFOOD mudaram de valor:")
        for canal, data, antes_v, depois_v in mudaram[:10]:
            print(f"      {canal} {data}: {antes_v:,.2f} -> {depois_v:,.2f} "
                  f"({depois_v - antes_v:+,.2f})")
        print("    Isto é a medição do prazo de fechamento do iFood, não um erro.")
    return {"venda_dia": len(linhas_venda), "operacao": len(linhas_operacao),
            "mudaram": len(mudaram), "trocou_fonte": len(trocou_fonte)}


def arquivos_de(caminhos: list[str]) -> list[Path]:
    encontrados: list[Path] = []
    for bruto in caminhos:
        caminho = Path(bruto)
        if caminho.is_dir():
            encontrados.extend(sorted(caminho.glob("*.xlsx")))
        elif caminho.is_file():
            encontrados.append(caminho)
        else:
            raise SystemExit(f"não achei: {caminho}")
    if not encontrados:
        raise SystemExit("nenhum .xlsx encontrado nos caminhos informados")
    return encontrados


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    conferir = "--conferir" in args
    if conferir:
        args.remove("--conferir")
    if not args:
        print(__doc__)
        return 2

    arquivos = arquivos_de(args)
    print(f"importar_ifood: {len(arquivos)} arquivo(s)"
          + (" (--conferir: não grava)" if conferir else ""))

    try:
        conn = conectar()
    except SemBanco as erro:
        print(f"sem banco: {erro}", file=sys.stderr)
        return 1

    with conn:
        tenant_id = tenant_id_por_slug(conn, SLUG_TENANT)
        if not tenant_id:
            print(f"tenant {SLUG_TENANT} não existe no banco", file=sys.stderr)
            return 1
        resultado = importar(conn, tenant_id, arquivos, conferir)

    print(f"\npronto: {resultado}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
