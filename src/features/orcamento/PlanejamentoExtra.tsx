import { useMemo, useState } from "react";
import { FlaskConical, Wand2 } from "lucide-react";
import { Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { formatarCentavos } from "../../services/formato";
import { usePreferencia } from "../../state/usePreferencia";
import type { Conta, Lancamento } from "../../types/accounting";
import { totalPorTipo } from "../dashboard/inteligencia";

interface Props {
  contas: Conta[];
  lancamentos: Lancamento[];
  hoje: string;
  /** Gasto médio mensal (3 meses) por categoria. */
  media3: (id: string) => number;
}

const valorDe = (l: Lancamento) => l.partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0);

/** Simulador "e se?" e orçamento automático mensal. */
export function PlanejamentoExtra({ contas, lancamentos, hoje, media3 }: Props) {
  const [orcamentoAuto, setOrcamentoAuto] = usePreferencia<boolean>("orcamento_auto", false);
  const [cortadas, setCortadas] = useState<Set<string>>(new Set());
  const [categoriaCorte, setCategoriaCorte] = useState("");
  const [pctCorte, setPctCorte] = useState(20);
  const [aumento, setAumento] = useState(0);

  // Assinaturas: despesas com etiqueta Assinatura nos últimos 60 dias (uma por descrição).
  const assinaturas = useMemo(() => {
    const limite = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10) - 60)).toISOString().slice(0, 10);
    const estornados = new Set(lancamentos.map((l) => l.estornado_de).filter(Boolean));
    const mapa = new Map<string, number>();
    for (const l of lancamentos) {
      if (l.etiqueta !== "ASSINATURA" || l.data < limite || estornados.has(l.id) || l.origem === "ESTORNO") continue;
      if (!mapa.has(l.descricao)) mapa.set(l.descricao, valorDe(l));
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [lancamentos, hoje]);

  const categorias = contas.filter((c) => c.tipo === "DESPESA" && c.subtipo !== "CATEGORIA" && c.ativa && media3(c.id) > 0);
  const catCorte = categoriaCorte || categorias[0]?.id || "";
  const economiaAssinaturas = assinaturas.filter(([d]) => cortadas.has(d)).reduce((s, [, v]) => s + v, 0) * 12;
  const economiaCorte = Math.round(media3(catCorte) * (pctCorte / 100)) * 12;
  const [a, m] = hoje.split("-").map(Number);
  const ini = new Date(Date.UTC(a, m - 4, 1)).toISOString().slice(0, 10);
  const fim = new Date(Date.UTC(a, m - 1, 0)).toISOString().slice(0, 10);
  const rendaMedia = Math.round(totalPorTipo(lancamentos, contas, "RECEITA", ini, fim) / 3);
  const ganhoAumento = Math.round(rendaMedia * (aumento / 100)) * 12;
  const total = economiaAssinaturas + economiaCorte + ganhoAumento;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Secao titulo={<><FlaskConical size={16} className="text-destaque" /> Simulador “e se?”</>}>
        <p className="text-xs text-texto-secundario">Escolha o que mudaria e veja quanto sobraria em um ano (estimativa com os seus gastos reais dos últimos 3 meses).</p>
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <p className="text-xs font-medium text-texto-secundario">E se eu cancelar estas assinaturas?</p>
            {assinaturas.length === 0 ? <p className="text-xs text-texto-secundario">Nenhuma despesa com etiqueta Assinatura nos últimos 60 dias.</p> : (
              <ul className="mt-1 space-y-1">
                {assinaturas.map(([d, v]) => (
                  <li key={d}>
                    <label className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2"><input type="checkbox" checked={cortadas.has(d)} onChange={() => setCortadas((s) => { const n = new Set(s); if (n.has(d)) n.delete(d); else n.add(d); return n; })} className="h-4 w-4 accent-[var(--cor-primaria)]" />{d}</span>
                      <span className="tabular-nums text-texto-secundario">{formatarCentavos(v)}/mês</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {categorias.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-texto-secundario">
              E se eu cortar
              <input type="number" min={0} max={100} value={pctCorte} onChange={(e) => setPctCorte(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} aria-label="Percentual de corte" className="w-16 rounded border border-borda bg-fundo px-2 py-1 text-texto-primario" />% de
              <Select aria-label="Categoria do corte" value={catCorte} onValueChange={setCategoriaCorte} options={categorias.map((c) => ({ value: c.id, label: `${c.nome} (${formatarCentavos(media3(c.id))}/mês)` }))} className="w-56" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs text-texto-secundario">
            E se eu ganhar um aumento de
            <input type="number" min={0} max={200} value={aumento} onChange={(e) => setAumento(Math.max(0, Number(e.target.value) || 0))} aria-label="Aumento de renda" className="w-16 rounded border border-borda bg-fundo px-2 py-1 text-texto-primario" />% (renda média {formatarCentavos(rendaMedia)}/mês)
          </div>
          <div className="rounded-lg border border-sucesso/40 bg-sucesso/10 p-3">
            <p className="text-texto-primario">Sobraria <strong>{formatarCentavos(total)}</strong> a mais em 12 meses ({formatarCentavos(Math.round(total / 12))}/mês).</p>
            <p className="text-xs text-texto-secundario">Assinaturas {formatarCentavos(economiaAssinaturas)} · corte {formatarCentavos(economiaCorte)} · aumento {formatarCentavos(ganhoAumento)}.</p>
          </div>
        </div>
      </Secao>
      <Secao titulo={<><Wand2 size={16} className="text-primaria" /> Orçamento automático</>}>
        <label className="flex items-center gap-2 text-sm text-texto-primario"><input type="checkbox" checked={orcamentoAuto} onChange={() => setOrcamentoAuto(!orcamentoAuto)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Todo mês, propor os limites pela média dos últimos 3 meses</label>
        <p className="mt-2 text-xs text-texto-secundario">No primeiro dia em que o app abrir no mês, cada categoria com gasto ganha um limite daquele mês igual à média dos 3 meses anteriores (arredondado para cima em R$ 10). Você recebe um aviso e pode ajustar qualquer um. Limites que você já definiu para o mês não são trocados.</p>
      </Secao>
    </div>
  );
}
