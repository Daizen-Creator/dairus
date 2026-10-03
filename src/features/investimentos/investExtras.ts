// Investimentos: simulação de preço médio, yield on cost e vencimentos de renda fixa.

import type { AtivoInvest, OperacaoInvest } from "../../types/investimentos";

/** Novo preço médio e quantidade se comprar `qtd` a `preco` (preços em reais). */
export function simularPrecoMedio(qtdAtual: number, pmAtual: number, qtd: number, preco: number): { quantidade: number; precoMedio: number; variacao: number } {
  const quantidade = qtdAtual + qtd;
  if (quantidade <= 0) return { quantidade: 0, precoMedio: 0, variacao: 0 };
  const precoMedio = (qtdAtual * pmAtual + qtd * preco) / quantidade;
  return { quantidade, precoMedio, variacao: pmAtual > 0 ? precoMedio / pmAtual - 1 : 0 };
}

/** Proventos dos últimos 12 meses sobre o custo da posição (yield on cost). */
export function yieldOnCost(ops: OperacaoInvest[], custoCentavos: number, hoje: string): number | null {
  if (custoCentavos <= 0) return null;
  const desde = new Date(Date.UTC(+hoje.slice(0, 4) - 1, +hoje.slice(5, 7) - 1, +hoje.slice(8, 10))).toISOString().slice(0, 10);
  const recebido = ops.filter((o) => ["DIVIDENDO", "JCP", "RENDIMENTO"].includes(o.tipo) && o.data > desde && o.data <= hoje).reduce((s, o) => s + o.valor_centavos - o.ir_retido_centavos, 0);
  return recebido / custoCentavos;
}

/** Renda fixa com vencimento nos próximos `dias`, do mais próximo ao mais distante. */
export function proximosVencimentos(ativos: AtivoInvest[], hoje: string, dias = 365): AtivoInvest[] {
  const limite = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10) + dias)).toISOString().slice(0, 10);
  return ativos.filter((a) => a.vencimento && a.quantidade > 0 && a.vencimento >= hoje && a.vencimento <= limite).sort((a, b) => a.vencimento!.localeCompare(b.vencimento!));
}
