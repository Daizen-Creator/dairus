import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { decidir, resolverConflito, traduzirErroSync, type EstadoLocal, type EstadoNuvem } from "./sincronizacao";

// Nuvem falsa (Supabase Storage) e backend Rust simulado.
const nuvem = vi.hoisted(() => ({
  arquivos: new Map<string, Uint8Array>(),
  falhaDownload: new Map<string, string>(),
  falhaUpload: new Map<string, string>(),
  uploads: [] as string[],
}));
vi.mock("./supabase", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
    storage: {
      from: () => ({
        download: async (caminho: string) => {
          const falha = nuvem.falhaDownload.get(caminho);
          if (falha) return { data: null, error: { message: falha } };
          const bytes = nuvem.arquivos.get(caminho);
          if (!bytes) return { data: null, error: { message: "Object not found" } };
          return { data: new Blob([bytes.slice()]), error: null };
        },
        upload: async (caminho: string, blob: Blob) => {
          const falha = nuvem.falhaUpload.get(caminho);
          if (falha) return { data: null, error: { message: falha } };
          nuvem.uploads.push(caminho);
          nuvem.arquivos.set(caminho, new Uint8Array(await blob.arrayBuffer()));
          return { data: {}, error: null };
        },
      }),
    },
  },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const invocar = vi.mocked(invoke);

const ESTADO = "u1/sync/estado.json";
const ATUAL = "u1/sync/atual.db";
const texto = (t: string) => new TextEncoder().encode(t);
const gravarEstadoNuvem = (e: Partial<EstadoNuvem>) =>
  nuvem.arquivos.set(ESTADO, texto(JSON.stringify({ versao: 1, alterado_em: "2026-10-01T00:00:00Z", dispositivo_id: "outro", dispositivo_nome: "PC", ...e })));
const estadoNaNuvem = () => JSON.parse(new TextDecoder().decode(nuvem.arquivos.get(ESTADO))) as EstadoNuvem;

/** Comandos Rust chamados nesta rodada (nome → argumentos). */
let chamados: Array<[string, unknown]> = [];
let impressaoLocal = "local-1";
let falhaGravarBackup: string | null = null;

beforeEach(() => {
  nuvem.arquivos.clear();
  nuvem.falhaDownload.clear();
  nuvem.falhaUpload.clear();
  nuvem.uploads.length = 0;
  chamados = [];
  impressaoLocal = "local-1";
  falhaGravarBackup = null;
  invocar.mockReset();
  invocar.mockImplementation(async (comando: string, args?: unknown) => {
    chamados.push([comando, args]);
    switch (comando) {
      case "gravar_preferencias_conta":
        return 0;
      case "ler_preferencias_conta":
        return {};
      case "impressao_dados":
        return impressaoLocal;
      case "gerar_copia_sync":
        return Array.from(texto("banco-local"));
      case "gravar_backup_baixado":
        if (falhaGravarBackup) throw falhaGravarBackup;
        return { nome: (args as { nome: string }).nome, tamanho_bytes: 1, criado_em: "" };
      case "info_banco":
        return { lancamentos: 3 };
      default:
        return null;
    }
  });
});

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

describe("conflito: manter os dados deste computador", () => {
  it("guarda antes a cópia da nuvem e só então envia", async () => {
    gravarEstadoNuvem({ versao: 4 });
    nuvem.arquivos.set(ATUAL, texto("banco-da-nuvem"));
    const r = await resolverConflito("LOCAL");
    expect(r.decisao).toBe("ENVIAR");
    const backup = chamados.find(([c]) => c === "gravar_backup_baixado");
    expect((backup?.[1] as { nome: string }).nome).toMatch(/^nuvem-substituida-/);
    expect(new TextDecoder().decode(nuvem.arquivos.get(ATUAL))).toBe("banco-local");
    expect(estadoNaNuvem().versao).toBe(5);
  });

  it("se não consegue baixar a cópia da nuvem, cancela o envio e não mexe na nuvem", async () => {
    gravarEstadoNuvem({ versao: 4 });
    nuvem.arquivos.set(ATUAL, texto("banco-da-nuvem"));
    nuvem.falhaDownload.set(ATUAL, "Failed to fetch");
    await expect(resolverConflito("LOCAL")).rejects.toThrow(/Nada foi enviado/);
    expect(nuvem.uploads).toEqual([]);
    expect(new TextDecoder().decode(nuvem.arquivos.get(ATUAL))).toBe("banco-da-nuvem");
  });

  it("se não consegue gravar a cópia neste computador, cancela o envio", async () => {
    gravarEstadoNuvem({ versao: 4 });
    nuvem.arquivos.set(ATUAL, texto("banco-da-nuvem"));
    falhaGravarBackup = "Disco cheio";
    await expect(resolverConflito("LOCAL")).rejects.toThrow(/Nada foi enviado.*Disco cheio/);
    expect(nuvem.uploads).toEqual([]);
  });

  it("se a nuvem não tem o banco (só o estado), não há o que perder e envia", async () => {
    gravarEstadoNuvem({ versao: 4 });
    const r = await resolverConflito("LOCAL");
    expect(r.decisao).toBe("ENVIAR");
    expect(nuvem.uploads).toContain(ATUAL);
  });
});

describe("erros da sincronização", () => {
  it("traduz o que a nuvem responde", () => {
    // O erro que travava a sincronização: o bucket só aceita binário.
    expect(traduzirErroSync(new Error("mime type application/json is not supported"))).toMatch(/tipo de arquivo/);
    expect(traduzirErroSync(new Error("The object exceeded the maximum allowed size"))).toMatch(/50 MB/);
    expect(traduzirErroSync(new TypeError("Failed to fetch"))).toMatch(/Sem conexão/);
    expect(traduzirErroSync("JWT expired")).toMatch(/sessão/);
    expect(traduzirErroSync(new Error("outro problema"))).toBe("outro problema");
  });
});
