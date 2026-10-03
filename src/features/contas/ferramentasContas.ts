// Funções puras das ferramentas de contas (ordem manual, extrato filtrado, alertas).

import type { Conta, Lancamento } from "../../types/accounting";

export interface DadosBancarios {
  agencia?: string;
  numero?: string;
  pix?: string;
  obs?: string;
}

/** Ordem manual: ids na ordem salva primeiro; as contas novas vão para o fim, por nome. */
export function ordenarManual<T extends { id: string; nome: string }>(contas: T[], ordem: string[]): T[] {
  const pos = new Map(ordem.map((id, i) => [id, i]));
  return [...contas].sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9) || a.nome.localeCompare(b.nome));
}

/** Move uma conta uma posição para cima (-1) ou para baixo (+1) e devolve a nova ordem. */
export function moverNaOrdem(idsVisiveis: string[], id: string, direcao: -1 | 1): string[] {
  const lista = [...idsVisiveis];
  const i = lista.indexOf(id);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= lista.length) return lista;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  return lista;
}

export interface LinhaExtrato {
  lancamento: Lancamento;
  valor: number; // + entrada, − saída
  saldo: number;
}

/** Extrato da conta com saldo corrido; filtra por período e texto depois de calcular o saldo. */
export function extratoDaConta(conta: Conta, lancamentos: Lancamento[], inicio: string, fim: string, busca = ""): LinhaExtrato[] {
  const sinal = conta.tipo === "ATIVO" || conta.tipo === "DESPESA" ? 1 : -1;
  const ordenados = lancamentos.filter((l) => l.partidas.some((p) => p.conta_id === conta.id)).sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
  let saldo = 0;
  const linhas: LinhaExtrato[] = [];
  for (const l of ordenados) {
    const v = l.partidas.filter((p) => p.conta_id === conta.id).reduce((s, p) => s + (p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos), 0) * sinal;
    saldo += v;
    linhas.push({ lancamento: l, valor: v, saldo });
  }
  const termo = busca.trim().toLowerCase();
  return linhas.filter((x) => x.lancamento.data >= inicio && x.lancamento.data <= fim && (!termo || x.lancamento.descricao.toLowerCase().includes(termo)));
}

/** Contas ativas abaixo do saldo mínimo definido pelo usuário. */
export function abaixoDoMinimo(contas: Conta[], minimos: Record<string, number>): Array<{ conta: Conta; minimo: number }> {
  return contas.filter((c) => c.ativa && minimos[c.id] !== undefined && c.saldo_atual_centavos < minimos[c.id]).map((c) => ({ conta: c, minimo: minimos[c.id] }));
}

/** Texto para copiar/compartilhar os dados bancários. */
export function textoDadosBancarios(conta: Conta, d: DadosBancarios): string {
  return [conta.nome + (conta.instituicao ? ` (${conta.instituicao})` : ""), d.agencia && `Agência: ${d.agencia}`, d.numero && `Conta: ${d.numero}`, d.pix && `Pix: ${d.pix}`].filter(Boolean).join("\n");
}
