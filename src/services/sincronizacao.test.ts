import { describe, expect, it } from "vitest";
import { decidir, type EstadoLocal, type EstadoNuvem } from "./sincronizacao";

const remoto = (versao: number): EstadoNuvem => ({ versao, alterado_em: "", dispositivo_id: "x", dispositivo_nome: "PC" });
const local = (versao_vista: number, impressao: string): EstadoLocal => ({ versao_vista, impressao, sincronizado_em: "" });

describe("decisão da sincronização", () => {
  it("primeira vez: nuvem vazia envia; computador novo e vazio baixa; os dois com dados é conflito", () => {
    expect(decidir({ local: null, remoto: null, impressaoAtual: "a", localVazio: false })).toBe("ENVIAR");
    expect(decidir({ local: null, remoto: remoto(3), impressaoAtual: "a", localVazio: true })).toBe("BAIXAR");
    expect(decidir({ local: null, remoto: remoto(3), impressaoAtual: "a", localVazio: false })).toBe("CONFLITO");
  });

  it("decide pelo lado que mudou", () => {
    expect(decidir({ local: local(2, "a"), remoto: remoto(2), impressaoAtual: "a", localVazio: false })).toBe("NADA");
    expect(decidir({ local: local(2, "a"), remoto: remoto(2), impressaoAtual: "b", localVazio: false })).toBe("ENVIAR");
    expect(decidir({ local: local(2, "a"), remoto: remoto(3), impressaoAtual: "a", localVazio: false })).toBe("BAIXAR");
    expect(decidir({ local: local(2, "a"), remoto: remoto(3), impressaoAtual: "b", localVazio: false })).toBe("CONFLITO");
  });
});
