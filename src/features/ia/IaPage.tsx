import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, KeyRound, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { contabilidade } from "../../services/contabilidade";
import { despesasPorCategoriaNoMes } from "../../services/agregacoes";
import { lerPreferencia, salvarPreferencia } from "../../services/armazenamento";
import { extras } from "../../services/extras";
import { dataAtualISO, formatarCentavos, nomeMesAno, primeiroDiaDoMesISO, ultimoDiaDoMesISO } from "../../services/formato";

interface Mensagem {
  papel: "usuario" | "ia";
  texto: string;
}

const MODELO_PADRAO = "gemini-2.5-flash";

const INSTRUCAO = `Você é o assistente financeiro do app Dairus, de um usuário brasileiro (valores em reais).
Regras: responda em português do Brasil, de forma curta e prática. Use somente os dados fornecidos no contexto;
nunca invente números. Sempre identifique claramente o que é dado real do usuário e o que é estimativa ou projeção sua.
Você não é consultor financeiro licenciado: não recomende investimentos específicos nem prometa resultados.
Sugestões de orçamento são opcionais e a decisão é sempre do usuário.`;

/** Resumo em texto dos dados reais do mês — é exatamente isto que vai para o Gemini. */
async function montarContexto(): Promise<string> {
  const hoje = dataAtualISO();
  const ini = primeiroDiaDoMesISO(hoje);
  const fim = ultimoDiaDoMesISO(hoje);
  const [resumo, contas, lancs, agend, metas, orcs] = await Promise.all([
    contabilidade.obterResumoDashboard(ini, fim),
    contabilidade.listarContas(),
    contabilidade.listarLancamentos(2000),
    contabilidade.listarAgendamentos(),
    extras.listarMetas(),
    extras.listarOrcamentos(),
  ]);
  const cat = despesasPorCategoriaNoMes(lancs, contas, ini, fim);
  const limites = new Map(orcs.map((o) => [o.categoria_id, o.limite_centavos]));
  const abertos = agend.filter((a) => !a.pago_em);
  const linhas = [
    `Data de hoje: ${hoje}. Mês de referência: ${nomeMesAno(hoje)}.`,
    `Saldo disponível nas contas: ${formatarCentavos(resumo.saldo_disponivel_centavos)}.`,
    `Receitas no mês: ${formatarCentavos(resumo.receitas_mes_centavos)}. Despesas no mês: ${formatarCentavos(resumo.despesas_mes_centavos)}.`,
    `Despesas por categoria no mês: ${cat.length ? cat.map((c) => `${c.nome} ${formatarCentavos(c.valorCentavos)}${limites.has(c.contaId) ? ` (limite ${formatarCentavos(limites.get(c.contaId)!)})` : ""}`).join("; ") : "nenhuma"}.`,
    `Contas a pagar em aberto: ${abertos.length ? abertos.map((a) => `${a.descricao} ${formatarCentavos(a.valor_centavos)} vence ${a.vencimento}`).join("; ") : "nenhuma"}.`,
    `Metas: ${metas.length ? metas.map((m) => `${m.nome} ${formatarCentavos(m.guardado_centavos)} de ${formatarCentavos(m.valor_alvo_centavos)}`).join("; ") : "nenhuma"}.`,
  ];
  return linhas.join("\n");
}

async function perguntarAoGemini(chave: string, modelo: string, contexto: string, historico: Mensagem[]): Promise<string> {
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${INSTRUCAO}\n\nDADOS DO USUÁRIO:\n${contexto}` }] },
      contents: historico.map((m) => ({ role: m.papel === "usuario" ? "user" : "model", parts: [{ text: m.texto }] })),
    }),
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok) {
    throw new Error(json?.error?.message ?? `Erro ${resp.status} ao consultar o Gemini.`);
  }
  const texto = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!texto) throw new Error("O Gemini não retornou resposta (conteúdo bloqueado ou vazio).");
  return texto;
}

export function IaPage() {
  const [chave, setChave] = useState("");
  const [modelo, setModelo] = useState(MODELO_PADRAO);
  const [rascunhoChave, setRascunhoChave] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [pergunta, setPergunta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [contexto, setContexto] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    lerPreferencia<string>("gemini_chave").then((c) => c && setChave(c));
    lerPreferencia<string>("gemini_modelo").then((m) => m && setModelo(m));
  }, []);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  async function salvarChave(ev: React.FormEvent) {
    ev.preventDefault();
    await salvarPreferencia("gemini_chave", rascunhoChave.trim() || null);
    await salvarPreferencia("gemini_modelo", modelo.trim() || MODELO_PADRAO);
    setChave(rascunhoChave.trim());
    setRascunhoChave("");
    toast.success(rascunhoChave.trim() ? "Chave salva neste computador." : "Chave removida.");
  }

  async function mostrarDados() {
    setContexto(contexto ? null : await montarContexto());
  }

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    const texto = pergunta.trim();
    if (!texto || enviando) return;
    const novo: Mensagem[] = [...mensagens, { papel: "usuario", texto }];
    setMensagens(novo);
    setPergunta("");
    try {
      setEnviando(true);
      const resposta = await perguntarAoGemini(chave, modelo, await montarContexto(), novo);
      setMensagens([...novo, { papel: "ia", texto: resposta }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setMensagens(mensagens);
      setPergunta(texto);
    } finally {
      setEnviando(false);
    }
  }

  const sugestoes = ["Resuma meus gastos deste mês.", "Onde posso economizar?", "Quais contas vencem em breve?"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-texto-primario">
          <Sparkles size={20} className="text-primaria" /> Inteligência Artificial
        </h1>
        <p className="text-sm text-texto-secundario">Assistente com Google Gemini, usando a sua própria chave de API.</p>
      </div>

      <Secao titulo={<><KeyRound size={16} className="text-alerta" /> Conexão com o Gemini</>}>
        <form onSubmit={salvarChave} className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <input
              type={mostrar ? "text" : "password"}
              value={rascunhoChave}
              onChange={(e) => setRascunhoChave(e.target.value)}
              placeholder={chave ? "Chave salva — digite para trocar" : "Cole sua chave de API do Gemini"}
              aria-label="Chave de API do Gemini"
              autoComplete="off"
              className={`${CLASSE_INPUT} w-80 pr-9`}
            />
            <button type="button" onClick={() => setMostrar((v) => !v)} aria-label="Mostrar ou ocultar a chave" className="absolute right-2 top-1/2 -translate-y-1/2 text-texto-secundario">
              {mostrar ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <input value={modelo} onChange={(e) => setModelo(e.target.value)} aria-label="Modelo" className={`${CLASSE_INPUT} w-48`} />
          <Button type="submit" variante="secundaria">Salvar</Button>
        </form>
        <p className="mt-3 text-xs leading-relaxed text-texto-secundario">
          Gere a chave no Google AI Studio. Ela fica salva apenas neste computador (arquivo de preferências do app, sem
          criptografia). Ao enviar uma pergunta, o Dairus manda ao Google um resumo dos seus dados do mês — veja abaixo
          exatamente o quê. Nada é enviado antes de você perguntar.
        </p>
        <button onClick={mostrarDados} className="mt-2 text-xs text-primaria hover:underline">
          {contexto ? "Ocultar dados enviados" : "Ver os dados que serão enviados"}
        </button>
        {contexto && (
          <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-borda bg-fundo p-3 text-xs text-texto-secundario">{contexto}</pre>
        )}
      </Secao>

      <section className="rounded-xl border border-borda bg-cartao p-4">
        {!chave ? (
          <p className="text-sm text-texto-secundario">Adicione sua chave do Gemini acima para conversar com o assistente.</p>
        ) : (
          <>
            <div className="max-h-[420px] min-h-40 space-y-3 overflow-y-auto pr-1">
              {mensagens.length === 0 && (
                <div className="flex flex-wrap gap-2">
                  {sugestoes.map((s) => (
                    <button key={s} onClick={() => setPergunta(s)} className="rounded-full border border-borda px-3 py-1.5 text-xs text-texto-secundario transition-colors hover:border-primaria hover:text-primaria">
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {mensagens.map((m, i) => (
                <div key={i} className={`flex ${m.papel === "usuario" ? "justify-end" : "justify-start"}`}>
                  <p
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                      m.papel === "usuario" ? "bg-gradient-to-r from-primaria to-destaque text-primaria-texto" : "border border-borda bg-fundo text-texto-primario"
                    }`}
                  >
                    {m.texto}
                  </p>
                </div>
              ))}
              {enviando && <p className="text-xs text-texto-secundario">Pensando…</p>}
              <div ref={fimRef} />
            </div>
            <form onSubmit={enviar} className="mt-3 flex items-center gap-2">
              <input value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="Pergunte sobre suas finanças…" aria-label="Pergunta" className={`${CLASSE_INPUT} flex-1`} />
              <Button type="submit" disabled={enviando || !pergunta.trim()}>
                <Send size={14} /> Enviar
              </Button>
            </form>
            <p className="mt-2 text-xs text-texto-secundario">
              As respostas são geradas por IA e podem conter erros. Não são aconselhamento financeiro profissional.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
