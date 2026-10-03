import { describe, expect, it } from "vitest";
import { menorOferta } from "./radarAuto";

describe("radar automático", () => {
  it("pega a oferta nova mais barata", () => {
    const r = menorOferta({ results: [
      { title: "Usado barato", price: 50, condition: "used", permalink: "u" },
      { title: "Novo A", price: 199.9, condition: "new", permalink: "a" },
      { title: "Novo B", price: 189.5, condition: "new", permalink: "b" },
    ] });
    expect(r).toEqual({ titulo: "Novo B", precoCentavos: 18_950, url: "b" });
    expect(menorOferta({ results: [] })).toBeNull();
    expect(menorOferta(null)).toBeNull();
  });
});
