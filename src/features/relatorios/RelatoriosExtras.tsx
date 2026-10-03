import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarPlus, Download, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { col, exportarXlsx } from "../../services/exportacao";
import { extras } from "../../services/extras";
import { despesasPorCategoriaNoMes } from "../../services/agregacoes";
import { formatarCentavos, formatarDataISOParaBR } from "../../services/formato";
import { gerarIcs, type EventoCalendario } from "../../services/calendarioIcs";
import { planejamento } from "../../services/planejamento";
import { preverSaldo, type Previsao } from "../../services/previsao";
import type { Agendamento, Conta, Lancamento } from "../../types/accounting";
import type { Bem } from "../../types/extras";
import { comprasDoCartao } from "../contas/CartoesPage";
import { calcularCiclo } from "../contas/ciclo";
import { montarPacoteIR } from "./pacoteIR";

const R = formatarCentavos;
const tooltip = { background: "var(--cor-superficie)", border: "1px solid var(--cor-borda)", borderRadius: 8, fontSize: 12 };

/** Dados para a previsão (inclui parcelas de empréstimo e compras de cartão em parcelas). */
export async function calcularPrevisao(hoje: string, dias = 90): Promise<Previsao> {
  const [contas, lancamentos, agendamentos, emprestimos] = await Promise.all([
    contabilidade.listarContas(),
    contabilidade.listarLancamentos(5000),
    contabilidade.listarAgendamentos(),
    planejamento.listarEmprestimos().catch(() => []),
  ]);
  const porId = new Map(contas.map((c) => [c.id, c]));
  const comprasCartao = new Map(
    contas.filter((c) => c.subtipo === "CARTAO_CREDITO").map((c) => [c.id, comprasDoCartao(c, lancamentos, porId).map((x) => ({ data: x.data, valor: x.valor }))]),
  );
  const parcelas = emprestimos.flatMap((e) => e.tabela.filter((p) => !e.pagas.includes(p.numero)).map((p) => ({ data: p.vencimento, valor: p.parcela, descricao: `Parcela ${e.nome}` })));
  return preverSaldo({ hoje, dias, contas, lancamentos, agendamentos, parcelas, comprasCartao });
}

export function AbaPrevisao({ hoje }: { hoje: string }) {
  const [p, setP] = useState<Previsao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    calcularPrevisao(hoje).then(setP).catch((e) => setErro(String(e)));
  }, [hoje]);
  if (erro) return <p className="text-sm text-erro">{erro}</p>;
  if (!p) return <p className="text-sm text-texto-secundario">Calculando…</p>;
  const dados = p.serie.map((x) => ({ data: formatarDataISOParaBR(x.data).slice(0, 5), saldo: x.saldo / 100 }));
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-borda bg-fundo/60 px-3 py-2 text-xs text-texto-secundario">
        <strong>Estimativa.</strong> Parte do saldo de hoje nas contas e soma contas agendadas, receitas, faturas de cartão, parcelas de empréstimo e o seu gasto médio do dia a dia ({R(p.gastoDiario)}/dia, últimos 90 dias). Não é garantia: imprevistos e gastos novos mudam o resultado.
      </p>
      {p.primeiroNegativo && (
        <div className="flex items-start gap-2 rounded-lg border border-erro/50 bg-erro/10 px-3 py-2 text-sm text-texto-primario">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-erro" />
          Nesse ritmo, o saldo fica negativo em <strong>{formatarDataISOParaBR(p.primeiroNegativo)}</strong>. O ponto mais baixo é {R(p.minimo.saldo)} em {formatarDataISOParaBR(p.minimo.data)}.
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        {[["Hoje", p.saldoInicial], ["Em 30 dias", p.em30], ["Em 60 dias", p.em60], ["Em 90 dias", p.em90]].map(([t, v]) => (
          <div key={t as string} className="rounded-xl border border-borda bg-cartao p-3">
            <p className="text-xs text-texto-secundario">{t as string}</p>
            <p className={`text-lg font-semibold tabular-nums ${(v as number) < 0 ? "text-erro" : "text-texto-primario"}`}>{R(v as number)}</p>
          </div>
        ))}
      </div>
      <Secao titulo="Saldo previsto dia a dia">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dados}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cor-borda)" />
              <XAxis dataKey="data" tick={{ fontSize: 11, fill: "var(--cor-texto-secundario)" }} minTickGap={28} />
              <YAxis tick={{ fontSize: 11, fill: "var(--cor-texto-secundario)" }} />
              <Tooltip formatter={(v) => R(Number(v) * 100)} contentStyle={tooltip} />
              <ReferenceLine y={0} stroke="var(--cor-erro)" strokeDasharray="4 4" />
              <Area dataKey="saldo" name="Saldo previsto" stroke="var(--cor-primaria)" fill="var(--cor-primaria)" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Secao>
      <Secao titulo="Próximos eventos considerados">
        <ul className="max-h-72 space-y-1 overflow-auto text-sm">
          {p.eventos.slice(0, 60).map((e, i) => (
            <li key={i} className="flex justify-between gap-2"><span className="text-texto-secundario">{formatarDataISOParaBR(e.data)} · {e.descricao}</span><span className={`tabular-nums ${e.valor < 0 ? "text-erro" : "text-sucesso"}`}>{R(e.valor)}</span></li>
          ))}
        </ul>
      </Secao>
    </div>
  );
}

/** Eventos de calendário: agenda, faturas e parcelas dos próximos 12 meses. */
export async function eventosDoCalendario(hoje: string): Promise<EventoCalendario[]> {
  const [contas, agendamentos, emprestimos] = await Promise.all([contabilidade.listarContas(), contabilidade.listarAgendamentos(), planejamento.listarEmprestimos().catch(() => [])]);
  const eventos: EventoCalendario[] = agendamentos
    .filter((a: Agendamento) => !a.pago_em)
    .map((a) => ({ id: `ag-${a.id}`, data: a.vencimento, titulo: `${a.tipo === "RECEBER" ? "Receber" : "Pagar"}: ${a.descricao} (${R(a.valor_centavos)})`, descricao: a.recorrencia ? `Repete: ${a.recorrencia.toLowerCase()}` : undefined }));
  for (const c of contas.filter((x: Conta) => x.subtipo === "CARTAO_CREDITO" && x.ativa && x.dia_fechamento_fatura && x.dia_vencimento_fatura)) {
    for (let k = 0; k < 12; k++) {
      const ref = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1 + k, 15)).toISOString().slice(0, 10);
      const ciclo = calcularCiclo(c.dia_fechamento_fatura!, c.dia_vencimento_fatura!, ref);
      eventos.push({ id: `fatura-${c.id}-${ciclo.proximoVencimento}`, data: ciclo.proximoVencimento, titulo: `Vence a fatura do ${c.nome}` });
      eventos.push({ id: `fecha-${c.id}-${ciclo.proximoFechamento}`, data: ciclo.proximoFechamento, titulo: `Fecha a fatura do ${c.nome}` });
    }
  }
  for (const e of emprestimos) for (const p of e.tabela.filter((x) => !e.pagas.includes(x.numero)).slice(0, 12)) eventos.push({ id: `emp-${e.id}-${p.numero}`, data: p.vencimento, titulo: `Parcela ${p.numero} de ${e.nome} (${R(p.parcela)})` });
  const unicos = new Map(eventos.filter((e) => e.data >= hoje).map((e) => [e.id, e]));
  return [...unicos.values()].sort((a, b) => a.data.localeCompare(b.data));
}

export async function exportarCalendario(hoje: string): Promise<string> {
  const eventos = await eventosDoCalendario(hoje);
  return extras.salvarExportacao("dairus-vencimentos.ics", gerarIcs(eventos));
}

export function BotaoCalendario({ hoje }: { hoje: string }) {
  return (
    <Button
      tamanho="pequeno"
      variante="secundaria"
      onClick={() =>
        exportarCalendario(hoje)
          .then((c) => toast.success("Calendário salvo. Importe o arquivo .ics no Google Agenda (Configurações → Importar) ou abra no celular.", { description: c, duration: 10000 }))
          .catch((e) => toast.error(String(e)))
      }
    >
      <CalendarPlus size={13} /> Vencimentos no calendário (.ics)
    </Button>
  );
}

export function AbaImpostoRenda({ contas, lancamentos, hoje }: { contas: Conta[]; lancamentos: Lancamento[]; hoje: string }) {
  const anoPadrao = Number(hoje.slice(0, 4)) - (Number(hoje.slice(5, 7)) <= 5 ? 1 : 0);
  const [ano, setAno] = useState(anoPadrao);
  const [bens, setBens] = useState<Bem[]>([]);
  useEffect(() => {
    extras.listarBens().then(setBens).catch(() => {});
  }, []);
  const p = useMemo(() => montarPacoteIR(ano, contas, lancamentos, bens), [ano, contas, lancamentos, bens]);
  const anos = [...new Set([anoPadrao, anoPadrao - 1, ...lancamentos.map((l) => Number(l.data.slice(0, 4)))])].sort((a, b) => b - a);

  async function exportar() {
    try {
      const caminho = await exportarXlsx(`imposto-de-renda-${ano}`, [
        { nome: "Rendimentos", total: true, colunas: [col("Fonte", "TEXTO", 36), col("Valor no ano", "MOEDA")], linhas: p.rendimentos.map((r) => [r.nome, r.valor]) },
        { nome: "Despesas dedutíveis", total: true, colunas: [col("Data", "DATA"), col("Descrição", "TEXTO", 40), col("Tipo", "TEXTO", 30), col("Valor", "MOEDA")], linhas: p.dedutiveis.flatMap((d) => d.lancamentos.map((l) => [l.data, l.descricao, d.nome.split(" (")[0], l.valor])) },
        { nome: "Contas (bens e direitos)", colunas: [col("Conta", "TEXTO", 30), col("Instituição", "TEXTO", 24), col(`31/12/${ano - 1}`, "MOEDA"), col(`31/12/${ano}`, "MOEDA")], linhas: p.contas.map((c) => [c.nome, c.instituicao ?? "", c.anterior, c.atual]) },
        { nome: "Bens", colunas: [col("Bem", "TEXTO", 36), col("Data de aquisição", "DATA"), col("Valor de aquisição", "MOEDA")], linhas: p.bens.map((b) => [b.nome, b.data, b.aquisicao]) },
        { nome: "Dívidas", colunas: [col("Dívida", "TEXTO", 36), col(`31/12/${ano - 1}`, "MOEDA"), col(`31/12/${ano}`, "MOEDA")], linhas: p.dividas.map((d) => [d.nome, d.anterior, d.atual]) },
      ]);
      toast.success(`Arquivo salvo em ${caminho}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select aria-label="Ano-calendário" value={String(ano)} onValueChange={(v) => setAno(Number(v))} options={anos.map((a) => ({ value: String(a), label: `Ano-calendário ${a} (declaração ${a + 1})` }))} className="w-80" />
        <Button tamanho="pequeno" variante="secundaria" onClick={exportar}><Download size={13} /> Exportar pacote (.xlsx)</Button>
      </div>
      {p.avisos.length > 0 && <ul className="list-inside list-disc rounded-lg border border-borda bg-fundo/60 px-4 py-2 text-xs text-texto-secundario">{p.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Rendimentos registrados">
          {p.rendimentos.length === 0 ? <p className="text-sm text-texto-secundario">Nada no ano.</p> : <ul className="space-y-1 text-sm">{p.rendimentos.map((r) => <li key={r.nome} className="flex justify-between"><span>{r.nome}</span><span className="tabular-nums">{R(r.valor)}</span></li>)}</ul>}
          <p className="mt-2 text-[11px] text-texto-secundario">Rendimentos de investimentos (dividendos, JCP, vendas) estão em Investimentos → Impostos.</p>
        </Secao>
        <Secao titulo="Despesas dedutíveis">
          {p.dedutiveis.length === 0 ? <p className="text-sm text-texto-secundario">Nenhuma despesa de saúde ou educação no ano.</p> : p.dedutiveis.map((d) => (
            <div key={d.nome} className="mb-2">
              <p className="flex justify-between text-sm"><span>{d.nome}</span><strong className="tabular-nums">{R(d.valor)}</strong></p>
              <ul className="mt-1 max-h-32 overflow-auto text-xs text-texto-secundario">{d.lancamentos.map((l, i) => <li key={i} className="flex justify-between"><span>{formatarDataISOParaBR(l.data)} · {l.descricao}</span><span className="tabular-nums">{R(l.valor)}</span></li>)}</ul>
            </div>
          ))}
          <p className="mt-1 text-[11px] text-texto-secundario">Guarde os recibos (com CPF/CNPJ de quem prestou o serviço): dá para anexá-los aos lançamentos.</p>
        </Secao>
        <Secao titulo="Contas em 31/12">
          {p.contas.length === 0 ? <p className="text-sm text-texto-secundario">Sem contas com saldo.</p> : <ul className="space-y-1 text-sm">{p.contas.map((c) => <li key={c.nome} className="flex justify-between gap-2"><span>{c.nome}</span><span className="tabular-nums text-texto-secundario">{R(c.anterior)} → <strong className="text-texto-primario">{R(c.atual)}</strong></span></li>)}</ul>}
        </Secao>
        <Secao titulo="Bens, dívidas e valores a receber">
          <ul className="space-y-1 text-sm">
            {p.bens.map((b) => <li key={b.nome} className="flex justify-between"><span>{b.nome}</span><span className="tabular-nums">{b.aquisicao ? R(b.aquisicao) : "valor de aquisição não informado"}</span></li>)}
            {p.dividas.map((d) => <li key={d.nome} className="flex justify-between"><span>Dívida: {d.nome}</span><span className="tabular-nums">{R(d.anterior)} → {R(d.atual)}</span></li>)}
            {(p.aReceber.anterior || p.aReceber.atual) ? <li className="flex justify-between"><span>A receber de pessoas</span><span className="tabular-nums">{R(p.aReceber.anterior)} → {R(p.aReceber.atual)}</span></li> : null}
          </ul>
          {!p.bens.length && !p.dividas.length && <p className="text-sm text-texto-secundario">Nada cadastrado.</p>}
        </Secao>
      </div>
    </div>
  );
}

/** Comparativo de um ano contra o anterior, por categoria. */
export function AbaAnoAno({ contas, lancamentos, hoje }: { contas: Conta[]; lancamentos: Lancamento[]; hoje: string }) {
  const anoAtual = Number(hoje.slice(0, 4));
  const [ano, setAno] = useState(anoAtual);
  // Ano corrente: compara até o mesmo dia do ano anterior (comparação justa).
  const ateDia = ano === anoAtual ? hoje.slice(5) : "12-31";
  const atual = new Map(despesasPorCategoriaNoMes(lancamentos, contas, `${ano}-01-01`, `${ano}-${ateDia}`).map((c) => [c.nome, c.valorCentavos]));
  const anterior = new Map(despesasPorCategoriaNoMes(lancamentos, contas, `${ano - 1}-01-01`, `${ano - 1}-${ateDia}`).map((c) => [c.nome, c.valorCentavos]));
  const nomes = [...new Set([...atual.keys(), ...anterior.keys()])];
  const linhas = nomes.map((n) => ({ n, a: atual.get(n) ?? 0, b: anterior.get(n) ?? 0 })).sort((x, y) => y.a - x.a);
  const tot = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);
  const destaques = linhas.filter((l) => l.b > 0 && Math.abs(l.a - l.b) / l.b >= 0.1).slice(0, 4);
  const anos = [...new Set([anoAtual, ...lancamentos.map((l) => Number(l.data.slice(0, 4)))])].sort((a, b) => b - a);
  return (
    <div className="space-y-4">
      <Select aria-label="Ano" value={String(ano)} onValueChange={(v) => setAno(Number(v))} options={anos.map((a) => ({ value: String(a), label: `${a} vs ${a - 1}` }))} className="w-40" />
      {destaques.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-borda bg-fundo/60 px-4 py-2 text-sm">
          {destaques.map((d) => <li key={d.n}>Em {ano} você gastou <strong>{Math.abs(Math.round(((d.a - d.b) / d.b) * 100))}% {d.a < d.b ? "menos" : "mais"}</strong> com {d.n.toLowerCase()} que em {ano - 1}{ano === anoAtual ? " (até a mesma data)" : ""}.</li>)}
        </ul>
      )}
      <Secao titulo={`Despesas por categoria: ${ano} × ${ano - 1}${ano === anoAtual ? " (até hoje)" : ""}`}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-texto-secundario"><tr><th className="py-1.5">Categoria</th><th className="text-right">{ano - 1}</th><th className="text-right">{ano}</th><th className="text-right">Variação</th></tr></thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.n} className="border-t border-borda"><td className="py-1.5">{l.n}</td><td className="text-right tabular-nums">{R(l.b)}</td><td className="text-right tabular-nums">{R(l.a)}</td><td className={`text-right tabular-nums ${l.a > l.b ? "text-erro" : "text-sucesso"}`}>{l.b ? `${l.a >= l.b ? "+" : ""}${Math.round(((l.a - l.b) / l.b) * 100)}%` : "novo"}</td></tr>
            ))}
            <tr className="border-t border-borda font-semibold"><td className="py-1.5">Total</td><td className="text-right tabular-nums">{R(tot(anterior))}</td><td className="text-right tabular-nums">{R(tot(atual))}</td><td /></tr>
          </tbody>
        </table>
      </Secao>
    </div>
  );
}
