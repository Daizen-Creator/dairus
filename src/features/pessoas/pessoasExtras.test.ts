import { describe, expect, it } from "vitest";
import { historicoPorPessoa, linkWhatsApp } from "./pessoasExtras";
import type { AReceber } from "../../services/planejamento";

const item = (pessoa: string, valor: number, data: string, recebido: string | null = null, perdoado = false) => ({ id: Math.random().toString(), pessoa, descricao: "x", valor_centavos: valor, data, lancamento_id: null, recebido_em: recebido, recebimento_lancamento_id: null, perdoado }) as unknown as AReceber;

describe("pessoas extras", () => {
  it("resume por pessoa", () => {
    const h = historicoPorPessoa([item("Ana", 100, "2026-09-01", "2026-09-11"), item("Ana", 50, "2026-09-05"), item("Bia", 30, "2026-09-01", null, true)]);
    expect(h[0]).toEqual({ pessoa: "Ana", emAberto: 50, recebido: 100, perdoado: 0, diasMedios: 10 });
    expect(h[1]).toMatchObject({ pessoa: "Bia", perdoado: 30, diasMedios: null });
  });

  it("monta o link do WhatsApp", () => {
    expect(linkWhatsApp("(11) 98765-4321", "Oi!")).toBe("https://wa.me/5511987654321?text=Oi!");
    expect(linkWhatsApp("123", "x")).toBeNull();
  });
});
