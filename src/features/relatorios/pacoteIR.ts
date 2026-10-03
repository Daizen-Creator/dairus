// Pacote do Imposto de Renda do ano: tudo o que o Dairus sabe e importa para a
// declaração. É um apoio para conferência — os informes oficiais (empresa,
// bancos, corretora) continuam sendo a fonte.

import type { Conta, Lancamento } from "../../types/accounting";
import type { Bem } from "../../types/extras";

export function saldoNaData(conta: Conta, lancamentos: Lancamento[], data: string): number {
  const devedora = conta.tipo === "ATIVO" || conta.tipo === "DESPESA";
  let s = 0;
  for (const l of lancamentos) {
    if (l.data > data) continue;
    for (const p of l.partidas) if (p.conta_id === conta.id) s += (p.tipo === "DEBITO") === devedora ? p.valor_centavos : -p.valor_centavos;
  }
  return s;
}

export interface LinhaValor {
  nome: string;
  valor: number;
}

export interface PacoteIR {
  ano: number;
  rendimentos: LinhaValor[];
  dedutiveis: Array<LinhaValor & { lancamentos: Array<{ data: string; descricao: string; valor: number }> }>;
  contas: Array<{ nome: string; instituicao: string | null; anterior: number; atual: number }>;
  bens: Array<{ nome: string; aquisicao: number | null; data: string | null }>;
  dividas: Array<{ nome: string; anterior: number; atual: number }>;
  aReceber: { anterior: number; atual: number };
  avisos: string[];
}

const DEDUTIVEIS = [
  { id: "despesa-saude", nome: "Saúde (médicos, dentistas, planos, exames) — sem limite" },
  { id: "despesa-educacao", nome: "Educação (escola, faculdade) — limite anual por pessoa" },
];

export function montarPacoteIR(ano: number, contas: Conta[], lancamentos: Lancamento[], bens: Bem[]): PacoteIR {
  const ini = `${ano}-01-01`;
  const fim = `${ano}-12-31`;
  const fimAnt = `${ano - 1}-12-31`;
  const estornados = new Set(lancamentos.map((l) => l.estornado_de).filter(Boolean));
  const noAno = lancamentos.filter((l) => l.data >= ini && l.data <= fim);
  const porId = new Map(contas.map((c) => [c.id, c]));

  const rendimentos = contas
    .filter((c) => c.tipo === "RECEITA" && c.subtipo !== "CATEGORIA")
    .map((c) => ({ nome: c.nome, valor: noAno.reduce((s, l) => s + l.partidas.filter((p) => p.conta_id === c.id).reduce((x, p) => x + (p.tipo === "CREDITO" ? p.valor_centavos : -p.valor_centavos), 0), 0) }))
    .filter((r) => r.valor !== 0);

  const dedutiveis = DEDUTIVEIS.map((d) => {
    const ids = new Set(contas.filter((c) => c.id === d.id || c.categoria_pai_id === d.id).map((c) => c.id));
    const itens = noAno
      .filter((l) => l.origem !== "ESTORNO" && !estornados.has(l.id))
      .map((l) => ({ data: l.data, descricao: l.descricao, valor: l.partidas.filter((p) => ids.has(p.conta_id) && p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0) }))
      .filter((x) => x.valor > 0);
    return { nome: d.nome, valor: itens.reduce((s, x) => s + x.valor, 0), lancamentos: itens };
  }).filter((d) => d.valor > 0);

  const contasBens = contas
    .filter((c) => c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA" && c.subtipo !== "BENEFICIO" && c.id !== "ativo-a-receber" && c.id !== "ativo-investimentos")
    .map((c) => ({ nome: c.nome, instituicao: c.instituicao, anterior: saldoNaData(c, lancamentos, fimAnt), atual: saldoNaData(c, lancamentos, fim) }))
    .filter((c) => c.anterior !== 0 || c.atual !== 0);

  const dividas = contas
    .filter((c) => c.tipo === "PASSIVO" && c.subtipo !== "CATEGORIA")
    .map((c) => ({ nome: c.nome, anterior: saldoNaData(c, lancamentos, fimAnt), atual: saldoNaData(c, lancamentos, fim) }))
    .filter((d) => d.anterior > 0 || d.atual > 0);

  const rec = porId.get("ativo-a-receber");
  const aReceber = rec ? { anterior: saldoNaData(rec, lancamentos, fimAnt), atual: saldoNaData(rec, lancamentos, fim) } : { anterior: 0, atual: 0 };

  const avisos: string[] = [];
  const contasAcima = contasBens.filter((c) => c.atual >= 14_000 || c.anterior >= 14_000);
  if (contasAcima.length) avisos.push("Contas com saldo acima de R$ 140 em 31/12 entram em Bens e Direitos (grupo 06 - depósitos à vista).");
  const dividasAcima = dividas.filter((d) => d.atual > 500_000 || d.anterior > 500_000);
  if (dividasAcima.length) avisos.push("Dívidas acima de R$ 5.000 em 31/12 vão em Dívidas e Ônus Reais.");
  if (rendimentos.some((r) => r.nome.toLowerCase().includes("salário"))) avisos.push("Confira os salários com o Informe de Rendimentos da empresa (valores brutos e IR retido).");
  return { ano, rendimentos, dedutiveis, contas: contasBens, bens: bens.filter((b) => b.tipo === "BEM").map((b) => ({ nome: b.nome, aquisicao: b.aquisicao_valor_centavos, data: b.aquisicao_data })), dividas, aReceber, avisos };
}
