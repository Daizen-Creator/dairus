import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { PIN_TENTATIVAS_LIVRES, useSegurancaStore } from "../../state/seguranca-store";
import { BarraJanela } from "./BarraJanela";

/** Cobre o app com a tela de PIN quando bloqueado e bloqueia após inatividade. */
export function BloqueioTela({ children }: { children: React.ReactNode }) {
  const { pinAtivo, bloqueado, minutosInatividade, falhas, bloqueadoAte, desbloquear, bloquear } = useSegurancaStore();
  const [pin, setPin] = useState("");
  const [agora, setAgora] = useState(() => Date.now());
  const espera = Math.max(0, Math.ceil((bloqueadoAte - agora) / 1000));

  useEffect(() => {
    if (!pinAtivo || bloqueado || minutosInatividade <= 0) return;
    let timer = window.setTimeout(bloquear, minutosInatividade * 60_000);
    const reiniciar = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(bloquear, minutosInatividade * 60_000);
    };
    const eventos = ["mousemove", "keydown", "mousedown", "wheel"] as const;
    eventos.forEach((e) => window.addEventListener(e, reiniciar, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      eventos.forEach((e) => window.removeEventListener(e, reiniciar));
    };
  }, [pinAtivo, bloqueado, minutosInatividade, bloquear]);

  // Ctrl+L bloqueia na hora.
  useEffect(() => {
    if (!pinAtivo) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        bloquear();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [pinAtivo, bloquear]);

  // Relógio da espera (só roda enquanto há espera).
  useEffect(() => {
    if (bloqueadoAte <= Date.now()) return;
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    setAgora(Date.now());
    return () => window.clearInterval(t);
  }, [bloqueadoAte]);

  if (!bloqueado) return <>{children}</>;

  async function entrar(ev: React.FormEvent) {
    ev.preventDefault();
    if (espera > 0 || !pin) return;
    await desbloquear(pin);
    setPin("");
    setAgora(Date.now());
  }
  const restam = PIN_TENTATIVAS_LIVRES - falhas;
  const tempo = espera >= 60 ? `${Math.floor(espera / 60)}min ${String(espera % 60).padStart(2, "0")}s` : `${espera}s`;

  return (
    <div className="flex h-full flex-col bg-fundo">
      <BarraJanela />
      <div className="flex flex-1 items-center justify-center p-6">
      <form
        onSubmit={entrar}
        className="w-full max-w-xs rounded-2xl border border-borda bg-cartao p-6 text-center shadow-[0_20px_60px_-20px_var(--cor-primaria)]"
      >
        <span
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white"
          style={{ backgroundImage: "linear-gradient(135deg, var(--cor-primaria), var(--cor-destaque))" }}
        >
          <Lock size={26} />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-texto-primario">Dairus bloqueado</h1>
        <p className="mt-1 text-sm text-texto-secundario">Digite seu PIN para continuar.</p>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          aria-label="PIN"
          className="mt-4 w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-center text-lg tracking-[0.5em] text-texto-primario outline-none focus:border-primaria"
        />
        {falhas > 0 && espera === 0 && <p className="mt-2 text-xs text-erro">PIN incorreto.{restam > 0 ? ` Restam ${restam} tentativa${restam === 1 ? "" : "s"} antes de uma pausa.` : ""}</p>}
        {espera > 0 && <p className="mt-2 text-xs text-erro">Muitas tentativas erradas. Por segurança, aguarde {tempo}.</p>}
        <button
          type="submit"
          disabled={espera > 0}
          className="mt-4 h-9 w-full rounded-lg bg-gradient-to-r from-primaria to-destaque text-sm font-medium text-primaria-texto disabled:opacity-50"
        >
          Desbloquear
        </button>
      </form>
      </div>
    </div>
  );
}
