import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, CreditCard, Flame, Goal, LineChart, NotebookPen, Repeat, Settings2, Target, TrendingUp, Wallet, Zap } from "lucide-react";
import { formatarDataISOParaBR } from "../../services/formato";
import { preverSaldo } from "../../services/previsao";
import { usePreferencia } from "../../state/usePreferencia";
import { NAVEGACAO } from "../../app/navegacao";
import type { Agendamento, Conta, Lancamento } from "../../types/accounting";
import type { Meta } from "../../types/extras";
import { calcularCiclo } from "../contas/ciclo";
import { assinaturasDoMes, gastosRecentes, proximosRecebimentos } from "./dadosWidgetsInicio";
import { WidgetFotos, WidgetRelogio, WidgetVideo } from "./WidgetsMidia";

type Widget = "fimdomes" | "hoje" | "sequencia" | "metas" | "receber" | "faturas" | "assinaturas" | "investido" | "atalhos" | "notas" | "foco" | "relogio" | "fotos" | "video";

const WIDGETS: Array<{ id: Widget; rotulo: string }> = [
  { id: "fimdomes", rotulo: "Saldo previsto no fim do mês" },
  { id: "hoje", rotulo: "Gasto de hoje e da semana" },
  { id: "sequencia", rotulo: "Dias sem gastar" },
  { id: "metas", rotulo: "Metas quase lá" },
  { id: "receber", rotulo: "Próximos recebimentos" },
  { id: "faturas", rotulo: "Faturas de cartão" },
  { id: "assinaturas", rotulo: "Assinaturas do mês" },
  { id: "investido", rotulo: "Total investido" },
  { id: "atalhos", rotulo: "Meus atalhos" },
  { id: "notas", rotulo: "Bloco de notas" },
  { id: "foco", rotulo: "Foco do mês" },
  { id: "relogio", rotulo: "Relógio (com outros fusos)" },
  { id: "fotos", rotulo: "Minhas fotos (álbum)" },
  { id: "video", rotulo: "Vídeo" },
];
const PADRAO: Widget[] = ["fimdomes", "hoje", "sequencia", "metas", "receber", "faturas"];

interface Props {
  contas: Conta[];
  lancamentos: Lancamento[];
  agendamentos: Agendamento[];
  metas: Meta[];
  hoje: string;
  dinheiro: (v: number) => string;
}

function Cartao({ titulo, icone: Icone, children }: { titulo: string; icone: typeof Wallet; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-borda bg-cartao p-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-texto-secundario"><Icone size={13} className="text-primaria" /> {titulo}</p>
      {children}
    </div>
  );
}

/** Widgets escolhidos pelo usuário no Início. */
export function WidgetsInicio({ contas, lancamentos, agendamentos, metas, hoje, dinheiro }: Props) {
  const [ativos, setAtivos] = usePreferencia<Widget[]>("widgets_inicio", PADRAO);
  const [atalhos, setAtalhos] = usePreferencia<string[]>("atalhos_inicio", ["/lancamentos", "/orcamento", "/metas", "/relatorios"]);
  const [notas, setNotas] = usePreferencia<string>("notas_inicio", "");
  const [foco, setFoco] = usePreferencia<{ mes: string; texto: string }>("foco_mes", { mes: "", texto: "" });
  const [rascunhoNotas, setRascunhoNotas] = useState(notas);
  const [escolhendo, setEscolhendo] = useState(false);
  useEffect(() => setRascunhoNotas(notas), [notas]);

  const ativosSet = new Set(ativos);
  const fimMes = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7), 0)).toISOString().slice(0, 10);
  const dias = Math.max(1, Math.round((Date.parse(`${fimMes}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000));
  const previsao = ativosSet.has("fimdomes") ? preverSaldo({ hoje, dias, contas, lancamentos, agendamentos }) : null;
  const g = gastosRecentes(lancamentos, contas, hoje);
  const quaseLa = metas.filter((m) => m.guardado_centavos < m.valor_alvo_centavos && m.guardado_centavos >= m.valor_alvo_centavos * 0.7).sort((a, b) => b.guardado_centavos / b.valor_alvo_centavos - a.guardado_centavos / a.valor_alvo_centavos).slice(0, 3);
  const receber = proximosRecebimentos(agendamentos, hoje).slice(0, 4);
  const cartoes = contas.filter((c) => c.ativa && c.subtipo === "CARTAO_CREDITO" && c.saldo_atual_centavos > 0).map((c) => ({ c, venc: calcularCiclo(c.dia_fechamento_fatura ?? 1, c.dia_vencimento_fatura ?? 10, hoje).proximoVencimento })).sort((a, b) => a.venc.localeCompare(b.venc));
  const assin = assinaturasDoMes(lancamentos, hoje);
  const investido = contas.filter((c) => c.tipo === "ATIVO" && c.subtipo === "INVESTIMENTO").reduce((s, c) => s + c.saldo_atual_centavos, 0);
  const mesAtual = hoje.slice(0, 7);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">Meus widgets</p>
        <button onClick={() => setEscolhendo(!escolhendo)} className="flex items-center gap-1 text-xs text-primaria hover:underline"><Settings2 size={12} /> Escolher</button>
      </div>
      {escolhendo && (
        <div className="mb-3 grid gap-1 rounded-xl border border-borda bg-superficie p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {WIDGETS.map((w) => (
            <label key={w.id} className="flex items-center gap-2 text-texto-primario"><input type="checkbox" checked={ativosSet.has(w.id)} onChange={() => setAtivos(ativosSet.has(w.id) ? ativos.filter((x) => x !== w.id) : [...ativos, w.id])} className="h-4 w-4 accent-[var(--cor-primaria)]" />{w.rotulo}</label>
          ))}
          {ativosSet.has("atalhos") && (
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="mt-2 text-xs text-texto-secundario">Atalhos:</p>
              <div className="flex flex-wrap gap-1.5">{NAVEGACAO.filter((n) => n.rota !== "/").map((n) => <button key={n.rota} onClick={() => setAtalhos(atalhos.includes(n.rota) ? atalhos.filter((x) => x !== n.rota) : [...atalhos, n.rota].slice(-8))} className={`rounded-full border px-2 py-0.5 text-xs ${atalhos.includes(n.rota) ? "border-primaria text-primaria" : "border-borda text-texto-secundario"}`}>{n.rotulo}</button>)}</div>
            </div>
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ativosSet.has("fimdomes") && previsao && (
          <Cartao titulo="Saldo previsto no fim do mês" icone={LineChart}>
            <p className={`text-lg font-bold tabular-nums ${previsao.em30 < 0 || previsao.serie[previsao.serie.length - 1].saldo < 0 ? "text-erro" : "text-texto-primario"}`}>{dinheiro(previsao.serie[previsao.serie.length - 1].saldo)}</p>
            <p className="text-[11px] text-texto-secundario">Hoje {dinheiro(previsao.saldoInicial)} · menor saldo {dinheiro(previsao.minimo.saldo)} em {formatarDataISOParaBR(previsao.minimo.data).slice(0, 5)} (estimativa)</p>
          </Cartao>
        )}
        {ativosSet.has("hoje") && (
          <Cartao titulo="Gastos" icone={Zap}>
            <p className="text-sm"><span className="text-texto-secundario">Hoje</span> <strong className="tabular-nums">{dinheiro(g.hoje)}</strong></p>
            <p className="text-sm"><span className="text-texto-secundario">Nesta semana</span> <strong className="tabular-nums">{dinheiro(g.semana)}</strong></p>
          </Cartao>
        )}
        {ativosSet.has("sequencia") && (
          <Cartao titulo="Sequência" icone={Flame}>
            <p className="text-lg font-bold text-texto-primario">{g.diasSemGastar} dia(s)</p>
            <p className="text-[11px] text-texto-secundario">{g.diasSemGastar === 0 ? "Teve gasto hoje." : "sem nenhuma despesa lançada. Continue!"}</p>
          </Cartao>
        )}
        {ativosSet.has("metas") && (
          <Cartao titulo="Metas quase lá" icone={Target}>
            {quaseLa.length === 0 ? <p className="text-xs text-texto-secundario">Nenhuma meta acima de 70% ainda.</p> : quaseLa.map((m) => <p key={m.id} className="flex justify-between text-sm"><span className="truncate">{m.nome}</span><span className="tabular-nums text-sucesso">{Math.round((m.guardado_centavos / m.valor_alvo_centavos) * 100)}%</span></p>)}
          </Cartao>
        )}
        {ativosSet.has("receber") && (
          <Cartao titulo="Próximos recebimentos (30 dias)" icone={CalendarCheck}>
            {receber.length === 0 ? <p className="text-xs text-texto-secundario">Nada agendado para receber.</p> : receber.map((a) => <p key={a.id} className="flex justify-between text-sm"><span className="truncate">{formatarDataISOParaBR(a.vencimento).slice(0, 5)} · {a.descricao}</span><span className="tabular-nums text-sucesso">{dinheiro(a.valor_centavos)}</span></p>)}
          </Cartao>
        )}
        {ativosSet.has("faturas") && (
          <Cartao titulo="Faturas de cartão" icone={CreditCard}>
            {cartoes.length === 0 ? <p className="text-xs text-texto-secundario">Nenhuma fatura em aberto.</p> : cartoes.slice(0, 4).map((x) => <p key={x.c.id} className="flex justify-between text-sm"><span className="truncate">{x.c.nome} · vence {formatarDataISOParaBR(x.venc).slice(0, 5)}</span><span className="tabular-nums text-erro">{dinheiro(x.c.saldo_atual_centavos)}</span></p>)}
          </Cartao>
        )}
        {ativosSet.has("assinaturas") && (
          <Cartao titulo="Assinaturas do mês" icone={Repeat}>
            <p className="text-lg font-bold tabular-nums text-texto-primario">{dinheiro(assin.total)}</p>
            <p className="text-[11px] text-texto-secundario">{assin.quantidade} lançamento(s) com etiqueta “assinatura” · {dinheiro(assin.total * 12)}/ano</p>
          </Cartao>
        )}
        {ativosSet.has("investido") && (
          <Cartao titulo="Total investido" icone={TrendingUp}>
            <p className="text-lg font-bold tabular-nums text-texto-primario">{dinheiro(investido)}</p>
            <Link to="/investimentos" className="text-[11px] text-primaria hover:underline">Ver carteira →</Link>
          </Cartao>
        )}
        {ativosSet.has("atalhos") && (
          <Cartao titulo="Meus atalhos" icone={Wallet}>
            <div className="flex flex-wrap gap-1.5">{atalhos.map((r) => { const n = NAVEGACAO.find((x) => x.rota === r); return n ? <Link key={r} to={r} className="flex items-center gap-1 rounded-lg border border-borda px-2 py-1 text-xs hover:border-primaria hover:text-primaria"><n.icone size={12} /> {n.rotulo}</Link> : null; })}</div>
          </Cartao>
        )}
        {ativosSet.has("notas") && (
          <Cartao titulo="Bloco de notas" icone={NotebookPen}>
            <textarea value={rascunhoNotas} onChange={(e) => setRascunhoNotas(e.target.value)} onBlur={() => setNotas(rascunhoNotas)} rows={3} placeholder="Lembretes rápidos (salva sozinho)" aria-label="Bloco de notas" className="w-full resize-none rounded-lg border border-borda bg-fundo p-2 text-xs text-texto-primario outline-none focus:border-primaria" />
          </Cartao>
        )}
        {ativosSet.has("foco") && (
          <Cartao titulo="Foco do mês" icone={Goal}>
            <input value={foco.mes === mesAtual ? foco.texto : ""} onChange={(e) => setFoco({ mes: mesAtual, texto: e.target.value })} placeholder="Ex.: não pedir delivery durante a semana" aria-label="Foco do mês" className="w-full rounded-lg border border-borda bg-fundo px-2 py-1.5 text-sm text-texto-primario outline-none focus:border-primaria" />
            <p className="mt-1 text-[11px] text-texto-secundario">Renova todo mês.</p>
          </Cartao>
        )}
        {ativosSet.has("relogio") && <WidgetRelogio />}
        {ativosSet.has("fotos") && <WidgetFotos />}
        {ativosSet.has("video") && <WidgetVideo />}
      </div>
    </section>
  );
}
