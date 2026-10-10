// Preferências da conta no backup e na sincronização.
//
// O arquivo de preferências (preferencias-<conta>.json) fica só neste computador. Para
// que nome, perfil de renda, chave Pix, bloco de notas, metas de economia, configurações
// dos widgets etc. apareçam no outro computador (e voltem num backup), uma cópia vai para
// a tabela `preferencias_conta` do banco antes de sincronizar, e volta para o arquivo
// depois de baixar a versão da nuvem ou restaurar um backup.

import { invoke } from "@tauri-apps/api/core";
import { listarPreferencias, removerPreferencia, salvarPreferencia } from "./armazenamento";

/**
 * LISTA PERMITIDA: só o que a pessoa escolheu ou preencheu vai para o banco (e daí para o
 * backup e a nuvem). Ficam de fora, por não estarem aqui:
 *  - estado automático (`*_ultimo`, `*_ultima`, `tema_do_dia`, `ocultar_saldos`, sincronização,
 *    atualização...): mudaria sozinho e geraria CONFLITO falso entre computadores;
 *  - o que é do computador (PIN, pasta vigiada, bandeja, dispositivo);
 *  - segredos (`gemini_chave`, `brapi_token`) e a conversa com a IA (`gemini_historico`, com dados
 *    financeiros): a cópia na nuvem pode estar sem criptografia.
 * Uma preferência nova só sincroniza se for acrescentada aqui.
 */
export const PREFERENCIAS_DA_CONTA: ReadonlySet<string> = new Set([
  // Perfil e Início
  "nome_usuario",
  "perfil_renda",
  "saldo_fgts",
  "chave_pix",
  "notas_inicio",
  "foco_mes",
  "atalhos_inicio",
  "widget_contagem",
  "widget_relogio",
  "widget_fotos",
  "pagina_inicial",
  // Lançamentos e contas
  "conta_padrao",
  "categoria_padrao",
  "conta_principal",
  "modelos_lancamento", // CHAVE_MODELOS em features/lancamentos/ModelosLancamento.tsx
  "cores_contas",
  "ordem_contas",
  "contas_ordenacao",
  "marcas_usuario",
  "teto_cartoes",
  // Orçamento e metas
  "necessidades",
  "categorias_superfluas",
  "orcamento_renda_base",
  "orcamento_auto",
  "meta_economia_mes",
  "meta_patrimonio",
  "meta_sobra",
  "meta_arredondar",
  "meta_arredondar_ate",
  "meta_lembrete",
  "metas_pausadas",
  "desafios",
  // Investimentos
  "invest_dia_aporte",
  "invest_valor_aporte",
  "invest_cotacoes_auto",
  // Avisos e lembretes
  "dias_aviso_contas",
  "avisos_grupos_desligados",
  "avisos_silencio",
  "lembrete_backup_dias",
  "assinaturas_ignoradas",
  "duplicatas_ignoradas",
  // Ajuda
  "primeiros_passos_ocultos",
  "tutorial_visto",
  // IA (configurações; nunca a chave nem a conversa)
  "ia_perguntas_salvas",
  "gemini_modelo",
  "gemini_tom",
  "gemini_temperatura",
  "gemini_blocos",
  "gemini_anonimo",
  "gemini_transacoes",
  "gemini_rpm",
  // Automações e relatórios
  "radar_auto",
  "radar_auto_ia",
  "resumo_semanal",
  "resumo_semanal_ia",
  "pdf_mensal_auto",
  "pdf_mensal_nuvem",
  "pdf_secoes",
  "modo_viagem",
]);

/** Esta preferência vai junto com os dados da conta? (Chaves com "_" na frente são internas, nunca.) */
export function vaiNaSincronizacao(chave: string): boolean {
  return !chave.startsWith("_") && PREFERENCIAS_DA_CONTA.has(chave);
}

/**
 * Marca gravada junto com as preferências: diz que a tabela tem o conjunto COMPLETO desta
 * versão. Só com ela a restauração apaga daqui o que foi apagado no outro computador (um
 * backup antigo, sem a tabela preenchida, não pode apagar preferências).
 */
export const SENTINELA = "_preferencias_v1";
/** Mesmo limite do Rust (preferencias_conta.rs): valor maior é descartado lá. */
const MAX_VALOR_BYTES = 256 * 1024;

/** Conjunto (chave → JSON) que vai para o banco. Valores nulos ficam de fora. */
export function preferenciasParaOBanco(todas: Record<string, unknown>): Record<string, string> {
  const saida: Record<string, string> = {};
  let completo = true;
  for (const [chave, valor] of Object.entries(todas)) {
    if (valor === null || valor === undefined || !vaiNaSincronizacao(chave)) continue;
    const json = JSON.stringify(valor);
    if (new TextEncoder().encode(json).length > MAX_VALOR_BYTES) {
      // Grande demais para o banco: fica de fora, e sem a marca o outro computador não apaga a dele.
      completo = false;
      continue;
    }
    saida[chave] = json;
  }
  if (completo) saida[SENTINELA] = JSON.stringify("1");
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
 * Se o banco tem a marca `_preferencias_v1`, também apaga daqui as preferências da lista
 * que não estão nele (foram apagadas no outro computador). Devolve quantas mudaram.
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
  if (Object.prototype.hasOwnProperty.call(doBanco, SENTINELA)) {
    for (const chave of Object.keys(await listarPreferencias())) {
      if (vaiNaSincronizacao(chave) && !Object.prototype.hasOwnProperty.call(doBanco, chave)) {
        await removerPreferencia(chave);
        n++;
      }
    }
  }
  return n;
}
