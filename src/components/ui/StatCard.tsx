import type { LucideIcon } from "lucide-react";
import { brilhoDeCor, degradeDeCor } from "../../services/gradientes";

export type CorCard = "primaria" | "secundaria" | "sucesso" | "erro" | "destaque" | "alerta";

interface StatCardProps {
  titulo: string;
  valor: string;
  corValor?: "normal" | "sucesso" | "erro";
  subtitulo?: string;
  icone?: LucideIcon;
  corIcone?: CorCard;
}

const CORES_VALOR: Record<NonNullable<StatCardProps["corValor"]>, string> = {
  normal: "text-texto-primario",
  sucesso: "text-sucesso",
  erro: "text-erro",
};

const COR_TEXTO_ICONE: Record<CorCard, string> = {
  primaria: "text-primaria-texto",
  secundaria: "text-secundaria-texto",
  sucesso: "text-white",
  erro: "text-white",
  destaque: "text-white",
  alerta: "text-white",
};

/** Fundo em degradê na cor do card + borda tingida (visual "neon" do design). */
export function estiloDegrade(cor: CorCard): React.CSSProperties {
  const v = `var(--cor-${cor})`;
  return {
    backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${v} 32%, transparent) 0%, color-mix(in srgb, ${v} 8%, transparent) 55%, transparent 100%)`,
    borderColor: `color-mix(in srgb, ${v} 50%, transparent)`,
    boxShadow: `0 8px 28px -14px ${v}`,
  };
}

export function BlocoIcone({ icone: Icone, cor, tamanho = 36 }: { icone: LucideIcon; cor: CorCard; tamanho?: number }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl ${COR_TEXTO_ICONE[cor]}`}
      style={{
        width: tamanho,
        height: tamanho,
        backgroundImage: degradeDeCor(`var(--cor-${cor})`),
        boxShadow: brilhoDeCor(`var(--cor-${cor})`, 0.7),
      }}
    >
      <Icone size={Math.round(tamanho * 0.5)} strokeWidth={2.1} />
    </span>
  );
}

export function StatCard({ titulo, valor, corValor = "normal", subtitulo, icone, corIcone = "primaria" }: StatCardProps) {
  return (
    <div className="rounded-xl border bg-cartao p-4" style={estiloDegrade(corIcone)}>
      <div className="flex items-center gap-3">
        {icone && <BlocoIcone icone={icone} cor={corIcone} />}
        <span className="min-w-0 truncate text-sm font-medium text-texto-secundario">{titulo}</span>
      </div>
      <p className={`mt-3 text-2xl font-bold tabular-nums ${CORES_VALOR[corValor]}`}>{valor}</p>
      {subtitulo && <p className="mt-1 truncate text-xs text-texto-secundario">{subtitulo}</p>}
    </div>
  );
}
