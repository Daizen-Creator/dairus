import { useState } from "react";
import { BookA, Bug, Calculator, ChevronDown, ChevronRight, HeartPulse, Lightbulb, Newspaper } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { dataAtualISO } from "../../services/formato";
import changelog from "../../../CHANGELOG.md?raw";
import { dicaDoDia, FAQ, GLOSSARIO, jurosCompostosSimples, notaQuiz, porcentagem, QUIZ } from "./conteudoAjuda";

const num = (t: string) => Number(t.replace(/\./g, "").replace(",", ".")) || 0;
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Dica do dia, perguntas frequentes, glossário, quiz, calculadoras, novidades e relatar problema. */
export function ExtrasAjuda() {
  const [aberta, setAberta] = useState<number | null>(null);
  const [termo, setTermo] = useState("");
  const [marcadas, setMarcadas] = useState<boolean[]>(QUIZ.map(() => false));
  const [pct, setPct] = useState({ valor: "", pct: "" });
  const [jc, setJc] = useState({ inicial: "", mensal: "", taxa: "1", meses: "12" });
  const nota = notaQuiz(marcadas);
  const glossario = GLOSSARIO.filter(([t, d]) => !termo.trim() || `${t} ${d}`.toLowerCase().includes(termo.toLowerCase()));
  const p = porcentagem(num(pct.valor), num(pct.pct));
  const novidades = changelog.split(/\n## /)[1]?.split("\n").slice(1).filter((l) => l.startsWith("- ")).map((l) => l.slice(2)) ?? [];

  async function relatar() {
    const texto = `Versão do app: ${navigator.userAgent}\nO que aconteceu:\n\nO que eu esperava:\n`;
    await navigator.clipboard.writeText(texto).catch(() => {});
    const url = `https://github.com/Daizen-Creator/dairus/issues/new?title=${encodeURIComponent("Problema: ")}&body=${encodeURIComponent(texto)}`;
    await import("@tauri-apps/plugin-opener").then((m) => m.openUrl(url)).catch(() => window.open(url, "_blank"));
    toast.info("Abrimos a página de relato. Anexe também o log (Configurações → Windows e avisos → Abrir pasta do log).");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-primaria/40 bg-primaria/5 p-3 text-sm text-texto-primario"><Lightbulb size={16} className="mt-0.5 shrink-0 text-primaria" /> <span><strong>Dica do dia:</strong> {dicaDoDia(dataAtualISO())}</span></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Perguntas frequentes">
          <ul className="divide-y divide-borda">
            {FAQ.map(([q, r], i) => (
              <li key={q}>
                <button onClick={() => setAberta(aberta === i ? null : i)} className="flex w-full items-center gap-2 py-2 text-left text-sm text-texto-primario">{aberta === i ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {q}</button>
                {aberta === i && <p className="pb-2 pl-6 text-sm text-texto-secundario">{r}</p>}
              </li>
            ))}
          </ul>
        </Secao>
        <Secao titulo={<><BookA size={15} className="text-secundaria" /> Glossário</>}>
          <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar termo (ex.: CDI)" aria-label="Buscar no glossário" className={`${CLASSE_INPUT} mb-2 w-full`} />
          <dl className="max-h-72 space-y-2 overflow-y-auto pr-1 text-sm">{glossario.map(([t, d]) => <div key={t}><dt className="font-semibold text-texto-primario">{t}</dt><dd className="text-texto-secundario">{d}</dd></div>)}</dl>
        </Secao>
        <Secao titulo={<><HeartPulse size={15} className="text-sucesso" /> Check-up de 1 minuto</>}>
          <ul className="space-y-1">{QUIZ.map((q, i) => <li key={q.pergunta}><label className="flex items-center gap-2 text-sm text-texto-primario"><input type="checkbox" checked={marcadas[i]} onChange={() => setMarcadas(marcadas.map((m, j) => (j === i ? !m : m)))} className="h-4 w-4 accent-[var(--cor-primaria)]" />{q.pergunta}</label></li>)}</ul>
          <p className="mt-2 text-sm"><strong>{nota.pontos} de {nota.maximo}</strong> — {nota.texto}</p>
        </Secao>
        <Secao titulo={<><Calculator size={15} className="text-alerta" /> Calculadoras rápidas</>}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input value={pct.pct} onChange={(e) => setPct({ ...pct, pct: e.target.value })} placeholder="%" aria-label="Porcentagem" className={`${CLASSE_INPUT} w-16 py-1`} /> de
            <input value={pct.valor} onChange={(e) => setPct({ ...pct, valor: e.target.value })} placeholder="valor" aria-label="Valor" className={`${CLASSE_INPUT} w-28 py-1`} />
            {num(pct.valor) > 0 && num(pct.pct) > 0 && <span className="text-texto-secundario">= <strong className="text-texto-primario">{reais(p.parte)}</strong> · com aumento {reais(p.comAumento)} · com desconto {reais(p.comDesconto)}</span>}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-texto-secundario sm:grid-cols-4">
            <label>Começo com<input value={jc.inicial} onChange={(e) => setJc({ ...jc, inicial: e.target.value })} className={`${CLASSE_INPUT} w-full py-1`} /></label>
            <label>Guardo por mês<input value={jc.mensal} onChange={(e) => setJc({ ...jc, mensal: e.target.value })} className={`${CLASSE_INPUT} w-full py-1`} /></label>
            <label>Rende % ao mês<input value={jc.taxa} onChange={(e) => setJc({ ...jc, taxa: e.target.value })} className={`${CLASSE_INPUT} w-full py-1`} /></label>
            <label>Por meses<input value={jc.meses} onChange={(e) => setJc({ ...jc, meses: e.target.value })} className={`${CLASSE_INPUT} w-full py-1`} /></label>
          </div>
          {(num(jc.inicial) > 0 || num(jc.mensal) > 0) && <p className="mt-2 text-sm">Juntaria <strong>{reais(jurosCompostosSimples(num(jc.inicial), num(jc.mensal), num(jc.taxa), Math.min(1200, num(jc.meses))))}</strong> (você colocou {reais(num(jc.inicial) + num(jc.mensal) * num(jc.meses))}).</p>}
        </Secao>
        <Secao titulo={<><Newspaper size={15} className="text-destaque" /> Novidades desta versão</>}>
          <ul className="max-h-60 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-texto-secundario">{novidades.map((n) => <li key={n}>{n}</li>)}</ul>
        </Secao>
        <Secao titulo={<><Bug size={15} className="text-erro" /> Encontrou um problema?</>}>
          <p className="text-sm text-texto-secundario">Abre a página de relato no GitHub com um modelo pronto. Conte o que fez e o que esperava; anexe o arquivo de log se puder.</p>
          <Button className="mt-2" tamanho="pequeno" variante="secundaria" onClick={relatar}><Bug size={13} /> Relatar problema</Button>
        </Secao>
      </div>
    </div>
  );
}
