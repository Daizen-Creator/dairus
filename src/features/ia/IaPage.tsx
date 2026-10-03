import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  ListChecks,
  Mic,
  PlugZap,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Abas, useAbaDaPagina } from "../../components/ui/Abas";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { despesasPorCategoriaNoMes } from "../../services/agregacoes";
import { lerPreferencia, salvarPreferencia } from "../../services/armazenamento";
import { extras } from "../../services/extras";
import { dataAtualISO, formatarCentavos, nomeMesAno, primeiroDiaDoMesISO, ultimoDiaDoMesISO } from "../../services/formato";
import { usePreferencia } from "../../state/usePreferencia";
import { chamarGemini, limparChave, tipoDaChave } from "../../services/gemini";

import type { Mensagem } from "../../services/gemini";
import { TextoIA as Texto } from "./TextoIA";
import { LancarComIA } from "./LancarComIA";
import { AnalisesIA } from "./AnalisesIA";
import { OrganizarIA } from "./OrganizarIA";

type Bloco = "saldos" | "categorias" | "contas_a_pagar" | "metas" | "orcamento" | "patrimonio" | "transacoes";

const BLOCOS: Array<{ id: Bloco; rotulo: string; padrao: boolean }> = [
  { id: "saldos", rotulo: "Saldos e totais do mês", padrao: true },
  { id: "categorias", rotulo: "Gastos por categoria", padrao: true },
  { id: "contas_a_pagar", rotulo: "Contas a pagar", padrao: true },
  { id: "metas", rotulo: "Metas", padrao: true },
  { id: "orcamento", rotulo: "Limites do orçamento", padrao: true },
  { id: "patrimonio", rotulo: "Patrimônio (bens e dívidas)", padrao: false },
  { id: "transacoes", rotulo: "Últimas transações", padrao: false },
];

const MODELOS = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (rápido)" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro (mais capaz)" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
];

const SUGESTOES = [
  "Resuma meus gastos deste mês.",
  "Onde posso economizar?",
  "Quais contas vencem em breve e quanto vou precisar?",
  "Estou gastando acima do ritmo nos meus limites?",
  "Como está minha reserva de emergência?",
  "Monte um plano para atingir minhas metas.",
  "Faça uma projeção do saldo no fim do mês (diga o que é estimativa).",
  "Explique minha situação como se eu fosse iniciante em finanças.",
];

const TONS: Record<string, string> = {
  CONCISO: "Responda de forma curta e direta (no máximo ~8 linhas).",
  DETALHADO: "Responda de forma detalhada, com passos e justificativas.",
  DIDATICO: "Explique de forma didática, com exemplos simples, como para um iniciante.",
};

const INSTRUCAO = `Você é o assistente financeiro do app Dairus, de um usuário brasileiro (valores em reais).
Regras: responda em português do Brasil. Use somente os dados fornecidos no contexto;
nunca invente números. Sempre identifique claramente o que é dado real do usuário e o que é estimativa ou projeção sua.
Você não é consultor financeiro licenciado: não recomende investimentos específicos nem prometa resultados.
Sugestões de orçamento são opcionais e a decisão é sempre do usuário. Se faltar dado, diga o que falta.`;

async function montarContexto(blocos: Set<Bloco>, anonimo: boolean, nTransacoes: number): Promise<string> {
  const hoje = dataAtualISO();
  const ini = primeiroDiaDoMesISO(hoje);
  const fim = ultimoDiaDoMesISO(hoje);
  const [resumo, contas, lancs, agend, metas, orcs, bens] = await Promise.all([
    contabilidade.obterResumoDashboard(ini, fim),
    contabilidade.listarContas(),
    contabilidade.listarLancamentos(2000),
    contabilidade.listarAgendamentos(),
    extras.listarMetas(),
    extras.listarOrcamentos(),
    extras.listarBens(),
  ]);
  const linhas = [`Data de hoje: ${hoje}. Mês de referência: ${nomeMesAno(hoje)}.`];
  const nome = (s: string) => (anonimo ? "(item)" : s);
  if (blocos.has("saldos")) {
    linhas.push(`Saldo disponível nas contas: ${formatarCentavos(resumo.saldo_disponivel_centavos)}.`);
    linhas.push(`Receitas no mês: ${formatarCentavos(resumo.receitas_mes_centavos)}. Despesas no mês: ${formatarCentavos(resumo.despesas_mes_centavos)}.`);
  }
  const cat = despesasPorCategoriaNoMes(lancs, contas, ini, fim);
  const limites = new Map(orcs.map((o) => [o.categoria_id, o.limite_centavos]));
  if (blocos.has("categorias")) {
    linhas.push(`Despesas por categoria no mês: ${cat.length ? cat.map((c) => `${c.nome} ${formatarCentavos(c.valorCentavos)}${blocos.has("orcamento") && limites.has(c.contaId) ? ` (limite ${formatarCentavos(limites.get(c.contaId)!)})` : ""}`).join("; ") : "nenhuma"}.`);
  } else if (blocos.has("orcamento")) {
    const nomes = new Map(contas.map((c) => [c.id, c.nome]));
    linhas.push(`Limites do orçamento: ${orcs.length ? orcs.map((o) => `${nomes.get(o.categoria_id)} ${formatarCentavos(o.limite_centavos)}`).join("; ") : "nenhum"}.`);
  }
  if (blocos.has("contas_a_pagar")) {
    const abertos = agend.filter((a) => !a.pago_em && a.tipo !== "RECEBER");
    linhas.push(`Contas a pagar em aberto: ${abertos.length ? abertos.map((a) => `${nome(a.descricao)} ${formatarCentavos(a.valor_centavos)} vence ${a.vencimento}`).join("; ") : "nenhuma"}.`);
    const aReceber = agend.filter((a) => !a.pago_em && a.tipo === "RECEBER");
    if (aReceber.length) linhas.push(`Receitas previstas: ${aReceber.map((a) => `${nome(a.descricao)} ${formatarCentavos(a.valor_centavos)} em ${a.vencimento}`).join("; ")}.`);
  }
  if (blocos.has("metas")) {
    linhas.push(`Metas: ${metas.length ? metas.map((m) => `${nome(m.nome)} ${formatarCentavos(m.guardado_centavos)} de ${formatarCentavos(m.valor_alvo_centavos)}${m.prazo ? ` até ${m.prazo}` : ""}`).join("; ") : "nenhuma"}.`);
  }
  if (blocos.has("patrimonio")) {
    linhas.push(`Bens e dívidas: ${bens.length ? bens.map((b) => `${nome(b.nome)} (${b.tipo === "BEM" ? "bem" : "dívida"}) ${formatarCentavos(b.valor_centavos)}`).join("; ") : "nenhum"}.`);
  }
  if (blocos.has("transacoes")) {
    const ultimas = lancs.filter((l) => l.origem !== "ESTORNO").slice(0, nTransacoes);
    linhas.push(`Últimas ${ultimas.length} transações: ${ultimas.map((l) => `${l.data} ${nome(l.descricao)} ${formatarCentavos(l.partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0))}`).join("; ")}.`);
  }
  return linhas.join("\n");
}

export function IaPage() {
  const [chave, setChave] = useState("");
  const [modelo, setModelo] = usePreferencia<string>("gemini_modelo", "gemini-2.5-flash");
  const [modeloLivre, setModeloLivre] = useState("");
  const [tom, setTom] = usePreferencia<string>("gemini_tom", "CONCISO");
  const [temperatura, setTemperatura] = usePreferencia<number>("gemini_temperatura", 0.4);
  const [blocosSel, setBlocosSel] = usePreferencia<Bloco[]>("gemini_blocos", BLOCOS.filter((b) => b.padrao).map((b) => b.id));
  const [anonimo, setAnonimo] = usePreferencia<boolean>("gemini_anonimo", false);
  const [diagAuto, setDiagAuto] = usePreferencia<boolean>("diagnostico_ia_auto", true);
  const [nTransacoes, setNTransacoes] = usePreferencia<number>("gemini_transacoes", 15);
  const [rascunhoChave, setRascunhoChave] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [mensagens, setMensagens] = usePreferencia<Mensagem[]>("gemini_historico", []);
  const [pergunta, setPergunta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [contexto, setContexto] = useState<string | null>(null);
  const [testando, setTestando] = useState(false);
  const [copiado, setCopiado] = useState<number | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [secao, setSecao] = useAbaDaPagina<"conversa" | "lancar" | "analises" | "organizar" | "configuracao">("ia", "conversa");

  const blocos = useMemo(() => new Set(blocosSel), [blocosSel]);
  const modeloEfetivo = modeloLivre.trim() || modelo;

  useEffect(() => {
    lerPreferencia<string>("gemini_chave").then((c) => c && setChave(c));
  }, []);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, enviando]);

  async function salvarChave(ev: React.FormEvent) {
    ev.preventDefault();
    const nova = limparChave(rascunhoChave);
    await salvarPreferencia("gemini_chave", nova || null);
    setChave(nova);
    setRascunhoChave("");
    if (!nova) return toast.success("Chave removida.");
    const tipo = tipoDaChave(nova);
    toast.success(tipo === "VERTEX" ? "Chave do Vertex AI (modo expresso) salva. Clique em “Testar conexão”." : tipo === "AI_STUDIO" ? "Chave do Google AI Studio salva. Clique em “Testar conexão”." : "Chave salva, mas o formato não é o esperado (AIza… ou AQ.…). Teste a conexão.");
  }

  async function testarConexao() {
    try {
      setTestando(true);
      const r = await chamarGemini({ chave, modelo: modeloEfetivo, instrucao: "Responda apenas: ok", contexto: "(teste de conexão)", temperatura: 0, historico: [{ papel: "usuario", texto: "teste" }] });
      toast.success(`Conexão ok com ${modeloEfetivo}${r.tokens ? ` (${r.tokens} tokens no teste)` : ""}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTestando(false);
    }
  }

  async function mostrarDados() {
    setContexto(contexto ? null : await montarContexto(blocos, anonimo, nTransacoes));
  }

  async function enviar(texto: string) {
    const t = texto.trim();
    if (!t || enviando) return;
    const novo: Mensagem[] = [...mensagens, { papel: "usuario", texto: t }];
    setMensagens(novo);
    setPergunta("");
    const controle = new AbortController();
    abortRef.current = controle;
    try {
      setEnviando(true);
      const ctx = await montarContexto(blocos, anonimo, nTransacoes);
      const r = await chamarGemini({ chave, modelo: modeloEfetivo, instrucao: `${INSTRUCAO}\n${TONS[tom]}`, contexto: ctx, temperatura, historico: novo.slice(-12), sinal: controle.signal });
      setMensagens([...novo, { papel: "ia" as const, texto: r.texto, tokens: r.tokens }].slice(-60));
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast.info("Pergunta cancelada.");
      } else {
        toast.error(e instanceof Error ? e.message : String(e));
      }
      setMensagens(mensagens);
      setPergunta(t);
    } finally {
      setEnviando(false);
      abortRef.current = null;
    }
  }

  async function copiar(i: number, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(i);
      setTimeout(() => setCopiado(null), 1500);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  async function exportarConversa() {
    const txt = mensagens.map((m) => `${m.papel === "usuario" ? "Você" : "Assistente"}:\n${m.texto}`).join("\n\n---\n\n");
    try {
      const caminho = await extras.salvarExportacao(`conversa-ia-${new Date().toISOString().slice(0, 10)}.txt`, txt);
      toast.success(`Conversa salva em ${caminho}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  const totalTokens = mensagens.reduce((s, m) => s + (m.tokens ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-texto-primario">
          <Sparkles size={20} className="text-primaria" /> Inteligência Artificial
        </h1>
        <p className="text-sm text-texto-secundario">Assistente com Google Gemini, usando a sua própria chave de API.</p>
      </div>

      <Abas ativa={secao} onChange={setSecao} abas={[{ id: "conversa", rotulo: "Conversa", icone: Sparkles }, { id: "lancar", rotulo: "Lançar", icone: Mic }, { id: "analises", rotulo: "Análises", icone: Wand2 }, { id: "organizar", rotulo: "Organizar", icone: ListChecks }, { id: "configuracao", rotulo: "Conexão e privacidade", icone: KeyRound }]} />

      {secao === "lancar" && <LancarComIA temChave={!!chave} />}
      {secao === "analises" && <AnalisesIA temChave={!!chave} />}
      {secao === "organizar" && <OrganizarIA temChave={!!chave} />}

      {(secao === "configuracao") && (<>
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo={<><KeyRound size={16} className="text-alerta" /> Conexão com o Gemini</>}>
          <form onSubmit={salvarChave} className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input type={mostrar ? "text" : "password"} value={rascunhoChave} onChange={(e) => setRascunhoChave(e.target.value)} placeholder={chave ? "Chave salva — digite para trocar" : "Cole sua chave de API do Gemini"} aria-label="Chave de API do Gemini" autoComplete="off" className={`${CLASSE_INPUT} w-72 pr-9`} />
              <button type="button" onClick={() => setMostrar((v) => !v)} aria-label="Mostrar ou ocultar a chave" className="absolute right-2 top-1/2 -translate-y-1/2 text-texto-secundario">{mostrar ? <EyeOff size={15} /> : <Eye size={15} />}</button>
            </div>
            <Button type="submit" variante="secundaria">Salvar chave</Button>
            {chave && <Button type="button" variante="fantasma" tamanho="pequeno" onClick={() => { setRascunhoChave(""); salvarPreferencia("gemini_chave", null).then(() => { setChave(""); toast.success("Chave removida."); }); }}>Remover</Button>}
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Select aria-label="Modelo" value={modelo} onValueChange={(v) => { setModelo(v); setModeloLivre(""); }} options={MODELOS} className="w-64" />
            <input value={modeloLivre} onChange={(e) => setModeloLivre(e.target.value)} placeholder="ou outro modelo (ex.: gemini-…)" aria-label="Modelo personalizado" className={`${CLASSE_INPUT} w-56`} />
            <Button type="button" variante="secundaria" tamanho="pequeno" onClick={testarConexao} disabled={!chave || testando}><PlugZap size={13} /> {testando ? "Testando…" : "Testar conexão"}</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-texto-secundario">
            <label className="flex items-center gap-2">Estilo
              <Select aria-label="Estilo da resposta" value={tom} onValueChange={setTom} options={[{ value: "CONCISO", label: "Conciso" }, { value: "DETALHADO", label: "Detalhado" }, { value: "DIDATICO", label: "Didático" }]} className="w-36" />
            </label>
            <label className="flex items-center gap-2">Criatividade
              <input type="range" min={0} max={1} step={0.1} value={temperatura} onChange={(e) => setTemperatura(Number(e.target.value))} aria-label="Criatividade" className="w-28 accent-[var(--cor-primaria)]" />
              <span className="w-7 tabular-nums text-xs">{temperatura.toFixed(1)}</span>
            </label>
          </div>
          {chave && <p className="mt-3 text-xs text-texto-secundario">Chave salva: <strong className="text-texto-primario">{tipoDaChave(chave) === "VERTEX" ? "Vertex AI (modo expresso)" : tipoDaChave(chave) === "AI_STUDIO" ? "Google AI Studio" : "formato desconhecido"}</strong> · termina em …{chave.slice(-4)}</p>}
          <p className="mt-3 text-xs leading-relaxed text-texto-secundario">Aceita chave do Google AI Studio (começa com AIza) ou do Vertex AI em modo expresso (começa com AQ.). Ela fica salva apenas neste computador (arquivo de preferências do app, sem criptografia). Nada é enviado antes de você perguntar.</p>
        </Secao>

        <Secao titulo={<><ShieldCheck size={16} className="text-sucesso" /> O que é enviado ao Google</>}>
          <p className="mb-2 text-xs text-texto-secundario">Escolha os blocos de dados que acompanham cada pergunta:</p>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {BLOCOS.map((b) => (
              <li key={b.id}>
                <label className="flex items-center gap-2 text-sm text-texto-primario">
                  <input type="checkbox" checked={blocos.has(b.id)} onChange={() => setBlocosSel(blocos.has(b.id) ? blocosSel.filter((x) => x !== b.id) : [...blocosSel, b.id])} className="h-4 w-4 accent-[var(--cor-primaria)]" />
                  {b.rotulo}
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-texto-primario">
            <label className="flex items-center gap-2"><input type="checkbox" checked={anonimo} onChange={() => setAnonimo(!anonimo)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Modo privado: não enviar descrições/nomes</label>
            {blocos.has("transacoes") && (
              <label className="flex items-center gap-2 text-texto-secundario">últimas
                <Select aria-label="Quantidade de transações" value={String(nTransacoes)} onValueChange={(v) => setNTransacoes(Number(v))} options={[5, 15, 30, 50].map((n) => ({ value: String(n), label: String(n) }))} className="w-20" />
              </label>
            )}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-texto-primario"><input type="checkbox" checked={diagAuto} onChange={() => setDiagAuto(!diagAuto)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Diagnóstico automático do mês (dia 1º, aparece no Início)</label>
          <button onClick={mostrarDados} className="mt-3 text-xs text-primaria hover:underline">{contexto ? "Ocultar dados enviados" : "Ver exatamente o que será enviado"}</button>
          {contexto && <pre className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-lg border border-borda bg-fundo p-3 text-xs text-texto-secundario">{contexto}</pre>}
        </Secao>
      </div>
      </>)}

      {(secao === "conversa") && (<>
      <section className="rounded-xl border border-borda bg-cartao p-4">
        {!chave ? (
          <div className="flex flex-wrap items-center gap-3"><p className="text-sm text-texto-secundario">Adicione sua chave do Gemini para conversar com o assistente.</p><Button tamanho="pequeno" onClick={() => setSecao("configuracao")}><KeyRound size={13} /> Configurar conexão</Button></div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Button variante="secundaria" tamanho="pequeno" onClick={() => enviar("Analise meu mês: destaque o que está bem, os pontos de atenção e 3 ações práticas. Separe claramente dados reais de estimativas.")} disabled={enviando}><Wand2 size={13} /> Analisar meu mês</Button>
              <div className="flex items-center gap-2 text-xs text-texto-secundario">
                {totalTokens > 0 && <span>{totalTokens.toLocaleString("pt-BR")} tokens nesta conversa</span>}
                <Button variante="fantasma" tamanho="pequeno" onClick={exportarConversa} disabled={mensagens.length === 0}><Download size={13} /> Exportar</Button>
                <Button variante="fantasma" tamanho="pequeno" onClick={() => setMensagens([])} disabled={mensagens.length === 0}><Trash2 size={13} /> Limpar</Button>
              </div>
            </div>
            <div className="h-[calc(100vh-420px)] min-h-64 space-y-3 overflow-y-auto pr-1">
              {mensagens.length === 0 && (
                <div className="flex flex-wrap gap-2">
                  {SUGESTOES.map((s) => (
                    <button key={s} onClick={() => enviar(s)} disabled={enviando} className="rounded-full border border-borda px-3 py-1.5 text-xs text-texto-secundario transition-colors hover:border-primaria hover:text-primaria">{s}</button>
                  ))}
                </div>
              )}
              {mensagens.map((m, i) => (
                <div key={i} className={`group flex ${m.papel === "usuario" ? "justify-end" : "justify-start"}`}>
                  <div className={`relative max-w-[88%] rounded-2xl px-3.5 py-2 text-sm ${m.papel === "usuario" ? "bg-gradient-to-r from-primaria to-destaque text-primaria-texto" : "border border-borda bg-fundo text-texto-primario"}`}>
                    {m.papel === "ia" ? <Texto texto={m.texto} /> : <p className="whitespace-pre-wrap">{m.texto}</p>}
                    {m.papel === "ia" && (
                      <button onClick={() => copiar(i, m.texto)} aria-label="Copiar resposta" className="absolute -right-2 -top-2 rounded-full border border-borda bg-cartao p-1 text-texto-secundario opacity-0 transition-opacity hover:text-primaria group-hover:opacity-100">{copiado === i ? <Check size={12} /> : <Copy size={12} />}</button>
                    )}
                  </div>
                </div>
              ))}
              {enviando && <p className="text-xs text-texto-secundario">Pensando…</p>}
              <div ref={fimRef} />
            </div>
            <form onSubmit={(e) => { e.preventDefault(); enviar(pergunta); }} className="mt-3 flex items-end gap-2">
              <textarea
                value={pergunta}
                onChange={(e) => setPergunta(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(pergunta); } }}
                rows={2}
                placeholder="Pergunte sobre suas finanças…  (Enter envia · Shift+Enter quebra a linha)"
                aria-label="Pergunta"
                className={`${CLASSE_INPUT} flex-1 resize-none`}
              />
              {enviando ? (
                <Button type="button" variante="perigo" onClick={() => abortRef.current?.abort()}><Square size={13} /> Parar</Button>
              ) : (
                <Button type="submit" disabled={!pergunta.trim()}><Send size={14} /> Enviar</Button>
              )}
            </form>
            <p className="mt-2 text-xs text-texto-secundario">As respostas são geradas por IA e podem conter erros. Não são aconselhamento financeiro profissional. A conversa fica salva neste computador (últimas 60 mensagens).</p>
          </>
        )}
      </section>
      </>)}
    </div>
  );
}
