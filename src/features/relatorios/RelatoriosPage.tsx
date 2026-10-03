import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Download, FileDown, GitCompare, Percent, Printer, Repeat, Scale } from "lucide-react";
import { toast } from "sonner";
import { Abas, useAbaDaPagina } from "../../components/ui/Abas";
import { Button } from "../../components/ui/Button";
import { gerarEAbrirPdf, PainelPdf, useTitular } from "./GerarPdf";
import { SECOES_PDF, type SecaoPdf } from "../../services/relatorioPdfSecoes";
import { usePreferencia } from "../../state/usePreferencia";
import { BarraProgresso, Secao } from "../../components/ui/Campos";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatCard } from "../../components/ui/StatCard";
import { contabilidade } from "../../services/contabilidade";
import { despesasPorCategoriaNoMes, fluxoCaixaPorAno } from "../../services/agregacoes";
import { col, exportarCsv, exportarXlsx, reais } from "../../services/exportacao";
import { extras } from "../../services/extras";
import { dataAtualISO, formatarCentavos, formatarDataISOParaBR } from "../../services/formato";
import { balancete, resultadoPorTipo } from "../../services/relatorios";
import { useThemeStore } from "../../state/theme-store";
import { calcularPeriodo, SeletorPeriodo, type Periodo } from "../dashboard/SeletorPeriodo";
import { DespesasDonut } from "../dashboard/DespesasDonut";
import { FluxoCaixaChart } from "../dashboard/FluxoCaixaChart";
import { gastoPorDiaDaSemana, maioresDespesas, totalPorTipo } from "../dashboard/inteligencia";
import { iconeDaCategoria } from "../dashboard/categoriaIcone";
import { SeloEtiqueta } from "../lancamentos/Selos";
import { Select } from "../../components/ui/Select";
import { opcoesCategoria } from "../../services/categorias";
import { AbaAnoAno, AbaImpostoRenda, AbaPrevisao, BotaoCalendario } from "./RelatoriosExtras";
import type { Conta, Lancamento } from "../../types/accounting";
import type { Orcamento } from "../../types/extras";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Período imediatamente anterior, com a mesma duração. */
function periodoAnterior(inicio: string, fim: string) {
  const dia = (iso: string) => {
    const [a, m, d] = iso.split("-").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  const dias = Math.round((dia(fim) - dia(inicio)) / 86_400_000) + 1;
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { inicio: fmt(dia(inicio) - dias * 86_400_000), fim: fmt(dia(inicio) - 86_400_000) };
}

function variacao(atual: number, anterior: number): number | null {
  return anterior > 0 ? ((atual - anterior) / anterior) * 100 : null;
}

export function RelatoriosPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancamentosTodos, setLancamentos] = useState<Lancamento[]>([]);
  const [filtroConta, setFiltroConta] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const hoje = dataAtualISO();
  const [periodo, setPeriodo] = useState<Periodo>(() => calcularPeriodo("este-mes", hoje));
  const [comparar, setComparar] = useState(true);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [secoesPdf] = usePreferencia<SecaoPdf[]>("pdf_secoes", SECOES_PDF.filter((x) => x.padrao).map((x) => x.id));
  const titular = useTitular();
  const [secao, setSecao] = useAbaDaPagina<"visao" | "categorias" | "tendencias" | "entradas" | "padroes" | "previsao" | "anoano" | "ir" | "exportar">("relatorios", "visao");
  const cores = useThemeStore((s) => s.temaAtivo()).cores.grafico;

  useEffect(() => {
    Promise.all([contabilidade.listarContas(), contabilidade.listarLancamentos(5000), extras.listarOrcamentos()])
      .then(([c, l, o]) => {
        setContas(c);
        setLancamentos(l);
        setOrcamentos(o);
      })
      .catch((e) => toast.error(String(e)))
      .finally(() => setCarregando(false));
  }, []);

  const ant = periodoAnterior(periodo.inicio, periodo.fim);
  // Filtros dos gráficos: só uma conta/cartão e/ou só uma categoria (com subcategorias).
  const lancamentos = useMemo(() => {
    if (!filtroConta && !filtroCategoria) return lancamentosTodos;
    const porId = new Map(contas.map((c) => [c.id, c]));
    const naCategoria = (id: string) => {
      for (let c = porId.get(id); c; c = c.categoria_pai_id ? porId.get(c.categoria_pai_id) : undefined) if (c.id === filtroCategoria) return true;
      return false;
    };
    return lancamentosTodos.filter((l) => (!filtroConta || l.partidas.some((p) => p.conta_id === filtroConta)) && (!filtroCategoria || l.partidas.some((p) => naCategoria(p.conta_id))));
  }, [lancamentosTodos, contas, filtroConta, filtroCategoria]);
  const nomeConta = useMemo(() => new Map(contas.map((c) => [c.id, c.nome])), [contas]);

  const dados = useMemo(() => {
    const receitas = totalPorTipo(lancamentos, contas, "RECEITA", periodo.inicio, periodo.fim);
    const despesas = totalPorTipo(lancamentos, contas, "DESPESA", periodo.inicio, periodo.fim);
    const receitasAnt = totalPorTipo(lancamentos, contas, "RECEITA", ant.inicio, ant.fim);
    const despesasAnt = totalPorTipo(lancamentos, contas, "DESPESA", ant.inicio, ant.fim);
    const categorias = despesasPorCategoriaNoMes(lancamentos, contas, periodo.inicio, periodo.fim);
    const categoriasAnt = new Map(despesasPorCategoriaNoMes(lancamentos, contas, ant.inicio, ant.fim).map((c) => [c.contaId, c.valorCentavos]));
    const fontes = resultadoPorTipo(lancamentos, contas, "RECEITA", periodo.inicio, periodo.fim);
    const noPeriodo = lancamentos.filter((l) => l.data >= periodo.inicio && l.data <= periodo.fim).sort((a, b) => a.data.localeCompare(b.data));
    return { receitas, despesas, receitasAnt, despesasAnt, categorias, categoriasAnt, fontes, noPeriodo };
  }, [lancamentos, contas, periodo, ant.inicio, ant.fim]);

  // Série dos últimos 12 meses: receita, despesa, poupança %.
  const doze = useMemo(() => {
    const [ah, mh] = hoje.split("-").map(Number);
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(ah, mh - 1 - (11 - i), 1);
      const ano = d.getFullYear();
      const mes = d.getMonth() + 1;
      const mm = String(mes).padStart(2, "0");
      const ini = `${ano}-${mm}-01`;
      const fim = `${ano}-${mm}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}`;
      const r = totalPorTipo(lancamentos, contas, "RECEITA", ini, fim);
      const dsp = totalPorTipo(lancamentos, contas, "DESPESA", ini, fim);
      return { nome: MESES[d.getMonth()], ini, fim, receitas: r, despesas: dsp, poupanca: r > 0 ? Math.round(((r - dsp) / r) * 100) : null };
    });
  }, [lancamentos, contas, hoje]);

  // Top 5 categorias do período e sua evolução em 12 meses (barras empilhadas).
  const top5 = dados.categorias.slice(0, 5);
  const evolucaoCategorias = useMemo(
    () =>
      doze.map((m) => {
        const porCat = new Map(despesasPorCategoriaNoMes(lancamentos, contas, m.ini, m.fim).map((c) => [c.contaId, c.valorCentavos]));
        const linha: Record<string, string | number> = { nome: m.nome };
        for (const c of top5) linha[c.nome] = (porCat.get(c.contaId) ?? 0) / 100;
        return linha;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doze, lancamentos, contas, periodo],
  );

  if (carregando) return <Skeleton className="h-72 w-full" />;

  const ano = Number(periodo.fim.slice(0, 4));
  const fluxo = fluxoCaixaPorAno(lancamentos, contas, ano);
  const dadosFluxo = fluxo.map((m) => ({ nome: m.mes, Receitas: m.receitasCentavos / 100, Despesas: m.despesasCentavos / 100, Saldo: m.saldoCentavos / 100 }));
  const mesAbrev = dadosFluxo[Number(hoje.slice(5, 7)) - 1]?.nome ?? "";
  const limites = new Map(orcamentos.map((o) => [o.categoria_id, o.limite_centavos]));
  const comLimite = dados.categorias.filter((d) => limites.has(d.contaId));
  const cartoes = contas.filter((c) => c.tipo === "PASSIVO" && c.subtipo === "CARTAO_CREDITO");
  const dividas = contas.filter((c) => c.tipo === "PASSIVO" && c.subtipo !== "CATEGORIA" && c.saldo_atual_centavos > 0);

  const resultado = dados.receitas - dados.despesas;
  const resultadoAnt = dados.receitasAnt - dados.despesasAnt;
  const taxa = dados.receitas > 0 ? (resultado / dados.receitas) * 100 : null;
  const diasPeriodo = Math.max(1, Math.round((Date.UTC(+periodo.fim.slice(0, 4), +periodo.fim.slice(5, 7) - 1, +periodo.fim.slice(8, 10)) - Date.UTC(+periodo.inicio.slice(0, 4), +periodo.inicio.slice(5, 7) - 1, +periodo.inicio.slice(8, 10))) / 86_400_000) + 1);
  const diasConsiderados = periodo.fim > hoje && periodo.inicio <= hoje ? Math.max(1, Math.round((Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10)) - Date.UTC(+periodo.inicio.slice(0, 4), +periodo.inicio.slice(5, 7) - 1, +periodo.inicio.slice(8, 10))) / 86_400_000) + 1) : diasPeriodo;

  const dv = (atual: number, anterior: number, inverter = false) => {
    const v = variacao(atual, anterior);
    if (!comparar || v === null) return undefined;
    const bom = inverter ? v <= 0 : v >= 0;
    return `${v >= 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(0)}% vs período anterior${bom ? "" : " ⚠"}`;
  };

  // Gasto por etiqueta, por conta de pagamento, fixos x variáveis, assinaturas.
  const estornados = new Set(lancamentos.map((l) => l.estornado_de).filter(Boolean));
  const despesasIds = new Set(contas.filter((c) => c.tipo === "DESPESA").map((c) => c.id));
  const valorDespesa = (l: Lancamento) => l.partidas.filter((p) => despesasIds.has(p.conta_id) && p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0);
  const lancsDespesa = dados.noPeriodo.filter((l) => l.origem !== "ESTORNO" && !estornados.has(l.id) && valorDespesa(l) > 0);
  const porEtiqueta = new Map<string, number>();
  const porConta = new Map<string, number>();
  for (const l of lancsDespesa) {
    const v = valorDespesa(l);
    porEtiqueta.set(l.etiqueta ?? "SEM", (porEtiqueta.get(l.etiqueta ?? "SEM") ?? 0) + v);
    const origem = l.partidas.find((p) => p.tipo === "CREDITO");
    if (origem) porConta.set(origem.conta_id, (porConta.get(origem.conta_id) ?? 0) + v);
  }
  const fixos = (porEtiqueta.get("FIXO") ?? 0) + (porEtiqueta.get("MENSALIDADE") ?? 0) + (porEtiqueta.get("ASSINATURA") ?? 0);
  const variaveis = dados.despesas - fixos;
  const assinaturas = lancamentos.filter((l) => l.etiqueta === "ASSINATURA" && l.origem !== "ESTORNO" && !estornados.has(l.id));
  const assinaturasPorNome = new Map<string, number>();
  for (const l of assinaturas) assinaturasPorNome.set(l.descricao, Math.max(assinaturasPorNome.get(l.descricao) ?? 0, valorDespesa(l)));
  const totalAssinaturasMes = [...assinaturasPorNome.values()].reduce((s, v) => s + v, 0);

  const semana = gastoPorDiaDaSemana(lancamentos, contas, periodo.inicio, periodo.fim);
  const maxSemana = Math.max(1, ...semana);
  const maiores = maioresDespesas(lancamentos, contas, periodo.inicio, periodo.fim, 8);
  const maioresReceitas = dados.noPeriodo
    .filter((l) => l.partidas.some((p) => p.tipo === "CREDITO" && contas.find((c) => c.id === p.conta_id)?.tipo === "RECEITA") && l.origem !== "ESTORNO" && !estornados.has(l.id))
    .map((l) => ({ l, v: l.partidas.filter((p) => p.tipo === "CREDITO" && contas.find((c) => c.id === p.conta_id)?.tipo === "RECEITA").reduce((s, p) => s + p.valor_centavos, 0) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 5);

  // Calendário de calor (dias do mês do fim do período).
  const [aF, mF] = periodo.fim.split("-").map(Number);
  const diasNoMesF = new Date(aF, mF, 0).getDate();
  const gastoDia = Array.from({ length: diasNoMesF }, (_, i) => {
    const iso = `${aF}-${String(mF).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
    return lancsDespesa.filter((l) => l.data === iso).reduce((s, l) => s + valorDespesa(l), 0);
  });
  const maxDia = Math.max(1, ...gastoDia);

  async function exportar(acao: () => Promise<string>) {
    try {
      toast.success(`Arquivo salvo em ${await acao()}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  const exportarLancamentos = () =>
    exportarCsv("lancamentos", ["Data", "Descrição", "Origem", "Etiqueta", "Conta", "Tipo", "Valor (R$)"], dados.noPeriodo.flatMap((l) => l.partidas.map((p) => [formatarDataISOParaBR(l.data), l.descricao, l.origem, l.etiqueta ?? "", nomeConta.get(p.conta_id) ?? p.conta_id, p.tipo === "DEBITO" ? "Débito" : "Crédito", reais(p.valor_centavos)])));
  const exportarCategorias = () =>
    exportarCsv("despesas-por-categoria", ["Categoria", "Gasto (R$)", "Período anterior (R$)", "Limite (R$)"], dados.categorias.map((d) => [d.nome, reais(d.valorCentavos), reais(dados.categoriasAnt.get(d.contaId) ?? 0), limites.has(d.contaId) ? reais(limites.get(d.contaId)!) : ""]));
  const exportarBalancete = () =>
    exportarCsv("balancete", ["Código", "Conta", "Débitos (R$)", "Créditos (R$)", "Saldo (R$)"], balancete(lancamentosTodos, contas, periodo.fim).map((l) => [l.conta.codigo, l.conta.nome, reais(l.debitos), reais(l.creditos), reais(l.saldo)]));
  const exportarReceitas = () =>
    exportarCsv("receitas-por-fonte", ["Fonte", "Total (R$)"], dados.fontes.map((f) => [f.conta.nome, reais(f.valor)]));
  const exportarMensal = () =>
    exportarCsv("resumo-mensal-12-meses", ["Mês", "Receitas (R$)", "Despesas (R$)", "Resultado (R$)", "Poupança (%)"], doze.map((m) => [`${m.ini.slice(5, 7)}/${m.ini.slice(0, 4)}`, reais(m.receitas), reais(m.despesas), reais(m.receitas - m.despesas), m.poupanca ?? ""]));
  const exportarExcelCompleto = () =>
    exportarXlsx(`dairus-${periodo.inicio}-a-${periodo.fim}`, [
      {
        nome: "Resumo",
        colunas: [col("Indicador", "TEXTO", 32), col("Valor", "MOEDA", 18)],
        linhas: [
          ["Receitas do período", dados.receitas],
          ["Despesas do período", dados.despesas],
          ["Resultado", dados.receitas - dados.despesas],
          ["Receitas do período anterior", dados.receitasAnt],
          ["Despesas do período anterior", dados.despesasAnt],
        ],
      },
      {
        nome: "Lançamentos",
        total: false,
        colunas: [col("Data", "DATA"), col("Descrição", "TEXTO", 36), col("Origem", "TEXTO", 14), col("Etiqueta", "TEXTO", 14), col("Conta", "TEXTO", 28), col("Tipo", "TEXTO", 10), col("Valor", "MOEDA")],
        linhas: dados.noPeriodo.flatMap((l) => l.partidas.map((p) => [l.data, l.descricao, l.origem, l.etiqueta ?? "", nomeConta.get(p.conta_id) ?? p.conta_id, p.tipo === "DEBITO" ? "Débito" : "Crédito", p.valor_centavos])),
      },
      {
        nome: "Despesas por categoria",
        total: true,
        colunas: [col("Categoria", "TEXTO", 28), col("Gasto", "MOEDA"), col("Período anterior", "MOEDA"), col("Limite", "MOEDA")],
        linhas: dados.categorias.map((d) => [d.nome, d.valorCentavos, dados.categoriasAnt.get(d.contaId) ?? 0, limites.get(d.contaId) ?? null]),
      },
      {
        nome: "Receitas por fonte",
        total: true,
        colunas: [col("Fonte", "TEXTO", 28), col("Total", "MOEDA")],
        linhas: dados.fontes.map((f) => [f.conta.nome, f.valor]),
      },
      {
        nome: "12 meses",
        total: true,
        colunas: [col("Mês", "TEXTO", 10), col("Receitas", "MOEDA"), col("Despesas", "MOEDA"), col("Resultado", "MOEDA"), col("Poupança", "PERCENTUAL")],
        linhas: doze.map((m) => [`${m.ini.slice(5, 7)}/${m.ini.slice(0, 4)}`, m.receitas, m.despesas, m.receitas - m.despesas, m.poupanca === null ? null : m.poupanca / 100]),
      },
      {
        nome: "Contas e cartões",
        colunas: [col("Conta", "TEXTO", 28), col("Tipo", "TEXTO", 12), col("Saldo", "MOEDA"), col("Limite", "MOEDA")],
        linhas: contas
          .filter((c) => (c.tipo === "ATIVO" || c.tipo === "PASSIVO") && c.subtipo !== "CATEGORIA" && c.ativa)
          .map((c) => [c.nome, c.subtipo === "CARTAO_CREDITO" ? "Cartão" : c.tipo === "ATIVO" ? "Conta" : "Dívida", c.saldo_atual_centavos, c.limite_centavos]),
      },
      {
        nome: "Balancete",
        colunas: [col("Código", "TEXTO", 10), col("Conta", "TEXTO", 32), col("Débitos", "MOEDA"), col("Créditos", "MOEDA"), col("Saldo", "MOEDA")],
        linhas: balancete(lancamentosTodos, contas, periodo.fim).map((l) => [l.conta.codigo, l.conta.nome, l.debitos, l.creditos, l.saldo]),
      },
    ]);
  const exportarAssinaturas = () =>
    exportarCsv("assinaturas", ["Assinatura", "Valor mensal (R$)", "Estimativa anual (R$)"], [...assinaturasPorNome.entries()].map(([n, v]) => [n, reais(v), reais(v * 12)]));

  async function gerarPdfRapido() {
    try {
      setGerandoPdf(true);
      await gerarEAbrirPdf(periodo.inicio, periodo.fim, new Set(secoesPdf), titular);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setGerandoPdf(false);
    }
  }

  const tooltipEstilo = { background: "var(--cor-superficie)", border: "1px solid var(--cor-borda)", borderRadius: 8, fontSize: 12 };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto-primario">Relatórios</h1>
          <p className="text-sm text-texto-secundario">
            Período: {formatarDataISOParaBR(periodo.inicio)} a {formatarDataISOParaBR(periodo.fim)}
            {comparar && ` · comparado a ${formatarDataISOParaBR(ant.inicio)} – ${formatarDataISOParaBR(ant.fim)}`}
          </p>
        </div>
        <div className="sem-impressao flex flex-wrap items-center gap-2">
          <Button tamanho="pequeno" variante={comparar ? "primaria" : "secundaria"} onClick={() => setComparar(!comparar)}><GitCompare size={13} /> Comparar com período anterior</Button>
          <Button tamanho="pequeno" onClick={gerarPdfRapido} disabled={gerandoPdf}><FileDown size={13} /> {gerandoPdf ? "Gerando PDF…" : "Relatório em PDF"}</Button>
          <Button tamanho="pequeno" variante="secundaria" onClick={() => window.print()}><Printer size={13} /> Imprimir tela</Button>
          <SeletorPeriodo periodo={periodo} hoje={hoje} onChange={setPeriodo} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard titulo="Receitas" valor={formatarCentavos(dados.receitas)} corValor="sucesso" icone={ArrowDownRight} corIcone="sucesso" subtitulo={dv(dados.receitas, dados.receitasAnt)} />
        <StatCard titulo="Despesas" valor={formatarCentavos(dados.despesas)} corValor="erro" icone={ArrowUpRight} corIcone="erro" subtitulo={dv(dados.despesas, dados.despesasAnt, true)} />
        <StatCard titulo={resultado >= 0 ? "Superávit" : "Déficit"} valor={formatarCentavos(Math.abs(resultado))} corValor={resultado >= 0 ? "sucesso" : "erro"} icone={Scale} corIcone="primaria" subtitulo={comparar ? `Período anterior: ${formatarCentavos(resultadoAnt)}` : undefined} />
        <StatCard titulo="Taxa de poupança" valor={taxa !== null ? `${taxa.toFixed(0)}%` : "—"} corValor={taxa !== null && taxa < 0 ? "erro" : "normal"} icone={Percent} corIcone="alerta" subtitulo={`Gasto médio: ${formatarCentavos(Math.round(dados.despesas / diasConsiderados))}/dia · ${formatarCentavos(Math.round((dados.despesas / diasConsiderados) * 30))}/mês`} />
      </div>

      <Abas ativa={secao} onChange={setSecao} abas={[{ id: "visao", rotulo: "Visão geral" }, { id: "categorias", rotulo: "Categorias e orçamento" }, { id: "tendencias", rotulo: "Tendências (12 meses)" }, { id: "entradas", rotulo: "Entradas e saídas" }, { id: "padroes", rotulo: "Padrões de gasto" }, { id: "previsao", rotulo: "Previsão de saldo" }, { id: "anoano", rotulo: "Ano a ano" }, { id: "ir", rotulo: "Imposto de Renda" }, { id: "exportar", rotulo: "PDF e exportação" }]} />

      <div className="sem-impressao flex flex-wrap items-center gap-2 text-xs text-texto-secundario">
        Filtrar gráficos:
        <Select aria-label="Filtrar por conta ou cartão" value={filtroConta} onValueChange={setFiltroConta} options={[{ value: "", label: "Todas as contas e cartões" }, ...contas.filter((c) => (c.tipo === "ATIVO" || c.tipo === "PASSIVO") && c.subtipo !== "CATEGORIA").map((c) => ({ value: c.id, label: c.nome }))]} className="w-52" />
        <Select aria-label="Filtrar por categoria" value={filtroCategoria} onValueChange={setFiltroCategoria} options={[{ value: "", label: "Todas as categorias" }, ...opcoesCategoria(contas.filter((c) => (c.tipo === "DESPESA" || c.tipo === "RECEITA") && c.subtipo !== "CATEGORIA"), contas)]} className="w-52" />
        {(filtroConta || filtroCategoria) && <button onClick={() => { setFiltroConta(""); setFiltroCategoria(""); }} className="text-primaria hover:underline">limpar filtros</button>}
        <span className="ml-auto"><BotaoCalendario hoje={hoje} /></span>
      </div>

      {secao === "previsao" && <AbaPrevisao hoje={hoje} />}
      {secao === "anoano" && <AbaAnoAno contas={contas} lancamentos={lancamentos} hoje={hoje} />}
      {secao === "ir" && <AbaImpostoRenda contas={contas} lancamentos={lancamentosTodos} hoje={hoje} />}

      {(secao === "visao") && (<>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Secao titulo={`Fluxo de caixa mensal — ${ano}`}>
          <div className="h-64"><FluxoCaixaChart dados={dadosFluxo} mesAtual={mesAbrev} anoAtual={ano} /></div>
        </Secao>
        <DespesasDonut fatias={dados.categorias} cores={cores} mesPorExtenso="no período selecionado" />
      </div>
      </>)}

      {(secao === "categorias") && (<>
      <Secao titulo="Despesas por categoria (com comparação)">
        {dados.categorias.length === 0 ? <p className="text-sm text-texto-secundario">Sem despesas no período.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-borda text-left text-xs text-texto-secundario"><th className="py-2 pr-3">Categoria</th><th className="pr-3 text-right">Gasto</th><th className="pr-3 text-right">% do total</th><th className="pr-3 text-right">Anterior</th><th className="text-right">Variação</th></tr></thead>
              <tbody>
                {dados.categorias.map((c) => {
                  const a = dados.categoriasAnt.get(c.contaId) ?? 0;
                  const v = variacao(c.valorCentavos, a);
                  const ic = iconeDaCategoria(c.nome);
                  return (
                    <tr key={c.contaId} className="border-b border-borda/60">
                      <td className="py-2 pr-3"><span className="flex items-center gap-2 text-texto-primario"><IconeCoisa nome={c.nome} tamanho={24} redondo padrao={ic} />{c.nome}</span></td>
                      <td className="pr-3 text-right tabular-nums">{formatarCentavos(c.valorCentavos)}</td>
                      <td className="pr-3 text-right tabular-nums text-texto-secundario">{dados.despesas > 0 ? ((c.valorCentavos / dados.despesas) * 100).toFixed(0) : 0}%</td>
                      <td className="pr-3 text-right tabular-nums text-texto-secundario">{formatarCentavos(a)}</td>
                      <td className={`text-right tabular-nums ${v === null ? "text-texto-secundario" : v > 0 ? "text-erro" : "text-sucesso"}`}>{v === null ? "novo" : `${v >= 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(0)}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
      </>)}

      {(secao === "tendencias") && (<>
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Principais categorias nos últimos 12 meses">
          {top5.length === 0 ? <p className="text-sm text-texto-secundario">Sem dados.</p> : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evolucaoCategorias}>
                  <CartesianGrid vertical={false} stroke="var(--cor-borda)" strokeDasharray="3 3" />
                  <XAxis dataKey="nome" tick={{ fontSize: 10, fill: "var(--cor-texto-secundario)" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={(v) => formatarCentavos(Math.round(Number(v) * 100))} contentStyle={tooltipEstilo} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  {top5.map((c, i) => <Bar key={c.contaId} dataKey={c.nome} stackId="a" fill={cores[i % cores.length]} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <ul className="mt-2 flex flex-wrap gap-3 text-[11px] text-texto-secundario">{top5.map((c, i) => <li key={c.contaId} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: cores[i % cores.length] }} />{c.nome}</li>)}</ul>
        </Secao>
        <Secao titulo="Taxa de poupança mês a mês">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={doze.map((m) => ({ nome: m.nome, Poupança: m.poupanca }))}>
                <CartesianGrid vertical={false} stroke="var(--cor-borda)" strokeDasharray="3 3" />
                <XAxis dataKey="nome" tick={{ fontSize: 10, fill: "var(--cor-texto-secundario)" }} axisLine={false} tickLine={false} />
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip formatter={(v) => `${v}%`} contentStyle={tooltipEstilo} />
                <Line type="monotone" dataKey="Poupança" stroke="#00d395" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[11px] text-texto-secundario">Meses sem receita não têm taxa. Meta de referência: 20%.</p>
        </Secao>
      </div>
      </>)}

      {(secao === "entradas") && (<>
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Receitas por fonte">
          {dados.fontes.length === 0 ? <p className="text-sm text-texto-secundario">Sem receitas no período.</p> : (
            <ul className="space-y-2">{dados.fontes.map((f) => <li key={f.conta.id}><div className="mb-1 flex justify-between text-sm"><span className="text-texto-primario">{f.conta.nome}</span><span className="tabular-nums text-sucesso">{formatarCentavos(f.valor)}</span></div><BarraProgresso percentual={(f.valor / dados.receitas) * 100} cor="var(--cor-sucesso)" altura={5} /></li>)}</ul>
          )}
          {maioresReceitas.length > 0 && <div className="mt-4 border-t border-borda pt-3"><p className="mb-1 text-xs font-semibold text-texto-secundario">Maiores entradas</p><ul className="space-y-1 text-xs">{maioresReceitas.map(({ l, v }) => <li key={l.id} className="flex justify-between"><span className="truncate text-texto-secundario">{formatarDataISOParaBR(l.data).slice(0, 5)} · {l.descricao}</span><span className="tabular-nums text-sucesso">{formatarCentavos(v)}</span></li>)}</ul></div>}
        </Secao>
        <Secao titulo="Maiores despesas do período">
          {maiores.length === 0 ? <p className="text-sm text-texto-secundario">Sem despesas.</p> : (
            <ul className="space-y-2">{maiores.map(({ l, valor }) => <li key={l.id} className="flex items-center justify-between gap-2 text-sm"><span className="flex min-w-0 items-center gap-2"><IconeCoisa nome={l.descricao} tamanho={26} redondo /><span className="truncate text-texto-primario">{l.descricao}</span><SeloEtiqueta etiqueta={l.etiqueta} /></span><span className="shrink-0 tabular-nums text-erro">{formatarCentavos(valor)}</span></li>)}</ul>
          )}
        </Secao>
      </div>
      </>)}

      {(secao === "padroes") && (<>
      <div className="grid gap-4 lg:grid-cols-3">
        <Secao titulo="Fixas x variáveis">
          <p className="text-xs text-texto-secundario">Fixas = despesas com etiqueta Fixo, Mensalidade ou Assinatura.</p>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-texto-secundario">Fixas</span><span className="tabular-nums text-texto-primario">{formatarCentavos(fixos)}</span></div>
            <div className="flex justify-between"><span className="text-texto-secundario">Variáveis</span><span className="tabular-nums text-texto-primario">{formatarCentavos(Math.max(0, variaveis))}</span></div>
            {dados.despesas > 0 && <BarraProgresso percentual={(fixos / dados.despesas) * 100} cor="var(--cor-destaque)" altura={6} />}
            {[...porEtiqueta.entries()].filter(([k]) => k !== "SEM").map(([k, v]) => <div key={k} className="flex justify-between text-xs"><SeloEtiqueta etiqueta={k as never} /><span className="tabular-nums text-texto-secundario">{formatarCentavos(v)}</span></div>)}
          </div>
        </Secao>
        <Secao titulo={<><Repeat size={15} className="text-secundaria" /> Assinaturas</>}>
          {assinaturasPorNome.size === 0 ? <p className="text-sm text-texto-secundario">Marque despesas como “Assinatura” para ver o custo recorrente.</p> : (
            <>
              <ul className="space-y-1 text-sm">{[...assinaturasPorNome.entries()].map(([n, v]) => <li key={n} className="flex justify-between"><span className="truncate text-texto-primario">{n}</span><span className="tabular-nums text-texto-secundario">{formatarCentavos(v)}</span></li>)}</ul>
              <p className="mt-2 border-t border-borda pt-2 text-sm text-texto-primario">Total mensal: <strong>{formatarCentavos(totalAssinaturasMes)}</strong> · ≈ {formatarCentavos(totalAssinaturasMes * 12)}/ano <span className="text-[11px] text-texto-secundario">(estimativa)</span></p>
            </>
          )}
        </Secao>
        <Secao titulo="Gasto por conta de pagamento">
          {porConta.size === 0 ? <p className="text-sm text-texto-secundario">Sem despesas.</p> : (
            <ul className="space-y-2">{[...porConta.entries()].sort((a, b) => b[1] - a[1]).map(([id, v]) => <li key={id}><div className="mb-1 flex justify-between text-xs"><span className="text-texto-primario">{nomeConta.get(id)}</span><span className="tabular-nums text-texto-secundario">{formatarCentavos(v)}</span></div><BarraProgresso percentual={(v / dados.despesas) * 100} cor="var(--cor-primaria)" altura={5} /></li>)}</ul>
          )}
        </Secao>
      </div>
      </>)}

      {(secao === "padroes") && (<>
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Gastos por dia da semana">
          <div className="flex h-28 items-end gap-2">{semana.map((v, i) => <div key={i} className="flex flex-1 flex-col items-center gap-1"><div className="flex h-20 w-full items-end"><div className="w-full rounded-t bg-gradient-to-t from-primaria/50 to-secundaria" style={{ height: `${Math.max(4, (v / maxSemana) * 100)}%`, opacity: v === 0 ? 0.25 : 1 }} title={formatarCentavos(v)} /></div><span className="text-[10px] text-texto-secundario">{DIAS[i]}</span></div>)}</div>
        </Secao>
        <Secao titulo={`Calendário de gastos — ${MESES[mF - 1]}/${aF}`}>
          <div className="grid grid-cols-7 gap-1.5">
            {gastoDia.map((v, i) => (
              <div key={i} title={`${i + 1}: ${formatarCentavos(v)}`} className="flex h-8 items-center justify-center rounded-md text-[10px] text-texto-primario" style={{ backgroundColor: v === 0 ? "var(--cor-borda)" : `color-mix(in srgb, var(--cor-erro) ${Math.round(25 + (v / maxDia) * 65)}%, transparent)` }}>{i + 1}</div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-texto-secundario">Quanto mais forte a cor, maior o gasto no dia.</p>
        </Secao>
      </div>
      </>)}

      {(secao === "categorias") && (<>
      <Secao titulo="Orçado vs. realizado">
        {comLimite.length === 0 ? <p className="text-sm text-texto-secundario">Defina limites na aba Orçamento para comparar com o que foi gasto. (O comparativo usa o limite mensal; em períodos maiores que um mês, interprete com cuidado.)</p> : (
          <ul className="space-y-3">{comLimite.map((d) => { const limite = limites.get(d.contaId)!; const pct = (d.valorCentavos / limite) * 100; const cor = pct >= 100 ? "#ff2d55" : pct >= 80 ? "var(--cor-alerta)" : "var(--cor-sucesso)"; return <li key={d.contaId}><div className="mb-1 flex justify-between text-sm"><span className="text-texto-primario">{d.nome}</span><span className="tabular-nums text-texto-secundario">{formatarCentavos(d.valorCentavos)} / {formatarCentavos(limite)}</span></div><BarraProgresso percentual={pct} cor={cor} altura={6} /></li>; })}</ul>
        )}
      </Secao>
      </>)}

      {(secao === "exportar") && (<>
      <Secao titulo={<><FileDown size={16} className="text-primaria" /> Relatório em PDF</>}>
        <PainelPdf inicio={periodo.inicio} fim={periodo.fim} />
      </Secao>

      <Secao titulo="Dívidas e cartões">
        {dividas.length === 0 ? <p className="text-sm text-texto-secundario">Nenhuma dívida ou fatura em aberto.</p> : (
          <ul className="space-y-1.5 text-sm">{dividas.map((c) => <li key={c.id} className="flex justify-between"><span className="text-texto-primario">{c.nome}{cartoes.includes(c) && c.limite_centavos ? ` · limite ${formatarCentavos(c.limite_centavos)}` : ""}</span><span className="tabular-nums text-erro">{formatarCentavos(c.saldo_atual_centavos)}</span></li>)}</ul>
        )}
      </Secao>
      </>)}

      {(secao === "exportar") && (<>
      <div className="sem-impressao">
        <Secao titulo="Exportar">
          <div className="mb-3">
            <Button tamanho="pequeno" onClick={() => exportar(exportarExcelCompleto)}><Download size={13} /> Excel completo (.xlsx, 7 abas)</Button>
          </div>
          <p className="mb-2 text-xs text-texto-secundario">Ou, em CSV, uma tabela por arquivo:</p>
          <div className="flex flex-wrap gap-2">
            {[["Lançamentos do período", exportarLancamentos], ["Despesas por categoria", exportarCategorias], ["Receitas por fonte", exportarReceitas], ["Resumo mensal (12 meses)", exportarMensal], ["Assinaturas", exportarAssinaturas], ["Balancete", exportarBalancete]].map(([rotulo, fn]) => (
              <Button key={rotulo as string} variante="secundaria" tamanho="pequeno" onClick={() => exportar(fn as () => Promise<string>)}><Download size={13} /> {rotulo as string}</Button>
            ))}
          </div>
          <p className="mt-3 text-xs text-texto-secundario">Os arquivos são salvos em Documentos\Dairus\Exportacoes. O relatório completo em PDF fica no botão “Relatório em PDF”. O Excel completo traz resumo, lançamentos, categorias, receitas, 12 meses, contas e balancete, com valores somáveis.</p>
        </Secao>
      </div>
      </>)}
    </div>
  );
}
