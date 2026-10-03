import { useEffect, useMemo, useState } from "react";
import { Download, Info, Plus, Printer, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Abas } from "../../components/ui/Abas";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { contabilidade } from "../../services/contabilidade";
import { usePreferencia } from "../../state/usePreferencia";
import { exportarCsv, reais } from "../../services/exportacao";
import { extras } from "../../services/extras";
import { opcoesCategoria } from "../../services/categorias";
import { dataAtualISO, formatarCentavos, formatarDataISOParaBR, valorInputParaCentavos } from "../../services/formato";
import { balancete, razaoDaConta, resultadoPorTipo } from "../../services/relatorios";
import { calcularPeriodo, SeletorPeriodo, type Periodo } from "../dashboard/SeletorPeriodo";
import type { Conta, Lancamento, TipoConta } from "../../types/accounting";
import type { RegistroAuditoria } from "../../types/extras";
import { AbaAnalisesContabeis } from "./AbaAnalisesContabeis";

type Aba = "balancete" | "balanco" | "dre" | "analises" | "diario" | "razao" | "plano" | "manual" | "auditoria";

const ABAS: Array<{ id: Aba; rotulo: string }> = [
  { id: "balancete", rotulo: "Balancete" },
  { id: "balanco", rotulo: "Balanço patrimonial" },
  { id: "dre", rotulo: "Receitas e despesas" },
  { id: "analises", rotulo: "Indicadores e fluxo" },
  { id: "diario", rotulo: "Livro diário" },
  { id: "razao", rotulo: "Razão" },
  { id: "plano", rotulo: "Plano de contas" },
  { id: "manual", rotulo: "Lançamento manual" },
  { id: "auditoria", rotulo: "Auditoria" },
];

const TIPO_ROTULO: Record<string, string> = { ATIVO: "Ativo", PASSIVO: "Passivo", PATRIMONIO: "Patrimônio", RECEITA: "Receita", DESPESA: "Despesa" };
const ORDEM_TIPO: TipoConta[] = ["ATIVO", "PASSIVO", "PATRIMONIO", "RECEITA", "DESPESA"];

function Linha({ rotulo, valor, forte, cor, recuo }: { rotulo: string; valor: number; forte?: boolean; cor?: string; recuo?: boolean }) {
  return (
    <div className={`flex justify-between py-1.5 text-sm ${forte ? "border-t border-borda font-semibold" : ""} ${recuo ? "pl-4" : ""}`}>
      <span className="text-texto-primario">{rotulo}</span>
      <span className="tabular-nums" style={{ color: cor ?? "var(--cor-texto-primario)" }}>{formatarCentavos(valor)}</span>
    </div>
  );
}

interface PartidaManual {
  conta: string;
  tipo: "DEBITO" | "CREDITO";
  valor: string;
}

export function ContabilidadePage() {
  const [aba, setAba] = useState<Aba>("balancete");
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [auditoria, setAuditoria] = useState<RegistroAuditoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const hoje = dataAtualISO();
  const [periodo, setPeriodo] = useState<Periodo>(() => calcularPeriodo("este-mes", hoje));
  const [contaRazaoId, setContaRazaoId] = useState("");
  const [buscaDiario, setBuscaDiario] = useState("");
  const [buscaPlano, setBuscaPlano] = useState("");
  const [posicao, setPosicao] = useState(hoje);
  const [verArquivadas, setVerArquivadas] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState({ nome: "", tipo: "DESPESA" as "DESPESA" | "RECEITA", pai: "" });
  const [manual, setManual] = useState({ data: hoje, descricao: "", observacao: "" });
  const [modelosContabeis, setModelosContabeis] = usePreferencia<Array<{ nome: string; partidas: PartidaManual[] }>>("modelos_contabeis", []);
  const [partidas, setPartidas] = useState<PartidaManual[]>([
    { conta: "", tipo: "DEBITO", valor: "" },
    { conta: "", tipo: "CREDITO", valor: "" },
  ]);

  async function carregar() {
    try {
      const [c, l, a] = await Promise.all([contabilidade.listarContas(), contabilidade.listarLancamentos(5000), extras.listarAuditoria(200)]);
      setContas(c);
      setLancamentos(l);
      setAuditoria(a);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const nomeConta = useMemo(() => new Map(contas.map((c) => [c.id, c.nome])), [contas]);

  if (carregando) return <Skeleton className="h-72 w-full" />;

  const contasPostaveis = contas.filter((c) => c.subtipo !== "CATEGORIA" && c.ativa);

  // Balancete com saldo anterior, movimento do período e saldo final.
  const antesDoPeriodo = balancete(lancamentos, contas, diaAnterior(periodo.inicio));
  const ateFim = balancete(lancamentos, contas, periodo.fim);
  const saldoAntes = new Map(antesDoPeriodo.map((l) => [l.conta.id, l.saldo]));
  const movimento = balancete(lancamentos.filter((l) => l.data >= periodo.inicio && l.data <= periodo.fim), contas);
  const movPorConta = new Map(movimento.map((l) => [l.conta.id, l]));
  const linhasBalancete = ateFim.map((l) => ({ ...l, anterior: saldoAntes.get(l.conta.id) ?? 0, mDeb: movPorConta.get(l.conta.id)?.debitos ?? 0, mCred: movPorConta.get(l.conta.id)?.creditos ?? 0 }));
  const totalMDeb = linhasBalancete.reduce((s, l) => s + l.mDeb, 0);
  const totalMCred = linhasBalancete.reduce((s, l) => s + l.mCred, 0);
  const totalDebitos = ateFim.reduce((s, l) => s + l.debitos, 0);
  const totalCreditos = ateFim.reduce((s, l) => s + l.creditos, 0);

  // Balanço na data de posição (qualquer data).
  const posicaoSaldos = new Map(balancete(lancamentos, contas, posicao).map((l) => [l.conta.id, l.saldo]));
  const saldoEm = (tipo: TipoConta) => contas.filter((c) => c.tipo === tipo && c.subtipo !== "CATEGORIA" && (posicaoSaldos.get(c.id) ?? 0) !== 0);
  const somaEm = (lista: Conta[]) => lista.reduce((s, c) => s + (posicaoSaldos.get(c.id) ?? 0), 0);
  const ativosB = saldoEm("ATIVO");
  const passivosB = saldoEm("PASSIVO");
  const patrimoniosB = saldoEm("PATRIMONIO");
  const receitasB = somaEm(contas.filter((c) => c.tipo === "RECEITA" && c.subtipo !== "CATEGORIA"));
  const despesasB = somaEm(contas.filter((c) => c.tipo === "DESPESA" && c.subtipo !== "CATEGORIA"));
  const resultadoB = receitasB - despesasB;
  const totalAtivo = somaEm(ativosB);
  const totalPassivoPL = somaEm(passivosB) + somaEm(patrimoniosB) + resultadoB;
  const liquidezCorrente = somaEm(passivosB) > 0 ? totalAtivo / somaEm(passivosB) : null;
  const endividamento = totalAtivo > 0 ? (somaEm(passivosB) / totalAtivo) * 100 : null;
  const plLiquido = totalAtivo - somaEm(passivosB);

  // DRE com comparação ao período anterior.
  const diasPer = Math.round((Date.UTC(+periodo.fim.slice(0, 4), +periodo.fim.slice(5, 7) - 1, +periodo.fim.slice(8, 10)) - Date.UTC(+periodo.inicio.slice(0, 4), +periodo.inicio.slice(5, 7) - 1, +periodo.inicio.slice(8, 10))) / 86_400_000) + 1;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const iniMs = Date.UTC(+periodo.inicio.slice(0, 4), +periodo.inicio.slice(5, 7) - 1, +periodo.inicio.slice(8, 10));
  const antIni = iso(iniMs - diasPer * 86_400_000);
  const antFim = iso(iniMs - 86_400_000);
  const receitas = resultadoPorTipo(lancamentos, contas, "RECEITA", periodo.inicio, periodo.fim);
  const despesas = resultadoPorTipo(lancamentos, contas, "DESPESA", periodo.inicio, periodo.fim);
  const receitasAnt = new Map(resultadoPorTipo(lancamentos, contas, "RECEITA", antIni, antFim).map((r) => [r.conta.id, r.valor]));
  const despesasAnt = new Map(resultadoPorTipo(lancamentos, contas, "DESPESA", antIni, antFim).map((r) => [r.conta.id, r.valor]));
  const totalReceitas = receitas.reduce((s, r) => s + r.valor, 0);
  const totalDespesas = despesas.reduce((s, r) => s + r.valor, 0);
  const totalReceitasAnt = [...receitasAnt.values()].reduce((s, v) => s + v, 0);
  const totalDespesasAnt = [...despesasAnt.values()].reduce((s, v) => s + v, 0);
  const resultado = totalReceitas - totalDespesas;
  const margem = totalReceitas > 0 ? (resultado / totalReceitas) * 100 : null;

  // Diário
  const termo = buscaDiario.trim().toLowerCase();
  const diario = lancamentos
    .filter((l) => l.data >= periodo.inicio && l.data <= periodo.fim)
    .filter((l) => !termo || `${l.descricao} ${l.observacao ?? ""} ${l.partidas.map((p) => nomeConta.get(p.conta_id)).join(" ")}`.toLowerCase().includes(termo))
    .sort((a, b) => a.data.localeCompare(b.data));

  // Razão
  const contaRazao = contasPostaveis.find((c) => c.id === (contaRazaoId || contasPostaveis[0]?.id)) ?? null;
  const razao = contaRazao ? razaoDaConta(lancamentos, contaRazao, periodo.inicio, periodo.fim) : null;
  const totalRazaoDeb = razao?.linhas.reduce((s, l) => s + l.debito, 0) ?? 0;
  const totalRazaoCred = razao?.linhas.reduce((s, l) => s + l.credito, 0) ?? 0;

  // Plano de contas
  const termoPlano = buscaPlano.trim().toLowerCase();
  const plano = contas
    .filter((c) => (verArquivadas ? true : c.ativa))
    .filter((c) => !termoPlano || `${c.codigo} ${c.nome}`.toLowerCase().includes(termoPlano))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));

  // Lançamento manual
  const somaD = partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + valorInputParaCentavos(p.valor), 0);
  const somaC = partidas.filter((p) => p.tipo === "CREDITO").reduce((s, p) => s + valorInputParaCentavos(p.valor), 0);
  const equilibrado = somaD > 0 && somaD === somaC;

  async function registrarManual(ev: React.FormEvent) {
    ev.preventDefault();
    if (!manual.descricao.trim()) return toast.error("Informe a descrição.");
    if (!equilibrado) return toast.error("Débitos e créditos precisam ser iguais e maiores que zero.");
    const validas = partidas.filter((p) => p.conta && valorInputParaCentavos(p.valor) > 0);
    if (validas.length < 2) return toast.error("Informe ao menos duas partidas com conta e valor.");
    try {
      await contabilidade.criarLancamento({
        data: manual.data,
        descricao: manual.descricao.trim(),
        observacao: manual.observacao.trim() || null,
        partidas: validas.map((p) => ({ conta_id: p.conta, tipo: p.tipo, valor_centavos: valorInputParaCentavos(p.valor) })),
      });
      toast.success("Lançamento contábil registrado.");
      setManual({ data: hoje, descricao: "", observacao: "" });
      setPartidas([{ conta: "", tipo: "DEBITO", valor: "" }, { conta: "", tipo: "CREDITO", valor: "" }]);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function criarCategoria(ev: React.FormEvent) {
    ev.preventDefault();
    try {
      await extras.criarCategoria(novaCategoria.nome, novaCategoria.tipo, novaCategoria.pai || null);
      setNovaCategoria({ ...novaCategoria, nome: "" });
      toast.success("Categoria criada.");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function exportar(acao: () => Promise<string>) {
    try {
      toast.success(`Arquivo salvo em ${await acao()}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  const exportarAtual = () => {
    switch (aba) {
      case "balancete":
        return exportarCsv("balancete", ["Código", "Conta", "Tipo", "Saldo anterior (R$)", "Débitos no período (R$)", "Créditos no período (R$)", "Saldo final (R$)"], linhasBalancete.map((l) => [l.conta.codigo, l.conta.nome, TIPO_ROTULO[l.conta.tipo], reais(l.anterior), reais(l.mDeb), reais(l.mCred), reais(l.saldo)]));
      case "balanco":
        return exportarCsv(`balanco-${posicao}`, ["Grupo", "Conta", "Saldo (R$)"], [...ativosB.map((c) => ["Ativo", c.nome, reais(posicaoSaldos.get(c.id) ?? 0)]), ...passivosB.map((c) => ["Passivo", c.nome, reais(posicaoSaldos.get(c.id) ?? 0)]), ...patrimoniosB.map((c) => ["Patrimônio", c.nome, reais(posicaoSaldos.get(c.id) ?? 0)]), ["Patrimônio", "Resultado acumulado", reais(resultadoB)]]);
      case "dre":
        return exportarCsv("resultado", ["Tipo", "Conta", "Período (R$)", "Período anterior (R$)"], [...receitas.map((r) => ["Receita", r.conta.nome, reais(r.valor), reais(receitasAnt.get(r.conta.id) ?? 0)]), ...despesas.map((r) => ["Despesa", r.conta.nome, reais(r.valor), reais(despesasAnt.get(r.conta.id) ?? 0)])]);
      case "diario":
        return exportarCsv("livro-diario", ["Data", "Histórico", "Conta", "Débito (R$)", "Crédito (R$)"], diario.flatMap((l) => l.partidas.map((p) => [formatarDataISOParaBR(l.data), l.descricao, nomeConta.get(p.conta_id) ?? p.conta_id, p.tipo === "DEBITO" ? reais(p.valor_centavos) : "", p.tipo === "CREDITO" ? reais(p.valor_centavos) : ""])));
      case "razao":
        return exportarCsv(`razao-${contaRazao?.nome ?? "conta"}`, ["Data", "Histórico", "Débito (R$)", "Crédito (R$)", "Saldo (R$)"], (razao?.linhas ?? []).map((l) => [formatarDataISOParaBR(l.lancamento.data), l.lancamento.descricao, l.debito ? reais(l.debito) : "", l.credito ? reais(l.credito) : "", reais(l.saldo)]));
      case "plano":
        return exportarCsv("plano-de-contas", ["Código", "Nome", "Tipo", "Ativa", "Saldo (R$)"], plano.map((c) => [c.codigo, c.nome, TIPO_ROTULO[c.tipo], c.ativa ? "sim" : "não", reais(c.saldo_atual_centavos)]));
      default:
        return exportarCsv("auditoria", ["Quando", "Ação", "Entidade", "ID"], auditoria.map((a) => [a.criado_em, a.acao, a.entidade, a.entidade_id]));
    }
  };

  const mostraPeriodo = aba === "balancete" || aba === "dre" || aba === "analises" || aba === "diario" || aba === "razao";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto-primario">Contabilidade</h1>
          <p className="text-sm text-texto-secundario">Relatórios do razão de partidas dobradas, calculados dos seus lançamentos.</p>
        </div>
        <div className="sem-impressao flex flex-wrap items-center gap-2">
          <Button tamanho="pequeno" variante="secundaria" onClick={() => window.print()}><Printer size={13} /> Imprimir / PDF</Button>
          {aba !== "manual" && <Button tamanho="pequeno" variante="secundaria" onClick={() => exportar(exportarAtual)}><Download size={13} /> CSV</Button>}
          {mostraPeriodo && <SeletorPeriodo periodo={periodo} hoje={hoje} onChange={setPeriodo} />}
        </div>
      </div>

      <Abas ativa={aba} onChange={setAba} abas={ABAS} />

      {aba === "balancete" && (
        <Secao titulo={`Balancete de verificação — ${formatarDataISOParaBR(periodo.inicio)} a ${formatarDataISOParaBR(periodo.fim)}`}>
          {linhasBalancete.length === 0 ? <p className="text-sm text-texto-secundario">Nenhum lançamento até esta data.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-borda text-left text-xs text-texto-secundario"><th className="py-2 pr-3">Código</th><th className="pr-3">Conta</th><th className="pr-3 text-right">Saldo anterior</th><th className="pr-3 text-right">Débitos</th><th className="pr-3 text-right">Créditos</th><th className="text-right">Saldo final</th></tr></thead>
                <tbody>
                  {ORDEM_TIPO.map((tipo) => {
                    const grupo = linhasBalancete.filter((l) => l.conta.tipo === tipo);
                    if (grupo.length === 0) return null;
                    return [
                      <tr key={`h-${tipo}`}><td colSpan={6} className="pt-3 text-[11px] font-semibold uppercase tracking-wide text-texto-secundario">{TIPO_ROTULO[tipo]}</td></tr>,
                      ...grupo.map((l) => (
                        <tr key={l.conta.id} className="border-b border-borda/60">
                          <td className="py-2 pr-3 text-texto-secundario">{l.conta.codigo}</td>
                          <td className="pr-3"><button onClick={() => { setContaRazaoId(l.conta.id); setAba("razao"); }} className="text-left text-texto-primario hover:text-primaria hover:underline" title="Ver razão desta conta">{l.conta.nome}</button></td>
                          <td className="pr-3 text-right tabular-nums text-texto-secundario">{formatarCentavos(l.anterior)}</td>
                          <td className="pr-3 text-right tabular-nums">{l.mDeb ? formatarCentavos(l.mDeb) : ""}</td>
                          <td className="pr-3 text-right tabular-nums">{l.mCred ? formatarCentavos(l.mCred) : ""}</td>
                          <td className="text-right tabular-nums">{formatarCentavos(l.saldo)}</td>
                        </tr>
                      )),
                    ];
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-semibold"><td colSpan={3} className="py-2 text-texto-primario">Movimento do período</td><td className="pr-3 text-right tabular-nums">{formatarCentavos(totalMDeb)}</td><td className="pr-3 text-right tabular-nums">{formatarCentavos(totalMCred)}</td><td className="text-right text-xs" style={{ color: totalMDeb === totalMCred ? "var(--cor-sucesso)" : "#ff2d55" }}>{totalMDeb === totalMCred ? "Débitos = Créditos ✓" : "Divergência!"}</td></tr>
                  <tr className="text-xs text-texto-secundario"><td colSpan={3} className="py-1">Acumulado até {formatarDataISOParaBR(periodo.fim)}</td><td className="pr-3 text-right tabular-nums">{formatarCentavos(totalDebitos)}</td><td className="pr-3 text-right tabular-nums">{formatarCentavos(totalCreditos)}</td><td /></tr>
                </tfoot>
              </table>
              <p className="mt-2 text-[11px] text-texto-secundario">Clique no nome de uma conta para abrir o razão dela.</p>
            </div>
          )}
        </Secao>
      )}

      {aba === "balanco" && (
        <>
          <div className="sem-impressao flex items-center gap-2 text-sm text-texto-secundario">
            Posição em
            <input type="date" value={posicao} onChange={(e) => setPosicao(e.target.value || hoje)} aria-label="Data da posição" className={CLASSE_INPUT} />
            <Button tamanho="pequeno" variante="fantasma" onClick={() => setPosicao(hoje)}>Hoje</Button>
            <Button tamanho="pequeno" variante="fantasma" onClick={() => setPosicao(diaAnterior(`${hoje.slice(0, 7)}-01`))}>Fim do mês passado</Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Secao titulo={`Ativo em ${formatarDataISOParaBR(posicao)}`}>
              {ativosB.map((c) => <Linha key={c.id} rotulo={c.nome} valor={posicaoSaldos.get(c.id) ?? 0} recuo />)}
              {ativosB.length === 0 && <p className="text-sm text-texto-secundario">Sem saldos.</p>}
              <Linha rotulo="Total do ativo" valor={totalAtivo} forte />
            </Secao>
            <Secao titulo="Passivo e patrimônio líquido">
              {passivosB.map((c) => <Linha key={c.id} rotulo={c.nome} valor={posicaoSaldos.get(c.id) ?? 0} recuo />)}
              {patrimoniosB.map((c) => <Linha key={c.id} rotulo={c.nome} valor={posicaoSaldos.get(c.id) ?? 0} recuo />)}
              <Linha rotulo="Resultado acumulado (receitas − despesas)" valor={resultadoB} cor={resultadoB < 0 ? "#ff2d55" : "var(--cor-sucesso)"} recuo />
              <Linha rotulo="Total do passivo + patrimônio" valor={totalPassivoPL} forte />
              <p className="mt-2 text-xs" style={{ color: totalAtivo === totalPassivoPL ? "var(--cor-sucesso)" : "#ff2d55" }}>{totalAtivo === totalPassivoPL ? "Ativo = Passivo + Patrimônio ✓" : "O balanço não fecha — verifique os lançamentos."}</p>
            </Secao>
          </div>
          <Secao titulo="Indicadores">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-texto-secundario">Patrimônio líquido</dt><dd className="font-semibold text-texto-primario">{formatarCentavos(plLiquido)}</dd></div>
              <div><dt className="text-xs text-texto-secundario">Liquidez (ativo ÷ passivo)</dt><dd className="font-semibold text-texto-primario">{liquidezCorrente !== null ? `${liquidezCorrente.toFixed(2)}x` : "sem passivos"}</dd></div>
              <div><dt className="text-xs text-texto-secundario">Endividamento</dt><dd className="font-semibold text-texto-primario">{endividamento !== null ? `${endividamento.toFixed(0)}%` : "—"}</dd></div>
              <div><dt className="text-xs text-texto-secundario">Resultado acumulado</dt><dd className={`font-semibold ${resultadoB < 0 ? "text-erro" : "text-sucesso"}`}>{formatarCentavos(resultadoB)}</dd></div>
            </dl>
          </Secao>
        </>
      )}

      {aba === "dre" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {[["Receitas", receitas, receitasAnt, totalReceitas, totalReceitasAnt, "var(--cor-sucesso)"], ["Despesas", despesas, despesasAnt, totalDespesas, totalDespesasAnt, "#ff2d55"]].map(([titulo, lista, ant, total, totalAnt, cor]) => (
            <Secao key={titulo as string} titulo={titulo as string}>
              {(lista as typeof receitas).length === 0 && <p className="text-sm text-texto-secundario">Sem lançamentos no período.</p>}
              {(lista as typeof receitas).map((r) => <div key={r.conta.id} className="flex justify-between py-1.5 text-sm pl-4"><span className="text-texto-primario">{r.conta.nome}</span><span className="tabular-nums">{formatarCentavos(r.valor)} <span className="ml-2 text-xs text-texto-secundario">ant. {formatarCentavos((ant as Map<string, number>).get(r.conta.id) ?? 0)}</span></span></div>)}
              <div className="mt-1 flex justify-between border-t border-borda py-1.5 text-sm font-semibold"><span className="text-texto-primario">Total de {(titulo as string).toLowerCase()}</span><span className="tabular-nums" style={{ color: cor as string }}>{formatarCentavos(total as number)} <span className="ml-2 text-xs font-normal text-texto-secundario">ant. {formatarCentavos(totalAnt as number)}</span></span></div>
            </Secao>
          ))}
          <div className="lg:col-span-2">
            <Secao titulo="Resultado do período">
              <Linha rotulo={resultado >= 0 ? "Superávit" : "Déficit"} valor={resultado} forte cor={resultado >= 0 ? "var(--cor-sucesso)" : "#ff2d55"} />
              <p className="text-xs text-texto-secundario">{margem !== null ? `Margem: ${margem.toFixed(0)}% da receita. ` : ""}Período anterior ({formatarDataISOParaBR(antIni)} a {formatarDataISOParaBR(antFim)}): {formatarCentavos(totalReceitasAnt - totalDespesasAnt)}.</p>
            </Secao>
          </div>
        </div>
      )}

      {aba === "analises" && <AbaAnalisesContabeis lancamentos={lancamentos} contas={contas} inicio={periodo.inicio} fim={periodo.fim} />}

      {aba === "diario" && (
        <Secao titulo={`Livro diário (${diario.length} lançamento(s))`} acao={<div className="sem-impressao relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-secundario" /><input value={buscaDiario} onChange={(e) => setBuscaDiario(e.target.value)} placeholder="Buscar…" aria-label="Buscar no diário" className={`${CLASSE_INPUT} w-52 py-1.5 pl-8`} /></div>}>
          {diario.length === 0 ? <p className="text-sm text-texto-secundario">Nenhum lançamento no período.</p> : (
            <ul className="space-y-3">
              {diario.map((l) => (
                <li key={l.id} className="rounded-lg border border-borda px-3 py-2.5 text-sm">
                  <p className="flex justify-between font-medium text-texto-primario"><span>{l.descricao}{l.origem === "ESTORNO" && <span className="ml-2 rounded-full border border-secundaria/60 px-1.5 py-0.5 text-[10px] font-normal text-secundaria">estorno</span>}</span><span className="text-xs font-normal text-texto-secundario">{formatarDataISOParaBR(l.data)}</span></p>
                  {l.observacao && <p className="text-xs text-texto-secundario">{l.observacao}</p>}
                  <ul className="mt-1.5 space-y-0.5 text-xs">{l.partidas.map((p) => <li key={p.id} className={`flex justify-between ${p.tipo === "CREDITO" ? "pl-6" : ""}`}><span className="text-texto-secundario">{p.tipo === "DEBITO" ? "D" : "C"} · {nomeConta.get(p.conta_id) ?? p.conta_id}</span><span className="tabular-nums text-texto-primario">{formatarCentavos(p.valor_centavos)}</span></li>)}</ul>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      )}

      {aba === "razao" && (
        <Secao titulo="Livro razão" acao={<Select aria-label="Conta" value={contaRazao?.id ?? ""} onValueChange={setContaRazaoId} options={contasPostaveis.map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nome}` }))} className="sem-impressao min-w-64" />}>
          {razao && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-borda text-left text-xs text-texto-secundario"><th className="py-2 pr-3">Data</th><th className="pr-3">Histórico</th><th className="pr-3 text-right">Débito</th><th className="pr-3 text-right">Crédito</th><th className="text-right">Saldo</th></tr></thead>
                <tbody>
                  <tr className="border-b border-borda/60 text-texto-secundario"><td className="py-2 pr-3" colSpan={4}>Saldo anterior ao período</td><td className="text-right tabular-nums">{formatarCentavos(razao.saldoAnterior)}</td></tr>
                  {razao.linhas.map((l) => <tr key={l.lancamento.id} className="border-b border-borda/60"><td className="py-2 pr-3 text-texto-secundario">{formatarDataISOParaBR(l.lancamento.data)}</td><td className="pr-3 text-texto-primario">{l.lancamento.descricao}</td><td className="pr-3 text-right tabular-nums">{l.debito ? formatarCentavos(l.debito) : ""}</td><td className="pr-3 text-right tabular-nums">{l.credito ? formatarCentavos(l.credito) : ""}</td><td className="text-right tabular-nums">{formatarCentavos(l.saldo)}</td></tr>)}
                </tbody>
                <tfoot><tr className="font-semibold"><td colSpan={2} className="py-2 text-texto-primario">Totais do período</td><td className="pr-3 text-right tabular-nums">{formatarCentavos(totalRazaoDeb)}</td><td className="pr-3 text-right tabular-nums">{formatarCentavos(totalRazaoCred)}</td><td className="text-right tabular-nums">{formatarCentavos(razao.linhas[razao.linhas.length - 1]?.saldo ?? razao.saldoAnterior)}</td></tr></tfoot>
              </table>
              {razao.linhas.length === 0 && <p className="mt-3 text-sm text-texto-secundario">Sem movimento nesta conta no período.</p>}
            </div>
          )}
        </Secao>
      )}

      {aba === "plano" && (
        <>
          <Secao titulo={`Plano de contas (${plano.length})`} acao={<div className="sem-impressao flex items-center gap-3"><label className="flex items-center gap-1.5 text-xs text-texto-secundario"><input type="checkbox" checked={verArquivadas} onChange={(e) => setVerArquivadas(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--cor-primaria)]" />Incluir arquivadas</label><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-secundario" /><input value={buscaPlano} onChange={(e) => setBuscaPlano(e.target.value)} placeholder="Buscar conta…" aria-label="Buscar conta" className={`${CLASSE_INPUT} w-48 py-1.5 pl-8`} /></div></div>}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-borda text-left text-xs text-texto-secundario"><th className="py-2 pr-3">Código</th><th className="pr-3">Nome</th><th className="pr-3">Tipo</th><th className="pr-3">Origem</th><th className="text-right">Saldo</th></tr></thead>
                <tbody>
                  {plano.map((c) => {
                    const grupo = c.subtipo === "CATEGORIA";
                    const nivel = c.codigo.split(".").length - 1;
                    return (
                      <tr key={c.id} className={`border-b border-borda/60 ${grupo ? "bg-borda/20 font-semibold" : ""} ${c.ativa ? "" : "opacity-50"}`}>
                        <td className="py-2 pr-3 text-texto-secundario">{c.codigo}</td>
                        <td className="pr-3 text-texto-primario" style={{ paddingLeft: nivel * 12 }}>{c.nome}{!c.ativa && " (arquivada)"}</td>
                        <td className="pr-3 text-texto-secundario">{TIPO_ROTULO[c.tipo]}</td>
                        <td className="pr-3 text-xs text-texto-secundario">{c.sistema ? "Sistema" : "Sua"}</td>
                        <td className="text-right tabular-nums">{grupo ? "" : formatarCentavos(c.saldo_atual_centavos)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Secao>
          <Secao titulo="Nova categoria">
            <form onSubmit={criarCategoria} className="sem-impressao flex flex-wrap items-center gap-2">
              <input value={novaCategoria.nome} onChange={(e) => setNovaCategoria({ ...novaCategoria, nome: e.target.value })} placeholder="Nome da categoria" aria-label="Nome da categoria" className={`${CLASSE_INPUT} w-56`} />
              <Select aria-label="Tipo" value={novaCategoria.tipo} onValueChange={(v) => setNovaCategoria({ ...novaCategoria, tipo: v as "DESPESA" | "RECEITA", pai: "" })} options={[{ value: "DESPESA", label: "Despesa" }, { value: "RECEITA", label: "Receita" }]} className="w-36" />
              <Select aria-label="Dentro de" value={novaCategoria.pai} onValueChange={(v) => setNovaCategoria({ ...novaCategoria, pai: v })} options={[{ value: "", label: "Categoria principal" }, ...opcoesCategoria(contas.filter((c) => c.tipo === novaCategoria.tipo && c.subtipo !== "CATEGORIA" && c.ativa), contas).map((o) => ({ ...o, label: `Subcategoria de ${o.label}` }))]} className="w-64" />
              <Button type="submit" disabled={!novaCategoria.nome.trim()}><Plus size={14} /> Criar</Button>
            </form>
          </Secao>
        </>
      )}

      {aba === "manual" && (
        <Secao titulo="Lançamento contábil manual (partidas dobradas)">
          <p className="mb-3 flex items-start gap-2 text-xs text-texto-secundario"><Info size={14} className="mt-0.5 shrink-0" />Para casos que os formulários comuns não cobrem. Débitos e créditos precisam somar o mesmo valor. Aumenta Ativo/Despesa: débito. Aumenta Passivo/Patrimônio/Receita: crédito.</p>
          <form onSubmit={registrarManual} className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-[8rem_2fr_2fr]">
              <input type="date" value={manual.data} onChange={(e) => setManual({ ...manual, data: e.target.value })} aria-label="Data" className={CLASSE_INPUT} />
              <input value={manual.descricao} onChange={(e) => setManual({ ...manual, descricao: e.target.value })} placeholder="Descrição" aria-label="Descrição" className={CLASSE_INPUT} />
              <input value={manual.observacao} onChange={(e) => setManual({ ...manual, observacao: e.target.value })} placeholder="Observação (opcional)" aria-label="Observação" className={CLASSE_INPUT} />
            </div>
            <ul className="space-y-2">
              {partidas.map((p, i) => (
                <li key={i} className="grid grid-cols-[7rem_1fr_9rem_auto] items-center gap-2">
                  <Select aria-label="Tipo da partida" value={p.tipo} onValueChange={(v) => setPartidas(partidas.map((x, j) => (j === i ? { ...x, tipo: v as PartidaManual["tipo"] } : x)))} options={[{ value: "DEBITO", label: "Débito" }, { value: "CREDITO", label: "Crédito" }]} />
                  <Select aria-label="Conta" value={p.conta} onValueChange={(v) => setPartidas(partidas.map((x, j) => (j === i ? { ...x, conta: v } : x)))} options={[{ value: "", label: "Escolha a conta…" }, ...contasPostaveis.map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nome}` }))]} />
                  <input value={p.valor} onChange={(e) => setPartidas(partidas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} inputMode="decimal" placeholder="Valor (R$)" aria-label="Valor" className={CLASSE_INPUT} />
                  <button type="button" onClick={() => setPartidas(partidas.filter((_, j) => j !== i))} disabled={partidas.length <= 2} aria-label="Remover partida" className="rounded-md p-2 text-texto-secundario hover:text-erro disabled:opacity-30"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap gap-2">
                <Button type="button" variante="secundaria" tamanho="pequeno" onClick={() => setPartidas([...partidas, { conta: "", tipo: "DEBITO", valor: "" }])}><Plus size={13} /> Adicionar partida</Button>
                {somaD !== somaC && (somaD > 0 || somaC > 0) && (
                  <Button type="button" variante="fantasma" tamanho="pequeno" onClick={() => {
                    const dif = Math.abs(somaD - somaC);
                    const tipo: PartidaManual["tipo"] = somaD > somaC ? "CREDITO" : "DEBITO";
                    const vazia = partidas.findIndex((p) => !valorInputParaCentavos(p.valor) && p.tipo === tipo);
                    const valor = (dif / 100).toFixed(2).replace(".", ",");
                    setPartidas(vazia >= 0 ? partidas.map((p, j) => (j === vazia ? { ...p, valor } : p)) : [...partidas, { conta: "", tipo, valor }]);
                  }}>Completar diferença</Button>
                )}
                <Button type="button" variante="fantasma" tamanho="pequeno" onClick={() => setPartidas(partidas.map((p) => ({ ...p, tipo: p.tipo === "DEBITO" ? "CREDITO" : "DEBITO" })))}>Inverter D/C</Button>
                <Button type="button" variante="fantasma" tamanho="pequeno" disabled={!equilibrado || !manual.descricao.trim()} onClick={() => { setModelosContabeis([...modelosContabeis, { nome: manual.descricao.trim(), partidas }]); toast.success("Modelo salvo."); }}>Salvar como modelo</Button>
                {modelosContabeis.length > 0 && (
                  <Select aria-label="Usar modelo" value="" onValueChange={(v) => { const m = modelosContabeis[Number(v)]; if (m) { setManual({ ...manual, descricao: m.nome }); setPartidas(m.partidas); } }} options={[{ value: "", label: "Usar modelo…" }, ...modelosContabeis.map((m, k) => ({ value: String(k), label: m.nome }))]} className="w-40" />
                )}
              </span>
              <p className="text-sm tabular-nums"><span className="text-texto-secundario">Débitos </span><strong>{formatarCentavos(somaD)}</strong> <span className="ml-3 text-texto-secundario">Créditos </span><strong>{formatarCentavos(somaC)}</strong> <span className="ml-3 text-xs" style={{ color: equilibrado ? "var(--cor-sucesso)" : "var(--cor-alerta)" }}>{equilibrado ? "Equilibrado ✓" : somaD === 0 && somaC === 0 ? "" : `Diferença ${formatarCentavos(Math.abs(somaD - somaC))}`}</span></p>
            </div>
            <Button type="submit" disabled={!equilibrado}>Registrar lançamento</Button>
          </form>
        </Secao>
      )}

      {aba === "auditoria" && (
        <Secao titulo={`Trilha de auditoria (últimos ${auditoria.length})`}>
          <p className="mb-3 text-xs text-texto-secundario">Registra apenas o fato de algo ter acontecido (nunca valores ou descrições).</p>
          {auditoria.length === 0 ? <p className="text-sm text-texto-secundario">Nenhum registro.</p> : (
            <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-borda text-left text-texto-secundario"><th className="py-2 pr-3">Quando</th><th className="pr-3">Ação</th><th className="pr-3">Entidade</th><th>ID</th></tr></thead>
                <tbody>{auditoria.map((a, i) => <tr key={i} className="border-b border-borda/60"><td className="py-1.5 pr-3 text-texto-secundario">{formatarDataISOParaBR(a.criado_em.slice(0, 10))} {a.criado_em.slice(11, 16)}</td><td className="pr-3 text-texto-primario">{a.acao.replace(/_/g, " ").toLowerCase()}</td><td className="pr-3 text-texto-secundario">{a.entidade}</td><td className="font-mono text-[10px] text-texto-secundario">{a.entidade_id.slice(0, 8)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </Secao>
      )}
    </div>
  );
}

function diaAnterior(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(a, m - 1, d - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
