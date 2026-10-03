import { BellOff, ClipboardCopy, Eraser, LayoutList, Rows3, GraduationCap, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { NAVEGACAO } from "../../app/navegacao";
import { contabilidade } from "../../services/contabilidade";
import { salvarPreferencia } from "../../services/armazenamento";
import { usePreferencia } from "../../state/usePreferencia";

const GRUPOS: Array<[string, string]> = [
  ["contas", "Contas a pagar e receber"],
  ["cartoes", "Cartões (fatura, limite, teto)"],
  ["orcamento", "Orçamento"],
  ["saldo", "Saldo (mínimo, negativo, risco)"],
  ["metas", "Metas e desafios"],
  ["investimentos", "Investimentos"],
  ["pessoas", "Cobranças de pessoas"],
  ["documentos", "Garantias e documentos"],
  ["backup", "Backup"],
  ["outros", "Outros"],
];
const HORAS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, "0")}h` }));

/** Mais opções: quais avisos receber, antecedência, horário silencioso, menu, densidade, diagnóstico e limpezas. */
export function MaisOpcoes({ versao }: { versao: string }) {
  const [desligados, setDesligados] = usePreferencia<string[]>("avisos_grupos_desligados", []);
  const [dias, setDias] = usePreferencia<number[]>("dias_aviso_contas", [3, 1, 0]);
  const [silencio, setSilencio] = usePreferencia<{ ativo: boolean; inicio: number; fim: number }>("avisos_silencio", { ativo: false, inicio: 22, fim: 7 });
  const [menuOculto, setMenuOculto] = usePreferencia<string[]>("menu_oculto", []);
  const [compacto, setCompacto] = usePreferencia<boolean>("ui_compacto", false);

  async function diagnostico() {
    try {
      const [contas, lancs, ag] = await Promise.all([contabilidade.listarContas(), contabilidade.listarLancamentos(100000), contabilidade.listarAgendamentos()]);
      const texto = [
        `Dairus ${versao}`,
        `Sistema: ${navigator.userAgent}`,
        `Contas: ${contas.length} (${contas.filter((c) => !c.sistema).length} criadas) · Lançamentos: ${lancs.length} · Agendamentos: ${ag.length}`,
        `Tela: ${window.innerWidth}x${window.innerHeight} · Idioma: ${navigator.language} · Online: ${navigator.onLine ? "sim" : "não"}`,
        `Data: ${new Date().toISOString()}`,
      ].join("\n");
      await navigator.clipboard.writeText(texto);
      toast.success("Diagnóstico copiado (sem valores nem dados pessoais). Cole na mensagem para o suporte.");
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Secao titulo={<><BellOff size={16} className="text-primaria" /> Quais avisos receber</>}>
        <ul className="grid gap-1 sm:grid-cols-2">
          {GRUPOS.map(([id, rot]) => (
            <li key={id}><label className="flex items-center gap-2 text-sm text-texto-primario"><input type="checkbox" checked={!desligados.includes(id)} onChange={() => setDesligados(desligados.includes(id) ? desligados.filter((x) => x !== id) : [...desligados, id])} className="h-4 w-4 accent-[var(--cor-primaria)]" />{rot}</label></li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-texto-primario">
          <label className="flex items-center gap-2"><input type="checkbox" checked={silencio.ativo} onChange={() => setSilencio({ ...silencio, ativo: !silencio.ativo })} className="h-4 w-4 accent-[var(--cor-primaria)]" />Não avisar entre</label>
          <Select aria-label="Início do silêncio" value={String(silencio.inicio)} onValueChange={(v) => setSilencio({ ...silencio, inicio: Number(v) })} options={HORAS} className="w-20" />
          e
          <Select aria-label="Fim do silêncio" value={String(silencio.fim)} onValueChange={(v) => setSilencio({ ...silencio, fim: Number(v) })} options={HORAS} className="w-20" />
        </div>
      </Secao>
      <Secao titulo={<><CalendarClock size={16} className="text-alerta" /> Antecedência dos avisos de contas</>}>
        <div className="flex flex-wrap gap-2 text-sm">
          {[7, 5, 3, 2, 1, 0].map((d) => (
            <label key={d} className="flex items-center gap-1.5 text-texto-primario"><input type="checkbox" checked={dias.includes(d)} onChange={() => setDias(dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d].sort((a, b) => b - a))} className="h-4 w-4 accent-[var(--cor-primaria)]" />{d === 0 ? "No dia" : d === 1 ? "1 dia antes" : `${d} dias antes`}</label>
          ))}
        </div>
      </Secao>
      <Secao titulo={<><LayoutList size={16} className="text-secundaria" /> Itens do menu lateral</>}>
        <ul className="grid gap-1 sm:grid-cols-2">
          {NAVEGACAO.filter((n) => !["/", "/configuracoes", "/ajuda"].includes(n.rota)).map((n) => (
            <li key={n.rota}><label className="flex items-center gap-2 text-sm text-texto-primario"><input type="checkbox" checked={!menuOculto.includes(n.rota)} onChange={() => setMenuOculto(menuOculto.includes(n.rota) ? menuOculto.filter((x) => x !== n.rota) : [...menuOculto, n.rota])} className="h-4 w-4 accent-[var(--cor-primaria)]" />{n.rotulo}</label></li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-texto-secundario">Itens escondidos continuam acessíveis pela busca (Ctrl+K) e pelos atalhos.</p>
      </Secao>
      <Secao titulo={<><Rows3 size={16} className="text-destaque" /> Interface e suporte</>}>
        <div className="flex flex-col items-start gap-2 text-sm">
          <label className="flex items-center gap-2 text-texto-primario"><input type="checkbox" checked={compacto} onChange={() => { setCompacto(!compacto); document.documentElement.classList.toggle("compacto", !compacto); }} className="h-4 w-4 accent-[var(--cor-primaria)]" />Modo compacto (mais coisas na tela)</label>
          <Button tamanho="pequeno" variante="secundaria" onClick={() => salvarPreferencia("primeiros_passos_ocultos", false).then(() => toast.success("Primeiros passos voltaram ao Início."))}><GraduationCap size={13} /> Mostrar primeiros passos de novo</Button>
          <Button tamanho="pequeno" variante="secundaria" onClick={() => salvarPreferencia("gemini_historico", []).then(() => toast.success("Conversa com a IA apagada."))}><Eraser size={13} /> Apagar conversa com a IA</Button>
          <Button tamanho="pequeno" variante="secundaria" onClick={() => salvarPreferencia("avisos_enviados", {}).then(() => toast.success("Avisos de hoje poderão aparecer de novo."))}><Eraser size={13} /> Reenviar avisos de hoje</Button>
          <Button tamanho="pequeno" variante="secundaria" onClick={diagnostico}><ClipboardCopy size={13} /> Copiar diagnóstico para suporte</Button>
        </div>
      </Secao>
    </div>
  );
}
