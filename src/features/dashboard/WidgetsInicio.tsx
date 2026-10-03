import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle, CalendarCheck, CalendarDays, Check, CreditCard, Flame, GripVertical, Goal, Landmark, LayoutGrid, LineChart, ListOrdered, NotebookPen, PiggyBank, Plus, Receipt,
  Repeat, ShieldCheck, Target, TrendingUp, Wallet, X, Zap,
} from "lucide-react";
import { formatarDataISOParaBR } from "../../services/formato";
import { preverSaldo } from "../../services/previsao";
import { usePreferencia } from "../../state/usePreferencia";
import { useWidgetsStore } from "../../state/widgets-store";
import { NAVEGACAO } from "../../app/navegacao";
import type { Agendamento, Conta, Lancamento } from "../../types/accounting";
import type { Meta, Orcamento } from "../../types/extras";
import { calcularCiclo } from "../contas/ciclo";
import {
  assinaturasDoMes, calendarioDoMes, contasAPagar, gastosRecentes, maioresGastosDoMes, patrimonioLiquido, poupancaDoMes, progressoDoOrcamento, proximosRecebimentos,
  reservaDeEmergencia, saldosDisponiveis,
} from "./dadosWidgetsInicio";
import { CATALOGO, GRUPOS, classeDoTamanho, classesDaGrade, infoDoWidget, type Tamanho, type WidgetId } from "./layoutWidgets";
import { WidgetFotos, WidgetRelogio, WidgetVideo } from "./WidgetsMidia";
import { Cartao, WidgetCalculadora, WidgetContagem, WidgetCotacoes, WidgetDica } from "./WidgetsExtras";

interface Props {
  contas: Conta[];
  lancamentos: Lancamento[];
  agendamentos: Agendamento[];
  metas: Meta[];
  orcamentos?: Orcamento[];
  hoje: string;
  dinheiro: (v: number) => string;
}

const Barra = ({ pct, cor }: { pct: number; cor: string }) => (
  <div className="h-1.5 overflow-hidden rounded-full bg-borda"><div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(2, pct * 100))}%`, background: cor }} /></div>
);

const Vazio = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-texto-secundario">{children}</p>;

/** Conteúdo de cada widget a partir dos dados do Início. */
function useConteudo({ contas, lancamentos, agendamentos, metas, orcamentos = [], hoje, dinheiro }: Props) {
  const [atalhos] = usePreferencia<string[]>("atalhos_inicio", ["/lancamentos", "/orcamento", "/metas", "/relatorios"]);
  const [notas, setNotas] = usePreferencia<string>("notas_inicio", "");
  const [foco, setFoco] = usePreferencia<{ mes: string; texto: string }>("foco_mes", { mes: "", texto: "" });
  const [rascunhoNotas, setRascunhoNotas] = useState(notas);
  useEffect(() => setRascunhoNotas(notas), [notas]);
  const mesAtual = hoje.slice(0, 7);

  return (id: WidgetId): React.ReactNode => {
    switch (id) {
      case "fimdomes": {
        const fimMes = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7), 0)).toISOString().slice(0, 10);
        const dias = Math.max(1, Math.round((Date.parse(`${fimMes}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000));
        const p = preverSaldo({ hoje, dias, contas, lancamentos, agendamentos });
        const fim = p.serie[p.serie.length - 1].saldo;
        return (
          <Cartao titulo="Saldo previsto no fim do mês" icone={LineChart}>
            <p className={`text-lg font-bold tabular-nums ${p.em30 < 0 || fim < 0 ? "text-erro" : "text-texto-primario"}`}>{dinheiro(fim)}</p>
            <p className="text-[11px] text-texto-secundario">Hoje {dinheiro(p.saldoInicial)} · menor saldo {dinheiro(p.minimo.saldo)} em {formatarDataISOParaBR(p.minimo.data).slice(0, 5)} (estimativa)</p>
          </Cartao>
        );
      }
      case "hoje": {
        const g = gastosRecentes(lancamentos, contas, hoje);
        return (
          <Cartao titulo="Gastos" icone={Zap}>
            <p className="text-sm"><span className="text-texto-secundario">Hoje</span> <strong className="tabular-nums">{dinheiro(g.hoje)}</strong></p>
            <p className="text-sm"><span className="text-texto-secundario">Nesta semana</span> <strong className="tabular-nums">{dinheiro(g.semana)}</strong></p>
          </Cartao>
        );
      }
      case "sequencia": {
        const g = gastosRecentes(lancamentos, contas, hoje);
        return (
          <Cartao titulo="Sequência" icone={Flame}>
            <p className="text-lg font-bold text-texto-primario">{g.diasSemGastar} dia(s)</p>
            <p className="text-[11px] text-texto-secundario">{g.diasSemGastar === 0 ? "Teve gasto hoje." : "sem nenhuma despesa lançada. Continue!"}</p>
          </Cartao>
        );
      }
      case "metas": {
        const quaseLa = metas.filter((m) => m.guardado_centavos < m.valor_alvo_centavos && m.guardado_centavos >= m.valor_alvo_centavos * 0.7).sort((a, b) => b.guardado_centavos / b.valor_alvo_centavos - a.guardado_centavos / a.valor_alvo_centavos).slice(0, 3);
        return (
          <Cartao titulo="Metas quase lá" icone={Target}>
            {quaseLa.length === 0 ? <Vazio>Nenhuma meta acima de 70% ainda.</Vazio> : quaseLa.map((m) => <p key={m.id} className="flex justify-between text-sm"><span className="truncate">{m.nome}</span><span className="tabular-nums text-sucesso">{Math.round((m.guardado_centavos / m.valor_alvo_centavos) * 100)}%</span></p>)}
          </Cartao>
        );
      }
      case "receber": {
        const receber = proximosRecebimentos(agendamentos, hoje).slice(0, 4);
        return (
          <Cartao titulo="Próximos recebimentos (30 dias)" icone={CalendarCheck}>
            {receber.length === 0 ? <Vazio>Nada agendado para receber.</Vazio> : receber.map((a) => <p key={a.id} className="flex justify-between gap-2 text-sm"><span className="truncate">{formatarDataISOParaBR(a.vencimento).slice(0, 5)} · {a.descricao}</span><span className="tabular-nums text-sucesso">{dinheiro(a.valor_centavos)}</span></p>)}
          </Cartao>
        );
      }
      case "faturas": {
        const cartoes = contas.filter((c) => c.ativa && c.subtipo === "CARTAO_CREDITO" && c.saldo_atual_centavos > 0).map((c) => ({ c, venc: calcularCiclo(c.dia_fechamento_fatura ?? 1, c.dia_vencimento_fatura ?? 10, hoje).proximoVencimento })).sort((a, b) => a.venc.localeCompare(b.venc));
        return (
          <Cartao titulo="Faturas de cartão" icone={CreditCard}>
            {cartoes.length === 0 ? <Vazio>Nenhuma fatura em aberto.</Vazio> : cartoes.slice(0, 4).map((x) => <p key={x.c.id} className="flex justify-between gap-2 text-sm"><span className="truncate">{x.c.nome} · vence {formatarDataISOParaBR(x.venc).slice(0, 5)}</span><span className="tabular-nums text-erro">{dinheiro(x.c.saldo_atual_centavos)}</span></p>)}
          </Cartao>
        );
      }
      case "assinaturas": {
        const assin = assinaturasDoMes(lancamentos, hoje);
        return (
          <Cartao titulo="Assinaturas do mês" icone={Repeat}>
            <p className="text-lg font-bold tabular-nums text-texto-primario">{dinheiro(assin.total)}</p>
            <p className="text-[11px] text-texto-secundario">{assin.quantidade} lançamento(s) com etiqueta “assinatura” · {dinheiro(assin.total * 12)}/ano</p>
          </Cartao>
        );
      }
      case "investido": {
        const investido = contas.filter((c) => c.tipo === "ATIVO" && c.subtipo === "INVESTIMENTO").reduce((s, c) => s + c.saldo_atual_centavos, 0);
        return (
          <Cartao titulo="Total investido" icone={TrendingUp}>
            <p className="text-lg font-bold tabular-nums text-texto-primario">{dinheiro(investido)}</p>
            <Link to="/investimentos" className="text-[11px] text-primaria hover:underline">Ver carteira →</Link>
          </Cartao>
        );
      }
      case "atalhos":
        return (
          <Cartao titulo="Meus atalhos" icone={Wallet}>
            <div className="flex flex-wrap gap-1.5">{atalhos.map((r) => { const n = NAVEGACAO.find((x) => x.rota === r); return n ? <Link key={r} to={r} className="flex items-center gap-1 rounded-lg border border-borda px-2 py-1 text-xs hover:border-primaria hover:text-primaria"><n.icone size={12} /> {n.rotulo}</Link> : null; })}</div>
          </Cartao>
        );
      case "notas":
        return (
          <Cartao titulo="Bloco de notas" icone={NotebookPen}>
            <textarea value={rascunhoNotas} onChange={(e) => setRascunhoNotas(e.target.value)} onBlur={() => setNotas(rascunhoNotas)} rows={3} placeholder="Lembretes rápidos (salva sozinho)" aria-label="Bloco de notas" className="w-full resize-none rounded-lg border border-borda bg-fundo p-2 text-xs text-texto-primario outline-none focus:border-primaria" />
          </Cartao>
        );
      case "foco":
        return (
          <Cartao titulo="Foco do mês" icone={Goal}>
            <input value={foco.mes === mesAtual ? foco.texto : ""} onChange={(e) => setFoco({ mes: mesAtual, texto: e.target.value })} placeholder="Ex.: não pedir delivery durante a semana" aria-label="Foco do mês" className="w-full rounded-lg border border-borda bg-fundo px-2 py-1.5 text-sm text-texto-primario outline-none focus:border-primaria" />
            <p className="mt-1 text-[11px] text-texto-secundario">Renova todo mês.</p>
          </Cartao>
        );
      case "contaspagar": {
        const c = contasAPagar(agendamentos, hoje);
        const lista = [...c.atrasadas, ...c.proximas].slice(0, 5);
        return (
          <Cartao titulo="Contas a pagar (7 dias)" icone={Receipt}>
            {lista.length === 0 ? <Vazio>Nada vencendo nos próximos 7 dias. 🎉</Vazio> : (
              <>
                {c.atrasadas.length > 0 && <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-erro"><AlertTriangle size={11} /> {c.atrasadas.length} atrasada(s)</p>}
                {lista.map((a) => <p key={a.id} className="flex justify-between gap-2 text-sm"><span className={`truncate ${a.vencimento < hoje ? "text-erro" : ""}`}>{a.vencimento === hoje ? "hoje" : formatarDataISOParaBR(a.vencimento).slice(0, 5)} · {a.descricao}</span><span className="tabular-nums">{dinheiro(a.valor_centavos)}</span></p>)}
                <p className="mt-1 text-[11px] text-texto-secundario">Total {dinheiro(c.total)} · <Link to="/lancamentos" className="text-primaria hover:underline">ver agenda</Link></p>
              </>
            )}
          </Cartao>
        );
      }
      case "orcamento": {
        const itens = progressoDoOrcamento(orcamentos, lancamentos, contas, hoje).slice(0, 4);
        return (
          <Cartao titulo="Orçamento do mês" icone={PiggyBank}>
            {itens.length === 0 ? <Vazio>Nenhum limite definido. <Link to="/orcamento" className="text-primaria hover:underline">Criar orçamento</Link></Vazio> : itens.map((o) => (
              <div key={o.id} className="mb-1.5">
                <p className="flex justify-between gap-2 text-xs"><span className="truncate text-texto-primario">{o.nome}</span><span className={`tabular-nums ${o.pct > 1 ? "text-erro" : o.pct > 0.8 ? "text-alerta" : "text-texto-secundario"}`}>{dinheiro(o.gasto)} / {dinheiro(o.limite)}</span></p>
                <Barra pct={o.pct} cor={o.pct > 1 ? "var(--cor-erro)" : o.pct > 0.8 ? "var(--cor-alerta)" : "var(--cor-sucesso)"} />
              </div>
            ))}
          </Cartao>
        );
      }
      case "maioresgastos": {
        const itens = maioresGastosDoMes(lancamentos, contas, hoje, 4);
        const maior = itens[0]?.valor ?? 1;
        return (
          <Cartao titulo="Maiores gastos do mês" icone={ListOrdered}>
            {itens.length === 0 ? <Vazio>Nenhuma despesa neste mês.</Vazio> : itens.map((g) => (
              <div key={g.id} className="mb-1.5">
                <p className="flex justify-between gap-2 text-xs"><span className="truncate text-texto-primario">{g.nome}</span><span className="tabular-nums">{dinheiro(g.valor)}</span></p>
                <Barra pct={g.valor / maior} cor="var(--cor-primaria)" />
              </div>
            ))}
          </Cartao>
        );
      }
      case "ultimos": {
        const nomes = new Map(contas.map((c) => [c.id, c]));
        const ultimos = lancamentos.filter((l) => l.origem !== "ESTORNO").sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5);
        return (
          <Cartao titulo="Últimos lançamentos" icone={ListOrdered}>
            {ultimos.length === 0 ? <Vazio>Nenhum lançamento ainda.</Vazio> : ultimos.map((l) => {
              const despesa = l.partidas.find((p) => p.tipo === "DEBITO" && nomes.get(p.conta_id)?.tipo === "DESPESA");
              const receita = l.partidas.find((p) => p.tipo === "CREDITO" && nomes.get(p.conta_id)?.tipo === "RECEITA");
              const valor = l.partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0);
              return <p key={l.id} className="flex justify-between gap-2 text-sm"><span className="truncate">{formatarDataISOParaBR(l.data).slice(0, 5)} · {l.descricao}</span><span className={`tabular-nums ${despesa ? "text-erro" : receita ? "text-sucesso" : "text-texto-secundario"}`}>{despesa ? "−" : receita ? "+" : ""}{dinheiro(valor)}</span></p>;
            })}
          </Cartao>
        );
      }
      case "saldos": {
        const lista = saldosDisponiveis(contas);
        const total = lista.reduce((s, c) => s + c.saldo_atual_centavos, 0);
        return (
          <Cartao titulo="Saldos das contas" icone={Landmark}>
            {lista.length === 0 ? <Vazio>Nenhuma conta cadastrada.</Vazio> : (
              <>
                {lista.slice(0, 5).map((c) => <p key={c.id} className="flex justify-between gap-2 text-sm"><span className="truncate">{c.nome}</span><span className={`tabular-nums ${c.saldo_atual_centavos < 0 ? "text-erro" : ""}`}>{dinheiro(c.saldo_atual_centavos)}</span></p>)}
                <p className="mt-1 flex justify-between border-t border-borda pt-1 text-xs font-semibold"><span>Total</span><span className="tabular-nums">{dinheiro(total)}</span></p>
              </>
            )}
          </Cartao>
        );
      }
      case "patrimonio": {
        const p = patrimonioLiquido(contas);
        return (
          <Cartao titulo="Patrimônio líquido" icone={Landmark}>
            <p className={`text-lg font-bold tabular-nums ${p.liquido < 0 ? "text-erro" : "text-texto-primario"}`}>{dinheiro(p.liquido)}</p>
            <p className="text-[11px] text-texto-secundario">Você tem {dinheiro(p.ativos)} · deve {dinheiro(p.passivos)}</p>
          </Cartao>
        );
      }
      case "reserva": {
        const r = reservaDeEmergencia(contas, lancamentos, hoje);
        const meses = r.meses ?? 0;
        return (
          <Cartao titulo="Reserva de emergência" icone={ShieldCheck}>
            {r.meses === null ? <Vazio>Precisa de pelo menos um mês completo de gastos para calcular.</Vazio> : (
              <>
                <p className={`text-lg font-bold tabular-nums ${meses < 3 ? "text-alerta" : "text-sucesso"}`}>{meses.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} {meses >= 1 && meses < 2 ? "mês" : "meses"}</p>
                <Barra pct={meses / 6} cor={meses < 3 ? "var(--cor-alerta)" : "var(--cor-sucesso)"} />
                <p className="mt-1 text-[11px] text-texto-secundario">{dinheiro(r.disponivel)} disponível ÷ {dinheiro(r.gastoMedio)} de gasto médio. O ideal é de 3 a 6 meses.</p>
              </>
            )}
          </Cartao>
        );
      }
      case "poupanca": {
        const p = poupancaDoMes(lancamentos, contas, hoje);
        return (
          <Cartao titulo="Quanto sobrou no mês" icone={PiggyBank}>
            <p className={`text-lg font-bold tabular-nums ${p.sobra < 0 ? "text-erro" : "text-sucesso"}`}>{dinheiro(p.sobra)}</p>
            <p className="text-[11px] text-texto-secundario">{p.taxa === null ? "Nenhuma receita lançada neste mês." : `${Math.round(p.taxa * 100)}% da renda · entrou ${dinheiro(p.receitas)}, saiu ${dinheiro(p.despesas)}`}</p>
          </Cartao>
        );
      }
      case "calendario": {
        const semanas = calendarioDoMes(hoje);
        const pagar = new Set(agendamentos.filter((a) => !a.pago_em && a.tipo !== "RECEBER").map((a) => a.vencimento));
        const receber = new Set(agendamentos.filter((a) => !a.pago_em && a.tipo === "RECEBER").map((a) => a.vencimento));
        const nomeMes = new Date(`${hoje}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
        return (
          <Cartao titulo={nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} icone={CalendarDays}>
            <table className="w-full text-center text-[11px] tabular-nums">
              <thead><tr className="text-texto-secundario">{["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <th key={i} className="font-medium">{d}</th>)}</tr></thead>
              <tbody>
                {semanas.map((s, i) => (
                  <tr key={i}>
                    {s.map((d, j) => (
                      <td key={j} className="p-0.5">
                        {d && (
                          <span title={pagar.has(d) ? "Conta a pagar" : receber.has(d) ? "A receber" : undefined} className={`relative mx-auto flex h-6 w-6 items-center justify-center rounded-full ${d === hoje ? "bg-primaria font-bold text-white" : "text-texto-primario"}`}>
                            {+d.slice(8)}
                            {(pagar.has(d) || receber.has(d)) && <span className={`absolute bottom-0 h-1 w-1 rounded-full ${pagar.has(d) ? "bg-erro" : "bg-sucesso"}`} />}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 flex gap-3 text-[10px] text-texto-secundario"><span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-erro" /> pagar</span><span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sucesso" /> receber</span></p>
          </Cartao>
        );
      }
      case "cotacoes": return <WidgetCotacoes />;
      case "contagem": return <WidgetContagem hoje={hoje} />;
      case "calculadora": return <WidgetCalculadora />;
      case "dica": return <WidgetDica hoje={hoje} />;
      case "relogio": return <WidgetRelogio />;
      case "fotos": return <WidgetFotos />;
      case "video": return <WidgetVideo />;
    }
  };
}

const TAMANHOS: Array<{ t: Tamanho; rotulo: string; nome: string }> = [
  { t: 1, rotulo: "P", nome: "Pequeno (1 coluna)" },
  { t: 2, rotulo: "M", nome: "Médio (2 colunas)" },
  { t: 3, rotulo: "G", nome: "Grande (linha inteira)" },
];

/** Um widget na grade; no modo de edição, ganha alça para arrastar, tamanho e remover. */
function ItemDaGrade({ id, children }: { id: WidgetId; children: React.ReactNode }) {
  const editando = useWidgetsStore((s) => s.editando);
  const layout = useWidgetsStore((s) => s.layout);
  const tamanho = useWidgetsStore((s) => s.tamanhoDe(id));
  const definirTamanho = useWidgetsStore((s) => s.definirTamanho);
  const remover = useWidgetsStore((s) => s.remover);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editando });
  const info = infoDoWidget(id);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative min-w-0 ${classeDoTamanho(tamanho, layout)} ${isDragging ? "z-20 opacity-80" : ""} ${editando ? "rounded-xl outline-2 outline-offset-2 outline-dashed outline-primaria/50" : ""}`}
    >
      {editando && (
        <div className="absolute inset-x-0 -top-3 z-10 flex justify-center">
          <div className="flex items-center gap-0.5 rounded-full border border-borda bg-superficie px-1 py-0.5 text-[10px] shadow-lg">
            <button ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Arrastar ${info.rotulo}`} className="cursor-grab rounded-full p-1 text-texto-secundario hover:text-primaria active:cursor-grabbing"><GripVertical size={12} /></button>
            {TAMANHOS.filter((x) => x.t <= layout.colunas).map((x) => (
              <button key={x.t} onClick={() => definirTamanho(id, x.t)} aria-label={x.nome} title={x.nome} aria-pressed={tamanho === x.t} className={`h-5 w-5 rounded-full font-semibold ${tamanho === x.t ? "bg-primaria text-white" : "text-texto-secundario hover:text-texto-primario"}`}>{x.rotulo}</button>
            ))}
            <button onClick={() => remover(id)} aria-label={`Remover ${info.rotulo}`} className="rounded-full p-1 text-texto-secundario hover:text-erro"><X size={12} /></button>
          </div>
        </div>
      )}
      <div className={`h-full ${editando ? "pointer-events-none select-none" : ""}`}>{children}</div>
    </div>
  );
}

/** Catálogo para adicionar widgets (no modo de edição). */
export function CatalogoWidgets({ compacto = false }: { compacto?: boolean }) {
  const ativos = useWidgetsStore((s) => s.ativos);
  const alternar = useWidgetsStore((s) => s.alternar);
  return (
    <div className={`grid gap-3 ${compacto ? "sm:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-3"}`}>
      {GRUPOS.map((g) => (
        <div key={g}>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-texto-secundario">{g}</p>
          <ul className="space-y-1">
            {CATALOGO.filter((w) => w.grupo === g).map((w) => {
              const ativo = ativos.includes(w.id);
              return (
                <li key={w.id}>
                  <button onClick={() => alternar(w.id)} aria-pressed={ativo} className={`flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${ativo ? "border-primaria/60 bg-primaria/10" : "border-borda hover:border-primaria/50"}`}>
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${ativo ? "border-primaria bg-primaria text-white" : "border-borda"}`}>{ativo ? <Check size={11} /> : <Plus size={10} className="text-texto-secundario" />}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm text-texto-primario">{w.rotulo}{w.novo && <span className="rounded bg-primaria/20 px-1 text-[9px] font-semibold uppercase text-primaria">novo</span>}</span>
                      {!compacto && <span className="block text-[11px] text-texto-secundario">{w.descricao}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Widgets escolhidos pelo usuário no Início, na ordem e no tamanho escolhidos. */
export function WidgetsInicio(props: Props) {
  const { ativos, layout, editando, carregar, setEditando, reordenar } = useWidgetsStore();
  const [atalhos, setAtalhos] = usePreferencia<string[]>("atalhos_inicio", ["/lancamentos", "/orcamento", "/metas", "/relatorios"]);
  const conteudo = useConteudo(props);
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    carregar();
    return () => setEditando(false);
  }, [carregar, setEditando]);

  const aoSoltar = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    reordenar(ativos.indexOf(e.active.id as WidgetId), ativos.indexOf(e.over.id as WidgetId));
  };

  return (
    <section>
      {(layout.titulo || editando) && (
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">Meus widgets</p>
          <div className="flex items-center gap-3">
            {editando && <Link to="/temas" className="text-xs text-texto-secundario hover:text-primaria">Mais opções de layout</Link>}
            <button onClick={() => setEditando(!editando)} className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${editando ? "bg-primaria text-white" : "text-primaria hover:underline"}`}>
              {editando ? <><Check size={12} /> Concluir</> : <><LayoutGrid size={12} /> Editar layout</>}
            </button>
          </div>
        </div>
      )}
      {editando && (
        <div className="mb-5 space-y-3 rounded-xl border border-dashed border-primaria/50 bg-superficie/80 p-3">
          <p className="text-xs text-texto-secundario">Arraste pela alça <GripVertical size={11} className="inline" /> para mudar a ordem (ou use Tab, Espaço e as setas). P, M e G mudam o tamanho. Clique num widget abaixo para mostrar ou esconder.</p>
          <CatalogoWidgets compacto />
          {ativos.includes("atalhos") && (
            <div>
              <p className="text-xs text-texto-secundario">Atalhos:</p>
              <div className="flex flex-wrap gap-1.5">{NAVEGACAO.filter((n) => n.rota !== "/").map((n) => <button key={n.rota} onClick={() => setAtalhos(atalhos.includes(n.rota) ? atalhos.filter((x) => x !== n.rota) : [...atalhos, n.rota].slice(-8))} className={`rounded-full border px-2 py-0.5 text-xs ${atalhos.includes(n.rota) ? "border-primaria text-primaria" : "border-borda text-texto-secundario"}`}>{n.rotulo}</button>)}</div>
            </div>
          )}
        </div>
      )}
      {ativos.length === 0 ? (
        <button onClick={() => setEditando(true)} className="w-full rounded-xl border border-dashed border-borda p-6 text-sm text-texto-secundario hover:border-primaria hover:text-primaria"><Plus size={14} className="inline" /> Adicionar widgets ao Início</button>
      ) : (
        <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
          <SortableContext items={ativos} strategy={rectSortingStrategy}>
            <div className={`${classesDaGrade(layout)} ${editando ? "pt-3" : ""}`}>
              {ativos.map((id) => {
                const c = conteudo(id);
                return c ? <ItemDaGrade key={id} id={id}>{c}</ItemDaGrade> : null;
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
      {!layout.titulo && !editando && (
        <div className="mt-1 flex justify-end"><button onClick={() => setEditando(true)} aria-label="Editar layout dos widgets" className="rounded p-1 text-texto-secundario/60 hover:text-primaria"><LayoutGrid size={12} /></button></div>
      )}
    </section>
  );
}
