import { useEffect } from "react";
import { contabilidade } from "../../services/contabilidade";
import { extras } from "../../services/extras";
import { lerPreferencia, salvarPreferencia } from "../../services/armazenamento";
import { calcularAvisos, filtrarNovos, textoDaBandeja } from "../../services/avisos";
import { dataAtualISO } from "../../services/formato";
import { atualizarBandeja, estaNoTauri, ligarRegistroDeErros, notificar, registrarNoLog } from "../../services/sistema";
import { useSegurancaStore } from "../../state/seguranca-store";

const INTERVALO_AVISOS = 30 * 60_000;

/** Verifica os avisos agora: manda ao Windows os que ainda não foram mostrados hoje e atualiza a bandeja. */
export async function verificarAvisosAgora(): Promise<number> {
  const hoje = dataAtualISO();
  const [contas, agendamentos, lancamentos, orcamentos] = await Promise.all([
    contabilidade.listarContas(),
    contabilidade.listarAgendamentos(),
    contabilidade.listarLancamentos(3000),
    extras.listarOrcamentos(),
  ]);
  const ocultar = (await lerPreferencia<boolean>("ocultar_saldos")) ?? false;
  await atualizarBandeja(ocultar ? "Dairus" : textoDaBandeja(contas, agendamentos, hoje));

  if ((await lerPreferencia<boolean>("avisos_windows")) === false) return 0;
  const enviados = (await lerPreferencia<Record<string, string>>("avisos_enviados")) ?? {};
  const { novos, registro } = filtrarNovos(calcularAvisos({ hoje, contas, agendamentos, lancamentos, orcamentos }), enviados, hoje);
  // Muitos de uma vez viram um resumo, para não encher a tela de notificações.
  if (novos.length > 3) {
    await notificar(`Dairus: ${novos.length} avisos`, novos.slice(0, 4).map((a) => `• ${a.titulo}`).join("\n"));
  } else {
    for (const a of novos) await notificar(a.titulo, a.corpo);
  }
  await salvarPreferencia("avisos_enviados", registro);
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
    return () => {
      window.clearTimeout(primeiro);
      window.clearInterval(id);
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
