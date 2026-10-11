import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { definirContaDasPreferencias, lerPreferencia } from "./armazenamento";
import { decidir, resolverConflito, sincronizar, traduzirErroSync, type EstadoLocal, type EstadoNuvem } from "./sincronizacao";

// Nuvem falsa (Supabase Storage) e backend Rust simulado.
const nuvem = vi.hoisted(() => ({
  arquivos: new Map<string, Uint8Array>(),
  falhaDownload: new Map<string, string>(),
  falhaUpload: new Map<string, string>(),
  uploads: [] as string[],
  /** Opções de cada download e upload (cache). */
  opcoesDownload: [] as Array<{ caminho: string; opcoes?: { cacheNonce?: string }; params?: { cache?: string } }>,
  opcoesUpload: [] as Array<{ caminho: string; opcoes?: { cacheControl?: string } }>,
  /** Chamado depois de cada upload (simula outro computador gravando ao mesmo tempo). */
  aposEnviar: null as null | ((caminho: string) => void),
}));
vi.mock("./supabase", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
    storage: {
      from: () => ({
        download: async (caminho: string, opcoes?: { cacheNonce?: string }, params?: { cache?: string }) => {
          nuvem.opcoesDownload.push({ caminho, opcoes, params });
          const falha = nuvem.falhaDownload.get(caminho);
          if (falha) return { data: null, error: { message: falha } };
          const bytes = nuvem.arquivos.get(caminho);
          if (!bytes) return { data: null, error: { message: "Object not found" } };
          return { data: new Blob([bytes.slice()]), error: null };
        },
        upload: async (caminho: string, blob: Blob, opcoes?: { cacheControl?: string }) => {
          nuvem.opcoesUpload.push({ caminho, opcoes });
          const falha = nuvem.falhaUpload.get(caminho);
          if (falha) return { data: null, error: { message: falha } };
          nuvem.uploads.push(caminho);
          nuvem.arquivos.set(caminho, new Uint8Array(await blob.arrayBuffer()));
          nuvem.aposEnviar?.(caminho);
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
/** Impressão que vem junto com a cópia (null = a mesma do banco). */
let impressaoDaCopia: string | null = null;
let falhaGravarBackup: string | null = null;
/** Simula uma edição feita pela pessoa enquanto o download acontece. */
let editarDuranteODownload = false;
/** Simula outro computador gravando na nuvem enquanto este prepara a cópia. */
let outroPcGravaAoTirarCopia = false;
let falhaPreferencias = false;
/** Resposta de "mudanca_so_da_atualizacao" (os dados daqui só mudaram pela atualização do app). */
let soAtualizacao: boolean | "erro" = false;
/** Preferências na tabela do banco local, e as que vêm no banco da nuvem ao restaurar. */
let preferenciasNoBanco: Record<string, string> = {};
let preferenciasDaNuvem: Record<string, string> = {};

beforeEach(() => {
  nuvem.arquivos.clear();
  nuvem.falhaDownload.clear();
  nuvem.falhaUpload.clear();
  nuvem.uploads.length = 0;
  nuvem.opcoesDownload.length = 0;
  nuvem.opcoesUpload.length = 0;
  nuvem.aposEnviar = null;
  outroPcGravaAoTirarCopia = false;
  falhaPreferencias = false;
  soAtualizacao = false;
  preferenciasNoBanco = {};
  preferenciasDaNuvem = {};
  chamados = [];
  impressaoLocal = "local-1";
  impressaoDaCopia = null;
  falhaGravarBackup = null;
  editarDuranteODownload = false;
  invocar.mockReset();
  invocar.mockImplementation(async (comando: string, args?: unknown) => {
    chamados.push([comando, args]);
    switch (comando) {
      case "gravar_preferencias_conta": {
        if (falhaPreferencias) throw "disco cheio";
        const { itens } = args as { itens: Record<string, string> };
        // Como no app: as preferências entram no banco e mudam a impressão.
        if (JSON.stringify(itens) !== JSON.stringify(preferenciasNoBanco)) {
          preferenciasNoBanco = { ...itens };
          if (Object.keys(itens).some((c) => !c.startsWith("_"))) impressaoLocal = `${impressaoLocal}+prefs`;
        }
        return 0;
      }
      case "ler_preferencias_conta":
        return preferenciasNoBanco;
      case "mudanca_so_da_atualizacao":
        if (soAtualizacao === "erro") throw "comando indisponível";
        return soAtualizacao;
      case "impressao_dados":
        return impressaoLocal;
      case "copia_e_impressao_sync":
        if (outroPcGravaAoTirarCopia) gravarEstadoNuvem({ versao: 9, dispositivo_id: "pc-2", alterado_em: "2026-10-10T10:00:00Z" });
        return { copia: Array.from(texto("banco-local")), impressao: impressaoDaCopia ?? impressaoLocal, esquema: 17 };
      case "gravar_backup_baixado":
        if (falhaGravarBackup) throw falhaGravarBackup;
        if (editarDuranteODownload) impressaoLocal = "local-editado";
        return { nome: (args as { nome: string }).nome, tamanho_bytes: 1, criado_em: "" };
      case "restaurar_backup": {
        const { impressaoEsperada } = args as { impressaoEsperada: string | null };
        if (impressaoEsperada && impressaoEsperada !== impressaoLocal) throw "DADOS_MUDARAM: os dados deste computador mudaram";
        impressaoLocal = "da-nuvem";
        preferenciasNoBanco = { ...preferenciasDaNuvem };
        return { nome: "antes-de-restaurar-x.db", tamanho_bytes: 1, criado_em: "" };
      }
      case "info_banco":
        return { lancamentos: 3 };
      case "versao_esquema_app":
        return 17;
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

const guardarEstadoLocal = (e: EstadoLocal) => localStorage.setItem("sync_estado", JSON.stringify(e));
const estadoLocal = () => JSON.parse(localStorage.getItem("sync_estado") ?? "null") as EstadoLocal | null;

describe("sincronização atômica", () => {
  it("ao enviar, a impressão guardada é a da cópia enviada (tiradas juntas)", async () => {
    gravarEstadoNuvem({ versao: 1 });
    guardarEstadoLocal({ versao_vista: 1, impressao: "antiga", sincronizado_em: "" });
    impressaoDaCopia = "da-copia";
    const r = await sincronizar();
    expect(r.decisao).toBe("ENVIAR");
    expect(chamados.some(([c]) => c === "gerar_copia_sync")).toBe(false);
    expect(estadoLocal()?.impressao).toBe("da-copia");
    expect(estadoLocal()?.versao_vista).toBe(2);
  });

  it("ao baixar, se os dados daqui mudaram depois da decisão, vira conflito e nada é trocado", async () => {
    gravarEstadoNuvem({ versao: 2 });
    nuvem.arquivos.set(ATUAL, texto("banco-da-nuvem"));
    guardarEstadoLocal({ versao_vista: 1, impressao: "local-1", sincronizado_em: "" });
    editarDuranteODownload = true;
    const r = await sincronizar();
    expect(r).toMatchObject({ decisao: "CONFLITO", aplicouRemoto: false });
    const restaurar = chamados.find(([c]) => c === "restaurar_backup");
    expect((restaurar?.[1] as { impressaoEsperada: string }).impressaoEsperada).toBe("local-1");
    expect(impressaoLocal).toBe("local-editado");
    expect(chamados.some(([c]) => c === "excluir_backup")).toBe(true);
    expect(estadoLocal()?.versao_vista).toBe(1);
  });

  it("ao baixar sem mudança local, aplica a versão da nuvem", async () => {
    gravarEstadoNuvem({ versao: 2 });
    nuvem.arquivos.set(ATUAL, texto("banco-da-nuvem"));
    guardarEstadoLocal({ versao_vista: 1, impressao: "local-1", sincronizado_em: "" });
    const r = await sincronizar();
    expect(r).toMatchObject({ decisao: "BAIXAR", aplicouRemoto: true });
    expect(estadoLocal()).toMatchObject({ versao_vista: 2, impressao: "da-nuvem" });
  });
});

describe("envio com controle de concorrência", () => {
  it("se outro computador gravou na nuvem depois da leitura, não envia nada e vira conflito", async () => {
    gravarEstadoNuvem({ versao: 1 });
    guardarEstadoLocal({ versao_vista: 1, impressao: "antiga", sincronizado_em: "" });
    outroPcGravaAoTirarCopia = true;
    const r = await sincronizar();
    expect(r.decisao).toBe("CONFLITO");
    expect(r.remoto?.dispositivo_id).toBe("pc-2");
    expect(nuvem.uploads).toEqual([]);
    expect(estadoLocal()?.versao_vista).toBe(1);
  });

  it("confere depois de enviar: se outro computador gravou junto, não marca como sincronizado", async () => {
    gravarEstadoNuvem({ versao: 1 });
    guardarEstadoLocal({ versao_vista: 1, impressao: "antiga", sincronizado_em: "" });
    nuvem.aposEnviar = (caminho) => {
      if (caminho === ESTADO) gravarEstadoNuvem({ versao: 2, dispositivo_id: "pc-2", alterado_em: "2026-10-10T10:00:00Z" });
    };
    const r = await sincronizar();
    expect(r.decisao).toBe("CONFLITO");
    expect(estadoLocal()).toMatchObject({ versao_vista: 1, impressao: "antiga" });
  });

  it("envio normal grava banco e estado com a versão seguinte à lida", async () => {
    gravarEstadoNuvem({ versao: 7 });
    guardarEstadoLocal({ versao_vista: 7, impressao: "antiga", sincronizado_em: "" });
    const r = await sincronizar();
    expect(r.decisao).toBe("ENVIAR");
    expect(nuvem.uploads).toEqual([ATUAL, ESTADO]);
    expect(estadoNaNuvem().versao).toBe(8);
    expect(estadoLocal()?.versao_vista).toBe(8);
  });

  it("\"manter este computador\" com a nuvem mudando no meio avisa e não envia", async () => {
    gravarEstadoNuvem({ versao: 4 });
    nuvem.arquivos.set(ATUAL, texto("banco-da-nuvem"));
    outroPcGravaAoTirarCopia = true;
    await expect(resolverConflito("LOCAL")).rejects.toThrow(/Outro computador/);
    expect(nuvem.uploads).toEqual([]);
  });
});

describe("versão do esquema na nuvem", () => {
  it("o envio grava no estado.json a versão do esquema do banco", async () => {
    await sincronizar();
    expect(estadoNaNuvem().esquema).toBe(17);
  });

  it("nuvem com banco de versão mais nova: não baixa e pede para atualizar o app", async () => {
    gravarEstadoNuvem({ versao: 2, esquema: 18 });
    nuvem.arquivos.set(ATUAL, texto("banco-novo"));
    guardarEstadoLocal({ versao_vista: 1, impressao: "local-1", sincronizado_em: "" });
    await expect(sincronizar()).rejects.toThrow(/Atualize o Dairus neste computador para sincronizar/);
    expect(chamados.some(([c]) => c === "restaurar_backup" || c === "gravar_backup_baixado")).toBe(false);
    expect(JSON.parse(localStorage.getItem("sync_ultimo_erro") ?? "{}").mensagem).toMatch(/Atualize o Dairus/);
  });

  it("nuvem com banco de versão mais nova: também não envia por cima", async () => {
    gravarEstadoNuvem({ versao: 2, esquema: 99 });
    guardarEstadoLocal({ versao_vista: 2, impressao: "antiga", sincronizado_em: "" });
    await expect(sincronizar()).rejects.toThrow(/Atualize o Dairus/);
    await expect(resolverConflito("LOCAL")).rejects.toThrow(/Atualize o Dairus/);
    await expect(resolverConflito("NUVEM")).rejects.toThrow(/Atualize o Dairus/);
    expect(nuvem.uploads).toEqual([]);
  });

  it("estado antigo (sem esquema) e esquema igual continuam sincronizando", async () => {
    gravarEstadoNuvem({ versao: 2, esquema: 17 });
    nuvem.arquivos.set(ATUAL, texto("banco"));
    guardarEstadoLocal({ versao_vista: 1, impressao: "local-1", sincronizado_em: "" });
    expect((await sincronizar()).decisao).toBe("BAIXAR");
  });
});

describe("preferências que não foram para o banco", () => {
  it("não param a sincronização, mas ficam registradas na tela (sync_ultimo_erro)", async () => {
    localStorage.setItem("sync_ultimo_erro", JSON.stringify({ mensagem: "erro velho", em: "2020-01-01T00:00:00Z" }));
    falhaPreferencias = true;
    const r = await sincronizar();
    expect(r.decisao).toBe("ENVIAR");
    const aviso = JSON.parse(localStorage.getItem("sync_ultimo_erro") ?? "null");
    expect(aviso.mensagem).toMatch(/preferências da conta.*disco cheio/);
  });

  it("sem falha, a sincronização limpa o erro anterior", async () => {
    localStorage.setItem("sync_ultimo_erro", JSON.stringify({ mensagem: "erro velho", em: "2020-01-01T00:00:00Z" }));
    await sincronizar();
    expect(JSON.parse(localStorage.getItem("sync_ultimo_erro") ?? "null")).toBeNull();
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

describe("atualizar o app (v0.2.5 -> v0.2.6) não é conflito", () => {
  // Preferências por conta (como no app): chaves "u1:<nome>" no localStorage.
  const prefLocal = (chave: string, valor: unknown) => localStorage.setItem(`u1:${chave}`, JSON.stringify(valor));
  const estadoLocalDaConta = () => JSON.parse(localStorage.getItem("u1:sync_estado") ?? "null") as EstadoLocal | null;

  beforeEach(() => {
    localStorage.clear();
    definirContaDasPreferencias("u1");
    // Os dois PCs estavam sincronizados na v5 (na v0.2.5, sem preferências no banco).
    prefLocal("sync_estado", { versao_vista: 5, impressao: "v025", sincronizado_em: "" });
    // PC B: nome igual ao do A, e uma nota que só ele tem (no arquivo de preferências).
    prefLocal("nome_usuario", "Daniel");
    prefLocal("notas_inicio", "nota só do PC B");
    // A atualizou primeiro e enviou a v6, com as preferências dele (conjunto completo).
    gravarEstadoNuvem({ versao: 6, dispositivo_id: "pc-a", esquema: 17 });
    nuvem.arquivos.set(ATUAL, texto("banco-do-pc-a"));
    preferenciasDaNuvem = { nome_usuario: '"Dani"', foco_mes: '"Viagem"', _preferencias_v1: '"1"' };
    // B abriu a versão nova: as migrações mudaram a impressão.
    impressaoLocal = "v026-migrado";
  });
  afterEach(() => definirContaDasPreferencias(null));

  it("B atualiza sem editar nada: baixa (não é conflito) e não perde as preferências que só ele tinha", async () => {
    soAtualizacao = true;
    const r = await sincronizar();
    expect(r).toMatchObject({ decisao: "BAIXAR", aplicouRemoto: true });
    // O que veio do A chegou, e a nota que só o B tinha continua aqui (mescla, sem apagar).
    expect(await lerPreferencia("nome_usuario")).toBe("Dani");
    expect(await lerPreferencia("foco_mes")).toBe("Viagem");
    expect(await lerPreferencia("notas_inicio")).toBe("nota só do PC B");
    expect(estadoLocalDaConta()?.versao_vista).toBe(6);
    // Concluída: a partir de agora as remoções valem, e a marca da atualização foi apagada.
    expect(await lerPreferencia("sync_prefs_ok")).toBe(true);
    expect(chamados.some(([c]) => c === "limpar_marca_atualizacao")).toBe(true);

    // Na rodada seguinte, a nota do B sobe para a nuvem.
    soAtualizacao = false;
    const r2 = await sincronizar();
    expect(r2.decisao).toBe("ENVIAR");
    expect(preferenciasNoBanco.notas_inicio).toBe('"nota só do PC B"');
    expect(estadoNaNuvem().versao).toBe(7);
  });

  it("B tinha editado um lançamento antes de atualizar: conflito de verdade, nada é trocado", async () => {
    soAtualizacao = false; // o Rust diz que a mudança não veio só da atualização
    const r = await sincronizar();
    expect(r.decisao).toBe("CONFLITO");
    expect(chamados.some(([c]) => c === "restaurar_backup")).toBe(false);
    expect(await lerPreferencia("notas_inicio")).toBe("nota só do PC B");
    expect(await lerPreferencia("sync_prefs_ok")).toBeNull();
  });

  it("A (o primeiro a atualizar, nuvem sem mudança) envia", async () => {
    gravarEstadoNuvem({ versao: 5 });
    soAtualizacao = true;
    const r = await sincronizar();
    expect(r.decisao).toBe("ENVIAR");
    expect(estadoNaNuvem().versao).toBe(6);
  });

  it("a regra: só atualização nunca é conflito; na dúvida (erro ao perguntar), conta como mudança", async () => {
    const local = { versao_vista: 5, impressao: "x", sincronizado_em: "" };
    expect(decidir({ local, remoto: remoto(6), impressaoAtual: "y", localVazio: false, soAtualizacao: true })).toBe("BAIXAR");
    expect(decidir({ local, remoto: remoto(5), impressaoAtual: "y", localVazio: false, soAtualizacao: true })).toBe("ENVIAR");
    expect(decidir({ local, remoto: remoto(6), impressaoAtual: "y", localVazio: false })).toBe("CONFLITO");
    soAtualizacao = "erro";
    expect((await sincronizar()).decisao).toBe("CONFLITO");
  });

  it("sem mudança aqui, nem pergunta ao Rust", async () => {
    impressaoLocal = "v025";
    soAtualizacao = "erro";
    localStorage.removeItem("u1:nome_usuario");
    localStorage.removeItem("u1:notas_inicio");
    expect((await sincronizar()).decisao).toBe("BAIXAR");
    expect(chamados.some(([c]) => c === "mudanca_so_da_atualizacao")).toBe(false);
  });
});

describe("sem cache na leitura e na gravação da nuvem", () => {
  it("lê o estado e o banco sem cache e grava com Cache-Control 0", async () => {
    gravarEstadoNuvem({ versao: 2 });
    nuvem.arquivos.set(ATUAL, texto("banco-da-nuvem"));
    guardarEstadoLocal({ versao_vista: 1, impressao: "local-1", sincronizado_em: "" });
    await sincronizar();
    expect(nuvem.opcoesDownload.length).toBeGreaterThan(1);
    for (const d of nuvem.opcoesDownload) {
      expect(d.params?.cache, d.caminho).toBe("no-store");
      expect(d.opcoes?.cacheNonce, d.caminho).toBeTruthy();
    }
    // Cada leitura usa um parâmetro diferente (a CDN não devolve a resposta guardada).
    const nonces = nuvem.opcoesDownload.map((d) => d.opcoes?.cacheNonce);
    expect(new Set(nonces).size).toBe(nonces.length);

    // Uma edição aqui: a próxima rodada envia.
    impressaoLocal = "editado";
    await sincronizar();
    expect(nuvem.opcoesUpload.length).toBeGreaterThan(0);
    for (const u of nuvem.opcoesUpload) expect(u.opcoes?.cacheControl, u.caminho).toBe("0");
  });
});

describe("a gravação vista na nuvem, não só o número da versão", () => {
  const estado = (e: Partial<EstadoNuvem>): EstadoNuvem => ({ versao: 5, alterado_em: "t1", dispositivo_id: "pc-a", dispositivo_nome: "PC", ...e });
  const vista = (e: Partial<EstadoLocal> = {}): EstadoLocal => ({ versao_vista: 5, impressao: "i", sincronizado_em: "", alterado_em_visto: "t1", dispositivo_visto: "pc-a", ...e });

  it("mesma gravação: nada; mesma versão gravada por outro computador: baixa", () => {
    expect(decidir({ local: vista(), remoto: estado({}), impressaoAtual: "i", localVazio: false })).toBe("NADA");
    expect(decidir({ local: vista(), remoto: estado({ alterado_em: "t2", dispositivo_id: "pc-b" }), impressaoAtual: "i", localVazio: false })).toBe("BAIXAR");
    expect(decidir({ local: vista(), remoto: estado({ dispositivo_id: "pc-b" }), impressaoAtual: "i", localVazio: false })).toBe("BAIXAR");
    // Mudou aqui também: conflito.
    expect(decidir({ local: vista(), remoto: estado({ alterado_em: "t2" }), impressaoAtual: "j", localVazio: false })).toBe("CONFLITO");
  });

  it("se a gravação coberta era a deste computador, pergunta (baixar perderia o que ele enviou)", () => {
    expect(decidir({ local: vista({ enviado_daqui: true }), remoto: estado({ alterado_em: "t2", dispositivo_id: "pc-b" }), impressaoAtual: "i", localVazio: false })).toBe("CONFLITO");
  });

  it("estado local antigo (sem esses campos) continua comparando só a versão", () => {
    const antigo: EstadoLocal = { versao_vista: 5, impressao: "i", sincronizado_em: "" };
    expect(decidir({ local: antigo, remoto: estado({ alterado_em: "qualquer", dispositivo_id: "outro" }), impressaoAtual: "i", localVazio: false })).toBe("NADA");
  });

  it("guarda a gravação vista ao enviar, ao baixar e ao completar um estado antigo", async () => {
    gravarEstadoNuvem({ versao: 3, alterado_em: "t3", dispositivo_id: "pc-b" });
    nuvem.arquivos.set(ATUAL, texto("banco"));
    guardarEstadoLocal({ versao_vista: 2, impressao: "local-1", sincronizado_em: "" });
    expect((await sincronizar()).decisao).toBe("BAIXAR");
    expect(estadoLocal()).toMatchObject({ versao_vista: 3, alterado_em_visto: "t3", dispositivo_visto: "pc-b", enviado_daqui: false });

    impressaoLocal = "editado";
    expect((await sincronizar()).decisao).toBe("ENVIAR");
    const enviado = estadoNaNuvem();
    expect(estadoLocal()).toMatchObject({ versao_vista: 4, alterado_em_visto: enviado.alterado_em, dispositivo_visto: enviado.dispositivo_id, enviado_daqui: true });

    guardarEstadoLocal({ versao_vista: 4, impressao: "editado", sincronizado_em: "" });
    expect((await sincronizar()).decisao).toBe("NADA");
    expect(estadoLocal()).toMatchObject({ alterado_em_visto: enviado.alterado_em, dispositivo_visto: enviado.dispositivo_id });
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
