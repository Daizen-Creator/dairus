import { useState } from "react";
import { Bookmark, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { opcoesCategoria } from "../../services/categorias";
import { centavosParaValorInput, dataAtualISO, formatarCentavos, valorInputParaCentavos } from "../../services/formato";
import { usePreferencia } from "../../state/usePreferencia";
import type { Conta } from "../../types/accounting";

export interface ModeloLancamento {
  id: string;
  tipo: "DESPESA" | "RECEITA";
  descricao: string;
  valor_centavos: number;
  conta_id: string;
  categoria_id: string;
}

export const CHAVE_MODELOS = "modelos_lancamento";

/** Lançamentos que se repetem sem data fixa (café, gasolina, Uber): um clique e pronto. */
export function ModelosLancamento({ contas, onLancado }: { contas: Conta[]; onLancado: () => void }) {
  const [modelos, setModelos] = usePreferencia<ModeloLancamento[]>(CHAVE_MODELOS, []);
  const pagaveis = contas.filter((c) => c.ativa && (c.tipo === "ATIVO" || c.tipo === "PASSIVO") && c.subtipo !== "CATEGORIA");
  const vazio = { tipo: "DESPESA" as const, descricao: "", valor: "", conta_id: pagaveis[0]?.id ?? "", categoria_id: "despesa-outras" };
  const [novo, setNovo] = useState<{ tipo: "DESPESA" | "RECEITA"; descricao: string; valor: string; conta_id: string; categoria_id: string }>(vazio);
  const [valores, setValores] = useState<Record<string, string>>({});
  const categorias = contas.filter((c) => c.ativa && c.tipo === novo.tipo && c.subtipo !== "CATEGORIA");

  function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    const v = valorInputParaCentavos(novo.valor);
    if (!novo.descricao.trim() || v <= 0 || !novo.conta_id || !novo.categoria_id) return toast.error("Preencha descrição, valor, conta e categoria.");
    setModelos([...modelos, { id: crypto.randomUUID(), tipo: novo.tipo, descricao: novo.descricao.trim(), valor_centavos: v, conta_id: novo.conta_id, categoria_id: novo.categoria_id }]);
    setNovo({ ...vazio, conta_id: novo.conta_id });
    toast.success("Modelo salvo.");
  }

  async function lancar(m: ModeloLancamento) {
    const v = valores[m.id] ? valorInputParaCentavos(valores[m.id]) : m.valor_centavos;
    if (v <= 0) return toast.error("Valor inválido.");
    try {
      const data = dataAtualISO();
      if (m.tipo === "DESPESA") await contabilidade.registrarDespesa({ conta_origem_id: m.conta_id, categoria_despesa_id: m.categoria_id, valor_centavos: v, data, descricao: m.descricao });
      else await contabilidade.registrarRecebimento({ conta_destino_id: m.conta_id, conta_receita_id: m.categoria_id, valor_centavos: v, data, descricao: m.descricao });
      toast.success(`${m.descricao} lançado (${formatarCentavos(v)}).`);
      setValores({ ...valores, [m.id]: "" });
      onLancado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  const nome = (id: string) => contas.find((c) => c.id === id)?.nome ?? "?";

  return (
    <div className="space-y-4">
      {modelos.length === 0 ? (
        <p className="text-sm text-texto-secundario">Nenhum modelo ainda. Crie abaixo, ou use “Salvar como modelo” no Histórico.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {modelos.map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded-lg border border-borda bg-fundo/40 p-2 text-sm">
              <Bookmark size={14} className={m.tipo === "RECEITA" ? "text-sucesso" : "text-primaria"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-texto-primario">{m.descricao}</span>
                <span className="block truncate text-[11px] text-texto-secundario">{nome(m.categoria_id)} · {nome(m.conta_id)}</span>
              </span>
              <input value={valores[m.id] ?? ""} onChange={(e) => setValores({ ...valores, [m.id]: e.target.value })} placeholder={centavosParaValorInput(m.valor_centavos)} inputMode="decimal" aria-label={`Valor de ${m.descricao}`} className={`${CLASSE_INPUT} w-24 py-1`} />
              <Button tamanho="pequeno" onClick={() => lancar(m)} aria-label={`Lançar ${m.descricao}`}><Play size={12} /> Lançar</Button>
              <button onClick={() => setModelos(modelos.filter((x) => x.id !== m.id))} aria-label={`Apagar modelo ${m.descricao}`} className="text-texto-secundario hover:text-erro"><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={salvar} className="flex flex-wrap items-end gap-2 border-t border-borda pt-3">
        <Select aria-label="Tipo do modelo" value={novo.tipo} onValueChange={(v) => setNovo({ ...novo, tipo: v as "DESPESA" | "RECEITA", categoria_id: v === "RECEITA" ? "receita-renda-extra" : "despesa-outras" })} options={[{ value: "DESPESA", label: "Despesa" }, { value: "RECEITA", label: "Receita" }]} className="w-28" />
        <input value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} placeholder="Descrição (ex.: Café)" aria-label="Descrição do modelo" className={`${CLASSE_INPUT} w-40`} />
        <input value={novo.valor} onChange={(e) => setNovo({ ...novo, valor: e.target.value })} placeholder="Valor" inputMode="decimal" aria-label="Valor do modelo" className={`${CLASSE_INPUT} w-24`} />
        <Select aria-label="Conta do modelo" value={novo.conta_id} onValueChange={(v) => setNovo({ ...novo, conta_id: v })} options={pagaveis.map((c) => ({ value: c.id, label: c.nome }))} className="w-40" />
        <Select aria-label="Categoria do modelo" value={novo.categoria_id} onValueChange={(v) => setNovo({ ...novo, categoria_id: v })} options={opcoesCategoria(categorias, contas)} className="w-44" />
        <Button type="submit" variante="secundaria">Salvar modelo</Button>
      </form>
    </div>
  );
}
