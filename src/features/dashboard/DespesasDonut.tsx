import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatarCentavos } from "../../services/formato";
import type { FatiaCategoria } from "../../services/agregacoes";

interface DespesasDonutProps {
  fatias: FatiaCategoria[];
  cores: string[];
  mesPorExtenso: string;
}

const pct = (parte: number, total: number) =>
  total > 0 ? `${((parte / total) * 100).toFixed(1).replace(".", ",")}%` : "0,0%";

export function DespesasDonut({ fatias, cores, mesPorExtenso }: DespesasDonutProps) {
  const total = fatias.reduce((s, f) => s + f.valorCentavos, 0);
  const corDe = (i: number) => cores[i % cores.length];

  return (
    <div className="rounded-xl border border-borda bg-cartao p-4">
      <h2 className="text-sm font-semibold text-texto-primario">Despesas por Categoria</h2>
      {fatias.length === 0 ? (
        <p className="mt-6 text-sm text-texto-secundario">Nenhuma despesa lançada {mesPorExtenso} ainda.</p>
      ) : (
        <div className="mt-2 flex items-center gap-4">
          <div className="relative h-44 w-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  {fatias.map((f, i) => (
                    <linearGradient key={f.contaId} id={`fatia-${i}`} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={corDe(i)} stopOpacity={1} />
                      <stop offset="100%" stopColor={corDe(i)} stopOpacity={0.62} />
                    </linearGradient>
                  ))}
                </defs>
                <Pie
                  data={fatias}
                  dataKey="valorCentavos"
                  nameKey="nome"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={fatias.length > 1 ? 3 : 0}
                  cornerRadius={4}
                  stroke="none"
                >
                  {fatias.map((f, i) => (
                    <Cell key={f.contaId} fill={`url(#fatia-${i})`} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(valor) => formatarCentavos(Number(valor))}
                  contentStyle={{ background: "var(--cor-fundo)", border: "1px solid var(--cor-borda)", borderRadius: 8 }}
                  itemStyle={{ color: "var(--cor-texto-primario)" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-sm font-bold tabular-nums text-texto-primario">{formatarCentavos(total)}</span>
              <span className="text-[11px] text-texto-secundario">Total</span>
            </div>
          </div>
          <ul className="min-w-0 flex-1 space-y-2 text-xs">
            {fatias.slice(0, 6).map((f, i) => (
              <li key={f.contaId} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-texto-primario">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: corDe(i) }} />
                  <span className="truncate">{f.nome}</span>
                </span>
                <span className="shrink-0 tabular-nums text-texto-secundario">{pct(f.valorCentavos, total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
