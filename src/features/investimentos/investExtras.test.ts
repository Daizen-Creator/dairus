import { describe, expect, it } from "vitest";
import { proximosVencimentos, simularPrecoMedio, yieldOnCost } from "./investExtras";
import type { AtivoInvest, OperacaoInvest } from "../../types/investimentos";

describe("investimentos extras", () => {
  it("simula o preço médio", () => {
    const r = simularPrecoMedio(100, 20, 100, 10);
    expect(r.quantidade).toBe(200);
    expect(r.precoMedio).toBe(15);
    expect(r.variacao).toBeCloseTo(-0.25);
  });

  it("yield on cost dos últimos 12 meses (líquido de IR)", () => {
    const ops = [
      { tipo: "DIVIDENDO", data: "2026-05-01", valor_centavos: 1_000, ir_retido_centavos: 0 },
      { tipo: "JCP", data: "2026-08-01", valor_centavos: 1_000, ir_retido_centavos: 150 },
      { tipo: "DIVIDENDO", data: "2025-01-01", valor_centavos: 9_999, ir_retido_centavos: 0 },
      { tipo: "COMPRA", data: "2026-01-01", valor_centavos: 50_000, ir_retido_centavos: 0 },
    ] as OperacaoInvest[];
    expect(yieldOnCost(ops, 50_000, "2026-10-03")).toBeCloseTo(1_850 / 50_000);
    expect(yieldOnCost(ops, 0, "2026-10-03")).toBeNull();
  });

  it("lista vencimentos próximos", () => {
    const a = (codigo: string, vencimento: string | null, quantidade = 1) => ({ codigo, vencimento, quantidade }) as AtivoInvest;
    expect(proximosVencimentos([a("CDB2", "2027-03-01"), a("CDB1", "2026-12-01"), a("LCI", "2030-01-01"), a("VELHO", "2026-01-01"), a("ZERADO", "2026-11-01", 0)], "2026-10-03").map((x) => x.codigo)).toEqual(["CDB1", "CDB2"]);
  });
});
