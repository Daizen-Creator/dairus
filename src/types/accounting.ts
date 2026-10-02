// Estes tipos espelham exatamente os DTOs serializados pelo Rust
// (src-tauri/src/accounting/models.rs e engine.rs). Se um campo mudar lá,
// muda aqui — é a única fonte de verdade do contrato IPC.

export type TipoConta = "ATIVO" | "PASSIVO" | "PATRIMONIO" | "RECEITA" | "DESPESA";

export type SubtipoConta =
  | "BANCO"
  | "CARTEIRA_DIGITAL"
  | "DINHEIRO"
  | "INVESTIMENTO"
  | "BENEFICIO"
  | "CARTAO_CREDITO"
  | "EMPRESTIMO"
  | "CATEGORIA"
  | null;

export type Etiqueta = "MENSALIDADE" | "ASSINATURA" | "FIXO";

export type Recorrencia = "SEMANAL" | "MENSAL" | "ANUAL";

export type TipoPartida = "DEBITO" | "CREDITO";

export interface Conta {
  id: string;
  codigo: string;
  nome: string;
  tipo: TipoConta;
  subtipo: SubtipoConta;
  categoria_pai_id: string | null;
  instituicao: string | null;
  saldo_inicial_centavos: number;
  dia_fechamento_fatura: number | null;
  dia_vencimento_fatura: number | null;
  limite_centavos: number | null;
  sistema: boolean;
  ativa: boolean;
  saldo_atual_centavos: number;
}

export interface NovaContaInput {
  codigo: string;
  nome: string;
  tipo: TipoConta;
  subtipo?: SubtipoConta;
  categoria_pai_id?: string | null;
  instituicao?: string | null;
  saldo_inicial_centavos?: number;
  dia_fechamento_fatura?: number | null;
  dia_vencimento_fatura?: number | null;
  limite_centavos?: number | null;
}

export interface Partida {
  id: string;
  conta_id: string;
  tipo: TipoPartida;
  valor_centavos: number;
}

export interface PartidaInput {
  conta_id: string;
  tipo: TipoPartida;
  valor_centavos: number;
}

export interface Lancamento {
  id: string;
  data: string;
  descricao: string;
  observacao: string | null;
  origem: string;
  etiqueta: Etiqueta | null;
  estornado_de: string | null;
  partidas: Partida[];
}

export interface NovoLancamentoInput {
  data: string;
  descricao: string;
  observacao?: string | null;
  origem?: string;
  etiqueta?: Etiqueta | null;
  partidas: PartidaInput[];
}

export interface ResumoDashboard {
  saldo_disponivel_centavos: number;
  patrimonio_liquido_centavos: number;
  receitas_mes_centavos: number;
  despesas_mes_centavos: number;
}

export interface RecebimentoInput {
  conta_destino_id: string;
  conta_receita_id: string;
  valor_centavos: number;
  data: string;
  descricao: string;
}

export interface DespesaInput {
  conta_origem_id: string;
  categoria_despesa_id: string;
  valor_centavos: number;
  data: string;
  descricao: string;
  etiqueta?: Etiqueta | null;
  observacao?: string | null;
}

export interface TransferenciaInput {
  conta_origem_id: string;
  conta_destino_id: string;
  valor_centavos: number;
  data: string;
  descricao: string;
}

// IDs de sistema criados pela migração 0003 — usados por telas que
// precisam de um atalho direto (ex.: tela de Salário) sem pedir pro
// usuário escolher a conta de receita todo mês.
export const CONTAS_SISTEMA = {
  valeAlimentacao: "ativo-vale-alimentacao",
  dinheiro: "ativo-dinheiro",
  patrimonioSaldoInicial: "patrimonio-saldo-inicial",
  receitaSalario: "receita-salario",
  receitaBeneficios: "receita-beneficios",
  receitaRendaExtra: "receita-renda-extra",
  despesaEducacao: "despesa-educacao",
  despesaAlimentacao: "despesa-alimentacao",
  despesaMoradia: "despesa-moradia",
  despesaTransporte: "despesa-transporte",
  despesaLazer: "despesa-lazer",
  despesaSaude: "despesa-saude",
  despesaVestuario: "despesa-vestuario",
  despesaOutras: "despesa-outras",
} as const;

export interface Agendamento {
  id: string;
  descricao: string;
  valor_centavos: number;
  vencimento: string;
  categoria_despesa_id: string;
  etiqueta: Etiqueta | null;
  lancamento_id: string | null;
  pago_em: string | null;
  recorrencia: Recorrencia | null;
}

export interface NovoAgendamentoInput {
  descricao: string;
  valor_centavos: number;
  vencimento: string;
  categoria_despesa_id: string;
  etiqueta?: Etiqueta | null;
  recorrencia?: Recorrencia | null;
}
