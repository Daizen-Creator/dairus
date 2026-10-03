import { useEffect, useRef, useState } from "react";
import { Zap, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/Button";
import { CLASSE_INPUT } from "../ui/Campos";
import { Select } from "../ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { lerPreferencia } from "../../services/armazenamento";
import { dataAtualISO, valorInputParaCentavos } from "../../services/formato";
import { estaNoTauri } from "../../services/sistema";
import { avisarDadosAlterados } from "../../state/useAoAlterarDados";
import type { Conta } from "../../types/accounting";

type Tipo = "DESPESA" | "RECEITA";

/**
 * Janela de lançamento rápido, aberta de qualquer tela com Ctrl+Shift+N ou,
 * mesmo com o app minimizado, com Ctrl+Alt+D (atalho global) e pelo ícone da bandeja.
 */
export function LancamentoRapido() {
  const [aberto, setAberto] = useState(false);
  const [contas, setContas] = useState<Conta[]>([]);
  const [tipo, setTipo] = useState<Tipo>("DESPESA");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [contaId, setContaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [data, setData] = useState(dataAtualISO());
  const [salvando, setSalvando] = useState(false);
  const primeiroCampo = useRef<HTMLInputElement>(null);

  async function abrir() {
    setAberto(true);
    setData(dataAtualISO());
    try {
      const lista = await contabilidade.listarContas();
      setContas(lista);
      const padraoConta = await lerPreferencia<string>("conta_padrao");
      const padraoCat = await lerPreferencia<string>("categoria_padrao");
      const origens = lista.filter((c) => (c.tipo === "ATIVO" || c.tipo === "PASSIVO") && c.subtipo !== "CATEGORIA" && c.ativa);
      setContaId((atual) => atual || (origens.some((c) => c.id === padraoConta) ? padraoConta! : origens[0]?.id ?? ""));
      setCategoriaId((atual) => atual || padraoCat || "");
    } catch (e) {
      toast.error(String(e));
    }
    window.setTimeout(() => primeiroCampo.current?.focus(), 50);
  }

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        abrir();
      } else if (e.key === "Escape") {
        setAberto(false);
      }
    };
    window.addEventListener("keydown", aoTeclar);
    let parar: (() => void) | undefined;
    let vivo = true;
    if (estaNoTauri()) {
      import("@tauri-apps/api/event").then(async ({ listen }) => {
        const fn = await listen("lancamento-rapido", () => abrir());
        if (vivo) parar = fn;
        else fn();
      });
    }
    return () => {
      vivo = false;
      window.removeEventListener("keydown", aoTeclar);
      parar?.();
    };
  }, []);

  const origens = contas.filter((c) =>
    tipo === "DESPESA"
      ? (c.tipo === "ATIVO" || c.tipo === "PASSIVO") && c.subtipo !== "CATEGORIA" && c.ativa
      : c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA" && c.ativa,
  );
  const categorias = contas.filter((c) => c.tipo === tipo && c.subtipo !== "CATEGORIA" && c.ativa);
  const categoriaValida = categorias.some((c) => c.id === categoriaId) ? categoriaId : categorias[0]?.id ?? "";
  const contaValida = origens.some((c) => c.id === contaId) ? contaId : origens[0]?.id ?? "";

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    const centavos = valorInputParaCentavos(valor);
    if (!descricao.trim() || centavos <= 0 || !contaValida || !categoriaValida) {
      toast.error("Preencha descrição, valor, conta e categoria.");
      return;
    }
    try {
      setSalvando(true);
      if (tipo === "DESPESA") {
        const l = await contabilidade.registrarDespesa({ conta_origem_id: contaValida, categoria_despesa_id: categoriaValida, valor_centavos: centavos, data, descricao: descricao.trim() });
        const { tagsComViagem } = await import("../../services/modoViagem");
        const tags = await tagsComViagem([], data);
        if (tags.length) await import("../../services/lancamentosExtras").then((m) => m.lancExtras.definirTags(l.id, tags)).catch(() => {});
      } else {
        await contabilidade.registrarRecebimento({ conta_destino_id: contaValida, conta_receita_id: categoriaValida, valor_centavos: centavos, data, descricao: descricao.trim() });
      }
      toast.success(tipo === "DESPESA" ? "Despesa lançada." : "Receita lançada.");
      setDescricao("");
      setValor("");
      setAberto(false);
      avisarDadosAlterados();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-24" role="dialog" aria-modal="true" aria-label="Lançamento rápido" onMouseDown={(e) => e.target === e.currentTarget && setAberto(false)}>
      <form onSubmit={salvar} className="w-full max-w-md space-y-3 rounded-2xl border border-borda bg-cartao p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-texto-primario"><Zap size={16} className="text-primaria" /> Lançamento rápido</h2>
          <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="rounded p-1 text-texto-secundario hover:text-texto-primario"><X size={16} /></button>
        </div>
        <div className="flex gap-2">
          {(["DESPESA", "RECEITA"] as const).map((t) => (
            <Button key={t} type="button" tamanho="pequeno" variante={tipo === t ? "primaria" : "secundaria"} onClick={() => setTipo(t)}>{t === "DESPESA" ? "Despesa" : "Receita"}</Button>
          ))}
        </div>
        <input ref={primeiroCampo} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição (ex.: Almoço)" aria-label="Descrição" className={`${CLASSE_INPUT} w-full`} />
        <div className="grid grid-cols-2 gap-2">
          <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="Valor (R$)" aria-label="Valor" className={CLASSE_INPUT} />
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} aria-label="Data" className={CLASSE_INPUT} />
        </div>
        <Select aria-label="Categoria" value={categoriaValida} onValueChange={setCategoriaId} options={categorias.map((c) => ({ value: c.id, label: c.nome }))} className="w-full" />
        <Select aria-label={tipo === "DESPESA" ? "Pago com" : "Recebido em"} value={contaValida} onValueChange={setContaId} options={origens.map((c) => ({ value: c.id, label: c.nome }))} className="w-full" />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-texto-secundario">Ctrl+Shift+N no app · Ctrl+Alt+D de qualquer lugar</span>
          <Button type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Lançar"}</Button>
        </div>
      </form>
    </div>
  );
}
