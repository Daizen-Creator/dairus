import { describe, expect, it } from "vitest";
import { interpretarTextoLocal, lerData, normalizarPropostas, propostaCompleta } from "./iaLancamentos";
import { CONTAS, lancamento } from "../testes/dados";

const HOJE = "2026-10-03";

describe("lerData", () => {
  it("entende datas faladas", () => {
    expect(lerData("mercado ontem", HOJE)).toBe("2026-10-02");
    expect(lerData("anteontem", HOJE)).toBe("2026-10-01");
    expect(lerData("dia 25", HOJE)).toBe("2026-09-25");
    expect(lerData("dia 2", HOJE)).toBe("2026-10-02");
    expect(lerData("em 15/09", HOJE)).toBe("2026-09-15");
    expect(lerData("31/02", HOJE)).toBeNull();
    expect(lerData("sem data", HOJE)).toBeNull();
  });
});

describe("leitor local", () => {
  const historico = [lancamento({ id: "l1", data: "2026-09-10", descricao: "Uber viagem" }, 2000, "ativo-dinheiro", "despesa-transporte")];

  it("lê várias linhas com valor, data, conta e parcelas", () => {
    const r = interpretarTextoLocal("mercado 45,90 ontem\nuber 23.50 no dinheiro\ntv 1.200,00 em 10x no nubank\nrecebi 300 do João", HOJE, CONTAS, [{ id: "r", padrao: "mercado", categoria_id: "despesa-alimentacao" }], historico);
    expect(r).toHaveLength(4);
    expect(r[0]).toMatchObject({ tipo: "DESPESA", descricao: "Mercado", valor_centavos: 4590, data: "2026-10-02", categoria_id: "despesa-alimentacao" });
    expect(r[1]).toMatchObject({ valor_centavos: 2350, conta_id: "ativo-dinheiro", categoria_id: "despesa-transporte" });
    expect(r[2]).toMatchObject({ valor_centavos: 120_000, conta_id: "cartao-nu", parcelas: 10 });
    expect(r[3]).toMatchObject({ tipo: "RECEITA", valor_centavos: 30_000 });
  });

  it("lê notificação de banco colada", () => {
    const r = interpretarTextoLocal("Compra de R$ 45,90 APROVADA em IFOOD para o cartão com final 1234", HOJE, CONTAS, [], []);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ descricao: "IFOOD", valor_centavos: 4590, conta_id: "cartao-nu" });
  });

  it("ignora linhas sem valor", () => {
    expect(interpretarTextoLocal("oi tudo bem", HOJE, CONTAS, [], [])).toEqual([]);
  });
});

describe("normalizarPropostas", () => {
  it("aceita o JSON da IA e corrige o que for inválido", () => {
    const r = normalizarPropostas(
      {
        lancamentos: [
          { tipo: "DESPESA", descricao: "Padaria", valor: 12.5, data: "2026-10-01", categoria_id: "despesa-alimentacao", conta_id: "ativo-dinheiro", parcelas: 3 },
          { tipo: "RECEITA", descricao: "Salário", valor: "3.500,00", data: "data ruim", categoria_id: "despesa-alimentacao", conta_id: "inventada" },
          { tipo: "TRANSFERENCIA", valor: "100.50", conta_id: "ativo-dinheiro", conta_destino_id: "cartao-nu" },
          { tipo: "DESPESA", valor: 0 },
        ],
      },
      CONTAS,
      HOJE,
    );
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ valor_centavos: 1250, parcelas: null, conta_id: "ativo-dinheiro" });
    expect(r[1]).toMatchObject({ tipo: "RECEITA", valor_centavos: 350_000, data: HOJE, categoria_id: null, conta_id: null });
    expect(r[2]).toMatchObject({ tipo: "TRANSFERENCIA", valor_centavos: 10_050, conta_destino_id: "cartao-nu", descricao: "Transferência" });
    expect(propostaCompleta(r[0])).toBeNull();
    expect(propostaCompleta(r[1])).toBe("Escolha a conta.");
  });
});
