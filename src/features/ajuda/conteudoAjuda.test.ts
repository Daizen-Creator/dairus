import { describe, expect, it } from "vitest";
import { dicaDoDia, DICAS, jurosCompostosSimples, notaQuiz, porcentagem, QUIZ } from "./conteudoAjuda";

describe("conteúdo da ajuda", () => {
  it("dica do dia muda por dia", () => {
    expect(DICAS).toContain(dicaDoDia("2026-10-03"));
    expect(dicaDoDia("2026-10-03")).not.toBe(dicaDoDia("2026-10-04"));
  });
  it("quiz e calculadoras", () => {
    expect(notaQuiz(QUIZ.map(() => true)).pontos).toBe(12);
    expect(notaQuiz([]).pontos).toBe(0);
    const p = porcentagem(200, 10);
    expect(p.parte).toBe(20);
    expect(p.comAumento).toBeCloseTo(220);
    expect(p.comDesconto).toBeCloseTo(180);
    expect(jurosCompostosSimples(0, 100, 0, 12)).toBe(1200);
  });
});
