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
