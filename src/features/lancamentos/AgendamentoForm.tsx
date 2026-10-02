import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { dataAtualISO, valorInputParaCentavos } from "../../services/formato";
import type { Conta, Etiqueta } from "../../types/accounting";
import { OPCOES_ETIQUETA } from "./opcoesEtiqueta";

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
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const valorCentavos = valorInputParaCentavos(valor);
    if (!descricao.trim() || valorCentavos <= 0 || !categoriaId || !vencimento) {
      toast.error("Preencha descrição, valor, vencimento e categoria.");
      return;
    }
    try {
      setEnviando(true);
      await contabilidade.criarAgendamento({
        descricao: descricao.trim(),
        valor_centavos: valorCentavos,
        vencimento,
        categoria_despesa_id: categoriaId,
        etiqueta: etiqueta === "NENHUMA" ? null : (etiqueta as Etiqueta),
      });
      toast.success("Conta agendada.");
      setDescricao("");
      setValor("");
      onCriado();
    } catch (e) {
      toast.error(String(e));
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
      <label className="flex items-center gap-2 text-xs text-texto-secundario">
        Vence em
        <input
          type="date"
          value={vencimento}
          onChange={(e) => setVencimento(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-borda bg-fundo px-3 py-2 text-sm text-texto-primario outline-none focus:border-primaria"
        />
      </label>
      <Button type="submit" disabled={enviando} className="lg:col-start-5">
        {enviando ? "Salvando…" : "Agendar conta"}
      </Button>
    </form>
  );
}
