// Compra parcelada no cartão: o lançamento guarda o valor inteiro (que ocupa o
// limite todo de uma vez) e o número de parcelas. Aqui a compra é aberta em
// parcelas, cada uma com a data em que "cai" — um mês depois da anterior —,
// para somar na fatura certa.

import type { Lancamento } from "../../types/accounting";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Soma `meses` a uma data ISO, mantendo o dia (ou o último dia, se o mês for mais curto). */
export function somarMeses(dataISO: string, meses: number): string {
  const [a, m, d] = dataISO.split("-").map(Number);
  const ultimo = new Date(a, m - 1 + meses + 1, 0).getDate();
  return iso(new Date(a, m - 1 + meses, Math.min(d, ultimo)));
}

export interface Parcela {
  numero: number;
  total: number;
  data: string;
  valor: number;
}

/** Divide `valor` em `total` parcelas mensais; os centavos que sobram ficam na primeira, como fazem os bancos. */
export function dividirEmParcelas(valor: number, dataISO: string, total: number): Parcela[] {
  const n = Math.max(1, Math.floor(total));
  const base = Math.trunc(valor / n);
  const sobra = valor - base * n;
  return Array.from({ length: n }, (_, i) => ({
    numero: i + 1,
    total: n,
    data: somarMeses(dataISO, i),
    valor: base + (i === 0 ? sobra : 0),
  }));
}

/**
 * Parcelamento que vale para um lançamento: o dele mesmo, ou — no caso do
 * estorno de uma compra parcelada — o da compra original, para o estorno
 * desfazer cada parcela na fatura em que ela caiu.
 */
export function parcelamentoDe(l: Lancamento, porId: Map<string, Lancamento>): { parcelas: number; dataBase: string } | null {
  if (l.parcelas && l.parcelas > 1) return { parcelas: l.parcelas, dataBase: l.data };
  const original = l.estornado_de ? porId.get(l.estornado_de) : undefined;
  if (original?.parcelas && original.parcelas > 1) return { parcelas: original.parcelas, dataBase: original.data };
  return null;
}
