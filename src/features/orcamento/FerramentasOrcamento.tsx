import { useState } from "react";
import { Copy, Goal, Scissors, Scale } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { BarraProgresso, CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { centavosParaValorInput, formatarCentavos, valorInputParaCentavos } from "../../services/formato";
import { planejamento, type LimiteMes } from "../../services/planejamento";
import { usePreferencia } from "../../state/usePreferencia";
import type { Conta } from "../../types/accounting";
import type { Orcamento } from "../../types/extras";

interface Props {
  categorias: Conta[];
  gastoMes: Map<string, number>;
  media3: (id: string) => number;
  renda: number;
  totalGasto: number;
  mesRef: string;
  limitesMes: LimiteMes[];
  orcamentos: Orcamento[];
  onAlterado: () => void;
}

const mesAnterior = (m: string) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 2, 1)).toISOString().slice(0, 7);

/** Meta de economia do mês, simulador de cortes, base zero e copiar limites de um mês para outro. */
export function FerramentasOrcamento({ categorias, gastoMes, media3, renda, totalGasto, mesRef, limitesMes, orcamentos, onAlterado }: Props) {
  const [meta, setMeta] = usePreferencia<number>("meta_economia_mes", 0);
  const [metaTexto, setMetaTexto] = useState(meta ? centavosParaValorInput(meta) : "");
  const [corte, setCorte] = useState({ categoria: "", pct: "20" });
  const economia = renda - totalGasto;
  const totalOrcado = orcamentos.reduce((s, o) => s + o.limite_centavos, 0);
  const semDestino = renda - totalOrcado - meta;
  const base = corte.categoria ? media3(corte.categoria) : 0;
  const pct = Math.min(100, Math.max(0, Number(corte.pct.replace(",", ".")) || 0));
  const poupa = Math.round((base * pct) / 100);
  const doAnterior = limitesMes.filter((l) => l.mes === mesAnterior(mesRef));

  async function copiarMesAnterior() {
    try {
      for (const l of doAnterior) await planejamento.definirOrcamentoMes(l.categoria_id, mesRef, l.limite_centavos);
      toast.success(`${doAnterior.length} limite(s) do mês anterior copiados para este mês.`);
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Secao titulo={<><Goal size={16} className="text-sucesso" /> Meta de economia do mês</>}>
        <div className="flex flex-wrap items-center gap-2">
          <input value={metaTexto} onChange={(e) => setMetaTexto(e.target.value)} inputMode="decimal" placeholder="Quanto quer guardar" aria-label="Meta de economia" className={`${CLASSE_INPUT} w-40`} />
          <Button tamanho="pequeno" variante="secundaria" onClick={() => { setMeta(valorInputParaCentavos(metaTexto)); toast.success("Meta de economia salva."); }}>Salvar</Button>
        </div>
        {meta > 0 && (
          <div className="mt-3">
            <BarraProgresso percentual={Math.max(0, Math.min(100, (economia / meta) * 100))} cor={economia >= meta ? "var(--cor-sucesso)" : "var(--cor-alerta)"} />
            <p className="mt-1 text-xs text-texto-secundario">Sobrando agora: <strong className={economia >= 0 ? "text-texto-primario" : "text-erro"}>{formatarCentavos(economia)}</strong> de {formatarCentavos(meta)} ({renda > 0 ? "renda − gastos do mês" : "registre a renda para calcular"}).</p>
          </div>
        )}
      </Secao>

      <Secao titulo={<><Scale size={16} className="text-primaria" /> Base zero (cada real com destino)</>}>
        <p className="text-sm text-texto-primario">Renda {formatarCentavos(renda)} − orçado {formatarCentavos(totalOrcado)} − meta {formatarCentavos(meta)} = <strong className={semDestino < 0 ? "text-erro" : semDestino > 0 ? "text-alerta" : "text-sucesso"}>{formatarCentavos(semDestino)}</strong></p>
        <p className="mt-1 text-xs text-texto-secundario">{semDestino > 0 ? "Dinheiro ainda sem destino: aumente a meta ou algum limite." : semDestino < 0 ? "Você orçou mais do que ganha: reduza algum limite." : "Perfeito: cada real tem um destino."}</p>
      </Secao>

      <Secao titulo={<><Scissors size={16} className="text-alerta" /> Simulador de cortes</>}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-texto-secundario">Se eu cortar</span>
          <input value={corte.pct} onChange={(e) => setCorte({ ...corte, pct: e.target.value })} inputMode="decimal" aria-label="Percentual de corte" className={`${CLASSE_INPUT} w-16`} />
          <span className="text-texto-secundario">% em</span>
          <Select aria-label="Categoria do corte" value={corte.categoria} onValueChange={(v) => setCorte({ ...corte, categoria: v })} options={[{ value: "", label: "Escolha…" }, ...categorias.map((c) => ({ value: c.id, label: c.nome }))]} className="w-44" />
        </div>
        {corte.categoria && (
          <p className="mt-2 text-sm text-texto-primario">Média de {formatarCentavos(base)}/mês → economia de <strong className="text-sucesso">{formatarCentavos(poupa)}/mês</strong> e <strong className="text-sucesso">{formatarCentavos(poupa * 12)}/ano</strong>. Este mês já gastou {formatarCentavos(gastoMes.get(corte.categoria) ?? 0)}.</p>
        )}
      </Secao>

      <Secao titulo={<><Copy size={16} className="text-secundaria" /> Limites do mês anterior</>}>
        <p className="text-xs text-texto-secundario">{doAnterior.length ? `O mês anterior tinha ${doAnterior.length} limite(s) específico(s) (além dos normais).` : "O mês anterior não teve limites específicos: os limites normais já valem para todo mês."}</p>
        <Button className="mt-2" tamanho="pequeno" variante="secundaria" disabled={!doAnterior.length} onClick={copiarMesAnterior}>Copiar para este mês</Button>
      </Secao>
    </div>
  );
}
