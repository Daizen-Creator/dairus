import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";

const janela = getCurrentWindow();

/** Barra mínima da janela (arrastar, minimizar, maximizar, fechar) para as telas fora do app
 * principal — login, preparação da conta e PIN — já que a janela não tem moldura do Windows. */
export function BarraJanela() {
  const [maximizada, setMaximizada] = useState(false);

  useEffect(() => {
    janela.isMaximized().then(setMaximizada).catch(() => {});
    const desinscrever = janela.onResized(() => {
      janela.isMaximized().then(setMaximizada).catch(() => {});
    });
    return () => {
      desinscrever.then((f) => f()).catch(() => {});
    };
  }, []);

  async function arrastar(evento: React.MouseEvent) {
    if (evento.buttons !== 1 || (evento.target as HTMLElement).closest("button")) return;
    if (evento.detail === 2) {
      await janela.toggleMaximize();
      return;
    }
    await janela.startDragging();
  }

  const botao = "flex h-full w-11 items-center justify-center text-texto-secundario transition-colors";

  return (
    <div data-tauri-drag-region onMouseDown={arrastar} className="relative z-30 flex h-9 shrink-0 select-none items-center justify-between">
      <span className="pointer-events-none flex items-center gap-2 pl-3 text-xs text-texto-secundario">
        <img src="/dairus.svg" alt="" width={16} height={16} className="h-4 w-4" draggable={false} />
        Dairus
      </span>
      <div className="flex h-full">
        <button type="button" aria-label="Minimizar" onClick={() => janela.minimize()} className={`${botao} hover:bg-borda/60`}>
          <Minus size={14} />
        </button>
        <button type="button" aria-label={maximizada ? "Restaurar" : "Maximizar"} onClick={() => janela.toggleMaximize()} className={`${botao} hover:bg-borda/60`}>
          <Square size={11} />
        </button>
        <button type="button" aria-label="Fechar" onClick={() => janela.close()} className={`${botao} hover:bg-erro hover:text-white`}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
