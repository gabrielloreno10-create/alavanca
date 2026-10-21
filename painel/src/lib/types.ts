/**
 * De onde veio o que a tela mostra. São TRÊS estados, e não dois, porque
 * "não medimos" e "medimos zero" são coisas diferentes — e zero é uma medição.
 *
 *  - REAL      a fonte entregou linha, e toda linha é do cliente.
 *  - EXEMPLO   HÁ linha, mas fomos nós que a semeamos. O número existe e é fabricado:
 *              a tela mostra COM SELO, para o dono não confundir com a casa dele.
 *  - SEM_DADO  NÃO HÁ linha nenhuma. Não existe número para mostrar, nem real nem
 *              fabricado. A tela diz "ainda não medido" e NUNCA desenha zero.
 *
 * O terceiro estado nasceu de um erro medido: `origemDe([])` devolvia "EXEMPLO", então
 * o CRM e o WhatsApp vazios da Le Tre levavam o selo de exemplo sem ter exemplo nenhum,
 * enquanto o Canal próprio (20 campanhas REAIS, zero criativo) se declarava REAL e
 * mostrava investimento R$ 0 e ROAS 0,0x sem aviso. A tela que mais enganava era a única
 * sem selo.
 */
export type Origem = "REAL" | "EXEMPLO" | "SEM_DADO";
/** Origem de uma tela inteira: MISTO quando os blocos não concordam entre si */
export type OrigemTela = Origem | "MISTO";
/**
 * Blocos da tela que são EXEMPLO, para marcar só eles.
 * ATENÇÃO: isto é `false` tanto para REAL quanto para SEM_DADO. Para distinguir os dois
 * a tela precisa de `blocos` (BlocosOrigem), não deste booleano.
 */
export type BlocosExemplo = Record<string, boolean>;
/** Estado completo de cada bloco da tela. É o que permite marcar SEM_DADO. */
export type BlocosOrigem = Record<string, Origem>;

/** Ação recomendada ao dono, carregando de onde ela veio (achado A: as 13 da Le Tre são EXEMPLO) */
export interface AcaoSugerida {
  texto: string;
  origem: Origem;
}

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
  /**
   * Taxas DETALHADAS do fechamento mensal. null = a coluna veio nula no banco, ou seja
   * ninguém mediu — nunca 0. Medido em 20/10/2026: as 5 linhas de canal_taxa_mes da
   * Le Tre têm comissao_pct, taxa_pagamento_pct e embalagem_por_item NULOS.
   */
  comissaoPct: number | null;
  taxaPagamentoPct: number | null;
  embalagemPorItem: number | null;
  /**
   * O take-rate que o fechamento mensal MEDIU de verdade (take_rate_pct de
   * canal_taxa_mes, ponderado pelas vendas brutas). Existe mesmo quando o detalhamento
   * acima não existe: é o número verdadeiro a mostrar no lugar do zero que era falso.
   */
  takeRatePct: number | null;
  /** mês do fechamento de onde saiu o take-rate, "AAAA-MM". NÃO é o período da tela. */
  takeRateMes: string | null;
  /** vendas brutas do fechamento que serviu de base ao take-rate */
  takeRateVendasBrutas: number | null;
  pratos: Prato[];
  promocoes: Promocao[];
  vendasPratosDia: { data: string; qtd: Record<string, number> }[];
  promocoesDia: { data: string; promocoes: Record<string, ResultadoPromoDia> }[];
  funilDia: FunilDia[];
  pedidosPorFaixaDia: { data: string; faixas: Record<string, number> }[];
  /** null em cada campo = sem fonte para aquele indicador naquele dia (achado D) */
  operacaoDia: { data: string; nota: number | null; tempoEntregaMin: number | null; cancelados: number | null }[];
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
  /**
   * null = a chave tenant_config 'canal_proprio.meta_pct' NÃO existe (achado B).
   * Antes devolvia 0, e aí 16% >= 0 pintava o pilar de verde e o Lucro dizia "meta 0,0%".
   */
  metaPctCanalProprio: number | null;
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
  /** cada ação carrega a SUA origem: a tela precisa selar a fabricada uma a uma (achado A) */
  acoesPorAlerta: Record<TipoAlerta, AcaoSugerida[]>;
  acoesPadrao: AcaoSugerida[];
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
  /**
   * SEM_DADO = não existe dia de venda para este filtro. Tudo em `resumo` é zero
   * estrutural, não medição: a tela NÃO pode escrever "R$ 0,00" nem "ticket R$ 0,00".
   */
  origem: Origem;
  numero: number;
  data: string;
  emitidaEm: string;
  meta: number | null;
  metaPct: number | null;
  situacaoMeta: Situacao | null;
  resumo: ResumoVendas;
  /**
   * null = NÃO HÁ dia de venda para avaliar. Diferente de { tipo: "nenhum" }, que afirma
   * "dia dentro do plano". Com o filtro no Jerry's (zero linhas em venda_dia, medido) a
   * Comanda dizia "Nenhum alerta: dia dentro do plano" sobre um dia que não existe.
   */
  alerta: Alerta | null;
  acoes: AcaoSugerida[];
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
  /** null = sem dia de venda para avaliar; ver ComandaDoDia.alerta */
  alerta: Alerta | null;
  pilares: { pilar: PilarId; rotulo: string; valor: string; situacao: Situacao | null }[];
  origem: OrigemTela;
}

/* ---------- Visões prontas para as telas (saída de src/lib/dados.ts) ---------- */

export interface VisaoIfood {
  origem: OrigemTela;
  exemplo: BlocosExemplo;
  /** estado completo por bloco; e aqui que SEM_DADO aparece */
  blocos: BlocosOrigem;
  frase: string;
  margemMinimaPct: number;
  indicadores: {
    faturamento: Comparacao;
    pedidos: Comparacao;
    ticket: Comparacao;
    /** null = ifood_operacao_dia nao tem linha no periodo (achado D). Nunca "nota 0,0". */
    nota: Comparacao | null;
    tempoEntregaMin: Comparacao | null;
    cancelamentoPct: Comparacao | null;
  };
  /**
   * O detalhamento comissao + taxa de pagamento + promocoes.
   * null = comissao e taxa de pagamento nao foram medidas, entao NAO da para afirmar
   * "de cada R$ 100 sobram R$ 100,00". Quando e null, use `takeRateMedido` (achado C).
   */
  taxaEfetiva: {
    faturamento: number;
    comissao: number;
    taxaPagamento: number;
    promocoes: number;
    total: number;
    pct: number;
    pctAnterior: number;
  } | null;
  /** O take-rate medido no fechamento mensal. Verdadeiro mesmo com `taxaEfetiva` null. */
  takeRateMedido: { pct: number; mes: string; vendasBrutas: number } | null;
  pratos: {
    id: string;
    nome: string;
    qtd: number;
    faturamento: number;
    /**
     * null quando comissao/taxa de pagamento/embalagem nao foram medidas: sem elas a
     * margem sairia INFLADA, nao zerada, que e o erro mais caro dos dois.
     */
    margemUnitaria: number | null;
    margemPct: number | null;
    margemTotal: number | null;
    vendeMuitoMargemBaixa: boolean;
  }[];
  promocoes: {
    id: string;
    nome: string;
    tipo: string;
    pedidos: number;
    faturamento: number;
    custo: number;
    /** null pelo mesmo motivo da margem do prato: depende das taxas nao medidas */
    margemDosPedidos: number | null;
    resultado: number | null;
  }[];
  /** null = ifood_funil_dia sem linha no periodo. Mata a largura "NaN%" do funil zerado. */
  funil: { etapas: { rotulo: string; valor: number }[]; conversao: number | null; conversaoAnterior: number | null } | null;
  pedidosDia: { data: string; pedidos: number }[];
  faixas: { faixa: string; pedidos: number }[];
}

export interface VisaoCanalProprio {
  origem: OrigemTela;
  exemplo: BlocosExemplo;
  blocos: BlocosOrigem;
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
    /** null em cada ponta = nao houve pedido atribuido, entao nao ha custo por pedido */
    custoPorPedido: { atual: number | null; anterior: number | null };
    faturamento: number;
    /** null = investimento zero no periodo; "0,0x" afirmaria um retorno nulo medido */
    roas: number | null;
    margem: number;
    roasMargem: number | null;
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
  blocos: BlocosOrigem;
  frase: string;
  /** pctOptIn null = base vazia, nao existe percentual */
  base: { total: number; comOptIn: number; pctOptIn: number | null };
  novos: Comparacao;
  novosComOptIn: Comparacao;
  segmentos: (Segmento & { pctOptIn: number | null })[];
  /** taxaResposta null = nenhum enviado; protege a divisao respostas/enviados (achado E) */
  disparos: (Disparo & { nomeSegmento: string; custo: number; taxaResposta: number | null })[];
  totaisDisparos: { enviados: number; respostas: number; pedidos: number; faturamento: number; custo: number; taxaResposta: number | null };
  ultimoDisparo: string | null;
  proximos: (DisparoAgendado & { nomeSegmento: string; disparaveis: number; foraDoDisparo: number })[];
}

export interface VisaoWhatsapp {
  origem: OrigemTela;
  exemplo: BlocosExemplo;
  blocos: BlocosOrigem;
  frase: string;
  conversas: Comparacao;
  pedidos: Comparacao;
  /** null = nenhuma conversa no periodo: nao ha conversao, e 0% afirmaria que houve */
  conversao: Comparacao | null;
  /** null = nenhum pedido pelo WhatsApp: nao ha ticket */
  ticketWhatsapp: number | null;
  ticketGeral: number;
  faturamento: number;
  vendaSugestiva: { sugestoes: number; aceitas: number; taxaAceite: number | null; valor: number; margem: number };
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
  blocos: BlocosOrigem;
  frase: string;
  notaMargem: string | null;
  cmvEstimado: boolean;
  /** "03/07 a 01/10" quando as quantidades vêm de uma janela fixa, não do período escolhido */
  janelaVendas: string | null;
  /** pct null = nao houve faturamento no periodo: nao existe percentual a afirmar */
  cmv: { valor: number; pct: number | null; pctAnterior: number | null; meta: number | null };
  margem: { valor: number; pct: number | null; pctAnterior: number | null; meta: number | null };
  porCanal: { canal: CanalId; nome: string; tipo: TipoCanal; operacao: string | null; faturamento: number; margem: number; margemPct: number | null }[];
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
  blocos: BlocosOrigem;
  temMeta: boolean;
  margemEstimada: boolean;
  frase: string;
  meses: { mes: string; dias: { data: string; faturamento: number; meta: number | null; situacao: Situacao | null }[] }[];
  tabela: LinhaDiaria[];
  mensagem: string;
  alertas: { data: string; tipo: TipoAlerta; texto: string }[];
}
