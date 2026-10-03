import { useState } from "react";
import { CalendarClock, CalendarPlus, Pencil, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT } from "../../components/ui/Campos";
import { EmptyState } from "../../components/ui/EmptyState";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { extras } from "../../services/extras";
import {
  centavosParaValorInput,
  dataAtualISO,
  formatarCentavos,
  formatarDataISOParaBR,
  valorInputParaCentavos,
} from "../../services/formato";
import type { Agendamento, Conta } from "../../types/accounting";
import { SeloEtiqueta, SeloStatus, type StatusPagamento } from "./Selos";
import { OPCOES_ETIQUETA } from "./opcoesEtiqueta";
import { OPCOES_RECORRENCIA, ROTULO_RECORRENCIA } from "./opcoesRecorrencia";

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

function somarDias(dataISO: string, dias: number): string {
  const [a, m, d] = dataISO.split("-").map(Number);
  const dt = new Date(a, m - 1, d + dias);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

interface ContasAPagarProps {
  agendamentos: Agendamento[];
  contasPagaveis: Conta[];
  onAlterado: () => void;
}

export function ContasAPagar({ agendamentos, contasPagaveis, onAlterado }: ContasAPagarProps) {
  const hoje = dataAtualISO();
  const [contaPagamentoId, setContaPagamentoId] = useState("");
  const [dataPagamento, setDataPagamento] = useState(hoje);
  const [pagandoId, setPagandoId] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [mostrarPagas, setMostrarPagas] = useState(false);
  const [ed, setEd] = useState({ descricao: "", valor: "", vencimento: "", etiqueta: "NENHUMA", recorrencia: "NENHUMA", automatico: false });

  const contaEfetiva = contaPagamentoId || contasPagaveis[0]?.id || "";
  const abertos = agendamentos.filter((a) => !a.pago_em);
  const pagos = agendamentos.filter((a) => a.pago_em).sort((a, b) => (b.pago_em ?? "").localeCompare(a.pago_em ?? ""));
  const totalAberto = abertos.filter((a) => a.tipo !== "RECEBER").reduce((s, a) => s + a.valor_centavos, 0);
  const totalReceber = abertos.filter((a) => a.tipo === "RECEBER").reduce((s, a) => s + a.valor_centavos, 0);
  const contasDestino = contasPagaveis.filter((c) => c.tipo === "ATIVO");
  /** Receita não entra em cartão: usa a conta escolhida se for de ativo, senão a primeira conta. */
  const contaPara = (a: Agendamento) => (a.tipo === "RECEBER" ? (contasDestino.some((c) => c.id === contaEfetiva) ? contaEfetiva : contasDestino[0]?.id ?? "") : contaEfetiva);
  const extrasDe = (a: Agendamento) => ({ automatico: a.automatico, contaId: a.conta_id, reajusteAnual: a.reajuste_anual, mesReajuste: a.mes_reajuste });

  async function pagar(a: Agendamento) {
    const conta = contaPara(a);
    if (!conta) return toast.error("Escolha a conta.");
    try {
      setPagandoId(a.id);
      await contabilidade.pagarAgendamento(a.id, conta, dataPagamento);
      const feito = a.tipo === "RECEBER" ? "recebida" : "paga";
      toast.success(a.recorrencia ? `"${a.descricao}" ${feito} — a próxima já foi agendada.` : `"${a.descricao}" marcada como ${feito}.`);
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setPagandoId(null);
    }
  }

  async function adiar(a: Agendamento, dias: number) {
    try {
      await extras.atualizarAgendamento(a.id, a.descricao, a.valor_centavos, somarDias(a.vencimento, dias), a.etiqueta, a.recorrencia, extrasDe(a));
      toast.success(`Vencimento adiado em ${dias} dias.`);
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function excluir(a: Agendamento) {
    try {
      await contabilidade.excluirAgendamento(a.id);
      toast.success("Conta agendada removida.");
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  function iniciarEdicao(a: Agendamento) {
    setEditandoId(a.id);
    setEd({
      descricao: a.descricao,
      valor: centavosParaValorInput(a.valor_centavos),
      vencimento: a.vencimento,
      etiqueta: a.etiqueta ?? "NENHUMA",
      recorrencia: a.recorrencia ?? "NENHUMA",
      automatico: a.automatico,
    });
  }

  async function salvarEdicao(a: Agendamento) {
    try {
      await extras.atualizarAgendamento(
        a.id,
        ed.descricao,
        valorInputParaCentavos(ed.valor),
        ed.vencimento,
        ed.etiqueta === "NENHUMA" ? null : ed.etiqueta,
        ed.recorrencia === "NENHUMA" ? null : ed.recorrencia,
        { ...extrasDe(a), automatico: ed.automatico, contaId: a.conta_id ?? (ed.automatico ? contaPara(a) || null : null) },
      );
      toast.success("Conta atualizada.");
      setEditandoId(null);
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <section className="rounded-xl border border-borda bg-cartao">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-texto-primario">
          <CalendarClock size={16} className="text-alerta" />
          Agenda ({abertos.length})
          {totalAberto > 0 && <span className="font-normal text-texto-secundario">· a pagar {formatarCentavos(totalAberto)}</span>}
          {totalReceber > 0 && <span className="font-normal text-sucesso">· a receber {formatarCentavos(totalReceber)}</span>}
        </h2>
        {abertos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-texto-secundario">
            <label className="flex items-center gap-2">
              Conta
              <Select
                aria-label="Conta usada no pagamento"
                value={contaEfetiva}
                onValueChange={setContaPagamentoId}
                options={contasPagaveis.map((c) => ({ value: c.id, label: c.nome }))}
                className="min-w-40"
              />
            </label>
            <label className="flex items-center gap-2">
              em
              <input type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} aria-label="Data do pagamento" className={`${CLASSE_INPUT} py-1.5`} />
            </label>
          </div>
        )}
      </div>

      {abertos.length === 0 ? (
        <div className="p-4">
          <EmptyState
            titulo="Nada agendado"
            descricao={
              pagos.length > 0
                ? "Tudo pago! Agende a próxima mensalidade ou assinatura na aba “Agendar conta”."
                : "Agende mensalidades, assinaturas e contas fixas na aba “Agendar conta” para acompanhar vencimentos."
            }
          />
        </div>
      ) : (
        <ul className="space-y-2.5 p-3">
          {abertos.map((a) => {
            const dias = diasEntre(hoje, a.vencimento);
            const atrasado = dias < 0;
            const emBreve = !atrasado && dias <= 3;
            const status: StatusPagamento = atrasado ? "ATRASADO" : "PENDENTE";
            const receber = a.tipo === "RECEBER";
            const cor = receber ? "var(--cor-sucesso)" : atrasado ? VERMELHO_VIVO : "var(--cor-alerta)";
            const emEdicao = editandoId === a.id;
            return (
              <li
                key={a.id}
                className="rounded-xl border px-3.5 py-3"
                style={{
                  borderColor: `color-mix(in srgb, ${cor} ${emBreve || atrasado ? 55 : 35}%, transparent)`,
                  backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${cor} 12%, transparent), transparent 60%)`,
                  boxShadow: `0 8px 22px -16px ${cor}`,
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <IconeCoisa nome={a.descricao} tamanho={38} redondo />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-texto-primario">
                        <span className="truncate">{a.descricao}</span>
                        <SeloEtiqueta etiqueta={a.etiqueta} />
                        {receber ? <span className="rounded-full border border-sucesso/60 px-1.5 text-[10px] text-sucesso">a receber</span> : <SeloStatus status={status} />}
                        {a.automatico && <span className="rounded-full border border-primaria/60 px-1.5 text-[10px] text-primaria">automático</span>}
                        {a.reajuste_anual ? <span className="text-[10px] text-texto-secundario">reajuste {(a.reajuste_anual * 100).toFixed(1).replace(".", ",")}%</span> : null}
                        {a.recorrencia && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-normal text-texto-secundario">
                            <Repeat size={11} /> {ROTULO_RECORRENCIA[a.recorrencia]}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-texto-secundario">
                        {formatarDataISOParaBR(a.vencimento)} · {receber ? textoPrazo(a.vencimento, hoje).replace("vence", "entra").replace("venceu", "era para entrar") : textoPrazo(a.vencimento, hoje)}
                        {a.pessoa && ` · ${receber ? "de" : "para"} ${a.pessoa}`}
                        {emBreve && <span className="ml-1 font-medium text-alerta">· atenção</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span className={`mr-1 text-base font-bold tabular-nums ${receber ? "text-sucesso" : "text-texto-primario"}`}>{receber ? "+ " : ""}{formatarCentavos(a.valor_centavos)}</span>
                    <Button tamanho="pequeno" disabled={pagandoId === a.id} onClick={() => pagar(a)}>
                      {pagandoId === a.id ? "Salvando…" : receber ? "Confirmar recebimento" : "Marcar como pago"}
                    </Button>
                    <button onClick={() => adiar(a, 7)} title="Adiar vencimento em 7 dias" aria-label="Adiar 7 dias" className="rounded-md p-1.5 text-texto-secundario transition-colors hover:bg-borda/50 hover:text-primaria">
                      <CalendarPlus size={15} />
                    </button>
                    <button onClick={() => (emEdicao ? setEditandoId(null) : iniciarEdicao(a))} title="Editar" aria-label={`Editar ${a.descricao}`} className="rounded-md p-1.5 text-texto-secundario transition-colors hover:bg-borda/50 hover:text-primaria">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => excluir(a)} aria-label={`Remover ${a.descricao}`} title="Remover conta agendada" className="rounded-md p-1.5 text-texto-secundario transition-colors hover:bg-erro/15 hover:text-erro">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {emEdicao && (
                  <div className="mt-3 grid grid-cols-1 gap-2 border-t border-borda pt-3 sm:grid-cols-2 lg:grid-cols-6">
                    <input value={ed.descricao} onChange={(e) => setEd({ ...ed, descricao: e.target.value })} aria-label="Descrição" className={`${CLASSE_INPUT} lg:col-span-2`} />
                    <input value={ed.valor} onChange={(e) => setEd({ ...ed, valor: e.target.value })} inputMode="decimal" aria-label="Valor" className={CLASSE_INPUT} />
                    <input type="date" value={ed.vencimento} onChange={(e) => setEd({ ...ed, vencimento: e.target.value })} aria-label="Vencimento" className={CLASSE_INPUT} />
                    <Select aria-label="Etiqueta" value={ed.etiqueta} onValueChange={(v) => setEd({ ...ed, etiqueta: v })} options={OPCOES_ETIQUETA} />
                    <Select aria-label="Repetição" value={ed.recorrencia} onValueChange={(v) => setEd({ ...ed, recorrencia: v })} options={OPCOES_RECORRENCIA} />
                    <label className="flex items-center gap-2 text-xs text-texto-primario sm:col-span-2 lg:col-span-6">
                      <input type="checkbox" checked={ed.automatico} onChange={() => setEd({ ...ed, automatico: !ed.automatico })} className="h-4 w-4 accent-[var(--cor-primaria)]" />
                      Lançar sozinho no dia{!a.conta_id && ed.automatico ? ` (na conta escolhida acima)` : ""}
                    </label>
                    <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
                      <Button tamanho="pequeno" onClick={() => salvarEdicao(a)}>Salvar</Button>
                      <Button tamanho="pequeno" variante="fantasma" onClick={() => setEditandoId(null)}>Cancelar</Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pagos.length > 0 && (
        <div className="border-t border-borda px-4 py-2.5">
          <button onClick={() => setMostrarPagas((v) => !v)} className="text-xs text-primaria hover:underline">
            {mostrarPagas ? "Ocultar contas pagas" : `Ver contas pagas (${pagos.length})`}
          </button>
          {mostrarPagas && (
            <ul className="mt-2 space-y-1 text-xs text-texto-secundario">
              {pagos.slice(0, 30).map((a) => (
                <li key={a.id} className="flex justify-between">
                  <span>
                    {a.descricao} · {a.tipo === "RECEBER" ? "recebido" : "pago"} em {formatarDataISOParaBR(a.pago_em!)}
                  </span>
                  <span className="tabular-nums">{formatarCentavos(a.valor_centavos)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
