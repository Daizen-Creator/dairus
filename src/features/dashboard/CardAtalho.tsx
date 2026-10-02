import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { BlocoIcone, estiloDegrade, type CorCard } from "../../components/ui/StatCard";

interface CardAtalhoProps {
  to: string;
  titulo: string;
  valor: string;
  subtitulo: ReactNode;
  icone: LucideIcon;
  cor: CorCard;
}

/** Card clicável do Dashboard (Contas a Pagar, Receber, Limite, Metas):
 * degradê na cor, bloco de ícone sólido e setinha, como no design. */
export function CardAtalho({ to, titulo, valor, subtitulo, icone, cor }: CardAtalhoProps) {
  return (
    <Link
      to={to}
      className="group block rounded-xl border bg-cartao p-4 transition-[transform,filter] duration-150 [transition-timing-function:var(--ease-out)] hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.98]"
      style={estiloDegrade(cor)}
    >
      <div className="flex items-center gap-3">
        <BlocoIcone icone={icone} cor={cor} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-texto-primario">{titulo}</span>
        <ChevronRight size={16} className="shrink-0 text-texto-secundario transition-transform group-hover:translate-x-0.5" />
      </div>
      <p className="mt-3 text-xl font-bold tabular-nums text-texto-primario">{valor}</p>
      <p className="mt-0.5 text-xs text-texto-secundario">{subtitulo}</p>
    </Link>
  );
}
