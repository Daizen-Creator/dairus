import { describe, expect, it } from "vitest";
import { assinaturasDoMes, gastosRecentes, proximosRecebimentos } from "./dadosWidgetsInicio";
import { CONTAS, lancamento } from "../../testes/dados";
import type { Agendamento } from "../../types/accounting";

describe("widgets do início", () => {
  it("gasto de hoje, da semana e dias sem gastar", () => {
    // 2026-10-07 é quarta; semana começa na segunda 05.
    const ls = [lancamento({ id: "a", data: "2026-10-05", descricao: "x" }, 1000), lancamento({ id: "b", data: "2026-10-04", descricao: "y" }, 500)];
    expect(gastosRecentes(ls, CONTAS, "2026-10-07")).toEqual({ hoje: 0, semana: 1000, diasSemGastar: 2 });
    expect(gastosRecentes(ls, CONTAS, "2026-10-05").hoje).toBe(1000);
  });

  it("recebimentos e assinaturas", () => {
    const ag = [{ id: "1", tipo: "RECEBER", pago_em: null, vencimento: "2026-10-10" }, { id: "2", tipo: "PAGAR", pago_em: null, vencimento: "2026-10-09" }] as Agendamento[];
    expect(proximosRecebimentos(ag, "2026-10-07").map((a) => a.id)).toEqual(["1"]);
    const l = { ...lancamento({ id: "n", data: "2026-10-02", descricao: "Netflix" }, 3990), etiqueta: "ASSINATURA" as const };
    expect(assinaturasDoMes([l], "2026-10-07")).toEqual({ total: 3990, quantidade: 1 });
  });
});
