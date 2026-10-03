import { describe, expect, it } from "vitest";
import { calcularFatos, fatosEmTexto } from "./fatosFinanceiros";
import { CONTAS, lancamento } from "../testes/dados";

describe("fatos financeiros", () => {
  const ls = [
    lancamento({ id: "1", data: "2026-10-02", descricao: "Mercado" }, 10_000),
    lancamento({ id: "2", data: "2026-09-02", descricao: "Mercado" }, 6_000),
    lancamento({ id: "3", data: "2026-09-20", descricao: "Uber" }, 3_000, "ativo-dinheiro", "despesa-transporte"),
    lancamento({ id: "4", data: "2026-09-05", descricao: "Salário" }, 300_000, "receita-salario", "ativo-dinheiro"),
    lancamento({ id: "5", data: "2026-10-04", descricao: "Futuro" }, 99_999), // depois de hoje: fica fora
  ];
  const f = calcularFatos({ hoje: "2026-10-03", contas: CONTAS, lancamentos: ls, agendamentos: [] });

  it("compara mês atual com o anterior até o mesmo dia", () => {
    expect(f.despesasMes).toBe(10_000);
    expect(f.despesasMesAnteriorAteHoje).toBe(6_000);
    expect(f.despesasMesAnterior).toBe(9_000);
    expect(f.gastoMedioMensal).toBe(3_000);
    expect(f.rendaMediaMensal).toBe(100_000);
  });

  it("separa categorias, dias da semana e reserva", () => {
    expect(f.categorias[0]).toMatchObject({ nome: "Alimentação", atual: 10_000, anterior: 6_000 });
    expect(f.diasDaSemana.reduce((s, d) => s + d.total, 0)).toBe(19_000);
    expect(f.saldoLiquido).toBe(50_000);
    expect(f.mesesDeReserva).toBeCloseTo(16.7, 1);
    expect(fatosEmTexto(f, true)).not.toContain("Mercado");
    expect(fatosEmTexto(f)).toContain("Mercado 2x");
  });
});
