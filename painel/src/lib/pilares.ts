import type { PilarId } from "./types";

export interface InfoPilar {
  id: PilarId | "plano";
  numero?: number;
  nome: string;
  nomeCurto: string;
  rota: string;
  descricao: string;
}

export const PILARES: InfoPilar[] = [
  {
    id: "ifood", numero: 1, nome: "Vendas no iFood", nomeCurto: "iFood", rota: "ifood",
    descricao: "Como a loja está no iFood e quanto do que ela vende fica com você.",
  },
  {
    id: "canal-proprio", numero: 2, nome: "Canal próprio e tráfego", nomeCurto: "Canal próprio", rota: "canal-proprio",
    descricao: "Quanto vende pelo seu site e WhatsApp, e quanto custa trazer esse pedido com anúncio.",
  },
  {
    id: "crm", numero: 3, nome: "CRM sniper", nomeCurto: "CRM", rota: "crm",
    descricao: "Sua base de clientes separada por comportamento, e os disparos feitos para quem aceitou receber.",
  },
  {
    id: "whatsapp", numero: 4, nome: "Vendedor IA no WhatsApp", nomeCurto: "WhatsApp", rota: "whatsapp",
    descricao: "O que o vendedor de IA conversou, vendeu e sugeriu no WhatsApp.",
  },
  {
    id: "lucro", numero: 5, nome: "Gestão de lucro", nomeCurto: "Lucro", rota: "lucro",
    descricao: "CMV, margem de contribuição por prato e por canal, e as metas do mês.",
  },
  {
    id: "metricas", numero: 6, nome: "Métricas diárias", nomeCurto: "Métricas", rota: "metricas",
    descricao: "O dia a dia contra a meta e a mensagem que o dono recebe no WhatsApp.",
  },
];

export const PLANO: InfoPilar = {
  id: "plano", nome: "Plano de ação", nomeCurto: "Plano", rota: "plano",
  descricao: "Todas as ações combinadas, com responsável, prazo e o resultado esperado em R$.",
};

export function infoPilar(rota: string): InfoPilar | undefined {
  return [...PILARES, PLANO].find((p) => p.rota === rota);
}
