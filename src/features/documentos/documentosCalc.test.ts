import { describe, expect, it } from "vitest";
import type { Documento } from "../../services/documentos";
import { avisosDeDocumentos, filtrar, progressoGarantia, proximos, resumo, situacao, textoPrazo } from "./documentosCalc";

const base: Documento = {
  id: "d1", tipo: "GARANTIA", categoria: "Eletrônicos", titulo: "TV Samsung", numero: "NF 1", loja: "Magalu", valor_centavos: 320_000,
  data_compra: "2026-03-10", garantia_meses: 12, garantia_estendida_meses: 0, vencimento: "2027-03-10", repete: null, avisar_dias: 30,
  lancamento_id: null, observacao: null, arquivado: false, criado_em: "", atualizado_em: "", arquivos: 0,
};
const doc = (p: Partial<Documento>): Documento => ({ ...base, ...p });

describe("garantias e documentos", () => {
  it("classifica a situação pelo vencimento e pela antecedência", () => {
    expect(situacao(base, "2026-10-03")).toBe("EM_DIA");
    expect(situacao(base, "2027-02-20")).toBe("VENCE_LOGO");
    expect(situacao(base, "2027-03-11")).toBe("VENCIDO");
    expect(situacao(doc({ vencimento: null }), "2026-10-03")).toBe("SEM_PRAZO");
    expect(situacao(doc({ arquivado: true }), "2026-10-03")).toBe("ARQUIVADO");
  });

  it("escreve o prazo do jeito que a pessoa fala", () => {
    expect(textoPrazo(base, "2026-10-03")).toBe("Em garantia · faltam 5 meses");
    expect(textoPrazo(base, "2027-03-09")).toBe("Em garantia · faltam 1 dia");
    expect(textoPrazo(doc({ tipo: "DOCUMENTO" }), "2027-03-10")).toBe("Vence hoje");
    expect(textoPrazo(doc({ tipo: "DOCUMENTO" }), "2027-03-13")).toBe("Venceu há 3 dias");
  });

  it("mede quanto da garantia já passou", () => {
    expect(progressoGarantia(base, "2026-03-10")).toBe(0);
    expect(Math.round(progressoGarantia(base, "2026-09-08")!)).toBe(50);
    expect(progressoGarantia(base, "2028-01-01")).toBe(100);
    expect(progressoGarantia(doc({ tipo: "DOCUMENTO" }), "2026-09-08")).toBeNull();
  });

  it("resume garantias ativas, valor protegido e o que vence logo", () => {
    const docs = [base, doc({ id: "d2", vencimento: "2026-10-10", valor_centavos: 100_000, arquivos: 2 }), doc({ id: "d3", tipo: "DOCUMENTO", vencimento: "2026-09-10" })];
    const r = resumo(docs, "2026-10-03");
    expect(r).toEqual({ garantiasAtivas: 2, valorProtegido: 420_000, venceLogo: 1, vencidos: 1, semArquivo: 2 });
    expect(proximos(docs, "2026-10-03").map((d) => d.id)).toEqual(["d3", "d2", "d1"]);
  });

  it("avisa 30, 7, 1 dia antes e no dia, e documento vencido toda semana", () => {
    const ipva = doc({ id: "ipva", tipo: "DOCUMENTO", titulo: "IPVA", vencimento: "2027-01-20", repete: "ANUAL", avisar_dias: 15 });
    expect(avisosDeDocumentos([ipva], "2027-01-05").map((a) => a.titulo)).toEqual(["IPVA vence em 15 dias"]);
    expect(avisosDeDocumentos([ipva], "2027-01-13")[0].titulo).toBe("IPVA vence em 7 dias");
    expect(avisosDeDocumentos([ipva], "2027-01-20")[0].titulo).toBe("IPVA vence hoje");
    expect(avisosDeDocumentos([ipva], "2027-01-10")).toEqual([]);
    expect(avisosDeDocumentos([ipva], "2027-01-21")[0].titulo).toBe("IPVA está vencido");
    expect(avisosDeDocumentos([base], "2027-02-08")[0].titulo).toBe("A garantia de TV Samsung acaba em 30 dias");
    expect(avisosDeDocumentos([doc({ avisar_dias: 0 })], "2027-03-10")).toEqual([]);
  });

  it("busca sem acento em vários campos", () => {
    const docs = [base, doc({ id: "x", titulo: "Seguro do carro", categoria: "Seguro", numero: "Apólice 99" })];
    expect(filtrar(docs, "apolice", "").map((d) => d.id)).toEqual(["x"]);
    expect(filtrar(docs, "magalu", "").length).toBe(2);
    expect(filtrar(docs, "", "Seguro").map((d) => d.id)).toEqual(["x"]);
  });
});

import { somarMesesISO } from "./documentosCalc";
describe("somarMesesISO", () => {
  it("segue a regra do motor no fim do mês", () => {
    expect(somarMesesISO("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMesesISO("2028-01-31", 1)).toBe("2028-02-29");
    expect(somarMesesISO("2026-11-15", 3)).toBe("2027-02-15");
    expect(somarMesesISO("2026-10-03", 24)).toBe("2028-10-03");
  });
});
