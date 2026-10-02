// Ciclo de fatura de cartão: fecha no dia `diaFechamento` e vence no `diaVencimento`.

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Data do dia `dia` no mês de `ano/mes0`, ajustada ao último dia quando o mês é mais curto. */
function diaNoMes(ano: number, mes0: number, dia: number): Date {
  const ultimo = new Date(ano, mes0 + 1, 0).getDate();
  return new Date(ano, mes0, Math.min(dia, ultimo));
}

export interface CicloFatura {
  /** Último fechamento (início da fatura atual = dia seguinte). */
  ultimoFechamento: string;
  /** Início da fatura atual (dia após o último fechamento). */
  inicioAtual: string;
  /** Próximo fechamento. */
  proximoFechamento: string;
  /** Fechamento anterior ao último (início da fatura anterior = dia seguinte). */
  fechamentoAnterior: string;
  /** Vencimento da fatura que fechou por último (pode já ter passado). */
  vencimentoAnterior: string;
  /** Próximo vencimento ainda por vir (da fatura anterior ou da atual). */
  proximoVencimento: string;
  diasParaFechar: number;
  diasParaVencer: number;
}

function diasEntre(deISO: string, ateISO: string): number {
  const [a1, m1, d1] = deISO.split("-").map(Number);
  const [a2, m2, d2] = ateISO.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

export function calcularCiclo(diaFechamento: number, diaVencimento: number, hojeISO: string): CicloFatura {
  const [ano, mes] = hojeISO.split("-").map(Number);
  const m0 = mes - 1;
  const esteMes = diaNoMes(ano, m0, diaFechamento);
  const hoje = new Date(ano, m0, Number(hojeISO.slice(8, 10)));

  // Fecha "hoje" ainda conta na fatura que está fechando; o ciclo novo começa no dia seguinte.
  const ultimo = hoje >= esteMes ? esteMes : diaNoMes(ano, m0 - 1, diaFechamento);
  const proximo = hoje >= esteMes ? diaNoMes(ano, m0 + 1, diaFechamento) : esteMes;
  const anterior = diaNoMes(ultimo.getFullYear(), ultimo.getMonth() - 1, diaFechamento);

  // O vencimento cai depois do fechamento: no mesmo mês se o dia for maior, senão no mês seguinte.
  const vencimentoDe = (fechamento: Date) => {
    const base = diaVencimento > diaFechamento ? fechamento : new Date(fechamento.getFullYear(), fechamento.getMonth() + 1, 1);
    return diaNoMes(base.getFullYear(), base.getMonth(), diaVencimento);
  };
  const vencAnterior = vencimentoDe(ultimo);
  const venc = iso(vencAnterior) >= hojeISO ? vencAnterior : vencimentoDe(proximo);

  const dia1 = (d: Date) => iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
  return {
    ultimoFechamento: iso(ultimo),
    inicioAtual: dia1(ultimo),
    proximoFechamento: iso(proximo),
    fechamentoAnterior: iso(anterior),
    vencimentoAnterior: iso(vencAnterior),
    proximoVencimento: iso(venc),
    diasParaFechar: diasEntre(hojeISO, iso(proximo)),
    diasParaVencer: diasEntre(hojeISO, iso(venc)),
  };
}
