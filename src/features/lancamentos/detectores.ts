// Detectores automáticos: duplicata ao lançar à mão, gasto fora do padrão,
// assinaturas que se repetem todo mês e leitura de notificações do banco.

import type { Conta, Lancamento } from "../../types/accounting";
import { chaveDescricao, marcaDaDescricao } from "../../services/categorias";
import { valorInputParaCentavos } from "../../services/formato";

const dias = (a: string, b: string) => Math.abs(Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) - Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))) / 86_400_000;
const valorDe = (l: Lancamento) => l.partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0);

/** Lançamento parecido já existente: mesmo valor, até 2 dias de diferença e mesma marca (ou mesma conta). */
export function possivelDuplicata(nova: { data: string; valorCentavos: number; descricao: string; contaId?: string }, lancamentos: Lancamento[]): Lancamento | null {
  const estornados = new Set(lancamentos.map((l) => l.estornado_de).filter(Boolean));
  const marca = marcaDaDescricao(nova.descricao);
  return (
    lancamentos.find(
      (l) =>
        l.origem !== "ESTORNO" &&
        !estornados.has(l.id) &&
        valorDe(l) === nova.valorCentavos &&
        dias(l.data, nova.data) <= 2 &&
        ((marca && marcaDaDescricao(l.descricao) === marca) || (!!nova.contaId && l.partidas.some((p) => p.conta_id === nova.contaId) && chaveDescricao(l.descricao) === chaveDescricao(nova.descricao))),
    ) ?? null
  );
}

/** Média dos gastos da categoria nos últimos 6 meses (por lançamento). */
export function mediaDaCategoria(categoriaId: string, lancamentos: Lancamento[], hoje: string): { media: number; n: number } {
  const inicio = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 7, 1)).toISOString().slice(0, 10);
  const valores = lancamentos
    .filter((l) => l.origem !== "ESTORNO" && l.data >= inicio && l.partidas.some((p) => p.conta_id === categoriaId && p.tipo === "DEBITO"))
    .map((l) => l.partidas.filter((p) => p.conta_id === categoriaId && p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0));
  return { media: valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : 0, n: valores.length };
}

/** "Mercado custou 3x a sua média; foi isso mesmo?" — só com histórico suficiente. */
export function foraDoPadrao(valorCentavos: number, categoriaId: string, lancamentos: Lancamento[], hoje: string, fator = 3): { media: number; vezes: number } | null {
  const { media, n } = mediaDaCategoria(categoriaId, lancamentos, hoje);
  if (n < 4 || media <= 0) return null;
  const vezes = valorCentavos / media;
  return vezes >= fator ? { media, vezes } : null;
}

export interface Assinatura {
  marca: string;
  descricao: string;
  valorMedio: number;
  meses: number;
  ids: string[];
}

/**
 * Despesas da mesma marca, com valor parecido (±15%), em 3 ou mais meses
 * diferentes (inclui o atual ou o anterior) e ainda sem etiqueta: candidatas a "Assinatura".
 */
export function detectarAssinaturas(lancamentos: Lancamento[], contas: Conta[], hoje: string): Assinatura[] {
  const despesas = new Set(contas.filter((c) => c.tipo === "DESPESA").map((c) => c.id));
  const estornados = new Set(lancamentos.map((l) => l.estornado_de).filter(Boolean));
  const grupos = new Map<string, Lancamento[]>();
  for (const l of lancamentos) {
    if (l.origem === "ESTORNO" || estornados.has(l.id) || !l.partidas.some((p) => despesas.has(p.conta_id) && p.tipo === "DEBITO")) continue;
    const m = marcaDaDescricao(l.descricao);
    if (!m) continue;
    grupos.set(m, [...(grupos.get(m) ?? []), l]);
  }
  const mesAtual = hoje.slice(0, 7);
  const mesAnterior = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 2, 1)).toISOString().slice(0, 7);
  const saida: Assinatura[] = [];
  for (const [marca, ls] of grupos) {
    if (ls.every((l) => l.etiqueta)) continue;
    const meses = new Set(ls.map((l) => l.data.slice(0, 7)));
    if (meses.size < 3 || !(meses.has(mesAtual) || meses.has(mesAnterior))) continue;
    const valores = ls.map(valorDe);
    const media = valores.reduce((s, v) => s + v, 0) / valores.length;
    if (valores.some((v) => Math.abs(v - media) > media * 0.15)) continue;
    // Mais de um por mês costuma ser hábito (ex.: iFood), não assinatura.
    if (ls.length > meses.size + 1) continue;
    saida.push({ marca, descricao: ls[0].descricao, valorMedio: Math.round(media), meses: meses.size, ids: ls.filter((l) => !l.etiqueta).map((l) => l.id) });
  }
  return saida.sort((a, b) => b.valorMedio - a.valorMedio);
}

export interface NotificacaoLida {
  valorCentavos: number;
  descricao: string;
  tipo: "DESPESA" | "RECEITA";
  cartao: boolean;
  data: string | null;
}

/**
 * Lê o texto de uma notificação de banco/cartão, por exemplo:
 *   "Compra de R$ 45,90 APROVADA em IFOOD para o cartão com final 1234"
 *   "Compra aprovada no seu cartão final 1234: R$ 120,00 em MERCADO LIVRE"
 *   "Você recebeu uma transferência de R$ 300,00 de FULANO"
 *   "Pix enviado: R$ 25,00 para PADARIA BOM PAO"
 */
export function lerNotificacaoBanco(texto: string, hoje: string): NotificacaoLida | null {
  const t = texto.replace(/\s+/g, " ").trim();
  const mValor = t.match(/R\$\s?(-?[\d.]+,\d{2}|-?\d+(?:\.\d{2})?)/i);
  if (!mValor) return null;
  const valorCentavos = valorInputParaCentavos(mValor[1].includes(",") ? mValor[1] : mValor[1].replace(".", ","));
  if (valorCentavos <= 0) return null;
  const receita = /\b(recebeu|recebido|recebimento|creditad|caiu na conta|deposit|estorno|reembolso)\w*/i.test(t);
  const cartao = /cart[aã]o|cr[eé]dito|compra/i.test(t) && !/d[eé]bito em conta/i.test(t);
  const depoisDoValor = t.slice((mValor.index ?? 0) + mValor[0].length);
  const mLocal =
    depoisDoValor.match(/^\s*(?:APROVADA|aprovada|foi aprovada)?\s*(?:em|no|na|para|de)\s+(.+?)(?:\s+(?:para o|no|com o)\s+cart[aã]o|\s+final\s+\d+|[.!]|$)/i) ??
    t.match(/(?:em|no estabelecimento|para|de)\s+([A-Z0-9*][A-Z0-9 *&.'-]{2,})/);
  const mData = t.match(/(\d{2})\/(\d{2})(?:\/(\d{2,4}))?/);
  let data: string | null = null;
  if (mData) {
    const ano = mData[3] ? (mData[3].length === 2 ? `20${mData[3]}` : mData[3]) : hoje.slice(0, 4);
    data = `${ano}-${mData[2]}-${mData[1]}`;
  }
  const descricao = (mLocal?.[1] ?? (receita ? "Recebimento" : "Compra")).replace(/\s+(às|as)\s+\d{1,2}:\d{2}.*$/i, "").trim();
  return { valorCentavos, descricao, tipo: receita ? "RECEITA" : "DESPESA", cartao: !receita && cartao, data };
}
