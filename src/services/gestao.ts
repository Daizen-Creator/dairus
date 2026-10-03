import { invoke } from "@tauri-apps/api/core";

export interface UsoDaConta {
  lancamentos: number;
  saldo_inicial: number;
  agendamentos: number;
  subcategorias: number;
  sistema: boolean;
}

export const gestao = {
  usoDaConta: (contaId: string) => invoke<UsoDaConta>("uso_da_conta", { contaId }),
  /** Devolve quantos lançamentos foram apagados junto. */
  excluirConta: (contaId: string, apagarHistorico: boolean) => invoke<number>("excluir_conta", { contaId, apagarHistorico }),
  /** Junta a origem no destino (mesmo tipo) e apaga a origem. */
  mesclarContas: (origemId: string, destinoId: string) => invoke<number>("mesclar_contas", { origemId, destinoId }),
};

export const gestaoLancamentos = {
  /** Troca uma conta/categoria do lançamento por outra do mesmo tipo. */
  trocarConta: (lancamentoId: string, contaAtual: string, contaNova: string) => invoke<void>("trocar_conta_lancamento", { lancamentoId, contaAtual, contaNova }),
  /** Apaga de vez (com estornos/correções ligados). */
  excluir: (ids: string[]) => invoke<number>("excluir_lancamentos", { ids }),
};
