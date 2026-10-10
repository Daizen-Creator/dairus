import { describe, expect, it } from "vitest";
import { PREFERENCIAS_DA_CONTA, preferenciasParaOBanco, vaiNaSincronizacao } from "./preferenciasConta";

/** Todo o código-fonte do app (sem os testes e sem a própria lista), para conferir os nomes das preferências. */
const FONTES = import.meta.glob(["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const codigoDoApp = () =>
  Object.entries(FONTES)
    .filter(([caminho]) => !caminho.endsWith("/preferenciasConta.ts"))
    .map(([, texto]) => texto)
    .join("\n");

describe("preferências da conta na sincronização (lista permitida)", () => {
  it("leva só as escolhas e os dados da pessoa", () => {
    for (const chave of ["nome_usuario", "perfil_renda", "chave_pix", "notas_inicio", "foco_mes", "meta_economia_mes", "widget_contagem", "modelos_lancamento", "gemini_modelo", "ia_perguntas_salvas"]) {
      expect(vaiNaSincronizacao(chave), chave).toBe(true);
    }
  });

  it("deixa de fora estado automático, o que é do computador, segredos e a conversa com a IA", () => {
    const fora = [
      // mudam sozinhas: dariam CONFLITO falso entre computadores
      "meta_lembrete_ultimo", "meta_sobra_ultimo", "orcamento_auto_ultimo", "radar_auto_ultimo", "resumo_semanal_ultimo", "pdf_mensal_ultimo",
      "diagnostico_ia_ultimo", "verificacao_semanal_ultima", "tema_do_dia", "ocultar_saldos", "avisos_enviados", "gemini_uso",
      // do computador / sincronização / atualização
      "dispositivo_id", "sync_estado", "sync_ultimo_erro", "sync_auto", "pin_hash", "pin_salt", "pasta_vigiada", "atualizacao_beta", "atualizacao_em_andamento",
      "widgets_inicio", "aparencia",
      // segredos e conversa com dados financeiros
      "gemini_chave", "brapi_token", "gemini_historico", "ia_conversas",
      // nunca: chaves internas e nomes estranhos
      "_preferencias_v1", "Chave Estranha",
    ];
    for (const chave of fora) expect(vaiNaSincronizacao(chave), chave).toBe(false);
  });

  it("todo nome da lista existe no código (sem nome digitado errado)", () => {
    const codigo = codigoDoApp();
    const inexistentes = [...PREFERENCIAS_DA_CONTA].filter((chave) => !codigo.includes(`"${chave}"`));
    expect(inexistentes).toEqual([]);
  });

  it("monta o conjunto em JSON, sem nulos", () => {
    expect(
      preferenciasParaOBanco({
        nome_usuario: "Daniel",
        perfil_renda: { liquido: 500_000, diaPagamento: 5 },
        notas_inicio: null,
        gemini_chave: "segredo",
        gemini_historico: [{ pergunta: "quanto gastei?" }],
        meta_lembrete_ultimo: "2026-10-01",
        sync_estado: { versao_vista: 3 },
      }),
    ).toEqual({ nome_usuario: '"Daniel"', perfil_renda: '{"liquido":500000,"diaPagamento":5}' });
  });
});
