import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", weight: ["500", "600"] });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument" });
/**
 * A mono existe por um motivo só: a Comanda.
 *
 * O painel inteiro é Instrument/Bricolage, e isso o deixa parecido com qualquer
 * outro painel. O que ele tem de próprio é a metáfora da comanda de cozinha — e
 * comanda é impressa, em máquina, em letra de largura fixa. A mono não é enfeite:
 * é o que faz a tela ser reconhecível numa captura de tela.
 *
 * Usada SÓ em rótulo, folio e unidade. Valor continua em Bricolage com
 * tabular-nums, porque número grande em mono fica frio e fica largo demais.
 */
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Mordomo", template: "%s · Mordomo" },
  description: "Painel diário de vendas, dados e lucro do restaurante. Mordomo App.",
};

export const viewport: Viewport = {
  themeColor: "#F2F3EF",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${bricolage.variable} ${instrument.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
