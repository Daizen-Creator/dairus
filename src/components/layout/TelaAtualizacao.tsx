import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "../ui/Button";
import { formatarMB, porcentagem, velocidadeERestante } from "./atualizacaoUtil";

export type EtapaTela =
  | { tipo: "verificando" }
  | { tipo: "baixando"; baixados: number; total: number; inicio: number }
  | { tipo: "conferindo" }
  | { tipo: "backup" }
  | { tipo: "instalando" }
  | { tipo: "reiniciando" }
  | { tipo: "erro"; msg: string };

const PASSOS: Array<{ tipo: Exclude<EtapaTela["tipo"], "erro">; rotulo: string }> = [
  { tipo: "verificando", rotulo: "Verificando" },
  { tipo: "baixando", rotulo: "Baixando" },
  { tipo: "conferindo", rotulo: "Conferindo" },
  { tipo: "backup", rotulo: "Backup" },
  { tipo: "instalando", rotulo: "Instalando" },
  { tipo: "reiniciando", rotulo: "Reiniciando" },
];

const TITULO: Record<EtapaTela["tipo"], string> = {
  verificando: "Procurando atualização…",
  baixando: "Baixando atualização…",
  conferindo: "Conferindo o arquivo…",
  backup: "Guardando seus dados…",
  instalando: "Instalando…",
  reiniciando: "Reiniciando o Dairus…",
  erro: "A atualização não foi concluída",
};

const DESCRICAO: Record<Exclude<EtapaTela["tipo"], "erro" | "baixando">, string> = {
  verificando: "Consultando a versão mais nova publicada.",
  conferindo: "Verificando o tamanho e a assinatura SHA-256 do instalador.",
  backup: "Fazendo um backup do banco antes de atualizar.",
  instalando: "O instalador vai abrir e fechar o Dairus. Não desligue o computador.",
  reiniciando: "O Dairus vai abrir sozinho na versão nova em alguns segundos.",
};

interface Props {
  versao: string | null;
  versaoAtual: string | null;
  etapa: EtapaTela;
  /** Só durante o download: continua em segundo plano e instala depois. */
  onDepois?: () => void;
  onTentarDeNovo: () => void;
  onFechar: () => void;
  onBaixarManual?: () => void;
}

/** Tela de atualização: cobre o app inteiro (bloqueia cliques e teclado) enquanto atualiza. */
export function TelaAtualizacao({ versao, versaoAtual, etapa, onDepois, onTentarDeNovo, onFechar, onBaixarManual }: Props) {
  const cartao = useRef<HTMLDivElement>(null);

  // Bloqueia o resto do app: nada atrás da tela recebe clique, foco ou tecla.
  useEffect(() => {
    const raiz = document.getElementById("root");
    raiz?.setAttribute("inert", "");
    cartao.current?.focus();
    return () => raiz?.removeAttribute("inert");
  }, []);

  const arrastar = (e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().startDragging()).catch(() => {});
  };

  const erro = etapa.tipo === "erro";
  const indice = erro ? -1 : PASSOS.findIndex((p) => p.tipo === etapa.tipo);
  const pct = etapa.tipo === "baixando" ? porcentagem(etapa.baixados, etapa.total) : etapa.tipo === "verificando" ? 0 : 100;
  const indeterminado = etapa.tipo === "verificando" || (etapa.tipo === "baixando" && etapa.total <= 0) || etapa.tipo === "backup" || etapa.tipo === "instalando" || etapa.tipo === "reiniciando";

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="titulo-atualizacao" onMouseDown={arrastar} className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div ref={cartao} tabIndex={-1} className="w-full max-w-lg rounded-2xl border border-borda bg-cartao p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,.8)] outline-none">
        <div className="flex items-center gap-3">
          <img src="/dairus.svg" alt="" width={44} height={44} className="h-11 w-11 drop-shadow-[0_8px_20px_rgba(22,119,255,.5)]" draggable={false} />
          <div className="min-w-0">
            <h2 id="titulo-atualizacao" className="text-base font-semibold text-texto-primario">{TITULO[etapa.tipo]}</h2>
            {versao && <p className="text-xs text-texto-secundario">Dairus {versaoAtual ? `${versaoAtual} → ` : ""}<strong className="text-texto-primario">{versao}</strong></p>}
          </div>
        </div>

        {!erro && (
          <>
            <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-borda" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={indeterminado ? undefined : pct} aria-label="Progresso da atualização">
              {indeterminado ? (
                <div className="h-full w-1/3 animate-[deslizar_1.2s_ease-in-out_infinite] rounded-full bg-primaria" />
              ) : (
                <div className="h-full rounded-full bg-primaria transition-[width] duration-300" style={{ width: `${pct}%` }} />
              )}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-texto-secundario" aria-live="polite">
              {etapa.tipo === "baixando" ? (
                <>
                  <span className="tabular-nums">{etapa.total > 0 ? `${formatarMB(etapa.baixados)} / ${formatarMB(etapa.total)}` : formatarMB(etapa.baixados)}</span>
                  <span className="tabular-nums">{velocidadeERestante(etapa.baixados, etapa.total, Date.now() - etapa.inicio)}</span>
                  {etapa.total > 0 && <span className="font-semibold tabular-nums text-texto-primario">{pct}%</span>}
                </>
              ) : (
                <span>{DESCRICAO[etapa.tipo]}</span>
              )}
            </div>
            <ol className="mt-5 grid grid-cols-6 gap-1 text-center text-[10px]">
              {PASSOS.map((p, i) => (
                <li key={p.tipo} className={i < indice ? "text-sucesso" : i === indice ? "font-semibold text-primaria" : "text-texto-secundario/60"}>
                  <span className={`mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full border ${i < indice ? "border-sucesso bg-sucesso/15" : i === indice ? "border-primaria bg-primaria/15" : "border-borda"}`}>
                    {i < indice ? <Check size={11} /> : i === indice ? <Loader2 size={11} className="animate-spin" /> : null}
                  </span>
                  {p.rotulo}
                </li>
              ))}
            </ol>
            {onDepois && etapa.tipo === "baixando" && (
              <div className="mt-5 flex justify-end">
                <Button tamanho="pequeno" variante="fantasma" onClick={onDepois}>Continuar usando e instalar depois</Button>
              </div>
            )}
          </>
        )}

        {erro && (
          <>
            <div className="mt-4 flex gap-2 rounded-lg border border-erro/50 bg-erro/10 p-3 text-sm text-texto-primario" role="alert">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-erro" />
              <span>{etapa.msg}</span>
            </div>
            <p className="mt-3 text-xs text-texto-secundario">Seus dados não foram alterados e o Dairus continua funcionando na versão atual.</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {onBaixarManual && <Button tamanho="pequeno" variante="fantasma" onClick={onBaixarManual}><ExternalLink size={13} /> Baixar pelo site</Button>}
              <Button tamanho="pequeno" variante="secundaria" onClick={onFechar}>Continuar sem atualizar</Button>
              <Button tamanho="pequeno" onClick={onTentarDeNovo}><RefreshCw size={13} /> Tentar de novo</Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
