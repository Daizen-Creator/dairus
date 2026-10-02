import { invoke } from "@tauri-apps/api/core";
import type { RegistroAuditoria, AporteComMeta, AporteMeta, Bem, InfoBackup, ItemRadar, Meta, Orcamento, TipoBem } from "../types/extras";

// Porta de entrada para os módulos de src-tauri/src/extras.rs.
export const extras = {
  listarOrcamentos: () => invoke<Orcamento[]>("listar_orcamentos"),
  definirOrcamento: (categoriaId: string, limiteCentavos: number) =>
    invoke<void>("definir_orcamento", { categoriaId, limiteCentavos }),

  listarMetas: () => invoke<Meta[]>("listar_metas"),
  criarMeta: (nome: string, valorAlvoCentavos: number, prazo: string | null, tipo: string | null, prioridade: string | null, notas: string | null) =>
    invoke<string>("criar_meta", { nome, valorAlvoCentavos, prazo, tipo, prioridade, notas }),
  aportarMeta: (metaId: string, valorCentavos: number, data: string) =>
    invoke<void>("aportar_meta", { metaId, valorCentavos, data }),
  excluirMeta: (metaId: string) => invoke<void>("excluir_meta", { metaId }),

  listarBens: () => invoke<Bem[]>("listar_bens"),
  criarBem: (
    nome: string,
    tipo: TipoBem,
    valorCentavos: number,
    data: string,
    categoria: string | null,
    notas: string | null,
    aquisicaoData: string | null,
    aquisicaoValorCentavos: number | null,
  ) => invoke<string>("criar_bem", { nome, tipo, valorCentavos, data, categoria, notas, aquisicaoData, aquisicaoValorCentavos }),
  atualizarBemDetalhes: (
    bemId: string,
    nome: string,
    categoria: string | null,
    notas: string | null,
    aquisicaoData: string | null,
    aquisicaoValorCentavos: number | null,
  ) => invoke<void>("atualizar_bem_detalhes", { bemId, nome, categoria, notas, aquisicaoData, aquisicaoValorCentavos }),
  atualizarBem: (bemId: string, valorCentavos: number, data: string) =>
    invoke<void>("atualizar_bem", { bemId, valorCentavos, data }),
  excluirBem: (bemId: string) => invoke<void>("excluir_bem", { bemId }),

  listarRadar: () => invoke<ItemRadar[]>("listar_radar"),
  criarItemRadar: (nome: string, precoAlvoCentavos: number | null) =>
    invoke<string>("criar_item_radar", { nome, precoAlvoCentavos }),
  registrarPrecoRadar: (itemId: string, loja: string, precoCentavos: number, url: string | null, data: string) =>
    invoke<void>("registrar_preco_radar", { itemId, loja, precoCentavos, url, data }),
  excluirItemRadar: (itemId: string) => invoke<void>("excluir_item_radar", { itemId }),

  atualizarLancamentoInfo: (lancamentoId: string, descricao: string, observacao: string | null, etiqueta: string | null) =>
    invoke<void>("atualizar_lancamento_info", { lancamentoId, descricao, observacao, etiqueta }),
  atualizarAgendamento: (
    agendamentoId: string,
    descricao: string,
    valorCentavos: number,
    vencimento: string,
    etiqueta: string | null,
    recorrencia: string | null,
  ) => invoke<void>("atualizar_agendamento", { agendamentoId, descricao, valorCentavos, vencimento, etiqueta, recorrencia }),
  atualizarConta: (
    contaId: string,
    nome: string,
    instituicao: string | null,
    limiteCentavos: number | null,
    diaFechamentoFatura: number | null,
    diaVencimentoFatura: number | null,
  ) =>
    invoke<void>("atualizar_conta", { contaId, nome, instituicao, limiteCentavos, diaFechamentoFatura, diaVencimentoFatura }),
  arquivarConta: (contaId: string, arquivar: boolean) => invoke<void>("arquivar_conta", { contaId, arquivar }),
  criarCategoria: (nome: string, tipo: "DESPESA" | "RECEITA") => invoke<string>("criar_categoria", { nome, tipo }),
  atualizarMeta: (metaId: string, nome: string, valorAlvoCentavos: number, prazo: string | null, tipo: string | null, prioridade: string | null, notas: string | null) =>
    invoke<void>("atualizar_meta", { metaId, nome, valorAlvoCentavos, prazo, tipo, prioridade, notas }),
  listarTodosAportes: () => invoke<AporteComMeta[]>("listar_todos_aportes"),
  moverEntreMetas: (origemId: string, destinoId: string, valorCentavos: number, data: string) =>
    invoke<void>("mover_entre_metas", { origemId, destinoId, valorCentavos, data }),
  listarAportesMeta: (metaId: string) => invoke<AporteMeta[]>("listar_aportes_meta", { metaId }),
  renomearBem: (bemId: string, nome: string) => invoke<void>("renomear_bem", { bemId, nome }),
  atualizarItemRadar: (itemId: string, nome: string, precoAlvoCentavos: number | null) =>
    invoke<void>("atualizar_item_radar", { itemId, nome, precoAlvoCentavos }),
  excluirPrecoRadar: (precoId: string) => invoke<void>("excluir_preco_radar", { precoId }),

  listarAuditoria: (limite = 200) => invoke<RegistroAuditoria[]>("listar_auditoria", { limite }),

  criarBackup: () => invoke<InfoBackup>("criar_backup"),
  listarBackups: () => invoke<InfoBackup[]>("listar_backups"),
  restaurarBackup: (nome: string) => invoke<InfoBackup>("restaurar_backup", { nome }),
  salvarExportacao: (nomeArquivo: string, conteudo: string) =>
    invoke<string>("salvar_exportacao", { nomeArquivo, conteudo }),
};
