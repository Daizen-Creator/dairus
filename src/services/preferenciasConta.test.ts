import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { definirContaDasPreferencias, lerPreferencia } from "./armazenamento";
import { MARCA_PREFERENCIAS_SINCRONIZADAS, PREFERENCIAS_DA_CONTA, SENTINELA, preferenciasParaOBanco, restaurarPreferenciasDoBanco, vaiNaSincronizacao } from "./preferenciasConta";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const invocar = vi.mocked(invoke);

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
      "dispositivo_id", "sync_estado", "sync_ultimo_erro", "sync_auto", "sync_prefs_ok", "pin_hash", "pin_salt", "pasta_vigiada", "atualizacao_beta", "atualizacao_em_andamento",
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
    ).toEqual({ nome_usuario: '"Daniel"', perfil_renda: '{"liquido":500000,"diaPagamento":5}', [SENTINELA]: '"1"' });
  });

  it("valor grande demais fica de fora e sem a marca (o outro computador não apaga o dele)", () => {
    const saida = preferenciasParaOBanco({ nome_usuario: "Daniel", notas_inicio: "x".repeat(300 * 1024) });
    expect(saida).toEqual({ nome_usuario: '"Daniel"' });
  });
});

describe("restaurar as preferências que vieram no banco", () => {
  const local = (chave: string, valor: unknown) => localStorage.setItem(`u1:${chave}`, JSON.stringify(valor));
  const noBanco = (itens: Record<string, string>) =>
    invocar.mockImplementation(async (comando: string) => (comando === "ler_preferencias_conta" ? itens : null));

  beforeEach(() => {
    invocar.mockReset();
    localStorage.clear();
    definirContaDasPreferencias("u1");
    local("nome_usuario", "Daniel");
    local("foco_mes", "Guardar para a viagem");
    local("chave_pix", "daniel@pix");
    local("dispositivo_id", "pc-1");
    local("gemini_historico", [{ pergunta: "quanto gastei?" }]);
  });

  it("com a marca e já sincronizado antes, apaga daqui o que foi apagado no outro computador (só da lista permitida)", async () => {
    local(MARCA_PREFERENCIAS_SINCRONIZADAS, true);
    noBanco({ nome_usuario: '"Dani"', chave_pix: '"dani@pix"', [SENTINELA]: '"1"' });
    await restaurarPreferenciasDoBanco();
    expect(await lerPreferencia("nome_usuario")).toBe("Dani");
    expect(await lerPreferencia("chave_pix")).toBe("dani@pix");
    expect(await lerPreferencia("foco_mes")).toBeNull();
    // O que não é da lista fica como está, e a marca não vira preferência.
    expect(await lerPreferencia("dispositivo_id")).toBe("pc-1");
    expect(await lerPreferencia("gemini_historico")).toEqual([{ pergunta: "quanto gastei?" }]);
    expect(await lerPreferencia(SENTINELA)).toBeNull();
  });

  it("primeira sincronização deste computador (sem sync_prefs_ok): só mescla, mesmo com a marca do banco", async () => {
    noBanco({ nome_usuario: '"Dani"', [SENTINELA]: '"1"' });
    await restaurarPreferenciasDoBanco();
    expect(await lerPreferencia("nome_usuario")).toBe("Dani");
    // Só este computador tinha: não sobe ainda para a nuvem, então não pode sumir.
    expect(await lerPreferencia("foco_mes")).toBe("Guardar para a viagem");
    expect(await lerPreferencia("chave_pix")).toBe("daniel@pix");
  });

  it("sem a marca (backup antigo), não apaga nada: só traz o que veio", async () => {
    local(MARCA_PREFERENCIAS_SINCRONIZADAS, true);
    noBanco({ nome_usuario: '"Dani"' });
    await restaurarPreferenciasDoBanco();
    expect(await lerPreferencia("nome_usuario")).toBe("Dani");
    expect(await lerPreferencia("foco_mes")).toBe("Guardar para a viagem");
    expect(await lerPreferencia("chave_pix")).toBe("daniel@pix");
  });

  it("não apaga preferência grande demais para o banco (ela nunca foi para a nuvem)", async () => {
    local(MARCA_PREFERENCIAS_SINCRONIZADAS, true);
    const grande = "x".repeat(300 * 1024);
    local("notas_inicio", grande);
    // O outro computador mandou o conjunto completo dele (com a marca), sem a nota grande daqui.
    noBanco({ nome_usuario: '"Dani"', chave_pix: '"dani@pix"', [SENTINELA]: '"1"' });
    await restaurarPreferenciasDoBanco();
    expect(await lerPreferencia("notas_inicio")).toBe(grande);
    // As pequenas que faltam continuam sendo apagadas.
    expect(await lerPreferencia("foco_mes")).toBeNull();
  });

  it("se não consegue ler o banco, não apaga nada", async () => {
    invocar.mockRejectedValue(new Error("falhou"));
    await restaurarPreferenciasDoBanco();
    expect(await lerPreferencia("foco_mes")).toBe("Guardar para a viagem");
  });
});
