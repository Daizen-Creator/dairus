// Automações das metas (arredondamento, envelopes do salário, sobra do mês),
// desafios de economia e conquistas — tudo calculado com os dados reais.

import type { Conta, Lancamento } from "../../types/accounting";
import type { Meta } from "../../types/extras";
import { marcaDaDescricao } from "../../services/categorias";

const valorDebito = (l: Lancamento, ids: Set<string>) => l.partidas.filter((p) => p.tipo === "DEBITO" && ids.has(p.conta_id)).reduce((s, p) => s + p.valor_centavos, 0);

function despesasValidas(lancamentos: Lancamento[], contas: Conta[]) {
  const ids = new Set(contas.filter((c) => c.tipo === "DESPESA").map((c) => c.id));
  const estornados = new Set(lancamentos.map((l) => l.estornado_de).filter(Boolean));
  return { ids, lista: lancamentos.filter((l) => l.origem !== "ESTORNO" && !estornados.has(l.id) && valorDebito(l, ids) > 0) };
}

/** Quanto guardar arredondando cada despesa para cima até o próximo múltiplo de `base` (padrão R$ 10: R$ 18,40 → guarda R$ 1,60). */
export function arredondamentos(lancamentos: Lancamento[], contas: Conta[], desde: string, ate: string, base = 1000): number {
  const { ids, lista } = despesasValidas(lancamentos, contas);
  return lista
    .filter((l) => l.data > desde && l.data <= ate)
    .reduce((s, l) => {
      const v = valorDebito(l, ids);
      const resto = v % base;
      return s + (resto === 0 ? 0 : base - resto);
    }, 0);
}

/** Divide o salário nas "caixinhas" (percentuais por meta); o centavo que sobra vai para a primeira. */
export function dividirEnvelopes(valor: number, envelopes: Array<{ meta_id: string; percentual: number }>): Array<{ meta_id: string; valor: number }> {
  const validos = envelopes.filter((e) => e.percentual > 0);
  const partes = validos.map((e) => ({ meta_id: e.meta_id, valor: Math.floor((valor * e.percentual) / 100) }));
  const soma = validos.reduce((s, e) => s + e.percentual, 0);
  if (partes.length && soma >= 100) partes[0].valor += valor - partes.reduce((s, p) => s + p.valor, 0);
  return partes.filter((p) => p.valor > 0);
}

/** Resultado do mês (receitas − despesas), para mandar a sobra para a meta. */
export function sobraDoMes(lancamentos: Lancamento[], contas: Conta[], mes: string): number {
  const rec = new Set(contas.filter((c) => c.tipo === "RECEITA").map((c) => c.id));
  const desp = new Set(contas.filter((c) => c.tipo === "DESPESA").map((c) => c.id));
  let total = 0;
  for (const l of lancamentos.filter((x) => x.data.startsWith(mes))) {
    for (const p of l.partidas) {
      if (rec.has(p.conta_id)) total += p.tipo === "CREDITO" ? p.valor_centavos : -p.valor_centavos;
      if (desp.has(p.conta_id)) total -= p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos;
    }
  }
  return total;
}

export interface Desafio {
  id: string;
  nome: string;
  /** SEM_MARCA: nenhum gasto com a marca (ex.: ifood); LIMITE_CATEGORIA: gastar até `valor` na categoria. */
  tipo: "SEM_MARCA" | "LIMITE_CATEGORIA";
  alvo: string;
  valor?: number;
  inicio: string;
  dias: number;
}

export interface ProgressoDesafio {
  diasPassados: number;
  gasto: number;
  ocorrencias: number;
  status: "EM_ANDAMENTO" | "CONCLUIDO" | "FALHOU";
}

const somarDias = (iso: string, d: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + d)).toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);

export function progressoDesafio(d: Desafio, lancamentos: Lancamento[], contas: Conta[], hoje: string): ProgressoDesafio {
  const fim = somarDias(d.inicio, d.dias - 1);
  const { ids, lista } = despesasValidas(lancamentos, contas);
  const noPeriodo = lista.filter((l) => l.data >= d.inicio && l.data <= fim && l.data <= hoje);
  let gasto = 0;
  let ocorrencias = 0;
  if (d.tipo === "SEM_MARCA") {
    const alvo = d.alvo.toLowerCase();
    for (const l of noPeriodo) if (marcaDaDescricao(l.descricao) === alvo || l.descricao.toLowerCase().includes(alvo)) {
      ocorrencias++;
      gasto += valorDebito(l, ids);
    }
  } else {
    for (const l of noPeriodo) {
      const v = l.partidas.filter((p) => p.tipo === "DEBITO" && p.conta_id === d.alvo).reduce((s, p) => s + p.valor_centavos, 0);
      if (v > 0) {
        ocorrencias++;
        gasto += v;
      }
    }
  }
  const falhou = d.tipo === "SEM_MARCA" ? ocorrencias > 0 : gasto > (d.valor ?? 0);
  const diasPassados = Math.max(0, Math.min(d.dias, diasEntre(d.inicio, hoje) + 1));
  const status = falhou ? "FALHOU" : hoje > fim ? "CONCLUIDO" : "EM_ANDAMENTO";
  return { diasPassados, gasto, ocorrencias, status };
}

export interface Conquista {
  id: string;
  titulo: string;
  descricao: string;
  obtida: boolean;
}

/** Conquistas calculadas com os dados reais (nada é inventado). */
export function conquistas(lancamentos: Lancamento[], contas: Conta[], metas: Meta[], hoje: string, superfluas: string[]): Conquista[] {
  const mesAtual = hoje.slice(0, 7);
  const meses = [...new Set(lancamentos.map((l) => l.data.slice(0, 7)))].filter((m) => m < mesAtual).sort();
  const azul = meses.map((m) => sobraDoMes(lancamentos, contas, m) > 0);
  let sequencia = 0;
  let melhor = 0;
  for (const a of azul) {
    sequencia = a ? sequencia + 1 : 0;
    melhor = Math.max(melhor, sequencia);
  }
  // Dias seguidos (até hoje) sem gasto nas categorias supérfluas.
  const sup = new Set(superfluas);
  const { lista } = despesasValidas(lancamentos, contas);
  const ultimoSuperfluo = lista.filter((l) => l.data <= hoje && l.partidas.some((p) => p.tipo === "DEBITO" && sup.has(p.conta_id))).map((l) => l.data).sort().pop();
  const primeiroDia = lancamentos.map((l) => l.data).sort()[0] ?? hoje;
  const diasSemSuperfluo = diasEntre(ultimoSuperfluo ?? primeiroDia, hoje) - (ultimoSuperfluo ? 0 : -1);
  const guardado = metas.reduce((s, m) => s + Math.max(0, m.guardado_centavos), 0);
  return [
    { id: "azul-1", titulo: "Primeiro mês no azul", descricao: "Terminar um mês com mais receitas que despesas.", obtida: melhor >= 1 },
    { id: "azul-3", titulo: "Três meses seguidos no azul", descricao: "Três meses fechados no positivo em sequência.", obtida: melhor >= 3 },
    { id: "azul-6", titulo: "Semestre no azul", descricao: "Seis meses seguidos no positivo.", obtida: melhor >= 6 },
    { id: "meta-1", titulo: "Meta batida", descricao: "Chegar ao valor de uma meta.", obtida: metas.some((m) => m.guardado_centavos >= m.valor_alvo_centavos) },
    { id: "guardou-1000", titulo: "Primeiros R$ 1.000 guardados", descricao: "Somando todas as metas.", obtida: guardado >= 100_000 },
    { id: "guardou-10000", titulo: "R$ 10.000 guardados", descricao: "Somando todas as metas.", obtida: guardado >= 1_000_000 },
    { id: "sem-superfluo-7", titulo: "7 dias sem supérfluo", descricao: `Uma semana sem gastar nas categorias marcadas como supérfluas (hoje: ${Math.max(0, diasSemSuperfluo)} dia(s)).`, obtida: diasSemSuperfluo >= 7 },
    { id: "sem-superfluo-30", titulo: "30 dias sem supérfluo", descricao: "Um mês inteiro sem gastos supérfluos.", obtida: diasSemSuperfluo >= 30 },
  ];
}
