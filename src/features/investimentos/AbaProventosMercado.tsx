import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { formatarCentavos, formatarDataISOParaBR, valorInputParaCentavos } from "../../services/formato";
import { CLASSES_BOLSA } from "../../types/investimentos";
import { capitalParaRenda, proventosPorMes, reinvestimento, rendaPassivaMensal } from "./calculos";
import { cotacaoBrapi, cotacaoMoedas, cotacoesCripto, type CotacaoBrapi, type Moedas } from "./mercado";
import type { Carteira } from "./useCarteira";

const tooltip = { background: "var(--cor-cartao)", border: "1px solid var(--cor-borda)", borderRadius: 8 };
const reais = (c: number) => formatarCentavos(Math.round(c));
const pct = (v: number | null | undefined, casas = 2) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(casas).replace(".", ",")}%`);

export function AbaProventos({ carteira }: { carteira: Carteira }) {
  const { ops, ativos, hoje, posicoes } = carteira;
  const [rendaDesejada, setRendaDesejada] = useState("500");
  const [rendimentoMensal, setRendimentoMensal] = useState("0,8");
  const [anos, setAnos] = useState("10");
  const [agenda, setAgenda] = useState<Array<{ codigo: string; dataCom: string | null; pagamento: string | null; valor: number; tipo: string; quantidade: number }>>([]);
  const [buscando, setBuscando] = useState(false);

  const porMes = proventosPorMes(ops);
  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 12 + i, 1)).toISOString().slice(0, 7);
    return { mes: `${d.slice(5, 7)}/${d.slice(2, 4)}`, valor: (porMes.get(d) ?? 0) / 100 };
  });
  const porAtivo = ativos
    .map((a) => ({ codigo: a.codigo, total: a.proventos_centavos }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);
  const media = rendaPassivaMensal(ops, hoje);
  const total = posicoes.filter((p) => p.ativo.quantidade > 0).reduce((s, p) => s + p.valor, 0);
  const rm = Number(rendimentoMensal.replace(",", ".")) / 100;
  const capital = capitalParaRenda(valorInputParaCentavos(rendaDesejada), rm);
  const dyAnual = total > 0 ? (media * 12) / total : 0;
  const reinv = reinvestimento(total, dyAnual, 0.04, Math.max(1, Number(anos) || 10));

  async function buscarAgenda() {
    setBuscando(true);
    const saida: typeof agenda = [];
    for (const a of ativos.filter((x) => x.ativo && x.quantidade > 0 && CLASSES_BOLSA.includes(x.classe))) {
      try {
        const c = await cotacaoBrapi(a.codigo, { fundamentos: true });
        for (const d of c?.dividendos ?? []) if ((d.pagamento ?? d.dataCom ?? "") >= hoje.slice(0, 7)) saida.push({ codigo: a.codigo, ...d, quantidade: a.quantidade });
      } catch {
        // ativo sem dados de dividendos no plano da brapi
      }
    }
    setAgenda(saida.sort((x, y) => (x.pagamento ?? x.dataCom ?? "").localeCompare(y.pagamento ?? y.dataCom ?? "")));
    setBuscando(false);
    if (!saida.length) toast.info("Nenhum provento futuro encontrado (o plano gratuito da brapi pode não trazer dividendos; configure um token).");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Secao titulo="Proventos recebidos (12 meses, líquidos)">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={meses}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cor-borda)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--cor-texto-secundario)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--cor-texto-secundario)" }} />
                <Tooltip formatter={(v) => reais(Number(v) * 100)} contentStyle={tooltip} />
                <Bar dataKey="valor" name="Proventos" fill="var(--cor-sucesso)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-texto-secundario">Média mensal: <strong className="text-texto-primario">{reais(media)}</strong> · rendimento anual estimado da carteira: {pct(dyAnual)} (estimativa a partir dos últimos 12 meses).</p>
        </Secao>
        <Secao titulo="Por ativo (desde o início)">
          {porAtivo.length === 0 ? <p className="text-sm text-texto-secundario">Nenhum provento registrado.</p> : (
            <ul className="space-y-1 text-sm">{porAtivo.map((x) => <li key={x.codigo} className="flex justify-between"><span>{x.codigo}</span><span className="tabular-nums">{reais(x.total)}</span></li>)}</ul>
          )}
        </Secao>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Meta de renda passiva">
          <div className="grid grid-cols-2 gap-2 text-xs text-texto-secundario">
            <label>Renda por mês (R$)<input value={rendaDesejada} onChange={(e) => setRendaDesejada(e.target.value)} inputMode="decimal" className={`${CLASSE_INPUT} mt-1 w-full`} /></label>
            <label>Rendimento mensal esperado (%)<input value={rendimentoMensal} onChange={(e) => setRendimentoMensal(e.target.value)} inputMode="decimal" className={`${CLASSE_INPUT} mt-1 w-full`} /></label>
          </div>
          <p className="mt-3 text-sm text-texto-primario">Capital necessário: <strong>{Number.isFinite(capital) ? reais(capital) : "—"}</strong></p>
          <p className="text-xs text-texto-secundario">Você tem {reais(total)} ({Number.isFinite(capital) && capital > 0 ? pct(total / capital, 0) : "—"} do caminho). Estimativa: rendimentos variam e não são garantidos.</p>
        </Secao>
        <Secao titulo="Reinvestindo os proventos">
          <label className="text-xs text-texto-secundario">Anos<input value={anos} onChange={(e) => setAnos(e.target.value)} inputMode="numeric" className={`${CLASSE_INPUT} ml-2 w-20`} /></label>
          <p className="mt-3 text-sm text-texto-primario">Reinvestindo: <strong>{reais(reinv.comReinvestir)}</strong> · sem reinvestir (somando o que recebeu): {reais(reinv.semReinvestir)}</p>
          <p className="text-xs text-texto-secundario">Simulação com o rendimento atual da carteira ({pct(dyAnual)} a.a.) e valorização de 4% a.a. Diferença: {reais(reinv.diferenca)}.</p>
        </Secao>
      </div>

      <Secao titulo="Agenda de proventos" acao={<Button tamanho="pequeno" variante="secundaria" onClick={buscarAgenda} disabled={buscando}><RefreshCw size={13} className={buscando ? "animate-spin" : ""} /> Buscar datas</Button>}>
        {agenda.length === 0 ? <p className="text-sm text-texto-secundario">Clique em “Buscar datas” para ver datas com e de pagamento anunciadas dos seus ativos (via brapi).</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-texto-secundario"><tr><th className="py-1.5">Ativo</th><th>Tipo</th><th>Data com</th><th>Pagamento</th><th className="text-right">Por cota</th><th className="text-right">Estimado p/ você</th></tr></thead>
            <tbody>{agenda.map((d, i) => (
              <tr key={i} className="border-t border-borda"><td className="py-1.5">{d.codigo}</td><td>{d.tipo}</td><td>{d.dataCom ? formatarDataISOParaBR(d.dataCom) : "—"}</td><td>{d.pagamento ? formatarDataISOParaBR(d.pagamento) : "—"}</td><td className="text-right tabular-nums">R$ {d.valor.toFixed(4).replace(".", ",")}</td><td className="text-right tabular-nums">{reais(d.valor * d.quantidade * 100)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Secao>
    </div>
  );
}

const RANGES = [
  { value: "1mo", label: "1 mês" },
  { value: "3mo", label: "3 meses" },
  { value: "1y", label: "1 ano" },
  { value: "5y", label: "5 anos" },
];

export function AbaMercado({ carteira }: { carteira: Carteira }) {
  const { indices, ativos } = carteira;
  const [moedas, setMoedas] = useState<Moedas | null>(null);
  const [cripto, setCripto] = useState<Record<string, { preco: number; variacaoDia: number | null }>>({});
  const [ticker, setTicker] = useState(ativos.find((a) => CLASSES_BOLSA.includes(a.classe))?.codigo ?? "PETR4");
  const [range, setRange] = useState<"1mo" | "3mo" | "1y" | "5y">("1y");
  const [detalhe, setDetalhe] = useState<CotacaoBrapi | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    cotacaoMoedas().then(setMoedas).catch(() => {});
    cotacoesCripto(["BTC", "ETH", ...ativos.filter((a) => a.classe === "CRIPTO").map((a) => a.codigo)]).then(setCripto).catch(() => {});
  }, [ativos]);

  async function consultar() {
    try {
      setCarregando(true);
      setErro(null);
      setDetalhe(await cotacaoBrapi(ticker, { range, fundamentos: true }));
    } catch (e) {
      setErro(String(e));
      setDetalhe(null);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    consultar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const serie = (detalhe?.historico ?? []).map((p) => ({ data: p.data.slice(5).split("-").reverse().join("/"), preco: p.valor }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Selic", pct(indices.selicAnual)],
          ["CDI", pct(indices.cdiAnual)],
          ["IPCA 12 meses", pct(indices.ipca12m)],
          ["Dólar", moedas?.dolar ? `R$ ${moedas.dolar.toFixed(2).replace(".", ",")}` : "—"],
          ["Euro", moedas?.euro ? `R$ ${moedas.euro.toFixed(2).replace(".", ",")}` : "—"],
          ["Bitcoin", cripto.BTC ? reais(cripto.BTC.preco * 100) : "—"],
        ].map(([nome, valor]) => (
          <div key={nome} className="rounded-xl border border-borda bg-cartao p-3">
            <p className="text-xs text-texto-secundario">{nome}</p>
            <p className="text-lg font-semibold tabular-nums text-texto-primario">{valor}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-texto-secundario">Fontes: Banco Central (SGS) para Selic, CDI e IPCA; AwesomeAPI para câmbio; CoinGecko para cripto; brapi para a bolsa.{indices.fonte === "PADRAO" ? " Sem conexão com o Banco Central: mostrando valores de referência." : ""}</p>

      <Secao
        titulo="Ativo da bolsa"
        acao={
          <form onSubmit={(e) => { e.preventDefault(); consultar(); }} className="flex flex-wrap items-center gap-2">
            <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} aria-label="Código do ativo" className={`${CLASSE_INPUT} w-28 py-1`} />
            <Select aria-label="Período" value={range} onValueChange={(v) => setRange(v as typeof range)} options={RANGES} className="w-28" />
            <Button tamanho="pequeno" type="submit" disabled={carregando}>Consultar</Button>
          </form>
        }
      >
        {erro && <p className="text-sm text-erro">{erro}</p>}
        {detalhe && (
          <>
            <div className="flex flex-wrap items-baseline gap-3">
              <p className="text-lg font-semibold text-texto-primario">{detalhe.ticker} {detalhe.nome ? <span className="text-sm font-normal text-texto-secundario">· {detalhe.nome}</span> : null}</p>
              <p className="text-xl font-bold tabular-nums">{detalhe.preco !== null ? reais(detalhe.preco * 100) : "—"}</p>
              {detalhe.variacaoDia !== null && <p className={detalhe.variacaoDia >= 0 ? "text-sucesso" : "text-erro"}>{detalhe.variacaoDia >= 0 ? "▲" : "▼"} {Math.abs(detalhe.variacaoDia).toFixed(2).replace(".", ",")}% hoje</p>}
            </div>
            <div className="mt-3 h-64">
              {serie.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serie}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--cor-borda)" />
                    <XAxis dataKey="data" tick={{ fontSize: 11, fill: "var(--cor-texto-secundario)" }} minTickGap={24} />
                    <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "var(--cor-texto-secundario)" }} />
                    <Tooltip formatter={(v) => `R$ ${Number(v).toFixed(2).replace(".", ",")}`} contentStyle={tooltip} />
                    <Line type="monotone" dataKey="preco" stroke="var(--cor-primaria)" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-texto-secundario">Histórico indisponível para este período (o plano gratuito da brapi limita o histórico; configure um token).</p>}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div><p className="text-xs text-texto-secundario">P/L</p><p className="tabular-nums">{detalhe.precoLucro?.toFixed(2).replace(".", ",") ?? "—"}</p></div>
              <div><p className="text-xs text-texto-secundario">Dividend yield</p><p className="tabular-nums">{pct(detalhe.dividendYield)}</p></div>
              <div><p className="text-xs text-texto-secundario">P/VP</p><p className="tabular-nums">{detalhe.precoValorPatrimonial?.toFixed(2).replace(".", ",") ?? "—"}</p></div>
            </div>
            <p className="mt-2 text-[11px] text-texto-secundario">Indicadores informativos; não são recomendação de compra ou venda.</p>
          </>
        )}
      </Secao>
    </div>
  );
}
