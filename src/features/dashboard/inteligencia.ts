// Cálculos "inteligentes" do painel. Tudo é regra simples sobre os dados reais do usuário
// (nada de IA nem de dados inventados) e os resultados que são estimativas são rotulados como tais.

import { despesasPorCategoriaNoMes } from "../../services/agregacoes";
import { calcularCiclo } from "../contas/ciclo";
import type { Agendamento, Conta, Lancamento } from "../../types/accounting";
import type { InfoBackup, Meta, Orcamento } from "../../types/extras";

export type Gravidade = "critico" | "atencao" | "info";

export interface Alerta {
  id: string;
  gravidade: Gravidade;
  titulo: string;
  detalhe: string;
  rota: string;
}

export interface EntradaInteligencia {
  hoje: string;
  contas: Conta[];
  lancamentos: Lancamento[];
  agendamentos: Agendamento[];
  metas: Meta[];
  orcamentos: Orcamento[];
  ultimoBackup: InfoBackup | null;
}

const real = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function limitesDoMes(hoje: string) {
  const [a, m] = hoje.split("-").map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { inicio: `${a}-${mm}-01`, fim: `${a}-${mm}-${String(ultimo).padStart(2, "0")}`, dia: Number(hoje.slice(8, 10)), diasNoMes: ultimo };
}

function mesAnterior(hoje: string) {
  const [a, m] = hoje.split("-").map(Number);
  const d = new Date(a, m - 2, 1);
  const ano = d.getFullYear();
  const mes = d.getMonth() + 1;
  const mm = String(mes).padStart(2, "0");
  return { inicio: `${ano}-${mm}-01`, fim: `${ano}-${mm}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}` };
}

/** Soma (natureza da conta) das contas de um tipo num intervalo de datas. */
export function totalPorTipo(lancamentos: Lancamento[], contas: Conta[], tipo: "RECEITA" | "DESPESA", inicio: string, fim: string): number {
  const ids = new Set(contas.filter((c) => c.tipo === tipo).map((c) => c.id));
  let total = 0;
  for (const l of lancamentos) {
    if (l.data < inicio || l.data > fim) continue;
    for (const p of l.partidas) {
      if (!ids.has(p.conta_id)) continue;
      const deb = p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos;
      total += tipo === "DESPESA" ? deb : -deb;
    }
  }
  return total;
}

export function calcularMetricas(e: EntradaInteligencia) {
  const { hoje, contas, lancamentos } = e;
  const mes = limitesDoMes(hoje);
  const ant = mesAnterior(hoje);
  const receitaMes = totalPorTipo(lancamentos, contas, "RECEITA", mes.inicio, mes.fim);
  const despesaMes = totalPorTipo(lancamentos, contas, "DESPESA", mes.inicio, mes.fim);
  const receitaAnt = totalPorTipo(lancamentos, contas, "RECEITA", ant.inicio, ant.fim);
  const despesaAnt = totalPorTipo(lancamentos, contas, "DESPESA", ant.inicio, ant.fim);

  const ativosLiquidos = contas.filter((c) => c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA" && c.ativa).reduce((s, c) => s + c.saldo_atual_centavos, 0);
  // Nos primeiros dias do mês a projeção linear distorce (poucos dados); só projeta a partir do dia 7.
  const amostraSuficiente = mes.dia >= 7;
  let gastoDiario = amostraSuficiente ? despesaMes / mes.dia : 0;

  // Média de despesa dos 3 meses anteriores (para cobertura da reserva de emergência).
  let somaTres = 0;
  let mesesComGasto = 0;
  for (let k = 1; k <= 3; k++) {
    const [a, m] = hoje.split("-").map(Number);
    const d = new Date(a, m - 1 - k, 1);
    const ano = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const fim = `${ano}-${mm}-${String(new Date(ano, d.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;
    const v = totalPorTipo(lancamentos, contas, "DESPESA", `${ano}-${mm}-01`, fim);
    if (v > 0) {
      somaTres += v;
      mesesComGasto++;
    }
  }
  const mediaDespesa = mesesComGasto > 0 ? somaTres / mesesComGasto : 0;
  if (!amostraSuficiente && mediaDespesa > 0) gastoDiario = mediaDespesa / 30;
  const projecaoDespesa = amostraSuficiente ? Math.round(gastoDiario * mes.diasNoMes) : null;
  const diasDeCaixa = gastoDiario > 0 ? Math.floor(ativosLiquidos / gastoDiario) : null;
  const metasReserva = e.metas.filter((m) => m.tipo === "RESERVA");
  const reserva = metasReserva.reduce((s, m) => s + m.guardado_centavos, 0);
  const mesesReserva = metasReserva.length > 0 && mediaDespesa > 0 ? reserva / mediaDespesa : null;

  const taxaPoupanca = receitaMes > 0 ? ((receitaMes - despesaMes) / receitaMes) * 100 : null;
  return { mes, receitaMes, despesaMes, receitaAnt, despesaAnt, ativosLiquidos, gastoDiario, projecaoDespesa, diasDeCaixa, mediaDespesa, reserva, mesesReserva, taxaPoupanca };
}

export function gerarAlertas(e: EntradaInteligencia): Alerta[] {
  const { hoje } = e;
  const alertas: Alerta[] = [];
  const abertos = e.agendamentos.filter((a) => !a.pago_em);

  const atrasados = abertos.filter((a) => a.vencimento < hoje);
  if (atrasados.length > 0) {
    alertas.push({
      id: "atrasadas",
      gravidade: "critico",
      titulo: `${atrasados.length} conta(s) em atraso`,
      detalhe: `${real(atrasados.reduce((s, a) => s + a.valor_centavos, 0))} — ${atrasados.slice(0, 2).map((a) => a.descricao).join(", ")}${atrasados.length > 2 ? "…" : ""}`,
      rota: "/lancamentos",
    });
  }
  const dias = (v: string) => Math.round((Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) - Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10))) / 86_400_000);
  const proximas = abertos.filter((a) => a.vencimento >= hoje && dias(a.vencimento) <= 3);
  if (proximas.length > 0) {
    alertas.push({
      id: "vencendo",
      gravidade: "atencao",
      titulo: `${proximas.length} conta(s) vencem em até 3 dias`,
      detalhe: `${real(proximas.reduce((s, a) => s + a.valor_centavos, 0))} — ${proximas.slice(0, 2).map((a) => a.descricao).join(", ")}`,
      rota: "/lancamentos",
    });
  }

  const mes = limitesDoMes(hoje);
  const gastoPorCat = new Map(despesasPorCategoriaNoMes(e.lancamentos, e.contas, mes.inicio, mes.fim).map((f) => [f.contaId, f.valorCentavos]));
  const nomeConta = new Map(e.contas.map((c) => [c.id, c.nome]));
  const estouradas = e.orcamentos.filter((o) => (gastoPorCat.get(o.categoria_id) ?? 0) > o.limite_centavos);
  if (estouradas.length > 0) {
    alertas.push({
      id: "orcamento",
      gravidade: "critico",
      titulo: `${estouradas.length} limite(s) do orçamento estourado(s)`,
      detalhe: estouradas.map((o) => nomeConta.get(o.categoria_id) ?? "").join(", "),
      rota: "/orcamento",
    });
  }
  const quase = e.orcamentos.filter((o) => {
    const g = gastoPorCat.get(o.categoria_id) ?? 0;
    return g <= o.limite_centavos && g >= o.limite_centavos * 0.8;
  });
  if (quase.length > 0) {
    alertas.push({ id: "orcamento80", gravidade: "atencao", titulo: `${quase.length} categoria(s) acima de 80% do limite`, detalhe: quase.map((o) => nomeConta.get(o.categoria_id) ?? "").join(", "), rota: "/orcamento" });
  }

  for (const c of e.contas.filter((x) => x.tipo === "PASSIVO" && x.subtipo === "CARTAO_CREDITO" && x.ativa)) {
    const limite = c.limite_centavos ?? 0;
    if (limite > 0 && c.saldo_atual_centavos / limite >= 0.8) {
      alertas.push({ id: `cartao-${c.id}`, gravidade: c.saldo_atual_centavos >= limite ? "critico" : "atencao", titulo: `${c.nome}: ${Math.round((c.saldo_atual_centavos / limite) * 100)}% do limite usado`, detalhe: `Fatura de ${real(c.saldo_atual_centavos)} para limite de ${real(limite)}`, rota: "/cartoes" });
    }
    if (c.saldo_atual_centavos > 0 && c.dia_fechamento_fatura && c.dia_vencimento_fatura) {
      const ciclo = calcularCiclo(c.dia_fechamento_fatura, c.dia_vencimento_fatura, hoje);
      if (ciclo.diasParaVencer >= 0 && ciclo.diasParaVencer <= 5) {
        alertas.push({ id: `fatura-${c.id}`, gravidade: "atencao", titulo: `Fatura do ${c.nome} vence em ${ciclo.diasParaVencer} dia(s)`, detalhe: `Saldo devedor de ${real(c.saldo_atual_centavos)}`, rota: "/cartoes" });
      }
    }
  }

  const negativas = e.contas.filter((c) => c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA" && c.ativa && c.saldo_atual_centavos < 0);
  if (negativas.length > 0) {
    alertas.push({ id: "negativo", gravidade: "critico", titulo: `${negativas.length} conta(s) com saldo negativo`, detalhe: negativas.map((c) => c.nome).join(", "), rota: "/contas-bancarias" });
  }

  const vencidas = e.metas.filter((m) => m.prazo && m.prazo < hoje && m.guardado_centavos < m.valor_alvo_centavos);
  if (vencidas.length > 0) {
    alertas.push({ id: "metas", gravidade: "info", titulo: `${vencidas.length} meta(s) com prazo vencido`, detalhe: vencidas.map((m) => m.nome).join(", "), rota: "/metas" });
  }

  if (!e.ultimoBackup) {
    alertas.push({ id: "backup", gravidade: "info", titulo: "Nenhum backup feito ainda", detalhe: "Faça uma cópia dos seus dados em Backup e Segurança.", rota: "/backup" });
  } else {
    const idade = (Date.now() - new Date(e.ultimoBackup.criado_em.replace(" ", "T")).getTime()) / 86_400_000;
    if (idade > 14) alertas.push({ id: "backup-antigo", gravidade: "info", titulo: `Último backup há ${Math.floor(idade)} dias`, detalhe: "Considere fazer um backup novo.", rota: "/backup" });
  }

  const ordem: Record<Gravidade, number> = { critico: 0, atencao: 1, info: 2 };
  return alertas.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade]);
}

export interface Saude {
  pontos: number;
  rotulo: string;
  detalhes: Array<{ nome: string; pontos: number; maximo: number; dica: string }>;
}

/** Pontuação de 0 a 100 — heurística simples e transparente, não é score de crédito. */
export function calcularSaude(e: EntradaInteligencia, m: ReturnType<typeof calcularMetricas>): Saude | null {
  if (m.receitaMes <= 0 && m.despesaMes <= 0) return null;
  const detalhes: Saude["detalhes"] = [];

  const poup = m.taxaPoupanca ?? 0;
  detalhes.push({ nome: "Poupança do mês", pontos: Math.round(Math.max(0, Math.min(1, poup / 20)) * 30), maximo: 30, dica: poup >= 20 ? "Você está poupando 20% ou mais." : "Meta: poupar 20% da renda." });

  const atrasadas = e.agendamentos.filter((a) => !a.pago_em && a.vencimento < e.hoje).length;
  detalhes.push({ nome: "Contas em dia", pontos: Math.max(0, 25 - atrasadas * 8), maximo: 25, dica: atrasadas ? `${atrasadas} conta(s) atrasada(s).` : "Nenhuma conta atrasada." });

  const mesLim = limitesDoMes(e.hoje);
  const gasto = new Map(despesasPorCategoriaNoMes(e.lancamentos, e.contas, mesLim.inicio, mesLim.fim).map((f) => [f.contaId, f.valorCentavos]));
  const estouros = e.orcamentos.filter((o) => (gasto.get(o.categoria_id) ?? 0) > o.limite_centavos).length;
  detalhes.push({ nome: "Orçamento", pontos: e.orcamentos.length === 0 ? 10 : Math.max(0, 20 - estouros * 5), maximo: 20, dica: e.orcamentos.length === 0 ? "Defina limites para pontuar aqui." : estouros ? `${estouros} limite(s) estourado(s).` : "Dentro dos limites." });

  const meses = m.mesesReserva ?? 0;
  detalhes.push({ nome: "Reserva de emergência", pontos: Math.round(Math.max(0, Math.min(1, meses / 6)) * 15), maximo: 15, dica: m.mesesReserva === null ? "Crie uma meta do tipo Reserva." : `Cobre ${meses.toFixed(1)} mês(es) de gastos (meta: 6).` });

  const cartoes = e.contas.filter((c) => c.tipo === "PASSIVO" && c.subtipo === "CARTAO_CREDITO" && c.ativa && (c.limite_centavos ?? 0) > 0);
  const uso = cartoes.length ? cartoes.reduce((s, c) => s + c.saldo_atual_centavos, 0) / cartoes.reduce((s, c) => s + (c.limite_centavos ?? 0), 0) : 0;
  detalhes.push({ nome: "Uso do cartão", pontos: uso < 0.3 ? 10 : uso < 0.7 ? 5 : 0, maximo: 10, dica: cartoes.length ? `${Math.round(uso * 100)}% do limite usado.` : "Sem cartões." });

  const pontos = detalhes.reduce((s, d) => s + d.pontos, 0);
  return { pontos, rotulo: pontos >= 80 ? "Excelente" : pontos >= 60 ? "Boa" : pontos >= 40 ? "Regular" : "Atenção", detalhes };
}

export function gerarInsights(e: EntradaInteligencia, m: ReturnType<typeof calcularMetricas>): string[] {
  const insights: string[] = [];
  const mes = m.mes;
  const ant = mesAnterior(e.hoje);
  const atuais = despesasPorCategoriaNoMes(e.lancamentos, e.contas, mes.inicio, mes.fim);
  const anteriores = new Map(despesasPorCategoriaNoMes(e.lancamentos, e.contas, ant.inicio, ant.fim).map((f) => [f.contaId, f.valorCentavos]));

  for (const c of atuais.slice(0, 6)) {
    const antes = anteriores.get(c.contaId) ?? 0;
    if (antes > 0 && c.valorCentavos > antes * 1.25 && c.valorCentavos - antes > 5000) {
      insights.push(`${c.nome}: ${real(c.valorCentavos)} neste mês, ${Math.round(((c.valorCentavos - antes) / antes) * 100)}% a mais que no mês passado (${real(antes)}).`);
    } else if (antes > 0 && c.valorCentavos < antes * 0.75 && antes - c.valorCentavos > 5000) {
      insights.push(`${c.nome}: gasto ${Math.round(((antes - c.valorCentavos) / antes) * 100)}% menor que no mês passado.`);
    }
  }
  if (atuais[0] && m.despesaMes > 0) {
    insights.push(`A categoria que mais pesa é ${atuais[0].nome}: ${Math.round((atuais[0].valorCentavos / m.despesaMes) * 100)}% das despesas do mês.`);
  }
  if (m.despesaAnt > 0 && m.despesaMes > 0 && m.projecaoDespesa !== null) {
    const proj = m.projecaoDespesa;
    insights.push(`No ritmo atual, as despesas do mês fecham perto de ${real(proj)} (estimativa), ${proj > m.despesaAnt ? "acima" : "abaixo"} dos ${real(m.despesaAnt)} do mês passado.`);
  }
  if (m.taxaPoupanca !== null) {
    insights.push(m.taxaPoupanca >= 20 ? `Você está poupando ${m.taxaPoupanca.toFixed(0)}% da renda do mês — acima da meta de 20%.` : m.taxaPoupanca >= 0 ? `Taxa de poupança de ${m.taxaPoupanca.toFixed(0)}%: faltam ${(20 - m.taxaPoupanca).toFixed(0)} pontos para a meta de 20%.` : `Neste mês você gastou mais do que recebeu (${real(m.despesaMes - m.receitaMes)} a mais).`);
  }
  if (m.diasDeCaixa !== null && m.gastoDiario > 0) insights.push(`Com o gasto médio diário de ${real(Math.round(m.gastoDiario))}, o saldo atual das contas cobre cerca de ${m.diasDeCaixa} dia(s).`);
  return insights.slice(0, 5);
}

/** Gasto por dia da semana (0 = domingo) no período. */
export function gastoPorDiaDaSemana(lancamentos: Lancamento[], contas: Conta[], inicio: string, fim: string): number[] {
  const ids = new Set(contas.filter((c) => c.tipo === "DESPESA").map((c) => c.id));
  const totais = Array(7).fill(0) as number[];
  for (const l of lancamentos) {
    if (l.data < inicio || l.data > fim) continue;
    const [a, mm, d] = l.data.split("-").map(Number);
    const dia = new Date(a, mm - 1, d).getDay();
    for (const p of l.partidas) if (ids.has(p.conta_id)) totais[dia] += p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos;
  }
  return totais.map((v) => Math.max(0, v));
}

/** Maiores despesas individuais (por lançamento) do período. */
export function maioresDespesas(lancamentos: Lancamento[], contas: Conta[], inicio: string, fim: string, limite = 5) {
  const ids = new Set(contas.filter((c) => c.tipo === "DESPESA").map((c) => c.id));
  const estornados = new Set(lancamentos.map((l) => l.estornado_de).filter(Boolean));
  return lancamentos
    .filter((l) => l.data >= inicio && l.data <= fim && l.origem !== "ESTORNO" && !estornados.has(l.id))
    .map((l) => ({ l, valor: l.partidas.filter((p) => ids.has(p.conta_id) && p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0) }))
    .filter((x) => x.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, limite);
}
