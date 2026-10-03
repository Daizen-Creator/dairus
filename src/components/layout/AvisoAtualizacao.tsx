import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Download, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/Button";
import { lerPreferencia } from "../../services/armazenamento";
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
}

export const verificarAtualizacao = () => invoke<Novidade | null>("verificar_atualizacao");
export const EVENTO_VERIFICAR = "dairus:verificar-atualizacao";

/** Faixa "versão nova disponível", com a lista do que mudou e o botão para instalar. */
export function AvisoAtualizacao() {
  const [novidade, setNovidade] = useState<Novidade | null>(null);
  const [verNotas, setVerNotas] = useState(false);
  const [instalando, setInstalando] = useState(false);

  const verificar = useCallback(async (manual: boolean) => {
    if (!estaNoTauri()) return;
    if (!manual && (await lerPreferencia<boolean>("atualizacao_auto")) === false) return;
    try {
      const n = await verificarAtualizacao();
      setNovidade(n);
      if (n && !manual) {
        const avisada = await lerPreferencia<string>("atualizacao_avisada");
        if (avisada !== n.versao) {
          await notificar(`Dairus ${n.versao} disponível`, "Abra o Dairus para ver o que mudou e atualizar.");
          const { salvarPreferencia } = await import("../../services/armazenamento");
          await salvarPreferencia("atualizacao_avisada", n.versao);
        }
      }
      if (manual) toast.success(n ? `Versão ${n.versao} disponível.` : "Você já está na versão mais nova.");
    } catch (e) {
      if (manual) toast.error(String(e));
    }
  }, []);

  useEffect(() => {
    const primeiro = window.setTimeout(() => verificar(false), 15_000);
    const id = window.setInterval(() => verificar(false), 6 * 60 * 60_000);
    const manual = () => verificar(true);
    window.addEventListener(EVENTO_VERIFICAR, manual);
    return () => {
      window.clearTimeout(primeiro);
      window.clearInterval(id);
      window.removeEventListener(EVENTO_VERIFICAR, manual);
    };
  }, [verificar]);

  if (!novidade) return null;

  async function instalar() {
    if (!novidade?.instalador) return;
    try {
      setInstalando(true);
      toast.info("Baixando a atualização… o Dairus fecha e abre o instalador quando terminar.");
      await invoke("instalar_atualizacao", { url: novidade.instalador });
    } catch (e) {
      toast.error(String(e));
      setInstalando(false);
    }
  }

  return (
    <div className="border-b border-primaria/40 bg-primaria/10 px-4 py-2 text-sm text-texto-primario">
      <div className="flex flex-wrap items-center gap-3">
        <Sparkles size={16} className="text-primaria" />
        <span className="flex-1">
          <strong>Dairus {novidade.versao}</strong> está disponível (você usa a {novidade.versao_atual}).
        </span>
        <Button tamanho="pequeno" variante="fantasma" onClick={() => setVerNotas(!verNotas)}>{verNotas ? "Esconder" : "O que mudou"}</Button>
        {novidade.instalador ? (
          <Button tamanho="pequeno" disabled={instalando} onClick={instalar}>
            <Download size={13} /> {instalando ? "Baixando…" : `Atualizar agora${novidade.tamanho_bytes ? ` (${Math.round(novidade.tamanho_bytes / 1_048_576)} MB)` : ""}`}
          </Button>
        ) : (
          novidade.pagina && (
            <Button tamanho="pequeno" onClick={() => import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(novidade.pagina!))}>Abrir página da versão</Button>
          )
        )}
        <button onClick={() => setNovidade(null)} aria-label="Fechar aviso de atualização" className="rounded p-1 text-texto-secundario hover:text-texto-primario"><X size={14} /></button>
      </div>
      {verNotas && (
        <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-borda bg-cartao p-3 font-sans text-xs text-texto-secundario">{novidade.notas || "Sem notas para esta versão."}</pre>
      )}
    </div>
  );
}
