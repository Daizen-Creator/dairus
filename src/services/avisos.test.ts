import { describe, expect, it } from "vitest";
import { calcularAvisos, filtrarNovos, textoDaBandeja } from "./avisos";
import { agendamento, CONTAS } from "../testes/dados";

describe("avisos automáticos", () => {
  const base = { contas: CONTAS, lancamentos: [], orcamentos: [] };

  it("avisa contas 3 dias, 1 dia e no dia do vencimento, e as atrasadas", () => {
    const avisos = calcularAvisos({
      ...base,
      hoje: "2026-10-10",
      agendamentos: [
        agendamento({ id: "a", descricao: "Luz", vencimento: "2026-10-13" }),
        agendamento({ id: "b", descricao: "Água", vencimento: "2026-10-11" }),
        agendamento({ id: "c", descricao: "Internet", vencimento: "2026-10-10" }),
        agendamento({ id: "d", descricao: "Aluguel", vencimento: "2026-10-05" }),
        agendamento({ id: "e", descricao: "Gás", vencimento: "2026-10-12" }),
        agendamento({ id: "f", descricao: "Paga", vencimento: "2026-10-11", pago_em: "2026-10-09" }),
      ],
    });
    const titulos = avisos.map((a) => a.titulo);
    expect(titulos).toContain("Luz vence em 3 dias");
    expect(titulos).toContain("Água vence amanhã");
    expect(titulos).toContain("Internet vence hoje");
    expect(titulos).toContain("Aluguel está atrasada");
    expect(titulos.some((t) => t.startsWith("Gás"))).toBe(false);
    expect(titulos.some((t) => t.startsWith("Paga"))).toBe(false);
  });

  it("avisa que a fatura fecha amanhã e que o limite passou de 90%", () => {
    const avisos = calcularAvisos({ ...base, hoje: "2026-10-04", agendamentos: [] });
    expect(avisos.map((a) => a.titulo)).toEqual(expect.arrayContaining(["A fatura do Nubank fecha amanhã", "Nubank: mais de 90% do limite usado"]));
  });

  it("mostra cada aviso uma vez por dia e esquece registros antigos", () => {
    const avisos = [{ id: "x", titulo: "X", corpo: "" }, { id: "y", titulo: "Y", corpo: "" }];
    const r1 = filtrarNovos(avisos, { velho: "2026-01-01" }, "2026-10-10");
    expect(r1.novos).toHaveLength(2);
    expect(r1.registro).toEqual({ x: "2026-10-10", y: "2026-10-10" });
    expect(filtrarNovos(avisos, r1.registro, "2026-10-10").novos).toHaveLength(0);
    expect(filtrarNovos(avisos, r1.registro, "2026-10-11").novos).toHaveLength(2);
  });

  it("monta o texto da bandeja com o saldo e a próxima conta", () => {
    const texto = textoDaBandeja(CONTAS, [agendamento({ id: "a", descricao: "Luz", vencimento: "2026-10-13", valor_centavos: 12_000 })], "2026-10-10");
    expect(texto).toContain("saldo R$");
    expect(texto).toContain("500,00");
    expect(texto).toContain("Próxima: Luz 13/10");
  });
});
