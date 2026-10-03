// Previsão do saldo para os próximos 30, 60 e 90 dias (ESTIMATIVA).
// Parte do saldo de hoje nas contas e aplica, dia a dia:
//  - contas a pagar e receitas agendadas (com as repetições);
//  - faturas de cartão a vencer (o saldo devedor distribuído pelos vencimentos);
//  - parcelas de empréstimos;
//  - o gasto do dia a dia (média dos últimos 90 dias, fora o que já está agendado);
//  - a renda média, quando não há receita agendada.

import type { Agendamento, Conta, Lancamento } from "../types/accounting";
import { proximoVencimentoTS } from "./recorrencia";

export interface Evento {
  data: string;
  valor: number;
  descricao: string;
}

export interface PontoPrevisao {
  data: string;
  saldo: number;
}

export interface Previsao {
  saldoInicial: number;
  serie: PontoPrevisao[];
  eventos: Evento[];
  gastoDiario: number;
  minimo: PontoPrevisao;
  primeiroNegativo: string | null;
  em30: number;
  em60: number;
  em90: number;
}

const somarDias = (iso: string, d: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + d)).toISOString().slice(0, 10);

/** Vencimento da fatura em que cai uma compra feita em `data`. */
export function vencimentoDaCompra(data: string, diaFechamento: number, diaVencimento: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const ultimo = (ano: number, mes0: number) => new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();
  let mesFech = m - 1;
  if (d > Math.min(diaFechamento, ultimo(a, m - 1))) mesFech += 1;
  const fech = new Date(Date.UTC(a, mesFech, 1));
  const mesVenc = diaVencimento > diaFechamento ? fech.getUTCMonth() : fech.getUTCMonth() + 1;
  const base = new Date(Date.UTC(fech.getUTCFullYear(), mesVenc, 1));
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), Math.min(diaVencimento, ultimo(base.getUTCFullYear(), base.getUTCMonth())))).toISOString().slice(0, 10);
}

export interface EntradaPrevisao {
  hoje: string;
  dias: number;
  contas: Conta[];
  lancamentos: Lancamento[];
  agendamentos: Agendamento[];
  /** Parcelas de empréstimo a pagar: data e valor. */
  parcelas?: Array<{ data: string; valor: number; descricao: string }>;
  /** Compras de cartão por cartão já abertas em parcelas (data em que cai e valor). */
  comprasCartao?: Map<string, Array<{ data: string; valor: number }>>;
}

export function preverSaldo(e: EntradaPrevisao): Previsao {
  const { hoje, dias, contas, lancamentos, agendamentos } = e;
  const fim = somarDias(hoje, dias);
  const liquidas = contas.filter((c) => c.tipo === "ATIVO" && c.ativa && c.subtipo !== "CATEGORIA" && c.subtipo !== "INVESTIMENTO" && c.id !== "ativo-a-receber");
  const saldoInicial = liquidas.reduce((s, c) => s + c.saldo_atual_centavos, 0);
  const eventos: Evento[] = [];

  // Agendamentos (com repetições dentro do horizonte).
  for (const a of agendamentos.filter((x) => !x.pago_em)) {
    let venc = a.vencimento < hoje ? somarDias(hoje, 1) : a.vencimento;
    let original = a.vencimento;
    for (let i = 0; i < 60 && venc <= fim; i++) {
      eventos.push({ data: venc, valor: a.tipo === "RECEBER" ? a.valor_centavos : -a.valor_centavos, descricao: a.descricao });
      if (!a.recorrencia) break;
      const prox = proximoVencimentoTS(original, a.recorrencia);
      if (!prox) break;
      original = prox;
      venc = prox;
    }
  }

  // Faturas de cartão: o saldo devedor distribuído pelos vencimentos das compras ainda não vencidas.
  for (const c of contas.filter((x) => x.tipo === "PASSIVO" && x.subtipo === "CARTAO_CREDITO" && x.ativa && x.saldo_atual_centavos > 0)) {
    const fech = c.dia_fechamento_fatura ?? 1;
    const vencDia = c.dia_vencimento_fatura ?? 10;
    const porVenc = new Map<string, number>();
    for (const x of e.comprasCartao?.get(c.id) ?? []) {
      const v = vencimentoDaCompra(x.data, fech, vencDia);
      if (v >= hoje) porVenc.set(v, (porVenc.get(v) ?? 0) + x.valor);
    }
    const somaFutura = [...porVenc.values()].reduce((s, v) => s + v, 0);
    let restante = c.saldo_atual_centavos;
    // O que não está nas compras futuras (fatura fechada em aberto) vence no próximo vencimento.
    const proxVenc = vencimentoDaCompra(hoje, fech, vencDia);
    const fechadaEmAberto = Math.max(0, restante - somaFutura);
    if (fechadaEmAberto > 0) porVenc.set(proxVenc < hoje ? somarDias(hoje, 1) : proxVenc, (porVenc.get(proxVenc) ?? 0) + fechadaEmAberto);
    for (const [data, valor] of [...porVenc.entries()].sort()) {
      const v = Math.min(valor, restante);
      if (v <= 0) break;
      restante -= v;
      if (data <= fim) eventos.push({ data: data <= hoje ? somarDias(hoje, 1) : data, valor: -v, descricao: `Fatura ${c.nome}` });
    }
  }

  for (const p of e.parcelas ?? []) if (p.data > hoje && p.data <= fim) eventos.push({ data: p.data, valor: -p.valor, descricao: p.descricao });

  // Gasto do dia a dia: despesas dos últimos 90 dias que não vieram de contas agendadas.
  const inicio90 = somarDias(hoje, -90);
  const despesas = new Set(contas.filter((c) => c.tipo === "DESPESA").map((c) => c.id));
  const receitas = new Set(contas.filter((c) => c.tipo === "RECEITA").map((c) => c.id));
  const deAgendamento = new Set(agendamentos.map((a) => a.lancamento_id).filter(Boolean));
  const estornados = new Set(lancamentos.map((l) => l.estornado_de).filter(Boolean));
  let gasto90 = 0;
  let renda90 = 0;
  const diasDeRenda: number[] = [];
  for (const l of lancamentos) {
    if (l.data <= inicio90 || l.data > hoje || l.origem === "ESTORNO" || estornados.has(l.id)) continue;
    const d = l.partidas.filter((p) => despesas.has(p.conta_id)).reduce((s, p) => s + (p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos), 0);
    if (d > 0 && !deAgendamento.has(l.id)) gasto90 += d;
    const r = l.partidas.filter((p) => receitas.has(p.conta_id) && p.conta_id !== "receita-investimentos").reduce((s, p) => s + (p.tipo === "CREDITO" ? p.valor_centavos : -p.valor_centavos), 0);
    if (r > 0 && !deAgendamento.has(l.id)) {
      renda90 += r;
      diasDeRenda.push(Number(l.data.slice(8, 10)));
    }
  }
  const gastoDiario = Math.round(gasto90 / 90);

  // Sem receita agendada, usa a renda média mensal no dia em que ela costuma entrar.
  if (!agendamentos.some((a) => !a.pago_em && a.tipo === "RECEBER") && renda90 > 0) {
    const rendaMensal = Math.round(renda90 / 3);
    const diasOrd = [...diasDeRenda].sort((a, b) => a - b);
    const diaTipico = diasOrd[Math.floor(diasOrd.length / 2)] ?? 5;
    for (let k = 0; k <= Math.ceil(dias / 28) + 1; k++) {
      const base = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1 + k, 1));
      const ult = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
      const data = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), Math.min(diaTipico, ult))).toISOString().slice(0, 10);
      if (data > hoje && data <= fim) eventos.push({ data, valor: rendaMensal, descricao: "Renda média (estimada)" });
    }
  }

  const porDia = new Map<string, number>();
  for (const ev of eventos) porDia.set(ev.data, (porDia.get(ev.data) ?? 0) + ev.valor);
  const serie: PontoPrevisao[] = [{ data: hoje, saldo: saldoInicial }];
  let saldo = saldoInicial;
  for (let i = 1; i <= dias; i++) {
    const data = somarDias(hoje, i);
    saldo += (porDia.get(data) ?? 0) - gastoDiario;
    serie.push({ data, saldo });
  }
  const minimo = serie.reduce((a, b) => (b.saldo < a.saldo ? b : a));
  const neg = serie.find((p) => p.saldo < 0);
  const em = (n: number) => serie[Math.min(n, serie.length - 1)].saldo;
  return { saldoInicial, serie, eventos: eventos.sort((a, b) => a.data.localeCompare(b.data)), gastoDiario, minimo, primeiroNegativo: neg?.data ?? null, em30: em(30), em60: em(60), em90: em(90) };
}
