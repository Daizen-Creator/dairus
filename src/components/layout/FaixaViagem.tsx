import { useEffect, useState } from "react";
import { Plane, X } from "lucide-react";
import { contabilidade } from "../../services/contabilidade";
import { dataAtualISO, formatarCentavos } from "../../services/formato";
import { lancExtras } from "../../services/lancamentosExtras";
import { definirViagem, EVENTO_VIAGEM, tagDaViagem, viagemAtual, type Viagem } from "../../services/modoViagem";
import { useAoAlterarDados } from "../../state/useAoAlterarDados";

/** Total gasto nos lançamentos com a etiqueta da viagem (fora estornos). */
export async function gastoDaViagem(v: Viagem): Promise<number> {
  const tag = tagDaViagem(v);
  const [tags, lancs, contas] = await Promise.all([lancExtras.listarTags(), contabilidade.listarLancamentos(5000), contabilidade.listarContas()]);
  const ids = new Set(tags.filter((t) => t.tag === tag).map((t) => t.lancamento_id));
  const despesas = new Set(contas.filter((c) => c.tipo === "DESPESA").map((c) => c.id));
  const estornados = new Set(lancs.map((l) => l.estornado_de).filter(Boolean));
  return lancs
    .filter((l) => ids.has(l.id) && !estornados.has(l.id) && l.origem !== "ESTORNO")
    .reduce((s, l) => s + l.partidas.filter((p) => despesas.has(p.conta_id) && p.tipo === "DEBITO").reduce((a, p) => a + p.valor_centavos, 0), 0);
}

export function FaixaViagem() {
  const [viagem, setViagem] = useState<Viagem | null>(null);
  const [gasto, setGasto] = useState(0);

  async function carregar() {
    const v = await viagemAtual(dataAtualISO()).catch(() => null);
    setViagem(v);
    if (v) setGasto(await gastoDaViagem(v).catch(() => 0));
  }
  useEffect(() => {
    carregar();
    const f = () => carregar();
    window.addEventListener(EVENTO_VIAGEM, f);
    return () => window.removeEventListener(EVENTO_VIAGEM, f);
  }, []);
  useAoAlterarDados(carregar);

  if (!viagem) return null;
  const acima = viagem.orcamento_centavos !== null && gasto > viagem.orcamento_centavos;
  return (
    <div className="flex items-center justify-center gap-3 border-b border-borda bg-secundaria/10 px-4 py-1.5 text-xs text-texto-primario">
      <Plane size={13} className="text-secundaria" />
      <span>
        Modo viagem: <strong>{viagem.nome}</strong> · gasto <strong className={acima ? "text-erro" : ""}>{formatarCentavos(gasto)}</strong>
        {viagem.orcamento_centavos !== null && <> de {formatarCentavos(viagem.orcamento_centavos)}</>}
        {viagem.fim && <> · até {viagem.fim.split("-").reverse().join("/")}</>} · despesas novas ganham #{tagDaViagem(viagem)}
      </span>
      <button onClick={() => definirViagem({ ...viagem, ativo: false })} className="inline-flex items-center gap-1 text-texto-secundario hover:text-erro" aria-label="Encerrar modo viagem"><X size={12} /> Encerrar</button>
    </div>
  );
}
