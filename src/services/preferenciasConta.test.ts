import { describe, expect, it } from "vitest";
import { preferenciasParaOBanco, vaiNaSincronizacao } from "./preferenciasConta";

describe("preferências da conta na sincronização", () => {
  it("leva o que é da pessoa e deixa o que é do computador e os segredos", () => {
    for (const chave of ["nome_usuario", "perfil_renda", "chave_pix", "notas_inicio", "foco_mes", "meta_economia_mes", "widget_contagem", "modelos_lancamento"]) {
      expect(vaiNaSincronizacao(chave), chave).toBe(true);
    }
    for (const chave of ["dispositivo_id", "sync_estado", "pin_hash", "pasta_vigiada", "atualizacao_beta", "atualizacao_em_andamento", "gemini_chave", "brapi_token", "widgets_inicio", "aparencia"]) {
      expect(vaiNaSincronizacao(chave), chave).toBe(false);
    }
    expect(vaiNaSincronizacao("Chave Estranha")).toBe(false);
  });

  it("monta o conjunto em JSON, sem nulos", () => {
    expect(
      preferenciasParaOBanco({
        nome_usuario: "Daniel",
        perfil_renda: { liquido: 500_000, diaPagamento: 5 },
        notas_inicio: null,
        gemini_chave: "segredo",
        sync_estado: { versao_vista: 3 },
      }),
    ).toEqual({ nome_usuario: '"Daniel"', perfil_renda: '{"liquido":500000,"diaPagamento":5}' });
  });
});
