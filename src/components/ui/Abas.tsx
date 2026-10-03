import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";

export interface DefinicaoAba<T extends string> {
  id: T;
  rotulo: string;
  icone?: LucideIcon;
  /** Número pequeno ao lado do rótulo (ex.: itens pendentes). */
  contador?: number;
}

/** Aba ativa de uma página, lembrada durante a sessão (volta na mesma aba ao navegar). */
export function useAbaDaPagina<T extends string>(chave: string, padrao: T): [T, (aba: T) => void] {
  const [aba, setAba] = useState<T>(() => {
    try {
      return (sessionStorage.getItem(`aba:${chave}`) as T | null) ?? padrao;
    } catch {
      return padrao;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(`aba:${chave}`, aba);
    } catch {
      // sem sessionStorage: só não lembra a aba
    }
  }, [chave, aba]);
  return [aba, setAba];
}

interface AbasProps<T extends string> {
  abas: Array<DefinicaoAba<T>>;
  ativa: T;
  onChange: (aba: T) => void;
}

/** Barra de abas internas da página. Fica grudada no topo ao rolar. */
export function Abas<T extends string>({ abas, ativa, onChange }: AbasProps<T>) {
  return (
    <div className="sem-impressao sticky top-0 z-20 -mx-3 bg-fundo/85 px-3 py-2 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6 backdrop-blur-md">
      <div role="tablist" className="flex flex-wrap gap-1.5 rounded-xl border border-borda bg-cartao p-1.5">
        {abas.map((a) => {
          const selecionada = a.id === ativa;
          const Icone = a.icone;
          return (
            <button
              key={a.id}
              role="tab"
              aria-selected={selecionada}
              onClick={() => onChange(a.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-150 ${
                selecionada
                  ? "bg-gradient-to-r from-primaria to-destaque text-primaria-texto shadow-[0_4px_16px_-6px_var(--cor-primaria)]"
                  : "text-texto-secundario hover:bg-borda/40 hover:text-texto-primario"
              }`}
            >
              {Icone && <Icone size={15} />}
              {a.rotulo}
              {a.contador !== undefined && a.contador > 0 && (
                <span className={`rounded-full px-1.5 text-[11px] leading-5 ${selecionada ? "bg-white/25" : "bg-erro/20 text-erro"}`}>{a.contador}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
