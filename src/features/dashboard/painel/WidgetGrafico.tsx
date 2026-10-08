import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, ChartLine, ChartPie, Hash, Table2, TrendingDown, TrendingUp } from "lucide-react";
import { useThemeStore } from "../../../state/theme-store";
import { Cartao } from "../WidgetsExtras";
import { divisaoDoGrafico, kpiDoGrafico, normalizarConfigGrafico, PERIODOS, serieDoGrafico, tituloDoGrafico, type ConfigGrafico, type Exibicao } from "../graficoDados";
import { useDadosPainel, useInstancia } from "./contexto";

// Paleta categórica validada (8 cores, ordem fixa; "Outras" em cinza neutro).
const CATEGORICA_CLARA = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const CATEGORICA_ESCURA = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const CINZA_OUTRAS = "#8a94a6";

const EXIBICOES: Array<{ v: Exibicao; r: string; icone: typeof Hash }> = [
  { v: "barras", r: "Barras", icone: BarChart3 },
  { v: "linha", r: "Linha", icone: ChartLine },
  { v: "rosca", r: "Rosca", icone: ChartPie },
  { v: "tabela", r: "Tabela", icone: Table2 },
  { v: "kpi", r: "Número", icone: Hash },
];

/** Tema escuro? (decide a coluna da paleta categórica). */
function useEscuro(): boolean {
  const fundo = useThemeStore((s) => s.temaAtivo().cores.fundo);
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(fundo ?? "");
  if (!m) return true;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

const estiloTooltip = { background: "var(--cor-superficie)", border: "1px solid var(--cor-borda)", borderRadius: 8, fontSize: 12, color: "var(--cor-texto-primario)" };
const eixo = { fontSize: 10, fill: "var(--cor-texto-secundario)" };

/** Valores compactos no eixo: 1,2 mil / 3,4 mi. */
function compacto(centavos: number): string {
  const v = centavos / 100;
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** Widget "Gráfico personalizável": métrica, período, granularidade e jeito de mostrar escolhidos pelo usuário. */
export function WidgetGrafico() {
  const { contas, lancamentos, hoje, dinheiro } = useDadosPainel();
  const inst = useInstancia();
  const cfg = normalizarConfigGrafico(inst?.config.grafico);
  const escuro = useEscuro();
  const paleta = escuro ? CATEGORICA_ESCURA : CATEGORICA_CLARA;

  const alterar = (parte: Partial<ConfigGrafico>) => inst?.configurar({ ...inst.config, grafico: { ...cfg, ...parte } });

  const serie = useMemo(() => (cfg.exibicao === "linha" || cfg.exibicao === "barras" ? serieDoGrafico(lancamentos, contas, cfg, hoje) : []), [lancamentos, contas, cfg.metrica, cfg.periodo, cfg.granularidade, cfg.exibicao, cfg.categoriaId, hoje]); // eslint-disable-line react-hooks/exhaustive-deps
  const fatias = useMemo(() => (cfg.exibicao === "rosca" || cfg.exibicao === "tabela" ? divisaoDoGrafico(lancamentos, contas, cfg, hoje) : []), [lancamentos, contas, cfg.metrica, cfg.periodo, cfg.exibicao, cfg.categoriaId, hoje]); // eslint-disable-line react-hooks/exhaustive-deps
  const kpi = useMemo(() => (cfg.exibicao === "kpi" ? kpiDoGrafico(lancamentos, contas, cfg, hoje) : null), [lancamentos, contas, cfg.metrica, cfg.periodo, cfg.exibicao, cfg.categoriaId, hoje]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalFatias = fatias.reduce((s, f) => s + f.valor, 0);
  const vazio = (cfg.exibicao === "linha" || cfg.exibicao === "barras") ? serie.every((p) => p.valor === 0) : cfg.exibicao === "kpi" ? false : fatias.length === 0;
  // Para despesas, subir é ruim; para receitas, resultado e saldo, subir é bom.
  const subirEhBom = cfg.metrica !== "despesas" && cfg.metrica !== "categoria";

  const controles = (
    <span className="nao-arrastar flex items-center gap-1">
      <select value={cfg.periodo} onChange={(e) => alterar({ periodo: e.target.value as ConfigGrafico["periodo"] })} aria-label="Período" className="rounded border border-borda bg-fundo px-1 py-0.5 text-[10px] text-texto-secundario">
        {PERIODOS.map((p) => <option key={p.v} value={p.v}>{p.r}</option>)}
      </select>
      <span role="radiogroup" aria-label="Tipo de exibição" className="flex rounded border border-borda">
        {EXIBICOES.map((e) => (
          <button key={e.v} type="button" role="radio" aria-checked={cfg.exibicao === e.v} aria-label={e.r} title={e.r} onClick={() => alterar({ exibicao: e.v })} className={`p-0.5 ${cfg.exibicao === e.v ? "bg-primaria text-white" : "text-texto-secundario hover:text-texto-primario"}`}>
            <e.icone size={11} />
          </button>
        ))}
      </span>
    </span>
  );

  return (
    <Cartao titulo={tituloDoGrafico(cfg, contas)} icone={cfg.exibicao === "rosca" ? ChartPie : cfg.exibicao === "linha" ? ChartLine : BarChart3} extra={controles}>
      {vazio ? (
        <p className="flex h-full items-center justify-center text-xs text-texto-secundario">Sem movimento nesse período.</p>
      ) : cfg.exibicao === "kpi" && kpi ? (
        <div className="flex h-full flex-col justify-center">
          <p className={`text-3xl font-bold tabular-nums ${kpi.atual < 0 ? "text-erro" : "text-texto-primario"}`}>{dinheiro(kpi.atual)}</p>
          {kpi.variacao !== null && (
            <p className="mt-1 flex items-center gap-1 text-xs text-texto-secundario">
              {kpi.variacao >= 0 ? <TrendingUp size={13} className={subirEhBom ? "text-sucesso" : "text-erro"} /> : <TrendingDown size={13} className={subirEhBom ? "text-erro" : "text-sucesso"} />}
              <span className="font-semibold text-texto-primario">{kpi.variacao >= 0 ? "+" : ""}{(kpi.variacao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%</span>
              em relação ao período anterior ({dinheiro(kpi.anterior)})
            </p>
          )}
        </div>
      ) : cfg.exibicao === "tabela" ? (
        <table className="w-full text-xs">
          <thead><tr className="text-left text-texto-secundario"><th className="py-1 font-medium">{cfg.metrica === "saldo" ? "Conta" : "Categoria"}</th><th className="py-1 text-right font-medium">Valor</th><th className="py-1 text-right font-medium">%</th></tr></thead>
          <tbody>
            {fatias.map((f) => (
              <tr key={f.nome} className="border-t border-borda/60"><td className="py-1 text-texto-primario">{f.nome}</td><td className="py-1 text-right tabular-nums text-texto-primario">{dinheiro(f.valor)}</td><td className="py-1 text-right tabular-nums text-texto-secundario">{totalFatias ? Math.round((f.valor / totalFatias) * 100) : 0}%</td></tr>
            ))}
            <tr className="border-t border-borda font-semibold"><td className="py-1">Total</td><td className="py-1 text-right tabular-nums">{dinheiro(totalFatias)}</td><td /></tr>
          </tbody>
        </table>
      ) : cfg.exibicao === "rosca" ? (
        <div className="flex h-full min-h-0 items-center gap-3">
          <div className="h-full min-h-[120px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={fatias} dataKey="valor" nameKey="nome" innerRadius="58%" outerRadius="92%" paddingAngle={1} stroke="var(--cor-cartao)" strokeWidth={2} isAnimationActive={false}>
                  {fatias.map((f, i) => <Cell key={f.nome} fill={f.outras ? CINZA_OUTRAS : paleta[i % paleta.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => dinheiro(Number(v))} contentStyle={estiloTooltip} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="max-h-full w-[45%] space-y-1 overflow-auto text-[11px]">
            {fatias.map((f, i) => (
              <li key={f.nome} className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: f.outras ? CINZA_OUTRAS : paleta[i % paleta.length] }} />
                <span className="min-w-0 flex-1 truncate text-texto-primario">{f.nome}</span>
                <span className="tabular-nums text-texto-secundario">{totalFatias ? Math.round((f.valor / totalFatias) * 100) : 0}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="h-full min-h-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            {cfg.exibicao === "linha" ? (
              <LineChart data={serie} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--cor-borda)" strokeDasharray="3 3" />
                <XAxis dataKey="rotulo" tick={eixo} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
                <YAxis tickFormatter={compacto} tick={eixo} tickLine={false} axisLine={false} width={42} />
                <Tooltip formatter={(v) => [dinheiro(Number(v)), tituloDoGrafico(cfg, contas).split(" · ")[0]]} contentStyle={estiloTooltip} cursor={{ stroke: "var(--cor-borda)" }} />
                <Line type="monotone" dataKey="valor" stroke="var(--cor-primaria)" strokeWidth={2} dot={serie.length <= 12 ? { r: 3, fill: "var(--cor-primaria)", stroke: "var(--cor-cartao)", strokeWidth: 2 } : false} activeDot={{ r: 5 }} isAnimationActive={false} />
              </LineChart>
            ) : (
              <BarChart data={serie} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--cor-borda)" strokeDasharray="3 3" />
                <XAxis dataKey="rotulo" tick={eixo} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
                <YAxis tickFormatter={compacto} tick={eixo} tickLine={false} axisLine={false} width={42} />
                <Tooltip formatter={(v) => [dinheiro(Number(v)), tituloDoGrafico(cfg, contas).split(" · ")[0]]} contentStyle={estiloTooltip} cursor={{ fill: "var(--cor-borda)", opacity: 0.35 }} />
                <Bar dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
                  {serie.map((p, i) => <Cell key={i} fill={p.valor < 0 ? "var(--cor-erro)" : "var(--cor-primaria)"} />)}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </Cartao>
  );
}
