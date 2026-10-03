import { describe, expect, it } from "vitest";
import { montarResumoSemanal } from "./automacoesRelatorios";
import { agendamento, CONTAS, lancamento } from "../testes/dados";

describe("resumo semanal", () => {
  it("soma a semana, compara com a anterior e lista as contas da próxima", () => {
    const ls = [
      lancamento({ id: "a", data: "2026-09-28", descricao: "Mercado" }, 20_000),
      lancamento({ id: "b", data: "2026-10-04", descricao: "Uber" }, 5_000, "ativo-dinheiro", "despesa-transporte"),
      lancamento({ id: "c", data: "2026-09-22", descricao: "Antiga" }, 10_000),
    ];
    const r = montarResumoSemanal("2026-10-04", CONTAS, ls, [agendamento({ id: "x", descricao: "Luz", vencimento: "2026-10-07", valor_centavos: 9_000 })]);
    expect(r.gastos).toBe(25_000);
    expect(r.gastosSemanaAnterior).toBe(10_000);
    expect(r.maiores[0].descricao).toBe("Mercado");
    expect(r.proximasContas.map((c) => c.descricao)).toEqual(["Luz"]);
    expect(r.dica).toContain("150% a mais");
  });
});
