import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, Download, RefreshCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/Button";
import { lerPreferencia, salvarPreferencia } from "../../services/armazenamento";
import { estaNoTauri, notificar } from "../../services/sistema";

export interface Novidade {
  versao: string;
  versao_atual: string;
  titulo: string;
  notas: string;
  publicada_em: string | null;
  pagina: string | null;
  instalador: string | null;
  tamanho_bytes: number;
  sha256: string | null;
  fonte: string;
  beta: boolean;
}

export const verificarAtualizacao = async () => invoke<Novidade | null>("verificar_atualizacao", { beta: (await lerPreferencia<boolean>("atualizacao_beta")) ?? false });
export const EVENTO_VERIFICAR = "dairus:verificar-atualizacao";

type Etapa = { tipo: "disponivel" } | { tipo: "baixando"; pct: number } | { tipo: "pronta"; caminho: string; aoSair: boolean } | { tipo: "erro"; msg: string };

/**
 * Atualização automática: verifica a cada 6 horas (GitHub e, se ele falhar, Supabase), baixa em
 * segundo plano, confere o arquivo e instala quando o Dairus fechar (ou na hora, se você pedir).
 */
export function AvisoAtualizacao() {
  const [novidade, setNovidade] = useState<Novidade | null>(null);
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "disponivel" });
  const [verNotas, setVerNotas] = useState(false);
  const [escondido, setEscondido] = useState(false);
  const baixando = useRef(false);

  const baixar = useCallback(async (n: Novidade, automatico: boolean) => {
    if (!n.instalador || baixando.current) return;
    baixando.current = true;
    setEtapa({ tipo: "baixando", pct: 0 });
    try {
      const caminho = await invoke<string>("baixar_atualizacao", { url: n.instalador, sha256: n.sha256 });
      const aoSair = automatico && (await lerPreferencia<boolean>("atualizacao_instalar_ao_sair")) !== false;
      if (aoSair) await invoke("instalar_ao_sair", { caminho });
      setEtapa({ tipo: "pronta", caminho, aoSair });
      if (automatico) await notificar(`Dairus ${n.versao} pronto para instalar`, aoSair ? "Será instalado quando você fechar o Dairus." : "Abra o Dairus e clique em “Reiniciar e atualizar”.");
    } catch (e) {
      setEtapa({ tipo: "erro", msg: String(e) });
    } finally {
      baixando.current = false;
    }
  }, []);

  const verificar = useCallback(async (manual: boolean) => {
    if (!estaNoTauri()) return;
    if (!manual && (await lerPreferencia<boolean>("atualizacao_auto")) === false) return;
    try {
      const n = await verificarAtualizacao();
      setNovidade(n);
      if (manual) toast.success(n ? `Versão ${n.versao} disponível (${n.fonte}).` : "Você já está na versão mais nova.");
      if (!n) return;
      setEscondido(false);
      if ((await lerPreferencia<boolean>("atualizacao_baixar_auto")) !== false) {
        baixar(n, true);
      } else if (!manual && (await lerPreferencia<string>("atualizacao_avisada")) !== n.versao) {
        await notificar(`Dairus ${n.versao} disponível`, "Abra o Dairus para ver o que mudou e atualizar.");
        await salvarPreferencia("atualizacao_avisada", n.versao);
      }
    } catch (e) {
      if (manual) toast.error(String(e));
    }
  }, [baixar]);

  useEffect(() => {
    if (!estaNoTauri()) return;
    let desligar: (() => void) | undefined;
    import("@tauri-apps/api/event")
      .then(({ listen }) => listen<number>("atualizacao-progresso", (ev) => setEtapa((e) => (e.tipo === "baixando" ? { tipo: "baixando", pct: ev.payload } : e))))
      .then((f) => { desligar = f; })
      .catch(() => {});
    const primeiro = window.setTimeout(() => verificar(false), 15_000);
    const id = window.setInterval(() => verificar(false), 6 * 60 * 60_000);
    const manual = () => verificar(true);
    window.addEventListener(EVENTO_VERIFICAR, manual);
    return () => {
      desligar?.();
      window.clearTimeout(primeiro);
      window.clearInterval(id);
      window.removeEventListener(EVENTO_VERIFICAR, manual);
    };
  }, [verificar]);

  if (!novidade || escondido) return null;

  async function instalarAgora(caminho: string) {
    try {
      toast.info("Fazendo um backup e instalando… o Dairus reabre sozinho.");
      const { extras } = await import("../../services/extras");
      await extras.criarBackup().catch(() => {});
      await invoke("instalar_baixada", { caminho });
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="border-b border-primaria/40 bg-primaria/10 px-4 py-2 text-sm text-texto-primario">
      <div className="flex flex-wrap items-center gap-3">
        {etapa.tipo === "pronta" ? <CheckCircle2 size={16} className="text-sucesso" /> : <Sparkles size={16} className="text-primaria" />}
        <span className="flex-1">
          <strong>Dairus {novidade.versao}</strong>{novidade.beta ? " (beta)" : ""}{" "}
          {etapa.tipo === "baixando" ? `baixando… ${etapa.pct}%` : etapa.tipo === "pronta" ? (etapa.aoSair ? "baixado: será instalado quando você fechar o Dairus." : "baixado e conferido, pronto para instalar.") : etapa.tipo === "erro" ? "não pôde ser baixado." : `está disponível (você usa a ${novidade.versao_atual}).`}
        </span>
        <Button tamanho="pequeno" variante="fantasma" onClick={() => setVerNotas(!verNotas)}>{verNotas ? "Esconder" : "O que mudou"}</Button>
        {etapa.tipo === "pronta" && <Button tamanho="pequeno" onClick={() => instalarAgora(etapa.caminho)}><RefreshCw size={13} /> Reiniciar e atualizar</Button>}
        {etapa.tipo === "pronta" && !etapa.aoSair && <Button tamanho="pequeno" variante="secundaria" onClick={() => invoke("instalar_ao_sair", { caminho: etapa.caminho }).then(() => setEtapa({ ...etapa, aoSair: true })).catch((e) => toast.error(String(e)))}>Instalar ao fechar</Button>}
        {(etapa.tipo === "disponivel" || etapa.tipo === "erro") && novidade.instalador && <Button tamanho="pequeno" onClick={() => baixar(novidade, false)}><Download size={13} /> {etapa.tipo === "erro" ? "Tentar de novo" : `Baixar${novidade.tamanho_bytes ? ` (${Math.round(novidade.tamanho_bytes / 1_048_576)} MB)` : ""}`}</Button>}
        {!novidade.instalador && novidade.pagina && <Button tamanho="pequeno" onClick={() => import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(novidade.pagina!))}>Abrir página da versão</Button>}
        <button onClick={() => setEscondido(true)} aria-label="Fechar aviso de atualização" className="rounded p-1 text-texto-secundario hover:text-texto-primario"><X size={14} /></button>
      </div>
      {etapa.tipo === "baixando" && <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-borda"><div className="h-full bg-primaria transition-[width]" style={{ width: `${etapa.pct}%` }} /></div>}
      {etapa.tipo === "erro" && <p className="mt-1 text-xs text-erro">{etapa.msg}</p>}
      {verNotas && (
        <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-borda bg-cartao p-3 font-sans text-xs text-texto-secundario">{novidade.notas || "Sem notas para esta versão."}</pre>
      )}
    </div>
  );
}
