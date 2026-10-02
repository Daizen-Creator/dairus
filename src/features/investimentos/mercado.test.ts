import { describe, expect, it } from "vitest";
import { dataBcb, idCripto, lerCotacaoBrapi, lerSerieBcb } from "./mercado";
import { classePeloTicker, lerExtratoB3, numeroBR, tickerNormal } from "./importacaoB3";

describe("dados de mercado", () => {
  it("lê séries do Banco Central", () => {
    expect(dataBcb("02/10/2026")).toBe("2026-10-02");
    expect(lerSerieBcb([{ data: "01/10/2026", valor: "15.00" }, { data: "x" }])).toEqual([{ data: "2026-10-01", valor: 15 }]);
    expect(lerSerieBcb({ erro: true })).toEqual([]);
  });

  it("lê a cotação, o histórico e os dividendos da brapi", () => {
    const c = lerCotacaoBrapi({
      results: [{
        symbol: "PETR4", longName: "Petrobras", regularMarketPrice: 38.5, regularMarketChangePercent: -1.2, priceEarnings: 4.1,
        defaultKeyStatistics: { dividendYield: 12.5, priceToBook: 1.1 },
        historicalDataPrice: [{ date: 1759363200, close: 37 }],
        dividendsData: { cashDividends: [{ paymentDate: "2026-11-20T00:00:00.000Z", lastDatePrior: "2026-10-30T00:00:00.000Z", rate: 0.5, label: "DIVIDENDO" }] },
      }],
    })!;
    expect(c.preco).toBe(38.5);
    expect(c.dividendYield).toBeCloseTo(0.125);
    expect(c.historico[0].valor).toBe(37);
    expect(c.dividendos[0]).toEqual({ dataCom: "2026-10-30", pagamento: "2026-11-20", valor: 0.5, tipo: "DIVIDENDO" });
    expect(lerCotacaoBrapi({ results: [] })).toBeNull();
  });

  it("traduz códigos de cripto para a CoinGecko", () => {
    expect(idCripto("btc")).toBe("bitcoin");
    expect(idCripto("pepe")).toBe("pepe");
  });
});

describe("importação da B3", () => {
  it("entende números, tickers e classes", () => {
    expect(numeroBR("R$ 1.234,56")).toBe(1234.56);
    expect(numeroBR("-")).toBe(0);
    expect(tickerNormal("petr4f")).toBe("PETR4");
    expect(classePeloTicker("MXRF11")).toBe("FII");
    expect(classePeloTicker("BOVA11")).toBe("ETF");
    expect(classePeloTicker("AAPL34")).toBe("BDR");
    expect(classePeloTicker("ITUB4")).toBe("ACAO");
  });

  it("lê o extrato de negociação", () => {
    const csv = "Data do Negócio;Tipo de Movimentação;Mercado;Prazo/Vencimento;Instituição;Código de Negociação;Quantidade;Preço;Valor\n" +
      "10/03/2026;Compra;Mercado à Vista;-;XP;PETR4;100;R$ 30,50;R$ 3.050,00\n" +
      "11/03/2026;Venda;Mercado Fracionário;-;XP;ITUB4F;5;R$ 35,00;R$ 175,00\n";
    const r = lerExtratoB3(csv);
    expect(r.formato).toBe("NEGOCIACAO");
    expect(r.linhas).toEqual([
      { tipo: "COMPRA", data: "2026-03-10", codigo: "PETR4", quantidade: 100, preco: 30.5, valorCentavos: 305_000 },
      { tipo: "VENDA", data: "2026-03-11", codigo: "ITUB4", quantidade: 5, preco: 35, valorCentavos: 17_500 },
    ]);
  });

  it("lê proventos do extrato de movimentação e ignora transferências", () => {
    const csv = "Entrada/Saída;Data;Movimentação;Produto;Instituição;Quantidade;Preço unitário;Valor da Operação\n" +
      "Credito;15/04/2026;Dividendo;PETR4 - PETROLEO BRASILEIRO S.A. PETROBRAS;XP;100;0,5;50\n" +
      "Credito;16/04/2026;Juros Sobre Capital Próprio;ITUB4 - ITAU UNIBANCO;XP;10;0,2;2\n" +
      "Credito;17/04/2026;Transferência - Liquidação;PETR4 - PETROBRAS;XP;100;-;-\n";
    const r = lerExtratoB3(csv);
    expect(r.formato).toBe("MOVIMENTACAO");
    expect(r.linhas.map((l) => [l.tipo, l.codigo, l.valorCentavos])).toEqual([["DIVIDENDO", "PETR4", 5_000], ["JCP", "ITUB4", 200]]);
    expect(r.ignoradas).toBe(1);
  });
});
