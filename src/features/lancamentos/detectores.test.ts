import { describe, expect, it } from "vitest";
import { detectarAssinaturas, foraDoPadrao, lerNotificacaoBanco, possivelDuplicata } from "./detectores";
import { chaveDescricao, marcaDaDescricao, nomeCategoria, opcoesCategoria, padronizarDescricao, sugerirCategoria } from "../../services/categorias";
import { lerTags } from "../../services/lancamentosExtras";
import { conta, CONTAS, lancamento } from "../../testes/dados";

describe("categorias", () => {
  const mercado = conta({ id: "cat-mercado", nome: "Mercado", tipo: "DESPESA", categoria_pai_id: "despesa-alimentacao" });
  const todas = [...CONTAS, mercado];
  it("mostra subcategoria com o nome da principal", () => {
    const porId = new Map(todas.map((c) => [c.id, c]));
    expect(nomeCategoria(mercado, porId)).toBe("Alimentação › Mercado");
    expect(opcoesCategoria(todas.filter((c) => c.tipo === "DESPESA")).map((o) => o.label)).toEqual(["Alimentação", "Alimentação › Mercado", "Transporte"]);
  });

  it("limpa descrições de extrato", () => {
    expect(chaveDescricao("UBER *TRIP 8823 SÃO PAULO")).toBe("uber trip sao paulo");
    expect(marcaDaDescricao("PAG*IFOOD 123")).toBe("ifood");
    expect(padronizarDescricao("UBER *TRIP 8823")).toBe("Uber Trip");
    expect(padronizarDescricao("Padaria do Zé")).toBe("Padaria do Zé");
  });

  it("sugere pela regra e, sem regra, pelo histórico", () => {
    const regras = [{ id: "r", padrao: "uber", categoria_id: "despesa-transporte" }];
    expect(sugerirCategoria("UBER *TRIP 99", "DESPESA", regras, [], CONTAS)).toEqual({ categoriaId: "despesa-transporte", motivo: "REGRA", padrao: "uber" });
    const hist = [lancamento({ id: "h", data: "2026-09-01", descricao: "IFOOD *RESTAURANTE" })];
    expect(sugerirCategoria("Ifood pedido 22", "DESPESA", regras, hist, CONTAS)?.categoriaId).toBe("despesa-alimentacao");
    expect(sugerirCategoria("Algo novo", "DESPESA", regras, hist, CONTAS)).toBeNull();
  });

  it("lê tags separadas por vírgula", () => {
    expect(lerTags("Viagem, #presente; viagem ,")).toEqual(["viagem", "presente"]);
  });
});

describe("detectores", () => {
  it("avisa duplicata com mesmo valor, data próxima e mesma marca", () => {
    const ls = [lancamento({ id: "a", data: "2026-10-01", descricao: "Uber trip" }, 2350)];
    expect(possivelDuplicata({ data: "2026-10-02", valorCentavos: 2350, descricao: "UBER *TRIP" }, ls)?.id).toBe("a");
    expect(possivelDuplicata({ data: "2026-10-09", valorCentavos: 2350, descricao: "UBER" }, ls)).toBeNull();
    expect(possivelDuplicata({ data: "2026-10-01", valorCentavos: 9999, descricao: "UBER" }, ls)).toBeNull();
  });

  it("avisa gasto muito acima da média da categoria", () => {
    const ls = [1, 2, 3, 4].map((i) => lancamento({ id: `m${i}`, data: `2026-0${5 + i}-10`, descricao: "Mercado" }, 10_000));
    expect(foraDoPadrao(35_000, "despesa-alimentacao", ls, "2026-10-02")?.vezes).toBeCloseTo(3.5);
    expect(foraDoPadrao(15_000, "despesa-alimentacao", ls, "2026-10-02")).toBeNull();
    expect(foraDoPadrao(99_000, "despesa-alimentacao", ls.slice(0, 2), "2026-10-02")).toBeNull();
  });

  it("detecta assinaturas que se repetem todo mês", () => {
    const netflix = ["2026-07-05", "2026-08-05", "2026-09-05"].map((d, i) => lancamento({ id: `n${i}`, data: d, descricao: "NETFLIX.COM" }, 5590));
    const ifood = ["2026-07-05", "2026-07-06", "2026-08-05", "2026-08-07", "2026-09-05", "2026-09-09"].map((d, i) => lancamento({ id: `i${i}`, data: d, descricao: "IFOOD" }, 5000));
    const r = detectarAssinaturas([...netflix, ...ifood], CONTAS, "2026-10-02");
    expect(r.map((a) => a.marca)).toEqual(["netflix"]);
    expect(r[0].ids).toHaveLength(3);
  });

  it("lê notificações de banco", () => {
    expect(lerNotificacaoBanco("Compra de R$ 45,90 APROVADA em IFOOD para o cartão com final 1234", "2026-10-02")).toEqual({ valorCentavos: 4590, descricao: "IFOOD", tipo: "DESPESA", cartao: true, data: null });
    const pix = lerNotificacaoBanco("Pix enviado: R$ 25,00 para PADARIA BOM PAO", "2026-10-02")!;
    expect(pix.descricao).toBe("PADARIA BOM PAO");
    expect(pix.cartao).toBe(false);
    const rec = lerNotificacaoBanco("Você recebeu uma transferência de R$ 1.300,00 de FULANO DE TAL em 01/10", "2026-10-02")!;
    expect(rec).toMatchObject({ valorCentavos: 130_000, tipo: "RECEITA", data: "2026-10-01" });
    expect(lerNotificacaoBanco("sem valor nenhum", "2026-10-02")).toBeNull();
  });
});
