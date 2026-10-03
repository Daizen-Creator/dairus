import { invoke } from "@tauri-apps/api/core";
import type { Lancamento } from "../types/accounting";

export interface Fatura {
  id: string;
  cartao_id: string;
  inicio: string;
  fechamento: string;
  vencimento: string;
  valor_centavos: number;
  encargos_lancamento_id: string | null;
}

export interface Adicional {
  id: string;
  cartao_id: string;
  nome: string;
  final_cartao: string | null;
  limite_centavos: number | null;
}

export const cartoes = {
  listarFaturas: () => invoke<Fatura[]>("listar_faturas"),
  congelarFatura: (cartaoId: string, inicio: string, fechamento: string, vencimento: string, valorCentavos: number) =>
    invoke<boolean>("congelar_fatura", { cartaoId, inicio, fechamento, vencimento, valorCentavos }),
  listarConfig: () => invoke<Array<{ cartao_id: string; juros_rotativo: number | null }>>("listar_config_cartoes"),
  definirJuros: (cartaoId: string, jurosMensal: number | null) => invoke<void>("definir_juros_cartao", { cartaoId, jurosMensal }),
  lancarEncargos: (faturaId: string, data: string, valorCentavos: number, detalhe: string) => invoke<Lancamento>("lancar_encargos", { faturaId, data, valorCentavos, detalhe }),
  listarAdicionais: () => invoke<Adicional[]>("listar_adicionais"),
  criarAdicional: (cartaoId: string, nome: string, finalCartao: string | null, limiteCentavos: number | null) =>
    invoke<string>("criar_adicional", { cartaoId, nome, finalCartao, limiteCentavos }),
  excluirAdicional: (id: string) => invoke<void>("excluir_adicional", { id }),
  definirPortador: (lancamentoId: string, adicionalId: string | null) => invoke<void>("definir_portador", { lancamentoId, adicionalId }),
  listarPortadores: () => invoke<Array<{ lancamento_id: string; outro_id: string }>>("listar_portadores"),
  listarReembolsos: () => invoke<Array<{ lancamento_id: string; outro_id: string }>>("listar_reembolsos"),
  registrarReembolso: (compraId: string, valorCentavos: number, data: string, motivo: string | null) =>
    invoke<Lancamento>("registrar_reembolso", { compraId, valorCentavos, data, motivo }),
};
