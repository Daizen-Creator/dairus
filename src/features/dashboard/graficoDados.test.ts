import { describe, expect, it } from "vitest";
import { baldes, divisaoDoGrafico, granularidadeEfetiva, intervaloDoPeriodo, kpiDoGrafico, normalizarConfigGrafico, serieDoGrafico, tituloDoGrafico, type ConfigGrafico } from "./graficoDados";
import { CONTAS, conta, lancamento } from "../../testes/dados";

const HOJE = "2026-10-15";
const cfg = (c: Partial<ConfigGrafico>): ConfigGrafico => ({ metrica: "despesas", periodo: "mes", granularidade: "auto", exibicao: "barras", ...c });

const LS = [
  lancamento({ id: "sal", data: "2026-10-05", descricao: "Salário" }, 300_000, "receita-salario", "ativo-dinheiro"),
  lancamento({ id: "mer", data: "2026-10-06", descricao: "Mercado" }, 60_000),
  lancamento({ id: "uber", data: "2026-10-14", descricao: "Uber" }, 5_000, "ativo-dinheiro", "despesa-transporte"),
  lancamento({ id: "set", data: "2026-09-10", descricao: "Setembro" }, 20_000),
];

describe("gráfico personalizável", () => {
  it("períodos e comparação com o período anterior", () => {
    expect(intervaloDoPeriodo("7d", HOJE)).toMatchObject({ inicio: "2026-10-09", fim: HOJE, anterior: { inicio: "2026-10-02", fim: "2026-10-08" } });
    expect(intervaloDoPeriodo("mes", HOJE)).toMatchObject({ inicio: "2026-10-01", anterior: { inicio: "2026-09-01", fim: "2026-09-15" } });
    expect(intervaloDoPeriodo("6m", HOJE).inicio).toBe("2026-05-01");
    expect(intervaloDoPeriodo("ano", HOJE).anterior).toEqual({ inicio: "2025-01-01", fim: "2025-10-15" });
  });

  it("granularidade automática e pedaços do período", () => {
    expect(granularidadeEfetiva("auto", { inicio: "2026-10-01", fim: HOJE })).toBe("dia");
    expect(granularidadeEfetiva("auto", { inicio: "2026-08-01", fim: HOJE })).toBe("semana");
    expect(granularidadeEfetiva("auto", { inicio: "2026-01-01", fim: HOJE })).toBe("mes");
    const meses = baldes({ inicio: "2026-05-01", fim: HOJE }, "mes");
    expect(meses.map((b) => b.rotulo)).toEqual(["mai/26", "jun/26", "jul/26", "ago/26", "set/26", "out/26"]);
    expect(meses[5]).toMatchObject({ inicio: "2026-10-01", fim: HOJE });
    // Semanas começam na segunda; a primeira é cortada no início do período.
    const semanas = baldes({ inicio: "2026-10-01", fim: HOJE }, "semana");
    expect(semanas[0]).toMatchObject({ rotulo: "28/09", inicio: "2026-10-01", fim: "2026-10-04" });
    const ultimaSemana = semanas[semanas.length - 1];
    expect(ultimaSemana).toMatchObject({ inicio: "2026-10-12", fim: HOJE });
  });

  it("série de despesas, receitas e resultado", () => {
    const despesas = serieDoGrafico(LS, CONTAS, cfg({ periodo: "3m", granularidade: "mes" }), HOJE);
    expect(despesas).toEqual([{ rotulo: "ago/26", valor: 0 }, { rotulo: "set/26", valor: 20_000 }, { rotulo: "out/26", valor: 65_000 }]);
    const resultado = serieDoGrafico(LS, CONTAS, cfg({ metrica: "resultado", periodo: "3m", granularidade: "mes" }), HOJE);
    expect(resultado[resultado.length - 1]!.valor).toBe(235_000);
  });

  it("saldo no fim de cada pedaço, voltando a partir do saldo de hoje", () => {
    // Saldo de hoje no Dinheiro: 50.000. Em outubro entrou 300.000 e saíram 65.000.
    const s = serieDoGrafico(LS, CONTAS, cfg({ metrica: "saldo", periodo: "3m", granularidade: "mes" }), HOJE);
    expect(s[s.length - 1]!.valor).toBe(50_000);
    expect(s[1].valor).toBe(50_000 - 300_000 + 65_000);
  });

  it("categoria com subcategorias, rosca com 'Outras' e KPI", () => {
    const contas = [...CONTAS, conta({ id: "despesa-mercado", nome: "Mercado", tipo: "DESPESA", categoria_pai_id: "despesa-alimentacao" })];
    const ls = [...LS, lancamento({ id: "sub", data: "2026-10-07", descricao: "Feira" }, 1_000, "ativo-dinheiro", "despesa-mercado")];
    expect(kpiDoGrafico(ls, contas, cfg({ metrica: "categoria", categoriaId: "despesa-alimentacao" }), HOJE).atual).toBe(61_000);
    expect(divisaoDoGrafico(LS, CONTAS, cfg({}), HOJE)).toEqual([{ nome: "Alimentação", valor: 60_000 }, { nome: "Transporte", valor: 5_000 }]);
    expect(divisaoDoGrafico(LS, CONTAS, cfg({}), HOJE, 1)).toEqual([{ nome: "Alimentação", valor: 60_000 }, { nome: "Outras", valor: 5_000, outras: true }]);
    // Outubro (1 a 15) contra setembro (1 a 15).
    expect(kpiDoGrafico(LS, CONTAS, cfg({}), HOJE)).toEqual({ atual: 65_000, anterior: 20_000, variacao: 2.25 });
  });

  it("configuração estragada volta ao padrão e o título é automático", () => {
    expect(normalizarConfigGrafico({ metrica: "x", periodo: "12m", exibicao: "rosca" })).toEqual({ metrica: "despesas", periodo: "12m", granularidade: "auto", exibicao: "rosca", categoriaId: null });
    expect(tituloDoGrafico(cfg({ periodo: "6m" }), CONTAS)).toBe("Despesas · últimos 6 meses");
    expect(tituloDoGrafico(cfg({ metrica: "categoria", categoriaId: "despesa-transporte" }), CONTAS)).toBe("Transporte · este mês");
  });
});
