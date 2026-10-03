import { describe, expect, it } from "vitest";
import { marcosDoPatrimonio, serieMensal } from "./linhaDoTempo";
import type { Conta, Lancamento } from "../../types/accounting";
import type { Bem } from "../../types/extras";

const conta = (id: string, tipo: Conta["tipo"]) => ({ id, tipo, nome: id, ativa: true, saldo_atual_centavos: 0 }) as unknown as Conta;
const lanc = (data: string, debito: string, credito: string, v: number) =>
  ({ id: `${data}-${debito}`, data, descricao: "x", origem: "MANUAL", partidas: [{ conta_id: debito, tipo: "DEBITO", valor_centavos: v }, { conta_id: credito, tipo: "CREDITO", valor_centavos: v }] }) as unknown as Lancamento;

describe("linha do tempo do patrimônio", () => {
  const contas = [conta("banco", "ATIVO"), conta("emprestimo", "PASSIVO"), conta("salario", "RECEITA")];
  const lancamentos = [
    lanc("2026-01-05", "banco", "emprestimo", 500_000), // pega empréstimo: líquido 0
    lanc("2026-01-10", "salario", "banco", 0),
    lanc("2026-02-05", "banco", "salario", 300_000),
    lanc("2026-03-05", "emprestimo", "banco", 500_000), // quita
    lanc("2026-03-06", "banco", "salario", 900_000),
  ];
  const bens: Bem[] = [{ id: "b", nome: "Moto", tipo: "BEM", valor_centavos: 1_000_000, categoria: null, notas: null, aquisicao_data: null, aquisicao_valor_centavos: null, avaliacoes: [{ data: "2026-04-02", valor_centavos: 1_000_000 }] }];

  it("monta a série mês a mês até hoje", () => {
    const s = serieMensal("2026-04-15", contas, lancamentos, bens);
    expect(s.map((p) => p.mes)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
    expect(s[0]).toEqual({ mes: "2026-01", liquido: 0, dividas: 500_000 });
    expect(s[2].dividas).toBe(0);
    expect(s[3].liquido).toBe(2_200_000);
  });

  it("encontra os marcos", () => {
    const s = serieMensal("2026-04-15", contas, lancamentos, bens);
    const titulos = marcosDoPatrimonio(s, bens).map((m) => `${m.mes} ${m.titulo}`);
    expect(titulos).toContain("2026-03 Zerou as dívidas");
    expect(titulos).toContain("2026-03 Passou de R$ 10.000");
    expect(titulos).toContain("2026-04 Moto entrou no patrimônio");
    expect(titulos).not.toContain("2026-04 Passou de R$ 50.000");
    expect(titulos).toContain("2026-04 Patrimônio no maior valor da história");
  });
});
