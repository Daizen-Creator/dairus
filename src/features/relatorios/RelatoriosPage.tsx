import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { BarraProgresso, Secao } from "../../components/ui/Campos";
import { Skeleton } from "../../components/ui/Skeleton";
import { contabilidade } from "../../services/contabilidade";
import { despesasPorCategoriaNoMes, fluxoCaixaPorAno } from "../../services/agregacoes";
import { exportarCsv, reais } from "../../services/exportacao";
import { extras } from "../../services/extras";
import { dataAtualISO, formatarCentavos, formatarDataISOParaBR } from "../../services/formato";
import { balancete } from "../../services/relatorios";
import { useThemeStore } from "../../state/theme-store";
import { calcularPeriodo, SeletorPeriodo, type Periodo } from "../dashboard/SeletorPeriodo";
import { DespesasDonut } from "../dashboard/DespesasDonut";
import { FluxoCaixaChart } from "../dashboard/FluxoCaixaChart";
import type { Conta, Lancamento } from "../../types/accounting";
import type { Orcamento } from "../../types/extras";

export function RelatoriosPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const hoje = dataAtualISO();
  const [periodo, setPeriodo] = useState<Periodo>(() => calcularPeriodo("este-mes", hoje));
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

  if (carregando) return <Skeleton className="h-72 w-full" />;

  const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));
  const ano = Number(periodo.fim.slice(0, 4));
  const fluxo = fluxoCaixaPorAno(lancamentos, contas, ano);
  const dadosFluxo = fluxo.map((m) => ({
    nome: m.mes,
    Receitas: m.receitasCentavos / 100,
    Despesas: m.despesasCentavos / 100,
    Saldo: m.saldoCentavos / 100,
  }));
  const despesas = despesasPorCategoriaNoMes(lancamentos, contas, periodo.inicio, periodo.fim);
  const limites = new Map(orcamentos.map((o) => [o.categoria_id, o.limite_centavos]));
  const cartoes = contas.filter((c) => c.tipo === "PASSIVO" && c.subtipo === "CARTAO_CREDITO");
  const dividas = contas.filter((c) => c.tipo === "PASSIVO" && c.subtipo !== "CATEGORIA" && c.saldo_atual_centavos > 0);
  const noPeriodo = lancamentos
    .filter((l) => l.data >= periodo.inicio && l.data <= periodo.fim)
    .sort((a, b) => a.data.localeCompare(b.data));

  async function exportar(acao: () => Promise<string>) {
    try {
      const caminho = await acao();
      toast.success(`Arquivo salvo em ${caminho}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  const exportarLancamentos = () =>
    exportarCsv(
      "lancamentos",
      ["Data", "Descrição", "Origem", "Etiqueta", "Conta", "Tipo", "Valor (R$)"],
      noPeriodo.flatMap((l) =>
        l.partidas.map((p) => [
          formatarDataISOParaBR(l.data),
          l.descricao,
          l.origem,
          l.etiqueta ?? "",
          nomeConta.get(p.conta_id) ?? p.conta_id,
          p.tipo === "DEBITO" ? "Débito" : "Crédito",
          reais(p.valor_centavos),
        ]),
      ),
    );

  const exportarCategorias = () =>
    exportarCsv(
      "despesas-por-categoria",
      ["Categoria", "Gasto (R$)", "Limite (R$)"],
      despesas.map((d) => [d.nome, reais(d.valorCentavos), limites.has(d.contaId) ? reais(limites.get(d.contaId)!) : ""]),
    );

  const exportarBalancete = () =>
    exportarCsv(
      "balancete",
      ["Código", "Conta", "Débitos (R$)", "Créditos (R$)", "Saldo (R$)"],
      balancete(lancamentos, contas, periodo.fim).map((l) => [
        l.conta.codigo,
        l.conta.nome,
        reais(l.debitos),
        reais(l.creditos),
        reais(l.saldo),
      ]),
    );

  const mesAbrev = dadosFluxo[Number(hoje.slice(5, 7)) - 1]?.nome ?? "";
  const comLimite = despesas.filter((d) => limites.has(d.contaId));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto-primario">Relatórios</h1>
          <p className="text-sm text-texto-secundario">Visões do seu dinheiro no período escolhido.</p>
        </div>
        <SeletorPeriodo periodo={periodo} hoje={hoje} onChange={setPeriodo} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Secao titulo={`Fluxo de caixa mensal — ${ano}`}>
          <div className="h-64">
            <FluxoCaixaChart dados={dadosFluxo} mesAtual={mesAbrev} anoAtual={ano} />
          </div>
        </Secao>
        <DespesasDonut fatias={despesas} cores={cores} mesPorExtenso="no período selecionado" />
      </div>

      <Secao titulo="Orçado vs. realizado">
        {comLimite.length === 0 ? (
          <p className="text-sm text-texto-secundario">
            Defina limites na aba Orçamento para comparar com o que foi gasto. (O comparativo usa o limite mensal; em períodos maiores que um mês, interprete com cuidado.)
          </p>
        ) : (
          <ul className="space-y-3">
            {comLimite.map((d) => {
              const limite = limites.get(d.contaId)!;
              const pct = (d.valorCentavos / limite) * 100;
              const cor = pct >= 100 ? "#ff2d55" : pct >= 80 ? "var(--cor-alerta)" : "var(--cor-sucesso)";
              return (
                <li key={d.contaId}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-texto-primario">{d.nome}</span>
                    <span className="tabular-nums text-texto-secundario">
                      {formatarCentavos(d.valorCentavos)} / {formatarCentavos(limite)}
                    </span>
                  </div>
                  <BarraProgresso percentual={pct} cor={cor} altura={6} />
                </li>
              );
            })}
          </ul>
        )}
      </Secao>

      <Secao titulo="Dívidas e cartões">
        {dividas.length === 0 ? (
          <p className="text-sm text-texto-secundario">Nenhuma dívida ou fatura em aberto.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {dividas.map((c) => (
              <li key={c.id} className="flex justify-between">
                <span className="text-texto-primario">{c.nome}{cartoes.includes(c) && c.limite_centavos ? ` · limite ${formatarCentavos(c.limite_centavos)}` : ""}</span>
                <span className="tabular-nums text-erro">{formatarCentavos(c.saldo_atual_centavos)}</span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Exportar (CSV para Excel)">
        <div className="flex flex-wrap gap-2">
          <Button variante="secundaria" onClick={() => exportar(exportarLancamentos)}>
            <Download size={14} /> Lançamentos do período
          </Button>
          <Button variante="secundaria" onClick={() => exportar(exportarCategorias)}>
            <Download size={14} /> Despesas por categoria
          </Button>
          <Button variante="secundaria" onClick={() => exportar(exportarBalancete)}>
            <Download size={14} /> Balancete
          </Button>
        </div>
        <p className="mt-3 text-xs text-texto-secundario">
          Os arquivos são salvos em Documentos\Dairus\Exportacoes. Excel (.xlsx) e PDF ainda não estão disponíveis; o CSV abre direto no Excel.
        </p>
      </Secao>
    </div>
  );
}
