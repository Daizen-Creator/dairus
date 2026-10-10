import { describe, expect, it } from "vitest";
import { calcularCiclo } from "./ciclo";
import { vencimentoDaCompra } from "../../services/previsao";

// Convenção do ciclo: a compra feita NO dia do fechamento ainda entra na fatura que fecha;
// a fatura "atual" começa no dia seguinte (inicioAtual).
describe("ciclo da fatura do cartão", () => {
  it("meio do ciclo: fecha dia 5, vence dia 12, hoje 08/10", () => {
    expect(calcularCiclo(5, 12, "2026-10-08")).toEqual({
      ultimoFechamento: "2026-10-05",
      inicioAtual: "2026-10-06",
      proximoFechamento: "2026-11-05",
      fechamentoAnterior: "2026-09-05",
      vencimentoAnterior: "2026-10-12",
      proximoVencimento: "2026-10-12",
      diasParaFechar: 28, // 23 dias até 31/10 + 5
      diasParaVencer: 4,
    });
  });

  it("depois do vencimento da fatura fechada, o próximo vencimento é o do mês seguinte", () => {
    const c = calcularCiclo(5, 12, "2026-10-20");
    expect(c.vencimentoAnterior).toBe("2026-10-12");
    expect(c.proximoVencimento).toBe("2026-11-12");
    expect(c.diasParaFechar).toBe(16); // 20/10 -> 05/11
    expect(c.diasParaVencer).toBe(23); // 20/10 -> 12/11
  });

  it("no dia do fechamento a compra ainda cai na fatura que fecha; o ciclo novo começa amanhã", () => {
    const c = calcularCiclo(5, 12, "2026-10-05");
    expect(c.ultimoFechamento).toBe("2026-10-05");
    expect(c.inicioAtual).toBe("2026-10-06");
    expect(c.proximoFechamento).toBe("2026-11-05");
    expect(c.vencimentoAnterior).toBe("2026-10-12");
    expect(c.proximoVencimento).toBe("2026-10-12");
    // A mesma regra do motor de previsão: compra de 05/10 vence 12/10; a de 06/10, 12/11.
    expect(vencimentoDaCompra("2026-10-05", 5, 12)).toBe("2026-10-12");
    expect(vencimentoDaCompra("2026-10-06", 5, 12)).toBe("2026-11-12");
  });

  it("véspera do fechamento", () => {
    const c = calcularCiclo(5, 12, "2026-10-04");
    expect(c.ultimoFechamento).toBe("2026-09-05");
    expect(c.proximoFechamento).toBe("2026-10-05");
    expect(c.diasParaFechar).toBe(1);
  });

  it("virada de ano para trás: hoje 03/01, a fatura fechou em 05/12", () => {
    expect(calcularCiclo(5, 12, "2026-01-03")).toEqual({
      ultimoFechamento: "2025-12-05",
      inicioAtual: "2025-12-06",
      proximoFechamento: "2026-01-05",
      fechamentoAnterior: "2025-11-05",
      vencimentoAnterior: "2025-12-12",
      proximoVencimento: "2026-01-12",
      diasParaFechar: 2,
      diasParaVencer: 9,
    });
  });

  it("virada de ano para frente: hoje 20/12, próximo fechamento e vencimento em janeiro", () => {
    expect(calcularCiclo(5, 12, "2026-12-20")).toMatchObject({
      ultimoFechamento: "2026-12-05",
      proximoFechamento: "2027-01-05",
      vencimentoAnterior: "2026-12-12",
      proximoVencimento: "2027-01-12",
      diasParaFechar: 16,
      diasParaVencer: 23,
    });
  });

  it("vencimento antes do fechamento (fecha 28, vence 5): vence no mês seguinte ao fechamento", () => {
    expect(calcularCiclo(28, 5, "2026-10-30")).toEqual({
      ultimoFechamento: "2026-10-28",
      inicioAtual: "2026-10-29",
      proximoFechamento: "2026-11-28",
      fechamentoAnterior: "2026-09-28",
      vencimentoAnterior: "2026-11-05",
      proximoVencimento: "2026-11-05",
      diasParaFechar: 29,
      diasParaVencer: 6,
    });
  });

  it("vencimento no mesmo dia do fechamento vai para o mês seguinte", () => {
    const c = calcularCiclo(5, 5, "2026-10-08");
    expect(c.vencimentoAnterior).toBe("2026-11-05");
    expect(vencimentoDaCompra("2026-10-05", 5, 5)).toBe("2026-11-05");
  });

  it("fechamento no dia 31 usa o último dia dos meses curtos", () => {
    // Fevereiro de 2026 tem 28 dias: fecha em 31/01 e em 28/02.
    expect(calcularCiclo(31, 10, "2026-02-15")).toEqual({
      ultimoFechamento: "2026-01-31",
      inicioAtual: "2026-02-01",
      proximoFechamento: "2026-02-28",
      fechamentoAnterior: "2025-12-31",
      vencimentoAnterior: "2026-02-10",
      proximoVencimento: "2026-03-10",
      diasParaFechar: 13,
      diasParaVencer: 23,
    });
    // Depois de fevereiro volta a fechar no 31.
    const marco = calcularCiclo(31, 10, "2026-03-10");
    expect(marco).toMatchObject({ ultimoFechamento: "2026-02-28", proximoFechamento: "2026-03-31", fechamentoAnterior: "2026-01-31", inicioAtual: "2026-03-01" });
    // Abril tem 30 dias.
    expect(calcularCiclo(31, 10, "2026-04-29")).toMatchObject({ ultimoFechamento: "2026-03-31", proximoFechamento: "2026-04-30", diasParaFechar: 1 });
  });

  it("ano bissexto: fechamento dia 30 cai em 29/02", () => {
    expect(calcularCiclo(30, 10, "2028-03-01")).toMatchObject({ ultimoFechamento: "2028-02-29", inicioAtual: "2028-03-01", proximoFechamento: "2028-03-30" });
  });

  it("vencimento dia 31 em mês curto vence no último dia", () => {
    const c = calcularCiclo(20, 31, "2026-02-25");
    expect(c.ultimoFechamento).toBe("2026-02-20");
    expect(c.vencimentoAnterior).toBe("2026-02-28");
    expect(c.proximoVencimento).toBe("2026-02-28");
    expect(c.diasParaVencer).toBe(3);
  });

  it("concorda com o cálculo de vencimento da previsão em todos os dias de 3 anos", () => {
    const pares: Array<[number, number]> = [[5, 12], [28, 5], [31, 10], [30, 31], [1, 8], [15, 15], [10, 1]];
    const fim = Date.UTC(2028, 11, 31);
    for (const [fech, venc] of pares) {
      for (let t = Date.UTC(2026, 0, 1); t <= fim; t += 86_400_000) {
        const hoje = new Date(t).toISOString().slice(0, 10);
        const c = calcularCiclo(fech, venc, hoje);
        const ctx = `${fech}/${venc} em ${hoje}`;
        // A compra do último dia do ciclo anterior e a do primeiro dia do atual caem em faturas diferentes.
        expect(vencimentoDaCompra(c.ultimoFechamento, fech, venc), ctx).toBe(c.vencimentoAnterior);
        expect(vencimentoDaCompra(c.inicioAtual, fech, venc), ctx).toBe(vencimentoDaCompra(c.proximoFechamento, fech, venc));
        expect(c.proximoVencimento >= hoje, ctx).toBe(true);
        expect(c.ultimoFechamento <= hoje && hoje < c.proximoFechamento, ctx).toBe(true);
        expect(c.diasParaFechar, ctx).toBeGreaterThan(0);
        expect(c.diasParaVencer, ctx).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
