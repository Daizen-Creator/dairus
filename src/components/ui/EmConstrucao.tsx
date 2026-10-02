import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";

interface EmConstrucaoProps {
  titulo: string;
  icone: LucideIcon;
  planejado: string[];
}

/** Página honesta para módulos do escopo que ainda não foram construídos.
 * Aparece na navegação (para bater com o design completo), mas nunca finge
 * ter dados ou funcionalidade que não existe de verdade. */
export function EmConstrucao({ titulo, icone: Icone, planejado }: EmConstrucaoProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-borda bg-superficie px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primaria/10 text-primaria">
        <Icone size={28} strokeWidth={1.75} />
      </div>
      <div>
        <h1 className="text-lg font-semibold text-texto-primario">{titulo}</h1>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-texto-secundario">
          <Construction size={14} /> Ainda não implementado
        </p>
      </div>
      <ul className="mt-2 max-w-sm space-y-1.5 text-left text-sm text-texto-secundario">
        {planejado.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-texto-secundario" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
