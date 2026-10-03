// Acesso ao Google Gemini (chave do próprio usuário: AI Studio ou Vertex AI).
// Usado pelo chat da IA e pelas funções automáticas (lançar por texto/foto/voz,
// classificar, resumos, investimentos).
//
// Todas as chamadas passam por um controle de ritmo (rate limit): uma requisição
// por vez, com intervalo mínimo entre elas, nova tentativa automática quando o
// Google responde "alta demanda" (503) ou "limite" (429), e troca para um modelo
// reserva quando o escolhido não está disponível.

import { lerPreferencia, salvarPreferencia } from "./armazenamento";

export interface Mensagem {
  papel: "usuario" | "ia";
  texto: string;
  tokens?: number;
  /** Anexo (foto, PDF ou áudio) enviado junto com a mensagem. */
  anexo?: { mime: string; base64: string };
}

/** "AIza…" = chave clássica do Google AI Studio. "AQ.…" = chave nova do Google, que vale
 * no AI Studio (Gemini API) ou no Vertex AI em modo expresso; o app descobre sozinho. */
export type TipoChave = "AI_STUDIO" | "GOOGLE_AQ" | "DESCONHECIDA";

export function tipoDaChave(chave: string): TipoChave {
  if (chave.startsWith("AIza")) return "AI_STUDIO";
  if (chave.startsWith("AQ.")) return "GOOGLE_AQ";
  return "DESCONHECIDA";
}

export function rotuloDaChave(chave: string): string {
  const t = tipoDaChave(chave);
  return t === "AI_STUDIO" ? "Google AI Studio" : t === "GOOGLE_AQ" ? "Google (AI Studio ou Vertex)" : "formato desconhecido";
}

/** Limpa o que costuma vir junto ao colar (espaços, quebras de linha, aspas). */
export function limparChave(texto: string): string {
  return texto.replace(/\s+/g, "").replace(/^["']|["']$/g, "");
}

/** Modelo padrão: o apelido "latest" sempre aponta para a versão atual do Google. O Flash-Lite
 * é o que mais responde no plano gratuito (o Flash comum vive lotado). */
export const MODELO_PADRAO = "gemini-flash-lite-latest";
/** Reservas, em ordem, quando o modelo escolhido está indisponível, lotado ou sem cota. */
export const MODELOS_RESERVA = ["gemini-flash-lite-latest", "gemini-3.1-flash-lite", "gemini-flash-latest"];

export const MODELOS_DISPONIVEIS = [
  { value: "gemini-flash-lite-latest", label: "Gemini Flash-Lite (recomendado, mais cota grátis)" },
  { value: "gemini-flash-latest", label: "Gemini Flash (melhor, às vezes lotado)" },
  { value: "gemini-pro-latest", label: "Gemini Pro (mais capaz, menos cota)" },
  { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
];

/** Modelos antigos (2.0/2.5/1.5) não ficam disponíveis para chaves novas: troca pelo padrão atual. */
export function modeloAtualizado(modelo: string | null | undefined): string {
  if (!modelo || /^gemini-(1.5|2.0|2.5)-/.test(modelo)) return MODELO_PADRAO;
  return modelo;
}

const URL_STUDIO = "https://generativelanguage.googleapis.com/v1beta/models";
const URL_VERTEX = "https://aiplatform.googleapis.com/v1/publishers/google/models";

// ---------------------------------------------------------------- controle de ritmo

const RPM_PADRAO = 10;
let fila: Promise<unknown> = Promise.resolve();
let ultimaChamada = 0;

/** Requisições por minuto permitidas (preferência "gemini_rpm", de 1 a 60). */
export async function requisicoesPorMinuto(): Promise<number> {
  const v = await lerPreferencia<number>("gemini_rpm");
  return v && v >= 1 && v <= 60 ? v : RPM_PADRAO;
}

function esperar(ms: number, sinal?: AbortSignal): Promise<void> {
  return new Promise((ok, falha) => {
    if (sinal?.aborted) return falha(new DOMException("Cancelado", "AbortError"));
    const t = setTimeout(ok, ms);
    sinal?.addEventListener("abort", () => {
      clearTimeout(t);
      falha(new DOMException("Cancelado", "AbortError"));
    }, { once: true });
  });
}

/** Avisa a tela (ex.: "aguardando 5 s pelo limite de ritmo"). */
function avisarEspera(ms: number, motivo: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("dairus-gemini-espera", { detail: { ms, motivo } }));
}

async function contarUso() {
  const hoje = new Date().toISOString().slice(0, 10);
  const atual = await lerPreferencia<{ data: string; n: number }>("gemini_uso");
  const n = atual?.data === hoje ? atual.n + 1 : 1;
  await salvarPreferencia("gemini_uso", { data: hoje, n });
}

/** Quantas requisições ao Gemini foram feitas hoje (para mostrar na tela da IA). */
export async function usoDeHoje(): Promise<number> {
  const hoje = new Date().toISOString().slice(0, 10);
  const atual = await lerPreferencia<{ data: string; n: number }>("gemini_uso");
  return atual?.data === hoje ? atual.n : 0;
}

/** Executa a tarefa na fila: uma por vez, respeitando o intervalo mínimo entre requisições. */
export function comLimiteDeRitmo<T>(tarefa: () => Promise<T>, sinal?: AbortSignal): Promise<T> {
  const executar = async () => {
    const intervalo = 60_000 / (await requisicoesPorMinuto());
    const espera = ultimaChamada + intervalo - Date.now();
    if (espera > 0) {
      avisarEspera(espera, "limite de ritmo da chave");
      await esperar(espera, sinal);
    }
    ultimaChamada = Date.now();
    await contarUso().catch(() => {});
    return tarefa();
  };
  const resultado = fila.then(executar, executar);
  fila = resultado.catch(() => {});
  return resultado;
}

// ---------------------------------------------------------------- chamada

interface ErroGemini extends Error {
  status: number;
  /** Tempo que o Google pediu para esperar, em ms (RetryInfo), se veio. */
  retryMs?: number;
  /** Mensagem original do Google. */
  original: string;
}

function criarErro(status: number, original: string, detalhes: unknown): ErroGemini {
  const erro = new Error(mensagemDeErro(status, original)) as ErroGemini;
  erro.status = status;
  erro.original = original;
  const info = Array.isArray(detalhes) ? (detalhes as Array<{ "@type"?: string; retryDelay?: string }>).find((d) => d["@type"]?.includes("RetryInfo")) : undefined;
  const segundos = info?.retryDelay ? parseFloat(info.retryDelay) : NaN;
  if (Number.isFinite(segundos)) erro.retryMs = Math.ceil(segundos * 1000);
  return erro;
}

export function mensagemDeErro(status: number, texto: string): string {
  if (/API key/i.test(texto) && /not valid|invalid|expired/i.test(texto)) return "Chave de API inválida ou expirada. Gere uma nova no Google AI Studio e salve de novo.";
  if (/not supported by this API|API_KEY_SERVICE_BLOCKED|has not been used|is disabled/i.test(texto)) return `Esta chave não tem acesso a este serviço do Google. Detalhe: ${texto}`;
  if (status === 401 || status === 403) return `A chave foi recusada (sem permissão).${texto ? ` Detalhe: ${texto}` : ""}`;
  if (status === 404) return "Modelo não disponível para esta chave. Escolha outro modelo na lista.";
  if (status === 429) return "Limite de uso da chave atingido (cota do plano gratuito). Aguarde alguns minutos ou diminua as requisições por minuto na tela IA.";
  if (status >= 500) return "O Gemini está com alta demanda agora. Tente novamente em instantes.";
  return texto || `Erro ${status} ao consultar o Gemini.`;
}

function ehErroDeChave(status: number, texto: string) {
  return status === 400 || status === 401 || status === 403 ? /API key|API_KEY|permission|PERMISSION|unauthenticated/i.test(texto) : false;
}

async function requisitar(url: string, chave: string, corpo: unknown, sinal?: AbortSignal) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
    signal: sinal,
    body: JSON.stringify(corpo),
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok) throw criarErro(resp.status, json?.error?.message ?? "", json?.error?.details);
  return json;
}

/** Uma tentativa num modelo: AI Studio primeiro; chaves "AQ." caem para o Vertex se o AI Studio recusar a chave. */
async function chamarModelo(chave: string, modelo: string, corpo: unknown, sinal?: AbortSignal) {
  const m = encodeURIComponent(modelo);
  try {
    return await comLimiteDeRitmo(() => requisitar(`${URL_STUDIO}/${m}:generateContent`, chave, corpo, sinal), sinal);
  } catch (e) {
    const erro = e as ErroGemini;
    if (tipoDaChave(chave) === "GOOGLE_AQ" && ehErroDeChave(erro.status, erro.original)) {
      return comLimiteDeRitmo(() => requisitar(`${URL_VERTEX}/${m}:generateContent`, chave, corpo, sinal), sinal);
    }
    throw e;
  }
}

const TENTATIVAS_POR_MODELO = 2;
/** Modelos que falharam há pouco: são pulados até a hora indicada (ms), para não perder tempo. */
const indisponivelAte = new Map<string, number>();

/** Chama o Gemini com fila, novas tentativas (503/429) e troca de modelo (404, ou lotado/sem cota). */
export async function chamarGeminiComCorpo(chave: string, modelo: string, corpo: unknown, sinal?: AbortSignal) {
  const todos = [modelo, ...MODELOS_RESERVA.filter((x) => x !== modelo)];
  const livres = todos.filter((m) => (indisponivelAte.get(m) ?? 0) <= Date.now());
  const modelos = livres.length ? livres : todos;
  let ultimoErro: unknown = null;
  for (const atual of modelos) {
    for (let tentativa = 0; tentativa < TENTATIVAS_POR_MODELO; tentativa++) {
      try {
        const json = await chamarModelo(chave, atual, corpo, sinal);
        indisponivelAte.delete(atual);
        return { json, modeloUsado: atual };
      } catch (e) {
        if ((e as Error).name === "AbortError") throw e;
        const erro = e as ErroGemini;
        ultimoErro = e;
        if (erro.status === 404) {
          indisponivelAte.set(atual, Date.now() + 60 * 60_000); // modelo não existe para esta chave
          break;
        }
        const temporario = erro.status === 503 || erro.status === 500 || erro.status === 429;
        if (!temporario) throw e; // chave inválida, pedido inválido etc.: não adianta insistir
        const ultima = tentativa === TENTATIVAS_POR_MODELO - 1;
        // Cota diária esgotada (o Google pede para esperar muito): troca de modelo direto.
        if ((erro.status === 429 && (erro.retryMs ?? 0) > 30_000) || ultima) {
          indisponivelAte.set(atual, Date.now() + Math.max(5 * 60_000, erro.retryMs ?? 0));
          break;
        }
        const espera = Math.min(30_000, Math.max(erro.retryMs ?? 0, 2000 * 2 ** tentativa));
        avisarEspera(espera, erro.status === 429 ? "limite do Google; tentando de novo" : "Gemini com alta demanda; tentando de novo");
        await esperar(espera, sinal);
      }
    }
  }
  throw ultimoErro ?? new Error("Não foi possível falar com o Gemini.");
}

export async function chamarGemini(opts: {
  chave: string;
  modelo: string;
  instrucao: string;
  contexto: string;
  temperatura: number;
  historico: Mensagem[];
  sinal?: AbortSignal;
  json?: boolean;
  /** Liga a busca do Google (grounding) — usada pelo Radar para achar preços. */
  buscaGoogle?: boolean;
}) {
  const corpo = {
    systemInstruction: { parts: [{ text: `${opts.instrucao}\n\nDADOS DO USUÁRIO:\n${opts.contexto}` }] },
    contents: opts.historico.map((m) => ({
      role: m.papel === "usuario" ? "user" : "model",
      parts: [...(m.anexo ? [{ inlineData: { mimeType: m.anexo.mime, data: m.anexo.base64 } }] : []), { text: m.texto }],
    })),
    ...(opts.buscaGoogle ? { tools: [{ google_search: {} }] } : {}),
    // A busca do Google não combina com saída JSON forçada; nesse caso o JSON vem no texto.
    generationConfig: { temperature: opts.temperatura, ...(opts.json && !opts.buscaGoogle ? { responseMimeType: "application/json" } : {}) },
  };
  const { json, modeloUsado } = await chamarGeminiComCorpo(opts.chave, opts.modelo, corpo, opts.sinal);
  const texto = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!texto) throw new Error("O Gemini não retornou resposta (conteúdo bloqueado ou vazio).");
  return { texto: texto as string, tokens: (json?.usageMetadata?.totalTokenCount as number | undefined) ?? undefined, modeloUsado };
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
    modelo: modeloAtualizado(await lerPreferencia<string>("gemini_modelo")),
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
