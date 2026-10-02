import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { investimentos } from "../../services/investimentos";
import { dataAtualISO, formatarCentavos, valorInputParaCentavos } from "../../services/formato";
import type { Conta } from "../../types/accounting";
import type { AtivoInput, AtivoInvest, ClasseAtivo, Indexador, Risco, TipoOperacao } from "../../types/investimentos";
import { CLASSES_RENDA_FIXA, CONTA_JA_TINHA, ROTULO_CLASSE } from "../../types/investimentos";
import { numeroBR } from "./importacaoB3";

const CLASSES = Object.entries(ROTULO_CLASSE).map(([value, label]) => ({ value, label }));
const INDEXADORES = [
  { value: "", label: "Sem indexador" },
  { value: "CDI", label: "% do CDI" },
  { value: "SELIC", label: "% da Selic" },
  { value: "IPCA", label: "IPCA + taxa" },
  { value: "PRE", label: "Prefixado (% a.a.)" },
];
const RISCOS = [
  { value: "", label: "Risco não informado" },
  { value: "BAIXO", label: "Risco baixo" },
  { value: "MEDIO", label: "Risco médio" },
  { value: "ALTO", label: "Risco alto" },
];

const numeroOuNull = (t: string) => (t.trim() ? numeroBR(t) : null);
const textoNum = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

/** Cadastro/edição de um ativo da carteira. */
export function FormAtivo({ inicial, onSalvo, onCancelar }: { inicial?: AtivoInvest | null; onSalvo: (id: string) => void; onCancelar: () => void }) {
  const [f, setF] = useState({
    codigo: inicial?.codigo ?? "",
    nome: inicial?.nome ?? "",
    classe: (inicial?.classe ?? "ACAO") as ClasseAtivo,
    indexador: inicial?.indexador ?? "",
    taxa: textoNum(inicial?.taxa),
    vencimento: inicial?.vencimento ?? "",
    objetivo: inicial?.objetivo ?? "",
    setor: inicial?.setor ?? "",
    risco: inicial?.risco ?? "",
    alertaAcima: textoNum(inicial?.alerta_acima),
    alertaAbaixo: textoNum(inicial?.alerta_abaixo),
    notas: inicial?.notas ?? "",
  });
  const rendaFixa = CLASSES_RENDA_FIXA.includes(f.classe);
  const mudar = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    const input: AtivoInput = {
      id: inicial?.id ?? null,
      codigo: f.codigo,
      nome: f.nome || null,
      classe: f.classe,
      indexador: rendaFixa && f.indexador ? (f.indexador as Indexador) : null,
      taxa: rendaFixa ? numeroOuNull(f.taxa) : null,
      vencimento: f.vencimento || null,
      objetivo: f.objetivo || null,
      setor: f.setor || null,
      risco: (f.risco || null) as Risco | null,
      alerta_acima: numeroOuNull(f.alertaAcima),
      alerta_abaixo: numeroOuNull(f.alertaAbaixo),
      notas: f.notas || null,
    };
    try {
      const id = await investimentos.salvarAtivo(input);
      toast.success(inicial ? "Ativo atualizado." : "Ativo cadastrado. Agora registre a compra.");
      onSalvo(id);
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <form onSubmit={salvar} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input value={f.codigo} onChange={(e) => mudar("codigo", e.target.value)} placeholder={rendaFixa ? "Nome (ex.: CDB Inter 2028)" : "Código (ex.: PETR4, MXRF11, BTC)"} aria-label="Código do ativo" className={CLASSE_INPUT} />
      <input value={f.nome} onChange={(e) => mudar("nome", e.target.value)} placeholder="Descrição (opcional)" aria-label="Descrição do ativo" className={CLASSE_INPUT} />
      <Select aria-label="Classe" value={f.classe} onValueChange={(v) => mudar("classe", v)} options={CLASSES} />
      <Select aria-label="Risco" value={f.risco} onValueChange={(v) => mudar("risco", v)} options={RISCOS} />
      {rendaFixa && f.classe !== "POUPANCA" && (
        <>
          <Select aria-label="Indexador" value={f.indexador} onValueChange={(v) => mudar("indexador", v)} options={INDEXADORES} />
          <input value={f.taxa} onChange={(e) => mudar("taxa", e.target.value)} inputMode="decimal" placeholder={f.indexador === "CDI" || f.indexador === "SELIC" ? "Taxa (ex.: 110 = 110%)" : "Taxa % a.a. (ex.: 6,5)"} aria-label="Taxa" className={CLASSE_INPUT} />
          <label className="text-xs text-texto-secundario">Vencimento<input type="date" value={f.vencimento} onChange={(e) => mudar("vencimento", e.target.value)} aria-label="Vencimento" className={`${CLASSE_INPUT} mt-1 block w-full`} /></label>
        </>
      )}
      <input value={f.objetivo} onChange={(e) => mudar("objetivo", e.target.value)} placeholder="Objetivo (ex.: Aposentadoria, Viagem)" aria-label="Objetivo" className={CLASSE_INPUT} />
      <input value={f.setor} onChange={(e) => mudar("setor", e.target.value)} placeholder="Setor (ex.: Energia, Bancos, Logística)" aria-label="Setor" className={CLASSE_INPUT} />
      {!rendaFixa && (
        <>
          <input value={f.alertaAcima} onChange={(e) => mudar("alertaAcima", e.target.value)} inputMode="decimal" placeholder="Avisar quando subir a R$…" aria-label="Alerta de alta" className={CLASSE_INPUT} />
          <input value={f.alertaAbaixo} onChange={(e) => mudar("alertaAbaixo", e.target.value)} inputMode="decimal" placeholder="Avisar quando cair a R$…" aria-label="Alerta de baixa" className={CLASSE_INPUT} />
        </>
      )}
      <input value={f.notas} onChange={(e) => mudar("notas", e.target.value)} placeholder="Notas" aria-label="Notas do ativo" className={`${CLASSE_INPUT} lg:col-span-2`} />
      <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
        <Button type="submit">{inicial ? "Salvar ativo" : "Cadastrar ativo"}</Button>
        <Button type="button" variante="fantasma" onClick={onCancelar}>Cancelar</Button>
      </div>
    </form>
  );
}

const TIPOS: Array<{ value: TipoOperacao; label: string }> = [
  { value: "COMPRA", label: "Compra / aplicação" },
  { value: "VENDA", label: "Venda / resgate" },
  { value: "DIVIDENDO", label: "Dividendo" },
  { value: "JCP", label: "Juros sobre capital (JCP)" },
  { value: "RENDIMENTO", label: "Rendimento (FII, renda fixa)" },
  { value: "AMORTIZACAO", label: "Amortização" },
];

/** Registro de compra, venda ou provento. */
export function FormOperacao({ ativos, contas, ativoInicial, onRegistrada }: { ativos: AtivoInvest[]; contas: Conta[]; ativoInicial?: string; onRegistrada: () => void }) {
  const abertos = ativos.filter((a) => a.ativo);
  const origens = contas.filter((c) => c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA" && c.subtipo !== "INVESTIMENTO" && c.ativa);
  const [ativoId, setAtivoId] = useState(ativoInicial ?? abertos[0]?.id ?? "");
  const [tipo, setTipo] = useState<TipoOperacao>("COMPRA");
  const [data, setData] = useState(dataAtualISO());
  const [quantidade, setQuantidade] = useState("");
  const [preco, setPreco] = useState("");
  const [valor, setValor] = useState("");
  const [taxas, setTaxas] = useState("");
  const [ir, setIr] = useState("");
  const [dayTrade, setDayTrade] = useState(false);
  const [contaId, setContaId] = useState(origens[0]?.id ?? "");
  const [enviando, setEnviando] = useState(false);
  const ativo = ativos.find((a) => a.id === ativoId);
  const rendaFixa = ativo ? CLASSES_RENDA_FIXA.includes(ativo.classe) : false;
  const negociacao = tipo === "COMPRA" || tipo === "VENDA";
  const totalNegociacao = negociacao && !rendaFixa ? numeroBR(quantidade) * numeroBR(preco) : 0;

  async function registrar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!ativo) return toast.error("Cadastre um ativo primeiro.");
    let q = numeroBR(quantidade);
    let p = numeroBR(preco);
    let v: number | null = null;
    if (negociacao && rendaFixa) {
      // Renda fixa: informa o valor aplicado/resgatado; vira "cotas" de R$ 1.
      v = valorInputParaCentavos(valor);
      if (tipo === "COMPRA") {
        q = v / 100;
        p = 1;
      } else {
        const pct = Math.min(1, Math.max(0, numeroBR(quantidade || "100") / 100));
        q = ativo.quantidade * pct;
        p = q > 0 ? v / 100 / q : 0;
      }
    } else if (!negociacao) {
      v = valorInputParaCentavos(valor);
    }
    try {
      setEnviando(true);
      await investimentos.registrarOperacao({
        ativo_id: ativo.id,
        tipo,
        data,
        quantidade: q,
        preco_unitario: p,
        valor_centavos: v,
        taxas_centavos: valorInputParaCentavos(taxas || "0"),
        ir_retido_centavos: valorInputParaCentavos(ir || "0"),
        day_trade: dayTrade,
        conta_id: contaId || null,
      });
      toast.success("Operação registrada" + (contaId && contaId !== CONTA_JA_TINHA ? " e lançada na conta." : "."));
      setQuantidade("");
      setPreco("");
      setValor("");
      setTaxas("");
      setIr("");
      onRegistrada();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setEnviando(false);
    }
  }

  if (abertos.length === 0) return <p className="text-sm text-texto-secundario">Cadastre um ativo para registrar operações.</p>;

  return (
    <form onSubmit={registrar} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Select aria-label="Ativo" value={ativoId} onValueChange={setAtivoId} options={abertos.map((a) => ({ value: a.id, label: `${a.codigo} · ${ROTULO_CLASSE[a.classe]}` }))} />
      <Select aria-label="Tipo de operação" value={tipo} onValueChange={(v) => setTipo(v as TipoOperacao)} options={TIPOS} />
      <input type="date" value={data} onChange={(e) => setData(e.target.value)} aria-label="Data da operação" className={CLASSE_INPUT} />
      <Select
        aria-label="Conta"
        value={contaId}
        onValueChange={setContaId}
        options={[
          ...origens.map((c) => ({ value: c.id, label: `${tipo === "COMPRA" ? "Pago com" : "Recebido em"} ${c.nome}` })),
          ...(tipo === "COMPRA" ? [{ value: CONTA_JA_TINHA, label: "Já tinha (não mexe nas contas)" }] : []),
          { value: "", label: "Só registrar na carteira" },
        ]}
      />
      {negociacao && !rendaFixa && (
        <>
          <input value={quantidade} onChange={(e) => setQuantidade(e.target.value)} inputMode="decimal" placeholder="Quantidade" aria-label="Quantidade" className={CLASSE_INPUT} />
          <input value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" placeholder="Preço unitário (R$)" aria-label="Preço unitário" className={CLASSE_INPUT} />
        </>
      )}
      {(!negociacao || rendaFixa) && (
        <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder={negociacao ? (tipo === "COMPRA" ? "Valor aplicado (R$)" : "Valor bruto resgatado (R$)") : "Valor recebido bruto (R$)"} aria-label="Valor" className={CLASSE_INPUT} />
      )}
      {negociacao && rendaFixa && tipo === "VENDA" && (
        <input value={quantidade} onChange={(e) => setQuantidade(e.target.value)} inputMode="decimal" placeholder="% resgatado (100 = tudo)" aria-label="Percentual resgatado" className={CLASSE_INPUT} />
      )}
      {negociacao && <input value={taxas} onChange={(e) => setTaxas(e.target.value)} inputMode="decimal" placeholder="Taxas e corretagem (R$)" aria-label="Taxas" className={CLASSE_INPUT} />}
      {tipo !== "COMPRA" && <input value={ir} onChange={(e) => setIr(e.target.value)} inputMode="decimal" placeholder="IR retido na fonte (R$)" aria-label="IR retido" className={CLASSE_INPUT} />}
      {negociacao && !rendaFixa && (
        <label className="flex items-center gap-2 text-xs text-texto-primario"><input type="checkbox" checked={dayTrade} onChange={() => setDayTrade(!dayTrade)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Day trade (compra e venda no mesmo dia)</label>
      )}
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
        <Button type="submit" disabled={enviando}>{enviando ? "Registrando…" : "Registrar operação"}</Button>
        {totalNegociacao > 0 && <span className="text-xs text-texto-secundario">Total: {formatarCentavos(Math.round(totalNegociacao * 100))}</span>}
        {ativo && ativo.quantidade > 0 && <span className="text-xs text-texto-secundario">Você tem {ativo.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 8 })} · preço médio {formatarCentavos(Math.round(ativo.preco_medio * 100))}</span>}
      </div>
    </form>
  );
}
