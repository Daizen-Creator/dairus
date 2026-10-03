import { useEffect, useState } from "react";
import { ClipboardPaste, Paperclip, Plus, Split, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { opcoesCategoria, sugerirCategoria, marcaDaDescricao, type Sugestao } from "../../services/categorias";
import { centavosParaValorInput, dataAtualISO, formatarCentavos, formatarDataISOParaBR, valorInputParaCentavos } from "../../services/formato";
import { tagsComViagem } from "../../services/modoViagem";
import { lancExtras, lerTags, type RegraCategoria } from "../../services/lancamentosExtras";
import type { Conta, Etiqueta, Lancamento } from "../../types/accounting";
import { foraDoPadrao, lerNotificacaoBanco, possivelDuplicata } from "./detectores";
import { OPCOES_ETIQUETA } from "./opcoesEtiqueta";

export interface DespesaInicial {
  descricao: string;
  valorCentavos: number;
  contaOrigemId?: string;
  categoriaId?: string;
  etiqueta?: Etiqueta | null;
  observacao?: string | null;
}

interface DespesaFormProps {
  contasOrigem: Conta[];
  categoriasDespesa: Conta[];
  onRegistrada: () => void;
  /** Pré-preenche o formulário (usado por "Duplicar"). */
  inicial?: DespesaInicial | null;
  /** Padrões vindos das Configurações (usados só quando não é uma duplicação). */
  contaPadraoId?: string;
  categoriaPadraoId?: string;
  /** Histórico para sugerir categoria e avisar duplicatas e gastos fora do padrão. */
  lancamentos?: Lancamento[];
}

interface Divisao {
  categoriaId: string;
  valor: string;
}

export function DespesaForm({ contasOrigem, categoriasDespesa, onRegistrada, inicial, contaPadraoId, categoriaPadraoId, lancamentos = [] }: DespesaFormProps) {
  const [descricao, setDescricao] = useState(inicial?.descricao ?? "");
  const [valor, setValor] = useState(inicial ? centavosParaValorInput(inicial.valorCentavos) : "");
  const [data, setData] = useState(dataAtualISO());
  const [contaOrigemId, setContaOrigemId] = useState(inicial?.contaOrigemId ?? contasOrigem[0]?.id ?? "");
  const [categoriaId, setCategoriaId] = useState(inicial?.categoriaId ?? categoriasDespesa[0]?.id ?? "");
  const [categoriaTocada, setCategoriaTocada] = useState(!!inicial?.categoriaId);
  const [etiqueta, setEtiqueta] = useState<string>(inicial?.etiqueta ?? "NENHUMA");
  const [observacao, setObservacao] = useState(inicial?.observacao ?? "");
  const [parcelas, setParcelas] = useState("1");
  const [tags, setTags] = useState("");
  const [comprovante, setComprovante] = useState<File | null>(null);
  const [dividir, setDividir] = useState(false);
  const [divisoes, setDivisoes] = useState<Divisao[]>([]);
  const [regras, setRegras] = useState<RegraCategoria[]>([]);
  const [sugestao, setSugestao] = useState<Sugestao | null>(null);
  const [lembrarRegra, setLembrarRegra] = useState(false);
  const [colando, setColando] = useState(false);
  const [notificacao, setNotificacao] = useState("");
  const [avisos, setAvisos] = useState<string[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const todas = [...contasOrigem, ...categoriasDespesa];

  useEffect(() => {
    if (inicial) return;
    if (contaPadraoId && contasOrigem.some((c) => c.id === contaPadraoId)) setContaOrigemId(contaPadraoId);
    if (categoriaPadraoId && categoriasDespesa.some((c) => c.id === categoriaPadraoId)) setCategoriaId(categoriaPadraoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contaPadraoId, categoriaPadraoId]);

  useEffect(() => {
    lancExtras.listarRegras().then(setRegras).catch(() => {});
  }, []);

  // Categoria automática: regra do usuário ou o que ele usou da última vez para a mesma marca.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const s = descricao.trim().length >= 3 ? sugerirCategoria(descricao, "DESPESA", regras, lancamentos, [...todas]) : null;
      setSugestao(s);
      if (s && !categoriaTocada && categoriasDespesa.some((c) => c.id === s.categoriaId)) setCategoriaId(s.categoriaId);
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descricao, regras, categoriaTocada]);

  const origem = contasOrigem.find((c) => c.id === contaOrigemId);
  const ehCartao = origem?.subtipo === "CARTAO_CREDITO";
  const valorCentavos = valorInputParaCentavos(valor);
  const somaDivisao = divisoes.reduce((s, d) => s + valorInputParaCentavos(d.valor), 0);

  function aplicarNotificacao() {
    const lida = lerNotificacaoBanco(notificacao, dataAtualISO());
    if (!lida) return toast.error("Não encontrei um valor em reais nesse texto.");
    if (lida.tipo === "RECEITA") toast.info("Parece um recebimento; use a aba “Nova receita”. Preenchi o valor mesmo assim.");
    setValor(centavosParaValorInput(lida.valorCentavos));
    setDescricao(lida.descricao);
    if (lida.data) setData(lida.data);
    if (lida.cartao) {
      const cartao = contasOrigem.find((c) => c.subtipo === "CARTAO_CREDITO");
      if (cartao) setContaOrigemId(cartao.id);
    }
    setColando(false);
    setNotificacao("");
  }

  function iniciarDivisao() {
    setDividir(true);
    setDivisoes([
      { categoriaId, valor: valor || "" },
      { categoriaId: categoriasDespesa.find((c) => c.id !== categoriaId)?.id ?? categoriaId, valor: "" },
    ]);
  }

  function verificar(): string[] {
    const lista: string[] = [];
    const dup = possivelDuplicata({ data, valorCentavos, descricao, contaId: contaOrigemId }, lancamentos);
    if (dup) lista.push(`Parece repetido: “${dup.descricao}” de ${formatarCentavos(valorCentavos)} em ${formatarDataISOParaBR(dup.data)} já está lançado.`);
    if (!dividir) {
      const fora = foraDoPadrao(valorCentavos, categoriaId, lancamentos, data);
      const nome = categoriasDespesa.find((c) => c.id === categoriaId)?.nome ?? "Esta categoria";
      if (fora) lista.push(`${nome} costuma custar ${formatarCentavos(Math.round(fora.media))} por lançamento; este é ${fora.vezes.toFixed(1).replace(".", ",")}x a média. Foi isso mesmo?`);
    }
    return lista;
  }

  async function enviar(evento: React.FormEvent, confirmado = false) {
    evento.preventDefault();
    if (!descricao.trim() || valorCentavos <= 0 || !contaOrigemId || (!dividir && !categoriaId)) {
      toast.error("Preencha descrição, valor, conta e categoria.");
      return;
    }
    if (dividir && somaDivisao !== valorCentavos) {
      toast.error(`A divisão soma ${formatarCentavos(somaDivisao)}, mas o total é ${formatarCentavos(valorCentavos)}.`);
      return;
    }
    const nParcelas = ehCartao ? Math.floor(Number(parcelas) || 1) : 1;
    if (nParcelas < 1 || nParcelas > 72) {
      toast.error("O parcelamento vai de 1 a 72 vezes.");
      return;
    }
    if (!confirmado) {
      const a = verificar();
      if (a.length) {
        setAvisos(a);
        return;
      }
    }
    setAvisos(null);
    try {
      setEnviando(true);
      const etq = etiqueta === "NENHUMA" ? null : (etiqueta as Etiqueta);
      const obs = observacao.trim() || null;
      const lanc = dividir
        ? await contabilidade.criarLancamento({
            data,
            descricao: descricao.trim(),
            observacao: obs,
            etiqueta: etq,
            parcelas: nParcelas > 1 ? nParcelas : null,
            partidas: [
              ...divisoes.filter((d) => valorInputParaCentavos(d.valor) > 0).map((d) => ({ conta_id: d.categoriaId, tipo: "DEBITO" as const, valor_centavos: valorInputParaCentavos(d.valor) })),
              { conta_id: contaOrigemId, tipo: "CREDITO" as const, valor_centavos: valorCentavos },
            ],
          })
        : await contabilidade.registrarDespesa({
            conta_origem_id: contaOrigemId,
            categoria_despesa_id: categoriaId,
            valor_centavos: valorCentavos,
            data,
            descricao: descricao.trim(),
            etiqueta: etq,
            observacao: obs,
            parcelas: nParcelas > 1 ? nParcelas : null,
          });
      const extrasFalhos: string[] = [];
      const listaTags = await tagsComViagem(lerTags(tags), data);
      if (listaTags.length) await lancExtras.definirTags(lanc.id, listaTags).catch((e) => extrasFalhos.push(`tags (${String(e)})`));
      if (comprovante) await lancExtras.anexar(lanc.id, comprovante).catch((e) => extrasFalhos.push(`comprovante (${String(e)})`));
      if (lembrarRegra && !dividir) {
        const padrao = marcaDaDescricao(descricao) || descricao.trim().toLowerCase();
        await lancExtras.salvarRegra(padrao, categoriaId).then(() => lancExtras.listarRegras().then(setRegras)).catch((e) => extrasFalhos.push(`regra (${String(e)})`));
      }
      toast.success(nParcelas > 1 ? `Compra registrada em ${nParcelas} parcelas.` : "Despesa registrada.");
      if (extrasFalhos.length) toast.error(`A despesa foi salva, mas falhou: ${extrasFalhos.join(", ")}.`);
      setDescricao("");
      setValor("");
      setObservacao("");
      setParcelas("1");
      setTags("");
      setComprovante(null);
      setDividir(false);
      setDivisoes([]);
      setLembrarRegra(false);
      setCategoriaTocada(false);
      onRegistrada();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setEnviando(false);
    }
  }

  const nomeSugestao = sugestao ? categoriasDespesa.find((c) => c.id === sugestao.categoriaId)?.nome : null;

  return (
    <form onSubmit={(e) => enviar(e)} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-5">
        <Button type="button" tamanho="pequeno" variante="fantasma" onClick={() => setColando(!colando)}><ClipboardPaste size={13} /> Colar notificação do banco</Button>
        {!dividir && <Button type="button" tamanho="pequeno" variante="fantasma" onClick={iniciarDivisao}><Split size={13} /> Dividir entre categorias</Button>}
      </div>
      {colando && (
        <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
          <textarea value={notificacao} onChange={(e) => setNotificacao(e.target.value)} rows={2} placeholder="Cole aqui o texto da notificação (ex.: Compra de R$ 45,90 APROVADA em IFOOD)" aria-label="Texto da notificação" className={`${CLASSE_INPUT} flex-1 resize-none`} />
          <Button type="button" tamanho="pequeno" onClick={aplicarNotificacao}>Preencher</Button>
        </div>
      )}
      <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição" aria-label="Descrição" className={`${CLASSE_INPUT} lg:col-span-2`} />
      <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="Valor (R$)" aria-label="Valor" className={CLASSE_INPUT} />
      {!dividir && (
        <Select aria-label="Categoria da despesa" value={categoriaId} onValueChange={(v) => { setCategoriaId(v); setCategoriaTocada(true); }} options={opcoesCategoria(categoriasDespesa, todas)} />
      )}
      <Select aria-label="Conta de origem" value={contaOrigemId} onValueChange={setContaOrigemId} options={contasOrigem.map((c) => ({ value: c.id, label: c.nome }))} />
      {!dividir && sugestao && nomeSugestao && (
        <p className="text-[11px] text-texto-secundario sm:col-span-2 lg:col-span-5">
          {sugestao.motivo === "REGRA" ? `Regra: “${sugestao.padrao}” → ${nomeSugestao}.` : `Da última vez, “${sugestao.padrao}” foi ${nomeSugestao}.`}
          {categoriaId !== sugestao.categoriaId && <button type="button" onClick={() => setCategoriaId(sugestao.categoriaId)} className="ml-1 text-primaria hover:underline">Usar</button>}
        </p>
      )}
      {!dividir && descricao.trim().length >= 3 && sugestao?.motivo !== "REGRA" && (
        <label className="flex items-center gap-2 text-[11px] text-texto-secundario sm:col-span-2 lg:col-span-5">
          <input type="checkbox" checked={lembrarRegra} onChange={() => setLembrarRegra(!lembrarRegra)} className="h-3.5 w-3.5 accent-[var(--cor-primaria)]" />
          Sempre usar esta categoria para “{marcaDaDescricao(descricao) || descricao.trim()}” (também na importação de extrato)
        </label>
      )}
      {dividir && (
        <div className="space-y-2 rounded-lg border border-borda p-3 sm:col-span-2 lg:col-span-5">
          {divisoes.map((d, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Select aria-label={`Categoria ${i + 1}`} value={d.categoriaId} onValueChange={(v) => setDivisoes(divisoes.map((x, j) => (j === i ? { ...x, categoriaId: v } : x)))} options={opcoesCategoria(categoriasDespesa, todas)} className="min-w-48 flex-1" />
              <input value={d.valor} onChange={(e) => setDivisoes(divisoes.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} inputMode="decimal" placeholder="Valor (R$)" aria-label={`Valor da categoria ${i + 1}`} className={`${CLASSE_INPUT} w-32`} />
              {divisoes.length > 2 && <button type="button" onClick={() => setDivisoes(divisoes.filter((_, j) => j !== i))} aria-label="Remover parte" className="rounded p-1 text-texto-secundario hover:text-erro"><Trash2 size={14} /></button>}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <Button type="button" tamanho="pequeno" variante="fantasma" onClick={() => setDivisoes([...divisoes, { categoriaId: categoriasDespesa[0]?.id ?? "", valor: "" }])}><Plus size={13} /> Mais uma categoria</Button>
            <span className={somaDivisao === valorCentavos ? "text-sucesso" : "text-alerta"}>Soma {formatarCentavos(somaDivisao)} de {formatarCentavos(valorCentavos)}</span>
            {somaDivisao !== valorCentavos && valorCentavos > somaDivisao && divisoes.length > 0 && (
              <button type="button" className="text-primaria hover:underline" onClick={() => setDivisoes(divisoes.map((x, j) => (j === divisoes.length - 1 ? { ...x, valor: centavosParaValorInput(valorInputParaCentavos(x.valor) + valorCentavos - somaDivisao) } : x)))}>Completar na última</button>
            )}
            <button type="button" className="text-texto-secundario hover:underline" onClick={() => { setDividir(false); setDivisoes([]); }}>Cancelar divisão</button>
          </div>
        </div>
      )}
      <Select aria-label="Etiqueta" value={etiqueta} onValueChange={setEtiqueta} options={OPCOES_ETIQUETA} />
      <input type="date" value={data} onChange={(e) => setData(e.target.value)} aria-label="Data" className={CLASSE_INPUT} />
      <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observação (opcional)" aria-label="Observação" className={`${CLASSE_INPUT} lg:col-span-2`} />
      <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags (ex.: viagem, presente)" aria-label="Tags" className={CLASSE_INPUT} />
      <label className="flex cursor-pointer items-center gap-2 truncate text-xs text-texto-secundario">
        <Paperclip size={14} /> {comprovante ? comprovante.name : "Anexar comprovante"}
        <input type="file" accept="image/*,application/pdf" aria-label="Comprovante" onChange={(e) => setComprovante(e.target.files?.[0] ?? null)} className="sr-only" />
      </label>
      {ehCartao && (
        <label className="flex items-center gap-2 text-xs text-texto-secundario">
          Parcelas
          <input type="number" min={1} max={72} value={parcelas} onChange={(e) => setParcelas(e.target.value)} aria-label="Parcelas" className={`${CLASSE_INPUT} w-20`} />
        </label>
      )}
      <Button type="submit" disabled={enviando} className="lg:col-start-5">
        {enviando ? "Salvando…" : "Registrar despesa"}
      </Button>
      {avisos && (
        <div role="alert" className="space-y-2 rounded-lg border border-alerta/60 bg-alerta/10 p-3 text-sm sm:col-span-2 lg:col-span-5">
          {avisos.map((a) => <p key={a} className="flex items-start gap-2 text-texto-primario"><TriangleAlert size={15} className="mt-0.5 shrink-0 text-alerta" />{a}</p>)}
          <div className="flex gap-2">
            <Button type="button" tamanho="pequeno" onClick={(e) => enviar(e as unknown as React.FormEvent, true)}>Registrar mesmo assim</Button>
            <Button type="button" tamanho="pequeno" variante="fantasma" onClick={() => setAvisos(null)}>Voltar e conferir</Button>
          </div>
        </div>
      )}
    </form>
  );
}
