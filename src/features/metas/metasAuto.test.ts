import { describe, expect, it } from "vitest";
import { arredondamentos, conquistas, dividirEnvelopes, progressoDesafio, sobraDoMes } from "./metasAuto";
import { CONTAS, lancamento } from "../../testes/dados";

describe("automações das metas", () => {
  const ls = [
    lancamento({ id: "a", data: "2026-09-02", descricao: "Padaria" }, 1840),
    lancamento({ id: "b", data: "2026-09-03", descricao: "Uber" }, 2000, "ativo-dinheiro", "despesa-transporte"),
    lancamento({ id: "s", data: "2026-09-05", descricao: "Salário" }, 300_000, "receita-salario", "ativo-dinheiro"),
  ];

  it("arredonda gastos para cima", () => {
    expect(arredondamentos(ls, CONTAS, "2026-09-01", "2026-09-30")).toBe(160);
  });

  it("divide o salário em caixinhas", () => {
    expect(dividirEnvelopes(300_001, [{ meta_id: "r", percentual: 10 }, { meta_id: "v", percentual: 5 }])).toEqual([{ meta_id: "r", valor: 30_000 }, { meta_id: "v", valor: 15_000 }]);
    const tudo = dividirEnvelopes(1_001, [{ meta_id: "a", percentual: 50 }, { meta_id: "b", percentual: 50 }]);
    expect(tudo.reduce((s, x) => s + x.valor, 0)).toBe(1_001);
  });

  it("calcula a sobra do mês", () => {
    expect(sobraDoMes(ls, CONTAS, "2026-09")).toBe(300_000 - 1840 - 2000);
  });

  it("acompanha desafios", () => {
    const d = { id: "d", nome: "Sem Uber", tipo: "SEM_MARCA" as const, alvo: "uber", inicio: "2026-09-01", dias: 30 };
    expect(progressoDesafio(d, ls, CONTAS, "2026-09-10").status).toBe("FALHOU");
    expect(progressoDesafio({ ...d, alvo: "ifood" }, ls, CONTAS, "2026-09-10")).toMatchObject({ status: "EM_ANDAMENTO", diasPassados: 10 });
    expect(progressoDesafio({ ...d, alvo: "ifood" }, ls, CONTAS, "2026-10-05").status).toBe("CONCLUIDO");
    const lim = { id: "l", nome: "Comida até 20", tipo: "LIMITE_CATEGORIA" as const, alvo: "despesa-alimentacao", valor: 2_000, inicio: "2026-09-01", dias: 30 };
    expect(progressoDesafio(lim, ls, CONTAS, "2026-09-10")).toMatchObject({ gasto: 1840, status: "EM_ANDAMENTO" });
  });

  it("dá conquistas com base nos dados", () => {
    const c = conquistas(ls, CONTAS, [{ id: "m", nome: "Reserva", valor_alvo_centavos: 100, prazo: null, guardado_centavos: 150_000, tipo: null, prioridade: null, notas: null, conta_id: null }], "2026-10-02", ["despesa-transporte"]);
    const obtidas = c.filter((x) => x.obtida).map((x) => x.id);
    expect(obtidas).toEqual(expect.arrayContaining(["azul-1", "meta-1", "guardou-1000", "sem-superfluo-7"]));
    expect(obtidas).not.toContain("azul-3");
  });
});
