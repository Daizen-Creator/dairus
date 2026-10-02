import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { centavosParaValorInput, dataAtualISO, valorInputParaCentavos } from "../../services/formato";
import { CONTAS_SISTEMA } from "../../types/accounting";
import type { Conta } from "../../types/accounting";

interface RecebimentoFormProps {
  contasDestino: Conta[];
  onRegistrado: () => void;
  /** Valores sugeridos vindos do perfil de renda (0 = sem sugestão). */
  salarioLiquidoCentavos: number;
  vaMensalCentavos: number;
}

type TipoRecebimento = "SALARIO" | "VA" | "RENDA_EXTRA";

const CONFIG_TIPO: Record<TipoRecebimento, { rotulo: string; contaReceitaId: string; descricaoPadrao: string }> = {
  SALARIO: { rotulo: "Salário", contaReceitaId: CONTAS_SISTEMA.receitaSalario, descricaoPadrao: "Salário" },
  VA: { rotulo: "Vale-Alimentação", contaReceitaId: CONTAS_SISTEMA.receitaBeneficios, descricaoPadrao: "Vale-Alimentação" },
  RENDA_EXTRA: { rotulo: "Renda Extra", contaReceitaId: CONTAS_SISTEMA.receitaRendaExtra, descricaoPadrao: "Renda extra" },
};

export function RecebimentoForm({ contasDestino, onRegistrado, salarioLiquidoCentavos, vaMensalCentavos }: RecebimentoFormProps) {
  const sugestao = (t: TipoRecebimento) => (t === "SALARIO" ? salarioLiquidoCentavos : t === "VA" ? vaMensalCentavos : 0);
  const [tipo, setTipo] = useState<TipoRecebimento>("SALARIO");
  const [contaDestinoId, setContaDestinoId] = useState(contasDestino[0]?.id ?? "");
  const [valor, setValor] = useState(sugestao("SALARIO") ? centavosParaValorInput(sugestao("SALARIO")) : "");
  const [descricao, setDescricao] = useState(CONFIG_TIPO.SALARIO.descricaoPadrao);
  const [data, setData] = useState(dataAtualISO());
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setValor(sugestao(tipo) ? centavosParaValorInput(sugestao(tipo)) : "");
    setDescricao(CONFIG_TIPO[tipo].descricaoPadrao);
    if (tipo === "VA") setContaDestinoId(CONTAS_SISTEMA.valeAlimentacao);
    else setContaDestinoId((atual) => (atual === CONTAS_SISTEMA.valeAlimentacao ? contasDestino[0]?.id ?? "" : atual));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, salarioLiquidoCentavos, vaMensalCentavos]);

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
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              tipo === t ? "bg-gradient-to-r from-primaria to-destaque text-primaria-texto" : "text-texto-secundario hover:bg-borda/40"
            }`}
          >
            {CONFIG_TIPO[t].rotulo}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição" className={CLASSE_INPUT} />
        <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="Valor (R$)" className={CLASSE_INPUT} />
        <Select
          aria-label="Conta de destino"
          value={contaDestinoId}
          onValueChange={setContaDestinoId}
          disabled={tipo === "VA"}
          options={tipo === "VA" ? [{ value: CONTAS_SISTEMA.valeAlimentacao, label: "Vale-Alimentação" }] : contasDestino.map((c) => ({ value: c.id, label: c.nome }))}
        />
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={CLASSE_INPUT} />
      </div>
      {tipo !== "RENDA_EXTRA" && !sugestao(tipo) && (
        <p className="text-xs text-texto-secundario">Dica: cadastre seu perfil de renda abaixo para o valor já vir preenchido.</p>
      )}

      <Button type="submit" disabled={enviando}>
        {enviando ? "Salvando…" : `Registrar ${CONFIG_TIPO[tipo].rotulo.toLowerCase()}`}
      </Button>
    </form>
  );
}
