// Preferências da conta no backup e na sincronização.
//
// O arquivo de preferências (preferencias-<conta>.json) fica só neste computador. Para
// que nome, perfil de renda, chave Pix, bloco de notas, metas de economia, configurações
// dos widgets etc. apareçam no outro computador (e voltem num backup), uma cópia vai para
// a tabela `preferencias_conta` do banco antes de sincronizar, e volta para o arquivo
// depois de baixar a versão da nuvem ou restaurar um backup.

import { invoke } from "@tauri-apps/api/core";
import { listarPreferencias, salvarPreferencia } from "./armazenamento";

/** Do computador (não faz sentido em outro PC) ou estado interno da sincronização/atualização. */
const DO_COMPUTADOR = new Set([
  "dispositivo_id",
  "sync_estado",
  "sync_ultimo_erro",
  "sync_auto",
  "pin_hash",
  "pin_salt",
  "pin_falhas",
  "pin_bloqueado_ate",
  "pin_minutos",
  "pasta_vigiada",
  "pasta_vigiada_conta",
  "pasta_vigiada_inverter",
  "fechar_para_bandeja",
  "bloquear_ao_minimizar",
  "avisos_windows",
  "avisos_enviados",
  "sidebar_recolhido",
  "verificacao_semanal_resultado",
  "verificacao_semanal_ultima",
  "gemini_uso",
  // Formato antigo dos widgets (hoje os layouts ficam na tabela `dashboards`).
  "widgets_inicio",
  "widgets_tamanhos",
  "widgets_largos",
  "widgets_layout",
  // A aparência já vai para a nuvem pela tabela preferencias_aparencia.
  "aparencia",
]);
const PREFIXOS_DO_COMPUTADOR = ["atualizacao_"];

/** Chaves secretas: não vão para a nuvem (o banco na nuvem pode estar sem criptografia). */
const SEGREDOS = new Set(["gemini_chave", "brapi_token"]);

/** Esta preferência vai junto com os dados da conta? */
export function vaiNaSincronizacao(chave: string): boolean {
  if (!/^[a-z0-9_]{1,64}$/.test(chave)) return false;
  if (DO_COMPUTADOR.has(chave) || SEGREDOS.has(chave)) return false;
  return !PREFIXOS_DO_COMPUTADOR.some((p) => chave.startsWith(p));
}

/** Conjunto (chave → JSON) que vai para o banco. Valores nulos ficam de fora. */
export function preferenciasParaOBanco(todas: Record<string, unknown>): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(todas)) {
    if (valor === null || valor === undefined || !vaiNaSincronizacao(chave)) continue;
    saida[chave] = JSON.stringify(valor);
  }
  return saida;
}

/** Copia as preferências da conta para o banco (só o que mudou é gravado). */
export async function guardarPreferenciasNoBanco(): Promise<number> {
  const itens = preferenciasParaOBanco(await listarPreferencias());
  return invoke<number>("gravar_preferencias_conta", { itens });
}

/**
 * Traz para este computador as preferências que vieram no banco (depois de baixar da
 * nuvem ou restaurar um backup). Não mexe nas do computador nem nos segredos.
 */
export async function restaurarPreferenciasDoBanco(): Promise<number> {
  const doBanco = await invoke<Record<string, string>>("ler_preferencias_conta").catch(() => ({}) as Record<string, string>);
  let n = 0;
  for (const [chave, json] of Object.entries(doBanco)) {
    if (!vaiNaSincronizacao(chave)) continue;
    try {
      await salvarPreferencia(chave, JSON.parse(json));
      n++;
    } catch {
      // valor estragado: mantém o deste computador
    }
  }
  return n;
}
