import { useEffect, useRef, useState } from "react";
import { LogOut, User } from "lucide-react";
import { dadosDoUsuario, useAuthStore } from "../../state/auth-store";
import { usePreferencia } from "../../state/usePreferencia";

/** Avatar + nome da conta Google na barra de título, com opção de sair. */
export function MenuConta() {
  const sessao = useAuthStore((s) => s.sessao);
  const sair = useAuthStore((s) => s.sair);
  const [apelido] = usePreferencia<string>("nome_usuario", "");
  const [aberto, setAberto] = useState(false);
  const [fotoFalhou, setFotoFalhou] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const { nome, email, foto } = dadosDoUsuario(sessao);
  const exibido = apelido || nome.split(" ")[0] || "Usuário";

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAberto(false);
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  return (
    <div ref={raiz} className="relative mx-1 border-l border-borda pl-2">
      <button onClick={() => setAberto((v) => !v)} aria-expanded={aberto} aria-label="Conta" className="flex items-center gap-2 rounded-lg px-1 py-0.5 transition-colors hover:bg-borda/40">
        {foto && !fotoFalhou ? (
          <img src={foto} alt="" width={28} height={28} referrerPolicy="no-referrer" onError={() => setFotoFalhou(true)} className="h-7 w-7 rounded-full" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-borda text-texto-secundario"><User size={14} /></span>
        )}
        <span className="hidden text-left text-xs leading-tight text-texto-secundario sm:block">
          <span className="block max-w-28 truncate font-medium text-texto-primario">{exibido}</span>
          Conta Google
        </span>
      </button>
      {aberto && (
        <div className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-borda bg-superficie p-3 shadow-[0_16px_40px_-12px_rgba(0,0,0,.7)]">
          <p className="truncate text-sm font-semibold text-texto-primario">{nome || exibido}</p>
          <p className="truncate text-xs text-texto-secundario">{email}</p>
          <p className="mt-2 text-[11px] text-texto-secundario">Os dados desta conta ficam separados das outras contas neste computador.</p>
          <button onClick={sair} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-borda py-2 text-sm text-texto-primario transition-colors hover:border-erro hover:text-erro">
            <LogOut size={14} /> Sair da conta
          </button>
        </div>
      )}
    </div>
  );
}
