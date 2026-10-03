import { CalendarDays, X } from "lucide-react";
import type { ResumoSemanal } from "../../services/automacoesRelatorios";
import { formatarCentavos, formatarDataISOParaBR } from "../../services/formato";
import { usePreferencia } from "../../state/usePreferencia";

/** Resumo da semana gerado no domingo (aparece até ser dispensado ou chegar o próximo). */
export function CardResumoSemanal({ dinheiro = formatarCentavos }: { dinheiro?: (v: number) => string }) {
  const [resumo] = usePreferencia<ResumoSemanal | null>("resumo_semanal_ultimo", null);
  const [dispensado, setDispensado] = usePreferencia<string>("resumo_semanal_dispensado", "");
  if (!resumo || dispensado === resumo.semana) return null;
  const [inicio, fim] = resumo.semana.split("|");
  const variacao = resumo.gastosSemanaAnterior > 0 ? Math.round((resumo.gastos / resumo.gastosSemanaAnterior - 1) * 100) : null;
  return (
    <section className="rounded-2xl border border-borda bg-cartao p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-texto-primario">
          <CalendarDays size={15} className="text-primaria" /> Resumo da semana · {formatarDataISOParaBR(inicio).slice(0, 5)} a {formatarDataISOParaBR(fim).slice(0, 5)}
        </h2>
        <button onClick={() => setDispensado(resumo.semana)} aria-label="Dispensar resumo da semana" className="text-texto-secundario hover:text-texto-primario"><X size={14} /></button>
      </div>
      <p className="mt-2 text-sm text-texto-primario">
        Gastos: <strong className="tabular-nums">{dinheiro(resumo.gastos)}</strong>
        {variacao !== null && <span className={variacao > 0 ? "text-erro" : "text-sucesso"}> ({variacao > 0 ? "+" : ""}{variacao}% vs. semana anterior)</span>}
      </p>
      {resumo.textoIA ? (
        <p className="mt-2 whitespace-pre-line text-sm text-texto-secundario">{resumo.textoIA}</p>
      ) : (
        <>
          {resumo.maiores.length > 0 && <p className="mt-1 text-xs text-texto-secundario">Maiores: {resumo.maiores.map((m) => `${m.descricao} (${dinheiro(m.valor)})`).join(", ")}</p>}
          {resumo.proximasContas.length > 0 && <p className="mt-1 text-xs text-texto-secundario">Próxima semana: {resumo.proximasContas.map((c) => `${c.descricao} ${formatarDataISOParaBR(c.vencimento).slice(0, 5)}`).join(", ")}</p>}
          <p className="mt-2 text-sm text-texto-secundario">{resumo.dica}</p>
        </>
      )}
    </section>
  );
}
