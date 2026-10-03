import { describe, expect, it } from "vitest";
import { decimoTerceiro, ferias, holerite, horasExtras, inss, irrf, pacoteAnualClt, pacoteAnualPj } from "./salarioCalc";

describe("cálculos de salário (referência)", () => {
  it("INSS progressivo e teto", () => {
    expect(inss(151_800)).toBe(11_385);
    expect(inss(300_000)).toBe(11_385 + Math.round((279_388 - 151_800) * 0.09) + Math.round((300_000 - 279_388) * 0.12));
    expect(inss(2_000_000)).toBe(inss(815_741));
  });

  it("IRRF com isenção até 5 mil em 2026 e redução até 7.350", () => {
    expect(irrf(500_000, inss(500_000))).toBe(0);
    const em6mil = irrf(600_000, inss(600_000));
    const semReducao = irrf(600_000, inss(600_000), 0, 2025);
    expect(em6mil).toBeGreaterThan(0);
    expect(em6mil).toBeLessThan(semReducao);
    expect(irrf(1_000_000, inss(1_000_000))).toBe(irrf(1_000_000, inss(1_000_000), 0, 2025));
  });

  it("holerite fecha bruto = líquido + descontos", () => {
    const h = holerite(450_000);
    expect(h.bruto).toBe(h.liquido + h.inss + h.irrf);
    expect(h.fgts).toBe(36_000);
  });

  it("13º, férias, horas extras e CLT x PJ", () => {
    const d = decimoTerceiro(300_000, 6);
    expect(d.primeira).toBe(75_000);
    expect(d.total + d.descontos).toBe(150_000);
    const f = ferias(300_000, 30, true);
    expect(f.abono).toBe(Math.round(100_000 * (4 / 3)));
    expect(horasExtras(220_000, 220, 10)).toBe(15_000);
    expect(pacoteAnualClt(500_000)).toBeGreaterThan(holerite(500_000).liquido * 12);
    expect(pacoteAnualPj(1_000_000, 0.1, 50_000)).toBe(10_200_000);
  });
});
