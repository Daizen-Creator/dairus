// Estorno de vários lançamentos de uma vez: segue mesmo quando algum é recusado (compra com
// reembolso, divisão já recebida, operação de investimento...) e, no fim, diz o que foi feito.

export interface FalhaDoLote {
  /** Descrição do lançamento recusado (para a pessoa reconhecer). */
  descricao: string;
  motivo: string;
}

export interface ResultadoDoLote {
  feitos: number;
  falhas: FalhaDoLote[];
}

/** "Command error: Não é possível…" → "Não é possível…" (tira prefixos técnicos do erro). */
export function motivoLegivel(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro);
  return texto.replace(/^(Error|Command error):\s*/i, "").trim() || "Não foi possível estornar.";
}

/**
 * Estorna um por um, sem parar no primeiro recusado. `estornar` lança erro quando o lançamento
 * não pode ser estornado; `descricaoDe` dá o nome mostrado na lista de recusados.
 */
export async function estornarEmLote(ids: Iterable<string>, estornar: (id: string) => Promise<unknown>, descricaoDe: (id: string) => string): Promise<ResultadoDoLote> {
  let feitos = 0;
  const falhas: FalhaDoLote[] = [];
  for (const id of ids) {
    try {
      await estornar(id);
      feitos++;
    } catch (e) {
      falhas.push({ descricao: descricaoDe(id), motivo: motivoLegivel(e) });
    }
  }
  return { feitos, falhas };
}

/** Texto do resumo: tudo certo, parcial ou nada estornado. */
export function resumoDoLote(r: ResultadoDoLote): { tipo: "sucesso" | "aviso" | "erro"; texto: string } {
  if (r.falhas.length === 0) return { tipo: "sucesso", texto: `${r.feitos} lançamento(s) estornado(s).` };
  const lista = r.falhas.slice(0, 5).map((f) => `• ${f.descricao}: ${f.motivo}`).join("\n");
  const resto = r.falhas.length > 5 ? `\n… e mais ${r.falhas.length - 5}.` : "";
  const cabeca = r.feitos > 0 ? `${r.feitos} estornado(s); ${r.falhas.length} não pôde(ram) ser estornado(s):` : `Nenhum foi estornado (${r.falhas.length} recusado(s)):`;
  return { tipo: r.feitos > 0 ? "aviso" : "erro", texto: `${cabeca}\n${lista}${resto}` };
}
