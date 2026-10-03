import { describe, expect, it } from "vitest";
import { formatarDataISOParaBR, nomeMesAno } from "./formato";

describe("formatarDataISOParaBR", () => {
  it("não volta um dia por causa do fuso horário do computador", () => {
    expect(formatarDataISOParaBR("2027-09-20")).toBe("20/09/2027");
    expect(formatarDataISOParaBR("2026-01-01")).toBe("01/01/2026");
    expect(formatarDataISOParaBR("2026-10-03T10:00:00Z")).toBe("03/10/2026");
  });

  it("nome do mês não vira o mês anterior", () => {
    expect(nomeMesAno("2026-10-01")).toBe("Outubro de 2026");
    expect(nomeMesAno("2027-01-31")).toBe("Janeiro de 2027");
  });
});
