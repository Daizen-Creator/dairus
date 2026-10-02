import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Bell, Minus, Moon, Square, Sun, Settings, User, X } from "lucide-react";
import { GlobalSearch } from "./GlobalSearch";
import { useThemeStore } from "../../state/theme-store";

const janela = getCurrentWindow();

export function TitleBar() {
  const [maximizada, setMaximizada] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [notificacoesAbertas, setNotificacoesAbertas] = useState(false);
  const navegar = useNavigate();
  const modoAutomatico = useThemeStore((s) => s.modoAutomatico);
  const alternarModoAutomatico = useThemeStore((s) => s.alternarModoAutomatico);
  const temaAtivo = useThemeStore((s) => s.temaAtivo());

  useEffect(() => {
    janela.isMaximized().then(setMaximizada);
    const desinscrever = janela.onResized(() => {
      janela.isMaximized().then(setMaximizada);
    });
    return () => {
      desinscrever.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBuscaAberta((v) => !v);
      }
      if (e.key === "Escape") {
        setBuscaAberta(false);
        setNotificacoesAbertas(false);
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  async function iniciarArraste(evento: React.MouseEvent) {
    if (evento.buttons !== 1) return;
    if (evento.detail === 2) {
      await janela.toggleMaximize();
      return;
    }
    await janela.startDragging();
  }

  return (
    <header
      data-tauri-drag-region
      onMouseDown={iniciarArraste}
      className="sem-impressao flex shrink-0 select-none items-center justify-between border-b border-borda bg-superficie px-3"
      style={{ height: "var(--altura-barra-titulo)" }}
    >
      <div className="flex shrink-0 items-center gap-2.5">
        <img
          src="/dairus.svg"
          alt=""
          width={32}
          height={32}
          draggable={false}
          className="h-8 w-8 shrink-0"
          style={{ filter: `drop-shadow(0 2px 8px ${temaAtivo.cores.primaria}66)` }}
          aria-hidden
        />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-texto-primario">Dairus</p>
          <p className="truncate text-[11px] text-texto-secundario">Seu futuro financeiro, no seu controle.</p>
        </div>
      </div>

      <div className="flex flex-1 justify-center px-4">
        <button
          type="button"
          onClick={() => setBuscaAberta(true)}
          className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-borda bg-fundo px-3 text-left text-sm text-texto-secundario transition-colors hover:border-primaria/50"
        >
          <span className="flex-1 truncate">Buscar no sistema…</span>
          <kbd className="rounded border border-borda px-1.5 py-0.5 text-[10px] text-texto-secundario">Ctrl+K</kbd>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <div className="relative">
          <button
            type="button"
            aria-label="Notificações"
            onClick={() => setNotificacoesAbertas((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-texto-secundario transition-colors hover:bg-borda/50"
          >
            <Bell size={16} />
          </button>
          {notificacoesAbertas && (
            <div className="absolute right-0 top-10 w-56 rounded-lg border border-borda bg-cartao p-3 text-xs text-texto-secundario shadow-lg">
              Nenhuma notificação por enquanto.
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label={modoAutomatico ? "Desativar tema automático" : "Seguir tema do sistema"}
          title={modoAutomatico ? "Seguindo o tema do sistema" : "Seguir tema do sistema"}
          onClick={() => alternarModoAutomatico(!modoAutomatico)}
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-borda/50 ${modoAutomatico ? "text-primaria" : "text-texto-secundario"}`}
        >
          {temaAtivo.modoBase === "escuro" ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        <button
          type="button"
          aria-label="Configurações"
          onClick={() => navegar("/configuracoes")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-texto-secundario transition-colors hover:bg-borda/50"
        >
          <Settings size={16} />
        </button>
        <div className="mx-1 flex items-center gap-2 border-l border-borda pl-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-borda text-texto-secundario">
            <User size={14} />
          </span>
          <span className="hidden text-xs leading-tight text-texto-secundario sm:block">
            <span className="block font-medium text-texto-primario">Usuário</span>
            Modo local
          </span>
        </div>
      </div>

      <div className="ml-2 flex h-full">
        <button
          type="button"
          aria-label="Minimizar"
          onClick={() => janela.minimize()}
          className="flex h-full w-11 items-center justify-center text-texto-secundario transition-colors hover:bg-borda/60"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          aria-label={maximizada ? "Restaurar" : "Maximizar"}
          onClick={() => janela.toggleMaximize()}
          className="flex h-full w-11 items-center justify-center text-texto-secundario transition-colors hover:bg-borda/60"
        >
          <Square size={11} />
        </button>
        <button
          type="button"
          aria-label="Fechar"
          onClick={() => janela.close()}
          className="flex h-full w-11 items-center justify-center text-texto-secundario transition-colors hover:bg-erro hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      <GlobalSearch open={buscaAberta} onOpenChange={setBuscaAberta} />
    </header>
  );
}
