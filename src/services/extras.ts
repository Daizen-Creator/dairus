import { invoke } from "@tauri-apps/api/core";
import type { Bem, InfoBackup, ItemRadar, Meta, Orcamento, TipoBem } from "../types/extras";

// Porta de entrada para os módulos de src-tauri/src/extras.rs.
export const extras = {
  listarOrcamentos: () => invoke<Orcamento[]>("listar_orcamentos"),
  definirOrcamento: (categoriaId: string, limiteCentavos: number) =>
    invoke<void>("definir_orcamento", { categoriaId, limiteCentavos }),

  listarMetas: () => invoke<Meta[]>("listar_metas"),
  criarMeta: (nome: string, valorAlvoCentavos: number, prazo: string | null) =>
    invoke<string>("criar_meta", { nome, valorAlvoCentavos, prazo }),
  aportarMeta: (metaId: string, valorCentavos: number, data: string) =>
    invoke<void>("aportar_meta", { metaId, valorCentavos, data }),
  excluirMeta: (metaId: string) => invoke<void>("excluir_meta", { metaId }),

  listarBens: () => invoke<Bem[]>("listar_bens"),
  criarBem: (nome: string, tipo: TipoBem, valorCentavos: number, data: string) =>
    invoke<string>("criar_bem", { nome, tipo, valorCentavos, data }),
  atualizarBem: (bemId: string, valorCentavos: number, data: string) =>
    invoke<void>("atualizar_bem", { bemId, valorCentavos, data }),
  excluirBem: (bemId: string) => invoke<void>("excluir_bem", { bemId }),

  listarRadar: () => invoke<ItemRadar[]>("listar_radar"),
  criarItemRadar: (nome: string, precoAlvoCentavos: number | null) =>
    invoke<string>("criar_item_radar", { nome, precoAlvoCentavos }),
  registrarPrecoRadar: (itemId: string, loja: string, precoCentavos: number, url: string | null, data: string) =>
    invoke<void>("registrar_preco_radar", { itemId, loja, precoCentavos, url, data }),
  excluirItemRadar: (itemId: string) => invoke<void>("excluir_item_radar", { itemId }),

  criarBackup: () => invoke<InfoBackup>("criar_backup"),
  listarBackups: () => invoke<InfoBackup[]>("listar_backups"),
  restaurarBackup: (nome: string) => invoke<InfoBackup>("restaurar_backup", { nome }),
  salvarExportacao: (nomeArquivo: string, conteudo: string) =>
    invoke<string>("salvar_exportacao", { nomeArquivo, conteudo }),
};
