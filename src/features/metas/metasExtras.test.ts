import { describe, expect, it } from "vitest";
import { aporteNecessario, distribuirEntreMetas, evolucaoDaMeta, marcosDaMeta, textoProgresso } from "./metasExtras";
import type { Meta } from "../../types/extras";

const meta = (id: string, alvo: number, guardado: number, prioridade: Meta["prioridade"] = "MEDIA"): Meta => ({ id, nome: id, valor_alvo_centavos: alvo, guardado_centavos: guardado, prazo: null, tipo: null, prioridade, notas: null, conta_id: null });

describe("metas extras", () => {
  it("marcos e evolução", () => {
    const ap = [{ data: "2026-01-10", valor_centavos: 300 }, { data: "2026-02-10", valor_centavos: 300 }, { data: "2026-03-10", valor_centavos: -100 }, { data: "2026-04-10", valor_centavos: 600 }];
    expect(marcosDaMeta(ap, 1000)).toEqual([{ pct: 25, data: "2026-01-10" }, { pct: 50, data: "2026-02-10" }, { pct: 75, data: "2026-04-10" }, { pct: 100, data: "2026-04-10" }]);
    expect(evolucaoDaMeta(ap).map((x) => x.total)).toEqual([300, 600, 500, 1100]);
  });

  it("aporte necessário com e sem rendimento", () => {
    expect(aporteNecessario(120_000, 0, 12, 0)).toBe(10_000);
    const comJuros = aporteNecessario(120_000, 0, 12, 0.01);
    expect(comJuros).toBeLessThan(10_000);
    expect(comJuros).toBe(9_462);
    expect(aporteNecessario(1000, 2000, 5, 0.01)).toBe(0);
  });

  it("distribui proporcional ao que falta e à prioridade, sem passar do alvo", () => {
    const r = distribuirEntreMetas(10_000, [meta("a", 10_000, 0, "ALTA"), meta("b", 10_000, 0, "BAIXA"), meta("c", 1_000, 1_000)]);
    expect(r.get("a")).toBe(7_500);
    expect(r.get("b")).toBe(2_500);
    expect(r.has("c")).toBe(false);
    const cheia = distribuirEntreMetas(5_000, [meta("x", 1_000, 0), meta("y", 100_000, 0)]);
    expect((cheia.get("x") ?? 0) + (cheia.get("y") ?? 0)).toBe(5_000);
    expect(cheia.get("x")).toBeLessThanOrEqual(1_000);
    expect(textoProgresso(meta("Viagem", 1000, 450))).toContain("45%");
  });
});
