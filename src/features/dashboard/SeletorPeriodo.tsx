import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { formatarDataISOParaBR, primeiroDiaDoMesISO, ultimoDiaDoMesISO } from "../../services/formato";

export type IdPeriodo = "este-mes" | "mes-passado" | "90-dias" | "este-ano";

export interface Periodo {
  id: IdPeriodo;
  rotulo: string;
  inicio: string;
  fim: string;
}

const OPCOES: Array<{ id: IdPeriodo; rotulo: string }> = [
  { id: "este-mes", rotulo: "Este mês" },
  { id: "mes-passado", rotulo: "Mês passado" },
  { id: "90-dias", rotulo: "Últimos 90 dias" },
  { id: "este-ano", rotulo: "Este ano" },
];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function calcularPeriodo(id: IdPeriodo, hojeISO: string): Periodo {
  const rotulo = OPCOES.find((o) => o.id === id)!.rotulo;
  const [ano, mes, dia] = hojeISO.split("-").map(Number);
  switch (id) {
    case "este-mes":
      return { id, rotulo, inicio: primeiroDiaDoMesISO(hojeISO), fim: ultimoDiaDoMesISO(hojeISO) };
    case "mes-passado": {
      const ref = iso(new Date(ano, mes - 2, 1));
      return { id, rotulo, inicio: primeiroDiaDoMesISO(ref), fim: ultimoDiaDoMesISO(ref) };
    }
    case "90-dias":
      return { id, rotulo, inicio: iso(new Date(ano, mes - 1, dia - 89)), fim: hojeISO };
    case "este-ano":
      return { id, rotulo, inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
  }
}

interface SeletorPeriodoProps {
  periodo: Periodo;
  hoje: string;
  onChange: (periodo: Periodo) => void;
}

/** Controle único: calendário + intervalo de datas + divisor + rótulo do período com menu. */
export function SeletorPeriodo({ periodo, hoje, onChange }: SeletorPeriodoProps) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-3 rounded-xl border border-borda bg-cartao px-3.5 py-2 text-sm text-texto-primario shadow-[0_6px_20px_-14px_var(--cor-primaria)] transition-[border-color,transform] duration-150 [transition-timing-function:var(--ease-out)] hover:border-primaria/60 active:scale-[0.98]"
      >
        <CalendarDays size={16} className="text-secundaria" />
        <span className="tabular-nums text-texto-secundario">
          {formatarDataISOParaBR(periodo.inicio)} – {formatarDataISOParaBR(periodo.fim)}
        </span>
        <span className="h-5 w-px bg-borda" aria-hidden />
        <span className="flex items-center gap-1 font-semibold">
          {periodo.rotulo}
          <ChevronDown size={14} className={`transition-transform ${aberto ? "rotate-180" : ""}`} />
        </span>
      </button>

      {aberto && (
        <ul
          role="listbox"
          aria-label="Período"
          className="absolute right-0 z-40 mt-2 w-52 overflow-hidden rounded-xl border border-borda bg-superficie p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,.7)]"
        >
          {OPCOES.map((o) => (
            <li key={o.id} role="option" aria-selected={o.id === periodo.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(calcularPeriodo(o.id, hoje));
                  setAberto(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-borda/50 ${
                  o.id === periodo.id ? "font-semibold text-primaria" : "text-texto-primario"
                }`}
              >
                {o.rotulo}
                {o.id === periodo.id && <Check size={14} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
