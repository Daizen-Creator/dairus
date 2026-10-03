import { describe, expect, it } from "vitest";
import { depreciar, independencia, mesesAteAlvo, projetarPatrimonio } from "./patrimonioExtras";

describe("patrimônio extras", () => {
  it("deprecia composto", () => {
    expect(depreciar(100_000, 0.1, 365)).toBe(90_000);
    expect(depreciar(100_000, 0.1, 730)).toBe(81_000);
    expect(depreciar(100_000, 0, 365)).toBe(100_000);
  });

  it("projeta e acha o prazo", () => {
    expect(projetarPatrimonio(0, 100_000, 0, 2)).toEqual([1_200_000, 2_400_000]);
    expect(mesesAteAlvo(0, 100_000, 0, 1_000_000)).toBe(10);
    expect(mesesAteAlvo(0, 0, 0, 1)).toBeNull();
    const comJuros = mesesAteAlvo(0, 100_000, 0.1, 1_000_000)!;
    expect(comJuros).toBeLessThanOrEqual(10);
  });

  it("independência pela regra dos 4%", () => {
    expect(independencia(30_000_000, 100_000)).toBe(100);
    expect(independencia(15_000_000, 100_000)).toBe(50);
  });
});
