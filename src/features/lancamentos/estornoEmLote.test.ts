import { describe, expect, it } from "vitest";
import { estornarEmLote, motivoLegivel, resumoDoLote } from "./estornoEmLote";

describe("estorno em lote", () => {
  it("segue depois de um lançamento recusado e junta tudo no fim", async () => {
    const chamados: string[] = [];
    const r = await estornarEmLote(
      ["a", "compra-com-reembolso", "c", "divisao-recebida", "e"],
      async (id) => {
        chamados.push(id);
        if (id === "compra-com-reembolso") throw new Error("Esta compra já tem reembolso.");
        if (id === "divisao-recebida") throw "Command error: A divisão já foi recebida.";
      },
      (id) => `Lançamento ${id}`,
    );
    expect(chamados).toEqual(["a", "compra-com-reembolso", "c", "divisao-recebida", "e"]);
    expect(r.feitos).toBe(3);
    expect(r.falhas).toEqual([
      { descricao: "Lançamento compra-com-reembolso", motivo: "Esta compra já tem reembolso." },
      { descricao: "Lançamento divisao-recebida", motivo: "A divisão já foi recebida." },
    ]);
  });

  it("resumo: tudo certo, parcial e nada estornado", () => {
    expect(resumoDoLote({ feitos: 3, falhas: [] })).toEqual({ tipo: "sucesso", texto: "3 lançamento(s) estornado(s)." });
    const parcial = resumoDoLote({ feitos: 2, falhas: [{ descricao: "TV", motivo: "Já tem reembolso." }] });
    expect(parcial.tipo).toBe("aviso");
    expect(parcial.texto).toContain("2 estornado(s); 1 não pôde(ram) ser estornado(s):");
    expect(parcial.texto).toContain("• TV: Já tem reembolso.");
    expect(resumoDoLote({ feitos: 0, falhas: [{ descricao: "TV", motivo: "x" }] }).tipo).toBe("erro");
  });

  it("limita a lista de recusados e limpa o prefixo técnico do erro", () => {
    const falhas = Array.from({ length: 8 }, (_, i) => ({ descricao: `L${i}`, motivo: "m" }));
    expect(resumoDoLote({ feitos: 0, falhas }).texto).toContain("… e mais 3.");
    expect(motivoLegivel(new Error("Error: algo"))).toBe("algo");
    expect(motivoLegivel("")).toBe("Não foi possível estornar.");
  });
});
