import { describe, expect, it } from "vitest";
import { dreComparativa, fluxoDeCaixa, indicadores, periodoAnterior, saldosInvertidos } from "./analiseContabil";
import { CONTAS, lancamento } from "../../testes/dados";

const ls = [
  lancamento({ id: "s1", data: "2026-08-05", descricao: "Salário" }, 300_000, "receita-salario", "ativo-dinheiro"),
  lancamento({ id: "m1", data: "2026-08-10", descricao: "Mercado" }, 50_000),
  lancamento({ id: "s2", data: "2026-09-05", descricao: "Salário" }, 300_000, "receita-salario", "ativo-dinheiro"),
  lancamento({ id: "m2", data: "2026-09-10", descricao: "Mercado" }, 75_000),
  lancamento({ id: "c1", data: "2026-09-12", descricao: "Loja" }, 20_000, "cartao-nu", "despesa-transporte"),
];

describe("análise contábil", () => {
  it("período anterior do mesmo tamanho", () => {
    expect(periodoAnterior("2026-09-01", "2026-09-30")).toEqual({ inicio: "2026-08-02", fim: "2026-08-31" });
  });

  it("indicadores", () => {
    const i = indicadores(ls, CONTAS, "2026-09-01", "2026-09-30");
    expect(i.receitas).toBe(300_000);
    expect(i.despesas).toBe(95_000);
    expect(i.margemPoupanca).toBeCloseTo(205_000 / 300_000);
    expect(i.ativoCirculante).toBe(475_000);
    expect(i.passivoTotal).toBe(20_000);
    expect(i.liquidezCorrente).toBeCloseTo(23.75);
  });

  it("DRE comparativa com vertical", () => {
    const d = dreComparativa(ls, CONTAS, "DESPESA", "2026-09-01", "2026-09-30");
    const ali = d.find((x) => x.conta.id === "despesa-alimentacao")!;
    expect(ali).toMatchObject({ atual: 75_000, anterior: 50_000 });
    expect(ali.variacao).toBeCloseTo(0.5);
    expect(ali.vertical).toBeCloseTo(0.25);
  });

  it("fluxo de caixa e saldos invertidos", () => {
    const f = fluxoDeCaixa(ls, CONTAS, "2026-09-01", "2026-09-30");
    expect(f).toMatchObject({ entradasOperacionais: 300_000, saidasOperacionais: -75_000, variacaoCaixa: 225_000 });
    const inv = saldosInvertidos([lancamento({ id: "x", data: "2026-09-01", descricao: "x" }, 999_999)], CONTAS, "2026-09-30");
    expect(inv.map((l) => l.conta.id)).toEqual(["ativo-dinheiro"]);
  });
});
