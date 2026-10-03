import { describe, expect, it } from "vitest";
import { abaixoDoMinimo, extratoDaConta, moverNaOrdem, ordenarManual, textoDadosBancarios } from "./ferramentasContas";
import { CONTAS, lancamento } from "../../testes/dados";

describe("ferramentas das contas", () => {
  it("ordem manual e mover", () => {
    const cs = [{ id: "a", nome: "Zeta" }, { id: "b", nome: "Alfa" }, { id: "c", nome: "Beta" }];
    expect(ordenarManual(cs, ["c", "a"]).map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(moverNaOrdem(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(moverNaOrdem(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
  });

  it("extrato com saldo corrido, período e busca", () => {
    const dinheiro = CONTAS[0];
    const ls = [
      lancamento({ id: "1", data: "2026-09-01", descricao: "Salário" }, 100_000, "receita-salario", "ativo-dinheiro"),
      lancamento({ id: "2", data: "2026-09-05", descricao: "Mercado" }, 20_000),
      lancamento({ id: "3", data: "2026-10-01", descricao: "Padaria" }, 1_000),
    ];
    const tudo = extratoDaConta(dinheiro, ls, "0000-01-01", "9999-12-31");
    expect(tudo.map((x) => x.saldo)).toEqual([100_000, 80_000, 79_000]);
    expect(extratoDaConta(dinheiro, ls, "2026-09-02", "2026-09-30").map((x) => x.valor)).toEqual([-20_000]);
    expect(extratoDaConta(dinheiro, ls, "0000-01-01", "9999-12-31", "pad")).toHaveLength(1);
  });

  it("alerta de saldo mínimo e texto dos dados bancários", () => {
    expect(abaixoDoMinimo(CONTAS, { "ativo-dinheiro": 60_000 })[0].conta.id).toBe("ativo-dinheiro");
    expect(abaixoDoMinimo(CONTAS, { "ativo-dinheiro": 10_000 })).toEqual([]);
    expect(textoDadosBancarios(CONTAS[0], { agencia: "0001", pix: "a@b.com" })).toBe("Dinheiro\nAgência: 0001\nPix: a@b.com");
  });
});
