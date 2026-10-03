import { describe, expect, it } from "vitest";
import { buscarAjuda, manualEmTexto, primeirosPassos } from "./ajuda";

describe("ajuda", () => {
  it("busca sem acento e por relevância", () => {
    expect(buscarAjuda("cartao parcelado")[0].id).toBe("cartoes");
    expect(buscarAjuda("imposto de renda").map((t) => t.id)).toContain("relatorios");
    expect(buscarAjuda("").length).toBeGreaterThan(10);
    expect(manualEmTexto()).toContain("/lancamentos");
  });

  it("monta os primeiros passos a partir dos dados", () => {
    const p = primeirosPassos({
      contas: [
        { id: "ativo-dinheiro", tipo: "ATIVO", subtipo: "DINHEIRO", sistema: true, ativa: true },
        { id: "c1", tipo: "ATIVO", subtipo: "CONTA_CORRENTE", sistema: false, ativa: true },
      ],
      lancamentos: 3,
      agendamentos: 0,
      orcamentos: 0,
      metas: 1,
      backupAuto: true,
      chaveIA: false,
    });
    expect(p.filter((x) => x.feito).map((x) => x.id)).toEqual(["conta", "lancamento", "meta", "backup"]);
  });
});
