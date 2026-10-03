// Cartões: faturas futuras já comprometidas e simulação de compra parcelada.

import { vencimentoDaCompra } from "../../services/previsao";
import { dividirEmParcelas } from "./parcelas";

export interface FaturaFutura {
  vencimento: string;
  valor: number;
}

/** Soma as compras/parcelas por vencimento de fatura, de hoje em diante (n vencimentos). */
export function faturasFuturas(compras: Array<{ data: string; valor: number }>, diaFech: number, diaVenc: number, hoje: string, n = 6): FaturaFutura[] {
  const mapa = new Map<string, number>();
  for (const c of compras) {
    const v = vencimentoDaCompra(c.data, diaFech, diaVenc);
    if (v >= hoje) mapa.set(v, (mapa.get(v) ?? 0) + c.valor);
  }
  return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, n).map(([vencimento, valor]) => ({ vencimento, valor }));
}

export interface Simulacao {
  parcela: number;
  porFatura: Array<FaturaFutura & { antes: number }>;
  disponivelDepois: number;
  maiorFatura: number;
}

/** Como ficam as próximas faturas e o limite se fizer esta compra parcelada hoje. */
export function simularCompra(valor: number, parcelas: number, hoje: string, diaFech: number, diaVenc: number, atuais: FaturaFutura[], disponivel: number): Simulacao {
  const novas = dividirEmParcelas(valor, hoje, parcelas).map((p) => ({ vencimento: vencimentoDaCompra(p.data, diaFech, diaVenc), valor: p.valor }));
  const mapa = new Map<string, { valor: number; antes: number }>();
  for (const f of atuais) mapa.set(f.vencimento, { valor: f.valor, antes: f.valor });
  for (const p of novas) {
    const x = mapa.get(p.vencimento) ?? { valor: 0, antes: 0 };
    x.valor += p.valor;
    mapa.set(p.vencimento, x);
  }
  const porFatura = [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([vencimento, x]) => ({ vencimento, valor: x.valor, antes: x.antes }));
  return { parcela: novas[0]?.valor ?? 0, porFatura, disponivelDepois: disponivel - valor, maiorFatura: Math.max(0, ...porFatura.map((f) => f.valor)) };
}
