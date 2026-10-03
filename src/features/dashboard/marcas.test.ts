import { describe, expect, it } from "vitest";
import { marcaDaDescricao, marcaSvgDaDescricao } from "./marcas";

describe("logos das marcas", () => {
  it("acha os logos vetoriais e os selos", () => {
    expect(marcaSvgDaDescricao("HBO Max mensal")?.id).toBe("hbomax");
    expect(marcaSvgDaDescricao("Steam compra jogo")?.id).toBe("steam");
    expect(marcaSvgDaDescricao("CANVA PRO")?.id).toBe("canva");
    expect(marcaSvgDaDescricao("Claude Pro")?.id).toBe("claude");
    expect(marcaSvgDaDescricao("Conta Enel")?.titulo).toBe("Conta de luz");
  });
  it("não confunde pedaços de palavras", () => {
    expect(marcaSvgDaDescricao("Curso de inteligência")).toBeNull();
    expect(marcaSvgDaDescricao("Revisão do carro")).toBeNull();
    expect(marcaSvgDaDescricao("Viagem praia")).toBeNull();
  });
  it("os PNG continuam valendo", () => {
    expect(marcaDaDescricao("Netflix")).toBe("/marcas/netflix.png");
  });
});
