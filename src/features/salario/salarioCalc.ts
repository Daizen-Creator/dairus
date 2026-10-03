// Cálculos trabalhistas de referência (CLT). Tabelas oficiais mudam todo ano:
// os valores aqui são de referência e a tela avisa para conferir no holerite.

/** INSS do empregado (progressivo), em centavos. Faixas de 2025. */
export const FAIXAS_INSS: Array<[number, number]> = [
  [151_800, 0.075],
  [279_388, 0.09],
  [419_083, 0.12],
  [815_741, 0.14],
];

export function inss(bruto: number): number {
  let restante = bruto;
  let anterior = 0;
  let total = 0;
  for (const [teto, aliq] of FAIXAS_INSS) {
    const faixa = Math.min(restante, teto - anterior);
    if (faixa <= 0) break;
    total += faixa * aliq;
    restante -= faixa;
    anterior = teto;
  }
  return Math.round(total);
}

/** IRRF mensal (tabela de maio/2025) com a isenção até R$ 5.000 e redução até R$ 7.350 (a partir de 2026). */
export function irrf(bruto: number, inssPago: number, dependentes = 0, ano = 2026): number {
  const deducaoLegal = inssPago + dependentes * 18_959;
  const base = bruto - Math.max(deducaoLegal, 60_720); // desconto simplificado quando for maior
  const faixas: Array<[number, number, number]> = [
    [242_880, 0, 0],
    [282_665, 0.075, 18_216],
    [375_105, 0.15, 39_416],
    [466_468, 0.225, 67_549],
    [Infinity, 0.275, 90_873],
  ];
  const [, aliq, deduz] = faixas.find(([limite]) => base <= limite)!;
  let imposto = Math.max(0, base * aliq - deduz);
  if (ano >= 2026) {
    if (bruto <= 500_000) imposto = 0;
    else if (bruto <= 735_000) imposto = Math.max(0, imposto - (97_862 - 0.133145 * bruto));
  }
  return Math.round(imposto);
}

export interface Holerite {
  bruto: number;
  inss: number;
  irrf: number;
  liquido: number;
  fgts: number;
}

export function holerite(bruto: number, dependentes = 0, ano = 2026): Holerite {
  const i = inss(bruto);
  const ir = irrf(bruto, i, dependentes, ano);
  return { bruto, inss: i, irrf: ir, liquido: bruto - i - ir, fgts: Math.round(bruto * 0.08) };
}

/** 13º: proporcional aos meses (15+ dias contam como mês). 1ª parcela sem descontos; 2ª com INSS/IR. */
export function decimoTerceiro(bruto: number, meses: number, dependentes = 0): { primeira: number; segunda: number; total: number; descontos: number } {
  const integral = Math.round((bruto * Math.min(12, Math.max(0, meses))) / 12);
  const primeira = Math.round(integral / 2);
  const i = inss(integral);
  const ir = irrf(integral, i, dependentes);
  const segunda = integral - primeira - i - ir;
  return { primeira, segunda, total: primeira + segunda, descontos: i + ir };
}

/** Férias: salário dos dias + 1/3, com INSS/IR; abono (vender 10 dias) é isento. */
export function ferias(bruto: number, dias = 30, venderDez = false, dependentes = 0): { bruto: number; descontos: number; liquido: number; abono: number } {
  const diasGozo = venderDez ? Math.min(dias, 20) : dias;
  const base = Math.round((bruto * diasGozo) / 30);
  const comTerco = base + Math.round(base / 3);
  const i = inss(comTerco);
  const ir = irrf(comTerco, i, dependentes);
  const abono = venderDez ? Math.round(((bruto * 10) / 30) * (4 / 3)) : 0;
  return { bruto: comTerco, descontos: i + ir, liquido: comTerco - i - ir + abono, abono };
}

/** Horas extras: valor da hora (bruto / horas do mês) × adicional × horas. */
export function horasExtras(bruto: number, horasMes: number, horas: number, adicional = 0.5): number {
  if (horasMes <= 0) return 0;
  return Math.round((bruto / horasMes) * (1 + adicional) * horas);
}

/** Pacote anual CLT (líquido × 12 + 13º + férias com 1/3 + FGTS + benefícios) para comparar com PJ. */
export function pacoteAnualClt(bruto: number, beneficiosMes = 0): number {
  const h = holerite(bruto);
  const d = decimoTerceiro(bruto, 12);
  const f = ferias(bruto);
  return h.liquido * 11 + f.liquido + d.total + h.fgts * 13 + beneficiosMes * 12;
}

/** PJ: faturamento × 12 menos impostos (% do faturamento) e custos fixos mensais. */
export function pacoteAnualPj(faturamentoMes: number, impostoPct: number, custosMes = 0): number {
  return Math.round(faturamentoMes * 12 * (1 - impostoPct) - custosMes * 12);
}
