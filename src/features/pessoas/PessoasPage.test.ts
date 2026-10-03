import { describe, expect, it } from "vitest";
import { dividirIgual, mensagemCobranca } from "./PessoasPage";

describe("pessoas e divisões", () => {
  it("divide igualmente distribuindo os centavos", () => {
    expect(dividirIgual(10_000, 3)).toEqual([3_334, 3_333, 3_333]);
    expect(dividirIgual(1, 0)).toEqual([]);
  });
  it("monta a mensagem de cobrança com Pix", () => {
    const m = mensagemCobranca("Ana", [{ id: "1", pessoa: "Ana", descricao: "Pizza", valor_centavos: 3_000, data: "2026-10-01", recebido_em: null, perdoado: false }], "ana@pix.com");
    expect(m).toContain("Oi, Ana!");
    expect(m).toContain("Pizza");
    expect(m).toMatch(/Total: R\$\s?30,00/);
    expect(m).toContain("Pix: ana@pix.com");
  });
});
