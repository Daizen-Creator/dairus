// Faturas fechadas: ciclos passados, valor de cada fatura, pagamentos
// distribuídos por ordem de vencimento e encargos de atraso.

import type { Lancamento } from "../../types/accounting";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const diaNoMes = (ano: number, mes0: number, dia: number) => new Date(ano, mes0, Math.min(dia, new Date(ano, mes0 + 1, 0).getDate()));

export interface Ciclo {
  inicio: string;
  fechamento: string;
  vencimento: string;
}

/** Os `n` últimos ciclos já fechados (do mais recente para o mais antigo). */
export function ciclosFechados(diaFechamento: number, diaVencimento: number, hoje: string, n: number): Ciclo[] {
  const [a, m, d] = hoje.split("-").map(Number);
  const hojeData = new Date(a, m - 1, d);
  let k = diaNoMes(a, m - 1, diaFechamento) <= hojeData ? 0 : -1;
  const saida: Ciclo[] = [];
  for (let i = 0; i < n; i++, k--) {
    const fech = diaNoMes(a, m - 1 + k, diaFechamento);
    const anterior = diaNoMes(a, m - 2 + k, diaFechamento);
    const inicio = new Date(anterior.getFullYear(), anterior.getMonth(), anterior.getDate() + 1);
    const baseVenc = diaVencimento > diaFechamento ? fech : new Date(fech.getFullYear(), fech.getMonth() + 1, 1);
    saida.push({ inicio: iso(inicio), fechamento: iso(fech), vencimento: iso(diaNoMes(baseVenc.getFullYear(), baseVenc.getMonth(), diaVencimento)) });
  }
  return saida;
}

export interface FaturaComPagamento {
  id: string | null;
  inicio: string;
  fechamento: string;
  vencimento: string;
  valor: number;
  pago: number;
  ultimoPagamento: string | null;
  status: "PAGA" | "PARCIAL" | "ABERTA" | "ATRASADA" | "ZERADA";
  /** Dias entre o vencimento e o pagamento final (ou hoje, se ainda falta pagar). */
  diasAtraso: number;
  encargosLancados: boolean;
}

const diasEntre = (de: string, ate: string) => Math.round((Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10)) - Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 86_400_000);

/** Pagamentos de fatura (débitos no cartão com origem FATURA) em ordem de data. */
export function pagamentosDoCartao(cartaoId: string, lancamentos: Lancamento[]): Array<{ data: string; valor: number }> {
  const estornados = new Set(lancamentos.map((l) => l.estornado_de).filter(Boolean));
  return lancamentos
    .filter((l) => l.origem === "FATURA" && !estornados.has(l.id))
    .map((l) => ({ data: l.data, valor: l.partidas.filter((p) => p.conta_id === cartaoId && p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0) }))
    .filter((p) => p.valor > 0)
    .sort((a, b) => a.data.localeCompare(b.data));
}

/** Distribui os pagamentos nas faturas, da mais antiga para a mais nova. */
export function alocarPagamentos(
  faturas: Array<{ id: string | null; inicio: string; fechamento: string; vencimento: string; valor: number; encargosLancados?: boolean }>,
  pagamentos: Array<{ data: string; valor: number }>,
  hoje: string,
): FaturaComPagamento[] {
  const ordem = [...faturas].sort((a, b) => a.fechamento.localeCompare(b.fechamento));
  const fila = pagamentos.map((p) => ({ ...p }));
  const saida: FaturaComPagamento[] = [];
  for (const f of ordem) {
    let falta = Math.max(0, f.valor);
    let pago = 0;
    let ultimo: string | null = null;
    // Só conta pagamento feito depois do início do ciclo (pagamento antecipado de outra fatura não vale aqui).
    for (const p of fila) {
      if (falta <= 0) break;
      if (p.valor <= 0 || p.data < f.inicio) continue;
      const usa = Math.min(falta, p.valor);
      p.valor -= usa;
      falta -= usa;
      pago += usa;
      ultimo = p.data;
    }
    let status: FaturaComPagamento["status"];
    if (f.valor <= 0) status = "ZERADA";
    else if (falta === 0) status = "PAGA";
    else if (hoje > f.vencimento) status = pago > 0 ? "PARCIAL" : "ATRASADA";
    else status = "ABERTA";
    const fimAtraso = falta === 0 ? ultimo ?? f.vencimento : hoje;
    saida.push({ id: f.id, inicio: f.inicio, fechamento: f.fechamento, vencimento: f.vencimento, valor: f.valor, pago, ultimoPagamento: ultimo, status, diasAtraso: Math.max(0, diasEntre(f.vencimento, fimAtraso)), encargosLancados: !!f.encargosLancados });
  }
  return saida.reverse();
}

export interface Encargos {
  saldo: number;
  multa: number;
  juros: number;
  iof: number;
  total: number;
}

/**
 * Encargos estimados sobre o que ficou sem pagar no vencimento: multa de 2%,
 * juros do rotativo pró-rata (juros ao mês × dias/30) e IOF (0,38% + 0,0082% ao dia).
 * O valor oficial vem na próxima fatura do banco; este é para conferência.
 */
export function calcularEncargos(saldo: number, jurosMensal: number, diasAtraso: number): Encargos {
  if (saldo <= 0 || diasAtraso <= 0) return { saldo: Math.max(0, saldo), multa: 0, juros: 0, iof: 0, total: 0 };
  const multa = Math.round(saldo * 0.02);
  const juros = Math.round(saldo * jurosMensal * (diasAtraso / 30));
  const iof = Math.round(saldo * (0.0038 + 0.000082 * Math.min(diasAtraso, 365)));
  return { saldo, multa, juros, iof, total: multa + juros + iof };
}
