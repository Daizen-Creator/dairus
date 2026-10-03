import { describe, expect, it } from "vitest";
import { preverSaldo, vencimentoDaCompra } from "./previsao";
import { gerarIcs } from "./calendarioIcs";
import { proximoVencimentoTS } from "./recorrencia";
import { agendamento, conta, CONTAS, lancamento } from "../testes/dados";

describe("previsão de saldo", () => {
  it("acha o vencimento da fatura de uma compra", () => {
    expect(vencimentoDaCompra("2026-10-03", 5, 12)).toBe("2026-10-12");
    expect(vencimentoDaCompra("2026-10-06", 5, 12)).toBe("2026-11-12");
    expect(vencimentoDaCompra("2026-10-20", 28, 5)).toBe("2026-11-05");
  });

  it("aplica agendamentos, recorrências e gasto diário, e acha o primeiro dia negativo", () => {
    const contas = [conta({ id: "ativo-dinheiro", nome: "Conta", tipo: "ATIVO", subtipo: "BANCO", saldo_atual_centavos: 100_000 }), ...CONTAS.filter((c) => c.tipo !== "ATIVO" && c.tipo !== "PASSIVO")];
    const ags = [
      agendamento({ id: "a", descricao: "Aluguel", vencimento: "2026-10-10", valor_centavos: 150_000, recorrencia: "MENSAL" }),
      agendamento({ id: "s", descricao: "Salário", vencimento: "2026-10-05", valor_centavos: 80_000, tipo: "RECEBER", categoria_despesa_id: "receita-salario" }),
    ];
    const gastos = Array.from({ length: 9 }, (_, i) => lancamento({ id: `g${i}`, data: `2026-0${8 + Math.floor(i / 5)}-1${i % 5}`, descricao: "Mercado" }, 10_000));
    const p = preverSaldo({ hoje: "2026-10-02", dias: 60, contas, lancamentos: gastos, agendamentos: ags });
    expect(p.saldoInicial).toBe(100_000);
    expect(p.gastoDiario).toBe(1_000);
    expect(p.eventos.filter((e) => e.descricao === "Aluguel").map((e) => e.data)).toEqual(["2026-10-10", "2026-11-10"]);
    const dia10 = p.serie.find((x) => x.data === "2026-10-10")!;
    expect(dia10.saldo).toBe(100_000 + 80_000 - 150_000 - 8 * 1_000);
    expect(p.primeiroNegativo).toBe("2026-11-02");
  });

  it("sem receita agendada, usa a renda média no dia de costume", () => {
    const contas = [conta({ id: "ativo-dinheiro", nome: "Conta", tipo: "ATIVO", subtipo: "BANCO", saldo_atual_centavos: 0 }), ...CONTAS.filter((c) => c.tipo === "RECEITA" || c.tipo === "DESPESA")];
    const salarios = ["2026-07-05", "2026-08-05", "2026-09-05"].map((d, i) => lancamento({ id: `s${i}`, data: d, descricao: "Salário" }, 300_000, "receita-salario", "ativo-dinheiro"));
    const p = preverSaldo({ hoje: "2026-10-02", dias: 30, contas, lancamentos: salarios, agendamentos: [] });
    expect(p.eventos[0]).toMatchObject({ data: "2026-10-05", valor: 300_000 });
  });
});

describe("calendário e recorrência", () => {
  it("calcula a próxima recorrência", () => {
    expect(proximoVencimentoTS("2026-01-31", "MENSAL")).toBe("2026-02-28");
    expect(proximoVencimentoTS("2026-10-10", "SEMANAL")).toBe("2026-10-17");
  });
  it("gera um .ics válido com alarme na véspera", () => {
    const ics = gerarIcs([{ id: "x1", data: "2026-10-10", titulo: "Aluguel, R$ 1.500,00", descricao: "Conta a pagar" }], new Date("2026-10-02T12:00:00Z"));
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261010");
    expect(ics).toContain("DTEND;VALUE=DATE:20261011");
    expect(ics).toContain("SUMMARY:Aluguel\\, R$ 1.500\\,00");
    expect(ics).toContain("TRIGGER:-P1D");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
