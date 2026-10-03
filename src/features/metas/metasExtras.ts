// Metas: marcos atingidos, aporte necessário com rendimento e divisão de um valor entre metas.

import type { AporteMeta, Meta } from "../../types/extras";

/** Datas em que a meta passou de 25%, 50%, 75% e 100% (pelo histórico de aportes). */
export function marcosDaMeta(aportes: AporteMeta[], alvo: number): Array<{ pct: number; data: string | null }> {
  const ordenados = [...aportes].sort((a, b) => a.data.localeCompare(b.data));
  return [25, 50, 75, 100].map((pct) => {
    let soma = 0;
    for (const a of ordenados) {
      soma += a.valor_centavos;
      if (soma * 100 >= alvo * pct) return { pct, data: a.data };
    }
    return { pct, data: null };
  });
}

/** Saldo acumulado após cada aporte (para o gráfico da meta). */
export function evolucaoDaMeta(aportes: AporteMeta[]): Array<{ data: string; total: number }> {
  let soma = 0;
  return [...aportes].sort((a, b) => a.data.localeCompare(b.data)).map((a) => ({ data: a.data, total: (soma += a.valor_centavos) }));
}

/**
 * Aporte mensal para chegar ao alvo em `meses`, com o dinheiro rendendo `taxaMensal`
 * (ex.: 0,008 = 0,8% ao mês). Fórmula de valor futuro de uma série de pagamentos.
 */
export function aporteNecessario(alvo: number, atual: number, meses: number, taxaMensal: number): number {
  if (meses <= 0) return Math.max(0, alvo - atual);
  const i = taxaMensal;
  const futuroDoAtual = atual * Math.pow(1 + i, meses);
  const falta = alvo - futuroDoAtual;
  if (falta <= 0) return 0;
  return Math.ceil(i === 0 ? falta / meses : (falta * i) / (Math.pow(1 + i, meses) - 1));
}

const PESO: Record<string, number> = { ALTA: 3, MEDIA: 2, BAIXA: 1 };

/** Divide um valor entre metas não concluídas, proporcional ao que falta × prioridade, sem passar do alvo. */
export function distribuirEntreMetas(valor: number, metas: Meta[], ignorar: Set<string> = new Set()): Map<string, number> {
  const abertas = metas.filter((m) => m.guardado_centavos < m.valor_alvo_centavos && !ignorar.has(m.id));
  const saida = new Map<string, number>();
  let restante = valor;
  let candidatas = abertas;
  // Repete enquanto sobrar dinheiro e houver meta sem completar (quem enche devolve a sobra).
  for (let volta = 0; volta < 10 && restante > 0 && candidatas.length; volta++) {
    const pesos = candidatas.map((m) => (m.valor_alvo_centavos - m.guardado_centavos - (saida.get(m.id) ?? 0)) * (PESO[m.prioridade ?? "MEDIA"] ?? 2));
    const total = pesos.reduce((s, p) => s + p, 0);
    if (total <= 0) break;
    let usado = 0;
    candidatas.forEach((m, k) => {
      const falta = m.valor_alvo_centavos - m.guardado_centavos - (saida.get(m.id) ?? 0);
      const parte = Math.min(falta, Math.floor((restante * pesos[k]) / total));
      if (parte > 0) {
        saida.set(m.id, (saida.get(m.id) ?? 0) + parte);
        usado += parte;
      }
    });
    restante -= usado;
    candidatas = candidatas.filter((m) => m.valor_alvo_centavos - m.guardado_centavos - (saida.get(m.id) ?? 0) > 0);
    if (usado === 0) break;
  }
  // Centavos de arredondamento vão para a primeira meta que ainda caiba.
  if (restante > 0) {
    const m = abertas.find((x) => x.valor_alvo_centavos - x.guardado_centavos - (saida.get(x.id) ?? 0) >= restante);
    if (m) saida.set(m.id, (saida.get(m.id) ?? 0) + restante);
  }
  return saida;
}

export function textoProgresso(m: Meta): string {
  const pct = Math.min(100, Math.round((m.guardado_centavos / m.valor_alvo_centavos) * 100));
  const barra = "▓".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
  return `${m.nome}: ${barra} ${pct}%${m.prazo ? ` · prazo ${m.prazo.split("-").reverse().join("/")}` : ""} — via Dairus`;
}
