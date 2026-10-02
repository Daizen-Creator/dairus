import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { dataAtualISO, valorInputParaCentavos } from "../../services/formato";
import type { Conta } from "../../types/accounting";

interface NovaReceitaFormProps {
  contasDestino: Conta[];
  categoriasReceita: Conta[];
  onRegistrada: () => void;
}

export function NovaReceitaForm({ contasDestino, categoriasReceita, onRegistrada }: NovaReceitaFormProps) {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(dataAtualISO());
  const [contaId, setContaId] = useState(contasDestino[0]?.id ?? "");
  const [categoriaId, setCategoriaId] = useState(
    categoriasReceita.find((c) => c.id === "receita-renda-extra")?.id ?? categoriasReceita[0]?.id ?? "",
  );
  const [enviando, setEnviando] = useState(false);

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    const centavos = valorInputParaCentavos(valor);
    if (!descricao.trim() || centavos <= 0 || !contaId || !categoriaId) {
      toast.error("Preencha descrição, valor, conta e categoria.");
      return;
    }
    try {
      setEnviando(true);
      await contabilidade.registrarRecebimento({
        conta_destino_id: contaId,
        conta_receita_id: categoriaId,
        valor_centavos: centavos,
        data,
        descricao: descricao.trim(),
      });
      toast.success("Receita registrada.");
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
      <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição (ex.: Freela, Reembolso)" className={`${CLASSE_INPUT} lg:col-span-2`} />
      <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="Valor (R$)" className={CLASSE_INPUT} />
      <Select aria-label="Categoria da receita" value={categoriaId} onValueChange={setCategoriaId} options={categoriasReceita.map((c) => ({ value: c.id, label: c.nome }))} />
      <Select aria-label="Conta que recebe" value={contaId} onValueChange={setContaId} options={contasDestino.map((c) => ({ value: c.id, label: c.nome }))} />
      <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={CLASSE_INPUT} />
      <Button type="submit" disabled={enviando} className="lg:col-start-5">
        {enviando ? "Salvando…" : "Registrar receita"}
      </Button>
    </form>
  );
}
