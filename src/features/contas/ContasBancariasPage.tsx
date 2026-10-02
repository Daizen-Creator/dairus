import { useEffect, useState } from "react";
import { Landmark, Plus } from "lucide-react";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { contabilidade } from "../../services/contabilidade";
import { formatarCentavos } from "../../services/formato";
import { NovaContaForm } from "./NovaContaForm";
import type { Conta } from "../../types/accounting";

const SUBTIPOS_CONTA = ["BANCO", "CARTEIRA_DIGITAL", "DINHEIRO", "INVESTIMENTO", "BENEFICIO"];

export function ContasBancariasPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  async function carregar() {
    setCarregando(true);
    setContas(await contabilidade.listarContas());
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  if (carregando) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-borda bg-cartao p-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-3 h-6 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const ativos = contas.filter((c) => c.tipo === "ATIVO" && SUBTIPOS_CONTA.includes(c.subtipo ?? ""));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-texto-primario">
          <Landmark size={22} className="text-primaria" /> Contas Bancárias
        </h1>
        {!mostrarFormulario && (
          <Button onClick={() => setMostrarFormulario(true)}>
            <Plus size={16} /> Nova conta
          </Button>
        )}
      </div>

      {mostrarFormulario && (
        <NovaContaForm
          categoriaFixa="conta"
          onCriada={() => {
            setMostrarFormulario(false);
            carregar();
          }}
          onCancelar={() => setMostrarFormulario(false)}
        />
      )}

      {ativos.length === 0 ? (
        <EmptyState
          titulo="Nenhuma conta cadastrada"
          descricao="Cadastre sua conta bancária, carteira digital ou dinheiro em espécie para começar a lançar movimentações."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ativos.map((conta) => (
            <li key={conta.id} className="rounded-xl border border-borda bg-cartao p-4">
              <div className="flex items-center gap-2">
                <IconeCoisa nome={`${conta.nome} ${conta.instituicao ?? ""}`} tamanho={36} padrao={{ icone: Landmark, cor: "#1677ff" }} />
                <div>
                  <p className="text-sm font-medium text-texto-primario">{conta.nome}</p>
                  <p className="text-xs text-texto-secundario">{conta.instituicao ?? "—"}</p>
                </div>
              </div>
              <p className="mt-3 text-lg font-semibold tabular-nums text-texto-primario">
                {formatarCentavos(conta.saldo_atual_centavos)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
