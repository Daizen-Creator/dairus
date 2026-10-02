import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { centavosParaValorInput, dataAtualISO, valorInputParaCentavos } from "../../services/formato";
import { CONTAS_SISTEMA } from "../../types/accounting";
import type { Conta } from "../../types/accounting";

interface RecebimentoFormProps {
  contasDestino: Conta[];
  onRegistrado: () => void;
}

type TipoRecebimento = "SALARIO" | "VA" | "RENDA_EXTRA";

const CONFIG_TIPO: Record<
  TipoRecebimento,
  { rotulo: string; contaReceitaId: string; valorPadraoCentavos: number; descricaoPadrao: string }
> = {
  SALARIO: {
    rotulo: "Salário",
    contaReceitaId: CONTAS_SISTEMA.receitaSalario,
    valorPadraoCentavos: 120000,
    descricaoPadrao: "Salário",
  },
  VA: {
    rotulo: "Vale-Alimentação",
    contaReceitaId: CONTAS_SISTEMA.receitaBeneficios,
    valorPadraoCentavos: 60000,
    descricaoPadrao: "Vale-Alimentação",
  },
  RENDA_EXTRA: {
    rotulo: "Renda Extra",
    contaReceitaId: CONTAS_SISTEMA.receitaRendaExtra,
    valorPadraoCentavos: 0,
    descricaoPadrao: "Renda extra",
  },
};

export function RecebimentoForm({ contasDestino, onRegistrado }: RecebimentoFormProps) {
  const [tipo, setTipo] = useState<TipoRecebimento>("SALARIO");
  const [contaDestinoId, setContaDestinoId] = useState(contasDestino[0]?.id ?? "");
  const [valor, setValor] = useState(centavosParaValorInput(CONFIG_TIPO.SALARIO.valorPadraoCentavos));
  const [descricao, setDescricao] = useState(CONFIG_TIPO.SALARIO.descricaoPadrao);
  const [data, setData] = useState(dataAtualISO());
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const config = CONFIG_TIPO[tipo];
    setValor(centavosParaValorInput(config.valorPadraoCentavos));
    setDescricao(config.descricaoPadrao);
    if (tipo === "VA") setContaDestinoId(CONTAS_SISTEMA.valeAlimentacao);
    else setContaDestinoId((atual) => (atual === CONTAS_SISTEMA.valeAlimentacao ? contasDestino[0]?.id ?? "" : atual));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const valorCentavos = valorInputParaCentavos(valor);
    if (valorCentavos <= 0 || !contaDestinoId) {
      toast.error("Informe um valor e uma conta de destino.");
      return;
    }
    try {
      setEnviando(true);
      await contabilidade.registrarRecebimento({
        conta_destino_id: contaDestinoId,
        conta_receita_id: CONFIG_TIPO[tipo].contaReceitaId,
        valor_centavos: valorCentavos,
        data,
        descricao: descricao.trim() || CONFIG_TIPO[tipo].descricaoPadrao,
      });
      toast.success(`${CONFIG_TIPO[tipo].rotulo} registrado(a).`);
      onRegistrado();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(CONFIG_TIPO) as TipoRecebimento[]).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setTipo(t)}
            className={`rounded-lg px-3 py-1.5 text-sm ${tipo === t ? "bg-primaria text-primaria-texto" : "bg-superficie text-texto-secundario"}`}
          >
            {CONFIG_TIPO[t].rotulo}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descrição"
          className="rounded-lg border border-borda bg-fundo px-3 py-2 text-sm text-texto-primario outline-none focus:border-primaria"
        />
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          inputMode="decimal"
          placeholder="Valor (R$)"
          className="rounded-lg border border-borda bg-fundo px-3 py-2 text-sm text-texto-primario outline-none focus:border-primaria"
        />
        <Select
          aria-label="Conta de destino"
          value={contaDestinoId}
          onValueChange={setContaDestinoId}
          disabled={tipo === "VA"}
          options={
            tipo === "VA"
              ? [{ value: CONTAS_SISTEMA.valeAlimentacao, label: "Vale-Alimentação" }]
              : contasDestino.map((c) => ({ value: c.id, label: c.nome }))
          }
        />
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="rounded-lg border border-borda bg-fundo px-3 py-2 text-sm text-texto-primario outline-none focus:border-primaria"
        />
      </div>

      <Button type="submit" disabled={enviando}>
        {enviando ? "Salvando…" : `Registrar ${CONFIG_TIPO[tipo].rotulo.toLowerCase()}`}
      </Button>
    </form>
  );
}
