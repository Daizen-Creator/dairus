// Sincronização automática entre computadores pela nuvem da conta (Supabase).
//
// Guarda na nuvem uma cópia do banco com nome único por envio (<conta>/sync/banco-vN-xxxx.db,
// mais a do envio anterior, como um passo de volta) e um estado (<conta>/sync/estado.json) com
// um número de versão e o nome do banco dessa versão. O atual.db continua sendo gravado para
// o Dairus até a v0.2.5, que só lê esse arquivo. Cada computador lembra
// a última versão que viu e a "impressão" dos dados naquele momento:
//   - só este computador mudou  -> envia (versão + 1);
//   - só a nuvem mudou          -> baixa e aplica (com cópia de segurança);
//   - os dois mudaram           -> conflito: nada é sobrescrito sem você escolher.

import { invoke } from "@tauri-apps/api/core";
import { lerPreferencia, salvarPreferencia } from "./armazenamento";
import { extras } from "./extras";
import { MARCA_PREFERENCIAS_SINCRONIZADAS, guardarPreferenciasSemParar } from "./preferenciasConta";
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

/** A nuvem respondeu que o arquivo não existe (ainda). */
const naoExiste = (msg: string) => /not.?found|404|Object not found/i.test(msg);

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
  /** Versão do esquema do banco enviado (número da última migração). Ausente nos envios até a v0.2.5. */
  esquema?: number;
  /**
   * Arquivo do banco desta versão, na pasta de sincronização (nome único por envio, nunca
   * sobrescrito). Ausente nos envios antigos: aí o banco é o `atual.db`.
   */
  arquivo?: string;
  /** Arquivo da versão anterior, guardado como um passo de volta. */
  anterior?: string;
}

/** Cópia do banco que o Dairus até a v0.2.5 lê (continua sendo gravada para ele). */
const ATUAL = "atual.db";
/** Nome do banco de um envio: único, para um envio nunca apagar o de outro computador. */
const VERSIONADO = /^banco-v\d+-[0-9a-f]{8}\.db$/;

/** Arquivo do banco apontado por um estado da nuvem (com nome conferido). */
export function arquivoDoBanco(e: EstadoNuvem): string {
  if (e.arquivo === undefined || e.arquivo === ATUAL) return ATUAL;
  if (!VERSIONADO.test(e.arquivo)) throw new Error("O estado da sincronização na nuvem aponta para um arquivo inválido.");
  return e.arquivo;
}

export const MSG_ATUALIZE = "A nuvem tem dados de uma versão mais nova do Dairus. Atualize o Dairus neste computador para sincronizar.";

let esquemaApp: Promise<number> | null = null;
/** Versão do esquema que este app entende. */
const esquemaDoApp = () => (esquemaApp ??= invoke<number>("versao_esquema_app").catch((e) => {
  esquemaApp = null;
  throw e;
}));

/** Para tudo se a nuvem tem um banco de versão mais nova: baixar ou sobrescrever estragaria dados. */
async function conferirEsquema(remoto: EstadoNuvem | null): Promise<void> {
  if (remoto?.esquema && remoto.esquema > (await esquemaDoApp())) throw new Error(MSG_ATUALIZE);
}

export interface EstadoLocal {
  versao_vista: number;
  impressao: string;
  sincronizado_em: string;
  /**
   * Qual gravação da nuvem foi vista (dois computadores podem gravar o mesmo número de versão).
   * Ausentes nos estados gravados até a v0.2.6: aí só a versão é comparada.
   */
  alterado_em_visto?: string;
  dispositivo_visto?: string;
  /** A última sincronização daqui foi um envio (a gravação vista na nuvem é a deste computador). */
  enviado_daqui?: boolean;
}

export type Decisao = "NADA" | "ENVIAR" | "BAIXAR" | "CONFLITO";

/**
 * Regra de decisão, separada para ser testada sem nuvem.
 * `soAtualizacao`: os dados daqui só mudaram porque o app foi atualizado (migrações do banco e
 * a primeira cópia das preferências para ele), não por edição da pessoa. Isso não é motivo de
 * conflito: se a nuvem mudou, baixa (as preferências que só existem aqui são mescladas e sobem
 * na próxima rodada); se não, envia.
 */
export function decidir(p: { local: EstadoLocal | null; remoto: EstadoNuvem | null; impressaoAtual: string; localVazio: boolean; soAtualizacao?: boolean }): Decisao {
  const { local, remoto, impressaoAtual, localVazio } = p;
  if (!remoto) return "ENVIAR";
  if (!local) return localVazio ? "BAIXAR" : "CONFLITO";
  const localMudou = local.impressao !== impressaoAtual;
  // Mesma versão, mas outra gravação: outro computador gravou por cima no mesmo instante.
  const outraGravacao =
    remoto.versao === local.versao_vista &&
    local.alterado_em_visto !== undefined &&
    (remoto.alterado_em !== local.alterado_em_visto || remoto.dispositivo_id !== local.dispositivo_visto);
  // Se a gravação coberta era a deste computador, os dados que ele enviou não estão na nuvem:
  // baixar descartaria esses dados daqui também. A pessoa escolhe.
  if (outraGravacao && local.enviado_daqui) return "CONFLITO";
  const remotoMudou = remoto.versao !== local.versao_vista || outraGravacao;
  if (localMudou && p.soAtualizacao) return remotoMudou ? "BAIXAR" : "ENVIAR";
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

/**
 * Baixa um arquivo da pasta de sincronização SEM cache: nem o do WebView (`no-store`) nem o
 * da CDN (parâmetro `cacheNonce` único). Com cache, o outro computador poderia ler o estado
 * antigo por até 1 hora e gravar por cima de uma versão que não viu.
 */
const baixarSemCache = (caminho: string) =>
  supabase.storage.from(BUCKET).download(caminho, { cacheNonce: crypto.randomUUID() }, { cache: "no-store" });

/** Opções de envio: binário e sem cache (a nuvem responde `Cache-Control: max-age=0`). */
const SEM_CACHE = { upsert: true, contentType: BINARIO, cacheControl: "0" } as const;

async function lerEstadoNuvem(base: string): Promise<EstadoNuvem | null> {
  const { data, error } = await baixarSemCache(`${base}/estado.json`);
  if (error || !data) {
    // Ainda não existe (primeira sincronização da conta).
    if (error && !naoExiste(error.message)) throw new Error(error.message);
    return null;
  }
  return JSON.parse(await data.text()) as EstadoNuvem;
}

export const impressaoDados = () => invoke<string>("impressao_dados");

/** Cópia do banco e impressão dos mesmos dados, tiradas juntas no Rust (sob o mesmo lock). */
interface CopiaSync {
  copia: number[];
  impressao: string;
  esquema: number;
}

/** Começo do erro de `restaurar_backup` quando os dados daqui mudaram depois da decisão de baixar. */
const DADOS_MUDARAM = "DADOS_MUDARAM";

/** Identifica uma gravação do estado da nuvem (dois PCs podem gravar a mesma versão). */
const assinatura = (e: EstadoNuvem | null) => (e ? `${e.versao}|${e.alterado_em}|${e.dispositivo_id}` : "vazia");

/** Resultado de um envio: gravado, ou a nuvem mudou no meio (conflito; o estado local não muda). */
type Envio = { ok: true; estado: EstadoNuvem } | { ok: false; remoto: EstadoNuvem | null };

/**
 * Envia os dados deste computador. `lido` é o estado da nuvem que originou a decisão:
 * se outro computador gravou depois dele, nada é gravado (conflito). Supabase Storage não
 * tem gravação condicional, então confere antes de cada gravação e lê de novo no fim.
 */
async function enviar(base: string, lido: EstadoNuvem | null): Promise<Envio> {
  const mudouDesdeALeitura = async () => {
    const agora = await lerEstadoNuvem(base);
    return assinatura(agora) === assinatura(lido) ? null : { ok: false as const, remoto: agora };
  };
  await guardarPreferenciasSemParar();
  // A impressão gravada no estado local descreve exatamente a cópia enviada: uma edição
  // feita durante o envio fica de fora das duas e vai na próxima rodada.
  const tirada = await invoke<CopiaSync>("copia_e_impressao_sync");
  const copia = new Uint8Array(tirada.copia);
  const impressao = tirada.impressao;
  if (copia.byteLength > LIMITE_NUVEM_BYTES) {
    throw new Error(`O banco tem ${(copia.byteLength / 1_048_576).toFixed(1).replace(".", ",")} MB e o limite da nuvem é 50 MB. Apague anexos grandes (em Garantias e documentos) ou use backup local.`);
  }
  const antesDoBanco = await mudouDesdeALeitura();
  if (antesDoBanco) return antesDoBanco;
  const versao = (lido?.versao ?? 0) + 1;
  // O banco vai com nome único: se outro computador gravar ao mesmo tempo, nenhum dos dois
  // apaga o banco do outro, e o estado.json (gravado por último) decide qual vale.
  const arquivo = `banco-v${versao}-${crypto.randomUUID().slice(0, 8)}.db`;
  const corpo = () => new Blob([copia], { type: BINARIO });
  const { error: e1 } = await supabase.storage.from(BUCKET).upload(`${base}/${arquivo}`, corpo(), { ...SEM_CACHE, upsert: false });
  if (e1) throw new Error(e1.message);
  const antesDoEstado = await mudouDesdeALeitura();
  if (antesDoEstado) {
    // Ninguém aponta para o banco que acabou de subir: pode sair. A nuvem fica como estava.
    await apagarDaNuvem(base, arquivo);
    return antesDoEstado;
  }
  // A nuvem ainda está no formato antigo (só atual.db): guarda o banco dela com nome único
  // antes de sobrescrever o atual.db, para continuar havendo um passo de volta.
  let anterior = lido?.arquivo === ATUAL ? undefined : lido?.arquivo;
  if (lido && anterior === undefined) {
    const nome = `banco-v${lido.versao}-${crypto.randomUUID().slice(0, 8)}.db`;
    const { error } = await supabase.storage.from(BUCKET).copy(`${base}/${ATUAL}`, `${base}/${nome}`);
    if (!error) anterior = nome;
  }
  // Cópia para o Dairus até a v0.2.5, que só lê o atual.db (antes do estado, que é o que "publica").
  const { error: e2 } = await supabase.storage.from(BUCKET).upload(`${base}/${ATUAL}`, corpo(), SEM_CACHE);
  if (e2) throw new Error(e2.message);
  const estado: EstadoNuvem = {
    versao,
    alterado_em: new Date().toISOString(),
    dispositivo_id: await idDoDispositivo(),
    dispositivo_nome: nomeDoDispositivo(),
    esquema: tirada.esquema,
    arquivo,
    ...(anterior ? { anterior } : {}),
  };
  const { error: e3 } = await supabase.storage
    .from(BUCKET)
    .upload(`${base}/estado.json`, new Blob([JSON.stringify(estado)], { type: BINARIO }), SEM_CACHE);
  if (e3) throw new Error(e3.message);
  // Confere: se outro computador gravou ao mesmo tempo, não marca como sincronizado.
  // (O banco enviado fica na nuvem: o estado do outro pode apontar para ele como "anterior".)
  const conferido = await lerEstadoNuvem(base);
  if (assinatura(conferido) !== assinatura(estado)) return { ok: false, remoto: conferido };
  await salvarEstadoLocal({ ...vista(estado), impressao, sincronizado_em: estado.alterado_em, enviado_daqui: true });
  // Ficam na nuvem o banco atual e o anterior; o de antes deles sai, e também as sobras de
  // envios que não chegaram a ser gravados no estado.json (app fechado no meio, erro, corrida).
  const velho = lido?.anterior;
  if (velho && velho !== arquivo && velho !== lido?.arquivo && VERSIONADO.test(velho)) await apagarDaNuvem(base, velho);
  await limparSobras(base, estado);
  return { ok: true, estado };
}

/** Bancos com nome único que o estado não aponta e que já têm mais de um dia (não são de um envio em curso). */
const IDADE_MINIMA_SOBRA_MS = 24 * 60 * 60 * 1000;

async function limparSobras(base: string, estado: EstadoNuvem): Promise<void> {
  try {
    const { data } = await supabase.storage.from(BUCKET).list(base, { limit: 100 });
    const agora = Date.now();
    const sobras = (data ?? []).filter((f) => {
      if (!VERSIONADO.test(f.name) || f.name === estado.arquivo || f.name === estado.anterior) return false;
      const criado = Date.parse(f.created_at ?? "");
      return Number.isFinite(criado) && agora - criado > IDADE_MINIMA_SOBRA_MS;
    });
    if (sobras.length > 0) await supabase.storage.from(BUCKET).remove(sobras.map((f) => `${base}/${f.name}`));
  } catch {
    // limpeza é só higiene: se não der, sobra espaço, nada se perde
  }
}

/** Apaga um arquivo da pasta de sincronização, sem parar se não der (sobra um arquivo, nada se perde). */
async function apagarDaNuvem(base: string, arquivo: string): Promise<void> {
  try {
    await supabase.storage.from(BUCKET).remove([`${base}/${arquivo}`]);
  } catch {
    // fica para trás; não atrapalha a sincronização
  }
}

/**
 * Baixa a versão da nuvem e troca os dados deste computador por ela.
 * Com `impressaoEsperada` (sincronização automática), o Rust confere, já com o banco
 * travado, se os dados daqui continuam como estavam na decisão; se mudaram, nada é
 * substituído e devolve false (é um conflito).
 */
async function baixar(base: string, remoto: EstadoNuvem, impressaoEsperada?: string): Promise<boolean> {
  const { data, error } = await baixarSemCache(`${base}/${arquivoDoBanco(remoto)}`);
  if (error || !data) throw new Error(error?.message ?? "Falha ao baixar a cópia da nuvem.");
  const carimbo = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const info = await extras.gravarBackupBaixado(`sincronizado-${carimbo}.db`, new Uint8Array(await data.arrayBuffer()));
  // restaurar_backup guarda antes uma cópia "antes-de-restaurar" do estado atual.
  try {
    await extras.restaurarBackup(info.nome, impressaoEsperada);
  } catch (e) {
    if (String(e instanceof Error ? e.message : e).startsWith(DADOS_MUDARAM)) {
      await extras.excluirBackup(info.nome).catch(() => {});
      return false;
    }
    throw e;
  }
  await extras.excluirBackup(info.nome).catch(() => {});
  await extras.aplicarRetencao((await lerPreferencia<number>("backup_retencao")) ?? 10).catch(() => 0);
  await salvarEstadoLocal({ ...vista(remoto), impressao: await impressaoDados(), sincronizado_em: new Date().toISOString(), enviado_daqui: false });
  return true;
}

export const lerEstadoLocal = () => lerPreferencia<EstadoLocal>("sync_estado");
/** O que o estado local guarda da gravação da nuvem que foi vista. */
const vista = (e: EstadoNuvem) => ({ versao_vista: e.versao, alterado_em_visto: e.alterado_em, dispositivo_visto: e.dispositivo_id });
const salvarEstadoLocal = (e: EstadoLocal) => salvarPreferencia("sync_estado", e);

let emAndamento: Promise<ResultadoSync> | null = null;

/** Sincroniza agora. Em conflito não mexe em nada: devolve "CONFLITO" para a tela perguntar. */
export function sincronizar(): Promise<ResultadoSync> {
  if (emAndamento) return emAndamento;
  const inicio = new Date().toISOString();
  emAndamento = sincronizarDeVerdade()
    .then(async (r) => {
      // Deu certo: limpa o erro anterior, mas mantém um aviso registrado nesta rodada
      // (ex.: as preferências não foram copiadas para o banco).
      const aviso = await lerUltimoErroSync().catch(() => null);
      if (!aviso || aviso.em < inicio) await salvarPreferencia("sync_ultimo_erro", null);
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
    // As preferências da conta vão no banco: copia antes de comparar, para a mudança contar.
    // Se falhar, segue com os lançamentos e registra o aviso (log e tela).
    const prefsCopiadas = (await guardarPreferenciasSemParar()) === null;
    const remoto = await lerEstadoNuvem(base);
    // Nuvem com banco de versão mais nova: não baixa nem envia (pede para atualizar o app).
    await conferirEsquema(remoto);
    const local = await lerEstadoLocal();
    const impressaoAtual = await impressaoDados();
    const localVazio = (await extras.infoBanco()).lancamentos === 0;
    // Mudou aqui desde a última sincronização: foi só a atualização do app? (Na dúvida, não.)
    const soAtualizacao =
      !!local && local.impressao !== impressaoAtual
        ? await invoke<boolean>("mudanca_so_da_atualizacao", { impressaoVista: local.impressao }).catch(() => false)
        : false;
    const decisao = decidir({ local, remoto, impressaoAtual, localVazio, soAtualizacao: soAtualizacao === true });
    if (decisao === "ENVIAR") {
      const envio = await enviar(base, remoto);
      // Outro computador gravou na nuvem depois da leitura: os dois lados mudaram.
      if (!envio.ok) return { decisao: "CONFLITO", remoto: envio.remoto, aplicouRemoto: false };
      await concluida(prefsCopiadas);
      return { decisao, remoto: envio.estado, aplicouRemoto: false };
    }
    if (decisao === "BAIXAR" && remoto) {
      // Os dados daqui mudaram entre a decisão e a troca: os dois lados mudaram, é conflito.
      if (!(await baixar(base, remoto, impressaoAtual))) return { decisao: "CONFLITO", remoto, aplicouRemoto: false };
      await concluida(prefsCopiadas);
      return { decisao, remoto, aplicouRemoto: true };
    }
    if (decisao === "NADA" && local) {
      // Estado antigo (só com a versão): passa a lembrar também qual gravação foi vista.
      const gravacao = local.alterado_em_visto === undefined && remoto ? vista(remoto) : {};
      await salvarEstadoLocal({ ...local, ...gravacao, sincronizado_em: new Date().toISOString() });
      await concluida(prefsCopiadas);
    }
    return { decisao, remoto, aplicouRemoto: false };
  })();
}

/**
 * Depois de uma sincronização concluída: a marca da atualização do app não vale mais e, se as
 * preferências foram copiadas para o banco nesta rodada (`prefsCopiadas`), este computador já
 * as tem na nuvem (a partir de agora a restauração pode apagar as que foram apagadas no outro).
 * Sem a cópia, a marca não é gravada: apagar com base num banco sem as preferências daqui
 * perderia as que só existem aqui.
 */
async function concluida(prefsCopiadas: boolean): Promise<void> {
  if (prefsCopiadas) await salvarPreferencia(MARCA_PREFERENCIAS_SINCRONIZADAS, true).catch(() => {});
  await invoke("limpar_marca_atualizacao").catch(() => {});
}

/**
 * Guarda a cópia da nuvem como backup local ("nuvem-substituida-..."), antes de substituí-la.
 * Se não conseguir baixar ou gravar, lança erro e o envio é cancelado. Só segue sem cópia
 * quando a nuvem não tem o arquivo (não há o que perder).
 */
async function guardarCopiaDaNuvem(base: string, remoto: EstadoNuvem): Promise<void> {
  const cancelado = "Nada foi enviado: não foi possível guardar antes uma cópia dos dados da nuvem neste computador";
  const { data, error } = await baixarSemCache(`${base}/${arquivoDoBanco(remoto)}`);
  if (error && naoExiste(error.message)) return;
  if (error || !data) throw new Error(`${cancelado} (${traduzirErroSync(error?.message ?? "arquivo vazio")}). Tente de novo.`);
  const carimbo = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  try {
    await extras.gravarBackupBaixado(`nuvem-substituida-${carimbo}.db`, new Uint8Array(await data.arrayBuffer()));
  } catch (e) {
    throw new Error(`${cancelado} (${e instanceof Error ? e.message : String(e)}). Os dados da nuvem continuam lá.`);
  }
}

/** Resolve um conflito: "NUVEM" troca os dados deste computador pelos da nuvem; "LOCAL" sobrescreve a nuvem. */
export async function resolverConflito(lado: "NUVEM" | "LOCAL"): Promise<ResultadoSync> {
  const base = await pasta();
  const prefsCopiadas = (await guardarPreferenciasSemParar()) === null;
  const remoto = await lerEstadoNuvem(base);
  await conferirEsquema(remoto);
  if (lado === "NUVEM") {
    if (!remoto) throw new Error("Não há dados na nuvem.");
    await baixar(base, remoto);
    await concluida(prefsCopiadas);
    return { decisao: "BAIXAR", remoto, aplicouRemoto: true };
  }
  // Antes de sobrescrever a nuvem, guarda a versão dela como backup local.
  // Sem essa cópia, nada é enviado: a versão da nuvem se perderia.
  if (remoto) await guardarCopiaDaNuvem(base, remoto);
  const envio = await enviar(base, remoto);
  if (!envio.ok) {
    throw new Error("Outro computador enviou dados para a nuvem enquanto você escolhia. Nada foi marcado como sincronizado: escolha de novo na próxima sincronização.");
  }
  await concluida(prefsCopiadas);
  return { decisao: "ENVIAR", remoto: envio.estado, aplicouRemoto: false };
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
