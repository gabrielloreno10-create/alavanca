const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const brlInteiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export const formatarBRL = (v: number) => brl.format(v);
export const formatarBRLInteiro = (v: number) => brlInteiro.format(v);
export const formatarInteiro = (v: number) => inteiro.format(v);

export function formatarPct(v: number, casas = 0): string {
  return new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v);
}

/** "+8%" / "−3%"; em pontos percentuais: "+2,1 p.p." */
export function formatarVariacao(v: number, emPontos = false): string {
  const sinal = v > 0 ? "+" : v < 0 ? "−" : "";
  const abs = Math.abs(v);
  if (emPontos) return `${sinal}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(abs * 100)} p.p.`;
  return `${sinal}${formatarPct(abs, abs < 0.1 ? 1 : 0)}`;
}

const dataLonga = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const diaSemanaCurto = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Quinta, 8 de outubro" */
export function formatarDataLonga(d: Date): string {
  const partes = dataLonga.format(d).replace("-feira", "");
  return maiuscula(partes);
}

/** "07/10" */
export const formatarDataCurta = (d: Date) => dataCurta.format(d);

/** "qua" */
export const formatarDiaSemanaCurto = (d: Date) => diaSemanaCurto.format(d).replace(".", "");

/**
 * O que a tela escreve no lugar de um número que ninguém mediu.
 * Zero é uma medição; ausência não é zero, e "R$ 0,00" nunca pode significar "não sei".
 */
export const NAO_MEDIDO = "não medido";

/** Formata o valor, ou diz que ele não foi medido. Nunca inventa zero. */
export function ouNaoMedido<T>(v: T | null | undefined, formatar: (x: T) => string): string {
  return v === null || v === undefined ? NAO_MEDIDO : formatar(v);
}
