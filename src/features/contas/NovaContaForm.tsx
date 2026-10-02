import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { contabilidade } from "../../services/contabilidade";
import { valorInputParaCentavos } from "../../services/formato";
import type { NovaContaInput } from "../../types/accounting";

type CategoriaFormulario = "conta" | "cartao";

interface NovaContaFormProps {
  onCriada: () => void;
  onCancelar: () => void;
  categoriaFixa?: CategoriaFormulario;
}

export function NovaContaForm({ onCriada, onCancelar, categoriaFixa }: NovaContaFormProps) {
  const [categoria, setCategoria] = useState<CategoriaFormulario>(categoriaFixa ?? "conta");
  const [nome, setNome] = useState("");
  const [instituicao, setInstituicao] = useState("");
  const [saldoInicial, setSaldoInicial] = useState("0,00");
  const [limite, setLimite] = useState("0,00");
  const [diaFechamento, setDiaFechamento] = useState("1");
  const [diaVencimento, setDiaVencimento] = useState("10");
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!nome.trim()) {
      toast.error("Informe um nome para a conta.");
      return;
    }

    const sufixo = crypto.randomUUID().slice(0, 8);
    const input: NovaContaInput =
      categoria === "conta"
        ? {
            codigo: `1.2-${sufixo}`,
            nome: nome.trim(),
            tipo: "ATIVO",
            subtipo: "BANCO",
            categoria_pai_id: "ativo-contas-bancarias",
            instituicao: instituicao.trim() || null,
            saldo_inicial_centavos: valorInputParaCentavos(saldoInicial),
          }
        : {
            codigo: `2.1-${sufixo}`,
            nome: nome.trim(),
            tipo: "PASSIVO",
            subtipo: "CARTAO_CREDITO",
            categoria_pai_id: "passivo-cartoes",
            instituicao: instituicao.trim() || null,
            limite_centavos: valorInputParaCentavos(limite),
            dia_fechamento_fatura: Number(diaFechamento),
            dia_vencimento_fatura: Number(diaVencimento),
          };

    try {
      setEnviando(true);
      await contabilidade.criarConta(input);
      toast.success(`"${nome}" criada.`);
      onCriada();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4 rounded-xl border border-borda bg-cartao p-4">
      {!categoriaFixa && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCategoria("conta")}
            className={`rounded-lg px-3 py-1.5 text-sm ${categoria === "conta" ? "bg-primaria text-primaria-texto" : "bg-superficie text-texto-secundario"}`}
          >
            Conta / Carteira
          </button>
          <button
            type="button"
            onClick={() => setCategoria("cartao")}
            className={`rounded-lg px-3 py-1.5 text-sm ${categoria === "cartao" ? "bg-primaria text-primaria-texto" : "bg-superficie text-texto-secundario"}`}
          >
            Cartão de Crédito
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-texto-secundario">Nome</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder={categoria === "conta" ? "Ex.: Nubank, Carteira" : "Ex.: Nubank Mastercard"}
            className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-texto-primario outline-none focus:border-primaria"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-texto-secundario">Instituição (opcional)</span>
          <input
            value={instituicao}
            onChange={(e) => setInstituicao(e.target.value)}
            className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-texto-primario outline-none focus:border-primaria"
          />
        </label>

        {categoria === "conta" ? (
          <label className="text-sm">
            <span className="mb-1 block text-texto-secundario">Saldo inicial (R$)</span>
            <input
              value={saldoInicial}
              onChange={(e) => setSaldoInicial(e.target.value)}
              inputMode="decimal"
              className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-texto-primario outline-none focus:border-primaria"
            />
          </label>
        ) : (
          <>
            <label className="text-sm">
              <span className="mb-1 block text-texto-secundario">Limite (R$)</span>
              <input
                value={limite}
                onChange={(e) => setLimite(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-texto-primario outline-none focus:border-primaria"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-texto-secundario">Dia fechamento</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={diaFechamento}
                  onChange={(e) => setDiaFechamento(e.target.value)}
                  className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-texto-primario outline-none focus:border-primaria"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-texto-secundario">Dia vencimento</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={diaVencimento}
                  onChange={(e) => setDiaVencimento(e.target.value)}
                  className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-texto-primario outline-none focus:border-primaria"
                />
              </label>
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variante="secundaria" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={enviando}>
          {enviando ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
