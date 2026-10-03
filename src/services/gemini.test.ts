import { afterEach, describe, expect, it, vi } from "vitest";
import { chamarGemini, limparChave, MODELO_PADRAO, MODELOS_RESERVA, modeloAtualizado, tipoDaChave } from "./gemini";

describe("chave do Gemini", () => {
  it("tira espaços, quebras de linha e aspas sem apagar letras", () => {
    expect(limparChave(' "AIzaSyAbcs123 \n"')).toBe("AIzaSyAbcs123");
    expect(limparChave("AQ.sss-xyz")).toBe("AQ.sss-xyz");
  });
  it("reconhece o tipo da chave", () => {
    expect(tipoDaChave("AIzaSy")).toBe("AI_STUDIO");
    expect(tipoDaChave("AQ.abc")).toBe("GOOGLE_AQ");
    expect(tipoDaChave("xyz")).toBe("DESCONHECIDA");
  });
});

describe("modelo e controle de ritmo", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("troca modelos antigos pelo padrão atual", () => {
    expect(modeloAtualizado("gemini-2.5-flash")).toBe(MODELO_PADRAO);
    expect(modeloAtualizado(null)).toBe(MODELO_PADRAO);
    expect(modeloAtualizado("gemini-flash-lite-latest")).toBe("gemini-flash-lite-latest");
  });

  function resposta(status: number, corpo: unknown) {
    return { ok: status < 400, status, json: async () => corpo } as Response;
  }
  const ok = (texto: string) => resposta(200, { candidates: [{ content: { parts: [{ text: texto }] } }] });

  it("usa o próximo modelo quando o escolhido não existe (404)", async () => {
    vi.useFakeTimers();
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return urls.length === 1 ? resposta(404, { error: { message: "not found" } }) : ok("oi");
    }));
    const p = chamarGemini({ chave: "AQ.teste", modelo: "gemini-inexistente", instrucao: "", contexto: "", temperatura: 0, historico: [{ papel: "usuario", texto: "x" }] });
    await vi.runAllTimersAsync();
    const r = await p;
    expect(r.texto).toBe("oi");
    expect(r.modeloUsado).toBe(MODELOS_RESERVA[0]);
    // Chave AQ. vai primeiro ao Google AI Studio.
    expect(urls[0]).toContain("generativelanguage.googleapis.com");
  });

  it("tenta de novo quando o Gemini está lotado (503), espera entre as requisições e depois troca de modelo", async () => {
    vi.useFakeTimers();
    const horarios: number[] = [];
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      horarios.push(Date.now());
      urls.push(url);
      return horarios.length < 3 ? resposta(503, { error: { message: "high demand" } }) : ok("pronto");
    }));
    const p = chamarGemini({ chave: "AIzaTeste", modelo: "gemini-flash-latest", instrucao: "", contexto: "", temperatura: 0, historico: [{ papel: "usuario", texto: "x" }] });
    await vi.runAllTimersAsync();
    const r = await p;
    expect(r.texto).toBe("pronto");
    expect(urls[0]).toContain("gemini-flash-latest:");
    expect(urls[1]).toContain("gemini-flash-latest:");
    expect(r.modeloUsado).toBe(MODELOS_RESERVA[0]);
    expect(horarios).toHaveLength(3);
    // 10 requisições por minuto: pelo menos 6 s entre uma e outra.
    for (let i = 1; i < horarios.length; i++) expect(horarios[i] - horarios[i - 1]).toBeGreaterThanOrEqual(6000);
  });

  it("não insiste quando a chave é inválida", async () => {
    vi.useFakeTimers();
    const f = vi.fn(async () => resposta(400, { error: { message: "API key not valid. Please pass a valid API key." } }));
    vi.stubGlobal("fetch", f);
    const p = chamarGemini({ chave: "AIzaRuim", modelo: MODELO_PADRAO, instrucao: "", contexto: "", temperatura: 0, historico: [{ papel: "usuario", texto: "x" }] });
    const verificacao = expect(p).rejects.toThrow(/inválida/);
    await vi.runAllTimersAsync();
    await verificacao;
    expect(f).toHaveBeenCalledTimes(1);
  });
});
