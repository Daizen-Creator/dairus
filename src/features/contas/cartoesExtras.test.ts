import { describe, expect, it } from "vitest";
import { faturasFuturas, simularCompra } from "./cartoesExtras";

describe("cartões: faturas futuras e simulação", () => {
  // Fecha dia 5, vence dia 12.
  it("agrupa compras por vencimento", () => {
    const f = faturasFuturas([{ data: "2026-10-02", valor: 100 }, { data: "2026-10-04", valor: 50 }, { data: "2026-10-10", valor: 30 }, { data: "2026-08-01", valor: 999 }], 5, 12, "2026-10-03");
    expect(f).toEqual([{ vencimento: "2026-10-12", valor: 150 }, { vencimento: "2026-11-12", valor: 30 }]);
  });

  it("simula uma compra em 3x somando às faturas que já existem", () => {
    const s = simularCompra(30_000, 3, "2026-10-10", 5, 12, [{ vencimento: "2026-11-12", valor: 5_000 }], 50_000);
    expect(s.parcela).toBe(10_000);
    expect(s.porFatura).toEqual([
      { vencimento: "2026-11-12", valor: 15_000, antes: 5_000 },
      { vencimento: "2026-12-12", valor: 10_000, antes: 0 },
      { vencimento: "2027-01-12", valor: 10_000, antes: 0 },
    ]);
    expect(s.disponivelDepois).toBe(20_000);
    expect(s.maiorFatura).toBe(15_000);
  });
});
