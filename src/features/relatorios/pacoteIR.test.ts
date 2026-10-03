import { describe, expect, it } from "vitest";
import { montarPacoteIR, saldoNaData } from "./pacoteIR";
import { conta, CONTAS, lancamento } from "../../testes/dados";

describe("pacote do IR", () => {
  const contas = [
    ...CONTAS,
    conta({ id: "despesa-saude", nome: "Saúde", tipo: "DESPESA" }),
    conta({ id: "banco", nome: "Banco X", tipo: "ATIVO", subtipo: "BANCO", instituicao: "Banco X" }),
  ];
  const ls = [
    lancamento({ id: "s1", data: "2025-03-05", descricao: "Salário" }, 300_000, "receita-salario", "banco"),
    lancamento({ id: "s2", data: "2025-04-05", descricao: "Salário" }, 300_000, "receita-salario", "banco"),
    lancamento({ id: "m", data: "2025-06-10", descricao: "Consulta" }, 25_000, "banco", "despesa-saude"),
    lancamento({ id: "x", data: "2024-12-10", descricao: "Saldo antigo" }, 50_000, "receita-salario", "banco"),
  ];

  it("calcula saldo numa data", () => {
    expect(saldoNaData(contas.find((c) => c.id === "banco")!, ls, "2024-12-31")).toBe(50_000);
  });

  it("junta rendimentos, dedutíveis e saldos em 31/12", () => {
    const p = montarPacoteIR(2025, contas, ls, []);
    expect(p.rendimentos).toEqual([{ nome: "Salário", valor: 600_000 }]);
    expect(p.dedutiveis[0].valor).toBe(25_000);
    expect(p.dedutiveis[0].lancamentos[0].descricao).toBe("Consulta");
    expect(p.contas.find((c) => c.nome === "Banco X")).toMatchObject({ anterior: 50_000, atual: 50_000 + 600_000 - 25_000 });
    expect(p.avisos.length).toBeGreaterThan(0);
  });
});
