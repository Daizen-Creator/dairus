// Dados do widget "Gráfico personalizável": qual métrica, em que período, com que
// granularidade e de que jeito mostrar. Sem React, para poder testar.

import type { Conta, Lancamento } from "../../types/accounting";

export type Metrica = "despesas" | "receitas" | "resultado" | "categoria" | "saldo";
export type Periodo = "7d" | "30d" | "mes" | "3m" | "6m" | "12m" | "ano";
export type Granularidade = "auto" | "dia" | "semana" | "mes";
export type Exibicao = "linha" | "barras" | "rosca" | "tabela" | "kpi";

export interface ConfigGrafico {
  metrica: Metrica;
  periodo: Periodo;
  granularidade: Granularidade;
  exibicao: Exibicao;
  /** Só para a métrica "categoria" (inclui as subcategorias). */
  categoriaId?: string | null;
}

export const CONFIG_GRAFICO_PADRAO: ConfigGrafico = { metrica: "despesas", periodo: "6m", granularidade: "auto", exibicao: "barras" };

export const METRICAS: Array<{ v: Metrica; r: string }> = [
  { v: "despesas", r: "Despesas" },
  { v: "receitas", r: "Receitas" },
  { v: "resultado", r: "Resultado (receitas − despesas)" },
  { v: "categoria", r: "Uma categoria" },
  { v: "saldo", r: "Saldo disponível" },
];
export const PERIODOS: Array<{ v: Periodo; r: string }> = [
  { v: "7d", r: "Últimos 7 dias" },
  { v: "30d", r: "Últimos 30 dias" },
  { v: "mes", r: "Este mês" },
  { v: "3m", r: "Últimos 3 meses" },
  { v: "6m", r: "Últimos 6 meses" },
  { v: "12m", r: "Últimos 12 meses" },
  { v: "ano", r: "Este ano" },
];
export const GRANULARIDADES: Array<{ v: Granularidade; r: string }> = [
  { v: "auto", r: "Automática" },
  { v: "dia", r: "Por dia" },
  { v: "semana", r: "Por semana" },
  { v: "mes", r: "Por mês" },
];
export const EXIBICOES: Array<{ v: Exibicao; r: string }> = [
  { v: "barras", r: "Barras" },
  { v: "linha", r: "Linha" },
  { v: "rosca", r: "Rosca" },
  { v: "tabela", r: "Tabela" },
  { v: "kpi", r: "Número (KPI)" },
];

export function normalizarConfigGrafico(c: unknown): ConfigGrafico {
  const x = (c && typeof c === "object" ? c : {}) as Partial<ConfigGrafico>;
  const de = <T extends string>(v: unknown, lista: Array<{ v: T }>, padrao: T) => (lista.some((o) => o.v === v) ? (v as T) : padrao);
  return {
    metrica: de(x.metrica, METRICAS, CONFIG_GRAFICO_PADRAO.metrica),
    periodo: de(x.periodo, PERIODOS, CONFIG_GRAFICO_PADRAO.periodo),
    granularidade: de(x.granularidade, GRANULARIDADES, "auto"),
    exibicao: de(x.exibicao, EXIBICOES, CONFIG_GRAFICO_PADRAO.exibicao),
    categoriaId: typeof x.categoriaId === "string" ? x.categoriaId : null,
  };
}

// ---------------------------------------------------------------------------
// Datas

const utc = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const somarDias = (d: string, n: number) => iso(utc(d) + n * 86_400_000);
const diasEntre = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 86_400_000);
const inicioDoMes = (d: string) => `${d.slice(0, 7)}-01`;
const fimDoMes = (d: string) => iso(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0) + 12 * 3_600_000);
const somarMeses = (d: string, n: number) => iso(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1 + n, 1, 12));

export interface Intervalo {
  inicio: string;
  fim: string;
}

/** Datas do período (até hoje) e do período anterior do mesmo tamanho, para comparar. */
export function intervaloDoPeriodo(p: Periodo, hoje: string): Intervalo & { anterior: Intervalo } {
  let inicio: string;
  switch (p) {
    case "7d": inicio = somarDias(hoje, -6); break;
    case "30d": inicio = somarDias(hoje, -29); break;
    case "mes": inicio = inicioDoMes(hoje); break;
    case "3m": inicio = somarMeses(hoje, -2); break;
    case "6m": inicio = somarMeses(hoje, -5); break;
    case "12m": inicio = somarMeses(hoje, -11); break;
    case "ano": inicio = `${hoje.slice(0, 4)}-01-01`; break;
  }
  const dias = diasEntre(inicio, hoje) + 1;
  // Mês e ano comparam com o mesmo trecho do mês/ano anterior (1º a dia de hoje).
  const anterior =
    p === "mes" ? { inicio: somarMeses(hoje, -1), fim: somarDias(somarMeses(hoje, -1), dias - 1) }
    : p === "ano" ? { inicio: `${+hoje.slice(0, 4) - 1}-01-01`, fim: `${+hoje.slice(0, 4) - 1}${hoje.slice(4)}` }
    : { inicio: somarDias(inicio, -dias), fim: somarDias(inicio, -1) };
  return { inicio, fim: hoje, anterior };
}

export function granularidadeEfetiva(g: Granularidade, intervalo: Intervalo): Exclude<Granularidade, "auto"> {
  if (g !== "auto") return g;
  const dias = diasEntre(intervalo.inicio, intervalo.fim) + 1;
  return dias <= 31 ? "dia" : dias <= 100 ? "semana" : "mes";
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export interface Balde {
  rotulo: string;
  inicio: string;
  fim: string;
}

/** Divide o período em dias, semanas (começando na segunda) ou meses. */
export function baldes(intervalo: Intervalo, gran: Exclude<Granularidade, "auto">): Balde[] {
  const saida: Balde[] = [];
  let atual = intervalo.inicio;
  if (gran === "semana") {
    const dow = (new Date(utc(atual)).getUTCDay() + 6) % 7;
    atual = somarDias(atual, -dow);
  }
  if (gran === "mes") atual = inicioDoMes(atual);
  while (atual <= intervalo.fim && saida.length < 400) {
    const fim = gran === "dia" ? atual : gran === "semana" ? somarDias(atual, 6) : fimDoMes(atual);
    const ini = atual < intervalo.inicio ? intervalo.inicio : atual;
    const rotulo = gran === "mes" ? `${MESES[+atual.slice(5, 7) - 1]}/${atual.slice(2, 4)}` : `${atual.slice(8, 10)}/${atual.slice(5, 7)}`;
    saida.push({ rotulo, inicio: ini, fim: fim > intervalo.fim ? intervalo.fim : fim });
    atual = gran === "dia" ? somarDias(atual, 1) : gran === "semana" ? somarDias(atual, 7) : somarMeses(atual, 1);
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Valores

const DISPONIVEIS = new Set(["BANCO", "CARTEIRA_DIGITAL", "DINHEIRO", "BENEFICIO"]);

/** Contas que entram na métrica: categorias de despesa/receita, uma categoria (e filhas) ou contas de saldo. */
function contasDaMetrica(contas: Conta[], c: ConfigGrafico): { ids: Set<string>; sinal: (tipo: string, conta: Conta) => number } {
  if (c.metrica === "saldo") {
    const ids = new Set(contas.filter((x) => x.tipo === "ATIVO" && DISPONIVEIS.has(x.subtipo ?? "")).map((x) => x.id));
    return { ids, sinal: (t) => (t === "DEBITO" ? 1 : -1) };
  }
  if (c.metrica === "categoria") {
    const ids = new Set<string>();
    if (c.categoriaId) {
      ids.add(c.categoriaId);
      let cresceu = true;
      while (cresceu) {
        cresceu = false;
        for (const x of contas) if (x.categoria_pai_id && ids.has(x.categoria_pai_id) && !ids.has(x.id)) { ids.add(x.id); cresceu = true; }
      }
    }
    return { ids, sinal: (t, conta) => (conta.tipo === "RECEITA" ? (t === "CREDITO" ? 1 : -1) : t === "DEBITO" ? 1 : -1) };
  }
  const tipos = c.metrica === "despesas" ? ["DESPESA"] : c.metrica === "receitas" ? ["RECEITA"] : ["DESPESA", "RECEITA"];
  const ids = new Set(contas.filter((x) => tipos.includes(x.tipo)).map((x) => x.id));
  // Resultado: receita soma, despesa subtrai.
  return {
    ids,
    sinal: (t, conta) => (conta.tipo === "RECEITA" ? (t === "CREDITO" ? 1 : -1) : (t === "DEBITO" ? 1 : -1) * (c.metrica === "resultado" ? -1 : 1)),
  };
}

/** Movimento da métrica entre duas datas (inclusive), por conta. */
function movimentoPorConta(lancamentos: Lancamento[], contas: Conta[], c: ConfigGrafico, inicio: string, fim: string): Map<string, number> {
  const porId = new Map(contas.map((x) => [x.id, x]));
  const { ids, sinal } = contasDaMetrica(contas, c);
  const totais = new Map<string, number>();
  for (const l of lancamentos) {
    if (l.data < inicio || l.data > fim) continue;
    for (const p of l.partidas) {
      if (!ids.has(p.conta_id)) continue;
      totais.set(p.conta_id, (totais.get(p.conta_id) ?? 0) + sinal(p.tipo, porId.get(p.conta_id)!) * p.valor_centavos);
    }
  }
  return totais;
}

const soma = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);

export interface Ponto {
  rotulo: string;
  valor: number;
}

/** Série no tempo. Para "saldo", é o saldo no fim de cada pedaço; para as outras, a soma do pedaço. */
export function serieDoGrafico(lancamentos: Lancamento[], contas: Conta[], c: ConfigGrafico, hoje: string): Ponto[] {
  const intervalo = intervaloDoPeriodo(c.periodo, hoje);
  const lista = baldes(intervalo, granularidadeEfetiva(c.granularidade, intervalo));
  if (c.metrica === "saldo") {
    const atual = contas.filter((x) => x.tipo === "ATIVO" && DISPONIVEIS.has(x.subtipo ?? "")).reduce((s, x) => s + x.saldo_atual_centavos, 0);
    // Saldo no fim de cada pedaço = saldo de hoje − o que entrou/saiu depois daquela data.
    return lista.map((b) => ({ rotulo: b.rotulo, valor: atual - soma(movimentoPorConta(lancamentos, contas, c, somarDias(b.fim, 1), "9999-12-31")) }));
  }
  return lista.map((b) => ({ rotulo: b.rotulo, valor: soma(movimentoPorConta(lancamentos, contas, c, b.inicio, b.fim)) }));
}

export interface Fatia {
  nome: string;
  valor: number;
  outras?: boolean;
}

/** Divisão por categoria (ou por conta, no saldo), das maiores para as menores; o resto vira "Outras". */
export function divisaoDoGrafico(lancamentos: Lancamento[], contas: Conta[], c: ConfigGrafico, hoje: string, maximo = 7): Fatia[] {
  const nomes = new Map(contas.map((x) => [x.id, x.nome]));
  let lista: Fatia[];
  if (c.metrica === "saldo") {
    lista = contas.filter((x) => x.tipo === "ATIVO" && DISPONIVEIS.has(x.subtipo ?? "") && x.saldo_atual_centavos > 0).map((x) => ({ nome: x.nome, valor: x.saldo_atual_centavos }));
  } else {
    // "Resultado" na rosca mostra para onde foi o dinheiro (as despesas).
    const cfg = c.metrica === "resultado" ? { ...c, metrica: "despesas" as const } : c;
    const intervalo = intervaloDoPeriodo(c.periodo, hoje);
    lista = [...movimentoPorConta(lancamentos, contas, cfg, intervalo.inicio, intervalo.fim)].filter(([, v]) => v > 0).map(([id, valor]) => ({ nome: nomes.get(id) ?? "?", valor }));
  }
  lista.sort((a, b) => b.valor - a.valor);
  if (lista.length <= maximo) return lista;
  const resto = lista.slice(maximo).reduce((s, f) => s + f.valor, 0);
  return [...lista.slice(0, maximo), { nome: "Outras", valor: resto, outras: true }];
}

/** Total do período e do período anterior (para o número com seta de variação). */
export function kpiDoGrafico(lancamentos: Lancamento[], contas: Conta[], c: ConfigGrafico, hoje: string): { atual: number; anterior: number; variacao: number | null } {
  const intervalo = intervaloDoPeriodo(c.periodo, hoje);
  if (c.metrica === "saldo") {
    const s = serieDoGrafico(lancamentos, contas, { ...c, granularidade: "dia", periodo: "7d" }, hoje);
    const atual = s[s.length - 1]?.valor ?? 0;
    const passado = serieDoGrafico(lancamentos, contas, { ...c, granularidade: "dia", periodo: "7d" }, intervalo.anterior.fim);
    const anterior = passado[passado.length - 1]?.valor ?? 0;
    return { atual, anterior, variacao: anterior !== 0 ? (atual - anterior) / Math.abs(anterior) : null };
  }
  const atual = soma(movimentoPorConta(lancamentos, contas, c, intervalo.inicio, intervalo.fim));
  const anterior = soma(movimentoPorConta(lancamentos, contas, c, intervalo.anterior.inicio, intervalo.anterior.fim));
  return { atual, anterior, variacao: anterior !== 0 ? (atual - anterior) / Math.abs(anterior) : null };
}

/** Título automático: "Despesas · últimos 6 meses". */
export function tituloDoGrafico(c: ConfigGrafico, contas: Conta[]): string {
  const metrica = c.metrica === "categoria" ? contas.find((x) => x.id === c.categoriaId)?.nome ?? "Categoria" : c.metrica === "resultado" ? "Resultado" : METRICAS.find((m) => m.v === c.metrica)!.r;
  return `${metrica} · ${PERIODOS.find((p) => p.v === c.periodo)!.r.toLowerCase()}`;
}
