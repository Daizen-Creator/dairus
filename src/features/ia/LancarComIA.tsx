import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, Mic, Square, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { iniciarGravacao, type Gravacao } from "../../services/audio";
import { contabilidade } from "../../services/contabilidade";
import { lerPreferencia } from "../../services/armazenamento";
import { opcoesCategoria } from "../../services/categorias";
import { centavosParaValorInput, dataAtualISO, formatarCentavos, valorInputParaCentavos } from "../../services/formato";
import { categoriasDe, contasPagaveis, gravarProposta, interpretarComIA, interpretarTextoLocal, propostaCompleta, type Proposta } from "../../services/iaLancamentos";
import { lancExtras, type RegraCategoria } from "../../services/lancamentosExtras";
import { avisarDadosAlterados } from "../../state/useAoAlterarDados";
import { possivelDuplicata } from "../lancamentos/detectores";
import type { Conta, Lancamento } from "../../types/accounting";

interface Item extends Proposta {
  chave: number;
  valorTexto: string;
}

let contador = 0;
const paraItem = (p: Proposta): Item => ({ ...p, chave: ++contador, valorTexto: centavosParaValorInput(p.valor_centavos) });

/** Lançar conversando: texto livre, notificação colada, foto/print/nota fiscal ou voz. */
export function LancarComIA({ temChave }: { temChave: boolean }) {
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [regras, setRegras] = useState<RegraCategoria[]>([]);
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState<Gravacao | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [gravandoLancs, setGravandoLancs] = useState(false);
  const entradaArquivo = useRef<HTMLInputElement>(null);
  const hoje = dataAtualISO();

  useEffect(() => {
    Promise.all([contabilidade.listarContas(), contabilidade.listarLancamentos(3000), lancExtras.listarRegras()])
      .then(([c, l, r]) => {
        setContas(c);
        setLancamentos(l);
        setRegras(r);
      })
      .catch((e) => toast.error(String(e)));
  }, []);

  useEffect(() => {
    if (!gravando) return;
    setSegundos(0);
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [gravando]);

  const pagaveis = contasPagaveis(contas);
  const despesas = categoriasDe(contas, "DESPESA");
  const receitas = categoriasDe(contas, "RECEITA");

  async function contaPadrao(p: Proposta): Promise<Proposta> {
    if (p.conta_id) return p;
    const padrao = await lerPreferencia<string>("conta_padrao");
    const conta = pagaveis.find((c) => c.id === padrao) ?? pagaveis.find((c) => c.tipo === "ATIVO");
    return { ...p, conta_id: conta?.id ?? null };
  }

  async function entender(usarIA: boolean, anexoAudio?: Blob) {
    try {
      setLendo(true);
      let propostas: Proposta[];
      if (usarIA) {
        const { arquivoParaAnexo } = await import("../../services/gemini");
        const fonte = anexoAudio ?? arquivo;
        propostas = await interpretarComIA({ texto, anexo: fonte ? await arquivoParaAnexo(fonte) : undefined }, contas, hoje, regras, lancamentos);
      } else {
        propostas = interpretarTextoLocal(texto, hoje, contas, regras, lancamentos);
      }
      const completas = await Promise.all(propostas.map(contaPadrao));
      if (!completas.length) toast.info(usarIA ? "A IA não encontrou nenhum lançamento." : "Não entendi. Escreva algo como “mercado 45,90 ontem” (um por linha).");
      setItens((atual) => [...atual, ...completas.map(paraItem)]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLendo(false);
    }
  }

  async function alternarGravacao() {
    if (gravando) {
      const g = gravando;
      setGravando(null);
      try {
        const audio = await g.parar();
        await entender(true, audio);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    try {
      setGravando(await iniciarGravacao());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  function colar(ev: React.ClipboardEvent) {
    const img = [...ev.clipboardData.items].find((i) => i.type.startsWith("image/"))?.getAsFile();
    if (img) {
      ev.preventDefault();
      setArquivo(new File([img], `print-${Date.now()}.png`, { type: img.type }));
      toast.info("Print colado. Clique em “Entender com IA”.");
    }
  }

  const alterar = (chave: number, mudanca: Partial<Item>) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)));

  async function lancarTodos() {
    const prontos = itens.map((i) => ({ ...i, valor_centavos: valorInputParaCentavos(i.valorTexto) }));
    const erro = prontos.map((p, n) => (p.valor_centavos <= 0 ? `Linha ${n + 1}: valor inválido.` : propostaCompleta(p) ? `Linha ${n + 1}: ${propostaCompleta(p)}` : null)).find(Boolean);
    if (erro) return toast.error(erro);
    setGravandoLancs(true);
    const restantes: Item[] = [];
    let ok = 0;
    for (const p of prontos) {
      try {
        const l = await gravarProposta(p);
        ok += 1;
        if (arquivo && prontos.length === 1) await lancExtras.anexar(l.id, arquivo).catch(() => {});
      } catch (e) {
        restantes.push(p);
        toast.error(`${p.descricao}: ${String(e)}`);
      }
    }
    setGravandoLancs(false);
    setItens(restantes);
    if (ok) {
      toast.success(ok === 1 ? "Lançamento registrado." : `${ok} lançamentos registrados.`);
      setTexto("");
      setArquivo(null);
      avisarDadosAlterados();
      contabilidade.listarLancamentos(3000).then(setLancamentos).catch(() => {});
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-borda bg-cartao p-4">
      <div>
        <p className="text-sm font-semibold text-texto-primario">Lançar conversando</p>
        <p className="text-xs text-texto-secundario">Escreva do seu jeito (um por linha), cole a notificação do banco, um print ou foto do comprovante/nota fiscal, ou fale. Você revisa tudo antes de gravar.</p>
      </div>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onPaste={colar}
        rows={3}
        placeholder={"mercado 45,90 ontem\nuber 23,50 no dinheiro\ntv 1.200 em 10x no Nubank\nrecebi 300 do João"}
        aria-label="Descreva os lançamentos"
        className={`${CLASSE_INPUT} w-full resize-y`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => entender(temChave)} disabled={lendo || (!texto.trim() && !(arquivo && temChave))}>
          {lendo ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} {temChave ? "Entender com IA" : "Entender"}
        </Button>
        {temChave && (
          <Button variante="fantasma" tamanho="pequeno" onClick={() => entender(false)} disabled={lendo || !texto.trim()}>Ler sem IA</Button>
        )}
        <input ref={entradaArquivo} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
        <Button variante="secundaria" tamanho="pequeno" onClick={() => entradaArquivo.current?.click()} disabled={!temChave}>
          <Camera size={13} /> Foto, print ou nota
        </Button>
        <Button variante={gravando ? "perigo" : "secundaria"} tamanho="pequeno" onClick={alternarGravacao} disabled={!temChave || lendo}>
          {gravando ? <><Square size={13} /> Parar ({segundos}s)</> : <><Mic size={13} /> Falar</>}
        </Button>
        {arquivo && (
          <span className="flex items-center gap-1 text-xs text-texto-secundario">
            {arquivo.name}
            <button onClick={() => setArquivo(null)} aria-label="Remover arquivo" className="hover:text-erro"><Trash2 size={12} /></button>
          </span>
        )}
      </div>
      {!temChave && <p className="text-xs text-texto-secundario">Sem a chave do Gemini, o Dairus entende frases simples. Foto, print, nota fiscal e voz precisam da chave (aba “Conexão e privacidade”).</p>}

      {itens.length > 0 && (
        <div className="space-y-2">
          {itens.map((i) => {
            const dup = possivelDuplicata({ data: i.data, valorCentavos: valorInputParaCentavos(i.valorTexto), descricao: i.descricao, contaId: i.conta_id ?? undefined }, lancamentos);
            const cartao = pagaveis.find((c) => c.id === i.conta_id)?.subtipo === "CARTAO_CREDITO";
            return (
              <div key={i.chave} className="rounded-lg border border-borda/70 p-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Select aria-label="Tipo" value={i.tipo} onValueChange={(v) => alterar(i.chave, { tipo: v as Proposta["tipo"], categoria_id: null })} options={[{ value: "DESPESA", label: "Despesa" }, { value: "RECEITA", label: "Receita" }, { value: "TRANSFERENCIA", label: "Transferência" }]} className="w-32" />
                  <input value={i.descricao} onChange={(e) => alterar(i.chave, { descricao: e.target.value })} aria-label="Descrição" className={`${CLASSE_INPUT} w-44 py-1`} />
                  <input value={i.valorTexto} onChange={(e) => alterar(i.chave, { valorTexto: e.target.value })} inputMode="decimal" aria-label="Valor" className={`${CLASSE_INPUT} w-24 py-1`} />
                  <input type="date" value={i.data} onChange={(e) => alterar(i.chave, { data: e.target.value })} aria-label="Data" className={`${CLASSE_INPUT} w-36 py-1`} />
                  <Select aria-label={i.tipo === "RECEITA" ? "Conta que recebeu" : "Conta"} value={i.conta_id ?? ""} onValueChange={(v) => alterar(i.chave, { conta_id: v || null })} options={[{ value: "", label: "Conta…" }, ...pagaveis.map((c) => ({ value: c.id, label: c.nome }))]} className="w-40" />
                  {i.tipo === "TRANSFERENCIA" ? (
                    <Select aria-label="Conta de destino" value={i.conta_destino_id ?? ""} onValueChange={(v) => alterar(i.chave, { conta_destino_id: v || null })} options={[{ value: "", label: "Para…" }, ...pagaveis.filter((c) => c.id !== i.conta_id).map((c) => ({ value: c.id, label: c.nome }))]} className="w-40" />
                  ) : (
                    <Select aria-label="Categoria" value={i.categoria_id ?? ""} onValueChange={(v) => alterar(i.chave, { categoria_id: v || null })} options={[{ value: "", label: "Categoria…" }, ...opcoesCategoria(i.tipo === "RECEITA" ? receitas : despesas, contas)]} className="w-44" />
                  )}
                  {i.tipo === "DESPESA" && cartao && (
                    <input value={i.parcelas ?? ""} onChange={(e) => alterar(i.chave, { parcelas: Number(e.target.value) >= 2 ? Math.min(72, Number(e.target.value)) : null })} inputMode="numeric" placeholder="1x" aria-label="Parcelas" className={`${CLASSE_INPUT} w-14 py-1`} />
                  )}
                  <button onClick={() => setItens((l) => l.filter((x) => x.chave !== i.chave))} aria-label="Remover" className="ml-auto text-texto-secundario hover:text-erro"><Trash2 size={14} /></button>
                </div>
                {dup && <p className="mt-1 text-xs text-alerta">Parece repetido: já existe “{dup.descricao}” em {dup.data.split("-").reverse().join("/")} com o mesmo valor.</p>}
              </div>
            );
          })}
          <div className="flex items-center gap-2">
            <Button onClick={lancarTodos} disabled={gravandoLancs}><Check size={14} /> {itens.length === 1 ? "Lançar" : `Lançar ${itens.length}`}</Button>
            <Button variante="fantasma" tamanho="pequeno" onClick={() => setItens([])}>Descartar</Button>
            <span className="text-xs text-texto-secundario">Total: {formatarCentavos(itens.reduce((s, i) => s + valorInputParaCentavos(i.valorTexto), 0))}</span>
          </div>
        </div>
      )}
    </section>
  );
}
