import { invoke } from "@tauri-apps/api/core";

export type TipoDocumento = "GARANTIA" | "DOCUMENTO";
export type Repeticao = "MENSAL" | "ANUAL";

export interface Documento {
  id: string;
  tipo: TipoDocumento;
  categoria: string;
  titulo: string;
  numero: string | null;
  loja: string | null;
  valor_centavos: number | null;
  data_compra: string | null;
  garantia_meses: number | null;
  garantia_estendida_meses: number;
  vencimento: string | null;
  repete: Repeticao | null;
  avisar_dias: number;
  lancamento_id: string | null;
  observacao: string | null;
  arquivado: boolean;
  criado_em: string;
  atualizado_em: string;
  /** Quantidade de arquivos guardados. */
  arquivos: number;
}

export interface DocumentoInput {
  id?: string | null;
  tipo: TipoDocumento;
  categoria: string;
  titulo: string;
  numero?: string | null;
  loja?: string | null;
  valor_centavos?: number | null;
  data_compra?: string | null;
  garantia_meses?: number | null;
  garantia_estendida_meses?: number;
  vencimento?: string | null;
  repete?: Repeticao | null;
  avisar_dias: number;
  lancamento_id?: string | null;
  observacao?: string | null;
}

export interface ArquivoDocumento {
  id: string;
  documento_id: string;
  nome: string;
  mime: string;
  tamanho: number;
  criado_em: string;
}

export const documentos = {
  listar: () => invoke<Documento[]>("listar_documentos"),
  salvar: (input: DocumentoInput) => invoke<Documento>("salvar_documento", { input }),
  excluir: (id: string) => invoke<void>("excluir_documento", { id }),
  arquivar: (id: string, arquivado: boolean) => invoke<Documento>("arquivar_documento", { id, arquivado }),
  renovar: (id: string) => invoke<Documento>("renovar_documento", { id }),
  anexar: async (documentoId: string, arquivo: File) =>
    invoke<ArquivoDocumento>("anexar_arquivo_documento", {
      documentoId,
      nome: arquivo.name,
      mime: arquivo.type || "application/octet-stream",
      conteudo: Array.from(new Uint8Array(await arquivo.arrayBuffer())),
    }),
  arquivos: (documentoId: string) => invoke<ArquivoDocumento[]>("listar_arquivos_documento", { documentoId }),
  ler: (id: string) => invoke<number[]>("ler_arquivo_documento", { id }),
  abrir: async (id: string) => {
    const caminho = await invoke<string>("abrir_arquivo_documento", { id });
    const { openPath } = await import("@tauri-apps/plugin-opener");
    await openPath(caminho);
  },
  excluirArquivo: (id: string) => invoke<void>("excluir_arquivo_documento", { id }),
  copiarComprovantes: (documentoId: string, lancamentoId: string) => invoke<number>("copiar_comprovantes_para_documento", { documentoId, lancamentoId }),
};
