import { useEffect, useState } from "react";
import { CreditCard, Plus } from "lucide-react";
import { toast } from "sonner";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { Button } from "../../components/ui/Button";
import { BarraProgresso, CLASSE_INPUT } from "../../components/ui/Campos";
import { EmptyState } from "../../components/ui/EmptyState";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { contabilidade } from "../../services/contabilidade";
import { centavosParaValorInput, dataAtualISO, formatarCentavos, valorInputParaCentavos } from "../../services/formato";
import { NovaContaForm } from "./NovaContaForm";
import type { Conta } from "../../types/accounting";

export function CartoesPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [pagando, setPagando] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [origemId, setOrigemId] = useState("");

  async function carregar() {
    setContas(await contabilidade.listarContas());
    setCarregando(false);
  }

  useEffect(() => {
    carregar().catch((e) => {
      toast.error(String(e));
      setCarregando(false);
    });
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
  const origens = contas.filter((c) => c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA" && c.ativa);

  function iniciarPagamento(cartao: Conta) {
    setPagando(cartao.id);
    setValor(centavosParaValorInput(Math.max(0, cartao.saldo_atual_centavos)));
    setOrigemId(origens[0]?.id ?? "");
  }

  async function pagarFatura(cartao: Conta) {
    const centavos = valorInputParaCentavos(valor);
    if (centavos <= 0 || !origemId) {
      toast.error("Informe o valor e a conta de onde sai o pagamento.");
      return;
    }
    if (centavos > cartao.saldo_atual_centavos) {
      toast.error("O pagamento é maior que a fatura em aberto.");
      return;
    }
    try {
      // Pagar a fatura move dinheiro da conta para quitar a dívida do cartão: não é uma nova despesa
      // (a despesa já foi contabilizada na compra), por isso débito no passivo e crédito no ativo.
      await contabilidade.criarLancamento({
        data: dataAtualISO(),
        descricao: `Pagamento da fatura ${cartao.nome}`,
        origem: "FATURA",
        partidas: [
          { conta_id: cartao.id, tipo: "DEBITO", valor_centavos: centavos },
          { conta_id: origemId, tipo: "CREDITO", valor_centavos: centavos },
        ],
      });
      toast.success("Fatura paga.");
      setPagando(null);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

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
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cartoes.map((cartao) => {
            const limite = cartao.limite_centavos ?? 0;
            const disponivel = limite - cartao.saldo_atual_centavos;
            const uso = limite > 0 ? (cartao.saldo_atual_centavos / limite) * 100 : 0;
            const cor = uso >= 90 ? "#ff2d55" : uso >= 70 ? "var(--cor-alerta)" : "var(--cor-primaria)";
            return (
              <li
                key={cartao.id}
                className="rounded-xl border bg-cartao p-4"
                style={{
                  borderColor: "color-mix(in srgb, #f43f5e 40%, transparent)",
                  backgroundImage: "linear-gradient(135deg, color-mix(in srgb, #f43f5e 14%, transparent), transparent 60%)",
                  boxShadow: "0 8px 24px -16px #f43f5e",
                }}
              >
                <div className="flex items-center gap-3">
                  <IconeCoisa nome={cartao.nome} tamanho={40} redondo padrao={{ icone: CreditCard, cor: "#f43f5e" }} />
                  <div>
                    <p className="text-sm font-semibold text-texto-primario">{cartao.nome}</p>
                    <p className="text-xs text-texto-secundario">
                      Fecha dia {cartao.dia_fechamento_fatura} · Vence dia {cartao.dia_vencimento_fatura}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-texto-secundario">Fatura em aberto</p>
                <p className="text-xl font-bold tabular-nums text-erro">{formatarCentavos(cartao.saldo_atual_centavos)}</p>
                {limite > 0 && (
                  <div className="mt-2">
                    <BarraProgresso percentual={uso} cor={cor} altura={6} />
                  </div>
                )}
                <p className="mt-1.5 text-xs text-texto-secundario">
                  Disponível: {formatarCentavos(disponivel)} de {formatarCentavos(limite)}
                </p>

                {pagando === cartao.id ? (
                  <div className="mt-3 space-y-2">
                    <input
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                      inputMode="decimal"
                      aria-label="Valor a pagar"
                      className={`${CLASSE_INPUT} w-full`}
                    />
                    <Select
                      aria-label="Pagar com a conta"
                      value={origemId}
                      onValueChange={setOrigemId}
                      options={origens.map((c) => ({ value: c.id, label: c.nome }))}
                      className="w-full"
                    />
                    <div className="flex gap-2">
                      <Button tamanho="pequeno" onClick={() => pagarFatura(cartao)}>
                        Confirmar pagamento
                      </Button>
                      <Button tamanho="pequeno" variante="fantasma" onClick={() => setPagando(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    tamanho="pequeno"
                    variante="secundaria"
                    className="mt-3"
                    disabled={cartao.saldo_atual_centavos <= 0}
                    onClick={() => iniciarPagamento(cartao)}
                  >
                    Pagar fatura
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-texto-secundario">
        Compras no cartão entram em “Despesas e Receitas”: escolha o cartão como conta de origem da despesa.
      </p>
    </div>
  );
}
