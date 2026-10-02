import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { dataAtualISO, valorInputParaCentavos } from "../../services/formato";
import type { Conta } from "../../types/accounting";

interface TransferenciaFormProps {
  contas: Conta[];
  onRegistrada: () => void;
}

export function TransferenciaForm({ contas, onRegistrada }: TransferenciaFormProps) {
  const [origemId, setOrigemId] = useState(contas[0]?.id ?? "");
  const [destinoId, setDestinoId] = useState(contas[1]?.id ?? contas[0]?.id ?? "");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(dataAtualISO());
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const valorCentavos = valorInputParaCentavos(valor);
    if (valorCentavos <= 0 || !origemId || !destinoId) {
      toast.error("Preencha valor, conta de origem e conta de destino.");
      return;
    }
    if (origemId === destinoId) {
      toast.error("Escolha contas diferentes para origem e destino.");
      return;
    }
    try {
      setEnviando(true);
      const nomeOrigem = contas.find((c) => c.id === origemId)?.nome;
      const nomeDestino = contas.find((c) => c.id === destinoId)?.nome;
      await contabilidade.registrarTransferencia({
        conta_origem_id: origemId,
        conta_destino_id: destinoId,
        valor_centavos: valorCentavos,
        data,
        descricao: `Transferência de ${nomeOrigem} para ${nomeDestino}`,
      });
      toast.success("Transferência registrada.");
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
      <Select
        aria-label="Conta de origem"
        value={origemId}
        onValueChange={setOrigemId}
        options={contas.map((c) => ({ value: c.id, label: `De: ${c.nome}` }))}
      />
      <Select
        aria-label="Conta de destino"
        value={destinoId}
        onValueChange={setDestinoId}
        options={contas.map((c) => ({ value: c.id, label: `Para: ${c.nome}` }))}
      />
      <input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        inputMode="decimal"
        placeholder="Valor (R$)"
        className="rounded-lg border border-borda bg-fundo px-3 py-2 text-sm text-texto-primario outline-none focus:border-primaria"
      />
      <input
        type="date"
        value={data}
        onChange={(e) => setData(e.target.value)}
        className="rounded-lg border border-borda bg-fundo px-3 py-2 text-sm text-texto-primario outline-none focus:border-primaria"
      />
      <Button type="submit" disabled={enviando}>
        {enviando ? "Salvando…" : "Transferir"}
      </Button>
    </form>
  );
}
