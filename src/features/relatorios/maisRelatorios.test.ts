import { describe, expect, it } from "vitest";
import { compararMeses, fixosVariaveis, porDiaDoMes, porEtiqueta, porMeioDePagamento, poupancaMensal, ticket } from "./maisRelatorios";
import { CONTAS, lancamento } from "../../testes/dados";

const ls = [
  lancamento({ id: "1", data: "2026-09-05", descricao: "Mercado Bom" }, 10_000),
  { ...lancamento({ id: "2", data: "2026-09-05", descricao: "Netflix" }, 4_000), etiqueta: "ASSINATURA" as const },
  lancamento({ id: "3", data: "2026-09-20", descricao: "Uber" }, 2_000, "cartao-nu", "despesa-transporte"),
  lancamento({ id: "4", data: "2026-09-01", descricao: "Salário" }, 100_000, "receita-salario", "ativo-dinheiro"),
  lancamento({ id: "5", data: "2026-08-03", descricao: "Mercado" }, 8_000),
];

describe("mais relatórios", () => {
  it("agrupa por meio de pagamento e etiqueta", () => {
    expect(porMeioDePagamento(ls, CONTAS, "2026-09-01", "2026-09-30").map((i) => [i.chave, i.valor])).toEqual([["Dinheiro", 14_000], ["Nubank", 2_000]]);
    expect(porEtiqueta(ls, CONTAS, "2026-09-01", "2026-09-30", new Map([["3", ["trabalho"]]]))).toEqual([{ chave: "#trabalho", valor: 2_000, qtd: 1 }]);
  });

  it("dia do mês, fixos, ticket", () => {
    expect(porDiaDoMes(ls, CONTAS, "2026-09-01", "2026-09-30")[4]).toBe(14_000);
    expect(fixosVariaveis(ls, CONTAS, "2026-09-01", "2026-09-30")).toEqual({ fixos: 4_000, variaveis: 12_000 });
    expect(ticket(ls, CONTAS, "2026-09-01", "2026-09-30")).toEqual({ compras: 3, total: 16_000, medio: 5_333, porDia: 533, maior: 10_000 });
  });

  it("poupança e comparação de meses", () => {
    const p = poupancaMensal(ls, CONTAS, "2026-10-03", 3);
    expect(p.map((x) => x.mes)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(p[1].taxa).toBeCloseTo(0.84);
    expect(compararMeses(ls, CONTAS, "2026-08", "2026-09").find((x) => x.categoria === "Alimentação")).toEqual({ categoria: "Alimentação", a: 8_000, b: 14_000 });
  });
});
