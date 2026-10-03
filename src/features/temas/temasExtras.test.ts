import { describe, expect, it } from "vitest";
import { aleatorio, contraste, temaDoDia } from "./temasExtras";

describe("temas extras", () => {
  it("contraste WCAG", () => {
    expect(contraste("#000000", "#ffffff")).toBe(21);
    expect(contraste("#777777", "#777777")).toBe(1);
  });
  it("tema do dia e aleatório", () => {
    expect(temaDoDia(["a", "b", "c"], "2026-01-01")).toBe("a");
    expect(temaDoDia(["a", "b", "c"], "2026-01-02")).toBe("b");
    expect(temaDoDia([], "2026-01-02")).toBeNull();
    expect(aleatorio(["x", "y"], "x")).toBe("y");
  });
});
