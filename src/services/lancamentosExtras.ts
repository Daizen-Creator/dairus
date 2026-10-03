import { invoke } from "@tauri-apps/api/core";
import type { Lancamento } from "../types/accounting";

export interface InfoAnexo {
  id: string;
  lancamento_id: string | null;
  nome: string;
  mime: string;
  tamanho: number;
  criado_em: string;
}

export interface RegraCategoria {
  id: string;
  padrao: string;
  categoria_id: string;
}

export const lancExtras = {
  definirTags: (lancamentoId: string, tags: string[]) => invoke<string[]>("definir_tags", { lancamentoId, tags }),
  listarTags: () => invoke<Array<{ lancamento_id: string; tag: string }>>("listar_tags"),
  anexar: async (lancamentoId: string, arquivo: File) =>
    invoke<InfoAnexo>("anexar_arquivo", { lancamentoId, nome: arquivo.name, mime: arquivo.type || "application/octet-stream", conteudo: Array.from(new Uint8Array(await arquivo.arrayBuffer())) }),
  listarAnexos: () => invoke<InfoAnexo[]>("listar_anexos"),
  abrirAnexo: async (id: string) => {
    const caminho = await invoke<string>("abrir_anexo", { id });
    const { openPath } = await import("@tauri-apps/plugin-opener");
    await openPath(caminho);
  },
  excluirAnexo: (id: string) => invoke<void>("excluir_anexo", { id }),
  listarRegras: () => invoke<RegraCategoria[]>("listar_regras"),
  salvarRegra: (padrao: string, categoriaId: string) => invoke<void>("salvar_regra", { padrao, categoriaId }),
  excluirRegra: (id: string) => invoke<void>("excluir_regra", { id }),
  processarAutomaticos: (hoje: string) => invoke<Lancamento[]>("processar_agendamentos_automaticos", { hoje }),
};

/** "viagem, Presente;  natal" → ["viagem", "presente", "natal"] */
export function lerTags(texto: string): string[] {
  return [...new Set(texto.split(/[,;]+/).map((t) => t.trim().replace(/^#/, "").toLowerCase()).filter(Boolean))];
}
