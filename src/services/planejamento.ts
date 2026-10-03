import { invoke } from "@tauri-apps/api/core";
import type { Lancamento } from "../types/accounting";

export interface LimiteMes {
  categoria_id: string;
  mes: string;
  limite_centavos: number;
}

export interface ParcelaTabela {
  numero: number;
  vencimento: string;
  parcela: number;
  juros: number;
  amortizacao: number;
  saldo_depois: number;
}

export interface Emprestimo {
  id: string;
  nome: string;
  sistema: "PRICE" | "SAC";
  principal_centavos: number;
  taxa_mensal: number;
  parcelas: number;
  primeiro_vencimento: string;
  conta_passivo_id: string;
  saldo_devedor_centavos: number;
  pagas: number[];
  tabela: ParcelaTabela[];
}

export interface AReceber {
  id: string;
  pessoa: string;
  descricao: string;
  valor_centavos: number;
  data: string;
  recebido_em: string | null;
  perdoado: boolean;
}

export const planejamento = {
  listarOrcamentosMes: () => invoke<LimiteMes[]>("listar_orcamentos_mes"),
  definirOrcamentoMes: (categoriaId: string, mes: string, limiteCentavos: number | null) => invoke<void>("definir_orcamento_mes", { categoriaId, mes, limiteCentavos }),
  definirAcumulo: (categoriaId: string, acumular: boolean, desde: string | null) => invoke<void>("definir_acumulo_orcamento", { categoriaId, acumular, desde }),
  vincularMetaConta: (metaId: string, contaId: string | null) => invoke<void>("vincular_meta_conta", { metaId, contaId }),
  aportarMetaComConta: (metaId: string, valorCentavos: number, data: string, contaOrigemId: string) => invoke<Lancamento>("aportar_meta_com_conta", { metaId, valorCentavos, data, contaOrigemId }),
  vincularRadarMeta: (itemId: string, metaId: string | null) => invoke<void>("vincular_radar_meta", { itemId, metaId }),
  criarEmprestimo: (input: { nome: string; sistema: "PRICE" | "SAC"; principal_centavos: number; taxa_mensal: number; parcelas: number; primeiro_vencimento: string; conta_destino_id: string | null; data_contratacao?: string | null }) =>
    invoke<string>("criar_emprestimo", { input }),
  listarEmprestimos: () => invoke<Emprestimo[]>("listar_emprestimos"),
  pagarParcela: (emprestimoId: string, contaId: string, data: string) => invoke<Lancamento>("pagar_parcela_emprestimo", { emprestimoId, contaId, data }),
  listarAReceber: () => invoke<AReceber[]>("listar_a_receber"),
  registrarDivisao: (input: { descricao: string; data: string; conta_id: string; categoria_id: string | null; minha_parte_centavos: number; partes: Array<{ pessoa: string; valor_centavos: number }> }) =>
    invoke<Lancamento>("registrar_divisao", { input }),
  receber: (ids: string[], contaId: string, data: string) => invoke<Lancamento>("receber_valores", { ids, contaId, data }),
  perdoar: (id: string, data: string) => invoke<void>("perdoar_valor", { id, data }),
  receberParte: (id: string, valorCentavos: number, contaId: string, data: string) => invoke<Lancamento>("receber_parte_valor", { id, valorCentavos, contaId, data }),
  renomearPessoa: (antigo: string, novo: string) => invoke<number>("renomear_pessoa", { antigo, novo }),
  excluirDivisao: (id: string) => invoke<number>("excluir_divisao", { id }),
};
