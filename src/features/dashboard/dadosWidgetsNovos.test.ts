import { describe, expect, it } from "vitest";
import { calcular, calendarioDoMes, contasAPagar, gastoMedioMensal, maioresGastosDoMes, patrimonioLiquido, poupancaDoMes, progressoDoOrcamento, proximoDiaDoMes, reservaDeEmergencia, saldosDisponiveis } from "./dadosWidgetsInicio";
import { CONTAS, agendamento, lancamento } from "../../testes/dados";

const HOJE = "2026-10-15";

describe("widgets novos do início", () => {
  it("contas a pagar: atrasadas, próximos 7 dias e total", () => {
    const ag = [
      agendamento({ id: "atrasada", descricao: "Luz", vencimento: "2026-10-10" }),
      agendamento({ id: "logo", descricao: "Água", vencimento: "2026-10-18", valor_centavos: 5_000 }),
      agendamento({ id: "longe", descricao: "Aluguel", vencimento: "2026-10-30" }),
      agendamento({ id: "paga", descricao: "Net", vencimento: "2026-10-16", pago_em: "2026-10-14" }),
      agendamento({ id: "receber", descricao: "Salário", vencimento: "2026-10-16", tipo: "RECEBER" }),
    ];
    const r = contasAPagar(ag, HOJE);
    expect(r.atrasadas.map((a) => a.id)).toEqual(["atrasada"]);
    expect(r.proximas.map((a) => a.id)).toEqual(["logo"]);
    expect(r.total).toBe(15_000);
  });

  it("saldos disponíveis e patrimônio líquido", () => {
    expect(saldosDisponiveis(CONTAS).map((c) => c.id)).toEqual(["ativo-dinheiro"]);
    expect(patrimonioLiquido(CONTAS)).toEqual({ ativos: 50_000, passivos: 95_000, liquido: -45_000 });
  });

  it("poupança do mês, gasto médio e reserva de emergência", () => {
    const ls = [
      lancamento({ id: "sal", data: "2026-10-05", descricao: "Salário" }, 300_000, "receita-salario", "ativo-dinheiro"),
      lancamento({ id: "mer", data: "2026-10-06", descricao: "Mercado" }, 60_000),
      lancamento({ id: "set", data: "2026-09-10", descricao: "Setembro" }, 20_000),
      lancamento({ id: "ago", data: "2026-08-10", descricao: "Agosto" }, 30_000, "ativo-dinheiro", "despesa-transporte"),
    ];
    expect(poupancaDoMes(ls, CONTAS, HOJE)).toEqual({ receitas: 300_000, despesas: 60_000, sobra: 240_000, taxa: 0.8 });
    expect(poupancaDoMes([], CONTAS, HOJE).taxa).toBeNull();
    // Só meses completos com gasto entram na média: (20.000 + 30.000) / 2.
    expect(gastoMedioMensal(ls, CONTAS, HOJE)).toBe(25_000);
    const r = reservaDeEmergencia(CONTAS, ls, HOJE);
    expect(r.disponivel).toBe(50_000);
    expect(r.meses).toBe(2);
  });

  it("maiores gastos e orçamento do mês", () => {
    const ls = [
      lancamento({ id: "a", data: "2026-10-02", descricao: "Mercado" }, 40_000),
      lancamento({ id: "b", data: "2026-10-03", descricao: "Uber" }, 10_000, "ativo-dinheiro", "despesa-transporte"),
      lancamento({ id: "c", data: "2026-09-03", descricao: "Mês passado" }, 99_000),
    ];
    expect(maioresGastosDoMes(ls, CONTAS, HOJE)).toEqual([
      { id: "despesa-alimentacao", nome: "Alimentação", valor: 40_000 },
      { id: "despesa-transporte", nome: "Transporte", valor: 10_000 },
    ]);
    const orc = [
      { categoria_id: "despesa-transporte", limite_centavos: 40_000, acumular: false, acumular_desde: null },
      { categoria_id: "despesa-alimentacao", limite_centavos: 50_000, acumular: false, acumular_desde: null },
    ];
    expect(progressoDoOrcamento(orc, ls, CONTAS, HOJE).map((o) => [o.id, o.pct])).toEqual([["despesa-alimentacao", 0.8], ["despesa-transporte", 0.25]]);
  });

  it("contagem até um dia do mês, inclusive meses curtos", () => {
    expect(proximoDiaDoMes(HOJE, 20)).toEqual({ data: "2026-10-20", dias: 5 });
    expect(proximoDiaDoMes(HOJE, 15)).toEqual({ data: "2026-10-15", dias: 0 });
    expect(proximoDiaDoMes(HOJE, 5)).toEqual({ data: "2026-11-05", dias: 21 });
    expect(proximoDiaDoMes("2026-02-10", 31).data).toBe("2026-02-28");
  });

  it("calendário do mês começa no domingo certo", () => {
    const semanas = calendarioDoMes(HOJE);
    // 1º de outubro de 2026 é uma quinta-feira.
    expect(semanas[0]).toEqual([null, null, null, null, "2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(semanas.flat().filter(Boolean)).toHaveLength(31);
    expect(semanas.every((s) => s.length === 7)).toBe(true);
  });

  it("calculadora sem eval", () => {
    expect(calcular("2+3*4")).toBe(14);
    expect(calcular("(2+3)*4")).toBe(20);
    expect(calcular("1.500,50 + 99,50")).toBe(1600);
    expect(calcular("250*10%")).toBe(25);
    expect(calcular("10 ÷ 4")).toBe(2.5);
    expect(calcular("-5+2")).toBe(-3);
    expect(calcular("alert(1)")).toBeNull();
    expect(calcular("2+")).toBeNull();
    expect(calcular("1/0")).toBeNull();
    expect(calcular("")).toBeNull();
  });
});
