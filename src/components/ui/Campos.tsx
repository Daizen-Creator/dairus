export const CLASSE_INPUT =
  "rounded-lg border border-borda bg-fundo px-3 py-2 text-sm text-texto-primario outline-none focus:border-primaria";

/** Barra de progresso com brilho na cor informada (ex.: "var(--cor-sucesso)"). */
export function BarraProgresso({ percentual, cor, altura = 8 }: { percentual: number; cor: string; altura?: number }) {
  const largura = Math.max(0, Math.min(100, percentual));
  return (
    <div className="w-full overflow-hidden rounded-full bg-borda/60" style={{ height: altura }}>
      <div
        className="h-full rounded-full transition-[width] duration-500 [transition-timing-function:var(--ease-out)]"
        style={{
          width: `${largura}%`,
          backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${cor} 70%, black), ${cor})`,
          boxShadow: `0 0 10px -2px ${cor}`,
        }}
      />
    </div>
  );
}

export function Secao({ titulo, acao, children }: { titulo: React.ReactNode; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-borda bg-cartao">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-texto-primario">{titulo}</h2>
        {acao}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
