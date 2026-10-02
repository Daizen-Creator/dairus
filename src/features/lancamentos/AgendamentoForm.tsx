import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
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

interface AgendamentoFormProps {
  categoriasDespesa: Conta[];
  onCriado: () => void;
}

export function AgendamentoForm({ categoriasDespesa, onCriado }: AgendamentoFormProps) {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState(dataAtualISO());
  const [categoriaId, setCategoriaId] = useState(categoriasDespesa[0]?.id ?? "");
  const [etiqueta, setEtiqueta] = useState("NENHUMA");
  const [parcelas, setParcelas] = useState("1");
  const [recorrencia, setRecorrencia] = useState("NENHUMA");
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const valorCentavos = valorInputParaCentavos(valor);
    if (!descricao.trim() || valorCentavos <= 0 || !categoriaId || !vencimento) {
      toast.error("Preencha descrição, valor, vencimento e categoria.");
      return;
    }
    const total = Math.max(1, Math.min(60, Math.floor(Number(parcelas) || 1)));
    let criadas = 0;
    try {
      setEnviando(true);
      for (let i = 0; i < total; i++) {
        await contabilidade.criarAgendamento({
          descricao: total > 1 ? `${descricao.trim()} (${i + 1}/${total})` : descricao.trim(),
          valor_centavos: valorCentavos,
          vencimento: somarMeses(vencimento, i),
          categoria_despesa_id: categoriaId,
          etiqueta: etiqueta === "NENHUMA" ? null : (etiqueta as Etiqueta),
          // Conta repetida e parcelada ao mesmo tempo não faz sentido: as parcelas já são a série.
          recorrencia: total === 1 && recorrencia !== "NENHUMA" ? (recorrencia as Recorrencia) : null,
        });
        criadas++;
      }
      toast.success(total > 1 ? `${total} parcelas agendadas.` : "Conta agendada.");
      setDescricao("");
      setValor("");
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
      <input
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        placeholder="Descrição (ex.: Faculdade Wyden)"
        className="rounded-lg border border-borda bg-fundo px-3 py-2 text-sm text-texto-primario outline-none focus:border-primaria lg:col-span-2"
      />
      <input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        inputMode="decimal"
        placeholder="Valor (R$)"
        className="rounded-lg border border-borda bg-fundo px-3 py-2 text-sm text-texto-primario outline-none focus:border-primaria"
      />
      <Select
        aria-label="Categoria da despesa"
        value={categoriaId}
        onValueChange={setCategoriaId}
        options={categoriasDespesa.map((c) => ({ value: c.id, label: c.nome }))}
      />
      <Select aria-label="Etiqueta" value={etiqueta} onValueChange={setEtiqueta} options={OPCOES_ETIQUETA} />
      <Select aria-label="Repetição" value={recorrencia} onValueChange={setRecorrencia} options={OPCOES_RECORRENCIA} />
      <label className="flex items-center gap-2 text-xs text-texto-secundario">
        Vence em
        <input
          type="date"
          value={vencimento}
          onChange={(e) => setVencimento(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-borda bg-fundo px-3 py-2 text-sm text-texto-primario outline-none focus:border-primaria"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-texto-secundario">
        Parcelas
        <input
          type="number"
          min={1}
          max={60}
          value={parcelas}
          onChange={(e) => setParcelas(e.target.value)}
          className="w-20 rounded-lg border border-borda bg-fundo px-3 py-2 text-sm text-texto-primario outline-none focus:border-primaria"
        />
      </label>
      <Button type="submit" disabled={enviando} className="lg:col-start-5">
        {enviando ? "Salvando…" : "Agendar conta"}
      </Button>
    </form>
  );
}
