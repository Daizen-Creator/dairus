import { describe, expect, it } from "vitest";
import {
  APARENCIA_PADRAO,
  PREDEFINICOES,
  avaliarContraste,
  corCssParaRgba,
  cssGradiente,
  escurecerParaContraste,
  hexParaRgb,
  mesclar,
  nivelWcag,
  normalizarAparencia,
  ordenarPorPreferencia,
  razaoContraste,
  variaveisCss,
} from "./aparencia";
import { correcaoDeContraste } from "./AlertaContraste";
import { moverItem } from "./PainelMenu";
import { horaNoFuso } from "../dashboard/WidgetsMidia";
import { GALERIA, urlDaGaleria } from "./galeria";

const temaEscuro = { fundo: "#0b1020", cartao: "rgba(20, 28, 48, 0.85)", texto: "#e8eefb", textoSecundario: "#9aabc8" };

describe("estado da aparência", () => {
  it("normaliza lixo, valores fora do limite e versões antigas", () => {
    expect(normalizarAparencia(null)).toEqual(APARENCIA_PADRAO);
    const a = normalizarAparencia({ fundo: { tipo: "hackeado", cor: "javascript:alert(1)", imagem: "../../etc", midia: { escurecer: 999 } }, menu: { largura: 5, ordem: ["/metas", 3, "http://x"] }, formas: { raio: -2 }, tipografia: { fonte: "comic" } });
    expect(a.fundo.tipo).toBe("tema");
    expect(a.fundo.cor).toBe(APARENCIA_PADRAO.fundo.cor);
    expect(a.fundo.imagem).toBe("galeria:montanhas");
    expect(a.fundo.midia.escurecer).toBe(100);
    expect(a.menu.largura).toBe(200);
    expect(a.menu.ordem).toEqual(["/metas"]);
    expect(a.formas.raio).toBe(0);
    expect(a.tipografia.fonte).toBe("padrao");
  });

  it("mescla parcial sem perder o resto e troca listas inteiras", () => {
    const b = mesclar(APARENCIA_PADRAO, { menu: { vidro: true, ordem: ["/a"] }, fundo: { midia: { desfoque: 8 } } });
    expect(b.menu.vidro).toBe(true);
    expect(b.menu.largura).toBe(232);
    expect(b.menu.ordem).toEqual(["/a"]);
    expect(b.fundo.midia).toEqual({ ...APARENCIA_PADRAO.fundo.midia, desfoque: 8 });
    expect(APARENCIA_PADRAO.menu.vidro).toBe(false);
  });

  it("toda predefinição gera uma aparência válida", () => {
    for (const p of PREDEFINICOES) expect(normalizarAparencia(mesclar(APARENCIA_PADRAO, p.aparencia))).toEqual(mesclar(APARENCIA_PADRAO, p.aparencia));
  });
});

describe("CSS", () => {
  it("monta degradê linear e radial", () => {
    expect(cssGradiente({ tipo: "linear", angulo: 90, paradas: [{ cor: "#000000", pos: 0 }, { cor: "#ffffff", pos: 100 }] })).toBe("linear-gradient(90deg, #000000 0%, #ffffff 100%)");
    expect(cssGradiente({ tipo: "radial", angulo: 0, paradas: [{ cor: "#111111", pos: 10 }, { cor: "#222222", pos: 90 }] })).toContain("radial-gradient(circle at 30% 20%, #111111 10%");
  });

  it("escala as bordas e aplica fonte/menu nas variáveis", () => {
    const v = variaveisCss(mesclar(APARENCIA_PADRAO, { formas: { raio: 2 }, menu: { corSelecionado: "#ff0000" } }));
    expect(v["--radius-xl"]).toBe("24.00px");
    expect(v["--menu-selecionado"]).toBe("#ff0000");
    expect(v["--fonte-app"]).toContain("Inter");
  });

  it("galeria gera SVGs válidos", () => {
    for (const g of GALERIA) {
      expect(g.svg.startsWith("<svg")).toBe(true);
      expect(g.svg).not.toMatch(/NaN|undefined/);
    }
    expect(urlDaGaleria("montanhas")).toMatch(/^data:image\/svg\+xml/);
    expect(urlDaGaleria("nao-existe")).toBeNull();
  });
});

describe("contraste WCAG", () => {
  it("calcula a razão e o nível", () => {
    expect(razaoContraste([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
    expect(nivelWcag(7.1)).toBe("AAA");
    expect(nivelWcag(4.6)).toBe("AA");
    expect(nivelWcag(3.2)).toBe("AA grande");
    expect(nivelWcag(2)).toBe("baixo");
  });

  it("lê cores CSS", () => {
    expect(corCssParaRgba("#fff")).toEqual([255, 255, 255, 1]);
    expect(corCssParaRgba("rgba(10, 20, 30, 0.5)")).toEqual([10, 20, 30, 0.5]);
    expect(corCssParaRgba("rgb(1 2 3 / 50%)")).toEqual([1, 2, 3, 0.5]);
    expect(corCssParaRgba("azul")).toBeNull();
  });

  it("acusa texto claro sobre foto clara e a correção resolve", () => {
    const a = mesclar(APARENCIA_PADRAO, { fundo: { tipo: "imagem", midia: { escurecer: 0, opacidade: 1 } }, formas: { opacidadeCartoes: 0.3 } });
    const fotoClara: [number, number, number] = [235, 230, 220];
    expect(avaliarContraste(a, temaEscuro, fotoClara).pior).toBeLessThan(4.5);
    const correcao = correcaoDeContraste(a, hexParaRgb(temaEscuro.texto), temaEscuro.fundo, fotoClara)!;
    expect(avaliarContraste(mesclar(a, correcao), temaEscuro, fotoClara).pior).toBeGreaterThanOrEqual(4.5);
  });

  it("corrige cor sólida e degradê clareando para texto escuro", () => {
    const temaClaro = { fundo: "#ffffff", cartao: "#ffffff", texto: "#1f2430", textoSecundario: "#6b7280" };
    const a = mesclar(APARENCIA_PADRAO, { fundo: { tipo: "cor", cor: "#333333" } });
    expect(avaliarContraste(a, temaClaro, null).sobreFundo).toBeLessThan(4.5);
    const c = correcaoDeContraste(a, hexParaRgb(temaClaro.texto), temaClaro.fundo, null)!;
    expect(avaliarContraste(mesclar(a, c), temaClaro, null).sobreFundo).toBeGreaterThanOrEqual(4.5);
    expect(escurecerParaContraste([128, 128, 128], [255, 255, 255])).toBeGreaterThan(0);
  });
});

describe("menu e widgets", () => {
  it("ordena pelo gosto do usuário e manda rotas novas para o fim", () => {
    const itens = [{ rota: "/" }, { rota: "/a" }, { rota: "/b" }, { rota: "/c" }];
    expect(ordenarPorPreferencia(itens, ["/c", "/"]).map((i) => i.rota)).toEqual(["/c", "/", "/a", "/b"]);
    expect(moverItem(["x", "y", "z"], 2, 0)).toEqual(["z", "x", "y"]);
    expect(moverItem(["x", "y"], 0, 5)).toEqual(["x", "y"]);
  });

  it("mostra a hora em outro fuso sem depender do fuso do computador", () => {
    const d = new Date("2026-10-03T15:30:00Z");
    expect(horaNoFuso(d, "America/Sao_Paulo").texto).toBe("12:30");
    expect(horaNoFuso(d, "Asia/Tokyo").texto).toBe("00:30");
  });
});
