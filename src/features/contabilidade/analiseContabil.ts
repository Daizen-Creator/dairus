// Análises contábeis: indicadores, DRE comparativa com análise vertical,
// fluxo de caixa (método direto simplificado) e saldos com sinal invertido.

import type { Conta, Lancamento } from "../../types/accounting";
import { balancete, resultadoPorTipo } from "../../services/relatorios";

export interface Indicadores {
  ativoCirculante: number;
  ativoTotal: number;
  passivoTotal: number;
  patrimonioLiquido: number;
  liquidezCorrente: number | null;
  endividamento: number | null;
  receitas: number;
  despesas: number;
  margemPoupanca: number | null;
}

const ehLiquida = (c: Conta) => c.tipo === "ATIVO" && c.subtipo !== "INVESTIMENTO" && c.subtipo !== "CATEGORIA" && c.id !== "ativo-a-receber";

export function indicadores(lancamentos: Lancamento[], contas: Conta[], inicio: string, fim: string): Indicadores {
  const b = balancete(lancamentos, contas, fim);
  const soma = (f: (c: Conta) => boolean) => b.filter((l) => f(l.conta)).reduce((s, l) => s + l.saldo, 0);
  const ativoCirculante = soma(ehLiquida);
  const ativoTotal = soma((c) => c.tipo === "ATIVO");
  const passivoTotal = soma((c) => c.tipo === "PASSIVO");
  const receitas = resultadoPorTipo(lancamentos, contas, "RECEITA", inicio, fim).reduce((s, l) => s + l.valor, 0);
  const despesas = resultadoPorTipo(lancamentos, contas, "DESPESA", inicio, fim).reduce((s, l) => s + l.valor, 0);
  return {
    ativoCirculante,
    ativoTotal,
    passivoTotal,
    patrimonioLiquido: ativoTotal - passivoTotal,
    liquidezCorrente: passivoTotal > 0 ? ativoCirculante / passivoTotal : null,
    endividamento: ativoTotal > 0 ? passivoTotal / ativoTotal : null,
    receitas,
    despesas,
    margemPoupanca: receitas > 0 ? (receitas - despesas) / receitas : null,
  };
}

export interface LinhaDreComparativa {
  conta: Conta;
  atual: number;
  anterior: number;
  variacao: number | null;
  /** % sobre a receita total do período atual (análise vertical). */
  vertical: number | null;
}

/** Período anterior de mesmo tamanho, imediatamente antes de `inicio`. */
export function periodoAnterior(inicio: string, fim: string): { inicio: string; fim: string } {
  const ms = Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`);
  const fimAnt = new Date(Date.parse(`${inicio}T12:00:00Z`) - 86_400_000);
  const iniAnt = new Date(fimAnt.getTime() - ms);
  return { inicio: iniAnt.toISOString().slice(0, 10), fim: fimAnt.toISOString().slice(0, 10) };
}

export function dreComparativa(lancamentos: Lancamento[], contas: Conta[], tipo: "RECEITA" | "DESPESA", inicio: string, fim: string): LinhaDreComparativa[] {
  const ant = periodoAnterior(inicio, fim);
  const atual = resultadoPorTipo(lancamentos, contas, tipo, inicio, fim);
  const anterior = new Map(resultadoPorTipo(lancamentos, contas, tipo, ant.inicio, ant.fim).map((l) => [l.conta.id, l.valor]));
  const receita = resultadoPorTipo(lancamentos, contas, "RECEITA", inicio, fim).reduce((s, l) => s + l.valor, 0);
  const ids = new Set([...atual.map((l) => l.conta.id), ...anterior.keys()]);
  const porId = new Map(contas.map((c) => [c.id, c]));
  return [...ids]
    .map((id) => {
      const a = atual.find((l) => l.conta.id === id)?.valor ?? 0;
      const p = anterior.get(id) ?? 0;
      return { conta: porId.get(id)!, atual: a, anterior: p, variacao: p !== 0 ? a / p - 1 : null, vertical: receita > 0 ? a / receita : null };
    })
    .filter((l) => l.conta)
    .sort((x, y) => y.atual - x.atual);
}

export interface FluxoCaixa {
  entradasOperacionais: number;
  saidasOperacionais: number;
  investimentos: number;
  financiamentos: number;
  variacaoCaixa: number;
}

/**
 * Fluxo de caixa direto simplificado: o que entrou/saiu das contas líquidas, separado pela outra ponta
 * (receita/despesa = operacional; investimentos = investimento; passivo/empréstimo = financiamento).
 */
export function fluxoDeCaixa(lancamentos: Lancamento[], contas: Conta[], inicio: string, fim: string): FluxoCaixa {
  const porId = new Map(contas.map((c) => [c.id, c]));
  const r: FluxoCaixa = { entradasOperacionais: 0, saidasOperacionais: 0, investimentos: 0, financiamentos: 0, variacaoCaixa: 0 };
  for (const l of lancamentos) {
    if (l.data < inicio || l.data > fim || l.origem === "SALDO_INICIAL") continue;
    const caixa = l.partidas.filter((p) => porId.get(p.conta_id) && ehLiquida(porId.get(p.conta_id)!)).reduce((s, p) => s + (p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos), 0);
    if (caixa === 0) continue;
    const outras = l.partidas.map((p) => porId.get(p.conta_id)).filter((c): c is Conta => !!c && !ehLiquida(c));
    r.variacaoCaixa += caixa;
    if (outras.some((c) => c.subtipo === "INVESTIMENTO" || c.id.includes("investimentos"))) r.investimentos += caixa;
    else if (outras.some((c) => c.tipo === "PASSIVO" && c.subtipo !== "CARTAO_CREDITO")) r.financiamentos += caixa;
    else if (caixa > 0) r.entradasOperacionais += caixa;
    else r.saidasOperacionais += caixa;
  }
  return r;
}

/** Contas com saldo contrário à natureza (ex.: banco negativo, cartão com crédito a favor). */
export function saldosInvertidos(lancamentos: Lancamento[], contas: Conta[], ate: string) {
  return balancete(lancamentos, contas, ate).filter((l) => (l.conta.tipo === "ATIVO" || l.conta.tipo === "PASSIVO") && l.saldo < 0);
}
