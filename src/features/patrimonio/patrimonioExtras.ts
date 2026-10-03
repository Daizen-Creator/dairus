// Patrimônio: depreciação, projeção com aportes e prazo para chegar a um valor.

/** Valor depois de `dias` depreciando `taxaAnual` (0,1 = 10% ao ano), composto. */
export function depreciar(valor: number, taxaAnual: number, dias: number): number {
  if (dias <= 0 || taxaAnual <= 0) return valor;
  return Math.round(valor * Math.pow(1 - taxaAnual, dias / 365));
}

/** Patrimônio no fim de cada ano, aportando `aporte` por mês com rendimento `taxaAnual`. */
export function projetarPatrimonio(atual: number, aporte: number, taxaAnual: number, anos: number): number[] {
  const i = Math.pow(1 + taxaAnual, 1 / 12) - 1;
  const saida: number[] = [];
  let v = atual;
  for (let m = 1; m <= anos * 12; m++) {
    v = v * (1 + i) + aporte;
    if (m % 12 === 0) saida.push(Math.round(v));
  }
  return saida;
}

/** Meses até chegar ao alvo (null se não chega em 100 anos). */
export function mesesAteAlvo(atual: number, aporte: number, taxaAnual: number, alvo: number): number | null {
  if (atual >= alvo) return 0;
  const i = Math.pow(1 + taxaAnual, 1 / 12) - 1;
  let v = atual;
  for (let m = 1; m <= 1200; m++) {
    v = v * (1 + i) + aporte;
    if (v >= alvo) return m;
  }
  return null;
}

/** Índice de independência: quantos % dos gastos o patrimônio pagaria vivendo de renda (regra dos 4% ao ano). */
export function independencia(patrimonio: number, gastoMensal: number): number {
  if (gastoMensal <= 0) return 0;
  return Math.round(((patrimonio * 0.04) / 12 / gastoMensal) * 100);
}
