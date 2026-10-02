import { invoke } from "@tauri-apps/api/core";
import type {
  Agendamento,
  Conta,
  DespesaInput,
  Lancamento,
  NovaContaInput,
  NovoAgendamentoInput,
  NovoLancamentoInput,
  RecebimentoInput,
  ResumoDashboard,
  TransferenciaInput,
} from "../types/accounting";

// Única porta de entrada para o backend Rust. Nenhum componente deve
// chamar `invoke` diretamente — assim, se um comando mudar de nome ou de
// forma, só este arquivo precisa mudar.
export const contabilidade = {
  listarContas: () => invoke<Conta[]>("listar_contas"),

  criarConta: (input: NovaContaInput) => invoke<Conta>("criar_conta", { input }),

  obterSaldoConta: (contaId: string) =>
    invoke<number>("obter_saldo_conta", { contaId }),

  criarLancamento: (input: NovoLancamentoInput) =>
    invoke<Lancamento>("criar_lancamento", { input }),

  estornarLancamento: (lancamentoId: string) =>
    invoke<Lancamento>("estornar_lancamento", { lancamentoId }),

  listarLancamentos: (limite = 100) =>
    invoke<Lancamento[]>("listar_lancamentos", { limite }),

  obterResumoDashboard: (dataInicio: string, dataFim: string) =>
    invoke<ResumoDashboard>("obter_resumo_dashboard", {
      dataInicio,
      dataFim,
    }),

  registrarRecebimento: (input: RecebimentoInput) =>
    invoke<Lancamento>("registrar_recebimento", { input }),

  registrarDespesa: (input: DespesaInput) =>
    invoke<Lancamento>("registrar_despesa", { input }),

  registrarTransferencia: (input: TransferenciaInput) =>
    invoke<Lancamento>("registrar_transferencia", { input }),

  criarAgendamento: (input: NovoAgendamentoInput) =>
    invoke<Agendamento>("criar_agendamento", { input }),

  listarAgendamentos: () => invoke<Agendamento[]>("listar_agendamentos"),

  pagarAgendamento: (agendamentoId: string, contaOrigemId: string, dataPagamento: string) =>
    invoke<Lancamento>("pagar_agendamento", { agendamentoId, contaOrigemId, dataPagamento }),

  excluirAgendamento: (agendamentoId: string) =>
    invoke<void>("excluir_agendamento", { agendamentoId }),
};
