export type Origem = "EXEMPLO" | "REAL";
/** Origem de uma tela inteira: MISTO quando parte dos blocos é real e parte é exemplo */
export type OrigemTela = Origem | "MISTO";
/** Blocos da tela que ainda são exemplo, para marcar só eles */
export type BlocosExemplo = Record<string, boolean>;

/** Tipo do canal: é o que as telas comparam (iFood x canal próprio x salão) */
export type TipoCanal = "ifood" | "proprio" | "salao";
export const TIPOS_CANAL: TipoCanal[] = ["ifood", "proprio", "salao"];
export const NOME_TIPO: Record<TipoCanal, string> = { ifood: "iFood", proprio: "Canal próprio", salao: "Salão" };
/** Id livre de um canal de venda do cliente, ex.: "jerrys-ifood". Um cliente pode ter vários canais do mesmo tipo (um por operação). */
export type CanalId = string;

export type DiaSemana = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";

export type Periodo = "ontem" | "7d" | "30d" | "mes";
export const PERIODOS: { id: Periodo; rotulo: string; comparacao: string }[] = [
  { id: "ontem", rotulo: "Ontem", comparacao: "contra o mesmo dia da semana passada" },
  { id: "7d", rotulo: "7 dias", comparacao: "contra os 7 dias anteriores" },
  { id: "30d", rotulo: "30 dias", comparacao: "contra os 30 dias anteriores" },
  { id: "mes", rotulo: "Mês", comparacao: "contra os mesmos dias do mês passado" },
];

export type Situacao = "bom" | "atencao" | "alerta";

export interface ConfigCanal {
  nome: string;
  /** sem o campo, o tipo é o próprio id do canal ("ifood", "proprio", "salao") */
  tipo?: TipoCanal;
  /** operação (marca/loja) dona do canal, quando o cliente tem mais de uma */
  operacao?: string;
  /** % do valor do pedido que sai em comissão e taxas */
  taxaPct: number;
  /** R$ fixos por pedido: embalagem, entrega bancada */
  custoPorPedido: number;
}

export interface Limites {
  metaMinimaPct: number;
  margemMinimaPct: number;
  quedaPedidosPct: number;
  ifoodMaximoPct: number;
  quedaTicketPct: number;
}

export interface Cliente {
  origem: Origem;
  slug: string;
  nome: string;
  segmento: string;
  /** null = meta ainda não cadastrada ([PREENCHER]) */
  metaPorDiaSemana: Record<DiaSemana, number> | null;
  impostoPct: number;
  canais: Record<CanalId, ConfigCanal>;
  /** de onde vêm os dados reais, para mostrar na tela */
  fonte?: string;
  /** premissas e lacunas do cálculo de margem */
  notaMargem?: string;
  limites: Limites;
}

export interface VendaCanal {
  faturamento: number;
  pedidos: number;
  /** CMV do canal no dia, quando cada operação tem o seu; sem o campo, o CMV do dia é rateado pelo faturamento */
  cmv?: number;
}

export interface DiaVendas {
  /** AAAA-MM-DD */
  data: string;
  canais: Record<CanalId, VendaCanal>;
  /** custo de mercadoria vendida do dia, em R$ */
  cmv: number;
  producao?: { pizzas: number; perdas: number };
}

export interface Metricas {
  origem: Origem;
  /** true quando o CMV do dia é estimado (ex.: % médio das fichas aplicado ao faturamento) */
  cmvEstimado?: boolean;
  dias: DiaVendas[];
}

export interface Prato {
  id: string;
  nome: string;
  precoIfood: number;
  cmvUnitario: number;
}

export interface Promocao {
  id: string;
  nome: string;
  tipo: string;
  quemBanca: string;
}

export interface ResultadoPromoDia {
  pedidos: number;
  faturamento: number;
  /** quanto o restaurante bancou, em R$ */
  custo: number;
}

export interface FunilDia {
  data: string;
  visitas: number;
  cardapio: number;
  sacola: number;
  pedidos: number;
}

export interface Ifood {
  origem: Origem;
  comissaoPct: number;
  taxaPagamentoPct: number;
  embalagemPorItem: number;
  pratos: Prato[];
  promocoes: Promocao[];
  vendasPratosDia: { data: string; qtd: Record<string, number> }[];
  promocoesDia: { data: string; promocoes: Record<string, ResultadoPromoDia> }[];
  funilDia: FunilDia[];
  pedidosPorFaixaDia: { data: string; faixas: Record<string, number> }[];
  operacaoDia: { data: string; nota: number; tempoEntregaMin: number; cancelados: number }[];
}

export type StatusCampanha = "ativa" | "pausada" | "em_analise";

export interface Campanha {
  id: string;
  nome: string;
  status: StatusCampanha;
  objetivo: string;
  orcamentoDia: number;
}

export interface Criativo {
  id: string;
  nome: string;
  campanhaId: string;
  formato: string;
}

export interface ResultadoAnuncio {
  investimento: number;
  impressoes: number;
  cliques: number;
  /** pedidos atribuídos pelo pixel */
  pedidos: number;
  faturamento: number;
}

export interface CanalProprio {
  origem: Origem;
  metaPctCanalProprio: number;
  campanhas: Campanha[];
  criativos: Criativo[];
  anunciosDia: { data: string; criativos: Record<string, ResultadoAnuncio> }[];
  /** alcance não se soma dia a dia (a mesma pessoa conta uma vez), por isso vem pronto por período */
  alcance: Record<Periodo, Comparacao>;
}

export interface Ficha {
  id: string;
  nome: string;
  categoria: string;
  /** preço no salão e no canal próprio */
  preco: number;
  /** custo da ficha técnica (CMV por unidade) */
  custo: number;
  /** operação (marca/loja) do prato, quando o cliente tem mais de uma */
  operacao?: string;
  /** custo estimado, sem ficha completa */
  estimado?: boolean;
  /** de onde saiu o custo */
  base?: string;
}

export interface Lucro {
  origem: Origem;
  metaCmvPct: number | null;
  metaMargemPct: number | null;
  metaFaturamentoMes: number | null;
  fichas: Ficha[];
  vendasPratosDia: { data: string; qtd: Record<string, number> }[];
  /** quando só existe o total de uma janela fixa (ex.: relatório de 90 dias), no lugar do dia a dia */
  vendasPratos?: { inicio: string; fim: string; qtd: Record<string, number> };
}

export interface Comparacao {
  atual: number;
  anterior: number;
}

export interface Segmento {
  id: string;
  nome: string;
  criterio: string;
  clientes: number;
  comOptIn: number;
  /** faturamento do segmento nos últimos 90 dias */
  valor90d: number;
  acao: string;
}

export interface Disparo {
  id: string;
  data: string;
  segmento: string;
  mensagem: string;
  enviados: number;
  respostas: number;
  pedidos: number;
  faturamento: number;
}

export interface DisparoAgendado {
  data: string;
  hora: string;
  segmento: string;
  mensagem: string;
}

export interface Crm {
  origem: Origem;
  custoPorMensagem: number;
  resumo: {
    baseTotal: number;
    comOptIn: number;
    novosComOptIn: Record<Periodo, Comparacao>;
    novosClientes: Record<Periodo, Comparacao>;
  };
  segmentos: Segmento[];
  disparos: Disparo[];
  proximos: DisparoAgendado[];
}

export interface WhatsappDia {
  data: string;
  conversas: number;
  pedidos: number;
  faturamento: number;
  sugestoes: number;
  sugestoesAceitas: number;
  valorAdicionais: number;
  followups: number;
  followupsRespondidos: number;
  pedidosRecuperados: number;
  transferencias: Record<string, number>;
}

export type AutorMensagem = "cliente" | "ia" | "humano";

export interface Conversa {
  id: string;
  /** sempre anonimizado: "Cliente 4821" */
  cliente: string;
  inicio: string;
  desfecho: "pedido" | "sem_pedido" | "humano" | "recuperado";
  mensagens: { autor: AutorMensagem; texto: string }[];
}

export interface Whatsapp {
  origem: Origem;
  dias: WhatsappDia[];
  conversas: Conversa[];
  regras: string[];
}

export type TipoAlerta = "meta" | "margem" | "pedidos" | "ifood" | "ticket";

export type SituacaoAcao = "a_fazer" | "fazendo" | "feito";

export interface AcaoPlano {
  id: string;
  pilar: PilarId;
  acao: string;
  responsavel: string;
  prazo: string;
  situacao: SituacaoAcao;
  /** resultado esperado por mês, em R$ de margem */
  resultadoEsperadoMes: number;
}

export interface Plano {
  origem: Origem;
  acoesPorAlerta: Record<TipoAlerta, string[]>;
  acoesPadrao: string[];
  acoes: AcaoPlano[];
}

/** Resultado agregado de um ou mais dias de venda */
export interface ResumoVendas {
  faturamento: number;
  pedidos: number;
  ticket: number;
  cmv: number;
  margem: number;
  margemPct: number;
  /** por tipo de canal (soma das operações) */
  canalPct: Record<TipoCanal, number>;
  faturamentoCanal: Record<TipoCanal, number>;
  pedidosCanal: Record<TipoCanal, number>;
  /** por canal de venda (cada operação separada) */
  porCanal: Record<CanalId, { faturamento: number; pedidos: number }>;
}

export interface Alerta {
  tipo: TipoAlerta | "nenhum";
  texto: string;
}

export interface ComandaDoDia {
  numero: number;
  data: string;
  emitidaEm: string;
  meta: number | null;
  metaPct: number | null;
  situacaoMeta: Situacao | null;
  resumo: ResumoVendas;
  alerta: Alerta;
  acoes: string[];
}

export type PilarId = "ifood" | "canal-proprio" | "crm" | "whatsapp" | "lucro" | "metricas";

export interface IndicadorPilar {
  pilar: PilarId;
  rotulo: string;
  valor: string;
  /** variação relativa contra o período anterior (0,08 = +8%) ou null se não houver base */
  variacao: number | null;
  /** quando a variação é em pontos percentuais, mostramos "p.p." */
  variacaoEmPontos?: boolean;
  situacao: Situacao | null;
  origem: Origem;
}

export interface PontoGrafico {
  data: string;
  faturamento: number;
  meta: number | null;
}

export interface Hoje {
  cliente: Cliente;
  comanda: ComandaDoDia;
  pilares: IndicadorPilar[];
  grafico: PontoGrafico[];
  origem: OrigemTela;
}

/** Uma linha da tela raiz "Todos os restaurantes" */
export interface LinhaRestaurante {
  slug: string;
  nome: string;
  segmento: string;
  /** null quando o restaurante ainda não tem nenhum dia de venda no banco */
  ultimoDia: string | null;
  faturamento: number;
  pedidos: number;
  meta: number | null;
  metaPct: number | null;
  alerta: Alerta;
  pilares: { pilar: PilarId; rotulo: string; valor: string; situacao: Situacao | null }[];
  origem: OrigemTela;
}

/* ---------- Visões prontas para as telas (saída de src/lib/dados.ts) ---------- */

export interface VisaoIfood {
  origem: OrigemTela;
  exemplo: BlocosExemplo;
  frase: string;
  margemMinimaPct: number;
  indicadores: {
    faturamento: Comparacao;
    pedidos: Comparacao;
    ticket: Comparacao;
    nota: Comparacao;
    tempoEntregaMin: Comparacao;
    cancelamentoPct: Comparacao;
  };
  taxaEfetiva: {
    faturamento: number;
    comissao: number;
    taxaPagamento: number;
    promocoes: number;
    total: number;
    pct: number;
    pctAnterior: number;
  };
  pratos: {
    id: string;
    nome: string;
    qtd: number;
    faturamento: number;
    margemUnitaria: number;
    margemPct: number;
    margemTotal: number;
    vendeMuitoMargemBaixa: boolean;
  }[];
  promocoes: {
    id: string;
    nome: string;
    tipo: string;
    pedidos: number;
    faturamento: number;
    custo: number;
    margemDosPedidos: number;
    resultado: number;
  }[];
  funil: { etapas: { rotulo: string; valor: number }[]; conversao: number; conversaoAnterior: number };
  pedidosDia: { data: string; pedidos: number }[];
  faixas: { faixa: string; pedidos: number }[];
}

export interface VisaoCanalProprio {
  origem: OrigemTela;
  exemplo: BlocosExemplo;
  canais: TipoCanal[];
  frase: string;
  metaPct: number | null;
  proprioPct: Comparacao;
  semanas: { inicio: string; ifood: number; proprio: number; salao: number }[];
  economia: {
    pedidos: number;
    faturamento: number;
    custoSeFosseIfood: number;
    custoNoCanalProprio: number;
    economia: number;
  };
  trafego: {
    investimento: Comparacao;
    alcance: Comparacao;
    impressoes: number;
    cliques: number;
    pedidos: Comparacao;
    custoPorPedido: Comparacao;
    faturamento: number;
    roas: number;
    margem: number;
    roasMargem: number;
    sobraDepoisDoAnuncio: number;
  };
  criativos: {
    id: string;
    nome: string;
    formato: string;
    campanha: string;
    investimento: number;
    pedidos: number;
    custoPorPedido: number | null;
    marca: "melhor" | "pior" | null;
  }[];
  campanhas: (Campanha & { investimento: number; pedidos: number; custoPorPedido: number | null })[];
}

export interface VisaoCrm {
  origem: OrigemTela;
  frase: string;
  base: { total: number; comOptIn: number; pctOptIn: number };
  novos: Comparacao;
  novosComOptIn: Comparacao;
  segmentos: (Segmento & { pctOptIn: number })[];
  disparos: (Disparo & { nomeSegmento: string; custo: number })[];
  totaisDisparos: { enviados: number; respostas: number; pedidos: number; faturamento: number; custo: number };
  ultimoDisparo: string | null;
  proximos: (DisparoAgendado & { nomeSegmento: string; disparaveis: number; foraDoDisparo: number })[];
}

export interface VisaoWhatsapp {
  origem: OrigemTela;
  exemplo: BlocosExemplo;
  frase: string;
  conversas: Comparacao;
  pedidos: Comparacao;
  conversao: Comparacao;
  ticketWhatsapp: number;
  ticketGeral: number;
  faturamento: number;
  vendaSugestiva: { sugestoes: number; aceitas: number; taxaAceite: number; valor: number; margem: number };
  followups: { enviados: number; respondidos: number; recuperados: number; faturamentoRecuperado: number };
  transferencias: { motivo: string; quantidade: number }[];
  conversasRecentes: Conversa[];
  cardapio: { nome: string; categoria: string; preco: number; margem: number; margemPct: number }[];
  regras: string[];
}

export type Quadrante = "estrela" | "cavalo" | "joia" | "rever";

export interface VisaoLucro {
  origem: OrigemTela;
  exemplo: BlocosExemplo;
  frase: string;
  notaMargem: string | null;
  cmvEstimado: boolean;
  /** "03/07 a 01/10" quando as quantidades vêm de uma janela fixa, não do período escolhido */
  janelaVendas: string | null;
  cmv: { valor: number; pct: number; pctAnterior: number; meta: number | null };
  margem: { valor: number; pct: number; pctAnterior: number; meta: number | null };
  porCanal: { canal: CanalId; nome: string; tipo: TipoCanal; operacao: string | null; faturamento: number; margem: number; margemPct: number }[];
  pratos: {
    id: string;
    nome: string;
    categoria: string;
    preco: number;
    custo: number;
    cmvPct: number;
    margem: number;
    qtd: number;
    quadrante: Quadrante;
    estimado: boolean;
    base: string | null;
  }[];
  cortes: { qtd: number; margem: number };
  metasMes: {
    mes: string;
    diasPassados: number;
    diasNoMes: number;
    itens: { id: string; rotulo: string; meta: number | null; realizado: number; projecao: number | null; tipo: "brl" | "pct"; menorMelhor?: boolean }[];
  };
}

export interface LinhaDiaria {
  data: string;
  faturamento: number;
  meta: number | null;
  pedidos: number;
  ticket: number;
  margem: number;
  pizzas: number | null;
  perdas: number | null;
}

export interface VisaoMetricas {
  origem: OrigemTela;
  temMeta: boolean;
  margemEstimada: boolean;
  frase: string;
  meses: { mes: string; dias: { data: string; faturamento: number; meta: number | null; situacao: Situacao | null }[] }[];
  tabela: LinhaDiaria[];
  mensagem: string;
  alertas: { data: string; tipo: TipoAlerta; texto: string }[];
}
