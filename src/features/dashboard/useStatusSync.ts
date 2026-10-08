import { useEffect, useState } from "react";
import { lerPreferencia } from "../../services/armazenamento";
import { lerEstadoLocal, lerUltimoErroSync } from "../../services/sincronizacao";

export interface StatusSync {
  texto: string;
  estado: "ok" | "erro" | "desligada" | "nunca";
}

/** "agora", "há 5 min", "há 3 h", "07/10". */
export function haQuanto(iso: string, agora = Date.now()): string {
  const min = Math.round((agora - Date.parse(iso)) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Resumo do estado da sincronização para o card do Início (atualiza a cada minuto). */
export function descreverSync(p: { ligada: boolean; ultima: string | null; erro: { mensagem: string; em: string } | null }, agora = Date.now()): StatusSync {
  if (!p.ligada) return { texto: "Desativada", estado: "desligada" };
  if (p.erro && (!p.ultima || p.erro.em > p.ultima)) return { texto: `Falhou ${haQuanto(p.erro.em, agora)}: ${p.erro.mensagem}`, estado: "erro" };
  if (!p.ultima) return { texto: "Ainda não sincronizado", estado: "nunca" };
  return { texto: `Ativa · ${haQuanto(p.ultima, agora)}`, estado: "ok" };
}

export function useStatusSync(): StatusSync {
  const [status, setStatus] = useState<StatusSync>({ texto: "Verificando…", estado: "nunca" });
  useEffect(() => {
    let vivo = true;
    const ler = async () => {
      const [ligada, local, erro] = await Promise.all([lerPreferencia<boolean>("sync_auto"), lerEstadoLocal().catch(() => null), lerUltimoErroSync().catch(() => null)]);
      if (vivo) setStatus(descreverSync({ ligada: ligada !== false, ultima: local?.sincronizado_em ?? null, erro }));
    };
    ler();
    const t = window.setInterval(ler, 60_000);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, []);
  return status;
}
