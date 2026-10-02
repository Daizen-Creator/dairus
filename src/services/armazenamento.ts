// Abstração mínima de persistência de preferências (tema, favoritos,
// configurações). Dentro do Tauri usa o arquivo JSON do plugin `store`
// (dados de verdade, por usuário, em %APPDATA%); fora dele (ex.: preview
// no navegador durante o desenvolvimento) cai para `localStorage` para não
// quebrar a experiência de quem está só olhando a UI.
//
// Isto é exatamente o tipo de detalhe que a camada de serviços deve
// esconder dos componentes (seção 1 e 18 do escopo): se um dia trocarmos
// o motor de persistência, só este arquivo muda.

type LojaTauri = {
  get<T>(chave: string): Promise<T | null | undefined>;
  set(chave: string, valor: unknown): Promise<void>;
  save(): Promise<void>;
};

let lojaPromise: Promise<LojaTauri> | null = null;

function estaNoTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function obterLoja(): Promise<LojaTauri> {
  if (!lojaPromise) {
    lojaPromise = import("@tauri-apps/plugin-store").then(
      ({ Store }) => Store.load("preferencias.json") as Promise<LojaTauri>,
    );
  }
  return lojaPromise;
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
  const bruto = localStorage.getItem(chave);
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
  localStorage.setItem(chave, JSON.stringify(valor));
}
