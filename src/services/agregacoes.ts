import type { Conta, Lancamento } from "../types/accounting";

export interface FatiaCategoria {
  contaId: string;
  nome: string;
  valorCentavos: number;
}

/**
 * Soma, por conta de despesa, o movimento líquido (débito - crédito) dos
 * lançamentos cuja data está no período informado. Mesma regra do motor
 * contábil em Rust (`movimento_periodo_por_tipo`), só que já filtrado por
 * conta para alimentar o gráfico do painel.
 */
export function despesasPorCategoriaNoMes(
  lancamentos: Lancamento[],
  contas: Conta[],
  dataInicio: string,
  dataFim: string,
): FatiaCategoria[] {
  const contasDespesa = new Map(contas.filter((c) => c.tipo === "DESPESA").map((c) => [c.id, c]));
  const totais = new Map<string, number>();

  for (const lancamento of lancamentos) {
    if (lancamento.data < dataInicio || lancamento.data > dataFim) continue;
    for (const partida of lancamento.partidas) {
      if (!contasDespesa.has(partida.conta_id)) continue;
      const sinal = partida.tipo === "DEBITO" ? 1 : -1;
      totais.set(partida.conta_id, (totais.get(partida.conta_id) ?? 0) + sinal * partida.valor_centavos);
    }
  }

  return [...totais.entries()]
    .filter(([, valor]) => valor > 0)
    .map(([contaId, valorCentavos]) => ({
      contaId,
      nome: contasDespesa.get(contaId)?.nome ?? contaId,
      valorCentavos,
    }))
    .sort((a, b) => b.valorCentavos - a.valorCentavos);
}

export interface FluxoMes {
  mes: string;
  receitasCentavos: number;
  despesasCentavos: number;
  saldoCentavos: number;
}

const NOMES_MES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/**
 * Receita/despesa líquidas por mês do ano informado (Jan→Dez). Meses sem
 * nenhum lançamento aparecem como zero de verdade — nunca inventamos um
 * histórico que o usuário ainda não registrou.
 */
export function fluxoCaixaPorAno(lancamentos: Lancamento[], contas: Conta[], ano: number): FluxoMes[] {
  const tipoPorConta = new Map(contas.map((c) => [c.id, c.tipo]));
  const totais = Array.from({ length: 12 }, (_, i) => ({
    mes: NOMES_MES_ABREV[i],
    receitasCentavos: 0,
    despesasCentavos: 0,
    saldoCentavos: 0,
  }));

  for (const lancamento of lancamentos) {
    const [anoLanc, mesLanc] = lancamento.data.split("-").map(Number);
    if (anoLanc !== ano) continue;
    const indice = mesLanc - 1;
    for (const partida of lancamento.partidas) {
      const tipoConta = tipoPorConta.get(partida.conta_id);
      const sinal = partida.tipo === "DEBITO" ? 1 : -1;
      if (tipoConta === "RECEITA") {
        totais[indice].receitasCentavos += -sinal * partida.valor_centavos;
      } else if (tipoConta === "DESPESA") {
        totais[indice].despesasCentavos += sinal * partida.valor_centavos;
      }
    }
  }

  for (const mes of totais) {
    mes.saldoCentavos = mes.receitasCentavos - mes.despesasCentavos;
  }

  return totais;
}
