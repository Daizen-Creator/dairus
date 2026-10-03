import { useState } from "react";
import { Activity, ArrowDownUp, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Secao } from "../../components/ui/Campos";
import { extras } from "../../services/extras";
import { formatarCentavos } from "../../services/formato";
import type { Conta, Lancamento } from "../../types/accounting";
import { dreComparativa, fluxoDeCaixa, indicadores, saldosInvertidos } from "./analiseContabil";

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);

/** Indicadores, análise vertical/horizontal, fluxo de caixa, saldos invertidos e conferência das partidas. */
export function AbaAnalisesContabeis({ lancamentos, contas, inicio, fim }: { lancamentos: Lancamento[]; contas: Conta[]; inicio: string; fim: string }) {
  const [verificacao, setVerificacao] = useState<string[] | null>(null);
  const ind = indicadores(lancamentos, contas, inicio, fim);
  const despesas = dreComparativa(lancamentos, contas, "DESPESA", inicio, fim);
  const fluxo = fluxoDeCaixa(lancamentos, contas, inicio, fim);
  const invertidos = saldosInvertidos(lancamentos, contas, fim);
  const total = Math.max(1, ind.ativoTotal, ind.passivoTotal + Math.max(0, ind.patrimonioLiquido));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Secao titulo={<><Activity size={15} className="text-primaria" /> Indicadores</>}>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-texto-secundario">Liquidez corrente</dt><dd className="tabular-nums">{ind.liquidezCorrente === null ? "sem dívidas" : ind.liquidezCorrente.toFixed(2).replace(".", ",")}</dd></div>
            <div className="flex justify-between"><dt className="text-texto-secundario">Endividamento</dt><dd className="tabular-nums">{pct(ind.endividamento)}</dd></div>
            <div className="flex justify-between"><dt className="text-texto-secundario">Margem de poupança (período)</dt><dd className={`tabular-nums ${(ind.margemPoupanca ?? 0) < 0 ? "text-erro" : "text-sucesso"}`}>{pct(ind.margemPoupanca)}</dd></div>
            <div className="flex justify-between"><dt className="text-texto-secundario">Patrimônio líquido</dt><dd className="tabular-nums">{formatarCentavos(ind.patrimonioLiquido)}</dd></div>
          </dl>
          <p className="mt-2 text-[11px] text-texto-secundario">Liquidez acima de 1 = o dinheiro disponível cobre as dívidas. Endividamento = dívidas ÷ tudo o que você tem.</p>
        </Secao>
        <Secao titulo="Composição do balanço">
          <div className="flex h-36 items-end gap-4">
            <div className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t bg-primaria" style={{ height: `${(ind.ativoTotal / total) * 100}%` }} title={formatarCentavos(ind.ativoTotal)} />
              <span className="text-[11px] text-texto-secundario">Ativo</span>
            </div>
            <div className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-col justify-end" style={{ height: "100%" }}>
                <div className="w-full bg-sucesso" style={{ height: `${(Math.max(0, ind.patrimonioLiquido) / total) * 100}%` }} title={`PL ${formatarCentavos(ind.patrimonioLiquido)}`} />
                <div className="w-full rounded-b bg-erro" style={{ height: `${(ind.passivoTotal / total) * 100}%` }} title={`Passivo ${formatarCentavos(ind.passivoTotal)}`} />
              </div>
              <span className="text-[11px] text-texto-secundario">Passivo + PL</span>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-texto-secundario"><span className="text-erro">■</span> dívidas · <span className="text-sucesso">■</span> patrimônio líquido</p>
        </Secao>
        <Secao titulo={<><ArrowDownUp size={15} className="text-secundaria" /> Fluxo de caixa (período)</>}>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-texto-secundario">Entradas do dia a dia</dt><dd className="tabular-nums text-sucesso">{formatarCentavos(fluxo.entradasOperacionais)}</dd></div>
            <div className="flex justify-between"><dt className="text-texto-secundario">Saídas do dia a dia</dt><dd className="tabular-nums text-erro">{formatarCentavos(fluxo.saidasOperacionais)}</dd></div>
            <div className="flex justify-between"><dt className="text-texto-secundario">Investimentos</dt><dd className="tabular-nums">{formatarCentavos(fluxo.investimentos)}</dd></div>
            <div className="flex justify-between"><dt className="text-texto-secundario">Empréstimos e dívidas</dt><dd className="tabular-nums">{formatarCentavos(fluxo.financiamentos)}</dd></div>
            <div className="flex justify-between border-t border-borda pt-1 font-semibold"><dt>Variação do caixa</dt><dd className="tabular-nums">{formatarCentavos(fluxo.variacaoCaixa)}</dd></div>
          </dl>
        </Secao>
      </div>

      <Secao titulo="Despesas: análise vertical (% da receita) e horizontal (vs período anterior)">
        {despesas.length === 0 ? <p className="text-sm text-texto-secundario">Sem despesas no período.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-texto-secundario"><tr><th className="py-1">Conta</th><th className="text-right">Período</th><th className="text-right">Anterior</th><th className="text-right">Variação</th><th className="text-right">% da receita</th></tr></thead>
            <tbody>
              {despesas.map((l) => (
                <tr key={l.conta.id} className="border-t border-borda">
                  <td className="py-1.5">{l.conta.nome}</td>
                  <td className="text-right tabular-nums">{formatarCentavos(l.atual)}</td>
                  <td className="text-right tabular-nums text-texto-secundario">{formatarCentavos(l.anterior)}</td>
                  <td className={`text-right tabular-nums ${(l.variacao ?? 0) > 0 ? "text-erro" : "text-sucesso"}`}>{l.variacao === null ? "novo" : `${l.variacao > 0 ? "+" : ""}${(l.variacao * 100).toFixed(0)}%`}</td>
                  <td className="text-right tabular-nums">{pct(l.vertical)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Secao>

      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo={<><TriangleAlert size={15} className="text-alerta" /> Saldos com sinal invertido</>}>
          {invertidos.length === 0 ? <p className="text-sm text-texto-secundario">Nenhum: todas as contas estão do lado certo.</p> : (
            <ul className="space-y-1 text-sm">{invertidos.map((l) => <li key={l.conta.id} className="flex justify-between"><span>{l.conta.nome} <span className="text-xs text-texto-secundario">({l.conta.tipo === "ATIVO" ? "conta negativa" : "crédito a seu favor"})</span></span><span className="tabular-nums text-erro">{formatarCentavos(l.saldo)}</span></li>)}</ul>
          )}
        </Secao>
        <Secao titulo={<><ShieldCheck size={15} className="text-sucesso" /> Conferência das partidas dobradas</>}>
          <Button tamanho="pequeno" variante="secundaria" onClick={() => extras.verificarIntegridade().then(setVerificacao).catch((e) => toast.error(String(e)))}>Conferir agora</Button>
          {verificacao && (verificacao.length === 0 ? <p className="mt-2 text-sm text-sucesso">Tudo certo: débitos = créditos em todos os lançamentos e o banco está íntegro.</p> : <ul className="mt-2 list-disc pl-5 text-sm text-erro">{verificacao.map((p) => <li key={p}>{p}</li>)}</ul>)}
        </Secao>
      </div>
    </div>
  );
}
