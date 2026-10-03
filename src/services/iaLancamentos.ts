// Lançar conversando: transforma texto livre, foto de comprovante/print/NFC-e ou áudio
// em propostas de lançamento que o usuário revisa antes de gravar.
// Sem chave do Gemini, um leitor local entende frases simples ("mercado 45,90 ontem").

import type { Conta, Lancamento } from "../types/accounting";
import { sugerirCategoria } from "./categorias";
import { valorInputParaCentavos } from "./formato";
import type { RegraCategoria } from "./lancamentosExtras";
import { lerNotificacaoBanco } from "../features/lancamentos/detectores";

export type TipoProposta = "DESPESA" | "RECEITA" | "TRANSFERENCIA";

export interface Proposta {
  tipo: TipoProposta;
  descricao: string;
  valor_centavos: number;
  data: string;
  /** DESPESA/RECEITA: categoria. TRANSFERENCIA: não usa. */
  categoria_id: string | null;
  /** DESPESA: de onde saiu. RECEITA: onde entrou. TRANSFERENCIA: origem. */
  conta_id: string | null;
  /** TRANSFERENCIA: destino. */
  conta_destino_id: string | null;
  parcelas: number | null;
}

const somarDias = (iso: string, d: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + d)).toISOString().slice(0, 10);
const dataValida = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;

export const contasPagaveis = (contas: Conta[]) => contas.filter((c) => c.ativa && (c.tipo === "ATIVO" || c.tipo === "PASSIVO") && c.subtipo !== "CATEGORIA" && c.subtipo !== "INVESTIMENTO");
export const categoriasDe = (contas: Conta[], tipo: "DESPESA" | "RECEITA") => contas.filter((c) => c.ativa && c.tipo === tipo && c.subtipo !== "CATEGORIA");

/** Datas faladas: hoje, ontem, anteontem, dd/mm(/aaaa), "dia 5". */
export function lerData(texto: string, hoje: string): string | null {
  const t = texto.toLowerCase();
  if (/\banteontem\b/.test(t)) return somarDias(hoje, -2);
  if (/\bontem\b/.test(t)) return somarDias(hoje, -1);
  if (/\bhoje\b/.test(t)) return hoje;
  const m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    const ano = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : hoje.slice(0, 4);
    const d = `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (dataValida(d)) return d;
  }
  const dia = t.match(/\bdia (\d{1,2})\b/);
  if (dia) {
    const d = `${hoje.slice(0, 8)}${dia[1].padStart(2, "0")}`;
    if (dataValida(d) && d <= hoje) return d;
    // Dia que ainda não chegou neste mês: é do mês passado.
    const anterior = `${somarDias(`${hoje.slice(0, 7)}-01`, -1).slice(0, 8)}${dia[1].padStart(2, "0")}`;
    if (dataValida(anterior)) return anterior;
  }
  return null;
}

const RECEITA = /\b(recebi|ganhei|sal[aá]rio|caiu|entrou|reembolso|pix recebido|vendi)\b/i;
const MESES_EXTENSO = /\b(\d+)\s*(?:x|vezes)\b/i;

/**
 * Leitor local, sem IA. Uma linha (ou trecho separado por ";") por lançamento:
 *   "mercado 45,90 ontem"   "uber 23.50"   "recebi 300 do João"   "tv 1200 em 10x no nubank"
 */
export function interpretarTextoLocal(texto: string, hoje: string, contas: Conta[], regras: RegraCategoria[], lancamentos: Lancamento[]): Proposta[] {
  const pagaveis = contasPagaveis(contas);
  const notif = lerNotificacaoBanco(texto, hoje);
  const trechos = notif && !texto.includes("\n") ? [texto] : texto.split(/[\n;]+/).map((s) => s.trim()).filter(Boolean);
  const saida: Proposta[] = [];
  for (const trecho of trechos) {
    const n = lerNotificacaoBanco(trecho, hoje);
    let valor = n?.valorCentavos ?? 0;
    let descricao = n?.descricao ?? "";
    const tipo: "DESPESA" | "RECEITA" = n?.tipo ?? (RECEITA.test(trecho) ? "RECEITA" : "DESPESA");
    if (!n) {
      const semData = trecho.replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ").replace(/\b\d+\s*(?:x|vezes)\b/gi, " ");
      const mValor = semData.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{1,2}|\d+[.,]\d{1,2}|\d+)(?!\d)/i);
      if (!mValor) continue;
      const bruto = mValor[1];
      const normal = /,\d{1,2}$/.test(bruto) ? bruto : /\.\d{1,2}$/.test(bruto) ? bruto.replace(".", ",") : bruto;
      valor = valorInputParaCentavos(normal);
      descricao = semData
        .replace(mValor[0], " ")
        .replace(/\b(hoje|ontem|anteontem|dia \d{1,2}|reais|real|r\$|gastei|paguei|comprei|recebi|ganhei|com|de|do|da|no|na|em|um|uma|o|a)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    if (valor <= 0) continue;
    if (!descricao) descricao = tipo === "RECEITA" ? "Recebimento" : "Gasto";
    const nomeConta = pagaveis.find((c) => new RegExp(`\\b${c.nome.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(trecho));
    if (nomeConta) descricao = descricao.replace(new RegExp(nomeConta.nome, "i"), "").replace(/\s+/g, " ").trim() || descricao;
    const mParc = trecho.match(MESES_EXTENSO);
    const conta = nomeConta ?? (n?.cartao ? pagaveis.find((c) => c.subtipo === "CARTAO_CREDITO") : undefined) ?? null;
    const parcelas = mParc && conta?.subtipo === "CARTAO_CREDITO" ? Math.min(72, Math.max(2, Number(mParc[1]))) : null;
    const descFinal = descricao.charAt(0).toUpperCase() + descricao.slice(1);
    const sug = sugerirCategoria(descFinal, tipo === "RECEITA" ? "RECEITA" : "DESPESA", regras, lancamentos, contas);
    saida.push({ tipo, descricao: descFinal, valor_centavos: valor, data: n?.data ?? lerData(trecho, hoje) ?? hoje, categoria_id: sug?.categoriaId ?? null, conta_id: conta?.id ?? null, conta_destino_id: null, parcelas });
  }
  return saida;
}

/** Contexto com os ids que a IA pode usar. */
export function contextoParaLancar(contas: Conta[], hoje: string): string {
  const linha = (c: Conta) => `${c.id} = ${c.nome}${c.subtipo === "CARTAO_CREDITO" ? " (cartão de crédito)" : ""}`;
  return [
    `Hoje: ${hoje}.`,
    `CONTAS (de onde sai/entra o dinheiro):\n${contasPagaveis(contas).map(linha).join("\n")}`,
    `CATEGORIAS DE DESPESA:\n${categoriasDe(contas, "DESPESA").map(linha).join("\n")}`,
    `CATEGORIAS DE RECEITA:\n${categoriasDe(contas, "RECEITA").map(linha).join("\n")}`,
  ].join("\n\n");
}

export const INSTRUCAO_LANCAR = `Você extrai lançamentos financeiros (Brasil, reais) de texto, foto de comprovante, nota fiscal (NFC-e/cupom), print de app de banco ou áudio.
Responda SOMENTE com JSON: {"lancamentos":[{"tipo":"DESPESA"|"RECEITA"|"TRANSFERENCIA","descricao":"nome curto do estabelecimento ou motivo","valor":123.45,"data":"AAAA-MM-DD","categoria_id":"id da lista ou null","conta_id":"id da lista ou null","conta_destino_id":"id ou null (só transferência)","parcelas":null|2..72}]}
Regras: use apenas ids que aparecem nas listas. Valor sempre positivo, em reais com ponto decimal. Sem data explícita, use a data de hoje
("ontem" = hoje - 1 dia). Numa nota fiscal, gere UM lançamento com o total pago (não item a item), descrição = nome do estabelecimento.
Parcelas só para compra parcelada no cartão de crédito. Se não houver nenhum lançamento, devolva {"lancamentos":[]}. Nunca invente valores.`;

/** Valida e corrige o que a IA devolveu: ids inexistentes viram null, datas inválidas viram hoje. */
export function normalizarPropostas(bruto: unknown, contas: Conta[], hoje: string, regras: RegraCategoria[] = [], lancamentos: Lancamento[] = []): Proposta[] {
  const lista = Array.isArray(bruto) ? bruto : Array.isArray((bruto as { lancamentos?: unknown })?.lancamentos) ? (bruto as { lancamentos: unknown[] }).lancamentos : [];
  const porId = new Map(contas.map((c) => [c.id, c]));
  const pagaveis = new Set(contasPagaveis(contas).map((c) => c.id));
  const saida: Proposta[] = [];
  for (const item of lista as Array<Record<string, unknown>>) {
    if (!item || typeof item !== "object") continue;
    const tipo: TipoProposta = item.tipo === "RECEITA" || item.tipo === "TRANSFERENCIA" ? item.tipo : "DESPESA";
    const valorNum = typeof item.valor === "number" ? item.valor : typeof item.valor === "string" ? (item.valor.includes(",") ? Number(item.valor.replace(/[^\d,-]/g, "").replace(",", ".")) : Number(item.valor.replace(/[^\d.-]/g, ""))) : NaN;
    const valor = Math.round(Math.abs(valorNum) * 100);
    if (!Number.isFinite(valor) || valor <= 0) continue;
    const descricao = String(item.descricao ?? "").trim().slice(0, 120) || (tipo === "RECEITA" ? "Recebimento" : tipo === "TRANSFERENCIA" ? "Transferência" : "Gasto");
    const conta = typeof item.conta_id === "string" && pagaveis.has(item.conta_id) ? item.conta_id : null;
    const destino = tipo === "TRANSFERENCIA" && typeof item.conta_destino_id === "string" && pagaveis.has(item.conta_destino_id) && item.conta_destino_id !== conta ? item.conta_destino_id : null;
    const tipoCat = tipo === "RECEITA" ? "RECEITA" : "DESPESA";
    let categoria = tipo !== "TRANSFERENCIA" && typeof item.categoria_id === "string" && porId.get(item.categoria_id)?.tipo === tipoCat && porId.get(item.categoria_id)?.subtipo !== "CATEGORIA" ? item.categoria_id : null;
    if (!categoria && tipo !== "TRANSFERENCIA") categoria = sugerirCategoria(descricao, tipoCat, regras, lancamentos, contas)?.categoriaId ?? null;
    const nParc = Number(item.parcelas);
    const parcelas = tipo === "DESPESA" && conta && porId.get(conta)?.subtipo === "CARTAO_CREDITO" && Number.isInteger(nParc) && nParc >= 2 && nParc <= 72 ? nParc : null;
    const data = dataValida(item.data) && item.data <= somarDias(hoje, 400) ? item.data : hoje;
    saida.push({ tipo, descricao, valor_centavos: valor, data, categoria_id: categoria, conta_id: conta, conta_destino_id: destino, parcelas });
  }
  return saida;
}

export function propostaCompleta(p: Proposta): string | null {
  if (!p.conta_id) return "Escolha a conta.";
  if (p.tipo === "TRANSFERENCIA") return p.conta_destino_id ? null : "Escolha a conta de destino.";
  return p.categoria_id ? null : "Escolha a categoria.";
}

export async function interpretarComIA(entrada: { texto?: string; anexo?: { mime: string; base64: string } }, contas: Conta[], hoje: string, regras: RegraCategoria[], lancamentos: Lancamento[]): Promise<Proposta[]> {
  const { perguntarIAJson } = await import("./gemini");
  const pergunta = entrada.texto?.trim()
    ? `Extraia os lançamentos deste texto${entrada.anexo ? " e do anexo" : ""}:\n${entrada.texto.trim()}`
    : entrada.anexo?.mime.startsWith("audio/")
      ? "Transcreva o áudio e extraia os lançamentos que a pessoa disse."
      : "Extraia o lançamento deste comprovante/nota/print.";
  const bruto = await perguntarIAJson<unknown>({ instrucao: INSTRUCAO_LANCAR, contexto: contextoParaLancar(contas, hoje), pergunta, anexo: entrada.anexo });
  return normalizarPropostas(bruto, contas, hoje, regras, lancamentos);
}

export async function gravarProposta(p: Proposta): Promise<Lancamento> {
  const { contabilidade } = await import("./contabilidade");
  const erro = propostaCompleta(p);
  if (erro) throw new Error(erro);
  if (p.tipo === "RECEITA") return contabilidade.registrarRecebimento({ conta_destino_id: p.conta_id!, conta_receita_id: p.categoria_id!, valor_centavos: p.valor_centavos, data: p.data, descricao: p.descricao });
  if (p.tipo === "TRANSFERENCIA") return contabilidade.registrarTransferencia({ conta_origem_id: p.conta_id!, conta_destino_id: p.conta_destino_id!, valor_centavos: p.valor_centavos, data: p.data, descricao: p.descricao });
  const l = await contabilidade.registrarDespesa({ conta_origem_id: p.conta_id!, categoria_despesa_id: p.categoria_id!, valor_centavos: p.valor_centavos, data: p.data, descricao: p.descricao, parcelas: p.parcelas });
  const { tagsComViagem } = await import("./modoViagem");
  const tags = await tagsComViagem([], p.data);
  if (tags.length) await import("./lancamentosExtras").then((m) => m.lancExtras.definirTags(l.id, tags)).catch(() => {});
  return l;
}
