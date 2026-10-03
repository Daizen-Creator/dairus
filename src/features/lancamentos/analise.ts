import type { Conta, Etiqueta, Lancamento } from "../../types/accounting";

export type TipoLancamento = "RECEITA" | "DESPESA" | "TRANSFERENCIA" | "FATURA" | "OUTRO";

export interface AnaliseLancamento {
  tipo: TipoLancamento;
  /** Conta de receita/despesa envolvida, quando houver. */
  categoria: Conta | null;
  /** Contas de ativo/passivo tocadas (de onde saiu / para onde foi o dinheiro). */
  contasEnvolvidas: Conta[];
  entrada: boolean;
  saida: boolean;
  valorCentavos: number;
  estorno: boolean;
}

export function valorDoLancamento(l: Lancamento): number {
  return l.partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0);
}

export function analisar(l: Lancamento, contaPorId: Map<string, Conta>): AnaliseLancamento {
  const contas = l.partidas.map((p) => contaPorId.get(p.conta_id)).filter((c): c is Conta => !!c);
  const categoria = contas.find((c) => c.tipo === "RECEITA" || c.tipo === "DESPESA") ?? null;
  const contasEnvolvidas = contas.filter((c) => c.tipo === "ATIVO" || c.tipo === "PASSIVO");
  const estorno = l.origem === "ESTORNO";

  let tipo: TipoLancamento = "OUTRO";
  if (l.origem === "TRANSFERENCIA") tipo = "TRANSFERENCIA";
  else if (l.origem === "FATURA") tipo = "FATURA";
  else if (categoria?.tipo === "RECEITA") tipo = "RECEITA";
  else if (categoria?.tipo === "DESPESA") tipo = "DESPESA";

  // Estorno inverte o sentido do lançamento original.
  const ehReceita = tipo === "RECEITA";
  const ehDespesa = tipo === "DESPESA";
  return {
    tipo,
    categoria,
    contasEnvolvidas,
    entrada: estorno ? ehDespesa : ehReceita,
    saida: estorno ? ehReceita : ehDespesa,
    valorCentavos: valorDoLancamento(l),
    estorno,
  };
}

export type Ordem = "RECENTES" | "ANTIGOS" | "MAIOR" | "MENOR";

export interface Filtros {
  texto: string;
  tipo: TipoLancamento | "TODOS";
  categoriaId: string;
  contaId: string;
  etiqueta: Etiqueta | "TODAS" | "NENHUMA";
  inicio: string | null;
  fim: string | null;
  ordem: Ordem;
  mostrarEstornados: boolean;
  /** Tag livre ("TODAS" = sem filtro). */
  tag: string;
}

export const FILTROS_PADRAO: Filtros = {
  texto: "",
  tipo: "TODOS",
  categoriaId: "TODAS",
  contaId: "TODAS",
  etiqueta: "TODAS",
  inicio: null,
  fim: null,
  ordem: "RECENTES",
  mostrarEstornados: true,
  tag: "TODAS",
};

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filtrosAtivos(f: Filtros): number {
  return [
    f.texto.trim() !== "",
    f.tipo !== "TODOS",
    f.categoriaId !== "TODAS",
    f.contaId !== "TODAS",
    f.etiqueta !== "TODAS",
    f.inicio !== null,
    !f.mostrarEstornados,
    (f.tag ?? "TODAS") !== "TODAS",
  ].filter(Boolean).length;
}

export function aplicarFiltros(
  lancamentos: Lancamento[],
  contaPorId: Map<string, Conta>,
  f: Filtros,
  idsEstornados: Set<string>,
  tagsPorLancamento: Map<string, string[]> = new Map(),
): Array<{ l: Lancamento; a: AnaliseLancamento }> {
  // Filtrar por uma categoria inclui as subcategorias dela.
  const dentroDe = (c: Conta | null, alvo: string): boolean => {
    for (let atual = c; atual; atual = atual.categoria_pai_id ? contaPorId.get(atual.categoria_pai_id) ?? null : null) {
      if (atual.id === alvo) return true;
    }
    return false;
  };
  const busca = norm(f.texto.trim());
  const itens = lancamentos
    .map((l) => ({ l, a: analisar(l, contaPorId) }))
    .filter(({ l, a }) => {
      if (!f.mostrarEstornados && (a.estorno || idsEstornados.has(l.id))) return false;
      if (f.tipo !== "TODOS" && a.tipo !== f.tipo) return false;
      if (f.categoriaId !== "TODAS" && !l.partidas.some((p) => dentroDe(contaPorId.get(p.conta_id) ?? null, f.categoriaId))) return false;
      if ((f.tag ?? "TODAS") !== "TODAS" && !(tagsPorLancamento.get(l.id) ?? []).includes(f.tag)) return false;
      if (f.contaId !== "TODAS" && !l.partidas.some((p) => p.conta_id === f.contaId)) return false;
      if (f.etiqueta === "NENHUMA" && l.etiqueta) return false;
      if (f.etiqueta !== "TODAS" && f.etiqueta !== "NENHUMA" && l.etiqueta !== f.etiqueta) return false;
      if (f.inicio && l.data < f.inicio) return false;
      if (f.fim && l.data > f.fim) return false;
      if (busca && !norm(`${l.descricao} ${l.observacao ?? ""} ${a.categoria?.nome ?? ""} ${(tagsPorLancamento.get(l.id) ?? []).join(" ")}`).includes(busca)) return false;
      return true;
    });

  const cmpData = (x: Lancamento, y: Lancamento) => x.data.localeCompare(y.data);
  itens.sort((x, y) => {
    switch (f.ordem) {
      case "ANTIGOS":
        return cmpData(x.l, y.l);
      case "MAIOR":
        return y.a.valorCentavos - x.a.valorCentavos;
      case "MENOR":
        return x.a.valorCentavos - y.a.valorCentavos;
      default:
        return cmpData(y.l, x.l);
    }
  });
  return itens;
}

export interface Totais {
  entradas: number;
  saidas: number;
  saldo: number;
}

export function totalizar(itens: Array<{ a: AnaliseLancamento }>): Totais {
  let entradas = 0;
  let saidas = 0;
  for (const { a } of itens) {
    if (a.entrada) entradas += a.valorCentavos;
    else if (a.saida) saidas += a.valorCentavos;
  }
  return { entradas, saidas, saldo: entradas - saidas };
}
