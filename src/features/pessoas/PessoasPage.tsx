import { useEffect, useState } from "react";
import { Copy, HandCoins, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Abas, useAbaDaPagina } from "../../components/ui/Abas";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { opcoesCategoria } from "../../services/categorias";
import { centavosParaValorInput, dataAtualISO, formatarCentavos, formatarDataISOParaBR, valorInputParaCentavos } from "../../services/formato";
import { perguntarIA } from "../../services/gemini";
import { planejamento, type AReceber } from "../../services/planejamento";
import { usePreferencia } from "../../state/usePreferencia";
import { avisarDadosAlterados } from "../../state/useAoAlterarDados";
import type { Conta } from "../../types/accounting";

/** Divide `total` igualmente entre `n` pessoas; os centavos que sobram ficam com as primeiras. */
export function dividirIgual(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i < total - base * n ? 1 : 0));
}

/** Mensagem de cobrança pronta para copiar (WhatsApp etc.). */
export function mensagemCobranca(pessoa: string, itens: AReceber[], chavePix: string): string {
  const total = itens.reduce((s, i) => s + i.valor_centavos, 0);
  const lista = itens.map((i) => `• ${i.descricao} (${formatarDataISOParaBR(i.data)}): ${formatarCentavos(i.valor_centavos)}`).join("\n");
  return `Oi, ${pessoa}! Tudo bem? Passando para lembrar do que ficou pendente:\n${lista}\nTotal: ${formatarCentavos(total)}.${chavePix ? `\nPode mandar no Pix: ${chavePix}` : ""}\nObrigado! 😊`;
}

export function PessoasPage() {
  const [secao, setSecao] = useAbaDaPagina<"devem" | "dividir">("pessoas", "devem");
  const [contas, setContas] = useState<Conta[]>([]);
  const [itens, setItens] = useState<AReceber[]>([]);
  const [chavePix, setChavePix] = usePreferencia<string>("chave_pix", "");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [contaReceber, setContaReceber] = useState("");
  const [mensagens, setMensagens] = useState<Record<string, string>>({});
  const [gerando, setGerando] = useState<string | null>(null);
  const contasAtivas = contas.filter((c) => (c.tipo === "ATIVO" || c.tipo === "PASSIVO") && c.subtipo !== "CATEGORIA" && c.ativa && c.id !== "ativo-a-receber");
  const destinos = contasAtivas.filter((c) => c.tipo === "ATIVO");

  async function carregar() {
    try {
      const [c, i] = await Promise.all([contabilidade.listarContas(), planejamento.listarAReceber()]);
      setContas(c);
      setItens(i);
    } catch (e) {
      toast.error(String(e));
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  const abertos = itens.filter((i) => !i.recebido_em && !i.perdoado);
  const porPessoa = new Map<string, AReceber[]>();
  for (const i of abertos) porPessoa.set(i.pessoa, [...(porPessoa.get(i.pessoa) ?? []), i]);
  const totalAberto = abertos.reduce((s, i) => s + i.valor_centavos, 0);

  async function receber(ids: string[]) {
    const conta = contaReceber || destinos[0]?.id;
    if (!conta || !ids.length) return toast.error("Escolha o que foi recebido e a conta.");
    try {
      await planejamento.receber(ids, conta, dataAtualISO());
      toast.success("Recebimento registrado.");
      setSelecionados(new Set());
      await carregar();
      avisarDadosAlterados();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function perdoar(id: string) {
    try {
      await planejamento.perdoar(id, dataAtualISO());
      toast.success("Dívida perdoada (virou despesa).");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function mensagemIA(pessoa: string, lista: AReceber[]) {
    try {
      setGerando(pessoa);
      const texto = await perguntarIA({
        instrucao: "Você escreve mensagens curtas, educadas e simpáticas em português do Brasil para lembrar um amigo de um valor pendente. Sem exageros, sem ameaças, no máximo 5 linhas.",
        contexto: `Pessoa: ${pessoa}\nItens: ${lista.map((i) => `${i.descricao} em ${formatarDataISOParaBR(i.data)}: ${formatarCentavos(i.valor_centavos)}`).join("; ")}\nTotal: ${formatarCentavos(lista.reduce((s, i) => s + i.valor_centavos, 0))}\nChave Pix: ${chavePix || "(não informada)"}`,
        pergunta: "Escreva a mensagem de cobrança.",
        temperatura: 0.7,
      });
      setMensagens((m) => ({ ...m, [pessoa]: texto.trim() }));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setGerando(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-texto-primario"><Users size={22} className="text-primaria" /> Pessoas e divisões</h1>
      <Abas ativa={secao} onChange={setSecao} abas={[{ id: "devem", rotulo: "Quem me deve", icone: HandCoins, contador: porPessoa.size }, { id: "dividir", rotulo: "Rachar uma conta ou emprestar", icone: Users }]} />

      {secao === "dividir" && <FormDivisao contas={contas} contasAtivas={contasAtivas} onFeito={() => { carregar(); setSecao("devem"); avisarDadosAlterados(); }} />}

      {secao === "devem" && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-texto-secundario">Total a receber: <strong className="text-sucesso">{formatarCentavos(totalAberto)}</strong></span>
            <label className="flex items-center gap-2 text-xs text-texto-secundario">Recebido em
              <Select aria-label="Conta do recebimento" value={contaReceber || destinos[0]?.id || ""} onValueChange={setContaReceber} options={destinos.map((c) => ({ value: c.id, label: c.nome }))} className="w-44" />
            </label>
            <label className="flex items-center gap-2 text-xs text-texto-secundario">Sua chave Pix
              <input value={chavePix} onChange={(e) => setChavePix(e.target.value)} placeholder="e-mail, celular ou chave" aria-label="Chave Pix" className={`${CLASSE_INPUT} w-52 py-1`} />
            </label>
            {selecionados.size > 0 && <Button tamanho="pequeno" onClick={() => receber([...selecionados])}>Marcar {selecionados.size} como recebido(s)</Button>}
          </div>
          {porPessoa.size === 0 ? <p className="text-sm text-texto-secundario">Ninguém te deve nada. Use “Rachar uma conta” quando pagar por outras pessoas.</p> : (
            <div className="grid gap-4 lg:grid-cols-2">
              {[...porPessoa.entries()].map(([pessoa, lista]) => {
                const total = lista.reduce((s, i) => s + i.valor_centavos, 0);
                const msg = mensagens[pessoa] ?? mensagemCobranca(pessoa, lista, chavePix);
                return (
                  <Secao key={pessoa} titulo={`${pessoa} · ${formatarCentavos(total)}`} acao={<Button tamanho="pequeno" variante="secundaria" onClick={() => receber(lista.map((i) => i.id))}>Recebi tudo</Button>}>
                    <ul className="space-y-1 text-sm">
                      {lista.map((i) => (
                        <li key={i.id} className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2"><input type="checkbox" checked={selecionados.has(i.id)} onChange={() => setSelecionados((s) => { const n = new Set(s); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })} className="h-4 w-4 accent-[var(--cor-primaria)]" />{i.descricao} <span className="text-xs text-texto-secundario">· {formatarDataISOParaBR(i.data)}</span></label>
                          <span className="flex items-center gap-2 tabular-nums">{formatarCentavos(i.valor_centavos)}<button onClick={() => perdoar(i.id)} title="Perdoar (vira despesa)" aria-label={`Perdoar ${i.descricao}`} className="text-texto-secundario hover:text-erro"><Trash2 size={12} /></button></span>
                        </li>
                      ))}
                    </ul>
                    <textarea value={msg} onChange={(e) => setMensagens((m) => ({ ...m, [pessoa]: e.target.value }))} rows={5} aria-label={`Mensagem para ${pessoa}`} className={`${CLASSE_INPUT} mt-3 w-full resize-none text-xs`} />
                    <div className="mt-2 flex gap-2">
                      <Button tamanho="pequeno" variante="secundaria" onClick={() => navigator.clipboard.writeText(msg).then(() => toast.success("Mensagem copiada."))}><Copy size={13} /> Copiar cobrança</Button>
                      <Button tamanho="pequeno" variante="fantasma" disabled={gerando === pessoa} onClick={() => mensagemIA(pessoa, lista)}><Sparkles size={13} /> {gerando === pessoa ? "Escrevendo…" : "Escrever com IA"}</Button>
                    </div>
                  </Secao>
                );
              })}
            </div>
          )}
          {itens.some((i) => i.recebido_em || i.perdoado) && (
            <Secao titulo="Já resolvidos">
              <ul className="space-y-1 text-xs text-texto-secundario">
                {itens.filter((i) => i.recebido_em || i.perdoado).slice(0, 30).map((i) => (
                  <li key={i.id} className="flex justify-between"><span>{i.pessoa} · {i.descricao} · {i.perdoado ? "perdoado" : `recebido em ${formatarDataISOParaBR(i.recebido_em!)}`}</span><span className="tabular-nums">{formatarCentavos(i.valor_centavos)}</span></li>
                ))}
              </ul>
            </Secao>
          )}
        </>
      )}
    </div>
  );
}

function FormDivisao({ contas, contasAtivas, onFeito }: { contas: Conta[]; contasAtivas: Conta[]; onFeito: () => void }) {
  const categorias = contas.filter((c) => c.tipo === "DESPESA" && c.subtipo !== "CATEGORIA" && c.ativa);
  const [descricao, setDescricao] = useState("");
  const [total, setTotal] = useState("");
  const [contaId, setContaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("despesa-alimentacao");
  const [euParticipo, setEuParticipo] = useState(true);
  const [pessoas, setPessoas] = useState<Array<{ nome: string; valor: string }>>([{ nome: "", valor: "" }]);
  const [data, setData] = useState(dataAtualISO());
  const conta = contaId || contasAtivas[0]?.id || "";
  const totalC = valorInputParaCentavos(total);

  function dividirIgualmente() {
    const n = pessoas.length + (euParticipo ? 1 : 0);
    const partes = dividirIgual(totalC, n);
    setPessoas(pessoas.map((p, i) => ({ ...p, valor: centavosParaValorInput(partes[i + (euParticipo ? 1 : 0)] ?? 0) })));
  }

  const somaOutros = pessoas.reduce((s, p) => s + valorInputParaCentavos(p.valor), 0);
  const minhaParte = euParticipo ? totalC - somaOutros : 0;

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!euParticipo && somaOutros !== totalC) return toast.error("Sem a sua parte, as partes das pessoas precisam somar o total.");
    if (minhaParte < 0) return toast.error("As partes passam do total.");
    try {
      await planejamento.registrarDivisao({
        descricao,
        data,
        conta_id: conta,
        categoria_id: minhaParte > 0 ? categoriaId : null,
        minha_parte_centavos: minhaParte,
        partes: pessoas.map((p) => ({ pessoa: p.nome, valor_centavos: valorInputParaCentavos(p.valor) })),
      });
      toast.success(minhaParte > 0 ? `Sua parte (${formatarCentavos(minhaParte)}) virou despesa; o resto ficou a receber.` : "Empréstimo registrado: ficou a receber.");
      setDescricao("");
      setTotal("");
      setPessoas([{ nome: "", valor: "" }]);
      onFeito();
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <Secao titulo="Rachar uma conta (ou emprestar dinheiro)">
      <form onSubmit={salvar} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="O quê (ex.: Pizza, Uber, empréstimo)" aria-label="Descrição da divisão" className={`${CLASSE_INPUT} lg:col-span-2`} />
          <input value={total} onChange={(e) => setTotal(e.target.value)} inputMode="decimal" placeholder="Total pago por você (R$)" aria-label="Total pago" className={CLASSE_INPUT} />
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} aria-label="Data da divisão" className={CLASSE_INPUT} />
          <Select aria-label="Pago com" value={conta} onValueChange={setContaId} options={contasAtivas.map((c) => ({ value: c.id, label: `Pago com ${c.nome}` }))} />
          <label className="flex items-center gap-2 text-sm text-texto-primario"><input type="checkbox" checked={euParticipo} onChange={() => setEuParticipo(!euParticipo)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Eu também participo</label>
          {euParticipo && <Select aria-label="Categoria da sua parte" value={categoriaId} onValueChange={setCategoriaId} options={opcoesCategoria(categorias, contas)} className="lg:col-span-2" />}
        </div>
        <div className="space-y-2">
          {pessoas.map((p, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input value={p.nome} onChange={(e) => setPessoas(pessoas.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} placeholder="Nome" aria-label={`Pessoa ${i + 1}`} className={`${CLASSE_INPUT} w-40`} />
              <input value={p.valor} onChange={(e) => setPessoas(pessoas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} inputMode="decimal" placeholder="Deve (R$)" aria-label={`Valor da pessoa ${i + 1}`} className={`${CLASSE_INPUT} w-28`} />
              {pessoas.length > 1 && <button type="button" onClick={() => setPessoas(pessoas.filter((_, j) => j !== i))} aria-label="Remover pessoa" className="text-texto-secundario hover:text-erro"><Trash2 size={14} /></button>}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Button type="button" tamanho="pequeno" variante="fantasma" onClick={() => setPessoas([...pessoas, { nome: "", valor: "" }])}><Plus size={13} /> Pessoa</Button>
            <Button type="button" tamanho="pequeno" variante="secundaria" onClick={dividirIgualmente} disabled={totalC <= 0}>Dividir igualmente</Button>
            {totalC > 0 && <span className="text-texto-secundario">Pessoas: {formatarCentavos(somaOutros)}{euParticipo ? ` · sua parte: ${formatarCentavos(Math.max(0, minhaParte))}` : ""}</span>}
          </div>
        </div>
        <Button type="submit">Registrar</Button>
      </form>
    </Secao>
  );
}
