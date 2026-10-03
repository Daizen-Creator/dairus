// Cálculos da aba de Investimentos. Tudo aqui é função pura (testável) e o que
// é estimativa está marcado: renda fixa calculada pelo indexador, projeções e
// simulações não são garantia de resultado.

import type { AtivoInvest, ClasseAtivo, OperacaoInvest } from "../../types/investimentos";
import { CLASSES_RENDA_FIXA } from "../../types/investimentos";

/** Taxas anuais em fração (0,1065 = 10,65% a.a.). */
export interface Indices {
  cdiAnual: number;
  selicAnual: number;
  ipca12m: number;
}

export const INDICES_PADRAO: Indices = { cdiAnual: 0.1065, selicAnual: 0.1075, ipca12m: 0.045 };

const DIA_MS = 86_400_000;

export function diasEntre(de: string, ate: string): number {
  const ms = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return Math.round((ms(ate) - ms(de)) / DIA_MS);
}

export const anualParaMensal = (anual: number) => Math.pow(1 + anual, 1 / 12) - 1;
export const mensalParaAnual = (mensal: number) => Math.pow(1 + mensal, 12) - 1;

/** Alíquota de IR da renda fixa (tabela regressiva) pelo prazo em dias. */
export function aliquotaRegressiva(dias: number): number {
  if (dias <= 180) return 0.225;
  if (dias <= 360) return 0.2;
  if (dias <= 720) return 0.175;
  return 0.15;
}

const ISENTOS_IR: ClasseAtivo[] = ["LCI", "LCA", "POUPANCA"];

/** Taxa anual efetiva de um título de renda fixa, a partir do indexador. */
export function taxaAnualRendaFixa(a: Pick<AtivoInvest, "classe" | "indexador" | "taxa">, ind: Indices): number {
  if (a.classe === "POUPANCA") {
    // Regra da poupança: 0,5% ao mês (+TR) com Selic acima de 8,5%; senão 70% da Selic.
    return ind.selicAnual > 0.085 ? mensalParaAnual(0.005) : ind.selicAnual * 0.7;
  }
  const taxa = a.taxa ?? 0;
  switch (a.indexador) {
    case "CDI":
      return ind.cdiAnual * (taxa / 100);
    case "SELIC":
      return ind.selicAnual * (taxa / 100 || 1);
    case "IPCA":
      return (1 + ind.ipca12m) * (1 + taxa / 100) - 1;
    case "PRE":
      return taxa / 100;
    default:
      return 0;
  }
}

/** Fator de crescimento em `dias` corridos (≈ dias úteis/252, que dá o mesmo que dias/365). */
export function fatorNoPeriodo(taxaAnual: number, dias: number): number {
  if (dias <= 0) return 1;
  return Math.pow(1 + taxaAnual, dias / 365);
}

export interface ValorRendaFixa {
  bruto: number;
  principal: number;
  rendimento: number;
  ir: number;
  liquido: number;
  aliquota: number;
}

/**
 * Valor estimado de um título de renda fixa hoje: cada aplicação cresce pela
 * taxa desde a sua data; resgates e amortizações entram como saídas.
 * É uma estimativa (o extrato da corretora é o valor oficial).
 */
export function valorRendaFixa(ativo: AtivoInvest, ops: OperacaoInvest[], ind: Indices, hoje: string): ValorRendaFixa {
  const taxa = taxaAnualRendaFixa(ativo, ind);
  let bruto = 0;
  for (const op of ops) {
    const fator = fatorNoPeriodo(taxa, diasEntre(op.data, hoje));
    if (op.tipo === "COMPRA") bruto += op.valor_centavos * fator;
    else if (op.tipo === "VENDA" || op.tipo === "AMORTIZACAO") bruto -= op.valor_centavos * fator;
  }
  bruto = Math.max(0, Math.round(bruto));
  const principal = ativo.custo_centavos;
  const rendimento = Math.max(0, bruto - principal);
  const isento = ISENTOS_IR.includes(ativo.classe) || ativo.classe === "PREVIDENCIA";
  const aliquota = isento || !ativo.primeira_compra ? 0 : aliquotaRegressiva(diasEntre(ativo.primeira_compra, hoje));
  const ir = Math.round(rendimento * aliquota);
  return { bruto, principal, rendimento, ir, liquido: bruto - ir, aliquota };
}

export function ehRendaFixa(a: Pick<AtivoInvest, "classe" | "indexador">): boolean {
  return CLASSES_RENDA_FIXA.includes(a.classe) && (a.classe === "POUPANCA" || !!a.indexador);
}

/** Valor atual do ativo em centavos: cotação, estimativa da renda fixa ou, sem dados, o custo. */
export function valorAtual(a: AtivoInvest, ops: OperacaoInvest[], ind: Indices, hoje: string): { valor: number; fonte: "COTACAO" | "ESTIMATIVA" | "CUSTO" } {
  if (a.quantidade <= 0) return { valor: 0, fonte: "CUSTO" };
  if (ehRendaFixa(a)) return { valor: valorRendaFixa(a, ops, ind, hoje).bruto, fonte: "ESTIMATIVA" };
  if (a.cotacao !== null && a.cotacao !== undefined) return { valor: Math.round(a.quantidade * a.cotacao * 100), fonte: "COTACAO" };
  return { valor: a.custo_centavos, fonte: "CUSTO" };
}

export interface Rentabilidade {
  valor: number;
  ganhoCapital: number;
  /** Ganho de capital + proventos + lucro já realizado em vendas. */
  resultadoTotal: number;
  percentual: number | null;
}

export function rentabilidade(a: AtivoInvest, valor: number): Rentabilidade {
  const ganhoCapital = valor - a.custo_centavos;
  const resultadoTotal = ganhoCapital + a.proventos_centavos + a.lucro_realizado_centavos;
  const base = a.custo_centavos + Math.max(0, -a.lucro_realizado_centavos);
  return { valor, ganhoCapital, resultadoTotal, percentual: base > 0 ? resultadoTotal / base : null };
}

/** Rentabilidade no período a partir do preço no início e do preço atual. */
export const retornoPeriodo = (precoInicio: number | null, precoAtual: number | null) =>
  precoInicio && precoAtual ? precoAtual / precoInicio - 1 : null;

/** Rentabilidade acumulada de uma série de taxas diárias em % (ex.: CDI diário do BCB). */
export function acumularDiario(pontos: Array<{ data: string; valor: number }>, de: string, ate: string): number {
  return pontos.filter((p) => p.data >= de && p.data <= ate).reduce((f, p) => f * (1 + p.valor / 100), 1) - 1;
}

/** Acumula taxas mensais em % (ex.: IPCA mensal). */
export function acumularMensal(pontos: Array<{ data: string; valor: number }>, de: string, ate: string): number {
  return pontos.filter((p) => p.data >= de.slice(0, 7) + "-01" && p.data <= ate).reduce((f, p) => f * (1 + p.valor / 100), 1) - 1;
}

// ---------------------------------------------------------------------------
// Divisão da carteira

export interface Fatia {
  chave: string;
  valor: number;
  percentual: number;
}

export function dividirPor<T>(itens: T[], chave: (x: T) => string, valor: (x: T) => number): Fatia[] {
  const mapa = new Map<string, number>();
  for (const x of itens) mapa.set(chave(x), (mapa.get(chave(x)) ?? 0) + valor(x));
  const total = [...mapa.values()].reduce((s, v) => s + v, 0);
  return [...mapa.entries()]
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ chave: k, valor: v, percentual: total > 0 ? v / total : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

/** Aviso de concentração: alguma fatia acima do limite (padrão 40%). */
export function concentracoes(fatias: Fatia[], limite = 0.4): Fatia[] {
  return fatias.filter((f) => f.percentual > limite);
}

/**
 * Rebalanceamento: com um aporte, quanto colocar em cada classe para chegar o
 * mais perto da divisão desejada (sem vender nada).
 */
export function rebalancear(atual: Record<string, number>, alvo: Record<string, number>, aporte: number): Record<string, number> {
  const chaves = [...new Set([...Object.keys(atual), ...Object.keys(alvo)])];
  const somaAlvo = chaves.reduce((s, k) => s + (alvo[k] ?? 0), 0) || 1;
  const totalFinal = chaves.reduce((s, k) => s + (atual[k] ?? 0), 0) + aporte;
  const falta = Object.fromEntries(chaves.map((k) => [k, Math.max(0, ((alvo[k] ?? 0) / somaAlvo) * totalFinal - (atual[k] ?? 0))]));
  const somaFalta = Object.values(falta).reduce((s, v) => s + v, 0);
  const saida: Record<string, number> = {};
  let distribuido = 0;
  const ordenadas = chaves.filter((k) => falta[k] > 0).sort((a, b) => falta[b] - falta[a]);
  ordenadas.forEach((k, i) => {
    const parte = i === ordenadas.length - 1 ? aporte - distribuido : Math.round(somaFalta > 0 ? (falta[k] / somaFalta) * aporte : 0);
    saida[k] = parte;
    distribuido += parte;
  });
  return saida;
}

// ---------------------------------------------------------------------------
// Proventos

export function proventosPorMes(ops: OperacaoInvest[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const o of ops) {
    if (o.tipo === "DIVIDENDO" || o.tipo === "JCP" || o.tipo === "RENDIMENTO") {
      const mes = o.data.slice(0, 7);
      mapa.set(mes, (mapa.get(mes) ?? 0) + o.valor_centavos - o.ir_retido_centavos);
    }
  }
  return mapa;
}

/** Média mensal de proventos líquidos nos últimos 12 meses (estimativa de renda passiva). */
export function rendaPassivaMensal(ops: OperacaoInvest[], hoje: string): number {
  const inicio = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 13, 1)).toISOString().slice(0, 7);
  const fim = hoje.slice(0, 7);
  let total = 0;
  for (const [mes, v] of proventosPorMes(ops)) if (mes >= inicio && mes < fim) total += v;
  return Math.round(total / 12);
}

// ---------------------------------------------------------------------------
// Simuladores (estimativas)

export interface PontoSimulacao {
  mes: number;
  investido: number;
  total: number;
}

/** Juros compostos com aporte mensal (aporte no fim de cada mês). */
export function jurosCompostos(inicial: number, aporteMensal: number, taxaAnual: number, meses: number): PontoSimulacao[] {
  const i = anualParaMensal(taxaAnual);
  const serie: PontoSimulacao[] = [{ mes: 0, investido: inicial, total: inicial }];
  let total = inicial;
  for (let m = 1; m <= meses; m++) {
    total = total * (1 + i) + aporteMensal;
    serie.push({ mes: m, investido: inicial + aporteMensal * m, total });
  }
  return serie;
}

/** Aporte mensal necessário para chegar a `alvo` em `meses` (PMT). */
export function aporteNecessario(alvo: number, atual: number, taxaAnual: number, meses: number): number {
  if (meses <= 0) return Math.max(0, alvo - atual);
  const i = anualParaMensal(taxaAnual);
  const futuroAtual = atual * Math.pow(1 + i, meses);
  if (futuroAtual >= alvo) return 0;
  if (i === 0) return (alvo - atual) / meses;
  return ((alvo - futuroAtual) * i) / (Math.pow(1 + i, meses) - 1);
}

export interface OpcaoRendaFixa {
  nome: string;
  indexador: "CDI" | "SELIC" | "IPCA" | "PRE" | "POUPANCA";
  taxa: number;
  isento: boolean;
}

/** Comparador de renda fixa: valor líquido ao fim do prazo, já descontado o IR. */
export function compararRendaFixa(valor: number, dias: number, opcoes: OpcaoRendaFixa[], ind: Indices) {
  return opcoes
    .map((o) => {
      const taxa = taxaAnualRendaFixa(
        { classe: o.indexador === "POUPANCA" ? "POUPANCA" : "CDB", indexador: o.indexador === "POUPANCA" ? null : o.indexador, taxa: o.taxa },
        ind,
      );
      const bruto = valor * fatorNoPeriodo(taxa, dias);
      const rendimento = bruto - valor;
      const ir = o.isento || o.indexador === "POUPANCA" ? 0 : rendimento * aliquotaRegressiva(dias);
      const liquido = bruto - ir;
      return { ...o, taxaAnual: taxa, bruto, ir, liquido, rendimentoLiquido: liquido - valor };
    })
    .sort((a, b) => b.liquido - a.liquido);
}

/** Quanto o dinheiro parado perde de poder de compra com a inflação. */
export function perdaInflacao(valor: number, ipcaAnual: number, anos: number) {
  const poder = valor / Math.pow(1 + ipcaAnual, anos);
  return { poderDeCompra: poder, perda: valor - poder };
}

/** Capital necessário para receber uma renda mensal com um rendimento mensal (ex.: 0,8% de FIIs). */
export const capitalParaRenda = (rendaMensal: number, rendimentoMensal: number) =>
  rendimentoMensal > 0 ? rendaMensal / rendimentoMensal : Infinity;

/**
 * Liberdade financeira: meses até o patrimônio render o gasto mensal, usando
 * uma taxa de retirada segura (padrão 4% ao ano) e taxa real de crescimento.
 */
export function liberdadeFinanceira(gastoMensal: number, patrimonio: number, aporteMensal: number, taxaRealAnual: number, retirada = 0.04) {
  const alvo = (gastoMensal * 12) / retirada;
  const i = anualParaMensal(taxaRealAnual);
  let total = patrimonio;
  let meses = 0;
  while (total < alvo && meses < 1200) {
    total = total * (1 + i) + aporteMensal;
    meses++;
  }
  return { alvo, meses: total >= alvo ? meses : null };
}

/** Carteira reinvestindo proventos: valor ao fim, com e sem reinvestir. */
export function reinvestimento(valor: number, dyAnual: number, valorizacaoAnual: number, anos: number) {
  const com = valor * Math.pow((1 + dyAnual) * (1 + valorizacaoAnual), anos);
  const sem = valor * Math.pow(1 + valorizacaoAnual, anos);
  const proventosSem = Array.from({ length: anos }, (_, k) => valor * Math.pow(1 + valorizacaoAnual, k) * dyAnual).reduce((s, v) => s + v, 0);
  return { comReinvestir: com, semReinvestir: sem + proventosSem, diferenca: com - sem - proventosSem };
}

// ---------------------------------------------------------------------------
// Imposto de renda em bolsa

export type CategoriaIR = "ACOES" | "OUTROS_SWING" | "FII" | "DAY_TRADE" | "CRIPTO";

const ALIQUOTA: Record<CategoriaIR, number> = { ACOES: 0.15, OUTROS_SWING: 0.15, FII: 0.2, DAY_TRADE: 0.2, CRIPTO: 0.15 };
const ISENCAO_VENDAS: Partial<Record<CategoriaIR, number>> = { ACOES: 2_000_000, CRIPTO: 3_500_000 };

export function categoriaIR(classe: ClasseAtivo, dayTrade: boolean): CategoriaIR | null {
  if (dayTrade && classe !== "CRIPTO") return "DAY_TRADE";
  if (classe === "ACAO") return "ACOES";
  if (classe === "FII") return "FII";
  if (classe === "ETF" || classe === "BDR") return "OUTROS_SWING";
  if (classe === "CRIPTO") return "CRIPTO";
  return null;
}

export interface ApuracaoMes {
  mes: string;
  vendas: Record<CategoriaIR, number>;
  resultado: Record<CategoriaIR, number>;
  isento: Partial<Record<CategoriaIR, boolean>>;
  baseTributavel: Record<CategoriaIR, number>;
  prejuizoAcumulado: Record<CategoriaIR, number>;
  imposto: number;
  irRetido: number;
  /** Valor do DARF (código 6015; cripto: 4600). Abaixo de R$ 10 acumula para o mês seguinte. */
  darf: number;
  acumuladoParaProximo: number;
  vencimento: string;
}

const zerado = (): Record<CategoriaIR, number> => ({ ACOES: 0, OUTROS_SWING: 0, FII: 0, DAY_TRADE: 0, CRIPTO: 0 });

/** Último dia útil (seg–sex) do mês seguinte ao `mes` (AAAA-MM). */
export function vencimentoDarf(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m + 1, 0));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Apuração mensal do IR sobre vendas: isenção de R$ 20 mil/mês em vendas de
 * ações (swing trade) e R$ 35 mil em cripto, compensação de prejuízo dentro
 * de cada categoria, IR retido na fonte descontado e DARF mínimo de R$ 10.
 * Estimativa para conferência: confira com o informe da corretora.
 */
export function apurarIR(ops: OperacaoInvest[], classePorAtivo: Map<string, ClasseAtivo>): ApuracaoMes[] {
  const vendas = ops.filter((o) => o.tipo === "VENDA").sort((a, b) => a.data.localeCompare(b.data));
  const meses = [...new Set(vendas.map((v) => v.data.slice(0, 7)))].sort();
  const prejuizo = zerado();
  let acumulado = 0;
  const saida: ApuracaoMes[] = [];
  for (const mes of meses) {
    const doMes = vendas.filter((v) => v.data.startsWith(mes));
    const totalVendas = zerado();
    const resultado = zerado();
    let irRetido = 0;
    for (const v of doMes) {
      const cat = categoriaIR(classePorAtivo.get(v.ativo_id) ?? "OUTRO", v.day_trade);
      if (!cat) continue;
      totalVendas[cat] += v.valor_centavos;
      resultado[cat] += v.valor_centavos - v.taxas_centavos - (v.custo_centavos ?? 0);
      irRetido += v.ir_retido_centavos;
    }
    const isento: Partial<Record<CategoriaIR, boolean>> = {};
    const base = zerado();
    let imposto = 0;
    for (const cat of Object.keys(resultado) as CategoriaIR[]) {
      const limite = ISENCAO_VENDAS[cat];
      if (limite !== undefined && totalVendas[cat] > 0 && totalVendas[cat] <= limite) {
        // Isento: o lucro não paga; prejuízo do mês isento não é compensável (regra da Receita para ações).
        isento[cat] = true;
        continue;
      }
      let r = resultado[cat];
      if (r < 0) {
        prejuizo[cat] += -r;
        continue;
      }
      const compensa = Math.min(r, prejuizo[cat]);
      prejuizo[cat] -= compensa;
      r -= compensa;
      base[cat] = r;
      imposto += Math.round(r * ALIQUOTA[cat]);
    }
    const devido = Math.max(0, imposto - irRetido) + acumulado;
    const darf = devido >= 1000 ? devido : 0;
    acumulado = devido >= 1000 ? 0 : devido;
    saida.push({ mes, vendas: totalVendas, resultado, isento, baseTributavel: base, prejuizoAcumulado: { ...prejuizo }, imposto, irRetido, darf, acumuladoParaProximo: acumulado, vencimento: vencimentoDarf(mes) });
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Declaração anual: bens e direitos e rendimentos

/** Posição (quantidade e custo) de um ativo até uma data — o mesmo cálculo do motor. */
export function posicaoAte(ops: OperacaoInvest[], data: string): { quantidade: number; custo: number } {
  let quantidade = 0;
  let custo = 0;
  for (const op of ops.filter((o) => o.data <= data)) {
    if (op.tipo === "COMPRA") {
      quantidade += op.quantidade;
      custo += op.valor_centavos + op.taxas_centavos;
    } else if (op.tipo === "VENDA") {
      const c = op.custo_centavos ?? (quantidade > 0 ? Math.round((custo * op.quantidade) / quantidade) : 0);
      quantidade -= op.quantidade;
      custo -= c;
      if (Math.abs(quantidade) < 1e-9) {
        quantidade = 0;
        custo = 0;
      }
    } else if (op.tipo === "AMORTIZACAO") {
      custo = Math.max(0, custo - op.valor_centavos);
    }
  }
  return { quantidade, custo };
}

/** Grupo e código de "Bens e Direitos" da declaração (referência; confira no programa da Receita). */
export function codigoBensDireitos(classe: ClasseAtivo): { grupo: string; codigo: string; descricao: string } {
  switch (classe) {
    case "ACAO":
      return { grupo: "03", codigo: "01", descricao: "Ações (inclusive as listadas em bolsa)" };
    case "FII":
      return { grupo: "07", codigo: "03", descricao: "Fundos de Investimento Imobiliário (FII)" };
    case "ETF":
      return { grupo: "07", codigo: "09", descricao: "Fundos de índice (ETF)" };
    case "BDR":
      return { grupo: "04", codigo: "04", descricao: "BDR - Brazilian Depositary Receipts" };
    case "CDB":
    case "LCI":
    case "LCA":
      return { grupo: "04", codigo: "02", descricao: "Títulos de crédito: CDB, LCI, LCA, RDB e outros" };
    case "TESOURO":
      return { grupo: "04", codigo: "02", descricao: "Títulos públicos (Tesouro Direto)" };
    case "POUPANCA":
      return { grupo: "04", codigo: "01", descricao: "Depósito em caderneta de poupança" };
    case "CRIPTO":
      return { grupo: "08", codigo: "01", descricao: "Criptoativo Bitcoin (BTC); outras moedas: 08-02/08-03" };
    case "PREVIDENCIA":
      return { grupo: "97", codigo: "01", descricao: "VGBL; PGBL não é declarado em Bens e Direitos" };
    default:
      return { grupo: "99", codigo: "99", descricao: "Outros bens e direitos" };
  }
}

export interface LinhaBensDireitos {
  ativo: AtivoInvest;
  grupo: string;
  codigo: string;
  discriminacao: string;
  situacaoAnterior: number;
  situacaoAtual: number;
}

export function bensEDireitos(ativos: AtivoInvest[], ops: OperacaoInvest[], ano: number): LinhaBensDireitos[] {
  return ativos
    .map((a) => {
      const doAtivo = ops.filter((o) => o.ativo_id === a.id);
      const ant = posicaoAte(doAtivo, `${ano - 1}-12-31`);
      const atu = posicaoAte(doAtivo, `${ano}-12-31`);
      const cod = codigoBensDireitos(a.classe);
      const qtd = atu.quantidade || ant.quantidade;
      const discriminacao = `${qtd.toLocaleString("pt-BR", { maximumFractionDigits: 8 })} ${a.classe === "CRIPTO" ? "unidade(s) de" : "cota(s)/ação(ões) de"} ${a.codigo}${a.nome ? ` (${a.nome})` : ""}. Custo médio de aquisição.`;
      return { ativo: a, grupo: cod.grupo, codigo: cod.codigo, discriminacao, situacaoAnterior: ant.custo, situacaoAtual: atu.custo };
    })
    .filter((l) => l.situacaoAnterior > 0 || l.situacaoAtual > 0);
}

export interface RendimentosAno {
  isentos: number;
  exclusivos: number;
  porTipo: Record<"DIVIDENDO" | "JCP" | "RENDIMENTO", number>;
}

/** Dividendos e rendimentos de FII são isentos; JCP é tributação exclusiva (valor líquido). */
export function rendimentosDoAno(ops: OperacaoInvest[], ano: number): RendimentosAno {
  const r: RendimentosAno = { isentos: 0, exclusivos: 0, porTipo: { DIVIDENDO: 0, JCP: 0, RENDIMENTO: 0 } };
  for (const o of ops.filter((x) => x.data.startsWith(String(ano)))) {
    if (o.tipo === "DIVIDENDO" || o.tipo === "RENDIMENTO") {
      r.isentos += o.valor_centavos;
      r.porTipo[o.tipo] += o.valor_centavos;
    } else if (o.tipo === "JCP") {
      r.exclusivos += o.valor_centavos - o.ir_retido_centavos;
      r.porTipo.JCP += o.valor_centavos;
    }
  }
  return r;
}

// ---------------------------------------------------------------------------
// Alertas da carteira

export interface AlertaInvest {
  id: string;
  titulo: string;
  corpo: string;
}

export function alertasCarteira(ativos: AtivoInvest[], hoje: string): AlertaInvest[] {
  const saida: AlertaInvest[] = [];
  for (const a of ativos.filter((x) => x.ativo)) {
    if (a.cotacao !== null && a.alerta_acima !== null && a.cotacao >= a.alerta_acima) {
      saida.push({ id: `inv-acima-${a.id}-${a.alerta_acima}`, titulo: `${a.codigo} chegou a R$ ${a.cotacao.toFixed(2)}`, corpo: `Acima do alerta de R$ ${a.alerta_acima.toFixed(2)}.` });
    }
    if (a.cotacao !== null && a.alerta_abaixo !== null && a.cotacao <= a.alerta_abaixo) {
      saida.push({ id: `inv-abaixo-${a.id}-${a.alerta_abaixo}`, titulo: `${a.codigo} caiu para R$ ${a.cotacao.toFixed(2)}`, corpo: `Abaixo do alerta de R$ ${a.alerta_abaixo.toFixed(2)}.` });
    }
    if (a.vencimento && a.quantidade > 0) {
      const d = diasEntre(hoje, a.vencimento);
      if (d === 30 || d === 7 || d === 1 || d === 0) {
        saida.push({ id: `inv-venc-${a.id}-${d}`, titulo: `${a.codigo} vence ${d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} dias`}`, corpo: "Decida o que fazer com o dinheiro do resgate." });
      }
    }
  }
  return saida;
}
