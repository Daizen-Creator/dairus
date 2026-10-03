import { invoke } from "@tauri-apps/api/core";
import type { AtivoInput, AtivoInvest, OperacaoInput, OperacaoInvest, PontoIndicador } from "../types/investimentos";

export const investimentos = {
  listarAtivos: () => invoke<AtivoInvest[]>("listar_ativos_invest"),
  salvarAtivo: (input: AtivoInput) => invoke<string>("salvar_ativo_invest", { input }),
  arquivarAtivo: (id: string, arquivar: boolean) => invoke<void>("arquivar_ativo_invest", { id, arquivar }),
  excluirAtivo: (id: string) => invoke<void>("excluir_ativo_invest", { id }),
  registrarOperacao: (input: OperacaoInput) => invoke<OperacaoInvest>("registrar_operacao_invest", { input }),
  listarOperacoes: (ativoId: string | null = null) => invoke<OperacaoInvest[]>("listar_operacoes_invest", { ativoId }),
  excluirOperacao: (id: string) => invoke<void>("excluir_operacao_invest", { id }),
  atualizarCotacoes: (cotacoes: Array<{ id: string; cotacao: number }>) => invoke<number>("atualizar_cotacoes", { cotacoes }),
  salvarIndicadores: (serie: string, pontos: PontoIndicador[]) => invoke<number>("salvar_indicadores", { serie, pontos }),
  listarIndicadores: (serie: string, desde: string) => invoke<PontoIndicador[]>("listar_indicadores", { serie, desde }),
  buscarJson: <T = unknown>(url: string) => invoke<T>("buscar_json_mercado", { url }),
};

export const investimentosGestao = {
  /** Desdobramento (fator 2) ou grupamento (fator 0,1) até a data. */
  desdobrar: (ativoId: string, fator: number, data: string) => invoke<number>("desdobrar_ativo", { ativoId, fator, data }),
  /** Apaga o ativo com todas as operações e lançamentos ligados. */
  excluirCompleto: (ativoId: string) => invoke<number>("excluir_ativo_completo", { ativoId }),
};
