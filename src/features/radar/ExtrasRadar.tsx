import { useState } from "react";
import { CalendarHeart, Copy, Scale, ShoppingBag, Tag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { extras } from "../../services/extras";
import { formatarCentavos, formatarDataISOParaBR } from "../../services/formato";
import { usePreferencia } from "../../state/usePreferencia";
import type { ItemRadar } from "../../types/extras";
import { proximasPromocoes, totalDaLista } from "./radarExtras";

export interface InfoItemRadar {
  prioridade?: "ALTA" | "MEDIA" | "BAIXA";
  categoria?: string;
  notas?: string;
}

/** Resumo da lista: total pelo melhor preço, próximas datas de promoção e comparação de produtos. */
export function ResumoRadar({ itens, hoje, saldoLivre }: { itens: ItemRadar[]; hoje: string; saldoLivre: number }) {
  const [info] = usePreferencia<Record<string, InfoItemRadar>>("radar_info", {});
  const [comparar, setComparar] = useState<string[]>([]);
  const total = totalDaLista(itens);
  const urgentes = totalDaLista(itens, (i) => info[i.id]?.prioridade === "ALTA");
  const promos = proximasPromocoes(hoje);
  const escolhidos = itens.filter((i) => comparar.includes(i.id));
  const stats = (i: ItemRadar) => {
    const p = i.precos.map((x) => x.preco_centavos);
    const ord = [...i.precos].sort((a, b) => a.data.localeCompare(b.data));
    return { menor: p.length ? Math.min(...p) : null, maior: p.length ? Math.max(...p) : null, ultimo: ord[ord.length - 1]?.preco_centavos ?? null, registros: p.length };
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Secao titulo={<><ShoppingBag size={15} className="text-primaria" /> Lista de desejos</>}>
        <p className="text-sm">Tudo pelo melhor preço visto: <strong>{formatarCentavos(total.total)}</strong>{total.semPreco ? <span className="text-xs text-texto-secundario"> (+{total.semPreco} sem preço)</span> : null}</p>
        {urgentes.total > 0 && <p className="text-sm">Só prioridade alta: <strong>{formatarCentavos(urgentes.total)}</strong></p>}
        <p className={`mt-1 text-xs ${saldoLivre >= total.total ? "text-sucesso" : "text-texto-secundario"}`}>{saldoLivre >= total.total ? "O saldo livre (fora das metas) cobre a lista inteira." : `Faltam ${formatarCentavos(Math.max(0, total.total - saldoLivre))} além do saldo livre.`}</p>
      </Secao>
      <Secao titulo={<><CalendarHeart size={15} className="text-destaque" /> Próximas datas de promoção</>}>
        <ul className="space-y-1 text-sm">{promos.map((p) => <li key={p.nome} className="flex justify-between"><span>{p.nome}</span><span className="text-texto-secundario">{formatarDataISOParaBR(p.data)} · {p.dias === 0 ? "hoje" : `em ${p.dias} dia(s)`}</span></li>)}</ul>
        <p className="mt-1 text-[11px] text-texto-secundario">Se não for urgente, vale esperar e comparar com o histórico.</p>
      </Secao>
      <Secao titulo={<><Scale size={15} className="text-secundaria" /> Comparar produtos</>}>
        <Select aria-label="Adicionar à comparação" value="" onValueChange={(v) => v && setComparar([...new Set([...comparar, v])].slice(-3))} options={[{ value: "", label: "Adicionar produto…" }, ...itens.filter((i) => !comparar.includes(i.id)).map((i) => ({ value: i.id, label: i.nome }))]} className="w-full" />
        {escolhidos.length > 0 && (
          <table className="mt-2 w-full text-xs">
            <thead className="text-texto-secundario"><tr><th className="text-left">Produto</th><th className="text-right">Menor</th><th className="text-right">Último</th><th className="text-right">Maior</th><th /></tr></thead>
            <tbody>{escolhidos.map((i) => { const s = stats(i); return <tr key={i.id} className="border-t border-borda"><td className="py-1">{i.nome}</td><td className="text-right tabular-nums text-sucesso">{s.menor !== null ? formatarCentavos(s.menor) : "—"}</td><td className="text-right tabular-nums">{s.ultimo !== null ? formatarCentavos(s.ultimo) : "—"}</td><td className="text-right tabular-nums text-texto-secundario">{s.maior !== null ? formatarCentavos(s.maior) : "—"}</td><td className="text-right"><button onClick={() => setComparar(comparar.filter((x) => x !== i.id))} className="text-texto-secundario hover:text-erro" aria-label="Tirar da comparação">×</button></td></tr>; })}</tbody>
          </table>
        )}
      </Secao>
    </div>
  );
}

/** Prioridade, categoria, notas e duplicar um produto. */
export function MaisDoItemRadar({ item, onAlterado }: { item: ItemRadar; onAlterado: () => void }) {
  const [info, setInfo] = usePreferencia<Record<string, InfoItemRadar>>("radar_info", {});
  const atual = info[item.id] ?? {};
  const salvar = (x: Partial<InfoItemRadar>) => setInfo({ ...info, [item.id]: { ...atual, ...x } });
  const [notas, setNotas] = useState(atual.notas ?? "");

  async function duplicar() {
    try {
      await extras.criarItemRadar(`${item.nome} (outra opção)`, item.preco_alvo_centavos);
      toast.success("Produto duplicado.");
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <Select aria-label={`Prioridade de ${item.nome}`} value={atual.prioridade ?? ""} onValueChange={(v) => salvar({ prioridade: (v || undefined) as InfoItemRadar["prioridade"] })} options={[{ value: "", label: "Sem prioridade" }, { value: "ALTA", label: "Prioridade alta" }, { value: "MEDIA", label: "Prioridade média" }, { value: "BAIXA", label: "Prioridade baixa" }]} className="w-36" />
      <span className="inline-flex items-center gap-1 text-texto-secundario"><Tag size={11} /></span>
      <input value={atual.categoria ?? ""} onChange={(e) => salvar({ categoria: e.target.value })} placeholder="Categoria (ex.: casa)" aria-label={`Categoria de ${item.nome}`} className={`${CLASSE_INPUT} w-32 py-1`} />
      <input value={notas} onChange={(e) => setNotas(e.target.value)} onBlur={() => salvar({ notas })} placeholder="Notas (modelo, cor, tamanho…)" aria-label={`Notas de ${item.nome}`} className={`${CLASSE_INPUT} w-56 py-1`} />
      <Button tamanho="pequeno" variante="fantasma" onClick={duplicar}><Copy size={12} /> Duplicar</Button>
    </div>
  );
}
