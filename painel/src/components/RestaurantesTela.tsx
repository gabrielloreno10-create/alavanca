import Link from "next/link";
import { ChevronRight, CircleDashed, OctagonAlert } from "lucide-react";
import { lerData } from "@/lib/calculos";
import { NAO_MEDIDO, formatarBRLInteiro, formatarDataCurta, formatarDiaSemanaCurto, formatarInteiro, formatarPct } from "@/lib/formato";
import { PILARES } from "@/lib/pilares";
import type { LinhaRestaurante } from "@/lib/types";
import { Sinal } from "./Sinal";

const NOME_CURTO = Object.fromEntries(PILARES.map((p) => [p.rota, p.nomeCurto]));

function Semaforo({ pilares }: { pilares: LinhaRestaurante["pilares"] }) {
  return (
    <ul className="grid gap-x-6 gap-y-1.5 border-t border-linha pt-3 sm:grid-cols-2">
      {/* `valor` já chega como "não medido" quando o pilar é SEM_DADO: sem isso o
          semáforo dizia "Sem meta", que afirma existir número e faltar só a régua. */}
      {pilares.map((p) => (
        <li key={p.pilar} className="flex items-center justify-between gap-3 text-sm">
          <span className="truncate text-grafite-2">{NOME_CURTO[p.pilar] ?? p.rotulo}</span>
          <Sinal situacao={p.situacao} semDado={p.valor === NAO_MEDIDO} className="shrink-0 whitespace-nowrap" />
        </li>
      ))}
    </ul>
  );
}

export function RestaurantesTela({ restaurantes }: { restaurantes: LinhaRestaurante[] }) {
  if (!restaurantes.length) {
    return (
      <p className="rounded-painel border border-linha bg-papel p-6 text-base text-grafite">
        Esta conta ainda não tem nenhum restaurante liberado. Peça ao time da Tapaggo para ligar o seu usuário a um
        grupo (tabela <code>usuario_tenant</code>).
      </p>
    );
  }

  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {restaurantes.map((r) => {
        const temAlerta = r.alerta !== null && r.alerta.tipo !== "nenhum";
        return (
          <li key={r.slug}>
            <Link
              href={`/${r.slug}`}
              className="grid h-full gap-4 rounded-painel border border-linha bg-papel p-5 transition-colors hover:border-grafite-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-display text-xl font-semibold text-grafite">{r.nome}</h2>
                  <p className="truncate text-sm text-grafite-2">{r.segmento || "Sem segmento cadastrado"}</p>
                </div>
                <ChevronRight aria-hidden className="mt-1 size-5 shrink-0 text-grafite-2" />
              </div>

              <div className="grid gap-0.5">
                {r.ultimoDia ? (
                  <>
                    <p className="text-sm text-grafite-2">
                      Último dia fechado · {formatarDiaSemanaCurto(lerData(r.ultimoDia))}{" "}
                      {formatarDataCurta(lerData(r.ultimoDia))}
                    </p>
                    <p className="font-display text-2xl font-semibold text-grafite">{formatarBRLInteiro(r.faturamento)}</p>
                    <p className="text-sm text-grafite-2">
                      {formatarInteiro(r.pedidos)} pedidos
                      {r.meta !== null && r.metaPct !== null ? ` · ${formatarPct(r.metaPct)} da meta` : " · sem meta cadastrada"}
                    </p>
                  </>
                ) : (
                  <p className="text-base text-grafite-2">Ainda não há dia de venda importado para este restaurante.</p>
                )}
              </div>

              <p className="flex items-start gap-2 text-sm text-grafite">
                {temAlerta ? (
                  <OctagonAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-tomate" />
                ) : (
                  <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-grafite-2" />
                )}
                <span className={r.alerta ? undefined : "text-grafite-2"}>
                  {r.alerta ? r.alerta.texto : "Sem dia de venda fechado: não há nada a avaliar, e isso não quer dizer que esteja tudo certo."}
                </span>
              </p>

              <Semaforo pilares={r.pilares} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
