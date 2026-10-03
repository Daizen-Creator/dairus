import { useEffect } from "react";
import { contabilidade } from "../../services/contabilidade";
import { extras } from "../../services/extras";
import { lerPreferencia, salvarPreferencia } from "../../services/armazenamento";
import { calcularAvisos, filtrarNovos, textoDaBandeja } from "../../services/avisos";
import { dataAtualISO } from "../../services/formato";
import { atualizarBandeja, estaNoTauri, ligarRegistroDeErros, notificar, registrarNoLog } from "../../services/sistema";
import { useSegurancaStore } from "../../state/seguranca-store";
import { lerEstadoLocal, pendenteDeEnvio, sincronizar } from "../../services/sincronizacao";
import { toast } from "sonner";
import { EVENTO_CONFLITO } from "./AvisoSincronizacao";

const INTERVALO_AVISOS = 30 * 60_000;
const INTERVALO_SYNC = 5 * 60_000;

/** Sincroniza se estiver ligado; recarrega a tela quando os dados vieram da nuvem. */
export async function sincronizarEmSegundoPlano(manual = false): Promise<void> {
  if (!manual && (await lerPreferencia<boolean>("sync_auto")) === false) return;
  const r = await sincronizar();
  if (r.decisao === "CONFLITO") {
    window.dispatchEvent(new CustomEvent(EVENTO_CONFLITO, { detail: r.remoto }));
  } else if (r.aplicouRemoto) {
    toast.success("Dados atualizados com as alterações feitas em outro computador.");
    window.setTimeout(() => window.location.reload(), 800);
  }
}

/** Alertas da carteira: preço-alvo, vencimento de renda fixa e lembrete de aporte (cotações atualizadas antes, se ligado). */
async function avisosDeInvestimentos(hoje: string) {
  const { investimentos } = await import("../../services/investimentos");
  const { alertasCarteira } = await import("../../features/investimentos/calculos");
  let ativos = await investimentos.listarAtivos().catch(() => []);
  if (!ativos.length) return [];
  if ((await lerPreferencia<boolean>("invest_cotacoes_auto")) !== false) {
    const { atualizarCotacoesCarteira } = await import("../../features/investimentos/mercado");
    await atualizarCotacoesCarteira(ativos).catch(() => null);
    ativos = await investimentos.listarAtivos().catch(() => ativos);
  }
  const avisos = alertasCarteira(ativos, hoje);
  const dia = (await lerPreferencia<number>("invest_dia_aporte")) ?? 0;
  if (dia > 0) {
    const ultimoDia = new Date(+hoje.slice(0, 4), +hoje.slice(5, 7), 0).getDate();
    if (Number(hoje.slice(8, 10)) === Math.min(dia, ultimoDia)) {
      const valor = (await lerPreferencia<string>("invest_valor_aporte")) ?? "";
      avisos.push({ id: `aporte-${hoje.slice(0, 7)}`, titulo: "Dia do aporte nos investimentos", corpo: valor ? `Planejado: R$ ${valor}. Registre em Investimentos → Lançar.` : "Registre o aporte em Investimentos → Lançar." });
    }
  }
  return avisos;
}

/** Verifica os avisos agora: manda ao Windows os que ainda não foram mostrados hoje e atualiza a bandeja. */
export async function verificarAvisosAgora(): Promise<number> {
  const hoje = dataAtualISO();
  // Receitas e contas marcadas como "lançar sozinho" que já chegaram no dia.
  try {
    const { lancExtras } = await import("../../services/lancamentosExtras");
    const lancados = await lancExtras.processarAutomaticos(hoje);
    if (lancados.length) {
      const { avisarDadosAlterados } = await import("../../state/useAoAlterarDados");
      avisarDadosAlterados();
      await notificar(
        lancados.length === 1 ? `${lancados[0].descricao} lançado automaticamente` : `${lancados.length} lançamentos automáticos`,
        lancados.slice(0, 4).map((l) => `• ${l.descricao}: ${(l.partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0) / 100).toFixed(2).replace(".", ",")}`).join("\n"),
      );
    }
  } catch (e) {
    registrarNoLog("warn", `lançamentos automáticos: ${String(e)}`);
  }
  // Pasta vigiada de extratos.
  try {
    const { importarDaPasta } = await import("../../services/pastaVigiada");
    const r = await importarDaPasta();
    if (r.importados) {
      const { avisarDadosAlterados } = await import("../../state/useAoAlterarDados");
      avisarDadosAlterados();
      await notificar("Extrato importado", `${r.importados} lançamento(s) de ${r.arquivos} arquivo(s) da pasta vigiada.`);
    }
  } catch (e) {
    registrarNoLog("warn", `pasta vigiada: ${String(e)}`);
  }
  const [contas, agendamentos, lancamentos, orcamentos] = await Promise.all([
    contabilidade.listarContas(),
    contabilidade.listarAgendamentos(),
    contabilidade.listarLancamentos(3000),
    extras.listarOrcamentos(),
  ]);
  const ocultar = (await lerPreferencia<boolean>("ocultar_saldos")) ?? false;
  await atualizarBandeja(ocultar ? "Dairus" : textoDaBandeja(contas, agendamentos, hoje));

  const { avisosDePlanejamento, orcamentoAutomatico } = await import("../../services/automacoesPlanejamento");
  const { executarAutomacoesMetas } = await import("../../features/metas/executarAutomacoes");
  const mensagens = [
    ...(await executarAutomacoesMetas(hoje).catch((e) => { registrarNoLog("warn", `metas: ${String(e)}`); return [] as string[]; })),
    ...[await orcamentoAutomatico(hoje).catch(() => null)].filter((x): x is string => !!x),
    ...(await import("../../features/radar/radarAuto").then((m) => m.radarAutomatico(hoje)).catch(() => [] as string[])),
  ];
  const notificacoesLigadas = (await lerPreferencia<boolean>("avisos_windows")) !== false;
  if (notificacoesLigadas) for (const m of mensagens) await notificar("Dairus", m);
  if (mensagens.length) {
    const { avisarDadosAlterados } = await import("../../state/useAoAlterarDados");
    avisarDadosAlterados();
  }
  if ((await lerPreferencia<boolean>("avisos_windows")) === false) return 0;
  const enviados = (await lerPreferencia<Record<string, string>>("avisos_enviados")) ?? {};
  const avisos = [
    ...calcularAvisos({ hoje, contas, agendamentos, lancamentos, orcamentos }),
    ...(await avisosDeInvestimentos(hoje)),
    ...(await avisosDePlanejamento(hoje).catch(() => [])),
  ];
  const { novos, registro } = filtrarNovos(avisos, enviados, hoje);
  // Muitos de uma vez viram um resumo, para não encher a tela de notificações.
  if (novos.length > 3) {
    await notificar(`Dairus: ${novos.length} avisos`, novos.slice(0, 4).map((a) => `• ${a.titulo}`).join("\n"));
  } else {
    for (const a of novos) await notificar(a.titulo, a.corpo);
  }
  await salvarPreferencia("avisos_enviados", registro);

  // Nuvem desatualizada: alterações deste computador há mais de um dia sem ir para a nuvem.
  if ((await lerPreferencia<boolean>("sync_auto")) !== false) {
    const estado = await lerEstadoLocal();
    const antigo = !estado || Date.now() - new Date(estado.sincronizado_em).getTime() > 86_400_000;
    const chave = `nuvem-desatualizada`;
    if (antigo && (await pendenteDeEnvio().catch(() => false)) && registro[chave] !== hoje) {
      await notificar("A nuvem está desatualizada", "Há alterações deste computador que ainda não foram enviadas. Verifique a internet ou o login.");
      await salvarPreferencia("avisos_enviados", { ...registro, [chave]: hoje });
    }
  }
  return novos.length;
}

/**
 * Tarefas de fundo do app aberto: avisos no Windows a cada 30 minutos,
 * texto da bandeja, registro de erros no log e bloqueio automático ao
 * minimizar/esconder a janela (ou quando o Windows bloqueia a sessão).
 */
export function IntegracaoSistema() {
  const bloquear = useSegurancaStore((s) => s.bloquear);
  const pinAtivo = useSegurancaStore((s) => s.pinAtivo);

  useEffect(() => {
    ligarRegistroDeErros();
    const rodar = () => verificarAvisosAgora().catch((e) => registrarNoLog("warn", `avisos: ${String(e)}`));
    const primeiro = window.setTimeout(rodar, 5_000);
    const id = window.setInterval(rodar, INTERVALO_AVISOS);
    const sync = () => sincronizarEmSegundoPlano().catch((e) => registrarNoLog("warn", `sincronização: ${String(e)}`));
    const syncInicial = window.setTimeout(sync, 2_000);
    const idSync = window.setInterval(sync, INTERVALO_SYNC);
    return () => {
      window.clearTimeout(primeiro);
      window.clearInterval(id);
      window.clearTimeout(syncInicial);
      window.clearInterval(idSync);
    };
  }, []);

  useEffect(() => {
    if (!pinAtivo) return;
    let desligar: (() => void) | undefined;
    let vivo = true;
    const talvezBloquear = async () => {
      if ((await lerPreferencia<boolean>("bloquear_ao_minimizar")) === false) return;
      bloquear();
    };
    // Windows bloqueado, janela minimizada ou escondida na bandeja: a página fica "hidden".
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "hidden") talvezBloquear();
    };
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    if (estaNoTauri()) {
      import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
        const janela = getCurrentWindow();
        const parar = await janela.onResized(async () => {
          if ((await janela.isMinimized()) || !(await janela.isVisible())) talvezBloquear();
        });
        if (vivo) desligar = parar;
        else parar();
      });
    }
    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      desligar?.();
    };
  }, [pinAtivo, bloquear]);

  return null;
}
