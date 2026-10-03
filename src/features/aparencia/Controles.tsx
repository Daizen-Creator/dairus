import { useEffect, useId, useState } from "react";
import { hexParaRgb, rgbParaHex } from "./aparencia";

/** Linha de configuração: rótulo à esquerda, controle à direita (empilha em tela estreita). */
export function Linha({ rotulo, ajuda, children }: { rotulo: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-texto-primario">{rotulo}</p>
        {ajuda && <p className="text-xs text-texto-secundario">{ajuda}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Faixa({ rotulo, valor, min, max, passo = 1, formato, onChange, ajuda }: { rotulo: string; valor: number; min: number; max: number; passo?: number; formato?: (v: number) => string; onChange: (v: number) => void; ajuda?: string }) {
  const id = useId();
  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <label htmlFor={id} className="text-texto-primario">{rotulo}</label>
        <span className="tabular-nums text-xs text-texto-secundario">{formato ? formato(valor) : valor}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={passo} value={valor} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[var(--cor-primaria)]" />
      {ajuda && <p className="text-xs text-texto-secundario">{ajuda}</p>}
    </div>
  );
}

export function Alternar({ rotulo, ajuda, ligado, onChange }: { rotulo: string; ajuda?: string; ligado: boolean; onChange: (v: boolean) => void }) {
  return (
    <Linha rotulo={rotulo} ajuda={ajuda}>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={rotulo}
        onClick={() => onChange(!ligado)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${ligado ? "bg-primaria" : "bg-borda"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${ligado ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </Linha>
  );
}

/** Botões de opção única (segmentado). */
export function Opcoes<T extends string | number>({ valor, opcoes, onChange, rotulo }: { valor: T; opcoes: Array<{ valor: T; rotulo: string; icone?: React.ReactNode }>; onChange: (v: T) => void; rotulo: string }) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-1 rounded-lg border border-borda bg-fundo p-1">
      {opcoes.map((o) => (
        <button
          key={String(o.valor)}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${valor === o.valor ? "bg-primaria text-primaria-texto" : "text-texto-secundario hover:text-texto-primario"}`}
        >
          {o.icone}
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

/** Seletor de cor: amostra nativa + código Hex editável + RGB. */
export function SeletorCor({ valor, onChange, rotulo, sugestoes = [] }: { valor: string; onChange: (cor: string) => void; rotulo: string; sugestoes?: string[] }) {
  const [hex, setHex] = useState(valor);
  useEffect(() => setHex(valor), [valor]);
  const [r, g, b] = hexParaRgb(/^#[0-9a-f]{6}$/i.test(valor) ? valor : "#000000");
  const confirmar = (texto: string) => {
    const t = texto.trim().startsWith("#") ? texto.trim() : `#${texto.trim()}`;
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) onChange(t.length === 4 ? rgbParaHex(hexParaRgb(t)) : t.toLowerCase());
    else setHex(valor);
  };
  const rgb = (i: number, v: string) => {
    const c: [number, number, number] = [r, g, b];
    c[i] = Math.max(0, Math.min(255, Number(v) || 0));
    onChange(rgbParaHex(c));
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(valor) ? valor : "#000000"} onChange={(e) => onChange(e.target.value)} aria-label={rotulo} className="h-8 w-10 cursor-pointer rounded border border-borda bg-transparent" />
      <input value={hex} onChange={(e) => setHex(e.target.value)} onBlur={() => confirmar(hex)} onKeyDown={(e) => e.key === "Enter" && confirmar(hex)} aria-label={`${rotulo} (Hex)`} maxLength={7} className="w-20 rounded-lg border border-borda bg-fundo px-2 py-1 font-mono text-xs uppercase text-texto-primario outline-none focus:border-primaria" />
      <span className="flex items-center gap-0.5 text-[10px] text-texto-secundario">
        {(["R", "G", "B"] as const).map((n, i) => (
          <label key={n} className="flex items-center gap-0.5">
            {n}
            <input type="number" min={0} max={255} value={[r, g, b][i]} onChange={(e) => rgb(i, e.target.value)} aria-label={`${rotulo} ${n}`} className="w-14 rounded border border-borda bg-fundo px-1 py-0.5 text-xs tabular-nums text-texto-primario" />
          </label>
        ))}
      </span>
      {sugestoes.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {sugestoes.map((c) => (
            <button key={c} type="button" onClick={() => onChange(c)} aria-label={`Usar ${c}`} title={c} className="h-5 w-5 rounded-full border border-black/20" style={{ background: c, boxShadow: c.toLowerCase() === valor.toLowerCase() ? "0 0 0 2px var(--cor-cartao), 0 0 0 3.5px var(--cor-primaria)" : undefined }} />
          ))}
        </span>
      )}
    </div>
  );
}

export function Bloco({ titulo, descricao, children, acao }: { titulo: string; descricao?: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-borda bg-cartao p-4">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-texto-primario">{titulo}</h2>
          {descricao && <p className="text-xs text-texto-secundario">{descricao}</p>}
        </div>
        {acao}
      </div>
      <div className="divide-y divide-borda/60">{children}</div>
    </section>
  );
}
