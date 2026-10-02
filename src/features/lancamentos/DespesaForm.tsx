import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { dataAtualISO, valorInputParaCentavos } from "../../services/formato";
import type { Conta, Etiqueta } from "../../types/accounting";
import { OPCOES_ETIQUETA } from "./opcoesEtiqueta";

interface DespesaFormProps {
  contasOrigem: Conta[];
  categoriasDespesa: Conta[];
  onRegistrada: () => void;
}

export function DespesaForm({ contasOrigem, categoriasDespesa, onRegistrada }: DespesaFormProps) {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(dataAtualISO());
  const [contaOrigemId, setContaOrigemId] = useState(contasOrigem[0]?.id ?? "");
  const [categoriaId, setCategoriaId] = useState(categoriasDespesa[0]?.id ?? "");
  const [etiqueta, setEtiqueta] = useState("NENHUMA");
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const valorCentavos = valorInputParaCentavos(valor);
    if (!descricao.trim() || valorCentavos <= 0 || !contaOrigemId || !categoriaId) {
      toast.error("Preencha descrição, valor, conta e categoria.");
      return;
    }
    try {
      setEnviando(true);
      await contabilidade.registrarDespesa({
        conta_origem_id: contaOrigemId,
        categoria_despesa_id: categoriaId,
        valor_centavos: valorCentavos,
        data,
        descricao: descricao.trim(),
        etiqueta: etiqueta === "NENHUMA" ? null : (etiqueta as Etiqueta),
      });
      toast.success("Despesa registrada.");
      setDescricao("");
      setValor("");
      onRegistrada();
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
        placeholder="Descrição"
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
      <Select
        aria-label="Conta de origem"
        value={contaOrigemId}
        onValueChange={setContaOrigemId}
        options={contasOrigem.map((c) => ({ value: c.id, label: c.nome }))}
      />
      <Select aria-label="Etiqueta" value={etiqueta} onValueChange={setEtiqueta} options={OPCOES_ETIQUETA} />
      <input
        type="date"
        value={data}
        onChange={(e) => setData(e.target.value)}
        className="rounded-lg border border-borda bg-fundo px-3 py-2 text-sm text-texto-primario outline-none focus:border-primaria"
      />
      <Button type="submit" disabled={enviando} className="lg:col-start-5">
        {enviando ? "Salvando…" : "Registrar despesa"}
      </Button>
    </form>
  );
}
