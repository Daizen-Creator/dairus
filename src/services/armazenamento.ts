// Abstração mínima de persistência de preferências (tema, favoritos,
// configurações). Dentro do Tauri usa o arquivo JSON do plugin `store`
// (dados de verdade, por usuário, em %APPDATA%); fora dele (ex.: preview
// no navegador durante o desenvolvimento) cai para `localStorage` para não
// quebrar a experiência de quem está só olhando a UI.
//
// Cada conta tem o seu próprio arquivo: preferencias-<id>.json. Antes do login
// (ou fora de uma conta) usa o arquivo antigo, preferencias.json.

type LojaTauri = {
  get<T>(chave: string): Promise<T | null | undefined>;
  set(chave: string, valor: unknown): Promise<void>;
  save(): Promise<void>;
  entries<T>(): Promise<Array<[string, T]>>;
};

const ARQUIVO_LEGADO = "preferencias.json";
let arquivoAtual = ARQUIVO_LEGADO;
let prefixoLocal = "";
const lojas = new Map<string, Promise<LojaTauri>>();

function estaNoTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function obterLoja(arquivo = arquivoAtual): Promise<LojaTauri> {
  let loja = lojas.get(arquivo);
  if (!loja) {
    loja = import("@tauri-apps/plugin-store").then(({ Store }) => Store.load(arquivo) as Promise<LojaTauri>);
    lojas.set(arquivo, loja);
  }
  return loja;
}

/** Passa a ler/gravar as preferências da conta informada (null = arquivo antigo, sem conta). */
export function definirContaDasPreferencias(usuarioId: string | null): void {
  arquivoAtual = usuarioId ? `preferencias-${usuarioId}.json` : ARQUIVO_LEGADO;
  prefixoLocal = usuarioId ? `${usuarioId}:` : "";
}

/** Prefixo da conta atual ("<id>:" ou "" antes do login), para separar dados locais por conta. */
export function prefixoDaConta(): string {
  return prefixoLocal;
}

/** Copia as preferências antigas (de antes do login) para a conta atual. */
export async function importarPreferenciasLegadas(): Promise<number> {
  if (!estaNoTauri() || arquivoAtual === ARQUIVO_LEGADO) return 0;
  const antiga = await obterLoja(ARQUIVO_LEGADO);
  const nova = await obterLoja();
  const itens = await antiga.entries<unknown>();
  for (const [chave, valor] of itens) await nova.set(chave, valor);
  await nova.save();
  return itens.length;
}

export async function lerPreferencia<T>(chave: string): Promise<T | null> {
  if (estaNoTauri()) {
    try {
      const loja = await obterLoja();
      const valor = await loja.get<T>(chave);
      return valor ?? null;
    } catch {
      // segue para o fallback abaixo
    }
  }
  const bruto = localStorage.getItem(prefixoLocal + chave);
  return bruto ? (JSON.parse(bruto) as T) : null;
}

export async function salvarPreferencia(chave: string, valor: unknown): Promise<void> {
  if (estaNoTauri()) {
    try {
      const loja = await obterLoja();
      await loja.set(chave, valor);
      await loja.save();
      return;
    } catch {
      // segue para o fallback abaixo
    }
  }
  localStorage.setItem(prefixoLocal + chave, JSON.stringify(valor));
}

/** Esvazia as preferências da conta atual (usado ao excluir a conta). */
export async function limparPreferenciasDaConta(): Promise<void> {
  if (estaNoTauri()) {
    try {
      const loja = (await obterLoja()) as LojaTauri & { clear?: () => Promise<void> };
      await loja.clear?.();
      await loja.save();
    } catch {
      // o arquivo é apagado pelo Rust de qualquer forma
    }
  }
  for (const chave of Object.keys(localStorage)) if (prefixoLocal && chave.startsWith(prefixoLocal)) localStorage.removeItem(chave);
}
