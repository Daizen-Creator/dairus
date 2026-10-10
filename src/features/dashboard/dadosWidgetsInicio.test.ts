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

  it("assinatura estornada (e o estorno dela) não entra na soma do mês", () => {
    const assin = (id: string, valor: number, extra: Partial<Parameters<typeof lancamento>[0]> = {}) =>
      ({ ...lancamento({ id, data: "2026-10-02", descricao: id, ...extra }, valor), etiqueta: "ASSINATURA" as const });
    const netflix = assin("netflix", 3990);
    const spotify = assin("spotify", 2190);
    const cobrancaIndevida = assin("indevida", 5000);
    // O estorno copia a etiqueta da cobrança original, mas não pode contar como assinatura.
    const estorno = { ...assin("est", 5000, { origem: "ESTORNO", estornado_de: "indevida" }), origem: "ESTORNO" };
    expect(assinaturasDoMes([netflix, spotify, cobrancaIndevida, estorno], "2026-10-07")).toEqual({ total: 3990 + 2190, quantidade: 2 });
    // Estorno de outro mês também tira a cobrança: o que vale é o vínculo, não a data do estorno.
    const estornoDepois = { ...assin("est2", 3990, { origem: "ESTORNO", estornado_de: "netflix", data: "2026-11-02" }) };
    expect(assinaturasDoMes([netflix, spotify, estornoDepois], "2026-10-07")).toEqual({ total: 2190, quantidade: 1 });
  });
});
