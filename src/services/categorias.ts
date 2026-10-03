// Categorias com subcategorias (Alimentação › Mercado) e sugestão automática
// de categoria pela descrição: regras do usuário primeiro, depois o histórico.

import type { Conta, Lancamento } from "../types/accounting";
import type { RegraCategoria } from "./lancamentosExtras";

/** A categoria-pai só conta se for do mesmo tipo e não for um grupo (subtipo CATEGORIA). */
function pai(c: Conta, porId: Map<string, Conta>): Conta | null {
  const p = c.categoria_pai_id ? porId.get(c.categoria_pai_id) : undefined;
  return p && p.subtipo !== "CATEGORIA" && p.tipo === c.tipo ? p : null;
}

export function nomeCategoria(c: Conta, porId: Map<string, Conta>): string {
  const p = pai(c, porId);
  return p ? `${nomeCategoria(p, porId)} › ${c.nome}` : c.nome;
}

/** Categoria principal (a de cima da árvore). */
export function categoriaRaiz(c: Conta, porId: Map<string, Conta>): Conta {
  const p = pai(c, porId);
  return p ? categoriaRaiz(p, porId) : c;
}

/** Opções para os seletores: subcategorias logo abaixo da categoria principal. */
export function opcoesCategoria(categorias: Conta[], todas: Conta[] = categorias): Array<{ value: string; label: string }> {
  const porId = new Map(todas.map((c) => [c.id, c]));
  return categorias
    .map((c) => ({ value: c.id, label: nomeCategoria(c, porId) }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

const RUIDO = /\b(pag|pagto|pagamento|compra|cartao|debito|credito|pix|ted|doc|transf|transferencia|enviado|recebido|para|de|em|no|na|com|ltda|me|sa|s\/a|br|www|com\.br)\b/g;

/** "UBER *TRIP 8823 SAO PAULO" → "uber trip sao paulo" (sem números, símbolos e palavras genéricas). */
export function chaveDescricao(descricao: string): string {
  return descricao
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(RUIDO, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Primeira palavra significativa (a "marca"): "uber trip sao paulo" → "uber". */
export const marcaDaDescricao = (descricao: string) => chaveDescricao(descricao).split(" ").find((p) => p.length >= 3) ?? "";

/** Padroniza descrições de extrato: "UBER *TRIP 8823" → "Uber Trip". */
export function padronizarDescricao(descricao: string): string {
  const limpo = descricao.replace(/[*#]+/g, " ").replace(/\b\d{3,}\b/g, " ").replace(/\s+/g, " ").trim();
  if (limpo !== limpo.toUpperCase()) return limpo;
  return limpo.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
}

export interface Sugestao {
  categoriaId: string;
  motivo: "REGRA" | "HISTORICO";
  padrao: string;
}

/**
 * Sugere a categoria de uma descrição. Regras ("descrição contém X") valem
 * primeiro, das mais específicas para as mais curtas; depois, a categoria
 * usada da última vez num lançamento com a mesma marca.
 */
export function sugerirCategoria(descricao: string, tipo: "DESPESA" | "RECEITA", regras: RegraCategoria[], lancamentos: Lancamento[], contas: Conta[]): Sugestao | null {
  const chave = chaveDescricao(descricao);
  if (!chave) return null;
  const porId = new Map(contas.map((c) => [c.id, c]));
  const valida = (id: string) => porId.get(id)?.tipo === tipo && porId.get(id)?.ativa !== false;
  const regra = [...regras].sort((a, b) => b.padrao.length - a.padrao.length).find((r) => chave.includes(chaveDescricao(r.padrao) || r.padrao.toLowerCase()) && valida(r.categoria_id));
  if (regra) return { categoriaId: regra.categoria_id, motivo: "REGRA", padrao: regra.padrao };
  const marca = marcaDaDescricao(descricao);
  if (!marca) return null;
  for (const l of lancamentos) {
    if (l.origem === "ESTORNO" || marcaDaDescricao(l.descricao) !== marca) continue;
    const cat = l.partidas.map((p) => porId.get(p.conta_id)).find((c) => c?.tipo === tipo);
    if (cat && valida(cat.id)) return { categoriaId: cat.id, motivo: "HISTORICO", padrao: marca };
  }
  return null;
}

/**
 * Soma o gasto das subcategorias na categoria principal (para comparar com o
 * limite do orçamento). Não use o resultado para totais gerais: duplicaria.
 */
export function somarSubcategorias(gastoPorCategoria: Map<string, number>, contas: Conta[]): Map<string, number> {
  const porId = new Map(contas.map((c) => [c.id, c]));
  const saida = new Map(gastoPorCategoria);
  for (const [id, valor] of gastoPorCategoria) {
    let atual = porId.get(id);
    while (atual && pai(atual, porId)) {
      atual = pai(atual, porId)!;
      saida.set(atual.id, (saida.get(atual.id) ?? 0) + valor);
    }
  }
  return saida;
}
