import { describe, expect, it } from "vitest";
import { despesasPorCategoriaNoMes, fluxoCaixaPorAno } from "./agregacoes";
import { CONTAS, lancamento } from "../testes/dados";

// CONTAS: ativo-dinheiro (ATIVO), cartao-nu (PASSIVO), despesa-alimentacao, despesa-transporte
// (DESPESA) e receita-salario (RECEITA). Na ajuda `lancamento(..., valor, de, para)` o `para`
// recebe o débito e o `de` o crédito.
const SAL = (id: string, data: string, valor: number) => lancamento({ id, data, descricao: "Salário" }, valor, "receita-salario", "ativo-dinheiro");
const ALIM = (id: string, data: string, valor: number) => lancamento({ id, data, descricao: "Mercado" }, valor, "ativo-dinheiro", "despesa-alimentacao");
const TRANS = (id: string, data: string, valor: number) => lancamento({ id, data, descricao: "Uber" }, valor, "ativo-dinheiro", "despesa-transporte");
/** Estorno de uma despesa: debita o dinheiro e credita a categoria. */
const ESTORNO_ALIM = (id: string, data: string, valor: number, de: string) =>
  lancamento({ id, data, descricao: "Estorno", origem: "ESTORNO", estornado_de: de }, valor, "despesa-alimentacao", "ativo-dinheiro");

describe("despesasPorCategoriaNoMes", () => {
  const INICIO = "2026-10-01";
  const FIM = "2026-10-31";

  it("soma por categoria dentro do período (limites inclusivos), das maiores para as menores", () => {
    const ls = [
      ALIM("a1", "2026-10-01", 10_000), // primeiro dia: entra
      ALIM("a2", "2026-10-31", 5_000), // último dia: entra
      ALIM("a3", "2026-09-30", 99_999), // fora
      ALIM("a4", "2026-11-01", 99_999), // fora
      TRANS("t1", "2026-10-15", 30_000),
      SAL("s1", "2026-10-05", 300_000), // receita não aparece
    ];
    expect(despesasPorCategoriaNoMes(ls, CONTAS, INICIO, FIM)).toEqual([
      { contaId: "despesa-transporte", nome: "Transporte", valorCentavos: 30_000 },
      { contaId: "despesa-alimentacao", nome: "Alimentação", valorCentavos: 15_000 },
    ]);
  });

  it("estorno anula a despesa original; categoria que zera ou fica negativa some", () => {
    const ls = [
      ALIM("a1", "2026-10-06", 60_000),
      ESTORNO_ALIM("e1", "2026-10-07", 60_000, "a1"), // anula: alimentação 0
      TRANS("t1", "2026-10-10", 5_000),
      // Reembolso maior que o gasto no mês: saldo líquido negativo, não aparece no gráfico.
      lancamento({ id: "r1", data: "2026-10-12", descricao: "Reembolso" }, 7_000, "despesa-transporte", "ativo-dinheiro"),
    ];
    expect(despesasPorCategoriaNoMes(ls, CONTAS, INICIO, FIM)).toEqual([]);
  });

  it("estorno em outro mês: o mês da despesa continua cheio, o do estorno fica sem ela", () => {
    const ls = [ALIM("a1", "2026-09-20", 40_000), ESTORNO_ALIM("e1", "2026-10-03", 40_000, "a1")];
    expect(despesasPorCategoriaNoMes(ls, CONTAS, "2026-09-01", "2026-09-30")).toEqual([{ contaId: "despesa-alimentacao", nome: "Alimentação", valorCentavos: 40_000 }]);
    expect(despesasPorCategoriaNoMes(ls, CONTAS, INICIO, FIM)).toEqual([]);
  });

  it("compra no cartão conta como despesa; pagar a fatura não", () => {
    const compra = lancamento({ id: "c1", data: "2026-10-08", descricao: "Cinema", origem: "CARTAO" }, 8_000, "cartao-nu", "despesa-alimentacao");
    const pagamento = lancamento({ id: "p1", data: "2026-10-12", descricao: "Fatura", origem: "FATURA" }, 8_000, "ativo-dinheiro", "cartao-nu");
    expect(despesasPorCategoriaNoMes([compra, pagamento], CONTAS, INICIO, FIM)).toEqual([{ contaId: "despesa-alimentacao", nome: "Alimentação", valorCentavos: 8_000 }]);
  });

  it("sem lançamentos, lista vazia", () => {
    expect(despesasPorCategoriaNoMes([], CONTAS, INICIO, FIM)).toEqual([]);
  });
});

describe("fluxoCaixaPorAno", () => {
  it("sempre devolve os 12 meses, com zero nos meses vazios", () => {
    const r = fluxoCaixaPorAno([], CONTAS, 2026);
    expect(r).toHaveLength(12);
    expect(r.map((m) => m.mes)).toEqual(["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]);
    expect(r.every((m) => m.receitasCentavos === 0 && m.despesasCentavos === 0 && m.saldoCentavos === 0)).toBe(true);
  });

  it("receitas, despesas e saldo por mês; outros anos ficam de fora", () => {
    const ls = [
      SAL("s1", "2026-01-05", 300_000),
      ALIM("a1", "2026-01-31", 80_000),
      TRANS("t1", "2026-01-10", 20_000),
      SAL("s2", "2026-10-05", 350_000),
      ALIM("a2", "2026-10-06", 60_000),
      SAL("s0", "2025-12-31", 999_999), // ano anterior
      SAL("s9", "2027-01-01", 999_999), // ano seguinte
    ];
    const r = fluxoCaixaPorAno(ls, CONTAS, 2026);
    expect(r[0]).toEqual({ mes: "Jan", receitasCentavos: 300_000, despesasCentavos: 100_000, saldoCentavos: 200_000 });
    expect(r[9]).toEqual({ mes: "Out", receitasCentavos: 350_000, despesasCentavos: 60_000, saldoCentavos: 290_000 });
    expect(r[11]).toEqual({ mes: "Dez", receitasCentavos: 0, despesasCentavos: 0, saldoCentavos: 0 });
  });

  it("estornos se anulam (despesa e receita) e despesa pode ficar negativa no mês", () => {
    const ls = [
      ALIM("a1", "2026-03-10", 50_000),
      ESTORNO_ALIM("e1", "2026-03-11", 50_000, "a1"),
      SAL("s1", "2026-03-05", 100_000),
      // Estorno de receita: debita a receita e credita o dinheiro.
      lancamento({ id: "e2", data: "2026-03-06", descricao: "Estorno", origem: "ESTORNO", estornado_de: "s1" }, 100_000, "ativo-dinheiro", "receita-salario"),
    ];
    const marco = fluxoCaixaPorAno(ls, CONTAS, 2026)[2];
    expect(marco).toEqual({ mes: "Mar", receitasCentavos: 0, despesasCentavos: 0, saldoCentavos: 0 });
  });

  it("transferência, pagamento de fatura e conta desconhecida não entram", () => {
    const pagamento = lancamento({ id: "p1", data: "2026-05-12", descricao: "Fatura", origem: "FATURA" }, 8_000, "ativo-dinheiro", "cartao-nu");
    const compra = lancamento({ id: "c1", data: "2026-05-08", descricao: "Cinema" }, 8_000, "cartao-nu", "despesa-alimentacao");
    const orfa = lancamento({ id: "o1", data: "2026-05-09", descricao: "Conta apagada" }, 1_000, "conta-que-nao-existe", "outra-conta-que-nao-existe");
    const maio = fluxoCaixaPorAno([pagamento, compra, orfa], CONTAS, 2026)[4];
    expect(maio).toEqual({ mes: "Mai", receitasCentavos: 0, despesasCentavos: 8_000, saldoCentavos: -8_000 });
  });
});
