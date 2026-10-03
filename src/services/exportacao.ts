import { invoke } from "@tauri-apps/api/core";
import { extras } from "./extras";

function celula(valor: string | number): string {
  const texto = String(valor);
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** CSV com ";" e BOM UTF-8: abre direto no Excel em pt-BR, com acentos corretos. */
export function paraCsv(cabecalho: string[], linhas: Array<Array<string | number>>): string {
  const todas = [cabecalho, ...linhas].map((l) => l.map(celula).join(";"));
  return "\uFEFF" + todas.join("\r\n") + "\r\n";
}

export async function exportarCsv(nomeBase: string, cabecalho: string[], linhas: Array<Array<string | number>>) {
  const carimbo = new Date().toISOString().slice(0, 10);
  return extras.salvarExportacao(`${nomeBase}-${carimbo}.csv`, paraCsv(cabecalho, linhas));
}

export const reais = (centavos: number) => (centavos / 100).toFixed(2).replace(".", ",");

export type FormatoColuna = "TEXTO" | "MOEDA" | "DATA" | "NUMERO" | "PERCENTUAL";

export interface ColunaPlanilha {
  titulo: string;
  formato: FormatoColuna;
  largura?: number;
}

/** Uma aba da planilha. Valores de MOEDA vão em centavos; DATA em AAAA-MM-DD. */
export interface AbaPlanilha {
  nome: string;
  colunas: ColunaPlanilha[];
  linhas: Array<Array<string | number | null>>;
  total?: boolean;
}

export const col = (titulo: string, formato: FormatoColuna = "TEXTO", largura?: number): ColunaPlanilha => ({ titulo, formato, largura });

/** Gera um .xlsx de verdade (várias abas, cabeçalho formatado, R$ somável) em Documentos\Dairus\Exportacoes. */
export async function exportarXlsx(nomeBase: string, abas: AbaPlanilha[]) {
  const carimbo = new Date().toISOString().slice(0, 10);
  return invoke<string>("exportar_xlsx", { nomeArquivo: `${nomeBase}-${carimbo}.xlsx`, abas });
}
