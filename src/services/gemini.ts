// Acesso ao Google Gemini (chave do próprio usuário: AI Studio ou Vertex AI).
// Usado pelo chat da IA e pelas funções automáticas (lançar por texto/foto/voz,
// classificar, resumos, investimentos).

import { lerPreferencia } from "./armazenamento";

export interface Mensagem {
  papel: "usuario" | "ia";
  texto: string;
  tokens?: number;
  /** Anexo (foto, PDF ou áudio) enviado junto com a mensagem. */
  anexo?: { mime: string; base64: string };
}

/** Chaves "AQ.…" são do Vertex AI (modo expresso); "AIza…" são do Google AI Studio. */
export type TipoChave = "AI_STUDIO" | "VERTEX" | "DESCONHECIDA";

export function tipoDaChave(chave: string): TipoChave {
  if (chave.startsWith("AIza")) return "AI_STUDIO";
  if (chave.startsWith("AQ.")) return "VERTEX";
  return "DESCONHECIDA";
}

/** Limpa o que costuma vir junto ao colar (espaços, quebras de linha, aspas). */
export function limparChave(texto: string): string {
  return texto.replace(/\s+/g, "").replace(/^["']|["']$/g, "");
}

function urlDoModelo(chave: string, modelo: string): string {
  const m = encodeURIComponent(modelo);
  return tipoDaChave(chave) === "VERTEX"
    ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${m}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
}

function mensagemDeErro(status: number, texto: string): string {
  if (/API key/i.test(texto) && /not valid|invalid|expired/i.test(texto)) return "Chave de API inválida ou expirada. Gere uma nova (Google AI Studio ou Vertex AI) e salve de novo.";
  if (/not supported by this API|API_KEY_SERVICE_BLOCKED|has not been used|is disabled/i.test(texto)) return `Esta chave não tem acesso a este serviço do Google. Detalhe: ${texto}`;
  if (status === 401 || status === 403) return `A chave foi recusada (sem permissão).${texto ? ` Detalhe: ${texto}` : ""}`;
  if (status === 404) return "Modelo não encontrado. Escolha outro modelo na lista.";
  if (status === 429) return "Limite de uso da API atingido. Aguarde um pouco ou use outro modelo/chave.";
  if (status >= 500) return "O serviço do Gemini está instável agora. Tente novamente em instantes.";
  return texto || `Erro ${status} ao consultar o Gemini.`;
}

export async function chamarGemini(opts: { chave: string; modelo: string; instrucao: string; contexto: string; temperatura: number; historico: Mensagem[]; sinal?: AbortSignal; json?: boolean }) {
  const resp = await fetch(urlDoModelo(opts.chave, opts.modelo), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": opts.chave },
    signal: opts.sinal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${opts.instrucao}\n\nDADOS DO USUÁRIO:\n${opts.contexto}` }] },
      contents: opts.historico.map((m) => ({
        role: m.papel === "usuario" ? "user" : "model",
        parts: [...(m.anexo ? [{ inlineData: { mimeType: m.anexo.mime, data: m.anexo.base64 } }] : []), { text: m.texto }],
      })),
      generationConfig: { temperature: opts.temperatura, ...(opts.json ? { responseMimeType: "application/json" } : {}) },
    }),
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(mensagemDeErro(resp.status, json?.error?.message ?? ""));
  const texto = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!texto) throw new Error("O Gemini não retornou resposta (conteúdo bloqueado ou vazio).");
  return { texto: texto as string, tokens: (json?.usageMetadata?.totalTokenCount as number | undefined) ?? undefined };
}


export const INSTRUCAO_BASE = `Você é o assistente financeiro do app Dairus, de um usuário brasileiro (valores em reais).
Responda em português do Brasil. Use somente os dados fornecidos; nunca invente números.
Identifique claramente o que é dado real e o que é estimativa. Você não é consultor financeiro licenciado:
não recomende comprar ou vender investimentos específicos (atividade regulada pela CVM) nem prometa resultados.`;

/** Lê a chave e o modelo salvos. Erro claro se ainda não há chave. */
export async function configuracaoGemini(): Promise<{ chave: string; modelo: string; temperatura: number }> {
  const chave = await lerPreferencia<string>("gemini_chave");
  if (!chave) throw new Error("Configure sua chave do Gemini na tela IA para usar esta função.");
  return {
    chave,
    modelo: (await lerPreferencia<string>("gemini_modelo")) ?? "gemini-2.5-flash",
    temperatura: (await lerPreferencia<number>("gemini_temperatura")) ?? 0.4,
  };
}

/** Pergunta única à IA, com contexto e (opcional) um anexo. */
export async function perguntarIA(opts: { instrucao?: string; contexto: string; pergunta: string; anexo?: Mensagem["anexo"]; json?: boolean; temperatura?: number }): Promise<string> {
  const cfg = await configuracaoGemini();
  const r = await chamarGemini({
    chave: cfg.chave,
    modelo: cfg.modelo,
    instrucao: opts.instrucao ?? INSTRUCAO_BASE,
    contexto: opts.contexto,
    temperatura: opts.temperatura ?? cfg.temperatura,
    historico: [{ papel: "usuario", texto: opts.pergunta, anexo: opts.anexo }],
    json: opts.json,
  });
  return r.texto;
}

/** Pergunta que deve voltar como JSON; tira cercas de código se o modelo puser. */
export async function perguntarIAJson<T>(opts: Parameters<typeof perguntarIA>[0]): Promise<T> {
  const texto = await perguntarIA({ ...opts, json: true, temperatura: opts.temperatura ?? 0.1 });
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(limpo) as T;
  } catch {
    throw new Error("A IA respondeu num formato inesperado. Tente de novo.");
  }
}

/** Converte um arquivo (foto, PDF, áudio) para enviar como anexo. */
export async function arquivoParaAnexo(arquivo: Blob): Promise<{ mime: string; base64: string }> {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { mime: arquivo.type || "application/octet-stream", base64: btoa(binario) };
}
