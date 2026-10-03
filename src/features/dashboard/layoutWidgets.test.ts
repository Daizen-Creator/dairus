import { describe, expect, it } from "vitest";
import { CATALOGO, MODELOS, WIDGETS_PADRAO, classeDoTamanho, classesDaGrade, mover, normalizarAtivos, normalizarLayout, normalizarTamanhos } from "./layoutWidgets";

describe("layout dos widgets do Início", () => {
  it("catálogo sem ids repetidos e modelos só com widgets que existem", () => {
    const ids = CATALOGO.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(27);
    for (const m of MODELOS) for (const w of m.widgets) expect(ids).toContain(w);
  });

  it("limpa preferências antigas ou estragadas", () => {
    expect(normalizarAtivos(["hoje", "xyz", "hoje", 3, "metas"])).toEqual(["hoje", "metas"]);
    expect(normalizarAtivos("lixo")).toEqual(WIDGETS_PADRAO);
    expect(normalizarAtivos([])).toEqual([]);
    expect(normalizarLayout({ colunas: 9, espaco: "x", titulo: false })).toEqual({ colunas: 3, espaco: "normal", titulo: false });
    expect(normalizarLayout(null)).toEqual({ colunas: 3, espaco: "normal", titulo: true });
  });

  it("converte os widgets 'largos' antigos em tamanho 2", () => {
    expect(normalizarTamanhos(null, ["relogio", "inexistente"])).toEqual({ relogio: 2 });
    expect(normalizarTamanhos({ fotos: 3, hoje: 7 }, ["relogio"])).toEqual({ relogio: 2, fotos: 3 });
  });

  it("move itens e monta as classes da grade", () => {
    expect(mover(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(mover(["a", "b"], 1, 5)).toEqual(["a", "b"]);
    expect(classesDaGrade({ colunas: 4, espaco: "compacto", titulo: true })).toBe("grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2");
    expect(classeDoTamanho(1, { colunas: 3, espaco: "normal", titulo: true })).toBe("");
    expect(classeDoTamanho(3, { colunas: 3, espaco: "normal", titulo: true })).toBe("sm:col-span-2 xl:col-span-3");
    // "G" é sempre a linha inteira: 2 colunas em grade de 2, 4 em grade de 4.
    expect(classeDoTamanho(3, { colunas: 2, espaco: "normal", titulo: true })).toBe("sm:col-span-2");
    expect(classeDoTamanho(3, { colunas: 4, espaco: "normal", titulo: true })).toBe("sm:col-span-2 lg:col-span-3 2xl:col-span-4");
    expect(classeDoTamanho(2, { colunas: 4, espaco: "normal", titulo: true })).toBe("sm:col-span-2");
  });
});
