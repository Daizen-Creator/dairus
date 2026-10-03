import { describe, expect, it } from "vitest";
import { limiteEfetivo, mesAnteriorDe, ritmo } from "./calculoOrcamento";
import type { Orcamento } from "../../types/extras";

const orc: Orcamento[] = [{ categoria_id: "lazer", limite_centavos: 50_000, acumular: true, acumular_desde: "2026-08" }];

describe("orçamento", () => {
  it("volta o mês na virada do ano", () => {
    expect(mesAnteriorDe("2026-01")).toBe("2025-12");
  });

  it("usa o limite do mês e soma a sobra acumulada", () => {
    const limites = [{ categoria_id: "lazer", mes: "2026-12", limite_centavos: 80_000 }];
    const gasto: Record<string, number> = { "2026-08": 30_000, "2026-09": 60_000, "2026-10": 40_000, "2026-11": 50_000 };
    const r = limiteEfetivo("lazer", "2026-12", orc, limites, (m) => gasto[m] ?? 0);
    expect(r.base).toBe(80_000);
    expect(r.acumulado).toBe(20_000 - 10_000 + 10_000 + 0);
    expect(r.efetivo).toBe(100_000);
    expect(limiteEfetivo("lazer", "2026-08", orc, [], () => 0).acumulado).toBe(0);
    expect(limiteEfetivo("lazer", "2026-09", [{ ...orc[0], acumular: false }], [], () => 0).efetivo).toBe(50_000);
  });

  it("calcula quanto ainda pode gastar por dia e o desvio do ritmo", () => {
    const r = ritmo(30_000, 15_000, "2026-09-10")!;
    expect(r.diasRestantes).toBe(21);
    expect(r.porDia).toBe(Math.floor(15_000 / 21));
    expect(r.desvio).toBeCloseTo(15_000 / 10_000 - 1);
    expect(ritmo(0, 1, "2026-09-10")).toBeNull();
  });
});
