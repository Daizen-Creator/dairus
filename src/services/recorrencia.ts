import type { Recorrencia } from "../types/accounting";

/** Próxima data de uma recorrência (mesma regra do motor: mantém o dia, ou o último do mês). */
export function proximoVencimentoTS(data: string, recorrencia: Recorrencia): string | null {
  const [a, m, d] = data.split("-").map(Number);
  if (recorrencia === "SEMANAL") return new Date(Date.UTC(a, m - 1, d + 7)).toISOString().slice(0, 10);
  const meses = recorrencia === "ANUAL" ? 12 : recorrencia === "MENSAL" ? 1 : 0;
  if (!meses) return null;
  const ultimo = new Date(Date.UTC(a, m - 1 + meses + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1 + meses, Math.min(d, ultimo))).toISOString().slice(0, 10);
}
