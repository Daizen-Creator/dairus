// Limite efetivo do orçamento num mês: limite específico do mês (se houver)
// ou o normal, mais a sobra acumulada dos meses anteriores (se ligado).
// E o "ritmo": quanto ainda dá para gastar por dia até o fim do mês.

import type { Orcamento } from "../../types/extras";
import type { LimiteMes } from "../../services/planejamento";

export const mesAnteriorDe = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
};

export function limiteBase(categoriaId: string, mes: string, orcamentos: Orcamento[], limitesMes: LimiteMes[]): number {
  const especifico = limitesMes.find((l) => l.categoria_id === categoriaId && l.mes === mes);
  if (especifico) return especifico.limite_centavos;
  return orcamentos.find((o) => o.categoria_id === categoriaId)?.limite_centavos ?? 0;
}

/**
 * Limite efetivo = limite do mês + sobra (ou estouro) acumulada desde `acumular_desde`.
 * `gastoNoMes(mes)` devolve o gasto da categoria naquele mês (AAAA-MM).
 */
export function limiteEfetivo(categoriaId: string, mes: string, orcamentos: Orcamento[], limitesMes: LimiteMes[], gastoNoMes: (mes: string) => number): { base: number; acumulado: number; efetivo: number } {
  const base = limiteBase(categoriaId, mes, orcamentos, limitesMes);
  const o = orcamentos.find((x) => x.categoria_id === categoriaId);
  if (!o?.acumular || !o.acumular_desde || mes <= o.acumular_desde) return { base, acumulado: 0, efetivo: base };
  let acumulado = 0;
  const meses: string[] = [];
  for (let m = mesAnteriorDe(mes); m >= o.acumular_desde && meses.length < 36; m = mesAnteriorDe(m)) meses.unshift(m);
  for (const m of meses) acumulado += limiteBase(categoriaId, m, orcamentos, limitesMes) - gastoNoMes(m);
  return { base, acumulado, efetivo: Math.max(0, base + acumulado) };
}

export interface Ritmo {
  /** Quanto ainda pode gastar por dia até o fim do mês. */
  porDia: number;
  /** Gasto acima (+) ou abaixo (−) do ritmo esperado até hoje, em fração do esperado. */
  desvio: number;
  esperadoAteHoje: number;
  diasRestantes: number;
}

export function ritmo(limite: number, gasto: number, hoje: string): Ritmo | null {
  if (limite <= 0) return null;
  const [a, m, d] = hoje.split("-").map(Number);
  const dias = new Date(a, m, 0).getDate();
  const diasRestantes = dias - d + 1;
  const esperadoAteHoje = (limite * d) / dias;
  return {
    porDia: Math.max(0, Math.floor((limite - gasto) / diasRestantes)),
    desvio: esperadoAteHoje > 0 ? gasto / esperadoAteHoje - 1 : 0,
    esperadoAteHoje,
    diasRestantes,
  };
}
