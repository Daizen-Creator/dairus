import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { lerPreferencia, salvarPreferencia } from "../../services/armazenamento";
import { dataAtualISO, formatarCentavos } from "../../services/formato";
import { usePreferencia } from "../../state/usePreferencia";
import type { Conta, Lancamento } from "../../types/accounting";
import type { Meta } from "../../types/extras";
import type { ConfigDestino } from "./executarAutomacoes";
import { conquistas, progressoDesafio, type Desafio } from "./metasAuto";

interface Props {
  metas: Meta[];
  contas: Conta[];
  lancamentos: Lancamento[];
}

/** Configuração das automações das metas. */
export function AbaAutomacaoMetas({ metas, contas }: Props) {
  const [envelopes, setEnvelopes] = usePreferencia<Array<{ meta_id: string; percentual: number }>>("meta_envelopes", []);
  const [sobra, setSobra] = usePreferencia<ConfigDestino | null>("meta_sobra", null);
  const [arred, setArred] = usePreferencia<(ConfigDestino & { base: number }) | null>("meta_arredondar", null);
  const [lembrete, setLembrete] = usePreferencia<boolean>("meta_lembrete", false);
  const contasOrigem = contas.filter((c) => c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA" && c.ativa);
  const opMetas = [{ value: "", label: "Desligado" }, ...metas.map((m) => ({ value: m.id, label: m.nome }))];
  const opOrigem = [{ value: "", label: "Sem mover dinheiro (só registra)" }, ...contasOrigem.map((c) => ({ value: c.id, label: `Tirar de ${c.nome}` }))];
  const somaPct = envelopes.reduce((s, e) => s + e.percentual, 0);

  useEffect(() => {
    // Envelopes valem para salários a partir de quando foram ligados.
    if (envelopes.length) lerPreferencia<string>("meta_envelopes_desde").then((d) => { if (!d) salvarPreferencia("meta_envelopes_desde", dataAtualISO()); });
  }, [envelopes.length]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Secao titulo="Envelopes do salário">
        <p className="text-xs text-texto-secundario">Quando o salário entra, o Dairus divide uma parte nas metas (caixinhas). Se a meta estiver ligada a uma conta, o dinheiro é transferido de verdade da conta onde o salário caiu.</p>
        <ul className="mt-3 space-y-2">
          {envelopes.map((e, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <Select aria-label={`Meta do envelope ${i + 1}`} value={e.meta_id} onValueChange={(v) => setEnvelopes(envelopes.map((x, j) => (j === i ? { ...x, meta_id: v } : x)))} options={metas.map((m) => ({ value: m.id, label: m.nome }))} className="min-w-40 flex-1" />
              <input type="number" min={0} max={100} value={e.percentual} onChange={(ev) => setEnvelopes(envelopes.map((x, j) => (j === i ? { ...x, percentual: Number(ev.target.value) || 0 } : x)))} aria-label={`Percentual do envelope ${i + 1}`} className={`${CLASSE_INPUT} w-20`} />%
              <button onClick={() => setEnvelopes(envelopes.filter((_, j) => j !== i))} aria-label="Remover envelope" className="text-texto-secundario hover:text-erro"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center gap-3 text-xs">
          <Button tamanho="pequeno" variante="secundaria" disabled={!metas.length} onClick={() => setEnvelopes([...envelopes, { meta_id: metas[0]?.id ?? "", percentual: 10 }])}><Plus size={13} /> Envelope</Button>
          {envelopes.length > 0 && <span className={somaPct > 100 ? "text-erro" : "text-texto-secundario"}>{somaPct}% do salário</span>}
        </div>
      </Secao>

      <Secao titulo="Sobra do mês para a meta">
        <p className="text-xs text-texto-secundario">No começo de cada mês, o que sobrou no mês anterior (receitas − despesas) vai para a meta escolhida.</p>
        <div className="mt-3 grid gap-2">
          <Select aria-label="Meta da sobra" value={sobra?.meta_id ?? ""} onValueChange={(v) => setSobra(v ? { meta_id: v, conta_origem_id: sobra?.conta_origem_id ?? null } : null)} options={opMetas} />
          {sobra?.meta_id && <Select aria-label="Conta de origem da sobra" value={sobra.conta_origem_id ?? ""} onValueChange={(v) => setSobra({ ...sobra, conta_origem_id: v || null })} options={opOrigem} />}
        </div>
      </Secao>

      <Secao titulo="Arredondamento para a meta">
        <p className="text-xs text-texto-secundario">Cada gasto é arredondado para cima e a diferença vai para a meta (ex.: R$ 18,40 com arredondamento de R$ 10 guarda R$ 1,60). Somado uma vez por dia.</p>
        <div className="mt-3 grid gap-2">
          <Select aria-label="Meta do arredondamento" value={arred?.meta_id ?? ""} onValueChange={(v) => setArred(v ? { meta_id: v, conta_origem_id: arred?.conta_origem_id ?? null, base: arred?.base ?? 1000 } : null)} options={opMetas} />
          {arred?.meta_id && (
            <>
              <Select aria-label="Arredondar para" value={String(arred.base)} onValueChange={(v) => setArred({ ...arred, base: Number(v) })} options={[{ value: "100", label: "Próximo R$ 1" }, { value: "500", label: "Próximo R$ 5" }, { value: "1000", label: "Próximo R$ 10" }]} />
              <Select aria-label="Conta de origem do arredondamento" value={arred.conta_origem_id ?? ""} onValueChange={(v) => setArred({ ...arred, conta_origem_id: v || null })} options={opOrigem} />
            </>
          )}
        </div>
      </Secao>

      <Secao titulo="Lembrete mensal das metas">
        <label className="flex items-center gap-2 text-sm text-texto-primario"><input type="checkbox" checked={lembrete} onChange={() => setLembrete(!lembrete)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Avisar no Windows, todo início de mês, quanto guardar em cada meta com prazo</label>
      </Secao>
    </div>
  );
}

/** Desafios de economia e conquistas. */
export function AbaDesafios({ metas, contas, lancamentos }: Props) {
  const hoje = dataAtualISO();
  const [desafios, setDesafios] = usePreferencia<Desafio[]>("desafios", []);
  const [superfluas, setSuperfluas] = usePreferencia<string[]>("categorias_superfluas", ["despesa-lazer"]);
  const [novo, setNovo] = useState<{ tipo: Desafio["tipo"]; alvo: string; valor: string; dias: string }>({ tipo: "SEM_MARCA", alvo: "", valor: "", dias: "30" });
  const categorias = contas.filter((c) => c.tipo === "DESPESA" && c.subtipo !== "CATEGORIA" && c.ativa);
  const lista = conquistas(lancamentos, contas, metas, hoje, superfluas);

  function criar(ev: React.FormEvent) {
    ev.preventDefault();
    const alvo = novo.tipo === "SEM_MARCA" ? novo.alvo.trim().toLowerCase() : novo.alvo || categorias[0]?.id || "";
    if (!alvo) return toast.error(novo.tipo === "SEM_MARCA" ? "Diga sem o quê (ex.: ifood)." : "Escolha a categoria.");
    const dias = Math.max(1, Math.min(365, Number(novo.dias) || 30));
    const nomeCat = categorias.find((c) => c.id === alvo)?.nome ?? alvo;
    const valor = Math.round((Number(novo.valor.replace(",", ".")) || 0) * 100);
    const nome = novo.tipo === "SEM_MARCA" ? `${dias} dias sem ${alvo}` : `${nomeCat} até ${formatarCentavos(valor)} em ${dias} dias`;
    setDesafios([...desafios, { id: crypto.randomUUID(), nome, tipo: novo.tipo, alvo, valor, inicio: hoje, dias }]);
    setNovo({ ...novo, alvo: "", valor: "" });
    toast.success("Desafio começou hoje. Boa sorte!");
  }

  const ROT = { EM_ANDAMENTO: "Em andamento", CONCLUIDO: "Concluído!", FALHOU: "Não deu desta vez" };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Secao titulo="Desafios de economia">
        <form onSubmit={criar} className="flex flex-wrap items-center gap-2 text-sm">
          <Select aria-label="Tipo de desafio" value={novo.tipo} onValueChange={(v) => setNovo({ ...novo, tipo: v as Desafio["tipo"], alvo: "" })} options={[{ value: "SEM_MARCA", label: "Ficar sem gastar com…" }, { value: "LIMITE_CATEGORIA", label: "Gastar no máximo…" }]} className="w-52" />
          {novo.tipo === "SEM_MARCA" ? (
            <input value={novo.alvo} onChange={(e) => setNovo({ ...novo, alvo: e.target.value })} placeholder="ifood, uber…" aria-label="Sem gastar com" className={`${CLASSE_INPUT} w-32`} />
          ) : (
            <>
              <input value={novo.valor} onChange={(e) => setNovo({ ...novo, valor: e.target.value })} placeholder="R$" inputMode="decimal" aria-label="Valor máximo" className={`${CLASSE_INPUT} w-24`} />
              <Select aria-label="Categoria do desafio" value={novo.alvo || categorias[0]?.id || ""} onValueChange={(v) => setNovo({ ...novo, alvo: v })} options={categorias.map((c) => ({ value: c.id, label: `em ${c.nome}` }))} className="w-40" />
            </>
          )}
          <input type="number" min={1} max={365} value={novo.dias} onChange={(e) => setNovo({ ...novo, dias: e.target.value })} aria-label="Dias do desafio" className={`${CLASSE_INPUT} w-20`} /> dias
          <Button type="submit" tamanho="pequeno">Começar</Button>
        </form>
        {desafios.length === 0 ? <p className="mt-3 text-sm text-texto-secundario">Nenhum desafio ainda. Que tal “30 dias sem iFood”?</p> : (
          <ul className="mt-3 space-y-2 text-sm">
            {[...desafios].reverse().map((d) => {
              const p = progressoDesafio(d, lancamentos, contas, hoje);
              return (
                <li key={d.id} className="rounded-lg border border-borda px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-texto-primario">{d.nome}</strong>
                    <span className={p.status === "FALHOU" ? "text-erro" : p.status === "CONCLUIDO" ? "text-sucesso" : "text-texto-secundario"}>{ROT[p.status]}</span>
                  </div>
                  <p className="text-xs text-texto-secundario">Dia {p.diasPassados} de {d.dias}{p.ocorrencias ? ` · ${p.ocorrencias} gasto(s), ${formatarCentavos(p.gasto)}` : " · nenhum gasto até agora"}</p>
                  <button onClick={() => setDesafios(desafios.filter((x) => x.id !== d.id))} className="text-[11px] text-texto-secundario hover:text-erro">remover</button>
                </li>
              );
            })}
          </ul>
        )}
      </Secao>
      <Secao titulo="Conquistas">
        <ul className="grid gap-2 sm:grid-cols-2">
          {lista.map((c) => (
            <li key={c.id} className={`rounded-lg border px-3 py-2 text-sm ${c.obtida ? "border-sucesso/50 bg-sucesso/10" : "border-borda opacity-60"}`}>
              <p className="font-medium text-texto-primario">{c.obtida ? "🏅 " : ""}{c.titulo}</p>
              <p className="text-xs text-texto-secundario">{c.descricao}</p>
            </li>
          ))}
        </ul>
        <label className="mt-3 block text-xs text-texto-secundario">Categorias que contam como supérfluas:
          <Select aria-label="Adicionar categoria supérflua" value="" onValueChange={(v) => v && !superfluas.includes(v) && setSuperfluas([...superfluas, v])} options={[{ value: "", label: "Adicionar…" }, ...categorias.filter((c) => !superfluas.includes(c.id)).map((c) => ({ value: c.id, label: c.nome }))]} className="mt-1 w-full" />
        </label>
        <div className="mt-1 flex flex-wrap gap-1">{superfluas.map((id) => <button key={id} onClick={() => setSuperfluas(superfluas.filter((x) => x !== id))} className="rounded-full bg-borda/60 px-2 text-[11px] text-texto-secundario hover:text-erro">{categorias.find((c) => c.id === id)?.nome ?? id} ×</button>)}</div>
      </Secao>
    </div>
  );
}
