import { describe, expect, it } from "vitest";
import { FILTROS_PADRAO, aplicarFiltros, analisar, filtrosAtivos, totalizar, valorDoLancamento, type Filtros } from "./analise";
import { CONTAS, conta, lancamento } from "../../testes/dados";

const TODAS = [
  ...CONTAS,
  conta({ id: "ativo-banco", nome: "Banco", tipo: "ATIVO", subtipo: "BANCO" }),
  conta({ id: "despesa-mercado", nome: "Mercado", tipo: "DESPESA", categoria_pai_id: "despesa-alimentacao" }),
];
const porId = new Map(TODAS.map((c) => [c.id, c]));

// Na ajuda `lancamento(p, valor, de, para)`, `para` recebe o débito e `de` o crédito.
const L1 = lancamento({ id: "L1", data: "2026-10-06", descricao: "Mercado do mês" }, 60_000); // despesa Alimentação
const L2 = lancamento({ id: "L2", data: "2026-10-05", descricao: "Salário" }, 300_000, "receita-salario", "ativo-dinheiro");
const L3 = lancamento({ id: "L3", data: "2026-10-12", descricao: "Fatura Nubank", origem: "FATURA" }, 20_000, "ativo-dinheiro", "cartao-nu");
const L4 = lancamento({ id: "L4", data: "2026-10-08", descricao: "Para o banco", origem: "TRANSFERENCIA" }, 5_000, "ativo-dinheiro", "ativo-banco");
const L5 = lancamento({ id: "L5", data: "2026-10-07", descricao: "Estorno do mercado", origem: "ESTORNO", estornado_de: "L1" }, 60_000, "despesa-alimentacao", "ativo-dinheiro");
const L6 = { ...lancamento({ id: "L6", data: "2026-10-02", descricao: "Netflix", observacao: "plano premium" }, 3_990, "ativo-dinheiro", "despesa-transporte"), etiqueta: "ASSINATURA" as const };
const L7 = lancamento({ id: "L7", data: "2026-10-09", descricao: "Feira" }, 1_000, "ativo-dinheiro", "despesa-mercado"); // subcategoria
const LS = [L1, L2, L3, L4, L5, L6, L7];
const SEM_ESTORNADOS = new Set<string>();

const ids = (f: Partial<Filtros>, estornados = SEM_ESTORNADOS, tags = new Map<string, string[]>()) =>
  aplicarFiltros(LS, porId, { ...FILTROS_PADRAO, ...f }, estornados, tags).map(({ l }) => l.id);

describe("analisar", () => {
  it("despesa: saída, com categoria e conta de onde saiu o dinheiro", () => {
    const a = analisar(L1, porId);
    expect(a).toMatchObject({ tipo: "DESPESA", entrada: false, saida: true, valorCentavos: 60_000, estorno: false });
    expect(a.categoria?.id).toBe("despesa-alimentacao");
    expect(a.contasEnvolvidas.map((c) => c.id)).toEqual(["ativo-dinheiro"]);
  });

  it("receita: entrada", () => {
    expect(analisar(L2, porId)).toMatchObject({ tipo: "RECEITA", entrada: true, saida: false, valorCentavos: 300_000 });
  });

  it("pagamento de fatura e transferência não são entrada nem saída", () => {
    const fatura = analisar(L3, porId);
    expect(fatura).toMatchObject({ tipo: "FATURA", entrada: false, saida: false, categoria: null });
    expect(fatura.contasEnvolvidas.map((c) => c.id)).toEqual(["cartao-nu", "ativo-dinheiro"]);
    expect(analisar(L4, porId)).toMatchObject({ tipo: "TRANSFERENCIA", entrada: false, saida: false });
  });

  it("estorno inverte o sentido do original", () => {
    expect(analisar(L5, porId)).toMatchObject({ tipo: "DESPESA", estorno: true, entrada: true, saida: false });
    const estornoDeReceita = lancamento({ id: "E", data: "2026-10-06", descricao: "x", origem: "ESTORNO", estornado_de: "L2" }, 300_000, "ativo-dinheiro", "receita-salario");
    expect(analisar(estornoDeReceita, porId)).toMatchObject({ tipo: "RECEITA", estorno: true, entrada: false, saida: true });
  });

  it("contas desconhecidas viram 'OUTRO' sem quebrar", () => {
    const orfao = lancamento({ id: "O", data: "2026-10-06", descricao: "x" }, 100, "nao-existe", "tambem-nao");
    expect(analisar(orfao, porId)).toMatchObject({ tipo: "OUTRO", categoria: null, contasEnvolvidas: [], entrada: false, saida: false });
  });

  it("o valor é a soma dos débitos (lançamento dividido em duas categorias)", () => {
    const dividido = {
      ...lancamento({ id: "D", data: "2026-10-06", descricao: "Mercado e feira" }, 5_000),
      partidas: [
        { id: "d1", conta_id: "despesa-alimentacao", tipo: "DEBITO" as const, valor_centavos: 3_000 },
        { id: "d2", conta_id: "despesa-transporte", tipo: "DEBITO" as const, valor_centavos: 2_000 },
        { id: "c1", conta_id: "ativo-dinheiro", tipo: "CREDITO" as const, valor_centavos: 5_000 },
      ],
    };
    expect(valorDoLancamento(dividido)).toBe(5_000);
  });
});

describe("aplicarFiltros", () => {
  it("sem filtros devolve tudo, do mais recente para o mais antigo", () => {
    expect(ids({})).toEqual(["L3", "L7", "L4", "L5", "L1", "L2", "L6"]);
    expect(ids({ ordem: "ANTIGOS" })).toEqual(["L6", "L2", "L1", "L5", "L4", "L7", "L3"]);
  });

  it("ordena por valor (empates mantêm a ordem de entrada)", () => {
    expect(ids({ ordem: "MAIOR" })).toEqual(["L2", "L1", "L5", "L3", "L4", "L6", "L7"]);
    expect(ids({ ordem: "MENOR" })).toEqual(["L7", "L6", "L4", "L3", "L1", "L5", "L2"]);
  });

  it("filtra por tipo", () => {
    expect(ids({ tipo: "DESPESA" })).toEqual(["L7", "L5", "L1", "L6"]);
    expect(ids({ tipo: "RECEITA" })).toEqual(["L2"]);
    expect(ids({ tipo: "FATURA" })).toEqual(["L3"]);
    expect(ids({ tipo: "TRANSFERENCIA" })).toEqual(["L4"]);
  });

  it("esconde o lançamento estornado e o próprio estorno", () => {
    expect(ids({ mostrarEstornados: false }, new Set(["L1"]))).toEqual(["L3", "L7", "L4", "L2", "L6"]);
    // Sem a lista de estornados, só o estorno (origem ESTORNO) some.
    expect(ids({ mostrarEstornados: false })).toEqual(["L3", "L7", "L4", "L1", "L2", "L6"]);
  });

  it("categoria inclui as subcategorias", () => {
    expect(ids({ categoriaId: "despesa-alimentacao" })).toEqual(["L7", "L5", "L1"]);
    expect(ids({ categoriaId: "despesa-mercado" })).toEqual(["L7"]);
  });

  it("filtra por conta, etiqueta e tag", () => {
    expect(ids({ contaId: "cartao-nu" })).toEqual(["L3"]);
    expect(ids({ contaId: "ativo-banco" })).toEqual(["L4"]);
    expect(ids({ etiqueta: "ASSINATURA" })).toEqual(["L6"]);
    expect(ids({ etiqueta: "NENHUMA" })).toEqual(["L3", "L7", "L4", "L5", "L1", "L2"]);
    expect(ids({ tag: "viagem" }, SEM_ESTORNADOS, new Map([["L1", ["viagem"]]]))).toEqual(["L1"]);
  });

  it("período com limites inclusivos", () => {
    expect(ids({ inicio: "2026-10-06", fim: "2026-10-09" })).toEqual(["L7", "L4", "L5", "L1"]);
    expect(ids({ inicio: "2026-10-12" })).toEqual(["L3"]);
    expect(ids({ fim: "2026-10-02" })).toEqual(["L6"]);
  });

  it("busca sem acento e sem diferenciar maiúsculas, em descrição, observação, categoria e tag", () => {
    expect(ids({ texto: "SALARIO" })).toEqual(["L2"]);
    expect(ids({ texto: "  premium " })).toEqual(["L6"]);
    expect(ids({ texto: "alimentacao" })).toEqual(["L5", "L1"]);
    expect(ids({ texto: "viagem" }, SEM_ESTORNADOS, new Map([["L2", ["Viagem de fim de ano"]]]))).toEqual(["L2"]);
    expect(ids({ texto: "nada disso" })).toEqual([]);
  });

  it("combina filtros (todos precisam bater)", () => {
    expect(ids({ tipo: "DESPESA", categoriaId: "despesa-alimentacao", inicio: "2026-10-07" })).toEqual(["L7", "L5"]);
  });

  it("categoria com ciclo de pais não trava", () => {
    const ciclo = new Map(porId);
    ciclo.set("despesa-mercado", { ...porId.get("despesa-mercado")!, categoria_pai_id: "despesa-feira" });
    ciclo.set("despesa-feira", conta({ id: "despesa-feira", nome: "Feira", tipo: "DESPESA", categoria_pai_id: "despesa-mercado" }));
    const r = aplicarFiltros([L7], ciclo, { ...FILTROS_PADRAO, categoriaId: "despesa-transporte" }, SEM_ESTORNADOS);
    expect(r).toEqual([]);
  });
});

describe("totalizar e filtrosAtivos", () => {
  it("entradas, saídas e saldo; fatura e transferência ficam de fora", () => {
    const todos = aplicarFiltros(LS, porId, FILTROS_PADRAO, SEM_ESTORNADOS);
    // Entradas: salário 300.000 + estorno 60.000. Saídas: 60.000 + 3.990 + 1.000.
    expect(totalizar(todos)).toEqual({ entradas: 360_000, saidas: 64_990, saldo: 295_010 });
  });

  it("esconder estornados não muda o saldo (o estorno anula o original)", () => {
    const sem = aplicarFiltros(LS, porId, { ...FILTROS_PADRAO, mostrarEstornados: false }, new Set(["L1"]));
    expect(totalizar(sem)).toEqual({ entradas: 300_000, saidas: 4_990, saldo: 295_010 });
  });

  it("lista vazia soma zero", () => {
    expect(totalizar([])).toEqual({ entradas: 0, saidas: 0, saldo: 0 });
  });

  it("conta os filtros ligados (texto em branco e ordem não contam)", () => {
    expect(filtrosAtivos(FILTROS_PADRAO)).toBe(0);
    expect(filtrosAtivos({ ...FILTROS_PADRAO, texto: "   ", ordem: "MAIOR" })).toBe(0);
    expect(filtrosAtivos({ ...FILTROS_PADRAO, texto: "x", tipo: "DESPESA", inicio: "2026-10-01", fim: "2026-10-31" })).toBe(3);
    expect(filtrosAtivos({ ...FILTROS_PADRAO, mostrarEstornados: false, tag: "viagem", etiqueta: "FIXO", categoriaId: "c", contaId: "a" })).toBe(5);
    // Só o fim também é um período filtrado.
    expect(filtrosAtivos({ ...FILTROS_PADRAO, fim: "2026-10-31" })).toBe(1);
  });
});
