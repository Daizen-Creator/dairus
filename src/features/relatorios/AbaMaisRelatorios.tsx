import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { BarraProgresso, Secao } from "../../components/ui/Campos";
import { formatarCentavos } from "../../services/formato";
import { lancExtras } from "../../services/lancamentosExtras";
import type { Conta, Lancamento } from "../../types/accounting";
import { compararMeses, fixosVariaveis, porDiaDoMes, porEstabelecimento, porEtiqueta, porMeioDePagamento, poupancaMensal, ticket, type Item } from "./maisRelatorios";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function Lista({ itens, vazio }: { itens: Item[]; vazio: string }) {
  if (!itens.length) return <p className="text-sm text-texto-secundario">{vazio}</p>;
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className="space-y-1.5 text-xs">
      {itens.slice(0, 12).map((i) => (
        <li key={i.chave} className="flex items-center gap-2">
          <span className="w-28 truncate text-texto-secundario" title={i.chave}>{i.chave}</span>
          <span className="flex-1"><BarraProgresso percentual={(i.valor / max) * 100} cor="var(--cor-primaria)" altura={5} /></span>
          <span className="w-24 text-right tabular-nums text-texto-primario">{formatarCentavos(i.valor)} <span className="text-texto-secundario">({i.qtd})</span></span>
        </li>
      ))}
    </ul>
  );
}

/** Dez relatórios extras sobre o período escolhido no topo da tela. */
export function AbaMaisRelatorios({ lancamentos, contas, inicio, fim, hoje }: { lancamentos: Lancamento[]; contas: Conta[]; inicio: string; fim: string; hoje: string }) {
  const [tags, setTags] = useState<Map<string, string[]>>(new Map());
  const mesAtual = hoje.slice(0, 7);
  const mesAnterior = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 2, 1)).toISOString().slice(0, 7);
  const [mesA, setMesA] = useState(mesAnterior);
  const [mesB, setMesB] = useState(mesAtual);
  useEffect(() => {
    lancExtras.listarTags().then((t) => {
      const m = new Map<string, string[]>();
      for (const x of t) m.set(x.lancamento_id, [...(m.get(x.lancamento_id) ?? []), x.tag]);
      setTags(m);
    }).catch(() => {});
  }, []);

  const tk = ticket(lancamentos, contas, inicio, fim);
  const fv = fixosVariaveis(lancamentos, contas, inicio, fim);
  const dias = porDiaDoMes(lancamentos, contas, inicio, fim);
  const maxDia = Math.max(1, ...dias);
  const poup = poupancaMensal(lancamentos, contas, hoje);
  const comp = compararMeses(lancamentos, contas, mesA, mesB);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[["Compras no período", String(tk.compras)], ["Total gasto", formatarCentavos(tk.total)], ["Ticket médio", formatarCentavos(tk.medio)], ["Média por dia", formatarCentavos(tk.porDia)], ["Maior compra", formatarCentavos(tk.maior)]].map(([r, v]) => (
          <div key={r} className="rounded-xl border border-borda bg-cartao p-3"><p className="text-xs text-texto-secundario">{r}</p><p className="text-lg font-bold tabular-nums text-texto-primario">{v}</p></div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Secao titulo="Onde mais gastou (estabelecimentos)"><Lista itens={porEstabelecimento(lancamentos, contas, inicio, fim)} vazio="Sem despesas no período." /></Secao>
        <Secao titulo="Por conta ou cartão usado"><Lista itens={porMeioDePagamento(lancamentos, contas, inicio, fim)} vazio="Sem despesas no período." /></Secao>
        <Secao titulo="Por etiqueta (#tags)"><Lista itens={porEtiqueta(lancamentos, contas, inicio, fim, tags)} vazio="Nenhuma despesa com #tag no período." /></Secao>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Gastos por dia do mês">
          <div className="flex h-28 items-end gap-0.5" aria-label="Gastos por dia do mês">
            {dias.map((v, i) => <div key={i} title={`Dia ${i + 1}: ${formatarCentavos(v)}`} className="flex-1 rounded-t bg-erro/70" style={{ height: `${Math.max(2, (v / maxDia) * 100)}%` }} />)}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-texto-secundario"><span>1</span><span>10</span><span>20</span><span>31</span></div>
          <p className="mt-1 text-xs text-texto-secundario">Dia com mais gasto: {dias.indexOf(Math.max(...dias)) + 1}.</p>
        </Secao>
        <Secao titulo="Fixos x variáveis">
          <p className="text-sm">Fixos (assinaturas, mensalidades, contas agendadas): <strong>{formatarCentavos(fv.fixos)}</strong></p>
          <p className="text-sm">Variáveis (dia a dia): <strong>{formatarCentavos(fv.variaveis)}</strong></p>
          <div className="mt-2 flex h-3 overflow-hidden rounded-full">
            <div className="bg-secundaria" style={{ width: `${(fv.fixos / Math.max(1, fv.fixos + fv.variaveis)) * 100}%` }} />
            <div className="flex-1 bg-alerta" />
          </div>
          <p className="mt-1 text-xs text-texto-secundario">{Math.round((fv.fixos / Math.max(1, fv.fixos + fv.variaveis)) * 100)}% do gasto é fixo. Fixos altos deixam pouca folga: veja se alguma assinatura pode sair.</p>
        </Secao>
      </div>
      <Secao titulo={<><BarChart3 size={15} className="text-sucesso" /> Taxa de poupança mês a mês</>}>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
          {poup.map((p) => (
            <div key={p.mes} className="text-center" title={`Receitas ${formatarCentavos(p.receitas)} · despesas ${formatarCentavos(p.despesas)}`}>
              <div className="flex h-20 items-end"><div className={`w-full rounded-t ${p.taxa !== null && p.taxa < 0 ? "bg-erro" : "bg-sucesso"}`} style={{ height: `${Math.min(100, Math.max(3, Math.abs(p.taxa ?? 0) * 100))}%` }} /></div>
              <p className="text-[10px] text-texto-secundario">{MESES[Number(p.mes.slice(5, 7)) - 1]}</p>
              <p className="text-[10px] tabular-nums">{p.taxa === null ? "—" : `${Math.round(p.taxa * 100)}%`}</p>
            </div>
          ))}
        </div>
      </Secao>
      <Secao titulo="Comparar dois meses">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <input type="month" value={mesA} onChange={(e) => setMesA(e.target.value)} aria-label="Primeiro mês" className="rounded-lg border border-borda bg-fundo px-2 py-1 text-texto-primario" />
          <span className="text-texto-secundario">x</span>
          <input type="month" value={mesB} onChange={(e) => setMesB(e.target.value)} aria-label="Segundo mês" className="rounded-lg border border-borda bg-fundo px-2 py-1 text-texto-primario" />
        </div>
        {comp.length === 0 ? <p className="text-sm text-texto-secundario">Sem despesas nesses meses.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-texto-secundario"><tr><th className="py-1">Categoria</th><th className="text-right">{mesA}</th><th className="text-right">{mesB}</th><th className="text-right">Diferença</th></tr></thead>
            <tbody>{comp.map((c) => <tr key={c.categoria} className="border-t border-borda"><td className="py-1">{c.categoria}</td><td className="text-right tabular-nums">{formatarCentavos(c.a)}</td><td className="text-right tabular-nums">{formatarCentavos(c.b)}</td><td className={`text-right tabular-nums ${c.b > c.a ? "text-erro" : "text-sucesso"}`}>{c.b - c.a > 0 ? "+" : ""}{formatarCentavos(c.b - c.a)}</td></tr>)}</tbody>
          </table>
        )}
      </Secao>
    </div>
  );
}
