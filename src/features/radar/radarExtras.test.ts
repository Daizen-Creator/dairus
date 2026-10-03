import { describe, expect, it } from "vitest";
import { datasDePromocao, proximasPromocoes, totalDaLista } from "./radarExtras";
import type { ItemRadar } from "../../types/extras";

describe("radar extras", () => {
  it("calcula as datas de promoção", () => {
    const d = Object.fromEntries(datasDePromocao(2026).map((x) => [x.nome, x.data]));
    expect(d["Black Friday"]).toBe("2026-11-27");
    expect(d["Cyber Monday"]).toBe("2026-11-30");
    expect(d["Dia das Mães"]).toBe("2026-05-10");
    expect(d["Dia dos Pais"]).toBe("2026-08-09");
    expect(proximasPromocoes("2026-10-03")[0]).toEqual({ nome: "Dia das Crianças", data: "2026-10-12", dias: 9 });
    expect(proximasPromocoes("2026-12-26")[0].nome).toBe("Dia do Consumidor");
  });

  it("soma a lista de desejos pelo menor preço", () => {
    const item = (precos: number[]) => ({ id: "x", nome: "x", preco_alvo_centavos: null, meta_id: null, precos: precos.map((p, k) => ({ id: String(k), loja: "L", preco_centavos: p, url: null, data: "2026-01-01" })) }) as ItemRadar;
    expect(totalDaLista([item([500, 300]), item([1000]), item([])])).toEqual({ total: 1300, semPreco: 1 });
  });
});
