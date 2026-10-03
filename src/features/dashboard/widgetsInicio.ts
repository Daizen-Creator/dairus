// Cálculos dos widgets do Início.

import type { Agendamento, Conta, Lancamento } from "../../types/accounting";

const somarDias = (iso: string, d: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + d)).toISOString().slice(0, 10);

function gastoDo(l: Lancamento, despesas: Set<string>): number {
  return l.partidas.filter((p) => despesas.has(p.conta_id)).reduce((s, p) => s + (p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos), 0);
}

export function gastosRecentes(lancamentos: Lancamento[], contas: Conta[], hoje: string): { hoje: number; semana: number; diasSemGastar: number } {
  const despesas = new Set(contas.filter((c) => c.tipo === "DESPESA").map((c) => c.id));
  const estornados = new Set(lancamentos.map((l) => l.estornado_de).filter(Boolean));
  const validos = lancamentos.filter((l) => l.origem !== "ESTORNO" && !estornados.has(l.id) && l.data <= hoje);
  const porDia = new Map<string, number>();
  for (const l of validos) {
    const g = gastoDo(l, despesas);
    if (g > 0) porDia.set(l.data, (porDia.get(l.data) ?? 0) + g);
  }
  const inicioSemana = somarDias(hoje, -((new Date(`${hoje}T12:00:00Z`).getUTCDay() + 6) % 7));
  let semana = 0;
  for (const [d, v] of porDia) if (d >= inicioSemana && d <= hoje) semana += v;
  let dias = 0;
  for (let d = hoje; dias < 366 && !porDia.has(d); d = somarDias(d, -1)) dias++;
  return { hoje: porDia.get(hoje) ?? 0, semana, diasSemGastar: dias };
}

export function proximosRecebimentos(agendamentos: Agendamento[], hoje: string, dias = 30): Agendamento[] {
  const fim = somarDias(hoje, dias);
  return agendamentos.filter((a) => !a.pago_em && a.tipo === "RECEBER" && a.vencimento <= fim).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

export function assinaturasDoMes(lancamentos: Lancamento[], hoje: string): { total: number; quantidade: number } {
  const mes = hoje.slice(0, 7);
  const ls = lancamentos.filter((l) => l.etiqueta === "ASSINATURA" && l.data.startsWith(mes) && l.origem !== "ESTORNO");
  return { total: ls.reduce((s, l) => s + l.partidas.filter((p) => p.tipo === "DEBITO").reduce((a, p) => a + p.valor_centavos, 0), 0), quantidade: ls.length };
}
