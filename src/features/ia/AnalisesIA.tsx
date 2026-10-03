import { useState } from "react";
import { Copy, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT } from "../../components/ui/Campos";
import { lerPreferencia } from "../../services/armazenamento";
import { manualEmTexto } from "../../services/ajuda";
import { carregarFatos, fatosEmTexto } from "../../services/fatosFinanceiros";
import { dataAtualISO, formatarCentavos } from "../../services/formato";
import { INSTRUCAO_BASE, perguntarIA } from "../../services/gemini";
import { ANALISES, montarPergunta, type Analise } from "./analises";
import { TextoIA } from "./TextoIA";

const TONS: Record<string, string> = {
  CONCISO: "Seja direto (até ~12 linhas).",
  DETALHADO: "Seja detalhado, com passos e justificativas.",
  DIDATICO: "Explique de forma didática, como para um iniciante.",
};

/** Monta o contexto da análise: fatos calculados + previsão + manual, conforme a análise. */
export async function contextoDaAnalise(a: Analise, hoje: string): Promise<string> {
  const privado = (await lerPreferencia<boolean>("gemini_anonimo")) ?? false;
  const partes = [fatosEmTexto(await carregarFatos(hoje), privado)];
  if (a.previsao) {
    try {
      const { calcularPrevisao } = await import("../relatorios/RelatoriosExtras");
      const p = await calcularPrevisao(hoje, 90);
      partes.push(`PREVISÃO DE SALDO (estimativa do Dairus): hoje ${formatarCentavos(p.saldoInicial)}; em 30 dias ${formatarCentavos(p.em30)}; 60 dias ${formatarCentavos(p.em60)}; 90 dias ${formatarCentavos(p.em90)}; menor saldo ${formatarCentavos(p.minimo.saldo)} em ${p.minimo.data}${p.primeiroNegativo ? `; fica negativo em ${p.primeiroNegativo}` : ""}. Gasto diário médio considerado ${formatarCentavos(p.gastoDiario)}. Principais eventos: ${p.eventos.slice(0, 15).map((e) => `${e.data} ${privado ? "(item)" : e.descricao} ${formatarCentavos(e.valor)}`).join("; ")}.`);
    } catch {
      // previsão indisponível: segue sem ela
    }
  }
  if (a.manual) partes.push(`MANUAL DO DAIRUS:\n${manualEmTexto()}`);
  return partes.join("\n\n");
}

export async function executarAnalise(a: Analise, entrada: string, hoje = dataAtualISO()): Promise<string> {
  const tom = (await lerPreferencia<string>("gemini_tom")) ?? "CONCISO";
  return perguntarIA({ instrucao: `${INSTRUCAO_BASE}\nOs números do contexto já foram calculados pelo Dairus: use-os sem recalcular. Marque como "estimativa" tudo o que for projeção sua.\n${TONS[tom] ?? ""}`, contexto: await contextoDaAnalise(a, hoje), pergunta: montarPergunta(a, entrada) });
}

export function AnalisesIA({ temChave }: { temChave: boolean }) {
  const [selecionada, setSelecionada] = useState<Analise | null>(null);
  const [entrada, setEntrada] = useState("");
  const [resposta, setResposta] = useState<{ titulo: string; texto: string } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const grupos = [...new Set(ANALISES.map((a) => a.grupo))];

  async function rodar(a: Analise) {
    if (a.entrada && !entrada.trim()) {
      setSelecionada(a);
      return;
    }
    try {
      setCarregando(true);
      setSelecionada(a);
      setResposta({ titulo: a.rotulo, texto: await executarAnalise(a, entrada) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }

  if (!temChave) return <p className="rounded-xl border border-borda bg-cartao p-4 text-sm text-texto-secundario">Adicione sua chave do Gemini (aba “Conexão e privacidade”) para usar as análises.</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section className="space-y-4 rounded-xl border border-borda bg-cartao p-4">
        {grupos.map((g) => (
          <div key={g}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-texto-secundario">{g}</p>
            <div className="flex flex-wrap gap-1.5">
              {ANALISES.filter((a) => a.grupo === g).map((a) => (
                <button
                  key={a.id}
                  onClick={() => { setEntrada(""); setResposta(null); if (a.entrada) setSelecionada(a); else rodar(a); }}
                  disabled={carregando}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${selecionada?.id === a.id ? "border-primaria text-primaria" : "border-borda text-texto-secundario hover:border-primaria hover:text-primaria"}`}
                >
                  {a.rotulo}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="text-xs text-texto-secundario">Os números são calculados pelo Dairus e enviados prontos; a IA só interpreta. Respeita o “modo privado” da aba de conexão. Não é aconselhamento financeiro profissional.</p>
      </section>

      <section className="min-h-48 rounded-xl border border-borda bg-cartao p-4">
        {selecionada?.entrada && (
          <form onSubmit={(e) => { e.preventDefault(); rodar(selecionada); }} className="mb-3 flex flex-wrap gap-2">
            <input autoFocus value={entrada} onChange={(e) => setEntrada(e.target.value)} placeholder={selecionada.entrada} aria-label={selecionada.entrada} className={`${CLASSE_INPUT} min-w-0 flex-1`} />
            <Button type="submit" disabled={carregando || !entrada.trim()}><Sparkles size={14} /> Analisar</Button>
          </form>
        )}
        {carregando ? (
          <p className="flex items-center gap-2 text-sm text-texto-secundario"><Loader2 size={14} className="animate-spin" /> Analisando seus dados…</p>
        ) : resposta ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-texto-primario">{resposta.titulo}</p>
              <button onClick={() => navigator.clipboard.writeText(resposta.texto).then(() => toast.success("Copiado."))} aria-label="Copiar análise" className="text-texto-secundario hover:text-primaria"><Copy size={14} /></button>
            </div>
            <div className="text-sm text-texto-primario"><TextoIA texto={resposta.texto} /></div>
          </div>
        ) : (
          <p className="text-sm text-texto-secundario">Escolha uma análise ao lado.</p>
        )}
      </section>
    </div>
  );
}
