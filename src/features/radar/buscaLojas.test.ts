import { describe, expect, it } from "vitest";
import { juntarOfertas, lerOfertasIA, LOJAS } from "./buscaLojas";

describe("busca em várias lojas", () => {
  it("lê as ofertas da IA e descarta inválidas", () => {
    const texto = '```json\n[{"loja":"Amazon","titulo":"Fone X","preco":199.9,"url":"https://amazon.com.br/x"},{"loja":"Kabum","preco":"R$ 1.234,50","url":"não é link"},{"loja":"","preco":10},{"loja":"Loja","preco":-1}]\n```';
    expect(lerOfertasIA(texto)).toEqual([
      { loja: "Amazon", titulo: "Fone X", precoCentavos: 19_990, url: "https://amazon.com.br/x", fonte: "IA" },
      { loja: "Kabum", titulo: "", precoCentavos: 123_450, url: null, fonte: "IA" },
    ]);
    expect(lerOfertasIA("sem json")).toEqual([]);
  });

  it("junta, tira repetidas e ordena", () => {
    const o = (loja: string, p: number) => ({ loja, titulo: "", precoCentavos: p, url: null, fonte: "IA" as const });
    expect(juntarOfertas([[o("Amazon", 300)], [o("amazon", 300), o("Magalu", 200)]]).map((x) => x.loja)).toEqual(["Magalu", "Amazon"]);
  });

  it("monta os links de busca", () => {
    expect(LOJAS.find((l) => l.nome === "Amazon")!.busca("fone jbl")).toBe("https://www.amazon.com.br/s?k=fone%20jbl");
  });
});
