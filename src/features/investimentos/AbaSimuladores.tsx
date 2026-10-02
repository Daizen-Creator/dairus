import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Secao } from "../../components/ui/Campos";
import { CLASSE_INPUT } from "../../components/ui/Campos";
import { formatarCentavos, valorInputParaCentavos } from "../../services/formato";
import { usePreferencia } from "../../state/usePreferencia";
import { ROTULO_CLASSE, type ClasseAtivo } from "../../types/investimentos";
import { totalPorTipo } from "../dashboard/inteligencia";
import { aporteNecessario, compararRendaFixa, jurosCompostos, liberdadeFinanceira, perdaInflacao, rebalancear, type OpcaoRendaFixa } from "./calculos";
import type { Carteira } from "./useCarteira";

const reais = (c: number) => formatarCentavos(Math.round(c));
const num = (t: string) => Number(t.replace(/\./g, "").replace(",", ".")) || 0;
const pct = (v: number) => `${(v * 100).toFixed(2).replace(".", ",")}%`;
const tooltip = { background: "var(--cor-cartao)", border: "1px solid var(--cor-borda)", borderRadius: 8 };

function Campo({ rotulo, valor, onChange }: { rotulo: string; valor: string; onChange: (v: string) => void }) {
  return (
    <label className="text-xs text-texto-secundario">
      {rotulo}
      <input value={valor} onChange={(e) => onChange(e.target.value)} inputMode="decimal" aria-label={rotulo} className={`${CLASSE_INPUT} mt-1 w-full`} />
    </label>
  );
}

export function AbaSimuladores({ carteira }: { carteira: Carteira }) {
  const { indices, posicoes, lancamentos, contas, hoje } = carteira;
  const total = posicoes.filter((p) => p.ativo.quantidade > 0).reduce((s, p) => s + p.valor, 0);

  // Juros compostos
  const [inicial, setInicial] = useState("1.000");
  const [aporte, setAporte] = useState("300");
  const [taxa, setTaxa] = useState(String((indices.cdiAnual * 100).toFixed(2)).replace(".", ","));
  const [anos, setAnos] = useState("10");
  const serie = useMemo(() => jurosCompostos(valorInputParaCentavos(inicial), valorInputParaCentavos(aporte), num(taxa) / 100, Math.round(num(anos) * 12)), [inicial, aporte, taxa, anos]);
  const final = serie[serie.length - 1];
  const dados = serie.filter((p) => p.mes % 12 === 0).map((p) => ({ ano: p.mes / 12, investido: p.investido / 100, total: p.total / 100 }));

  // Comparador de renda fixa
  const [valorRF, setValorRF] = useState("10.000");
  const [diasRF, setDiasRF] = useState("365");
  const [opcoes] = useState<OpcaoRendaFixa[]>([
    { nome: "CDB 100% do CDI", indexador: "CDI", taxa: 100, isento: false },
    { nome: "CDB 110% do CDI", indexador: "CDI", taxa: 110, isento: false },
    { nome: "LCI/LCA 90% do CDI", indexador: "CDI", taxa: 90, isento: true },
    { nome: "Tesouro Selic", indexador: "SELIC", taxa: 100, isento: false },
    { nome: "Tesouro IPCA+ 6%", indexador: "IPCA", taxa: 6, isento: false },
    { nome: "Poupança", indexador: "POUPANCA", taxa: 0, isento: true },
  ]);
  const comparacao = compararRendaFixa(valorInputParaCentavos(valorRF), Math.max(1, num(diasRF)), opcoes, indices);

  // Aposentadoria / meta
  const [alvo, setAlvo] = useState("1.000.000");
  const [prazo, setPrazo] = useState("25");
  const [taxaReal, setTaxaReal] = useState("5");
  const pmt = aporteNecessario(valorInputParaCentavos(alvo), total, num(taxaReal) / 100, Math.round(num(prazo) * 12));

  // Liberdade financeira com as despesas reais (média dos últimos 3 meses).
  const gastoMedio = useMemo(() => {
    const [a, m] = hoje.split("-").map(Number);
    const ini = new Date(Date.UTC(a, m - 4, 1)).toISOString().slice(0, 10);
    const fim = new Date(Date.UTC(a, m - 1, 0)).toISOString().slice(0, 10);
    return Math.round(totalPorTipo(lancamentos, contas, "DESPESA", ini, fim) / 3);
  }, [lancamentos, contas, hoje]);
  const [aporteLib, setAporteLib] = useState("500");
  const lib = liberdadeFinanceira(gastoMedio, total, valorInputParaCentavos(aporteLib), num(taxaReal) / 100);

  // Inflação
  const [parado, setParado] = useState("5.000");
  const inflacao = perdaInflacao(valorInputParaCentavos(parado), indices.ipca12m, 1);

  // Rebalanceamento
  const [alvoClasses, setAlvoClasses] = usePreferencia<Partial<Record<ClasseAtivo, number>>>("invest_alvo", {});
  const [aporteReb, setAporteReb] = useState("1.000");
  const atualPorClasse: Record<string, number> = {};
  for (const p of posicoes.filter((x) => x.ativo.quantidade > 0)) atualPorClasse[p.ativo.classe] = (atualPorClasse[p.ativo.classe] ?? 0) + p.valor;
  const classes = [...new Set([...Object.keys(atualPorClasse), ...Object.keys(alvoClasses)])] as ClasseAtivo[];
  const sugestao = rebalancear(atualPorClasse, alvoClasses as Record<string, number>, valorInputParaCentavos(aporteReb));
  const somaAlvo = Object.values(alvoClasses).reduce((s, v) => s + (v ?? 0), 0);

  return (
    <div className="space-y-4">
      <p className="text-xs text-texto-secundario">Simulações são estimativas com as taxas informadas; não são promessa de rendimento nem recomendação de investimento.</p>
      <Secao titulo="Juros compostos">
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo rotulo="Valor inicial (R$)" valor={inicial} onChange={setInicial} />
          <Campo rotulo="Aporte mensal (R$)" valor={aporte} onChange={setAporte} />
          <Campo rotulo="Taxa ao ano (%)" valor={taxa} onChange={setTaxa} />
          <Campo rotulo="Prazo (anos)" valor={anos} onChange={setAnos} />
        </div>
        <p className="mt-3 text-sm">Ao final: <strong>{reais(final.total)}</strong> · investido {reais(final.investido)} · juros {reais(final.total - final.investido)}</p>
        <div className="mt-2 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dados}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cor-borda)" />
              <XAxis dataKey="ano" tick={{ fontSize: 11, fill: "var(--cor-texto-secundario)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--cor-texto-secundario)" }} />
              <Tooltip formatter={(v) => reais(Number(v) * 100)} labelFormatter={(l) => `Ano ${l}`} contentStyle={tooltip} />
              <Area dataKey="total" name="Total" stroke="var(--cor-primaria)" fill="var(--cor-primaria)" fillOpacity={0.25} />
              <Area dataKey="investido" name="Investido" stroke="var(--cor-secundaria)" fill="var(--cor-secundaria)" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Secao>

      <Secao titulo="Comparador de renda fixa (já descontado o IR)">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Valor (R$)" valor={valorRF} onChange={setValorRF} />
          <Campo rotulo="Prazo (dias corridos)" valor={diasRF} onChange={setDiasRF} />
        </div>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs text-texto-secundario"><tr><th className="py-1.5">Opção</th><th className="text-right">Taxa a.a.</th><th className="text-right">IR</th><th className="text-right">Líquido</th><th className="text-right">Ganho líquido</th></tr></thead>
          <tbody>{comparacao.map((c, i) => (
            <tr key={c.nome} className={`border-t border-borda ${i === 0 ? "font-semibold" : ""}`}><td className="py-1.5">{c.nome}{c.isento ? " (isento)" : ""}</td><td className="text-right tabular-nums">{pct(c.taxaAnual)}</td><td className="text-right tabular-nums">{reais(c.ir)}</td><td className="text-right tabular-nums">{reais(c.liquido)}</td><td className="text-right tabular-nums text-sucesso">{reais(c.rendimentoLiquido)}</td></tr>
          ))}</tbody>
        </table>
        <p className="mt-2 text-[11px] text-texto-secundario">Com CDI {pct(indices.cdiAnual)}, Selic {pct(indices.selicAnual)} e IPCA {pct(indices.ipca12m)} mantidos no período. IR pela tabela regressiva.</p>
      </Secao>

      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Aposentadoria / meta de patrimônio">
          <div className="grid grid-cols-3 gap-2">
            <Campo rotulo="Quero chegar a (R$)" valor={alvo} onChange={setAlvo} />
            <Campo rotulo="Em (anos)" valor={prazo} onChange={setPrazo} />
            <Campo rotulo="Rendimento real (% a.a.)" valor={taxaReal} onChange={setTaxaReal} />
          </div>
          <p className="mt-3 text-sm">Partindo da carteira atual ({reais(total)}), guarde <strong>{reais(pmt)}</strong> por mês.</p>
          <p className="text-[11px] text-texto-secundario">Rendimento real = acima da inflação; o valor final fica em dinheiro de hoje.</p>
        </Secao>
        <Secao titulo="Liberdade financeira">
          <Campo rotulo="Aporte mensal (R$)" valor={aporteLib} onChange={setAporteLib} />
          <p className="mt-3 text-sm">Seus gastos reais: {reais(gastoMedio)}/mês (média dos últimos 3 meses no Dairus). Para viver de renda pela regra dos 4% ao ano: <strong>{reais(lib.alvo)}</strong>.</p>
          <p className="text-sm">{lib.meses === null ? "Com esse aporte, não chega em 100 anos." : lib.meses === 0 ? "Você já chegou lá." : `Tempo estimado: ${Math.floor(lib.meses / 12)} ano(s) e ${lib.meses % 12} mês(es), com ${num(taxaReal)}% real ao ano.`}</p>
        </Secao>
        <Secao titulo="Efeito da inflação">
          <Campo rotulo="Dinheiro parado (R$)" valor={parado} onChange={setParado} />
          <p className="mt-3 text-sm">Em 1 ano, com IPCA de {pct(indices.ipca12m)}, ele perde <strong className="text-erro">{reais(inflacao.perda)}</strong> de poder de compra (vale {reais(inflacao.poderDeCompra)} de hoje).</p>
        </Secao>
        <Secao titulo="Rebalanceamento">
          <p className="text-xs text-texto-secundario">Defina a divisão desejada (%) e quanto vai aportar: o Dairus diz onde colocar, sem vender nada.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(classes.length ? classes : (["ACAO", "FII", "CDB", "TESOURO"] as ClasseAtivo[])).map((c) => (
              <label key={c} className="flex items-center justify-between gap-2 text-xs text-texto-secundario">{ROTULO_CLASSE[c]}
                <input value={alvoClasses[c] ?? ""} onChange={(e) => setAlvoClasses({ ...alvoClasses, [c]: num(e.target.value) })} inputMode="decimal" placeholder="%" aria-label={`Alvo ${ROTULO_CLASSE[c]}`} className={`${CLASSE_INPUT} w-16 py-1`} />
              </label>
            ))}
          </div>
          <div className="mt-2"><Campo rotulo="Aporte (R$)" valor={aporteReb} onChange={setAporteReb} /></div>
          {somaAlvo > 0 ? (
            <ul className="mt-3 space-y-1 text-sm">{Object.entries(sugestao).map(([c, v]) => <li key={c} className="flex justify-between"><span>{ROTULO_CLASSE[c as ClasseAtivo] ?? c}</span><span className="tabular-nums">{reais(v)}</span></li>)}</ul>
          ) : <p className="mt-3 text-xs text-texto-secundario">Preencha os percentuais desejados.</p>}
          {somaAlvo > 0 && Math.round(somaAlvo) !== 100 && <p className="text-[11px] text-alerta">Os percentuais somam {somaAlvo}%; o cálculo usa a proporção entre eles.</p>}
        </Secao>
      </div>
    </div>
  );
}
