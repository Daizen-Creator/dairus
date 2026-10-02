import { describe, expect, it } from "vitest";
import { limparChave, tipoDaChave } from "./gemini";

describe("chave do Gemini", () => {
  it("tira espaços, quebras de linha e aspas sem apagar letras", () => {
    expect(limparChave(' "AIzaSyAbcs123 \n"')).toBe("AIzaSyAbcs123");
    expect(limparChave("AQ.sss-xyz")).toBe("AQ.sss-xyz");
  });
  it("reconhece o tipo da chave", () => {
    expect(tipoDaChave("AIzaSy")).toBe("AI_STUDIO");
    expect(tipoDaChave("AQ.abc")).toBe("VERTEX");
    expect(tipoDaChave("xyz")).toBe("DESCONHECIDA");
  });
});
