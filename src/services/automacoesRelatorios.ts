// Rotinas de relatórios: PDF do mês anterior todo dia 1º (pasta e nuvem),
// resumo semanal no domingo, alerta de risco de saldo negativo e lembrete do IR.

import { lerPreferencia, salvarPreferencia } from "./armazenamento";
import { contabilidade } from "./contabilidade";
import { extras } from "./extras";
import { formatarCentavos } from "./formato";
import type { AvisoSistema } from "./avisos";
import type { Agendamento, Conta, Lancamento } from "../types/accounting";

const somarDias = (iso: string, d: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + d)).toISOString().slice(0, 10);

export interface ResumoSemanal {
  semana: string;
  gerado_em: string;
  gastos: number;
  gastosSemanaAnterior: number;
  maiores: Array<{ descricao: string; valor: number }>;
  proximasContas: Array<{ descricao: string; vencimento: string; valor: number }>;
  dica: string;
  textoIA: string | null;
}

/** Resumo da semana que terminou (segunda a domingo de `domingo`). */
export function montarResumoSemanal(domingo: string, contas: Conta[], lancamentos: Lancamento[], agendamentos: Agendamento[]): ResumoSemanal {
  const inicio = somarDias(domingo, -6);
  const desp = new Set(contas.filter((c) => c.tipo === "DESPESA").map((c) => c.id));
  const estornados = new Set(lancamentos.map((l) => l.estornado_de).filter(Boolean));
  const valor = (l: Lancamento) => l.partidas.filter((p) => desp.has(p.conta_id) && p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0);
  const validos = lancamentos.filter((l) => l.origem !== "ESTORNO" && !estornados.has(l.id) && valor(l) > 0);
  const daSemana = validos.filter((l) => l.data >= inicio && l.data <= domingo);
  const anterior = validos.filter((l) => l.data >= somarDias(inicio, -7) && l.data < inicio);
  const gastos = daSemana.reduce((s, l) => s + valor(l), 0);
  const gastosSemanaAnterior = anterior.reduce((s, l) => s + valor(l), 0);
  const fimProxima = somarDias(domingo, 7);
  const proximasContas = agendamentos
    .filter((a) => !a.pago_em && a.tipo !== "RECEBER" && a.vencimento > domingo && a.vencimento <= fimProxima)
    .map((a) => ({ descricao: a.descricao, vencimento: a.vencimento, valor: a.valor_centavos }));
  const maiores = [...daSemana].sort((a, b) => valor(b) - valor(a)).slice(0, 3).map((l) => ({ descricao: l.descricao, valor: valor(l) }));
  let dica = "Semana tranquila: siga registrando seus gastos para o Dairus acompanhar.";
  if (gastosSemanaAnterior > 0 && gastos > gastosSemanaAnterior * 1.3) dica = `Você gastou ${Math.round((gastos / gastosSemanaAnterior - 1) * 100)}% a mais que na semana anterior. Vale olhar os maiores gastos.`;
  else if (gastosSemanaAnterior > 0 && gastos < gastosSemanaAnterior * 0.8) dica = `Ótimo: ${Math.round((1 - gastos / gastosSemanaAnterior) * 100)}% a menos que na semana anterior.`;
  if (proximasContas.length) dica += ` Separe ${formatarCentavos(proximasContas.reduce((s, c) => s + c.valor, 0))} para as contas da próxima semana.`;
  return { semana: `${inicio}|${domingo}`, gerado_em: new Date().toISOString(), gastos, gastosSemanaAnterior, maiores, proximasContas, dica, textoIA: null };
}

/** Domingo (ou depois, se o app não abriu no domingo): gera o resumo da semana uma vez. */
export async function resumoSemanalAutomatico(hoje: string): Promise<string | null> {
  if ((await lerPreferencia<boolean>("resumo_semanal")) === false) return null;
  const diaSemana = new Date(`${hoje}T12:00:00Z`).getUTCDay();
  const domingo = somarDias(hoje, -diaSemana);
  const atual = await lerPreferencia<ResumoSemanal>("resumo_semanal_ultimo");
  if (atual?.semana.endsWith(domingo)) return null;
  const [contas, lancamentos, agendamentos] = await Promise.all([contabilidade.listarContas(), contabilidade.listarLancamentos(3000), contabilidade.listarAgendamentos()]);
  const resumo = montarResumoSemanal(domingo, contas, lancamentos, agendamentos);
  if (await lerPreferencia<boolean>("resumo_semanal_ia")) {
    try {
      const { perguntarIA } = await import("./gemini");
      resumo.textoIA = await perguntarIA({
        contexto: `Semana de ${resumo.semana.replace("|", " a ")}. Gastos: ${formatarCentavos(resumo.gastos)} (semana anterior: ${formatarCentavos(resumo.gastosSemanaAnterior)}). Maiores: ${resumo.maiores.map((m) => `${m.descricao} ${formatarCentavos(m.valor)}`).join("; ") || "nenhum"}. Contas da próxima semana: ${resumo.proximasContas.map((c) => `${c.descricao} ${formatarCentavos(c.valor)} em ${c.vencimento}`).join("; ") || "nenhuma"}.`,
        pergunta: "Escreva o resumo da semana em até 6 linhas com exatamente 3 pontos de atenção práticos. Use só os números fornecidos.",
      });
    } catch {
      // sem chave ou sem internet: fica o resumo sem IA
    }
  }
  await salvarPreferencia("resumo_semanal_ultimo", resumo);
  return `Resumo da semana: ${formatarCentavos(resumo.gastos)} em gastos. ${resumo.dica}`;
}

/** Dia 1º (ou o primeiro dia em que o app abrir no mês): PDF do mês anterior. */
export async function pdfMensalAutomatico(hoje: string, titular: { nome: string; email: string }): Promise<string | null> {
  if (!(await lerPreferencia<boolean>("pdf_mensal_auto"))) return null;
  const [a, m] = hoje.split("-").map(Number);
  const anterior = new Date(Date.UTC(a, m - 2, 1));
  const mes = anterior.toISOString().slice(0, 7);
  if ((await lerPreferencia<string>("pdf_mensal_ultimo")) === mes) return null;
  const inicio = `${mes}-01`;
  const fim = new Date(Date.UTC(anterior.getUTCFullYear(), anterior.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const [contas, lancamentos, agendamentos, orcamentos, metas, bens] = await Promise.all([contabilidade.listarContas(), contabilidade.listarLancamentos(20000), contabilidade.listarAgendamentos(), extras.listarOrcamentos(), extras.listarMetas(), extras.listarBens()]);
  const { gerarRelatorioPdf } = await import("./relatorioPdf");
  const { SECOES_PDF } = await import("./relatorioPdfSecoes");
  const secoes = new Set((await lerPreferencia<string[]>("pdf_secoes")) ?? SECOES_PDF.filter((x) => x.padrao).map((x) => x.id));
  const comentarioIA = secoes.has("ia") ? await comentarioIADoPeriodo(inicio, fim) : null;
  const bytes = await gerarRelatorioPdf({ inicio, fim, titularNome: titular.nome, titularEmail: titular.email, contas, lancamentos, agendamentos, orcamentos, metas, bens, secoes: secoes as never, comentarioIA });
  const nome = `relatorio-dairus-${mes}.pdf`;
  await extras.salvarExportacaoBinaria(nome, bytes);
  let naNuvem = false;
  if ((await lerPreferencia<boolean>("pdf_mensal_nuvem")) !== false) {
    try {
      const { enviarArquivoParaNuvem } = await import("./nuvem");
      await enviarArquivoParaNuvem("relatorios", nome, bytes, "application/pdf");
      naNuvem = true;
    } catch {
      // sem internet: o PDF já está na pasta
    }
  }
  await salvarPreferencia("pdf_mensal_ultimo", mes);
  return `Relatório de ${mes.split("-").reverse().join("/")} gerado em PDF${naNuvem ? " e enviado à nuvem" : ""}.`;
}

export async function avisosDeRelatorios(hoje: string): Promise<AvisoSistema[]> {
  const avisos: AvisoSistema[] = [];
  try {
    const { calcularPrevisao } = await import("../features/relatorios/RelatoriosExtras");
    const p = await calcularPrevisao(hoje, 30);
    if (p.primeiroNegativo) {
      const semana = Math.ceil(Number(hoje.slice(8, 10)) / 7);
      avisos.push({ id: `risco-${hoje.slice(0, 7)}-${semana}`, titulo: "Risco de ficar no vermelho", corpo: `Nesse ritmo, o saldo fica negativo em ${p.primeiroNegativo.split("-").reverse().join("/")} (estimativa). Veja Relatórios → Previsão.` });
    }
  } catch {
    // sem dados suficientes
  }
  if (hoje.slice(5, 7) === "03") avisos.push({ id: `ir-${hoje.slice(0, 4)}`, titulo: "Época do Imposto de Renda", corpo: `O pacote do IR de ${Number(hoje.slice(0, 4)) - 1} está pronto em Relatórios → Imposto de Renda (e Investimentos → Impostos).` });
  return avisos;
}

export interface DiagnosticoMensal {
  mes: string;
  texto: string;
  gerado_em: string;
}

/** No começo de cada mês, a IA escreve o diagnóstico do mês que terminou (precisa da chave). */
export async function diagnosticoMensalAutomatico(hoje: string): Promise<string | null> {
  if ((await lerPreferencia<boolean>("diagnostico_ia_auto")) === false) return null;
  if (!(await lerPreferencia<string>("gemini_chave"))) return null;
  const [a, m] = hoje.split("-").map(Number);
  const fimAnterior = new Date(Date.UTC(a, m - 1, 0)).toISOString().slice(0, 10);
  const mes = fimAnterior.slice(0, 7);
  const atual = await lerPreferencia<DiagnosticoMensal>("diagnostico_ia_ultimo");
  if (atual?.mes === mes) return null;
  const { carregarFatos, fatosEmTexto } = await import("./fatosFinanceiros");
  const { perguntarIA, INSTRUCAO_BASE } = await import("./gemini");
  const privado = (await lerPreferencia<boolean>("gemini_anonimo")) ?? false;
  const texto = await perguntarIA({
    instrucao: `${INSTRUCAO_BASE}\nOs números já foram calculados pelo Dairus: use-os sem recalcular.`,
    contexto: fatosEmTexto(await carregarFatos(fimAnterior), privado),
    pergunta: `O mês ${mes} acabou de fechar. Escreva o diagnóstico em até 10 linhas: nota de 0 a 10, o que foi bem, o que pesou (com valores) e 3 ações para o mês que começa.`,
  });
  await salvarPreferencia("diagnostico_ia_ultimo", { mes, texto, gerado_em: new Date().toISOString() } satisfies DiagnosticoMensal);
  return `Diagnóstico de ${mes.split("-").reverse().join("/")} pronto no Início.`;
}

/** Texto da IA para o PDF do período (seção "ia"). Sem chave ou sem internet devolve null. */
export async function comentarioIADoPeriodo(inicio: string, fim: string): Promise<string | null> {
  if (!(await lerPreferencia<string>("gemini_chave"))) return null;
  try {
    const { carregarFatos, fatosEmTexto } = await import("./fatosFinanceiros");
    const { perguntarIA, INSTRUCAO_BASE } = await import("./gemini");
    const privado = (await lerPreferencia<boolean>("gemini_anonimo")) ?? false;
    return await perguntarIA({
      instrucao: `${INSTRUCAO_BASE}\nOs números já foram calculados pelo Dairus: use-os sem recalcular. Texto corrido, sem tabelas.`,
      contexto: fatosEmTexto(await carregarFatos(fim), privado),
      pergunta: `Escreva um comentário de 8 a 12 linhas para o relatório do período ${inicio} a ${fim}: visão geral, destaques positivos, pontos de atenção (com valores) e 3 recomendações práticas.`,
    });
  } catch {
    return null;
  }
}
