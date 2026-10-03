import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { opcoesCategoria } from "../../services/categorias";
import { dataAtualISO, valorInputParaCentavos } from "../../services/formato";
import type { Conta, Etiqueta, Recorrencia } from "../../types/accounting";
import { OPCOES_ETIQUETA } from "./opcoesEtiqueta";
import { OPCOES_RECORRENCIA } from "./opcoesRecorrencia";

/** Soma meses mantendo o dia (ajusta para o último dia quando o mês é mais curto). */
function somarMeses(dataISO: string, meses: number): string {
  const [a, m, d] = dataISO.split("-").map(Number);
  const ultimo = new Date(a, m - 1 + meses + 1, 0).getDate();
  const dt = new Date(a, m - 1 + meses, Math.min(d, ultimo));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

interface AgendamentoFormProps {
  categoriasDespesa: Conta[];
  categoriasReceita?: Conta[];
  /** Contas para o lançamento automático (pagar: ativo/cartão; receber: ativo). */
  contas?: Conta[];
  onCriado: () => void;
}

export function AgendamentoForm({ categoriasDespesa, categoriasReceita = [], contas = [], onCriado }: AgendamentoFormProps) {
  const [tipo, setTipo] = useState<"PAGAR" | "RECEBER">("PAGAR");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState(dataAtualISO());
  const [categoriaId, setCategoriaId] = useState("");
  const [etiqueta, setEtiqueta] = useState("NENHUMA");
  const [parcelas, setParcelas] = useState("1");
  const [recorrencia, setRecorrencia] = useState("NENHUMA");
  const [automatico, setAutomatico] = useState(false);
  const [contaId, setContaId] = useState("");
  const [reajuste, setReajuste] = useState("");
  const [mesReajuste, setMesReajuste] = useState("1");
  const [pessoa, setPessoa] = useState("");
  const [enviando, setEnviando] = useState(false);

  const categorias = tipo === "PAGAR" ? categoriasDespesa : categoriasReceita;
  const categoriaValida = categorias.some((c) => c.id === categoriaId) ? categoriaId : categorias[0]?.id ?? "";
  const contasAuto = contas.filter((c) => c.ativa && c.subtipo !== "CATEGORIA" && (c.tipo === "ATIVO" || (tipo === "PAGAR" && c.tipo === "PASSIVO")));
  const contaValida = contasAuto.some((c) => c.id === contaId) ? contaId : contasAuto[0]?.id ?? "";

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const valorCentavos = valorInputParaCentavos(valor);
    if (!descricao.trim() || valorCentavos <= 0 || !categoriaValida || !vencimento) {
      toast.error("Preencha descrição, valor, data e categoria.");
      return;
    }
    const total = Math.max(1, Math.min(60, Math.floor(Number(parcelas) || 1)));
    const pct = reajuste.trim() ? Number(reajuste.replace(",", ".")) / 100 : null;
    let criadas = 0;
    try {
      setEnviando(true);
      for (let i = 0; i < total; i++) {
        await contabilidade.criarAgendamento({
          descricao: total > 1 ? `${descricao.trim()} (${i + 1}/${total})` : descricao.trim(),
          valor_centavos: valorCentavos,
          vencimento: somarMeses(vencimento, i),
          categoria_despesa_id: categoriaValida,
          etiqueta: etiqueta === "NENHUMA" ? null : (etiqueta as Etiqueta),
          // Conta repetida e parcelada ao mesmo tempo não faz sentido: as parcelas já são a série.
          recorrencia: total === 1 && recorrencia !== "NENHUMA" ? (recorrencia as Recorrencia) : null,
          tipo,
          automatico: automatico && !!contaValida,
          conta_id: automatico ? contaValida || null : null,
          reajuste_anual: pct !== null && Number.isFinite(pct) && recorrencia !== "NENHUMA" ? pct : null,
          mes_reajuste: pct !== null && recorrencia !== "NENHUMA" ? Number(mesReajuste) : null,
          pessoa: pessoa.trim() || null,
        });
        criadas++;
      }
      const nome = tipo === "PAGAR" ? "Conta agendada" : "Receita agendada";
      toast.success(total > 1 ? `${total} parcelas agendadas.` : automatico ? `${nome}: será lançada sozinha no dia.` : `${nome}.`);
      setDescricao("");
      setValor("");
      setPessoa("");
      onCriado();
    } catch (e) {
      toast.error(criadas > 0 ? `${String(e)} (${criadas} parcela(s) já foram criadas.)` : String(e));
      if (criadas > 0) onCriado();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
        {(["PAGAR", "RECEBER"] as const).map((t) => (
          <Button key={t} type="button" tamanho="pequeno" variante={tipo === t ? "primaria" : "secundaria"} onClick={() => setTipo(t)}>
            {t === "PAGAR" ? "Conta a pagar" : "Receita a receber (salário, VA, freela)"}
          </Button>
        ))}
      </div>
      <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={tipo === "PAGAR" ? "Descrição (ex.: Faculdade Wyden)" : "Descrição (ex.: Salário, Vale-alimentação)"} aria-label="Descrição do agendamento" className={`${CLASSE_INPUT} lg:col-span-2`} />
      <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="Valor (R$)" aria-label="Valor do agendamento" className={CLASSE_INPUT} />
      <Select aria-label={tipo === "PAGAR" ? "Categoria da despesa" : "Categoria da receita"} value={categoriaValida} onValueChange={setCategoriaId} options={opcoesCategoria(categorias, [...categoriasDespesa, ...categoriasReceita])} />
      <Select aria-label="Etiqueta" value={etiqueta} onValueChange={setEtiqueta} options={OPCOES_ETIQUETA} />
      <Select aria-label="Repetição" value={recorrencia} onValueChange={setRecorrencia} options={OPCOES_RECORRENCIA} />
      <label className="flex items-center gap-2 text-xs text-texto-secundario">
        {tipo === "PAGAR" ? "Vence em" : "Entra em"}
        <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} aria-label="Data do agendamento" className={`${CLASSE_INPUT} min-w-0 flex-1`} />
      </label>
      <label className="flex items-center gap-2 text-xs text-texto-secundario">
        Parcelas
        <input type="number" min={1} max={60} value={parcelas} onChange={(e) => setParcelas(e.target.value)} aria-label="Parcelas do agendamento" className={`${CLASSE_INPUT} w-20`} />
      </label>
      <input value={pessoa} onChange={(e) => setPessoa(e.target.value)} placeholder={tipo === "PAGAR" ? "Para quem (opcional)" : "De quem (opcional)"} aria-label="Pessoa" className={CLASSE_INPUT} />
      <label className="flex items-center gap-2 text-xs text-texto-primario sm:col-span-2">
        <input type="checkbox" checked={automatico} onChange={() => setAutomatico(!automatico)} className="h-4 w-4 accent-[var(--cor-primaria)]" />
        Lançar sozinho no dia
        {automatico && <Select aria-label="Conta do lançamento automático" value={contaValida} onValueChange={setContaId} options={contasAuto.map((c) => ({ value: c.id, label: c.nome }))} className="flex-1" />}
      </label>
      {recorrencia !== "NENHUMA" && (
        <label className="flex flex-wrap items-center gap-2 text-xs text-texto-secundario sm:col-span-2">
          Reajuste anual
          <input value={reajuste} onChange={(e) => setReajuste(e.target.value)} inputMode="decimal" placeholder="%" aria-label="Reajuste anual (%)" className={`${CLASSE_INPUT} w-16 py-1`} />
          em
          <Select aria-label="Mês do reajuste" value={mesReajuste} onValueChange={setMesReajuste} options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))} className="w-32" />
        </label>
      )}
      <Button type="submit" disabled={enviando} className="lg:col-start-5">
        {enviando ? "Salvando…" : tipo === "PAGAR" ? "Agendar conta" : "Agendar receita"}
      </Button>
    </form>
  );
}
