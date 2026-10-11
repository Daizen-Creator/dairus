import type { Recorrencia } from "../types/accounting";

/**
 * Próxima data de uma recorrência (mesma regra do motor, `proximo_vencimento_ancorado`): mantém o
 * dia, ou o último do mês. Com `diaOriginal`, as datas partem sempre dele (31/01 → 28/02 → 31/03),
 * em vez de ficarem presas no 28.
 */
export function proximoVencimentoTS(data: string, recorrencia: Recorrencia, diaOriginal?: number | null): string | null {
  const [a, m, dData] = data.split("-").map(Number);
  const d = diaOriginal && diaOriginal >= 1 && diaOriginal <= 31 ? diaOriginal : dData;
  // Semanal anda 7 dias a partir da própria data; o dia original só vale para mensal e anual.
  if (recorrencia === "SEMANAL") return new Date(Date.UTC(a, m - 1, dData + 7)).toISOString().slice(0, 10);
  const meses = recorrencia === "ANUAL" ? 12 : recorrencia === "MENSAL" ? 1 : 0;
  if (!meses) return null;
  const ultimo = new Date(Date.UTC(a, m - 1 + meses + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1 + meses, Math.min(d, ultimo))).toISOString().slice(0, 10);
}
