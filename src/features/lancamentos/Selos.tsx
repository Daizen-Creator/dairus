import type { LucideIcon } from "lucide-react";
import { CircleCheck, Clock, RotateCcw, TriangleAlert } from "lucide-react";
import type { Etiqueta } from "../../types/accounting";

/** Selo com borda neon: texto e contorno na cor, fundo levemente tingido e brilho suave. */
function SeloNeon({ cor, icone: Icone, children }: { cor: string; icone?: LucideIcon; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none"
      style={{
        color: cor,
        borderColor: `color-mix(in srgb, ${cor} 70%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${cor} 12%, transparent)`,
        boxShadow: `0 0 10px -4px ${cor}, inset 0 0 8px -6px ${cor}`,
      }}
    >
      {Icone && <Icone size={11} strokeWidth={2.4} />}
      {children}
    </span>
  );
}

export const ROTULO_ETIQUETA: Record<Etiqueta, string> = {
  MENSALIDADE: "Mensalidade",
  ASSINATURA: "Assinatura",
  FIXO: "Fixo",
};

const COR_ETIQUETA: Record<Etiqueta, string> = {
  MENSALIDADE: "var(--cor-destaque)",
  ASSINATURA: "var(--cor-secundaria)",
  FIXO: "var(--cor-primaria)",
};

export function SeloEtiqueta({ etiqueta }: { etiqueta: Etiqueta | null }) {
  if (!etiqueta) return null;
  return <SeloNeon cor={COR_ETIQUETA[etiqueta]}>{ROTULO_ETIQUETA[etiqueta]}</SeloNeon>;
}

export type StatusPagamento = "PAGO" | "RECEBIDO" | "PENDENTE" | "ATRASADO" | "ESTORNO" | "ESTORNADO";

const CONFIG_STATUS: Record<StatusPagamento, { rotulo: string; cor: string; icone: LucideIcon }> = {
  PAGO: { rotulo: "Pago", cor: "var(--cor-sucesso)", icone: CircleCheck },
  RECEBIDO: { rotulo: "Recebido", cor: "var(--cor-sucesso)", icone: CircleCheck },
  PENDENTE: { rotulo: "Pendente", cor: "var(--cor-alerta)", icone: Clock },
  ATRASADO: { rotulo: "Atrasado", cor: "#ff2d55", icone: TriangleAlert },
  ESTORNO: { rotulo: "Estorno", cor: "var(--cor-secundaria)", icone: RotateCcw },
  ESTORNADO: { rotulo: "Estornado", cor: "var(--cor-texto-secundario)", icone: RotateCcw },
};

export function SeloStatus({ status }: { status: StatusPagamento }) {
  const { rotulo, cor, icone } = CONFIG_STATUS[status];
  return (
    <SeloNeon cor={cor} icone={icone}>
      {rotulo}
    </SeloNeon>
  );
}
