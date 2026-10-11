// Preferências da conta no backup e na sincronização.
//
// O arquivo de preferências (preferencias-<conta>.json) fica só neste computador. Para
// que nome, perfil de renda, chave Pix, bloco de notas, metas de economia, configurações
// dos widgets etc. apareçam no outro computador (e voltem num backup), uma cópia vai para
// a tabela `preferencias_conta` do banco antes de sincronizar, e volta para o arquivo
// depois de baixar a versão da nuvem ou restaurar um backup.

import { invoke } from "@tauri-apps/api/core";
import { lerPreferencia, listarPreferencias, removerPreferencia, salvarPreferencia } from "./armazenamento";
import { registrarNoLog } from "./sistema";

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
/**
 * Marca LOCAL (deste computador, não sincronizada): ele já concluiu uma sincronização com as
 * preferências no banco. Antes disso, as que só existem aqui ainda não subiram para a nuvem;
 * se a restauração apagasse o que falta no banco, elas se perderiam. Então, sem esta marca,
 * a restauração só mescla (traz o que veio e não apaga nada).
 */
export const MARCA_PREFERENCIAS_SINCRONIZADAS = "sync_prefs_ok";
/** Mesmo limite do Rust (preferencias_conta.rs): valor maior é descartado lá. */
const MAX_VALOR_BYTES = 256 * 1024;

/** O valor passa do limite do banco (e por isso nunca vai para a nuvem)? */
function grandeDemais(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false;
  return new TextEncoder().encode(JSON.stringify(valor)).length > MAX_VALOR_BYTES;
}

/** Conjunto (chave → JSON) que vai para o banco. Valores nulos ficam de fora. */
export function preferenciasParaOBanco(todas: Record<string, unknown>): Record<string, string> {
  const saida: Record<string, string> = {};
  let completo = true;
  for (const [chave, valor] of Object.entries(todas)) {
    if (valor === null || valor === undefined || !vaiNaSincronizacao(chave)) continue;
    if (grandeDemais(valor)) {
      // Grande demais para o banco: fica de fora, e sem a marca o outro computador não apaga a dele.
      completo = false;
      continue;
    }
    saida[chave] = JSON.stringify(valor);
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
 * Como `guardarPreferenciasNoBanco`, mas sem parar o backup/a sincronização se falhar (os
 * lançamentos continuam indo): a falha vai para o log e para `sync_ultimo_erro`, que aparece
 * na tela. Devolve a mensagem da falha, ou null se deu certo.
 */
export async function guardarPreferenciasSemParar(): Promise<string | null> {
  try {
    await guardarPreferenciasNoBanco();
    return null;
  } catch (e) {
    const mensagem = `As preferências da conta (nome, perfil de renda, notas...) não foram copiadas para o banco: ${e instanceof Error ? e.message : String(e)}. Os lançamentos foram normalmente.`;
    await registrarNoLog("warn", `preferências: ${mensagem}`).catch(() => {});
    await salvarPreferencia("sync_ultimo_erro", { mensagem, em: new Date().toISOString() }).catch(() => {});
    return mensagem;
  }
}

/**
 * Primeira abertura da conta depois de atualizar o app: diz ao Rust como estão as preferências
 * ANTES de qualquer edição. É o ponto de partida para a sincronização distinguir "só atualizei"
 * de "mudei uma preferência depois de atualizar" (esta última vira pergunta, não troca silenciosa).
 * O Rust só grava uma vez por atualização; sem atualização pendente, não faz nada.
 */
export async function registrarPreferenciasDaAtualizacao(): Promise<void> {
  try {
    const itens = preferenciasParaOBanco(await listarPreferencias());
    await invoke("registrar_preferencias_da_atualizacao", { itens });
  } catch {
    // sem o ponto de partida a sincronização só pergunta mais (nunca perde dado)
  }
}

/** Onde ficam, só neste computador, os valores daqui trocados pelos da nuvem na primeira mescla. */
export const PREFERENCIAS_SUBSTITUIDAS = "preferencias_substituidas";

/**
 * Traz para este computador as preferências que vieram no banco (depois de baixar da
 * nuvem ou restaurar um backup). Não mexe nas do computador nem nos segredos.
 * Só apaga daqui as preferências da lista que não estão no banco (foram apagadas no outro
 * computador) quando o banco tem a marca `_preferencias_v1` (conjunto completo) E este
 * computador já concluiu uma sincronização com preferências (`sync_prefs_ok`). Antes disso,
 * só mescla; e o valor daqui que a nuvem trocou (nunca esteve na nuvem) fica guardado em
 * `preferencias_substituidas`, para dar para recuperar. Devolve quantas mudaram.
 */
export async function restaurarPreferenciasDoBanco(): Promise<number> {
  const doBanco = await invoke<Record<string, string>>("ler_preferencias_conta").catch(() => ({}) as Record<string, string>);
  const jaSincronizou = (await lerPreferencia<boolean>(MARCA_PREFERENCIAS_SINCRONIZADAS).catch(() => null)) === true;
  const daqui = jaSincronizou ? {} : await listarPreferencias();
  const trocadas: Record<string, unknown> = {};
  let n = 0;
  for (const [chave, json] of Object.entries(doBanco)) {
    if (!vaiNaSincronizacao(chave)) continue;
    try {
      const valor = JSON.parse(json);
      const atual = daqui[chave];
      if (atual !== undefined && atual !== null && JSON.stringify(atual) !== JSON.stringify(valor) && !grandeDemais(atual)) trocadas[chave] = atual;
      await salvarPreferencia(chave, valor);
      n++;
    } catch {
      // valor estragado: mantém o deste computador
    }
  }
  if (Object.keys(trocadas).length > 0) {
    // O que já estava guardado de uma mescla anterior tem prioridade (é o valor mais antigo daqui).
    const anteriores = (await lerPreferencia<Record<string, unknown>>(PREFERENCIAS_SUBSTITUIDAS).catch(() => null)) ?? {};
    await salvarPreferencia(PREFERENCIAS_SUBSTITUIDAS, { ...trocadas, ...anteriores }).catch(() => {});
    await registrarNoLog("info", `preferências: ${Object.keys(trocadas).length} valor(es) deste computador foram trocados pelos da nuvem (guardados em ${PREFERENCIAS_SUBSTITUIDAS}).`).catch(() => {});
  }
  const conjuntoCompleto = Object.prototype.hasOwnProperty.call(doBanco, SENTINELA);
  if (conjuntoCompleto && jaSincronizou) {
    for (const [chave, valor] of Object.entries(await listarPreferencias())) {
      if (!vaiNaSincronizacao(chave) || Object.prototype.hasOwnProperty.call(doBanco, chave)) continue;
      // Grande demais para o banco: nunca foi para a nuvem, então não estar lá não quer dizer
      // que foi apagada no outro computador. Fica.
      if (grandeDemais(valor)) continue;
      await removerPreferencia(chave);
      n++;
    }
  }
  return n;
}
