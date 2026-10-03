import { useEffect, useState } from "react";
import { Calculator, Copy, Pause, Play, Share2, Sparkles, SplitSquareHorizontal, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT } from "../../components/ui/Campos";
import { extras } from "../../services/extras";
import { contabilidade } from "../../services/contabilidade";
import { dataAtualISO, formatarCentavos, formatarDataISOParaBR, valorInputParaCentavos } from "../../services/formato";
import { usePreferencia } from "../../state/usePreferencia";
import type { AporteMeta, Meta } from "../../types/extras";
import { aporteNecessario, distribuirEntreMetas, evolucaoDaMeta, marcosDaMeta, textoProgresso } from "./metasExtras";

const EMOJIS = ["🎯", "🏖️", "🏠", "🚗", "🎓", "💍", "🛟", "💻", "✈️", "🎁", "👶", "🐶"];
const mesesAte = (prazo: string, hoje: string) => Math.max(1, (+prazo.slice(0, 4) - +hoje.slice(0, 4)) * 12 + (+prazo.slice(5, 7) - +hoje.slice(5, 7)));

/** Barra do topo: dividir um valor entre as metas. */
export function DistribuirEntreMetas({ metas, onAlterado }: { metas: Meta[]; onAlterado: () => void }) {
  const [valor, setValor] = useState("");
  const [pausadas] = usePreferencia<string[]>("metas_pausadas", []);
  const v = valorInputParaCentavos(valor);
  const plano = v > 0 ? distribuirEntreMetas(v, metas, new Set(pausadas)) : new Map<string, number>();

  async function aplicar() {
    try {
      const hoje = dataAtualISO();
      for (const [id, parte] of plano) {
        const m = metas.find((x) => x.id === id);
        if (m?.conta_id) continue; // metas com conta: aporte só com transferência (feito na própria meta)
        await extras.aportarMeta(id, parte, hoje);
      }
      toast.success("Valor distribuído entre as metas.");
      setValor("");
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="rounded-xl border border-borda bg-cartao p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <SplitSquareHorizontal size={15} className="text-primaria" />
        <span className="text-texto-secundario">Dividir</span>
        <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="R$ (ex.: sobra do mês)" aria-label="Valor a dividir entre as metas" className={`${CLASSE_INPUT} w-40 py-1`} />
        <span className="text-texto-secundario">entre as metas (pelo que falta e pela prioridade)</span>
        {plano.size > 0 && <Button tamanho="pequeno" onClick={aplicar}>Guardar assim</Button>}
      </div>
      {plano.size > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2 text-xs">
          {[...plano.entries()].map(([id, parte]) => {
            const m = metas.find((x) => x.id === id)!;
            return <li key={id} className="rounded-full border border-borda px-2 py-0.5">{m.nome}: <strong>{formatarCentavos(parte)}</strong>{m.conta_id ? " (guarde pela meta: tem conta)" : ""}</li>;
          })}
        </ul>
      )}
    </div>
  );
}

/** Ferramentas extras de uma meta: emoji, marcos, calculadora com rendimento, rendimento, evolução, duplicar, compartilhar, pausar. */
export function MaisDaMeta({ meta, onAlterado }: { meta: Meta; onAlterado: () => void }) {
  const hoje = dataAtualISO();
  const [emojis, setEmojis] = usePreferencia<Record<string, string>>("emoji_metas", {});
  const [pausadas, setPausadas] = usePreferencia<string[]>("metas_pausadas", []);
  const [aportes, setAportes] = useState<AporteMeta[]>([]);
  const [taxa, setTaxa] = useState("0,8");
  const [rendimento, setRendimento] = useState("");
  const pausada = pausadas.includes(meta.id);

  useEffect(() => {
    extras.listarAportesMeta(meta.id).then(setAportes).catch(() => setAportes([]));
  }, [meta.id, meta.guardado_centavos]);

  const marcos = marcosDaMeta(aportes, meta.valor_alvo_centavos);
  const evolucao = evolucaoDaMeta(aportes);
  const maxEvo = Math.max(1, meta.valor_alvo_centavos, ...evolucao.map((e) => e.total));
  const meses = meta.prazo && meta.prazo > hoje ? mesesAte(meta.prazo, hoje) : 12;
  const i = (Number(taxa.replace(",", ".")) || 0) / 100;
  const necessario = aporteNecessario(meta.valor_alvo_centavos, meta.guardado_centavos, meses, i);
  const diasAtePrazo = meta.prazo ? Math.round((Date.parse(`${meta.prazo}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000) : null;

  async function duplicar() {
    try {
      await extras.criarMeta(`${meta.nome} (cópia)`, meta.valor_alvo_centavos, meta.prazo, meta.tipo, meta.prioridade, meta.notas);
      toast.success("Meta duplicada (sem os valores guardados).");
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function lancarRendimento() {
    const v = valorInputParaCentavos(rendimento);
    if (v <= 0) return toast.error("Informe o rendimento.");
    try {
      if (meta.conta_id) await contabilidade.registrarRecebimento({ conta_destino_id: meta.conta_id, conta_receita_id: "receita-investimentos", valor_centavos: v, data: hoje, descricao: `Rendimento — ${meta.nome}` });
      else await extras.aportarMeta(meta.id, v, hoje);
      toast.success("Rendimento somado à meta.");
      setRendimento("");
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-borda pt-3 text-xs">
      <div className="flex flex-wrap items-center gap-1">
        {EMOJIS.map((e) => (
          <button key={e} onClick={() => setEmojis({ ...emojis, [meta.id]: e })} aria-label={`Emoji ${e}`} className={`rounded-md px-1 text-base ${emojis[meta.id] === e ? "bg-primaria/20" : "hover:bg-borda/50"}`}>{e}</button>
        ))}
      </div>
      {diasAtePrazo !== null && <p className="text-texto-secundario">{diasAtePrazo >= 0 ? `Faltam ${diasAtePrazo} dia(s) para o prazo.` : `Prazo passou há ${-diasAtePrazo} dia(s).`}</p>}
      <div className="flex flex-wrap gap-2">
        {marcos.map((m) => (
          <span key={m.pct} className={`rounded-full border px-2 py-0.5 ${m.data ? "border-sucesso/60 text-sucesso" : "border-borda text-texto-secundario"}`}>{m.pct}% {m.data ? `· ${formatarDataISOParaBR(m.data)}` : ""}</span>
        ))}
      </div>
      {evolucao.length > 1 && (
        <div>
          <p className="mb-1 flex items-center gap-1 text-texto-secundario"><TrendingUp size={12} /> Evolução</p>
          <div className="flex h-14 items-end gap-0.5" aria-label="Evolução da meta">
            {evolucao.slice(-30).map((e, k) => <div key={k} title={`${formatarDataISOParaBR(e.data)}: ${formatarCentavos(e.total)}`} className="flex-1 rounded-t bg-primaria/70" style={{ height: `${Math.max(3, (Math.max(0, e.total) / maxEvo) * 100)}%` }} />)}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <Calculator size={12} className="text-texto-secundario" />
        <span className="text-texto-secundario">Rendendo</span>
        <input value={taxa} onChange={(e) => setTaxa(e.target.value)} inputMode="decimal" aria-label="Rendimento ao mês (%)" className={`${CLASSE_INPUT} w-14 py-1`} />
        <span className="text-texto-secundario">% ao mês, guarde <strong className="text-texto-primario">{formatarCentavos(necessario)}/mês</strong> por {meses} mês(es){meta.prazo ? " (até o prazo)" : ""}.</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Sparkles size={12} className="text-texto-secundario" />
        <input value={rendimento} onChange={(e) => setRendimento(e.target.value)} inputMode="decimal" placeholder="Rendimento recebido" aria-label="Rendimento da meta" className={`${CLASSE_INPUT} w-36 py-1`} />
        <Button tamanho="pequeno" variante="secundaria" onClick={lancarRendimento}>Somar rendimento</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button tamanho="pequeno" variante="fantasma" onClick={duplicar}><Copy size={12} /> Duplicar</Button>
        <Button tamanho="pequeno" variante="fantasma" onClick={() => navigator.clipboard.writeText(textoProgresso(meta)).then(() => toast.success("Progresso copiado para compartilhar."))}><Share2 size={12} /> Compartilhar progresso</Button>
        <Button tamanho="pequeno" variante="fantasma" onClick={() => setPausadas(pausada ? pausadas.filter((x) => x !== meta.id) : [...pausadas, meta.id])}>{pausada ? <><Play size={12} /> Retomar</> : <><Pause size={12} /> Pausar</>}</Button>
      </div>
      {pausada && <p className="text-alerta">Pausada: fica fora das sugestões mensais e da divisão automática.</p>}
    </div>
  );
}
