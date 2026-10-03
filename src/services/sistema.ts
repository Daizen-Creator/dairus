// Integração com o Windows (plugins do Tauri). Fora do Tauri — no navegador,
// durante o desenvolvimento ou nos testes — tudo vira operação vazia.

import { invoke } from "@tauri-apps/api/core";

export function estaNoTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Notificação nativa do Windows. Pede permissão na primeira vez. Devolve se foi mostrada. */
export async function notificar(titulo: string, corpo: string): Promise<boolean> {
  if (!estaNoTauri()) return false;
  const { isPermissionGranted, requestPermission, sendNotification } = await import("@tauri-apps/plugin-notification");
  let ok = await isPermissionGranted();
  if (!ok) ok = (await requestPermission()) === "granted";
  if (ok) sendNotification({ title: titulo, body: corpo });
  return ok;
}

export const abrirComWindows = {
  async ativo(): Promise<boolean> {
    if (!estaNoTauri()) return false;
    const { isEnabled } = await import("@tauri-apps/plugin-autostart");
    return isEnabled();
  },
  async definir(ativar: boolean): Promise<void> {
    if (!estaNoTauri()) return;
    const { enable, disable } = await import("@tauri-apps/plugin-autostart");
    await (ativar ? enable() : disable());
  },
};

export async function atualizarBandeja(texto: string): Promise<void> {
  if (estaNoTauri()) await invoke("atualizar_bandeja", { texto }).catch(() => {});
}

export const pastaDeLogs = () => invoke<string>("pasta_de_logs");
export const lerLog = (linhas = 300) => invoke<string>("ler_log", { linhas });

/** Manda erros do app (exceções e promessas rejeitadas) para o arquivo de log. */
export async function ligarRegistroDeErros(): Promise<void> {
  if (!estaNoTauri()) return;
  const log = await import("@tauri-apps/plugin-log");
  window.addEventListener("error", (e) => {
    log.error(`[tela] ${e.message} em ${e.filename}:${e.lineno}`).catch(() => {});
  });
  window.addEventListener("unhandledrejection", (e) => {
    log.error(`[tela] promessa rejeitada: ${String(e.reason)}`).catch(() => {});
  });
  log.info("[tela] interface carregada").catch(() => {});
}

export async function registrarNoLog(nivel: "info" | "warn" | "error", mensagem: string): Promise<void> {
  if (!estaNoTauri()) return;
  const log = await import("@tauri-apps/plugin-log");
  await log[nivel](mensagem).catch(() => {});
}

/** Fecha a janela ou só esconde na bandeja, conforme a preferência. */
export async function fecharJanela(paraBandeja: boolean): Promise<void> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const janela = getCurrentWindow();
  await (paraBandeja ? janela.hide() : janela.close());
}
