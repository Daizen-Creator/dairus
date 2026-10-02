// Espelham os DTOs de src-tauri/src/investimentos.rs.

export type ClasseAtivo = "ACAO" | "FII" | "ETF" | "BDR" | "TESOURO" | "CDB" | "LCI" | "LCA" | "POUPANCA" | "CRIPTO" | "PREVIDENCIA" | "OUTRO";
export type Indexador = "CDI" | "SELIC" | "IPCA" | "PRE";
export type TipoOperacao = "COMPRA" | "VENDA" | "DIVIDENDO" | "JCP" | "RENDIMENTO" | "AMORTIZACAO";
export type Risco = "BAIXO" | "MEDIO" | "ALTO";

export interface AtivoInvest {
  id: string;
  codigo: string;
  nome: string | null;
  classe: ClasseAtivo;
  indexador: Indexador | null;
  taxa: number | null;
  vencimento: string | null;
  objetivo: string | null;
  setor: string | null;
  risco: Risco | null;
  moeda: string;
  cotacao: number | null;
  cotacao_em: string | null;
  alerta_acima: number | null;
  alerta_abaixo: number | null;
  ativo: boolean;
  notas: string | null;
  quantidade: number;
  custo_centavos: number;
  preco_medio: number;
  proventos_centavos: number;
  lucro_realizado_centavos: number;
  primeira_compra: string | null;
}

export interface AtivoInput {
  id?: string | null;
  codigo: string;
  nome?: string | null;
  classe: ClasseAtivo;
  indexador?: Indexador | null;
  taxa?: number | null;
  vencimento?: string | null;
  objetivo?: string | null;
  setor?: string | null;
  risco?: Risco | null;
  moeda?: string | null;
  alerta_acima?: number | null;
  alerta_abaixo?: number | null;
  notas?: string | null;
}

export interface OperacaoInvest {
  id: string;
  ativo_id: string;
  tipo: TipoOperacao;
  data: string;
  quantidade: number;
  preco_unitario: number;
  taxas_centavos: number;
  valor_centavos: number;
  ir_retido_centavos: number;
  custo_centavos: number | null;
  day_trade: boolean;
  conta_id: string | null;
  lancamento_id: string | null;
  notas: string | null;
}

export interface OperacaoInput {
  ativo_id: string;
  tipo: TipoOperacao;
  data: string;
  quantidade?: number;
  preco_unitario?: number;
  taxas_centavos?: number;
  valor_centavos?: number | null;
  ir_retido_centavos?: number;
  day_trade?: boolean;
  conta_id?: string | null;
  notas?: string | null;
}

export interface PontoIndicador {
  data: string;
  valor: number;
}

export const CONTA_JA_TINHA = "patrimonio-saldo-inicial";

export const ROTULO_CLASSE: Record<ClasseAtivo, string> = {
  ACAO: "Ações",
  FII: "FIIs",
  ETF: "ETFs",
  BDR: "BDRs",
  TESOURO: "Tesouro Direto",
  CDB: "CDB",
  LCI: "LCI",
  LCA: "LCA",
  POUPANCA: "Poupança",
  CRIPTO: "Cripto",
  PREVIDENCIA: "Previdência",
  OUTRO: "Outros",
};

/** Classes negociadas em bolsa (cotação por ticker). */
export const CLASSES_BOLSA: ClasseAtivo[] = ["ACAO", "FII", "ETF", "BDR"];
/** Classes de renda fixa (valor estimado pelo indexador). */
export const CLASSES_RENDA_FIXA: ClasseAtivo[] = ["TESOURO", "CDB", "LCI", "LCA", "POUPANCA", "PREVIDENCIA"];
