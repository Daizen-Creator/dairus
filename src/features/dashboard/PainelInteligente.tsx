import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, BellRing, CalendarRange, Flame, HeartPulse, Info, Lightbulb, PiggyBank, Plus, ShieldAlert, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { BarraProgresso, CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { despesasPorCategoriaNoMes } from "../../services/agregacoes";
import { formatarCentavos, formatarDataISOParaBR, valorInputParaCentavos } from "../../services/formato";
import { iconeDaCategoria } from "./categoriaIcone";
import { calcularMetricas, calcularSaude, gastoPorDiaDaSemana, gerarAlertas, gerarInsights, maioresDespesas, type EntradaInteligencia, type Gravidade } from "./inteligencia";

export type SecaoPainel = "saude" | "alertas" | "rapido" | "insights" | "comparativo" | "orcamento" | "semana" | "maiores";

export const SECOES_PAINEL: Array<{ id: SecaoPainel; rotulo: string }> = [
  { id: "saude", rotulo: "Saúde financeira" },
  { id: "alertas", rotulo: "Alertas" },
  { id: "rapido", rotulo: "Lançamento rápido" },
  { id: "insights", rotulo: "Insights do mês" },
  { id: "comparativo", rotulo: "Comparativo e fôlego de caixa" },
  { id: "orcamento", rotulo: "Orçamento" },
  { id: "semana", rotulo: "Gastos por dia da semana" },
  { id: "maiores", rotulo: "Maiores despesas" },
];

const COR_GRAVIDADE: Record<Gravidade, string> = { critico: "#ff2d55", atencao: "#f59e0b", info: "#00d9ff" };
const ICONE_GRAVIDADE = { critico: ShieldAlert, atencao: AlertTriangle, info: Info };
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface Props {
  dados: EntradaInteligencia;
  visiveis: Set<SecaoPainel>;
  ocultar: boolean;
  onLancado: () => void;
}

export function PainelInteligente({ dados, visiveis, ocultar, onLancado }: Props) {
  const dinheiro = (v: number) => (ocultar ? "R$ ••••" : formatarCentavos(v));
  const m = calcularMetricas(dados);
  const alertas = gerarAlertas(dados);
  const saude = calcularSaude(dados, m);
  const insights = gerarInsights(dados, m);
  const semana = gastoPorDiaDaSemana(dados.lancamentos, dados.contas, m.mes.inicio, m.mes.fim);
  const maxSemana = Math.max(1, ...semana);
  const maiores = maioresDespesas(dados.lancamentos, dados.contas, m.mes.inicio, m.mes.fim);
  const gastoCat = new Map(despesasPorCategoriaNoMes(dados.lancamentos, dados.contas, m.mes.inicio, m.mes.fim).map((f) => [f.contaId, f.valorCentavos]));
  const nomeConta = new Map(dados.contas.map((c) => [c.id, c.nome]));
  const orcamentoOrdenado = [...dados.orcamentos]
    .map((o) => ({ o, pct: ((gastoCat.get(o.categoria_id) ?? 0) / o.limite_centavos) * 100, gasto: gastoCat.get(o.categoria_id) ?? 0 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4);

  // Lançamento rápido
  const contasOrigem = dados.contas.filter((c) => (c.tipo === "ATIVO" || c.tipo === "PASSIVO") && c.subtipo !== "CATEGORIA" && c.ativa);
  const categorias = dados.contas.filter((c) => c.tipo === "DESPESA" && c.subtipo !== "CATEGORIA" && c.ativa);
  const [rapido, setRapido] = useState({ descricao: "", valor: "", categoria: "", conta: "" });
  const [salvando, setSalvando] = useState(false);

  async function lancar(ev: React.FormEvent) {
    ev.preventDefault();
    const valor = valorInputParaCentavos(rapido.valor);
    const conta = rapido.conta || contasOrigem[0]?.id;
    const categoria = rapido.categoria || categorias.find((c) => c.id === "despesa-outras")?.id || categorias[0]?.id;
    if (!rapido.descricao.trim() || valor <= 0 || !conta || !categoria) return toast.error("Informe descrição e valor.");
    try {
      setSalvando(true);
      await contabilidade.registrarDespesa({ conta_origem_id: conta, categoria_despesa_id: categoria, valor_centavos: valor, data: dados.hoje, descricao: rapido.descricao.trim() });
      toast.success("Despesa registrada.");
      setRapido({ ...rapido, descricao: "", valor: "" });
      onLancado();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSalvando(false);
    }
  }

  const varReceita = m.receitaAnt > 0 ? ((m.receitaMes - m.receitaAnt) / m.receitaAnt) * 100 : null;
  const varDespesa = m.despesaAnt > 0 ? ((m.despesaMes - m.despesaAnt) / m.despesaAnt) * 100 : null;
  const corSaude = saude ? (saude.pontos >= 80 ? "var(--cor-sucesso)" : saude.pontos >= 60 ? "var(--cor-primaria)" : saude.pontos >= 40 ? "var(--cor-alerta)" : "#ff2d55") : "var(--cor-borda)";

  const mostrarLinha1 = visiveis.has("saude") || visiveis.has("alertas") || visiveis.has("rapido");
  return (
    <div className="space-y-4">
      {mostrarLinha1 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visiveis.has("saude") && (
            <Secao titulo={<><HeartPulse size={16} style={{ color: corSaude }} /> Saúde financeira</>}>
              {saude ? (
                <>
                  <div className="flex items-end gap-3">
                    <span className="text-4xl font-bold tabular-nums" style={{ color: corSaude }}>{saude.pontos}</span>
                    <span className="pb-1 text-sm text-texto-secundario">/ 100 · <strong style={{ color: corSaude }}>{saude.rotulo}</strong></span>
                  </div>
                  <div className="mt-2"><BarraProgresso percentual={saude.pontos} cor={corSaude} /></div>
                  <ul className="mt-3 space-y-1.5">
                    {saude.detalhes.map((d) => (
                      <li key={d.nome} className="text-xs" title={d.dica}>
                        <div className="flex justify-between"><span className="text-texto-secundario">{d.nome}</span><span className="tabular-nums text-texto-primario">{d.pontos}/{d.maximo}</span></div>
                        <p className="text-[11px] text-texto-secundario/80">{d.dica}</p>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[10px] text-texto-secundario">Nota calculada por regras simples sobre os seus dados; não é score de crédito nem aconselhamento financeiro.</p>
                </>
              ) : <p className="text-sm text-texto-secundario">Registre receitas e despesas para calcular a sua pontuação.</p>}
            </Secao>
          )}

          {visiveis.has("alertas") && (
            <Secao titulo={<><BellRing size={16} className="text-alerta" /> Alertas {alertas.length > 0 && <span className="rounded-full bg-erro/20 px-2 py-0.5 text-[11px] text-erro">{alertas.length}</span>}</>}>
              {alertas.length === 0 ? <p className="text-sm text-sucesso">Tudo certo por aqui: nenhum alerta no momento.</p> : (
                <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {alertas.map((a) => {
                    const Icone = ICONE_GRAVIDADE[a.gravidade];
                    const cor = COR_GRAVIDADE[a.gravidade];
                    return (
                      <li key={a.id}>
                        <Link to={a.rota} className="flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-xs transition-colors hover:bg-borda/30" style={{ borderColor: `color-mix(in srgb, ${cor} 40%, transparent)`, backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${cor} 10%, transparent), transparent 70%)` }}>
                          <Icone size={15} style={{ color: cor }} className="mt-0.5 shrink-0" />
                          <span className="min-w-0 flex-1"><span className="block font-medium text-texto-primario">{a.titulo}</span><span className="block truncate text-texto-secundario">{a.detalhe}</span></span>
                          <ArrowRight size={13} className="mt-0.5 shrink-0 text-texto-secundario" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Secao>
          )}

          {visiveis.has("rapido") && (
            <div className="md:col-span-2"><Secao titulo={<><Zap size={16} className="text-primaria" /> Lançamento rápido</>}>
              <form onSubmit={lancar} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1.4fr_1.4fr_auto]">
                <input value={rapido.descricao} onChange={(e) => setRapido({ ...rapido, descricao: e.target.value })} placeholder="O que foi? (ex.: Uber, Mercado)" aria-label="Descrição" className={`${CLASSE_INPUT} w-full`} />
                  <input value={rapido.valor} onChange={(e) => setRapido({ ...rapido, valor: e.target.value })} inputMode="decimal" placeholder="Valor (R$)" aria-label="Valor" className={`${CLASSE_INPUT} w-full`} />
                  <Select aria-label="Categoria" value={rapido.categoria || categorias.find((c) => c.id === "despesa-outras")?.id || categorias[0]?.id || ""} onValueChange={(v) => setRapido({ ...rapido, categoria: v })} options={categorias.map((c) => ({ value: c.id, label: c.nome }))} className="w-full" />
                <Select aria-label="Conta" value={rapido.conta || contasOrigem[0]?.id || ""} onValueChange={(v) => setRapido({ ...rapido, conta: v })} options={contasOrigem.map((c) => ({ value: c.id, label: c.nome }))} className="w-full" />
                <Button type="submit" disabled={salvando}><Plus size={14} /> Registrar</Button>
              </form>
              <p className="mt-2 text-[11px] text-texto-secundario">Despesa de hoje. Para receitas, parcelas, observações e etiquetas, use “Despesas e Receitas”.</p>
            </Secao></div>
          )}
        </div>
      )}

      {visiveis.has("insights") && insights.length > 0 && (
        <Secao titulo={<><Lightbulb size={16} className="text-destaque" /> Insights do mês <span className="text-[11px] font-normal text-texto-secundario">(regras sobre os seus dados)</span></>}>
          <ul className="grid gap-2 md:grid-cols-2">
            {insights.map((t, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg border border-borda bg-fundo/40 px-3 py-2 text-xs text-texto-primario"><Flame size={13} className="mt-0.5 shrink-0 text-destaque" />{t}</li>
            ))}
          </ul>
        </Secao>
      )}

      {(visiveis.has("comparativo") || visiveis.has("orcamento")) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visiveis.has("comparativo") && (
            <Secao titulo={<><CalendarRange size={16} className="text-secundaria" /> Comparativo e fôlego de caixa</>}>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-texto-secundario">Receitas (mês vs anterior)</dt><dd className="font-semibold text-sucesso">{dinheiro(m.receitaMes)}</dd><dd className="text-[11px] text-texto-secundario">{varReceita !== null ? `${varReceita >= 0 ? "▲" : "▼"} ${Math.abs(varReceita).toFixed(0)}% (era ${dinheiro(m.receitaAnt)})` : "sem mês anterior"}</dd></div>
                <div><dt className="text-xs text-texto-secundario">Despesas (mês vs anterior)</dt><dd className="font-semibold text-erro">{dinheiro(m.despesaMes)}</dd><dd className="text-[11px] text-texto-secundario">{varDespesa !== null ? `${varDespesa >= 0 ? "▲" : "▼"} ${Math.abs(varDespesa).toFixed(0)}% (era ${dinheiro(m.despesaAnt)})` : "sem mês anterior"}</dd></div>
                <div><dt className="text-xs text-texto-secundario">Gasto médio por dia</dt><dd className="font-semibold text-texto-primario">{m.gastoDiario > 0 ? dinheiro(Math.round(m.gastoDiario)) : "—"}</dd><dd className="text-[11px] text-texto-secundario">{m.projecaoDespesa !== null ? `projeção do mês: ${dinheiro(m.projecaoDespesa)} (estimativa)` : "projeção a partir do dia 7"}</dd></div>
                <div><dt className="text-xs text-texto-secundario">Dias de caixa</dt><dd className="font-semibold text-texto-primario">{m.diasDeCaixa !== null ? `${m.diasDeCaixa} dia(s)` : "—"}</dd><dd className="text-[11px] text-texto-secundario">saldo das contas ÷ gasto diário</dd></div>
                <div className="col-span-2"><dt className="flex items-center gap-1 text-xs text-texto-secundario"><PiggyBank size={12} /> Reserva de emergência</dt><dd className="font-semibold text-texto-primario">{m.mesesReserva !== null ? `${m.mesesReserva.toFixed(1)} mês(es) de gastos` : "Crie uma meta do tipo “Reserva de emergência”"}</dd>{m.mesesReserva !== null && <dd className="mt-1"><BarraProgresso percentual={(m.mesesReserva / 6) * 100} cor="var(--cor-sucesso)" altura={5} /></dd>}</div>
              </dl>
            </Secao>
          )}
          {visiveis.has("orcamento") && (
            <Secao titulo="Orçamento do mês" acao={<Link to="/orcamento" className="text-xs text-primaria hover:underline">Ver tudo</Link>}>
              {orcamentoOrdenado.length === 0 ? <p className="text-sm text-texto-secundario">Defina limites por categoria na aba Orçamento.</p> : (
                <ul className="space-y-3">
                  {orcamentoOrdenado.map(({ o, pct, gasto }) => {
                    const cor = pct >= 100 ? "#ff2d55" : pct >= 80 ? "var(--cor-alerta)" : "var(--cor-sucesso)";
                    const nome = nomeConta.get(o.categoria_id) ?? "";
                    return (
                      <li key={o.categoria_id}>
                        <div className="mb-1 flex justify-between text-xs"><span className="text-texto-primario">{nome}</span><span className="tabular-nums text-texto-secundario">{dinheiro(gasto)} / {dinheiro(o.limite_centavos)}</span></div>
                        <BarraProgresso percentual={pct} cor={cor} altura={6} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Secao>
          )}
        </div>
      )}

      {(visiveis.has("semana") || visiveis.has("maiores")) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visiveis.has("semana") && (
            <Secao titulo="Gastos por dia da semana (este mês)">
              <div className="flex h-28 items-end gap-2">
                {semana.map((v, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-20 w-full items-end"><div className="w-full rounded-t bg-gradient-to-t from-primaria/50 to-secundaria" style={{ height: `${Math.max(4, (v / maxSemana) * 100)}%`, opacity: v === 0 ? 0.25 : 1 }} title={formatarCentavos(v)} /></div>
                    <span className="text-[10px] text-texto-secundario">{DIAS[i]}</span>
                  </div>
                ))}
              </div>
              {semana.some((v) => v > 0) && <p className="mt-2 text-xs text-texto-secundario">Dia mais pesado: <strong className="text-texto-primario">{DIAS[semana.indexOf(maxSemana)]}</strong> ({dinheiro(maxSemana)}).</p>}
            </Secao>
          )}
          {visiveis.has("maiores") && (
            <Secao titulo="Maiores despesas do mês">
              {maiores.length === 0 ? <p className="text-sm text-texto-secundario">Nenhuma despesa neste mês.</p> : (
                <ul className="space-y-2">
                  {maiores.map(({ l, valor }) => {
                    const cat = dados.contas.find((c) => l.partidas.some((p) => p.conta_id === c.id) && c.tipo === "DESPESA");
                    return (
                      <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2.5"><IconeCoisa nome={l.descricao} tamanho={28} redondo padrao={cat ? iconeDaCategoria(cat.nome) : undefined} /><span className="min-w-0"><span className="block truncate text-texto-primario">{l.descricao}</span><span className="text-[11px] text-texto-secundario">{formatarDataISOParaBR(l.data).slice(0, 5)}{cat ? ` · ${cat.nome}` : ""}</span></span></span>
                        <span className="shrink-0 tabular-nums font-semibold text-erro">{dinheiro(valor)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Secao>
          )}
        </div>
      )}
    </div>
  );
}
