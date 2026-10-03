import { useState } from "react";
import { Receipt, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT } from "../../components/ui/Campos";
import { cartoes, type Adicional, type Fatura } from "../../services/cartoes";
import { dataAtualISO, formatarCentavos, formatarDataISOParaBR, valorInputParaCentavos } from "../../services/formato";
import type { Conta, Lancamento } from "../../types/accounting";
import { alocarPagamentos, calcularEncargos, pagamentosDoCartao } from "./faturas";

const STATUS: Record<string, { rotulo: string; cor: string }> = {
  PAGA: { rotulo: "Paga", cor: "text-sucesso" },
  PARCIAL: { rotulo: "Paga em parte", cor: "text-alerta" },
  ATRASADA: { rotulo: "Atrasada", cor: "text-erro" },
  ABERTA: { rotulo: "A pagar", cor: "text-texto-primario" },
  ZERADA: { rotulo: "Sem compras", cor: "text-texto-secundario" },
};

interface Props {
  cartao: Conta;
  faturas: Fatura[];
  lancamentos: Lancamento[];
  adicionais: Adicional[];
  jurosMensal: number | null;
  /** Gasto da fatura atual por portador (id do adicional ou "" = titular). */
  gastoPorPortador: Map<string, number>;
  dinheiro: (v: number) => string;
  onAlterado: () => void;
}

/** Faturas fechadas (com pagamentos e encargos) e cartões adicionais de um cartão. */
export function DetalhesCartao({ cartao, faturas, lancamentos, adicionais, jurosMensal, gastoPorPortador, dinheiro, onAlterado }: Props) {
  const hoje = dataAtualISO();
  const [novo, setNovo] = useState({ nome: "", final: "", limite: "" });
  const [encargoAberto, setEncargoAberto] = useState<string | null>(null);
  const [valorEncargo, setValorEncargo] = useState("");
  const minhas = faturas.filter((f) => f.cartao_id === cartao.id).map((f) => ({ id: f.id, inicio: f.inicio, fechamento: f.fechamento, vencimento: f.vencimento, valor: f.valor_centavos, encargosLancados: !!f.encargos_lancamento_id }));
  const historico = alocarPagamentos(minhas, pagamentosDoCartao(cartao.id, lancamentos), hoje).slice(0, 12);
  const meus = adicionais.filter((a) => a.cartao_id === cartao.id);
  const juros = jurosMensal ?? 0.12;

  async function lancarEncargos(faturaId: string, detalhe: string) {
    try {
      await cartoes.lancarEncargos(faturaId, hoje, valorInputParaCentavos(valorEncargo), detalhe);
      toast.success("Encargos lançados: entram na próxima fatura.");
      setEncargoAberto(null);
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function adicionar(ev: React.FormEvent) {
    ev.preventDefault();
    try {
      await cartoes.criarAdicional(cartao.id, novo.nome, novo.final || null, novo.limite ? valorInputParaCentavos(novo.limite) : null);
      setNovo({ nome: "", final: "", limite: "" });
      toast.success("Cartão adicional cadastrado.");
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="mt-3 space-y-4 border-t border-borda pt-3 text-xs">
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-texto-primario"><Receipt size={13} /> Faturas fechadas</p>
        {historico.length === 0 ? (
          <p className="text-texto-secundario">Nenhuma fatura fechada ainda. No dia do fechamento o valor fica guardado aqui.</p>
        ) : (
          <ul className="space-y-1">
            {historico.map((f) => {
              const saldo = f.valor - f.pago;
              const enc = calcularEncargos(saldo > 0 ? saldo : f.status === "PAGA" && f.diasAtraso > 0 ? f.valor : 0, juros, f.diasAtraso);
              const podeEncargo = !!f.id && !f.encargosLancados && enc.total > 0;
              return (
                <li key={f.fechamento} className="rounded-md border border-borda/70 px-2 py-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-texto-secundario">
                      {formatarDataISOParaBR(f.inicio).slice(0, 5)}–{formatarDataISOParaBR(f.fechamento).slice(0, 5)} · vence {formatarDataISOParaBR(f.vencimento).slice(0, 5)}
                    </span>
                    <span className="tabular-nums">
                      <strong className="text-texto-primario">{dinheiro(f.valor)}</strong>
                      {f.pago > 0 && f.pago < f.valor && <span className="text-texto-secundario"> · pago {dinheiro(f.pago)}</span>}
                      <span className={`ml-2 ${STATUS[f.status].cor}`}>{STATUS[f.status].rotulo}{f.diasAtraso > 0 && f.status !== "ZERADA" ? ` (${f.diasAtraso}d de atraso)` : ""}</span>
                    </span>
                  </div>
                  {f.encargosLancados && <p className="mt-1 text-texto-secundario">Encargos já lançados.</p>}
                  {podeEncargo && (
                    encargoAberto === f.fechamento ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="text-texto-secundario">Estimativa: multa {formatarCentavos(enc.multa)} + juros {formatarCentavos(enc.juros)} ({(juros * 100).toFixed(1).replace(".", ",")}% a.m.) + IOF {formatarCentavos(enc.iof)}. Ajuste para o valor da sua fatura:</span>
                        <input value={valorEncargo} onChange={(e) => setValorEncargo(e.target.value)} inputMode="decimal" aria-label="Valor dos encargos" className={`${CLASSE_INPUT} w-24 py-1`} />
                        <Button tamanho="pequeno" onClick={() => lancarEncargos(f.id!, `Saldo ${formatarCentavos(enc.saldo)}, ${f.diasAtraso} dia(s) de atraso`)}>Lançar</Button>
                        <Button tamanho="pequeno" variante="fantasma" onClick={() => setEncargoAberto(null)}>Cancelar</Button>
                      </div>
                    ) : (
                      <button onClick={() => { setEncargoAberto(f.fechamento); setValorEncargo((enc.total / 100).toFixed(2).replace(".", ",")); }} className="mt-1 text-alerta hover:underline">
                        Juros, multa e IOF estimados: {formatarCentavos(enc.total)} — lançar
                      </button>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-texto-primario"><UserPlus size={13} /> Cartões adicionais (mesmo limite)</p>
        {meus.length > 0 && (
          <ul className="mb-2 space-y-1">
            <li className="flex justify-between text-texto-secundario"><span>Titular</span><span className="tabular-nums">{dinheiro(gastoPorPortador.get("") ?? 0)} nesta fatura</span></li>
            {meus.map((a) => {
              const gasto = gastoPorPortador.get(a.id) ?? 0;
              const acima = a.limite_centavos !== null && gasto > a.limite_centavos;
              return (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span>{a.nome}{a.final_cartao ? ` · final ${a.final_cartao}` : ""}{a.limite_centavos ? ` · limite próprio ${dinheiro(a.limite_centavos)}` : ""}</span>
                  <span className="flex items-center gap-2">
                    <span className={`tabular-nums ${acima ? "text-erro" : "text-texto-secundario"}`}>{dinheiro(gasto)} nesta fatura{acima ? " (passou do limite)" : ""}</span>
                    <button onClick={() => cartoes.excluirAdicional(a.id).then(onAlterado).catch((e) => toast.error(String(e)))} aria-label={`Excluir adicional ${a.nome}`} className="text-texto-secundario hover:text-erro"><Trash2 size={12} /></button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <form onSubmit={adicionar} className="flex flex-wrap gap-1.5">
          <input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Quem usa (ex.: Maria)" aria-label="Nome do adicional" className={`${CLASSE_INPUT} w-32 py-1`} />
          <input value={novo.final} onChange={(e) => setNovo({ ...novo, final: e.target.value })} placeholder="Final" inputMode="numeric" aria-label="Final do cartão adicional" className={`${CLASSE_INPUT} w-16 py-1`} />
          <input value={novo.limite} onChange={(e) => setNovo({ ...novo, limite: e.target.value })} placeholder="Limite próprio" inputMode="decimal" aria-label="Limite do adicional" className={`${CLASSE_INPUT} w-28 py-1`} />
          <Button type="submit" tamanho="pequeno" variante="secundaria" disabled={!novo.nome.trim()}>Adicionar</Button>
        </form>
      </div>
    </div>
  );
}
