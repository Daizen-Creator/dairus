import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { BlocoIcone, estiloDegrade, type CorCard } from "../../components/ui/StatCard";

export interface ItemStatus {
  titulo: string;
  status: string;
  icone: LucideIcon;
  cor: CorCard;
  /** Cor do texto de status (pode diferir da cor do ícone para refletir o estado real). */
  corStatus: CorCard;
  to: string;
}

/** Faixa de status (Backup / Sincronização / Modo Seguro): bloco de ícone em
 * degradê à esquerda, título e estado coloridos à direita. Os estados são os reais. */
export function StatusRodape({ itens }: { itens: ItemStatus[] }) {
  return (
    <div className="grid grid-cols-1 gap-2.5">
      {itens.map((item) => (
        <Link
          key={item.titulo}
          to={item.to}
          className="flex items-center gap-3 rounded-xl border bg-cartao px-3.5 py-3 transition-[transform,filter] duration-150 [transition-timing-function:var(--ease-out)] hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.98]"
          style={estiloDegrade(item.cor)}
        >
          <BlocoIcone icone={item.icone} cor={item.cor} tamanho={38} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-texto-primario">{item.titulo}</span>
            <span className="block truncate text-xs font-medium" style={{ color: `var(--cor-${item.corStatus})` }}>
              {item.status}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
