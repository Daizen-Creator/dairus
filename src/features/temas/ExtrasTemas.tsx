import { useEffect, useRef, useState } from "react";
import { CalendarDays, Dices, Eye, Paintbrush, RotateCcw, Type } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { usePreferencia } from "../../state/usePreferencia";
import { definirCorPrimaria, useThemeStore } from "../../state/theme-store";
import type { Tema } from "../../types/theme";
import { aleatorio } from "./temasExtras";

const FONTES = [
  { value: "", label: "Fonte padrão" },
  { value: "system-ui, 'Segoe UI', sans-serif", label: "Do Windows (Segoe UI)" },
  { value: "Georgia, 'Times New Roman', serif", label: "Com serifa" },
  { value: "'Cascadia Code', Consolas, monospace", label: "Monoespaçada" },
  { value: "Verdana, Tahoma, sans-serif", label: "Mais legível (Verdana)" },
];

export function aplicarFonte(f: string) {
  document.body.style.fontFamily = f;
}

/** Atalhos de tema: aleatório, testar por 10 s, tema do dia, cor primária própria, fonte e restaurar. */
export function ExtrasTemas({ temas, favoritos }: { temas: Tema[]; favoritos: string[] }) {
  const { selecionarTema, temaAtivo } = useThemeStore();
  const [temaDia, setTemaDia] = usePreferencia<boolean>("tema_do_dia", false);
  const [cor, setCor] = usePreferencia<string>("cor_primaria_custom", "");
  const [fonte, setFonte] = usePreferencia<string>("ui_fonte_familia", "");
  const [testando, setTestando] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  function testar() {
    const atual = temaAtivo().id;
    const t = aleatorio(temas, temas.find((x) => x.id === atual));
    if (!t) return;
    setTestando(t.nome);
    selecionarTema(t.id);
    timer.current = window.setTimeout(() => {
      selecionarTema(atual);
      setTestando(null);
    }, 10_000);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-borda bg-cartao p-3 text-sm">
      <Button tamanho="pequeno" variante="secundaria" onClick={() => { const t = aleatorio(temas, temaAtivo()); if (t) { selecionarTema(t.id); toast.success(`Tema: ${t.nome}`); } }}><Dices size={13} /> Surpreenda-me</Button>
      <Button tamanho="pequeno" variante="secundaria" onClick={testar} disabled={!!testando}><Eye size={13} /> {testando ? `Testando “${testando}”…` : "Testar um por 10 s"}</Button>
      <Button tamanho="pequeno" variante="fantasma" onClick={() => { selecionarTema("noite-urbana"); setCor(""); definirCorPrimaria(null); toast.success("Tema padrão restaurado."); }}><RotateCcw size={13} /> Padrão</Button>
      <label className="flex items-center gap-1.5 text-texto-primario"><input type="checkbox" checked={temaDia} onChange={() => { setTemaDia(!temaDia); if (!temaDia && !favoritos.length) toast.info("Favorite alguns temas (☆) para o tema do dia girar entre eles."); }} className="h-4 w-4 accent-[var(--cor-primaria)]" /><CalendarDays size={13} /> Tema do dia (entre os favoritos)</label>
      <label className="flex items-center gap-1.5 text-texto-primario"><Paintbrush size={13} /> Cor principal
        <input type="color" value={cor || temaAtivo().cores.primaria} onChange={(e) => { setCor(e.target.value); definirCorPrimaria(e.target.value); }} aria-label="Cor principal personalizada" className="h-7 w-9 cursor-pointer rounded border border-borda bg-transparent" />
        {cor && <button onClick={() => { setCor(""); definirCorPrimaria(null); }} className="text-xs text-texto-secundario hover:underline">a do tema</button>}
      </label>
      <span className="flex items-center gap-1.5"><Type size={13} className="text-texto-secundario" />
        <Select aria-label="Fonte" value={fonte} onValueChange={(v) => { setFonte(v); aplicarFonte(v); }} options={FONTES} className="w-48" />
      </span>
    </div>
  );
}
