import { describe, expect, it } from "vitest";
import { dividirEmParcelas, parcelamentoDe, somarMeses } from "./parcelas";
import { lancamento } from "../../testes/dados";

describe("parcelas", () => {
  it("soma meses respeitando o fim do mês", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2026-11-15", 3)).toBe("2027-02-15");
  });

  it("divide o valor e põe os centavos que sobram na primeira parcela", () => {
    const p = dividirEmParcelas(100_00 + 1, "2026-09-20", 3);
    expect(p.map((x) => x.valor)).toEqual([3335, 3333, 3333]);
    expect(p.reduce((s, x) => s + x.valor, 0)).toBe(10001);
    expect(p.map((x) => x.data)).toEqual(["2026-09-20", "2026-10-20", "2026-11-20"]);
  });

  it("estorno de compra parcelada usa o parcelamento da compra original", () => {
    const compra = lancamento({ id: "c", data: "2026-09-01", descricao: "TV", parcelas: 10 });
    const estorno = lancamento({ id: "e", data: "2026-10-02", descricao: "Estorno", origem: "ESTORNO", estornado_de: "c" });
    const porId = new Map([compra, estorno].map((l) => [l.id, l]));
    expect(parcelamentoDe(estorno, porId)).toEqual({ parcelas: 10, dataBase: "2026-09-01" });
    expect(parcelamentoDe(lancamento({ id: "x", data: "2026-09-01", descricao: "à vista" }), porId)).toBeNull();
  });
});
