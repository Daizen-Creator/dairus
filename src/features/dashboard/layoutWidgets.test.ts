import { describe, expect, it } from "vitest";
import { CATALOGO, COLUNAS, MODELOS, criarWidget, emOrdemDeLeitura, lugarLivre, migrarFormatoAntigo, montar, normalizarOpcoes, normalizarWidgets, widgetsDoModelo } from "./layoutWidgets";

const sobrepoe = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("painel do Início (grade livre)", () => {
  it("catálogo sem ids repetidos, tamanhos dentro da grade e modelos válidos", () => {
    const ids = CATALOGO.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const w of CATALOGO) expect(w.w).toBeLessThanOrEqual(COLUNAS);
    for (const m of MODELOS) {
      const ws = widgetsDoModelo(m);
      for (const w of ws) expect(w.x + w.w).toBeLessThanOrEqual(COLUNAS);
      for (let a = 0; a < ws.length; a++) for (let b = a + 1; b < ws.length; b++) expect(sobrepoe(ws[a], ws[b])).toBe(false);
    }
  });

  it("acha o primeiro lugar livre, sem sobrepor", () => {
    const ocupados = [{ x: 0, y: 0, w: 4, h: 4 }, { x: 4, y: 0, w: 4, h: 4 }];
    expect(lugarLivre(ocupados, 4, 4)).toEqual({ x: 8, y: 0 });
    expect(lugarLivre(ocupados, 6, 4)).toEqual({ x: 0, y: 4 });
    expect(lugarLivre([], 12, 3)).toEqual({ x: 0, y: 0 });
  });

  it("monta em sequência e cria widgets novos no fim", () => {
    const ws = montar([{ tipo: "hoje" }, { tipo: "metas" }, { tipo: "grafico", w: 8 }]);
    expect(ws.map((w) => [w.x, w.y, w.w])).toEqual([[0, 0, 4], [4, 0, 4], [0, 4, 8]]);
    const novo = criarWidget(ws, "fotos");
    expect(novo.config).toEqual({ semTitulo: true });
    expect(ws.some((w) => sobrepoe(w, novo))).toBe(false);
  });

  it("limpa dados estragados: tipo desconhecido, id repetido, fora da grade", () => {
    const ws = normalizarWidgets([
      { i: "a", tipo: "hoje", x: 10, y: 0, w: 6, h: 4 },
      { i: "a", tipo: "metas", x: 0, y: 0, w: 99, h: 0 },
      { i: "b", tipo: "inexistente", x: 0, y: 0, w: 4, h: 4 },
      null,
    ]);
    expect(ws).toHaveLength(2);
    expect(ws[0]).toMatchObject({ i: "a", x: 6, w: 6 });
    expect(ws[1].i).not.toBe("a");
    expect(ws[1]).toMatchObject({ w: 12, x: 0, h: 3 });
    expect(normalizarWidgets("lixo")).toEqual([]);
    expect(normalizarOpcoes({ compactar: false, espaco: "x" })).toEqual({ compactar: false, espaco: "normal", titulo: true });
  });

  it("migra o formato antigo (lista + P/M/G) para posições", () => {
    const { widgets, opcoes } = migrarFormatoAntigo(["hoje", "relogio", "fotos", "xyz", "hoje"], { relogio: 3 }, ["fotos"], { espaco: "amplo" });
    expect(widgets.map((w) => [w.tipo, w.w])).toEqual([["hoje", 4], ["relogio", 12], ["fotos", 8]]);
    expect(widgets[2].config).toEqual({ semTitulo: true });
    expect(opcoes).toEqual({ compactar: true, espaco: "amplo", titulo: true });
    // Sem nada salvo: os 6 widgets padrão.
    expect(migrarFormatoAntigo(undefined, null, null, null).widgets).toHaveLength(6);
  });

  it("ordem de leitura para telas estreitas", () => {
    expect(emOrdemDeLeitura([{ i: "c", x: 0, y: 5 }, { i: "b", x: 6, y: 0 }, { i: "a", x: 0, y: 0 }]).map((w) => w.i)).toEqual(["a", "b", "c"]);
  });
});
