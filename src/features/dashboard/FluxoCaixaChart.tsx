import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatarCentavos } from "../../services/formato";

export interface PontoFluxo {
  nome: string;
  Receitas: number;
  Despesas: number;
  Saldo: number;
}

interface FluxoCaixaChartProps {
  dados: PontoFluxo[];
  mesAtual: string;
  anoAtual: number;
}

function TickMes({ x, y, payload, mesAtual }: { x?: number; y?: number; payload?: { value: string }; mesAtual: string }) {
  const atual = payload?.value === mesAtual;
  return (
    <text
      x={x}
      y={(y ?? 0) + 14}
      textAnchor="middle"
      fontSize={11}
      fontWeight={atual ? 700 : 400}
      fill={atual ? "var(--cor-texto-primario)" : "var(--cor-texto-secundario)"}
    >
      {payload?.value}
    </text>
  );
}

interface ItemTooltip {
  name?: string;
  value?: number;
  color?: string;
}

function TooltipFluxo({ active, payload, label, ano }: { active?: boolean; payload?: ItemTooltip[]; label?: string; ano: number }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border border-borda px-3 py-2 text-xs shadow-xl"
      style={{ background: "color-mix(in srgb, var(--cor-fundo) 95%, transparent)", backdropFilter: "blur(14px)" }}
    >
      <p className="mb-1 font-semibold text-texto-primario">
        {label} {ano}
      </p>
      {payload.map((item) => (
        <p key={item.name} className="flex items-center gap-1.5 text-texto-secundario">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
          {item.name}: <span className="tabular-nums text-texto-primario">{formatarCentavos(Math.round((item.value ?? 0) * 100))}</span>
        </p>
      ))}
    </div>
  );
}

export function FluxoCaixaChart({ dados, mesAtual, anoAtual }: FluxoCaixaChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={dados} barGap={3} barCategoryGap="14%" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-receitas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--cor-sucesso)" }} stopOpacity={1} />
            <stop offset="100%" style={{ stopColor: "var(--cor-sucesso)" }} stopOpacity={0.45} />
          </linearGradient>
          <linearGradient id="grad-despesas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--cor-erro)" }} stopOpacity={1} />
            <stop offset="100%" style={{ stopColor: "var(--cor-erro)" }} stopOpacity={0.45} />
          </linearGradient>
          <linearGradient id="grad-saldo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--cor-primaria)" }} stopOpacity={0.35} />
            <stop offset="100%" style={{ stopColor: "var(--cor-primaria)" }} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--cor-borda)" vertical={false} />
        <XAxis dataKey="nome" tick={<TickMes mesAtual={mesAtual} />} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fill: "var(--cor-texto-secundario)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={68}
          tickFormatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`}
        />
        <Tooltip
          cursor={{ fill: "color-mix(in srgb, var(--cor-primaria) 8%, transparent)" }}
          content={<TooltipFluxo ano={anoAtual} />}
        />
        <Bar className="barra-receitas" dataKey="Receitas" fill="url(#grad-receitas)" radius={[6, 6, 0, 0]} maxBarSize={14} />
        <Bar className="barra-despesas" dataKey="Despesas" fill="url(#grad-despesas)" radius={[6, 6, 0, 0]} maxBarSize={14} />
        <Area type="monotone" dataKey="Saldo" stroke="none" fill="url(#grad-saldo)" tooltipType="none" legendType="none" activeDot={false} />
        <Line
          className="barra-saldo"
          type="monotone"
          dataKey="Saldo"
          stroke="var(--cor-primaria)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--cor-texto-primario)", stroke: "var(--cor-primaria)", strokeWidth: 2 }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
