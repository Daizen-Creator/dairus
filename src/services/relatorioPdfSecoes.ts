// Seções opcionais do relatório em PDF (arquivo leve, sem a biblioteca de PDF).

export type SecaoPdf = "categorias" | "receitas" | "maiores" | "orcamento" | "contas" | "pagar" | "metas" | "lancamentos" | "balancete";

export const SECOES_PDF: Array<{ id: SecaoPdf; rotulo: string; padrao: boolean }> = [
  { id: "categorias", rotulo: "Despesas por categoria (tabela)", padrao: true },
  { id: "receitas", rotulo: "Receitas por fonte", padrao: true },
  { id: "maiores", rotulo: "Maiores despesas", padrao: true },
  { id: "orcamento", rotulo: "Orçado x realizado", padrao: true },
  { id: "contas", rotulo: "Contas, cartões e patrimônio", padrao: true },
  { id: "pagar", rotulo: "Contas a pagar em aberto", padrao: true },
  { id: "metas", rotulo: "Metas", padrao: true },
  { id: "lancamentos", rotulo: "Lista completa de lançamentos", padrao: false },
  { id: "balancete", rotulo: "Balancete contábil", padrao: false },
];
