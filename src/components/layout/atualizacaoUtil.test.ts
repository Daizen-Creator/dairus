import { describe, expect, it } from "vitest";
import { formatarMB, partesDaVersao, porcentagem, velocidadeERestante, versaoMaiorOuIgual } from "./atualizacaoUtil";

describe("tela de atualização: cálculos", () => {
  it("compara versões", () => {
    expect(partesDaVersao("v1.2.3")).toEqual([1, 2, 3]);
    expect(partesDaVersao("0.3.0-beta.1")).toEqual([0, 3, 0]);
    expect(partesDaVersao("abc")).toBeNull();
    expect(versaoMaiorOuIgual("0.2.3", "0.2.3")).toBe(true);
    expect(versaoMaiorOuIgual("0.10.0", "0.9.9")).toBe(true);
    expect(versaoMaiorOuIgual("0.2.2", "0.2.3")).toBe(false);
    expect(versaoMaiorOuIgual("x", "0.1.0")).toBe(false);
  });

  it("formata tamanho, porcentagem, velocidade e tempo restante", () => {
    expect(formatarMB(1_572_864)).toBe("1,5 MB");
    expect(porcentagem(45, 120)).toBe(37);
    expect(porcentagem(10, 0)).toBe(0);
    expect(porcentagem(200, 100)).toBe(100);
    // 2 MB em 1 s, faltam 4 MB → 2 s
    expect(velocidadeERestante(2 * 1_048_576, 6 * 1_048_576, 1000)).toBe("2,0 MB/s · faltam 2 s");
    expect(velocidadeERestante(1_048_576, 200 * 1_048_576, 1000)).toBe("1,0 MB/s · faltam 3 min 19 s");
    expect(velocidadeERestante(100, 1000, 100)).toBe("");
  });
});
