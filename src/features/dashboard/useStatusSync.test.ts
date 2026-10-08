import { describe, expect, it } from "vitest";
import { descreverSync, haQuanto } from "./useStatusSync";

const AGORA = Date.parse("2026-10-08T03:00:00Z");

describe("status da sincronização no Início", () => {
  it("mostra o estado real, não um texto fixo", () => {
    expect(descreverSync({ ligada: false, ultima: null, erro: null }, AGORA)).toEqual({ texto: "Desativada", estado: "desligada" });
    expect(descreverSync({ ligada: true, ultima: null, erro: null }, AGORA).estado).toBe("nunca");
    expect(descreverSync({ ligada: true, ultima: "2026-10-08T02:55:00Z", erro: null }, AGORA)).toEqual({ texto: "Ativa · há 5 min", estado: "ok" });
    // Erro mais novo que a última sincronização boa: aparece o erro.
    expect(descreverSync({ ligada: true, ultima: "2026-10-08T01:00:00Z", erro: { mensagem: "Sem conexão", em: "2026-10-08T02:58:00Z" } }, AGORA)).toEqual({ texto: "Falhou há 2 min: Sem conexão", estado: "erro" });
    // Erro antigo, já superado: fica "Ativa".
    expect(descreverSync({ ligada: true, ultima: "2026-10-08T02:59:00Z", erro: { mensagem: "x", em: "2026-10-08T01:00:00Z" } }, AGORA).estado).toBe("ok");
  });

  it("tempo decorrido", () => {
    expect(haQuanto("2026-10-08T02:59:50Z", AGORA)).toBe("agora");
    expect(haQuanto("2026-10-08T00:00:00Z", AGORA)).toBe("há 3 h");
  });
});
