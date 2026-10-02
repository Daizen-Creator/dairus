// Dados de mercado automáticos: cotações (brapi), Selic/CDI/IPCA (Banco
// Central, SGS), dólar/euro (AwesomeAPI) e cripto (CoinGecko). As consultas
// passam pelo Rust (lista fixa de serviços) e os índices ficam guardados no
// banco para uso sem internet.

import { lerPreferencia } from "../../services/armazenamento";
import { investimentos } from "../../services/investimentos";
import type { AtivoInvest, PontoIndicador } from "../../types/investimentos";
import { CLASSES_BOLSA } from "../../types/investimentos";
import { INDICES_PADRAO, type Indices } from "./calculos";

export const SERIES_BCB = {
  selic: 432, // Meta Selic, % a.a.
  cdi: 4389, // CDI anualizado (base 252), % a.a.
  cdiDiario: 12, // CDI diário, % a.d.
  ipcaMensal: 433, // IPCA, % no mês
  ipca12m: 13522, // IPCA acumulado em 12 meses, %
  poupanca: 195, // Rendimento da poupança, % no período
} as const;

/** "02/10/2026" → "2026-10-02". */
export function dataBcb(texto: string): string {
  const [d, m, a] = texto.split("/");
  return `${a}-${m}-${d}`;
}

export function lerSerieBcb(json: unknown): PontoIndicador[] {
  if (!Array.isArray(json)) return [];
  return json
    .map((p: { data?: string; valor?: string }) => ({
      data: p.data && /^\d{2}\/\d{2}\/\d{4}$/.test(p.data) ? dataBcb(p.data) : "",
      valor: p.valor === undefined || p.valor === "" ? NaN : Number(String(p.valor).replace(",", ".")),
    }))
    .filter((p) => p.data && Number.isFinite(p.valor));
}

const urlBcbUltimos = (serie: number, n: number) => `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/${n}?formato=json`;
const fmtBcb = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const urlBcbPeriodo = (serie: number, de: string, ate: string) =>
  `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados?formato=json&dataInicial=${fmtBcb(de)}&dataFinal=${fmtBcb(ate)}`;

async function ultimoValor(nome: string, serie: number): Promise<number | null> {
  try {
    const pontos = lerSerieBcb(await investimentos.buscarJson(urlBcbUltimos(serie, 1)));
    if (pontos.length) {
      await investimentos.salvarIndicadores(nome, pontos);
      return pontos[pontos.length - 1].valor;
    }
  } catch {
    // sem internet: usa o último valor guardado
  }
  const guardados = await investimentos.listarIndicadores(nome, "1900-01-01").catch(() => []);
  return guardados.length ? guardados[guardados.length - 1].valor : null;
}

/** Selic, CDI e IPCA atuais (frações). Sem internet, usa os últimos guardados; sem nada, valores de referência. */
export async function carregarIndices(): Promise<Indices & { fonte: "BCB" | "PADRAO" }> {
  const [selic, cdi, ipca] = await Promise.all([ultimoValor("selic", SERIES_BCB.selic), ultimoValor("cdi", SERIES_BCB.cdi), ultimoValor("ipca12m", SERIES_BCB.ipca12m)]);
  if (selic === null && cdi === null && ipca === null) return { ...INDICES_PADRAO, fonte: "PADRAO" };
  return {
    selicAnual: (selic ?? INDICES_PADRAO.selicAnual * 100) / 100,
    cdiAnual: (cdi ?? (selic !== null ? selic - 0.1 : INDICES_PADRAO.cdiAnual * 100)) / 100,
    ipca12m: (ipca ?? INDICES_PADRAO.ipca12m * 100) / 100,
    fonte: "BCB",
  };
}

/** Série diária/mensal de um período (para comparar a carteira com CDI, IPCA e poupança). */
export async function serieBcb(nome: keyof typeof SERIES_BCB, de: string, ate: string): Promise<PontoIndicador[]> {
  try {
    const pontos = lerSerieBcb(await investimentos.buscarJson(urlBcbPeriodo(SERIES_BCB[nome], de, ate)));
    if (pontos.length) await investimentos.salvarIndicadores(nome, pontos);
    return pontos;
  } catch {
    return (await investimentos.listarIndicadores(nome, de).catch(() => [])).filter((p) => p.data <= ate);
  }
}

// ---------------------------------------------------------------------------
// Cotações

export interface CotacaoBrapi {
  ticker: string;
  nome: string | null;
  preco: number | null;
  variacaoDia: number | null;
  historico: PontoIndicador[];
  precoLucro: number | null;
  dividendYield: number | null;
  precoValorPatrimonial: number | null;
  dividendos: Array<{ dataCom: string | null; pagamento: string | null; valor: number; tipo: string }>;
}

const isoDeUnix = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);
const isoDeTexto = (t: unknown) => (typeof t === "string" && t.length >= 10 ? t.slice(0, 10) : null);

export function lerCotacaoBrapi(json: unknown): CotacaoBrapi | null {
  const r = (json as { results?: Array<Record<string, unknown>> })?.results?.[0];
  if (!r) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const historico = Array.isArray(r.historicalDataPrice)
    ? (r.historicalDataPrice as Array<{ date: number; close: number }>).filter((p) => num(p.close) !== null).map((p) => ({ data: isoDeUnix(p.date), valor: p.close }))
    : [];
  const stats = (r.defaultKeyStatistics ?? {}) as Record<string, unknown>;
  const dividendos = Array.isArray((r.dividendsData as { cashDividends?: unknown[] } | undefined)?.cashDividends)
    ? ((r.dividendsData as { cashDividends: Array<Record<string, unknown>> }).cashDividends).map((d) => ({
        dataCom: isoDeTexto(d.lastDatePrior),
        pagamento: isoDeTexto(d.paymentDate),
        valor: num(d.rate) ?? 0,
        tipo: String(d.label ?? "Provento"),
      }))
    : [];
  const dy = num(stats.dividendYield) ?? num(r.dividendYield);
  return {
    ticker: String(r.symbol ?? ""),
    nome: (r.longName as string) ?? (r.shortName as string) ?? null,
    preco: num(r.regularMarketPrice),
    variacaoDia: num(r.regularMarketChangePercent),
    historico,
    precoLucro: num(r.priceEarnings),
    dividendYield: dy !== null && dy > 1 ? dy / 100 : dy,
    precoValorPatrimonial: num(stats.priceToBook),
    dividendos,
  };
}

async function tokenBrapi(): Promise<string> {
  return ((await lerPreferencia<string>("brapi_token")) ?? "").trim();
}

export async function cotacaoBrapi(ticker: string, opcoes: { range?: "1mo" | "3mo" | "1y" | "5y"; fundamentos?: boolean } = {}): Promise<CotacaoBrapi | null> {
  const token = await tokenBrapi();
  const p = new URLSearchParams();
  if (token) p.set("token", token);
  if (opcoes.range) {
    p.set("range", opcoes.range);
    p.set("interval", opcoes.range === "5y" ? "1mo" : "1d");
  }
  if (opcoes.fundamentos) {
    p.set("fundamental", "true");
    p.set("dividends", "true");
    p.set("modules", "defaultKeyStatistics");
  }
  const json = await investimentos.buscarJson(`https://brapi.dev/api/quote/${encodeURIComponent(ticker.toUpperCase())}?${p.toString()}`);
  return lerCotacaoBrapi(json);
}

/** Ids da CoinGecko para os códigos mais comuns (outros: use o id da CoinGecko como código). */
const IDS_CRIPTO: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", USDT: "tether", USDC: "usd-coin", BNB: "binancecoin", XRP: "ripple",
  ADA: "cardano", DOGE: "dogecoin", DOT: "polkadot", LTC: "litecoin", MATIC: "matic-network", AVAX: "avalanche-2", LINK: "chainlink",
};
export const idCripto = (codigo: string) => IDS_CRIPTO[codigo.toUpperCase()] ?? codigo.toLowerCase();

export async function cotacoesCripto(codigos: string[]): Promise<Record<string, { preco: number; variacaoDia: number | null }>> {
  if (!codigos.length) return {};
  const ids = [...new Set(codigos.map(idCripto))];
  const json = (await investimentos.buscarJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=brl&include_24hr_change=true`)) as Record<string, { brl?: number; brl_24h_change?: number }>;
  const saida: Record<string, { preco: number; variacaoDia: number | null }> = {};
  for (const c of codigos) {
    const r = json[idCripto(c)];
    if (r?.brl) saida[c.toUpperCase()] = { preco: r.brl, variacaoDia: r.brl_24h_change ?? null };
  }
  return saida;
}

export interface Moedas {
  dolar: number | null;
  euro: number | null;
  variacaoDolar: number | null;
  variacaoEuro: number | null;
}

export async function cotacaoMoedas(): Promise<Moedas> {
  const json = (await investimentos.buscarJson("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL")) as Record<string, { bid?: string; pctChange?: string }>;
  const n = (v?: string) => (v !== undefined && Number.isFinite(Number(v)) ? Number(v) : null);
  return { dolar: n(json.USDBRL?.bid), euro: n(json.EURBRL?.bid), variacaoDolar: n(json.USDBRL?.pctChange), variacaoEuro: n(json.EURBRL?.pctChange) };
}

export interface ResultadoAtualizacao {
  atualizados: number;
  falhas: string[];
  variacoes: Record<string, number | null>;
}

/** Atualiza as cotações de todos os ativos de bolsa e cripto da carteira. */
export async function atualizarCotacoesCarteira(ativos: AtivoInvest[]): Promise<ResultadoAtualizacao> {
  const cotacoes: Array<{ id: string; cotacao: number }> = [];
  const falhas: string[] = [];
  const variacoes: Record<string, number | null> = {};
  const ativosAbertos = ativos.filter((a) => a.ativo);
  for (const a of ativosAbertos.filter((x) => CLASSES_BOLSA.includes(x.classe))) {
    try {
      const c = await cotacaoBrapi(a.codigo);
      if (c?.preco !== null && c?.preco !== undefined) {
        cotacoes.push({ id: a.id, cotacao: c.preco });
        variacoes[a.id] = c.variacaoDia;
      } else falhas.push(a.codigo);
    } catch (e) {
      falhas.push(`${a.codigo} (${String(e)})`);
    }
  }
  const cripto = ativosAbertos.filter((x) => x.classe === "CRIPTO");
  if (cripto.length) {
    try {
      const precos = await cotacoesCripto(cripto.map((c) => c.codigo));
      for (const c of cripto) {
        const p = precos[c.codigo.toUpperCase()];
        if (p) {
          cotacoes.push({ id: c.id, cotacao: p.preco });
          variacoes[c.id] = p.variacaoDia;
        } else falhas.push(c.codigo);
      }
    } catch (e) {
      falhas.push(`cripto (${String(e)})`);
    }
  }
  const atualizados = cotacoes.length ? await investimentos.atualizarCotacoes(cotacoes) : 0;
  return { atualizados, falhas, variacoes };
}
