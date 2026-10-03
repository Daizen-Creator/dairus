import { describe, expect, it } from "vitest";
import { menorOferta, ofertasDoComparador, relevancia } from "./radarAuto";

const resposta = {
  fonte: "Zoom",
  site: "https://www.zoom.com.br",
  produtos: [
    { name: "Fritadeira Elétrica Air Fryer Mondial AF-35", price: 269.1, url: "/fritadeira/af-35", bestOffer: { merchantName: "Magazine Luiza" }, merchants: [{ name: "Magazine Luiza" }] },
    { name: "Fritadeira Air Fryer Mondial Family AFN-40", price: 239, url: "/fritadeira/afn-40", bestOffer: { merchantName: "Amazon" }, merchants: [{ name: "Amazon" }, { name: "Fast Shop" }, { name: "Amazon" }] },
    { name: "Cesto de papel para air fryer", price: 19.9, url: "/acessorios/cesto" },
    { name: "Sem preço", url: "/x" },
  ],
};

describe("radar de compras (comparadores)", () => {
  it("mede quanto o nome bate com a busca, sem ligar para acentos", () => {
    expect(relevancia("air fryer mondial", "Fritadeira Elétrica Air Fryer Mondial")).toBe(1);
    expect(relevancia("fritadeira eletrica", "Fritadeira Elétrica")).toBe(1);
    expect(relevancia("air fryer mondial", "Cesto de papel para air fryer")).toBeCloseTo(2 / 3);
  });

  it("monta as ofertas com loja, lojas e link completo, deixando de fora o que não bate", () => {
    const ofertas = ofertasDoComparador(resposta, "air fryer mondial");
    expect(ofertas.map((o) => o.titulo)).toEqual(["Fritadeira Air Fryer Mondial Family AFN-40", "Fritadeira Elétrica Air Fryer Mondial AF-35"]);
    expect(ofertas[0]).toMatchObject({ precoCentavos: 23_900, loja: "Amazon", lojas: ["Amazon", "Fast Shop"], url: "https://www.zoom.com.br/fritadeira/afn-40" });
  });

  it("pega a oferta mais barata entre as relevantes", () => {
    expect(menorOferta(ofertasDoComparador(resposta, "air fryer mondial"))?.precoCentavos).toBe(23_900);
    expect(menorOferta([])).toBeNull();
    expect(ofertasDoComparador(null, "x")).toEqual([]);
  });
});
