import { describe, expect, it } from "vitest";
import {
  aliquotaRegressiva,
  apurarIR,
  aporteNecessario,
  bensEDireitos,
  compararRendaFixa,
  jurosCompostos,
  liberdadeFinanceira,
  posicaoAte,
  rebalancear,
  rendaPassivaMensal,
  rendimentosDoAno,
  rentabilidade,
  taxaAnualRendaFixa,
  valorAtual,
  valorRendaFixa,
  vencimentoDarf,
  alertasCarteira,
  type Indices,
} from "./calculos";
import type { AtivoInvest, OperacaoInvest } from "../../types/investimentos";

const IND: Indices = { cdiAnual: 0.1, selicAnual: 0.1, ipca12m: 0.05 };

function ativo(p: Partial<AtivoInvest>): AtivoInvest {
  return {
    id: "a", codigo: "X", nome: null, classe: "ACAO", indexador: null, taxa: null, vencimento: null, objetivo: null, setor: null,
    risco: null, moeda: "BRL", cotacao: null, cotacao_em: null, alerta_acima: null, alerta_abaixo: null, ativo: true, notas: null,
    quantidade: 0, custo_centavos: 0, preco_medio: 0, proventos_centavos: 0, lucro_realizado_centavos: 0, primeira_compra: null, ...p,
  };
}

let seq = 0;
function op(p: Partial<OperacaoInvest>): OperacaoInvest {
  return {
    id: `o${seq++}`, ativo_id: "a", tipo: "COMPRA", data: "2026-01-01", quantidade: 0, preco_unitario: 0, taxas_centavos: 0,
    valor_centavos: 0, ir_retido_centavos: 0, custo_centavos: null, day_trade: false, conta_id: null, lancamento_id: null, notas: null, ...p,
  };
}

describe("renda fixa", () => {
  it("calcula a taxa pelo indexador", () => {
    expect(taxaAnualRendaFixa({ classe: "CDB", indexador: "CDI", taxa: 110 }, IND)).toBeCloseTo(0.11);
    expect(taxaAnualRendaFixa({ classe: "TESOURO", indexador: "IPCA", taxa: 6 }, IND)).toBeCloseTo(1.05 * 1.06 - 1);
    expect(taxaAnualRendaFixa({ classe: "CDB", indexador: "PRE", taxa: 12 }, IND)).toBeCloseTo(0.12);
    expect(taxaAnualRendaFixa({ classe: "POUPANCA", indexador: null, taxa: null }, IND)).toBeCloseTo(Math.pow(1.005, 12) - 1);
    expect(taxaAnualRendaFixa({ classe: "POUPANCA", indexador: null, taxa: null }, { ...IND, selicAnual: 0.08 })).toBeCloseTo(0.056);
  });

  it("aplica a tabela regressiva do IR", () => {
    expect(aliquotaRegressiva(100)).toBe(0.225);
    expect(aliquotaRegressiva(361)).toBe(0.175);
    expect(aliquotaRegressiva(800)).toBe(0.15);
  });

  it("estima o valor de um CDB de 100% do CDI após um ano, com IR", () => {
    const a = ativo({ classe: "CDB", indexador: "CDI", taxa: 100, quantidade: 1000, custo_centavos: 100_000, primeira_compra: "2025-01-01" });
    const v = valorRendaFixa(a, [op({ data: "2025-01-01", valor_centavos: 100_000 })], IND, "2026-01-01");
    expect(v.bruto).toBe(110_000);
    expect(v.aliquota).toBe(0.175);
    expect(v.ir).toBe(1_750);
    expect(v.liquido).toBe(108_250);
    const lci = valorRendaFixa({ ...a, classe: "LCI" }, [op({ data: "2025-01-01", valor_centavos: 100_000 })], IND, "2026-01-01");
    expect(lci.ir).toBe(0);
  });
});

describe("carteira", () => {
  it("usa a cotação, a estimativa ou o custo", () => {
    expect(valorAtual(ativo({ quantidade: 10, cotacao: 12.34, custo_centavos: 10_000 }), [], IND, "2026-01-01")).toEqual({ valor: 12_340, fonte: "COTACAO" });
    expect(valorAtual(ativo({ quantidade: 10, custo_centavos: 10_000 }), [], IND, "2026-01-01").fonte).toBe("CUSTO");
  });

  it("soma ganho de capital, proventos e lucro realizado", () => {
    const r = rentabilidade(ativo({ custo_centavos: 10_000, proventos_centavos: 500, lucro_realizado_centavos: 1_000 }), 12_000);
    expect(r.ganhoCapital).toBe(2_000);
    expect(r.resultadoTotal).toBe(3_500);
    expect(r.percentual).toBeCloseTo(0.35);
  });

  it("rebalanceia o aporte para a divisão desejada", () => {
    const r = rebalancear({ ACAO: 6_000, FII: 2_000, CDB: 2_000 }, { ACAO: 40, FII: 30, CDB: 30 }, 2_000);
    expect(r.ACAO).toBeUndefined();
    expect(r.FII + r.CDB).toBe(2_000);
    expect(r.FII).toBe(1_000);
  });

  it("calcula a renda passiva média dos últimos 12 meses", () => {
    const ops = [op({ tipo: "DIVIDENDO", data: "2026-03-10", valor_centavos: 1_200 }), op({ tipo: "JCP", data: "2026-05-10", valor_centavos: 1_000, ir_retido_centavos: 150 }), op({ tipo: "DIVIDENDO", data: "2024-01-10", valor_centavos: 99_999 })];
    expect(rendaPassivaMensal(ops, "2026-10-02")).toBe(Math.round((1_200 + 850) / 12));
  });

  it("avisa preço-alvo e vencimento", () => {
    const alertas = alertasCarteira([ativo({ codigo: "PETR4", cotacao: 40, alerta_acima: 38, quantidade: 1 }), ativo({ id: "b", codigo: "CDB X", vencimento: "2026-10-09", quantidade: 1 })], "2026-10-02");
    expect(alertas.map((a) => a.titulo)).toEqual(["PETR4 chegou a R$ 40.00", "CDB X vence em 7 dias"]);
  });
});

describe("simuladores", () => {
  it("juros compostos e aporte necessário batem entre si", () => {
    const serie = jurosCompostos(0, 1_000, 0.12, 12);
    const final = serie[12].total;
    expect(serie[12].investido).toBe(12_000);
    expect(final).toBeGreaterThan(12_000);
    expect(aporteNecessario(final, 0, 0.12, 12)).toBeCloseTo(1_000, 5);
  });

  it("compara renda fixa já com IR", () => {
    const [melhor, , pior] = compararRendaFixa(10_000, 365, [
      { nome: "CDB 110%", indexador: "CDI", taxa: 110, isento: false },
      { nome: "LCI 90%", indexador: "CDI", taxa: 90, isento: true },
      { nome: "Poupança", indexador: "POUPANCA", taxa: 0, isento: true },
    ], IND);
    expect(melhor.nome).toBe("CDB 110%");
    expect(melhor.ir).toBeCloseTo(1_000 * 1.1 * 0.175, 0);
    expect(pior.nome).toBe("Poupança");
  });

  it("calcula liberdade financeira pela regra dos 4%", () => {
    const r = liberdadeFinanceira(3_000, 900_000, 0, 0.04);
    expect(r.alvo).toBe(900_000);
    expect(r.meses).toBe(0);
    expect(liberdadeFinanceira(3_000, 0, 0, 0.04).meses).toBeNull();
  });
});

describe("imposto de renda", () => {
  const classes = new Map([["acao", "ACAO" as const], ["fii", "FII" as const]]);

  it("isenta vendas de ações até R$ 20 mil no mês e tributa FII a 20%", () => {
    const ops = [
      op({ ativo_id: "acao", tipo: "VENDA", data: "2026-03-10", valor_centavos: 1_500_000, custo_centavos: 1_000_000 }),
      op({ ativo_id: "fii", tipo: "VENDA", data: "2026-03-11", valor_centavos: 200_000, custo_centavos: 100_000 }),
    ];
    const [m] = apurarIR(ops, classes);
    expect(m.isento.ACOES).toBe(true);
    expect(m.imposto).toBe(20_000);
    expect(m.darf).toBe(20_000);
    expect(m.vencimento).toBe("2026-04-30");
  });

  it("compensa prejuízo e acumula DARF abaixo de R$ 10", () => {
    const ops = [
      op({ ativo_id: "acao", tipo: "VENDA", data: "2026-01-10", valor_centavos: 2_500_000, custo_centavos: 2_600_000 }),
      op({ ativo_id: "acao", tipo: "VENDA", data: "2026-02-10", valor_centavos: 3_000_000, custo_centavos: 2_850_000 }),
      op({ ativo_id: "fii", tipo: "VENDA", data: "2026-03-10", valor_centavos: 10_000, custo_centavos: 7_500 }),
      op({ ativo_id: "fii", tipo: "VENDA", data: "2026-04-10", valor_centavos: 10_000, custo_centavos: 7_500 }),
    ];
    const [jan, fev, mar, abr] = apurarIR(ops, classes);
    expect(jan.prejuizoAcumulado.ACOES).toBe(100_000);
    expect(fev.baseTributavel.ACOES).toBe(50_000);
    expect(fev.imposto).toBe(7_500);
    expect(mar.darf).toBe(0);
    expect(mar.acumuladoParaProximo).toBe(500);
    expect(abr.darf).toBe(1_000);
  });

  it("vencimento do DARF cai no último dia útil", () => {
    expect(vencimentoDarf("2026-04")).toBe("2026-05-29");
  });

  it("monta bens e direitos e rendimentos do ano", () => {
    const ops = [
      op({ ativo_id: "a", tipo: "COMPRA", data: "2025-05-01", quantidade: 10, valor_centavos: 10_000 }),
      op({ ativo_id: "a", tipo: "COMPRA", data: "2026-05-01", quantidade: 10, valor_centavos: 20_000 }),
      op({ ativo_id: "a", tipo: "DIVIDENDO", data: "2026-06-01", valor_centavos: 300 }),
      op({ ativo_id: "a", tipo: "JCP", data: "2026-07-01", valor_centavos: 1_000, ir_retido_centavos: 150 }),
    ];
    expect(posicaoAte(ops, "2025-12-31")).toEqual({ quantidade: 10, custo: 10_000 });
    const [linha] = bensEDireitos([ativo({ codigo: "PETR4" })], ops, 2026);
    expect(linha.grupo).toBe("03");
    expect(linha.situacaoAnterior).toBe(10_000);
    expect(linha.situacaoAtual).toBe(30_000);
    expect(rendimentosDoAno(ops, 2026)).toEqual({ isentos: 300, exclusivos: 850, porTipo: { DIVIDENDO: 300, JCP: 1_000, RENDIMENTO: 0 } });
  });
});
