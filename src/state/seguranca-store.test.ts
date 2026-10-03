import { describe, expect, it } from "vitest";
import { esperaDoPin, iguaisTempoConstante } from "./seguranca-store";

describe("limite de tentativas do PIN", () => {
  it("libera 4 erros, espera 1 min no 5º e dobra até 1 h", () => {
    expect(esperaDoPin(4)).toBe(0);
    expect(esperaDoPin(5)).toBe(60);
    expect(esperaDoPin(6)).toBe(120);
    expect(esperaDoPin(30)).toBe(3600);
  });

  it("compara hashes sem atalho", () => {
    expect(iguaisTempoConstante("abcd", "abcd")).toBe(true);
    expect(iguaisTempoConstante("abcd", "abce")).toBe(false);
    expect(iguaisTempoConstante("abc", "abcd")).toBe(false);
  });
});
