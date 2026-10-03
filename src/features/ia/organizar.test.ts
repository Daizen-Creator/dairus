import { describe, expect, it } from "vitest";
import { descricoesParaPadronizar, duplicatasSuspeitas, validarSugestoes } from "./organizar";
import { CONTAS, lancamento } from "../../testes/dados";

describe("organizar histórico", () => {
  const ls = [
    lancamento({ id: "a", data: "2026-09-10", descricao: "UBER *TRIP 1234" }, 2350),
    lancamento({ id: "b", data: "2026-09-11", descricao: "Uber Trip" }, 2350),
    lancamento({ id: "c", data: "2026-09-20", descricao: "Uber Trip" }, 1800),
    lancamento({ id: "d", data: "2026-09-20", descricao: "Padaria" }, 1000),
    lancamento({ id: "e", data: "2026-09-25", descricao: "Padaria" }, 1000),
  ];

  it("acha duplicatas só com mesmo valor, mesma marca e até 2 dias", () => {
    const pares = duplicatasSuspeitas(ls, "2026-09-01");
    expect(pares.map(([x, y]) => `${x.id}-${y.id}`)).toEqual(["a-b"]);
  });

  it("sugere padronizar marcas escritas de jeitos diferentes", () => {
    const r = descricoesParaPadronizar(ls, "2026-09-01");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ marca: "uber", sugestao: "Uber Trip", ids: ["a"] });
  });

  it("valida as sugestões da IA", () => {
    const r = validarSugestoes(
      { sugestoes: [
        { descricao: "Padaria", nova_descricao: "Padaria", etiqueta: "XYZ", categoria_id: "despesa-alimentacao" },
        { descricao: "Netflix", etiqueta: "ASSINATURA" },
        { descricao: "Uber Trip", subcategoria: "Aplicativos", categoria_id: "inventada" },
        { descricao: "Padaria", nova_descricao: "  " },
      ] },
      new Set(["Padaria", "Uber Trip"]),
      CONTAS,
    );
    expect(r).toEqual([
      { descricao: "Padaria", nova_descricao: null, etiqueta: null, categoria_id: "despesa-alimentacao", subcategoria: null },
      { descricao: "Uber Trip", nova_descricao: null, etiqueta: null, categoria_id: null, subcategoria: "Aplicativos" },
    ]);
  });
});
