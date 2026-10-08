// Sincronização automática entre computadores pela nuvem da conta (Supabase).
//
// Guarda na nuvem uma cópia do banco (<conta>/sync/atual.db) e um estado
// (<conta>/sync/estado.json) com um número de versão. Cada computador lembra
// a última versão que viu e a "impressão" dos dados naquele momento:
//   - só este computador mudou  -> envia (versão + 1);
//   - só a nuvem mudou          -> baixa e aplica (com cópia de segurança);
//   - os dois mudaram           -> conflito: nada é sobrescrito sem você escolher.

import { invoke } from "@tauri-apps/api/core";
import { lerPreferencia, salvarPreferencia } from "./armazenamento";
import { extras } from "./extras";
import { supabase } from "./supabase";

const BUCKET = "backups";
/** O bucket "backups" só aceita arquivos binários: tudo vai como octet-stream (inclusive o estado.json). */
const BINARIO = "application/octet-stream";
/** Limite de tamanho por arquivo do bucket "backups" no Supabase. */
export const LIMITE_NUVEM_BYTES = 50 * 1024 * 1024;

/** Traduz os erros da nuvem para algo que dá para entender e resolver. */
export function traduzirErroSync(erro: unknown): string {
  const msg = erro instanceof Error ? erro.message : String(erro);
  if (/mime type/i.test(msg)) return "A nuvem recusou o tipo de arquivo enviado. Atualize o Dairus para a versão mais nova.";
  if (/payload too large|exceeded the maximum|too large|413/i.test(msg)) return "O banco ficou maior que o limite de 50 MB da nuvem. Apague anexos grandes (em Garantias e documentos) ou use backup local.";
  if (/failed to fetch|network|load failed|ERR_INTERNET|timeout/i.test(msg)) return "Sem conexão com a nuvem agora. O Dairus tenta de novo em 5 minutos.";
  if (/jwt|jws|invalid.*token|not authorized|unauthorized|401|403/i.test(msg)) return "A sessão da conta expirou. Saia e entre de novo para voltar a sincronizar.";
  return msg;
}

export interface ErroSync {
  mensagem: string;
  em: string;
}
export const lerUltimoErroSync = () => lerPreferencia<ErroSync>("sync_ultimo_erro");

export interface EstadoNuvem {
  versao: number;
  alterado_em: string;
  dispositivo_id: string;
  dispositivo_nome: string;
}

export interface EstadoLocal {
  versao_vista: number;
  impressao: string;
  sincronizado_em: string;
}

export type Decisao = "NADA" | "ENVIAR" | "BAIXAR" | "CONFLITO";

/** Regra de decisão, separada para ser testada sem nuvem. */
export function decidir(p: { local: EstadoLocal | null; remoto: EstadoNuvem | null; impressaoAtual: string; localVazio: boolean }): Decisao {
  const { local, remoto, impressaoAtual, localVazio } = p;
  if (!remoto) return "ENVIAR";
  if (!local) return localVazio ? "BAIXAR" : "CONFLITO";
  const localMudou = local.impressao !== impressaoAtual;
  const remotoMudou = remoto.versao !== local.versao_vista;
  if (localMudou && remotoMudou) return "CONFLITO";
  if (localMudou) return "ENVIAR";
  if (remotoMudou) return "BAIXAR";
  return "NADA";
}

export interface ResultadoSync {
  decisao: Decisao;
  remoto: EstadoNuvem | null;
  /** O banco local foi substituído pela versão da nuvem (a tela precisa recarregar). */
  aplicouRemoto: boolean;
}

async function pasta(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Entre na sua conta para sincronizar.");
  return `${id}/sync`;
}

async function idDoDispositivo(): Promise<string> {
  let id = await lerPreferencia<string>("dispositivo_id");
  if (!id) {
    id = crypto.randomUUID();
    await salvarPreferencia("dispositivo_id", id);
  }
  return id;
}

function nomeDoDispositivo(): string {
  const ua = navigator.userAgent;
  return ua.includes("Windows") ? "Computador com Windows" : "Computador";
}

async function lerEstadoNuvem(base: string): Promise<EstadoNuvem | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(`${base}/estado.json`);
  if (error || !data) {
    // Ainda não existe (primeira sincronização da conta).
    if (error && !/not.?found|404|Object not found/i.test(error.message)) throw new Error(error.message);
    return null;
  }
  return JSON.parse(await data.text()) as EstadoNuvem;
}

export const impressaoDados = () => invoke<string>("impressao_dados");

async function enviar(base: string, versaoAnterior: number): Promise<EstadoNuvem> {
  const copia = new Uint8Array(await invoke<number[]>("gerar_copia_sync"));
  if (copia.byteLength > LIMITE_NUVEM_BYTES) {
    throw new Error(`O banco tem ${(copia.byteLength / 1_048_576).toFixed(1).replace(".", ",")} MB e o limite da nuvem é 50 MB. Apague anexos grandes (em Garantias e documentos) ou use backup local.`);
  }
  const impressao = await impressaoDados();
  const { error: e1 } = await supabase.storage
    .from(BUCKET)
    .upload(`${base}/atual.db`, new Blob([copia], { type: BINARIO }), { upsert: true, contentType: BINARIO });
  if (e1) throw new Error(e1.message);
  const estado: EstadoNuvem = {
    versao: versaoAnterior + 1,
    alterado_em: new Date().toISOString(),
    dispositivo_id: await idDoDispositivo(),
    dispositivo_nome: nomeDoDispositivo(),
  };
  const { error: e2 } = await supabase.storage
    .from(BUCKET)
    .upload(`${base}/estado.json`, new Blob([JSON.stringify(estado)], { type: BINARIO }), { upsert: true, contentType: BINARIO });
  if (e2) throw new Error(e2.message);
  await salvarEstadoLocal({ versao_vista: estado.versao, impressao, sincronizado_em: estado.alterado_em });
  return estado;
}

async function baixar(base: string, remoto: EstadoNuvem): Promise<void> {
  const { data, error } = await supabase.storage.from(BUCKET).download(`${base}/atual.db`);
  if (error || !data) throw new Error(error?.message ?? "Falha ao baixar a cópia da nuvem.");
  const carimbo = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const info = await extras.gravarBackupBaixado(`sincronizado-${carimbo}.db`, new Uint8Array(await data.arrayBuffer()));
  // restaurar_backup guarda antes uma cópia "antes-de-restaurar" do estado atual.
  await extras.restaurarBackup(info.nome);
  await extras.excluirBackup(info.nome).catch(() => {});
  await extras.aplicarRetencao((await lerPreferencia<number>("backup_retencao")) ?? 10).catch(() => 0);
  await salvarEstadoLocal({ versao_vista: remoto.versao, impressao: await impressaoDados(), sincronizado_em: new Date().toISOString() });
}

export const lerEstadoLocal = () => lerPreferencia<EstadoLocal>("sync_estado");
const salvarEstadoLocal = (e: EstadoLocal) => salvarPreferencia("sync_estado", e);

let emAndamento: Promise<ResultadoSync> | null = null;

/** Sincroniza agora. Em conflito não mexe em nada: devolve "CONFLITO" para a tela perguntar. */
export function sincronizar(): Promise<ResultadoSync> {
  if (emAndamento) return emAndamento;
  emAndamento = sincronizarDeVerdade()
    .then(async (r) => {
      await salvarPreferencia("sync_ultimo_erro", null);
      return r;
    })
    .catch(async (e) => {
      const mensagem = traduzirErroSync(e);
      await salvarPreferencia("sync_ultimo_erro", { mensagem, em: new Date().toISOString() } satisfies ErroSync).catch(() => {});
      throw new Error(mensagem);
    })
    .finally(() => {
      emAndamento = null;
    });
  return emAndamento;
}

function sincronizarDeVerdade(): Promise<ResultadoSync> {
  return (async () => {
    const base = await pasta();
    const remoto = await lerEstadoNuvem(base);
    const local = await lerEstadoLocal();
    const impressaoAtual = await impressaoDados();
    const localVazio = (await extras.infoBanco()).lancamentos === 0;
    const decisao = decidir({ local, remoto, impressaoAtual, localVazio });
    if (decisao === "ENVIAR") {
      const novo = await enviar(base, remoto?.versao ?? 0);
      return { decisao, remoto: novo, aplicouRemoto: false };
    }
    if (decisao === "BAIXAR" && remoto) {
      await baixar(base, remoto);
      return { decisao, remoto, aplicouRemoto: true };
    }
    if (decisao === "NADA" && local) await salvarEstadoLocal({ ...local, sincronizado_em: new Date().toISOString() });
    return { decisao, remoto, aplicouRemoto: false };
  })();
}

/** Resolve um conflito: "NUVEM" troca os dados deste computador pelos da nuvem; "LOCAL" sobrescreve a nuvem. */
export async function resolverConflito(lado: "NUVEM" | "LOCAL"): Promise<ResultadoSync> {
  const base = await pasta();
  const remoto = await lerEstadoNuvem(base);
  if (lado === "NUVEM") {
    if (!remoto) throw new Error("Não há dados na nuvem.");
    await baixar(base, remoto);
    return { decisao: "BAIXAR", remoto, aplicouRemoto: true };
  }
  // Antes de sobrescrever a nuvem, guarda a versão dela como backup local.
  if (remoto) {
    const { data } = await supabase.storage.from(BUCKET).download(`${base}/atual.db`);
    if (data) {
      const carimbo = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
      await extras.gravarBackupBaixado(`nuvem-substituida-${carimbo}.db`, new Uint8Array(await data.arrayBuffer())).catch(() => {});
    }
  }
  const novo = await enviar(base, remoto?.versao ?? 0);
  return { decisao: "ENVIAR", remoto: novo, aplicouRemoto: false };
}

/** Há alterações deste computador que ainda não foram para a nuvem? */
export async function pendenteDeEnvio(): Promise<boolean> {
  const local = await lerEstadoLocal();
  if (!local) return true;
  return local.impressao !== (await impressaoDados());
}

/** Mantém só os `manter` backups mais recentes na nuvem (a pasta de sincronização não conta). */
export async function aplicarRetencaoNaNuvem(manter: number): Promise<number> {
  const { listarBackupsNaNuvem, apagarBackupDaNuvem } = await import("./nuvem");
  const arquivos = (await listarBackupsNaNuvem()).filter((a) => a.nome.startsWith("dairus-"));
  const sobrando = arquivos.slice(Math.max(1, manter));
  for (const a of sobrando) await apagarBackupDaNuvem(a.nome);
  return sobrando.length;
}
