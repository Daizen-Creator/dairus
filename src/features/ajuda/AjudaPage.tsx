import { useState } from "react";
import { Link } from "react-router-dom";
import { CircleHelp, GraduationCap, Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { buscarAjuda } from "../../services/ajuda";
import { ANALISES } from "../ia/analises";
import { executarAnalise } from "../ia/AnalisesIA";
import { TextoIA } from "../ia/TextoIA";
import { PrimeirosPassos } from "./PrimeirosPassos";
import { EVENTO_TUTORIAL } from "./Tutorial";

const ATALHOS = [
  ["Ctrl + Alt + D", "Lançamento rápido, mesmo minimizado"],
  ["Ctrl + Shift + N", "Lançamento rápido dentro do app"],
  ["Ctrl + K", "Busca global"],
  ["Ctrl + L", "Bloquear (com PIN)"],
];

export function AjudaPage() {
  const [termo, setTermo] = useState("");
  const [resposta, setResposta] = useState<string | null>(null);
  const [perguntando, setPerguntando] = useState(false);
  const topicos = buscarAjuda(termo);

  async function perguntarIA() {
    try {
      setPerguntando(true);
      setResposta(await executarAnalise(ANALISES.find((a) => a.id === "duvida")!, termo));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPerguntando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-texto-primario"><CircleHelp size={20} className="text-primaria" /> Ajuda</h1>
          <p className="text-sm text-texto-secundario">Como usar cada parte do Dairus.</p>
        </div>
        <Button variante="secundaria" tamanho="pequeno" onClick={() => window.dispatchEvent(new CustomEvent(EVENTO_TUTORIAL))}><GraduationCap size={14} /> Ver o tutorial de novo</Button>
      </div>

      <PrimeirosPassos />

      <form onSubmit={(e) => { e.preventDefault(); if (termo.trim()) perguntarIA(); }} className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-secundario" />
          <input value={termo} onChange={(e) => { setTermo(e.target.value); setResposta(null); }} placeholder="O que você quer fazer? (ex.: compra parcelada, imposto de renda, backup)" aria-label="Buscar na ajuda" className={`${CLASSE_INPUT} w-full pl-9`} />
        </div>
        <Button type="submit" disabled={!termo.trim() || perguntando}>{perguntando ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Perguntar à IA</Button>
      </form>
      {resposta && <div className="rounded-xl border border-primaria/40 bg-primaria/5 p-4 text-sm text-texto-primario"><TextoIA texto={resposta} /></div>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {topicos.map((t) => (
          <Secao key={t.id} titulo={t.titulo}>
            <p className="text-sm text-texto-secundario">{t.texto}</p>
            <Link to={t.rota} className="mt-2 inline-block text-xs text-primaria hover:underline">Abrir {t.titulo} →</Link>
          </Secao>
        ))}
        {topicos.length === 0 && <p className="text-sm text-texto-secundario">Nada encontrado. Tente outras palavras ou pergunte à IA.</p>}
      </div>

      <Secao titulo="Atalhos principais">
        <ul className="grid gap-1.5 text-sm sm:grid-cols-2">{ATALHOS.map(([k, d]) => <li key={k} className="flex items-center justify-between gap-3"><span className="text-texto-secundario">{d}</span><kbd className="rounded border border-borda bg-fundo px-1.5 py-0.5 text-[11px] text-texto-primario">{k}</kbd></li>)}</ul>
      </Secao>
    </div>
  );
}
