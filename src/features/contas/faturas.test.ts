import { describe, expect, it } from "vitest";
import { alocarPagamentos, calcularEncargos, ciclosFechados, pagamentosDoCartao } from "./faturas";
import { lancamento } from "../../testes/dados";

describe("faturas fechadas", () => {
  it("lista os últimos ciclos fechados com início, fechamento e vencimento", () => {
    expect(ciclosFechados(5, 12, "2026-10-03", 2)).toEqual([
      { inicio: "2026-08-06", fechamento: "2026-09-05", vencimento: "2026-09-12" },
      { inicio: "2026-07-06", fechamento: "2026-08-05", vencimento: "2026-08-12" },
    ]);
    // Fechamento no dia 28 e vencimento no dia 5 do mês seguinte.
    expect(ciclosFechados(28, 5, "2026-10-29", 1)).toEqual([{ inicio: "2026-09-29", fechamento: "2026-10-28", vencimento: "2026-11-05" }]);
  });

  it("distribui pagamentos e marca paga, parcial e atrasada", () => {
    const faturas = [
      { id: "a", inicio: "2026-07-06", fechamento: "2026-08-05", vencimento: "2026-08-12", valor: 10_000 },
      { id: "b", inicio: "2026-08-06", fechamento: "2026-09-05", vencimento: "2026-09-12", valor: 20_000 },
    ];
    const [b, a] = alocarPagamentos(faturas, [{ data: "2026-08-12", valor: 10_000 }, { data: "2026-09-20", valor: 5_000 }], "2026-10-03");
    expect(a).toMatchObject({ status: "PAGA", pago: 10_000, diasAtraso: 0 });
    expect(b).toMatchObject({ status: "PARCIAL", pago: 5_000, diasAtraso: 21 });
    const [semPag] = alocarPagamentos([faturas[1]], [], "2026-09-10");
    expect(semPag.status).toBe("ABERTA");
  });

  it("calcula multa, juros e IOF do atraso", () => {
    const e = calcularEncargos(100_000, 0.12, 15);
    expect(e.multa).toBe(2_000);
    expect(e.juros).toBe(6_000);
    expect(e.iof).toBe(Math.round(100_000 * (0.0038 + 0.000082 * 15)));
    expect(e.total).toBe(e.multa + e.juros + e.iof);
    expect(calcularEncargos(100_000, 0.12, 0).total).toBe(0);
  });

  it("acha os pagamentos de fatura do cartão", () => {
    const pag = lancamento({ id: "p", data: "2026-09-12", descricao: "Pagamento", origem: "FATURA" }, 5_000, "ativo-dinheiro", "cartao-nu");
    expect(pagamentosDoCartao("cartao-nu", [pag])).toEqual([{ data: "2026-09-12", valor: 5_000 }]);
  });
});
