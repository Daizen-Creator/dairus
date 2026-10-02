import { useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Clock, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { Select } from "../../components/ui/Select";
import { Skeleton, SkeletonLinhas } from "../../components/ui/Skeleton";
import { StatCard } from "../../components/ui/StatCard";
import { contabilidade } from "../../services/contabilidade";
import {
  dataAtualISO,
  formatarCentavos,
  formatarDataISOParaBR,
  primeiroDiaDoMesISO,
  ultimoDiaDoMesISO,
} from "../../services/formato";
import { categoriaDoLancamento } from "../dashboard/categoriaIcone";
import type { Agendamento, Conta, Lancamento, ResumoDashboard } from "../../types/accounting";
import { AgendamentoForm } from "./AgendamentoForm";
import { DespesaForm } from "./DespesaForm";
import { SeloEtiqueta, SeloStatus, type StatusPagamento } from "./Selos";
import { TransferenciaForm } from "./TransferenciaForm";

type Aba = "despesa" | "agendar" | "transferencia";

const ORIGENS_LEGIVEIS: Record<string, string> = {
  MANUAL: "Manual",
  SALARIO: "Recebimento",
  CARTAO: "Cartão",
  FATURA: "Fatura",
  TRANSFERENCIA: "Transferência",
  SALDO_INICIAL: "Saldo inicial",
  ESTORNO: "Estorno",
};

const VERMELHO_VIVO = "#ff2d55";

function diasEntre(deISO: string, ateISO: string): number {
  const [a1, m1, d1] = deISO.split("-").map(Number);
  const [a2, m2, d2] = ateISO.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

function textoPrazo(vencimento: string, hoje: string): string {
  const dias = diasEntre(hoje, vencimento);
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  if (dias > 1) return `vence em ${dias} dias`;
  return dias === -1 ? "venceu ontem" : `venceu há ${-dias} dias`;
}

export function LancamentosPage() {
  const [aba, setAba] = useState<Aba>("despesa");
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [resumo, setResumo] = useState<ResumoDashboard | null>(null);
  const [contaPagamentoId, setContaPagamentoId] = useState("");
  const [pagandoId, setPagandoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    const hoje = dataAtualISO();
    const [contasResp, lancamentosResp, agendamentosResp, resumoResp] = await Promise.all([
      contabilidade.listarContas(),
      contabilidade.listarLancamentos(300),
      contabilidade.listarAgendamentos(),
      contabilidade.obterResumoDashboard(primeiroDiaDoMesISO(hoje), ultimoDiaDoMesISO(hoje)),
    ]);
    setContas(contasResp);
    setLancamentos(lancamentosResp);
    setAgendamentos(agendamentosResp);
    setResumo(resumoResp);
    setCarregando(false);
  }

  useEffect(() => {
    carregar().catch((e) => {
      toast.error(String(e));
      setCarregando(false);
    });
  }, []);

  async function estornar(id: string) {
    try {
      await contabilidade.estornarLancamento(id);
      toast.success("Lançamento estornado.");
      carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  const contasPagaveis = contas.filter(
    (c) => (c.tipo === "ATIVO" || c.tipo === "PASSIVO") && c.subtipo !== "CATEGORIA",
  );
  const categoriasDespesa = contas.filter((c) => c.tipo === "DESPESA" && c.subtipo !== "CATEGORIA");
  const contasAtivas = contas.filter((c) => c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA");
  const contaPagamentoEfetiva = contaPagamentoId || contasPagaveis[0]?.id || "";

  const hoje = dataAtualISO();
  const abertos = agendamentos.filter((a) => !a.pago_em);
  const atrasados = abertos.filter((a) => a.vencimento < hoje);
  const totalAberto = abertos.reduce((s, a) => s + a.valor_centavos, 0);
  const totalAtrasado = atrasados.reduce((s, a) => s + a.valor_centavos, 0);
  const pagosRecentes = agendamentos.filter((a) => a.pago_em).length;

  // Lançamentos que já foram revertidos por um estorno (para não oferecer estornar de novo).
  const idsEstornados = useMemo(
    () => new Set(lancamentos.map((l) => l.estornado_de).filter((id): id is string => !!id)),
    [lancamentos],
  );

  async function pagar(agendamento: Agendamento) {
    if (!contaPagamentoEfetiva) {
      toast.error("Escolha de qual conta sai o pagamento.");
      return;
    }
    try {
      setPagandoId(agendamento.id);
      await contabilidade.pagarAgendamento(agendamento.id, contaPagamentoEfetiva, dataAtualISO());
      toast.success(`"${agendamento.descricao}" marcada como paga.`);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setPagandoId(null);
    }
  }

  async function excluirAgendamento(agendamento: Agendamento) {
    try {
      await contabilidade.excluirAgendamento(agendamento.id);
      toast.success("Conta agendada removida.");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  if (carregando) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <div className="rounded-xl border border-borda bg-cartao">
          <SkeletonLinhas quantidade={6} />
        </div>
      </div>
    );
  }

  const semContasCadastradas = contasAtivas.length === 0;
  const abas: Array<{ id: Aba; rotulo: string }> = [
    { id: "despesa", rotulo: "Nova despesa" },
    { id: "agendar", rotulo: "Agendar conta" },
    { id: "transferencia", rotulo: "Transferência entre contas" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-texto-primario">Despesas e Receitas</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          titulo="Receitas do mês"
          valor={formatarCentavos(resumo?.receitas_mes_centavos ?? 0)}
          corValor="sucesso"
          icone={ArrowDownLeft}
          corIcone="sucesso"
          subtitulo="Entradas já recebidas"
        />
        <StatCard
          titulo="Despesas do mês"
          valor={formatarCentavos(resumo?.despesas_mes_centavos ?? 0)}
          corValor="erro"
          icone={ArrowUpRight}
          corIcone="erro"
          subtitulo="Saídas já pagas"
        />
        <StatCard
          titulo="A pagar"
          valor={formatarCentavos(totalAberto)}
          icone={Clock}
          corIcone="alerta"
          subtitulo={abertos.length === 0 ? "Nenhuma conta agendada" : `${abertos.length} conta(s) em aberto`}
        />
        <StatCard
          titulo="Em atraso"
          valor={formatarCentavos(totalAtrasado)}
          corValor={atrasados.length > 0 ? "erro" : "normal"}
          icone={TriangleAlert}
          corIcone="erro"
          subtitulo={atrasados.length === 0 ? "Tudo em dia" : `${atrasados.length} conta(s) vencida(s)`}
        />
      </div>

      {semContasCadastradas ? (
        <EmptyState
          titulo="Cadastre uma conta antes de lançar"
          descricao="Vá em Contas e cadastre sua conta bancária, carteira ou dinheiro em espécie primeiro."
        />
      ) : (
        <div className="rounded-xl border border-borda bg-cartao p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {abas.map((a) => (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  aba === a.id
                    ? "bg-gradient-to-r from-primaria to-destaque text-primaria-texto shadow-[0_4px_16px_-6px_var(--cor-primaria)]"
                    : "text-texto-secundario hover:bg-borda/40"
                }`}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
          {aba === "despesa" && (
            <DespesaForm contasOrigem={contasPagaveis} categoriasDespesa={categoriasDespesa} onRegistrada={carregar} />
          )}
          {aba === "agendar" && <AgendamentoForm categoriasDespesa={categoriasDespesa} onCriado={carregar} />}
          {aba === "transferencia" && <TransferenciaForm contas={contasAtivas} onRegistrada={carregar} />}
        </div>
      )}

      <section className="rounded-xl border border-borda bg-cartao">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-texto-primario">
            <CalendarClock size={16} className="text-alerta" />
            Contas a pagar ({abertos.length})
          </h2>
          {abertos.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-texto-secundario">
              Pagar com
              <Select
                aria-label="Conta usada no pagamento"
                value={contaPagamentoEfetiva}
                onValueChange={setContaPagamentoId}
                options={contasPagaveis.map((c) => ({ value: c.id, label: c.nome }))}
                className="min-w-44"
              />
            </label>
          )}
        </div>
        {abertos.length === 0 ? (
          <div className="p-4">
            <EmptyState
              titulo="Nenhuma conta a pagar"
              descricao={
                pagosRecentes > 0
                  ? "Tudo pago! Agende a próxima mensalidade ou assinatura na aba “Agendar conta”."
                  : "Agende mensalidades, assinaturas e contas fixas na aba “Agendar conta” para acompanhar vencimentos."
              }
            />
          </div>
        ) : (
          <ul className="space-y-2.5 p-3">
            {abertos.map((a) => {
              const atrasado = a.vencimento < hoje;
              const status: StatusPagamento = atrasado ? "ATRASADO" : "PENDENTE";
              const cor = atrasado ? VERMELHO_VIVO : "var(--cor-alerta)";
              return (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-3"
                  style={{
                    borderColor: `color-mix(in srgb, ${cor} 40%, transparent)`,
                    backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${cor} 12%, transparent), transparent 60%)`,
                    boxShadow: `0 8px 22px -16px ${cor}`,
                  }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <IconeCoisa nome={a.descricao} tamanho={38} redondo />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-texto-primario">
                        <span className="truncate">{a.descricao}</span>
                        <SeloEtiqueta etiqueta={a.etiqueta} />
                        <SeloStatus status={status} />
                      </p>
                      <p className="mt-0.5 text-xs text-texto-secundario">
                        {formatarDataISOParaBR(a.vencimento)} · {textoPrazo(a.vencimento, hoje)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-base font-bold tabular-nums text-texto-primario">
                      {formatarCentavos(a.valor_centavos)}
                    </span>
                    <Button tamanho="pequeno" disabled={pagandoId === a.id} onClick={() => pagar(a)}>
                      {pagandoId === a.id ? "Pagando…" : "Marcar como pago"}
                    </Button>
                    <button
                      onClick={() => excluirAgendamento(a)}
                      aria-label={`Remover ${a.descricao}`}
                      title="Remover conta agendada"
                      className="rounded-md p-1.5 text-texto-secundario transition-colors hover:bg-erro/15 hover:text-erro"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-borda bg-cartao">
        <h2 className="border-b border-borda px-4 py-3 text-sm font-semibold text-texto-primario">
          Histórico ({lancamentos.length})
        </h2>
        {lancamentos.length === 0 ? (
          <div className="p-4">
            <EmptyState titulo="Nenhum lançamento ainda" descricao="Seus lançamentos aparecerão aqui." />
          </div>
        ) : (
          <Virtuoso
            style={{ height: 520 }}
            data={lancamentos}
            itemContent={(_, l) => {
              const valorTotal = l.partidas
                .filter((p) => p.tipo === "DEBITO")
                .reduce((soma, p) => soma + p.valor_centavos, 0);
              const ehEstorno = l.origem === "ESTORNO";
              const jaEstornado = idsEstornados.has(l.id);
              const categoria = categoriaDoLancamento(l, contas);
              const ehReceita = categoria.tipo === "RECEITA";
              const ehDespesa = categoria.tipo === "DESPESA";

              // Estorno inverte o sentido do original: devolve dinheiro de uma despesa
              // (entrada) ou retira o de uma receita (saída).
              const entrada = ehEstorno ? ehDespesa : ehReceita;
              const saida = ehEstorno ? ehReceita : ehDespesa;
              const cor = entrada ? "var(--cor-sucesso)" : saida ? VERMELHO_VIVO : "var(--cor-primaria)";
              const corValor = entrada ? "text-sucesso" : saida ? "text-erro" : "text-texto-primario";
              const sinal = entrada ? "+ " : saida ? "− " : "";

              const status: StatusPagamento | null = ehEstorno
                ? "ESTORNO"
                : jaEstornado
                  ? "ESTORNADO"
                  : ehReceita
                    ? "RECEBIDO"
                    : ehDespesa
                      ? "PAGO"
                      : null;

              return (
                <div className="px-3 py-1.5">
                  <div
                    className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3"
                    style={{
                      borderColor: `color-mix(in srgb, ${cor} 28%, transparent)`,
                      backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${cor} 9%, transparent), transparent 55%)`,
                      boxShadow: `0 6px 18px -14px ${cor}`,
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <IconeCoisa
                        nome={l.descricao}
                        tamanho={38}
                        redondo
                        padrao={{ icone: categoria.icone, cor: categoria.cor }}
                      />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-texto-primario">
                          <span className="truncate">{l.descricao}</span>
                          <SeloEtiqueta etiqueta={l.etiqueta} />
                          {status && <SeloStatus status={status} />}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-texto-secundario">
                          {formatarDataISOParaBR(l.data)} · {ORIGENS_LEGIVEIS[l.origem] ?? l.origem}
                          {categoria.tipo && ` · ${categoria.nome}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className={`text-base font-bold tabular-nums ${corValor}`}>
                        {sinal}
                        {formatarCentavos(valorTotal)}
                      </span>
                      {!ehEstorno && !jaEstornado && (
                        <button
                          onClick={() => estornar(l.id)}
                          className="text-xs text-texto-secundario transition-colors hover:text-erro hover:underline"
                          title="Estornar este lançamento"
                        >
                          Estornar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            }}
          />
        )}
      </section>
    </div>
  );
}
