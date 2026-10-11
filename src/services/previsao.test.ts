import { describe, expect, it } from "vitest";
import { parcelasParaPrevisao, preverSaldo, vencimentoDaCompra, vencimentoDaFaturaFechada } from "./previsao";
import type { Emprestimo } from "./planejamento";
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

// Conta com muito dinheiro (para o saldo não atrapalhar), cartão que fecha dia 5 e vence dia 12.
const BANCO = conta({ id: "ativo-dinheiro", nome: "Conta", tipo: "ATIVO", subtipo: "BANCO", saldo_atual_centavos: 1_000_000 });
const cartao = (saldo: number) => conta({ id: "cartao-nu", nome: "Nubank", tipo: "PASSIVO", subtipo: "CARTAO_CREDITO", dia_fechamento_fatura: 5, dia_vencimento_fatura: 12, saldo_atual_centavos: saldo });
const faturas = (p: ReturnType<typeof preverSaldo>) => p.eventos.filter((e) => e.descricao === "Fatura Nubank").map((e) => [e.data, e.valor]);

describe("previsão: o que já venceu e não foi pago", () => {
  it("vencimento da fatura que fechou por último", () => {
    expect(vencimentoDaFaturaFechada("2026-10-08", 5, 12)).toBe("2026-10-12"); // fechou dia 5, vence dia 12
    expect(vencimentoDaFaturaFechada("2026-10-20", 5, 12)).toBe("2026-10-12"); // já passou: atrasada
    expect(vencimentoDaFaturaFechada("2026-10-03", 5, 12)).toBe("2026-09-12"); // ainda não fechou este mês
    expect(vencimentoDaFaturaFechada("2026-01-03", 5, 12)).toBe("2025-12-12"); // virada de ano
    expect(vencimentoDaFaturaFechada("2026-10-05", 5, 12)).toBe("2026-10-12"); // no dia do fechamento
    // Fecha dia 28, vence dia 5: o vencimento é no mês seguinte ao fechamento.
    expect(vencimentoDaFaturaFechada("2026-10-30", 28, 5)).toBe("2026-11-05");
    // Fechamento dia 31 em mês curto fecha no último dia (30/11).
    expect(vencimentoDaFaturaFechada("2026-12-02", 31, 10)).toBe("2026-12-10");
  });

  it("fatura fechada ainda a vencer entra no vencimento dela, não no da compra de hoje", () => {
    // Hoje 08/10: a fatura fechou dia 5 e vence dia 12 deste mês (antes caía em 12/11).
    const p = preverSaldo({ hoje: "2026-10-08", dias: 60, contas: [BANCO, cartao(95_000)], lancamentos: [], agendamentos: [] });
    expect(faturas(p)).toEqual([["2026-10-12", -95_000]]);
    expect(p.serie.find((x) => x.data === "2026-10-11")!.saldo).toBe(1_000_000);
    expect(p.serie.find((x) => x.data === "2026-10-12")!.saldo).toBe(1_000_000 - 95_000);
  });

  it("fatura atrasada entra amanhã e não apaga as faturas futuras", () => {
    // Hoje 20/10: a de 12/10 está atrasada (75.000). A compra de 15/10 (20.000) vence em 12/11.
    const compras = new Map([["cartao-nu", [{ data: "2026-10-15", valor: 20_000 }]]]);
    const p = preverSaldo({ hoje: "2026-10-20", dias: 60, contas: [BANCO, cartao(95_000)], lancamentos: [], agendamentos: [], comprasCartao: compras });
    expect(faturas(p)).toEqual([["2026-10-21", -75_000], ["2026-11-12", -20_000]]);
    expect(p.serie.find((x) => x.data === "2026-10-21")!.saldo).toBe(1_000_000 - 75_000);
  });

  it("fatura que vence hoje junta com o restante em um único evento amanhã", () => {
    const compras = new Map([["cartao-nu", [{ data: "2026-09-20", valor: 30_000 }]]]); // vence 12/10 (hoje)
    const p = preverSaldo({ hoje: "2026-10-12", dias: 30, contas: [BANCO, cartao(95_000)], lancamentos: [], agendamentos: [], comprasCartao: compras });
    expect(faturas(p)).toEqual([["2026-10-13", -95_000]]);
  });

  it("fatura atrasada na virada de ano", () => {
    const p = preverSaldo({ hoje: "2026-01-03", dias: 30, contas: [BANCO, cartao(40_000)], lancamentos: [], agendamentos: [] });
    expect(faturas(p)).toEqual([["2026-01-04", -40_000]]);
  });

  it("parcela de empréstimo atrasada ou que vence hoje ainda entra, amanhã", () => {
    const parcelas = [
      { data: "2026-09-25", valor: 50_000, descricao: "Parcela Carro" }, // atrasada
      { data: "2026-10-02", valor: 30_000, descricao: "Parcela Moto" }, // vence hoje
      { data: "2026-10-20", valor: 10_000, descricao: "Parcela Carro" },
      { data: "2027-03-01", valor: 99_999, descricao: "Parcela Carro" }, // fora do horizonte
    ];
    const p = preverSaldo({ hoje: "2026-10-02", dias: 30, contas: [BANCO], lancamentos: [], agendamentos: [], parcelas });
    expect(p.eventos.map((e) => [e.data, e.valor])).toEqual([["2026-10-03", -50_000], ["2026-10-03", -30_000], ["2026-10-20", -10_000]]);
    expect(p.serie.find((x) => x.data === "2026-10-03")!.saldo).toBe(1_000_000 - 80_000);
  });

  it("conta agendada vencida entra amanhã, a que vence hoje também, sem repetir as repetições passadas", () => {
    const ags = [
      agendamento({ id: "al", descricao: "Aluguel", vencimento: "2026-08-10", valor_centavos: 100_000, recorrencia: "MENSAL" }), // atrasado 2 meses
      agendamento({ id: "luz", descricao: "Luz", vencimento: "2026-10-02", valor_centavos: 20_000 }), // vence hoje
    ];
    const p = preverSaldo({ hoje: "2026-10-02", dias: 60, contas: [BANCO], lancamentos: [], agendamentos: ags });
    expect(p.eventos.filter((e) => e.descricao === "Aluguel").map((e) => e.data)).toEqual(["2026-10-03", "2026-10-10", "2026-11-10"]);
    expect(p.eventos.filter((e) => e.descricao === "Luz").map((e) => e.data)).toEqual(["2026-10-03"]);
  });
});

// Empréstimo de teste: parcelas de R$ 100,00 todo dia 10, a partir de `primeiro` (AAAA-MM).
function emprestimo(primeiro: string, n: number, cadastrado_em: string, pagas: number[] = []): Emprestimo {
  const [a, m] = primeiro.split("-").map(Number);
  const tabela = Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 + i, 10)).toISOString().slice(0, 10);
    return { numero: i + 1, vencimento: d, parcela: 10_000, juros: 1_000, amortizacao: 9_000, saldo_depois: 0 };
  });
  return {
    id: "e1", nome: "Carro", sistema: "PRICE", principal_centavos: n * 9_000, taxa_mensal: 0.01, parcelas: n,
    primeiro_vencimento: tabela[0].vencimento, conta_passivo_id: "emp-1", cadastrado_em, saldo_devedor_centavos: 0, pagas, tabela,
  };
}

describe("previsão: parcelas de empréstimo atrasadas", () => {
  const prever = (e: Emprestimo, hoje = "2026-10-02") =>
    preverSaldo({ hoje, dias: 60, contas: [BANCO], lancamentos: [], agendamentos: [], parcelas: parcelasParaPrevisao([e]) });

  it("dívida que já existia: 24 parcelas vencidas antes do cadastro não vão para amanhã", () => {
    // 1ª parcela em 10/10/2024; cadastrado em 01/10/2026, nenhuma paga. As 24 primeiras (até 10/09/2026) são histórico.
    const p = prever(emprestimo("2024-10", 36, "2026-10-01"));
    expect(p.eventos.map((e) => [e.data, e.valor, e.descricao])).toEqual([
      ["2026-10-10", -10_000, "Parcela 25/36 Carro"],
      ["2026-11-10", -10_000, "Parcela 26/36 Carro"],
    ]);
    expect(p.serie.find((x) => x.data === "2026-10-03")!.saldo).toBe(1_000_000);
  });

  it("a parcela seguinte à última paga, vencida depois do cadastro, está atrasada e entra amanhã", () => {
    // Cadastrado em 01/06/2026, 1ª em 10/06; pagou jun, jul e ago. A de 10/09 está atrasada.
    const p = prever(emprestimo("2026-06", 12, "2026-06-01", [1, 2, 3]));
    expect(p.eventos.map((e) => [e.data, e.descricao])).toEqual([
      ["2026-10-03", "Parcela 4/12 Carro"],
      ["2026-10-10", "Parcela 5/12 Carro"],
      ["2026-11-10", "Parcela 6/12 Carro"],
    ]);
  });

  it("dívida antiga cadastrada no meio: só o que venceu depois do cadastro é atraso", () => {
    // 1ª em 10/01/2025, cadastrado em 15/08/2026: a de 10/08 é histórico, a de 10/09 está atrasada.
    const parcelas = parcelasParaPrevisao([emprestimo("2025-01", 30, "2026-08-15")]);
    expect(parcelas[0]).toMatchObject({ data: "2026-09-10", descricao: "Parcela 21/30 Carro" });
    const p = prever(emprestimo("2025-01", 30, "2026-08-15"));
    expect(p.eventos.filter((e) => e.data === "2026-10-03")).toHaveLength(1);
  });

  it("parcela que vence no próprio dia do cadastro conta; parcelas pagas ficam de fora", () => {
    const e = emprestimo("2026-09", 3, "2026-09-10", [1]);
    expect(parcelasParaPrevisao([e]).map((x) => x.data)).toEqual(["2026-10-10", "2026-11-10"]);
    expect(parcelasParaPrevisao([emprestimo("2026-09", 3, "2026-09-10")]).map((x) => x.data)).toEqual(["2026-09-10", "2026-10-10", "2026-11-10"]);
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
