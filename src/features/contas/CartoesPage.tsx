import { useEffect, useState } from "react";
import { CreditCard, Plus } from "lucide-react";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { contabilidade } from "../../services/contabilidade";
import { formatarCentavos } from "../../services/formato";
import { NovaContaForm } from "./NovaContaForm";
import type { Conta } from "../../types/accounting";

export function CartoesPage() {
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
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-borda bg-cartao p-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-3 h-6 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const cartoes = contas.filter((c) => c.tipo === "PASSIVO" && c.subtipo === "CARTAO_CREDITO");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-texto-primario">
          <CreditCard size={22} className="text-primaria" /> Cartões de Crédito
        </h1>
        {!mostrarFormulario && (
          <Button onClick={() => setMostrarFormulario(true)}>
            <Plus size={16} /> Novo cartão
          </Button>
        )}
      </div>

      {mostrarFormulario && (
        <NovaContaForm
          categoriaFixa="cartao"
          onCriada={() => {
            setMostrarFormulario(false);
            carregar();
          }}
          onCancelar={() => setMostrarFormulario(false)}
        />
      )}

      {cartoes.length === 0 ? (
        <EmptyState
          titulo="Nenhum cartão cadastrado"
          descricao="Cadastre um cartão de crédito para acompanhar limite, fechamento e vencimento da fatura."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cartoes.map((cartao) => {
            const disponivel = (cartao.limite_centavos ?? 0) - cartao.saldo_atual_centavos;
            return (
              <li key={cartao.id} className="rounded-xl border border-borda bg-cartao p-4">
                <div className="flex items-center gap-2">
                  <IconeCoisa nome={cartao.nome} tamanho={36} padrao={{ icone: CreditCard, cor: "#f43f5e" }} />
                  <div>
                    <p className="text-sm font-medium text-texto-primario">{cartao.nome}</p>
                    <p className="text-xs text-texto-secundario">
                      Fecha dia {cartao.dia_fechamento_fatura} · Vence dia {cartao.dia_vencimento_fatura}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-lg font-semibold tabular-nums text-erro">
                  {formatarCentavos(cartao.saldo_atual_centavos)}
                </p>
                <p className="text-xs text-texto-secundario">
                  Disponível: {formatarCentavos(disponivel)} de {formatarCentavos(cartao.limite_centavos ?? 0)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
