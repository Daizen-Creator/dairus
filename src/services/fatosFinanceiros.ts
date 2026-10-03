// Fatos financeiros calculados no próprio Dairus (números exatos) para a IA
// interpretar. A IA nunca faz a conta: ela recebe os totais prontos.

import type { Agendamento, Conta, Lancamento } from "../types/accounting";
import type { Bem, Meta, Orcamento } from "../types/extras";
import { categoriaRaiz, marcaDaDescricao } from "./categorias";
import { detectarAssinaturas } from "../features/lancamentos/detectores";

const somarDias = (iso: string, d: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + d)).toISOString().slice(0, 10);
const mesDeslocado = (hoje: string, n: number) => new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);
const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export interface Fatos {
  hoje: string;
  mesAtual: string;
  mesAnterior: string;
  diaDoMes: number;
  diasNoMes: number;
  saldoLiquido: number;
  investido: number;
  dividaCartoes: number;
  outrasDividas: number;
  gastoMedioMensal: number;
  rendaMediaMensal: number;
  mesesDeReserva: number | null;
  receitasMes: number;
  despesasMes: number;
  despesasMesAnteriorAteHoje: number;
  despesasMesAnterior: number;
  categorias: Array<{ nome: string; atual: number; anterior: number; media3: number; limite: number | null }>;
  diasDaSemana: Array<{ dia: string; total: number; vezes: number }>;
  marcas: Array<{ marca: string; descricao: string; vezes: number; total: number }>;
  assinaturas: Array<{ descricao: string; valor: number; meses: number; marcada: boolean }>;
  contasFixas: Array<{ descricao: string; valor: number; recorrencia: string }>;
  proximasContas: Array<{ descricao: string; valor: number; vencimento: string }>;
  metas: Array<{ nome: string; guardado: number; alvo: number; prazo: string | null }>;
  bens: Array<{ nome: string; tipo: string; valor: number }>;
}

export interface DadosFatos {
  hoje: string;
  contas: Conta[];
  lancamentos: Lancamento[];
  agendamentos: Agendamento[];
  orcamentos?: Orcamento[];
  metas?: Meta[];
  bens?: Bem[];
}

export function calcularFatos(d: DadosFatos): Fatos {
  const { hoje, contas, lancamentos, agendamentos } = d;
  const porId = new Map(contas.map((c) => [c.id, c]));
  const despesa = (id: string) => porId.get(id)?.tipo === "DESPESA";
  const receita = (id: string) => porId.get(id)?.tipo === "RECEITA" && id !== "receita-investimentos";
  const estornados = new Set(lancamentos.map((l) => l.estornado_de).filter(Boolean));
  const validos = lancamentos.filter((l) => l.origem !== "ESTORNO" && !estornados.has(l.id) && l.data <= hoje);
  const gastoDe = (l: Lancamento) => l.partidas.filter((p) => despesa(p.conta_id)).reduce((s, p) => s + (p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos), 0);
  const rendaDe = (l: Lancamento) => l.partidas.filter((p) => receita(p.conta_id)).reduce((s, p) => s + (p.tipo === "CREDITO" ? p.valor_centavos : -p.valor_centavos), 0);

  const mesAtual = hoje.slice(0, 7);
  const mesAnterior = mesDeslocado(hoje, -1);
  const diaDoMes = Number(hoje.slice(8, 10));
  const diasNoMes = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7), 0)).getUTCDate();
  const tres = [mesDeslocado(hoje, -3), mesDeslocado(hoje, -2), mesAnterior];

  let receitasMes = 0, despesasMes = 0, despesasMesAnterior = 0, despesasMesAnteriorAteHoje = 0, gasto3 = 0, renda3 = 0;
  const porCat = new Map<string, { atual: number; anterior: number; tres: number }>();
  const semana = DIAS_SEMANA.map((dia) => ({ dia, total: 0, vezes: 0 }));
  const marcas = new Map<string, { descricao: string; vezes: number; total: number }>();
  const inicio90 = somarDias(hoje, -90);
  for (const l of validos) {
    const mes = l.data.slice(0, 7);
    const g = gastoDe(l);
    const r = rendaDe(l);
    if (mes === mesAtual) { receitasMes += r; despesasMes += g; }
    if (mes === mesAnterior) { despesasMesAnterior += g; if (Number(l.data.slice(8, 10)) <= diaDoMes) despesasMesAnteriorAteHoje += g; }
    if (tres.includes(mes)) { gasto3 += g; renda3 += r; }
    for (const p of l.partidas) {
      if (!despesa(p.conta_id)) continue;
      const raiz = categoriaRaiz(porId.get(p.conta_id)!, porId);
      const v = p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos;
      const c = porCat.get(raiz.id) ?? { atual: 0, anterior: 0, tres: 0 };
      if (mes === mesAtual) c.atual += v;
      if (mes === mesAnterior) c.anterior += v;
      if (tres.includes(mes)) c.tres += v;
      porCat.set(raiz.id, c);
    }
    if (g > 0 && l.data > inicio90) {
      const dia = new Date(`${l.data}T12:00:00Z`).getUTCDay();
      semana[dia].total += g;
      semana[dia].vezes += 1;
      const m = marcaDaDescricao(l.descricao);
      if (m) {
        const x = marcas.get(m) ?? { descricao: l.descricao, vezes: 0, total: 0 };
        x.vezes += 1;
        x.total += g;
        marcas.set(m, x);
      }
    }
  }

  const liquidas = contas.filter((c) => c.ativa && c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA" && c.subtipo !== "INVESTIMENTO" && c.id !== "ativo-a-receber");
  const saldoLiquido = liquidas.reduce((s, c) => s + c.saldo_atual_centavos, 0);
  const investido = contas.filter((c) => c.tipo === "ATIVO" && c.subtipo === "INVESTIMENTO").reduce((s, c) => s + c.saldo_atual_centavos, 0);
  const passivos = contas.filter((c) => c.ativa && c.tipo === "PASSIVO" && c.subtipo !== "CATEGORIA");
  const dividaCartoes = passivos.filter((c) => c.subtipo === "CARTAO_CREDITO").reduce((s, c) => s + Math.max(0, c.saldo_atual_centavos), 0);
  const outrasDividas = passivos.filter((c) => c.subtipo !== "CARTAO_CREDITO").reduce((s, c) => s + Math.max(0, c.saldo_atual_centavos), 0);
  const gastoMedioMensal = Math.round(gasto3 / 3);
  const limites = new Map((d.orcamentos ?? []).map((o) => [o.categoria_id, o.limite_centavos]));
  const assinaturasMarcadas = new Map<string, { descricao: string; valor: number; meses: Set<string> }>();
  for (const l of validos.filter((x) => x.etiqueta === "ASSINATURA" && x.data > somarDias(hoje, -100))) {
    const m = marcaDaDescricao(l.descricao) || l.descricao;
    const x = assinaturasMarcadas.get(m) ?? { descricao: l.descricao, valor: gastoDe(l), meses: new Set<string>() };
    x.meses.add(l.data.slice(0, 7));
    assinaturasMarcadas.set(m, x);
  }

  return {
    hoje, mesAtual, mesAnterior, diaDoMes, diasNoMes, saldoLiquido, investido, dividaCartoes, outrasDividas, gastoMedioMensal,
    rendaMediaMensal: Math.round(renda3 / 3),
    mesesDeReserva: gastoMedioMensal > 0 ? Math.round((saldoLiquido / gastoMedioMensal) * 10) / 10 : null,
    receitasMes, despesasMes, despesasMesAnterior, despesasMesAnteriorAteHoje,
    categorias: [...porCat.entries()]
      .map(([id, c]) => ({ nome: porId.get(id)?.nome ?? id, atual: c.atual, anterior: c.anterior, media3: Math.round(c.tres / 3), limite: limites.get(id) ?? null }))
      .filter((c) => c.atual || c.anterior || c.media3)
      .sort((a, b) => b.atual - a.atual || b.media3 - a.media3),
    diasDaSemana: semana,
    marcas: [...marcas.entries()].map(([marca, x]) => ({ marca, ...x })).sort((a, b) => b.total - a.total).slice(0, 15),
    assinaturas: [
      ...[...assinaturasMarcadas.values()].map((x) => ({ descricao: x.descricao, valor: x.valor, meses: x.meses.size, marcada: true })),
      ...detectarAssinaturas(lancamentos, contas, hoje).map((a) => ({ descricao: a.descricao, valor: a.valorMedio, meses: a.meses, marcada: false })),
    ],
    contasFixas: agendamentos.filter((a) => a.recorrencia && a.tipo !== "RECEBER" && !a.pago_em).map((a) => ({ descricao: a.descricao, valor: a.valor_centavos, recorrencia: a.recorrencia! })),
    proximasContas: agendamentos.filter((a) => !a.pago_em && a.tipo !== "RECEBER" && a.vencimento <= somarDias(hoje, 30)).map((a) => ({ descricao: a.descricao, valor: a.valor_centavos, vencimento: a.vencimento })).sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
    metas: (d.metas ?? []).map((m) => ({ nome: m.nome, guardado: m.guardado_centavos, alvo: m.valor_alvo_centavos, prazo: m.prazo })),
    bens: (d.bens ?? []).map((b) => ({ nome: b.nome, tipo: b.tipo, valor: b.valor_centavos })),
  };
}

const r = (c: number) => `R$ ${(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Texto compacto com os fatos, para a IA. `privado` esconde descrições e nomes. */
export function fatosEmTexto(f: Fatos, privado = false): string {
  const nome = (s: string) => (privado ? "(item)" : s);
  const l: string[] = [];
  l.push(`Hoje: ${f.hoje} (dia ${f.diaDoMes} de ${f.diasNoMes}). Mês atual: ${f.mesAtual}.`);
  l.push(`Saldo em contas (sem investimentos): ${r(f.saldoLiquido)}. Investido: ${r(f.investido)}. Fatura(s) de cartão em aberto: ${r(f.dividaCartoes)}. Outras dívidas: ${r(f.outrasDividas)}.`);
  l.push(`Média mensal (últimos 3 meses fechados): renda ${r(f.rendaMediaMensal)}, gastos ${r(f.gastoMedioMensal)}. Reserva atual cobre ${f.mesesDeReserva ?? "?"} mês(es) de gastos.`);
  l.push(`Mês atual até hoje: receitas ${r(f.receitasMes)}, despesas ${r(f.despesasMes)}. Mês anterior até o mesmo dia: ${r(f.despesasMesAnteriorAteHoje)}; mês anterior inteiro: ${r(f.despesasMesAnterior)}.`);
  if (f.categorias.length) l.push(`Por categoria (atual | mês anterior | média 3 meses | limite): ${f.categorias.map((c) => `${c.nome} ${r(c.atual)} | ${r(c.anterior)} | ${r(c.media3)} | ${c.limite ? r(c.limite) : "sem limite"}`).join("; ")}.`);
  l.push(`Gastos por dia da semana (90 dias): ${f.diasDaSemana.map((d) => `${d.dia} ${r(d.total)} em ${d.vezes} compras`).join("; ")}.`);
  if (f.marcas.length) l.push(`Onde mais gasta (90 dias): ${f.marcas.map((m) => `${nome(m.descricao)} ${m.vezes}x total ${r(m.total)}`).join("; ")}.`);
  if (f.assinaturas.length) l.push(`Assinaturas/recorrentes: ${f.assinaturas.map((a) => `${nome(a.descricao)} ~${r(a.valor)}/mês há ${a.meses} meses${a.marcada ? "" : " (detectada, não marcada)"}`).join("; ")}.`);
  if (f.contasFixas.length) l.push(`Contas fixas agendadas: ${f.contasFixas.map((c) => `${nome(c.descricao)} ${r(c.valor)} (${c.recorrencia.toLowerCase()})`).join("; ")}.`);
  if (f.proximasContas.length) l.push(`Contas dos próximos 30 dias: ${f.proximasContas.map((c) => `${nome(c.descricao)} ${r(c.valor)} em ${c.vencimento}`).join("; ")}.`);
  if (f.metas.length) l.push(`Metas: ${f.metas.map((m) => `${nome(m.nome)} ${r(m.guardado)} de ${r(m.alvo)}${m.prazo ? ` até ${m.prazo}` : ""}`).join("; ")}.`);
  if (f.bens.length) l.push(`Bens e dívidas cadastrados: ${f.bens.map((b) => `${nome(b.nome)} (${b.tipo === "BEM" ? "bem" : "dívida"}) ${r(b.valor)}`).join("; ")}.`);
  return l.join("\n");
}

export async function carregarFatos(hoje: string): Promise<Fatos> {
  const { contabilidade } = await import("./contabilidade");
  const { extras } = await import("./extras");
  const [contas, lancamentos, agendamentos, orcamentos, metas, bens] = await Promise.all([
    contabilidade.listarContas(),
    contabilidade.listarLancamentos(5000),
    contabilidade.listarAgendamentos(),
    extras.listarOrcamentos(),
    extras.listarMetas(),
    extras.listarBens(),
  ]);
  return calcularFatos({ hoje, contas, lancamentos, agendamentos, orcamentos, metas, bens });
}
