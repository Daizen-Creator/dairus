// Relatórios extras: por etiqueta, estabelecimento, meio de pagamento, dia do mês,
// fixos x variáveis, ticket médio, poupança mês a mês e comparação de dois meses.

import type { Conta, Lancamento } from "../../types/accounting";
import { marcaDaDescricao } from "../../services/categorias";

export interface Item {
  chave: string;
  valor: number;
  qtd: number;
}

function despesasValidas(lancamentos: Lancamento[], contas: Conta[], inicio: string, fim: string) {
  const despesas = new Set(contas.filter((c) => c.tipo === "DESPESA").map((c) => c.id));
  const estornados = new Set(lancamentos.map((l) => l.estornado_de).filter(Boolean));
  return lancamentos
    .filter((l) => l.data >= inicio && l.data <= fim && l.origem !== "ESTORNO" && !estornados.has(l.id))
    .map((l) => ({ l, valor: l.partidas.filter((p) => despesas.has(p.conta_id)).reduce((s, p) => s + (p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos), 0) }))
    .filter((x) => x.valor > 0);
}

function agrupar(itens: Array<{ chave: string; valor: number }>): Item[] {
  const m = new Map<string, Item>();
  for (const i of itens) {
    const x = m.get(i.chave) ?? { chave: i.chave, valor: 0, qtd: 0 };
    x.valor += i.valor;
    x.qtd += 1;
    m.set(i.chave, x);
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor);
}

export function porEstabelecimento(lancamentos: Lancamento[], contas: Conta[], inicio: string, fim: string): Item[] {
  return agrupar(despesasValidas(lancamentos, contas, inicio, fim).map(({ l, valor }) => ({ chave: marcaDaDescricao(l.descricao) ? l.descricao.split(/\s+/).slice(0, 2).join(" ") : l.descricao, valor })));
}

export function porMeioDePagamento(lancamentos: Lancamento[], contas: Conta[], inicio: string, fim: string): Item[] {
  const porId = new Map(contas.map((c) => [c.id, c]));
  return agrupar(
    despesasValidas(lancamentos, contas, inicio, fim).map(({ l, valor }) => {
      const meio = l.partidas.map((p) => porId.get(p.conta_id)).find((c) => c && (c.tipo === "ATIVO" || c.tipo === "PASSIVO"));
      return { chave: meio?.nome ?? "Outro", valor };
    }),
  );
}

export function porEtiqueta(lancamentos: Lancamento[], contas: Conta[], inicio: string, fim: string, tags: Map<string, string[]>): Item[] {
  return agrupar(despesasValidas(lancamentos, contas, inicio, fim).flatMap(({ l, valor }) => (tags.get(l.id) ?? []).map((t) => ({ chave: `#${t}`, valor }))));
}

/** Gasto por dia do mês (1 a 31), somando o período. */
export function porDiaDoMes(lancamentos: Lancamento[], contas: Conta[], inicio: string, fim: string): number[] {
  const dias = Array(31).fill(0);
  for (const { l, valor } of despesasValidas(lancamentos, contas, inicio, fim)) dias[Number(l.data.slice(8, 10)) - 1] += valor;
  return dias;
}

export function fixosVariaveis(lancamentos: Lancamento[], contas: Conta[], inicio: string, fim: string): { fixos: number; variaveis: number } {
  let fixos = 0;
  let variaveis = 0;
  for (const { l, valor } of despesasValidas(lancamentos, contas, inicio, fim)) {
    if (l.etiqueta || l.origem === "AGENDAMENTO") fixos += valor;
    else variaveis += valor;
  }
  return { fixos, variaveis };
}

export function ticket(lancamentos: Lancamento[], contas: Conta[], inicio: string, fim: string): { compras: number; total: number; medio: number; porDia: number; maior: number } {
  const v = despesasValidas(lancamentos, contas, inicio, fim);
  const total = v.reduce((s, x) => s + x.valor, 0);
  const dias = Math.max(1, Math.round((Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86_400_000) + 1);
  return { compras: v.length, total, medio: v.length ? Math.round(total / v.length) : 0, porDia: Math.round(total / dias), maior: Math.max(0, ...v.map((x) => x.valor)) };
}

/** Taxa de poupança (receitas − despesas) ÷ receitas, nos últimos `n` meses. */
export function poupancaMensal(lancamentos: Lancamento[], contas: Conta[], hoje: string, n = 12): Array<{ mes: string; receitas: number; despesas: number; taxa: number | null }> {
  const receitas = new Set(contas.filter((c) => c.tipo === "RECEITA").map((c) => c.id));
  const despesas = new Set(contas.filter((c) => c.tipo === "DESPESA").map((c) => c.id));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - n + i, 1));
    const mes = d.toISOString().slice(0, 7);
    let r = 0;
    let g = 0;
    for (const l of lancamentos) {
      if (!l.data.startsWith(mes)) continue;
      for (const p of l.partidas) {
        if (receitas.has(p.conta_id)) r += p.tipo === "CREDITO" ? p.valor_centavos : -p.valor_centavos;
        if (despesas.has(p.conta_id)) g += p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos;
      }
    }
    return { mes, receitas: r, despesas: g, taxa: r > 0 ? (r - g) / r : null };
  });
}

/** Gasto por categoria em dois meses quaisquer (AAAA-MM). */
export function compararMeses(lancamentos: Lancamento[], contas: Conta[], a: string, b: string): Array<{ categoria: string; a: number; b: number }> {
  const porId = new Map(contas.map((c) => [c.id, c]));
  const soma = (mes: string) => {
    const m = new Map<string, number>();
    for (const l of lancamentos) {
      if (!l.data.startsWith(mes) || l.origem === "ESTORNO") continue;
      for (const p of l.partidas) {
        const c = porId.get(p.conta_id);
        if (c?.tipo === "DESPESA") m.set(c.nome, (m.get(c.nome) ?? 0) + (p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos));
      }
    }
    return m;
  };
  const ma = soma(a);
  const mb = soma(b);
  return [...new Set([...ma.keys(), ...mb.keys()])].map((categoria) => ({ categoria, a: ma.get(categoria) ?? 0, b: mb.get(categoria) ?? 0 })).sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
}
