// Cálculos dos widgets do Início.

import type { Agendamento, Conta, Lancamento } from "../../types/accounting";
import type { Orcamento } from "../../types/extras";

const somarDias = (iso: string, d: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + d)).toISOString().slice(0, 10);

function gastoDo(l: Lancamento, despesas: Set<string>): number {
  return l.partidas.filter((p) => despesas.has(p.conta_id)).reduce((s, p) => s + (p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos), 0);
}

export function gastosRecentes(lancamentos: Lancamento[], contas: Conta[], hoje: string): { hoje: number; semana: number; diasSemGastar: number } {
  const despesas = new Set(contas.filter((c) => c.tipo === "DESPESA").map((c) => c.id));
  const estornados = new Set(lancamentos.map((l) => l.estornado_de).filter(Boolean));
  const validos = lancamentos.filter((l) => l.origem !== "ESTORNO" && !estornados.has(l.id) && l.data <= hoje);
  const porDia = new Map<string, number>();
  for (const l of validos) {
    const g = gastoDo(l, despesas);
    if (g > 0) porDia.set(l.data, (porDia.get(l.data) ?? 0) + g);
  }
  const inicioSemana = somarDias(hoje, -((new Date(`${hoje}T12:00:00Z`).getUTCDay() + 6) % 7));
  let semana = 0;
  for (const [d, v] of porDia) if (d >= inicioSemana && d <= hoje) semana += v;
  let dias = 0;
  for (let d = hoje; dias < 366 && !porDia.has(d); d = somarDias(d, -1)) dias++;
  return { hoje: porDia.get(hoje) ?? 0, semana, diasSemGastar: dias };
}

export function proximosRecebimentos(agendamentos: Agendamento[], hoje: string, dias = 30): Agendamento[] {
  const fim = somarDias(hoje, dias);
  return agendamentos.filter((a) => !a.pago_em && a.tipo === "RECEBER" && a.vencimento <= fim).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

export function assinaturasDoMes(lancamentos: Lancamento[], hoje: string): { total: number; quantidade: number } {
  const mes = hoje.slice(0, 7);
  const ls = lancamentos.filter((l) => l.etiqueta === "ASSINATURA" && l.data.startsWith(mes) && l.origem !== "ESTORNO");
  return { total: ls.reduce((s, l) => s + l.partidas.filter((p) => p.tipo === "DEBITO").reduce((a, p) => a + p.valor_centavos, 0), 0), quantidade: ls.length };
}

// ---------------------------------------------------------------------------
// Widgets novos

const fimDoMes = (iso: string) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).toISOString().slice(0, 10);
const inicioDoMes = (iso: string) => `${iso.slice(0, 7)}-01`;

/** Dias entre duas datas ISO (b - a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** Contas a pagar em aberto: as atrasadas e as que vencem nos próximos `dias`. */
export function contasAPagar(agendamentos: Agendamento[], hoje: string, dias = 7): { atrasadas: Agendamento[]; proximas: Agendamento[]; total: number } {
  const fim = somarDias(hoje, dias);
  const abertas = agendamentos.filter((a) => !a.pago_em && a.tipo !== "RECEBER" && a.vencimento <= fim).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const atrasadas = abertas.filter((a) => a.vencimento < hoje);
  const proximas = abertas.filter((a) => a.vencimento >= hoje);
  return { atrasadas, proximas, total: abertas.reduce((s, a) => s + a.valor_centavos, 0) };
}

const SUBTIPOS_DISPONIVEIS = new Set(["BANCO", "CARTEIRA_DIGITAL", "DINHEIRO", "BENEFICIO"]);

/** Contas onde o dinheiro está disponível (bancos, carteiras, dinheiro e benefícios), do maior saldo ao menor. */
export function saldosDisponiveis(contas: Conta[]): Conta[] {
  return contas.filter((c) => c.ativa && c.tipo === "ATIVO" && SUBTIPOS_DISPONIVEIS.has(c.subtipo ?? "")).sort((a, b) => b.saldo_atual_centavos - a.saldo_atual_centavos);
}

/** Patrimônio líquido = tudo o que você tem (ativos) − tudo o que deve (passivos). */
export function patrimonioLiquido(contas: Conta[]): { ativos: number; passivos: number; liquido: number } {
  const ativos = contas.filter((c) => c.tipo === "ATIVO").reduce((s, c) => s + c.saldo_atual_centavos, 0);
  const passivos = contas.filter((c) => c.tipo === "PASSIVO").reduce((s, c) => s + c.saldo_atual_centavos, 0);
  return { ativos, passivos, liquido: ativos - passivos };
}

/** Despesas e receitas de um período (sem estornos). */
function movimentoDoPeriodo(lancamentos: Lancamento[], contas: Conta[], inicio: string, fim: string): { receitas: number; despesas: number } {
  const tipo = new Map(contas.map((c) => [c.id, c.tipo]));
  let receitas = 0;
  let despesas = 0;
  for (const l of lancamentos) {
    if (l.data < inicio || l.data > fim) continue;
    for (const p of l.partidas) {
      const t = tipo.get(p.conta_id);
      if (t === "DESPESA") despesas += p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos;
      else if (t === "RECEITA") receitas += p.tipo === "CREDITO" ? p.valor_centavos : -p.valor_centavos;
    }
  }
  return { receitas, despesas };
}

/** Quanto sobrou da renda no mês: (receitas − despesas) ÷ receitas. `taxa` é null sem receitas. */
export function poupancaDoMes(lancamentos: Lancamento[], contas: Conta[], hoje: string): { receitas: number; despesas: number; sobra: number; taxa: number | null } {
  const { receitas, despesas } = movimentoDoPeriodo(lancamentos, contas, inicioDoMes(hoje), fimDoMes(hoje));
  return { receitas, despesas, sobra: receitas - despesas, taxa: receitas > 0 ? (receitas - despesas) / receitas : null };
}

/** Média de despesas dos últimos `meses` meses completos (sem contar o mês atual). */
export function gastoMedioMensal(lancamentos: Lancamento[], contas: Conta[], hoje: string, meses = 3): number {
  let soma = 0;
  let contados = 0;
  for (let i = 1; i <= meses; i++) {
    const ref = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1 - i, 1)).toISOString().slice(0, 10);
    const { despesas } = movimentoDoPeriodo(lancamentos, contas, ref, fimDoMes(ref));
    if (despesas > 0) {
      soma += despesas;
      contados++;
    }
  }
  return contados ? Math.round(soma / contados) : 0;
}

/** Reserva de emergência: quantos meses de gasto médio o dinheiro disponível cobre. */
export function reservaDeEmergencia(contas: Conta[], lancamentos: Lancamento[], hoje: string): { disponivel: number; gastoMedio: number; meses: number | null } {
  const disponivel = saldosDisponiveis(contas).reduce((s, c) => s + c.saldo_atual_centavos, 0);
  const gastoMedio = gastoMedioMensal(lancamentos, contas, hoje);
  return { disponivel, gastoMedio, meses: gastoMedio > 0 ? disponivel / gastoMedio : null };
}

/** Gasto por categoria no mês (maiores primeiro). */
export function maioresGastosDoMes(lancamentos: Lancamento[], contas: Conta[], hoje: string, limite = 5): Array<{ id: string; nome: string; valor: number }> {
  const nomes = new Map(contas.map((c) => [c.id, c.nome]));
  const tipo = new Map(contas.map((c) => [c.id, c.tipo]));
  const totais = new Map<string, number>();
  const ini = inicioDoMes(hoje);
  const fim = fimDoMes(hoje);
  for (const l of lancamentos) {
    if (l.data < ini || l.data > fim) continue;
    for (const p of l.partidas) {
      if (tipo.get(p.conta_id) !== "DESPESA") continue;
      totais.set(p.conta_id, (totais.get(p.conta_id) ?? 0) + (p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos));
    }
  }
  return [...totais.entries()].filter(([, v]) => v > 0).map(([id, valor]) => ({ id, nome: nomes.get(id) ?? "?", valor })).sort((a, b) => b.valor - a.valor).slice(0, limite);
}

/** Orçamento do mês: gasto × limite de cada categoria, das mais apertadas para as mais folgadas. */
export function progressoDoOrcamento(orcamentos: Orcamento[], lancamentos: Lancamento[], contas: Conta[], hoje: string): Array<{ id: string; nome: string; gasto: number; limite: number; pct: number }> {
  const gastos = new Map(maioresGastosDoMes(lancamentos, contas, hoje, 1000).map((g) => [g.id, g.valor]));
  const nomes = new Map(contas.map((c) => [c.id, c.nome]));
  return orcamentos
    .filter((o) => o.limite_centavos > 0)
    .map((o) => {
      const gasto = gastos.get(o.categoria_id) ?? 0;
      return { id: o.categoria_id, nome: nomes.get(o.categoria_id) ?? "?", gasto, limite: o.limite_centavos, pct: gasto / o.limite_centavos };
    })
    .sort((a, b) => b.pct - a.pct);
}

/** Próxima data (hoje ou depois) com o dia do mês informado; dia 31 vira o último dia em meses curtos. */
export function proximoDiaDoMes(hoje: string, dia: number): { data: string; dias: number } {
  for (let i = 0; i < 2; i++) {
    const ano = +hoje.slice(0, 4);
    const mes = +hoje.slice(5, 7) - 1 + i;
    const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
    const data = new Date(Date.UTC(ano, mes, Math.min(Math.max(1, dia), ultimo))).toISOString().slice(0, 10);
    if (data >= hoje) return { data, dias: diasEntre(hoje, data) };
  }
  return { data: hoje, dias: 0 };
}

/** Semanas do mês (domingo a sábado), com null nos dias de fora do mês. */
export function calendarioDoMes(hoje: string): Array<Array<string | null>> {
  const ini = inicioDoMes(hoje);
  const ultimo = +fimDoMes(hoje).slice(8, 10);
  const primeiroDiaSemana = new Date(`${ini}T12:00:00Z`).getUTCDay();
  const celulas: Array<string | null> = Array(primeiroDiaSemana).fill(null);
  for (let d = 1; d <= ultimo; d++) celulas.push(`${hoje.slice(0, 7)}-${String(d).padStart(2, "0")}`);
  while (celulas.length % 7) celulas.push(null);
  const semanas: Array<Array<string | null>> = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));
  return semanas;
}

/**
 * Calculadora rápida: + − × ÷ %, parênteses e vírgula decimal, sem usar eval.
 * "10% de 250" não é aceito; "250*10%" = 25. Devolve null se a conta for inválida.
 */
export function calcular(expressao: string): number | null {
  const texto = expressao.replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/(\d)\.(\d{3})(?!\d)/g, "$1$2").replace(/,/g, ".");
  if (!texto || !/^[\d.+\-*/()%]+$/.test(texto)) return null;
  let i = 0;
  const espiar = () => texto[i];
  function numero(): number | null {
    const m = /^\d*\.?\d+|^\d+\./.exec(texto.slice(i));
    if (!m) return null;
    i += m[0].length;
    let v = Number(m[0]);
    while (espiar() === "%") {
      i++;
      v /= 100;
    }
    return v;
  }
  function fator(): number | null {
    if (espiar() === "-") {
      i++;
      const v = fator();
      return v === null ? null : -v;
    }
    if (espiar() === "+") {
      i++;
      return fator();
    }
    if (espiar() === "(") {
      i++;
      const v = soma();
      if (v === null || espiar() !== ")") return null;
      i++;
      return v;
    }
    return numero();
  }
  function produto(): number | null {
    let v = fator();
    while (v !== null && (espiar() === "*" || espiar() === "/")) {
      const op = texto[i++];
      const d = fator();
      if (d === null) return null;
      v = op === "*" ? v * d : v / d;
    }
    return v;
  }
  function soma(): number | null {
    let v = produto();
    while (v !== null && (espiar() === "+" || espiar() === "-")) {
      const op = texto[i++];
      const d = produto();
      if (d === null) return null;
      v = op === "+" ? v + d : v - d;
    }
    return v;
  }
  const r = soma();
  return r !== null && i === texto.length && Number.isFinite(r) ? Math.round(r * 1e8) / 1e8 : null;
}
