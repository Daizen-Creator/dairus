import type { Conta, Lancamento, TipoConta } from "../types/accounting";

const devedora = (tipo: TipoConta) => tipo === "ATIVO" || tipo === "DESPESA";

export interface LinhaBalancete {
  conta: Conta;
  debitos: number;
  creditos: number;
  /** Saldo na natureza da conta (positivo = normal); só para exibição. */
  saldo: number;
}

/** Soma débitos e créditos de cada conta com movimento até a data informada (inclusive). */
export function balancete(lancamentos: Lancamento[], contas: Conta[], ate?: string): LinhaBalancete[] {
  const porId = new Map(contas.map((c) => [c.id, c]));
  const soma = new Map<string, { d: number; c: number }>();
  for (const l of lancamentos) {
    if (ate && l.data > ate) continue;
    for (const p of l.partidas) {
      const s = soma.get(p.conta_id) ?? { d: 0, c: 0 };
      if (p.tipo === "DEBITO") s.d += p.valor_centavos;
      else s.c += p.valor_centavos;
      soma.set(p.conta_id, s);
    }
  }
  return [...soma.entries()]
    .map(([id, s]) => {
      const conta = porId.get(id)!;
      return {
        conta,
        debitos: s.d,
        creditos: s.c,
        saldo: devedora(conta.tipo) ? s.d - s.c : s.c - s.d,
      };
    })
    .filter((l) => l.conta)
    .sort((a, b) => a.conta.codigo.localeCompare(b.conta.codigo));
}

export interface LinhaResultado {
  conta: Conta;
  valor: number;
}

/** Movimento líquido por conta de receita/despesa no período, na natureza da conta. */
export function resultadoPorTipo(
  lancamentos: Lancamento[],
  contas: Conta[],
  tipo: "RECEITA" | "DESPESA",
  inicio: string,
  fim: string,
): LinhaResultado[] {
  const alvo = new Map(contas.filter((c) => c.tipo === tipo).map((c) => [c.id, c]));
  const totais = new Map<string, number>();
  for (const l of lancamentos) {
    if (l.data < inicio || l.data > fim) continue;
    for (const p of l.partidas) {
      if (!alvo.has(p.conta_id)) continue;
      const deb = p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos;
      totais.set(p.conta_id, (totais.get(p.conta_id) ?? 0) + (tipo === "DESPESA" ? deb : -deb));
    }
  }
  return [...totais.entries()]
    .filter(([, v]) => v !== 0)
    .map(([id, valor]) => ({ conta: alvo.get(id)!, valor }))
    .sort((a, b) => b.valor - a.valor);
}

export interface LinhaRazao {
  lancamento: Lancamento;
  debito: number;
  credito: number;
  saldo: number;
}

export function razaoDaConta(
  lancamentos: Lancamento[],
  conta: Conta,
  inicio: string,
  fim: string,
): { saldoAnterior: number; linhas: LinhaRazao[] } {
  const sinal = (tipo: "DEBITO" | "CREDITO") => (devedora(conta.tipo) === (tipo === "DEBITO") ? 1 : -1);
  const ordenados = [...lancamentos].sort((a, b) => a.data.localeCompare(b.data));
  let saldo = 0;
  let saldoAnterior = 0;
  const linhas: LinhaRazao[] = [];
  for (const l of ordenados) {
    const partidas = l.partidas.filter((p) => p.conta_id === conta.id);
    if (partidas.length === 0) continue;
    const debito = partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0);
    const credito = partidas.filter((p) => p.tipo === "CREDITO").reduce((s, p) => s + p.valor_centavos, 0);
    saldo += debito * sinal("DEBITO") + credito * sinal("CREDITO");
    if (l.data < inicio) {
      saldoAnterior = saldo;
    } else if (l.data <= fim) {
      linhas.push({ lancamento: l, debito, credito, saldo });
    }
  }
  return { saldoAnterior, linhas };
}
