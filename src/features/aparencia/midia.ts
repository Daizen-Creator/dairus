// Fotos e vídeos enviados pelo usuário (fundo e widgets), guardados no IndexedDB
// do próprio computador e separados por conta. Não vão para a nuvem: são grandes
// e pessoais. O JSON da aparência guarda só o id.

import { prefixoDaConta } from "../../services/armazenamento";

export type TipoMidia = "fundo-imagem" | "fundo-video" | "widget-foto" | "widget-video";

export interface InfoMidia {
  id: string;
  tipo: TipoMidia;
  nome: string;
  mime: string;
  tamanho: number;
  criadoEm: string;
}

interface Registro extends InfoMidia {
  conta: string;
  blob: Blob;
}

export const LIMITE_BYTES: Record<TipoMidia, number> = {
  "fundo-imagem": 25 * 1024 * 1024,
  "widget-foto": 25 * 1024 * 1024,
  "fundo-video": 150 * 1024 * 1024,
  "widget-video": 150 * 1024 * 1024,
};

const BANCO = "dairus-midia";
const LOJA = "arquivos";
let conexao: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (!conexao) {
    conexao = new Promise((ok, erro) => {
      const req = indexedDB.open(BANCO, 1);
      req.onupgradeneeded = () => {
        const loja = req.result.createObjectStore(LOJA, { keyPath: "id" });
        loja.createIndex("conta", "conta");
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => {
        conexao = null;
        erro(req.error ?? new Error("Não foi possível abrir o armazenamento de fotos."));
      };
    });
  }
  return conexao;
}

function pedido<T>(modo: IDBTransactionMode, fazer: (loja: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((ok, erro) => {
        const req = fazer(db.transaction(LOJA, modo).objectStore(LOJA));
        req.onsuccess = () => ok(req.result);
        req.onerror = () => erro(req.error ?? new Error("Falha no armazenamento local."));
      }),
  );
}

const urls = new Map<string, string>();

export function tipoAceito(tipo: TipoMidia, arquivo: File): boolean {
  return tipo.endsWith("video") ? /^video\/(mp4|webm|ogg)$/.test(arquivo.type) : /^image\/(png|jpe?g|webp|gif|avif|bmp|svg\+xml)$/.test(arquivo.type);
}

export async function salvarMidia(tipo: TipoMidia, arquivo: File): Promise<InfoMidia> {
  if (!tipoAceito(tipo, arquivo)) throw new Error(tipo.endsWith("video") ? "Use um vídeo MP4, WebM ou OGG." : "Use uma imagem PNG, JPG, WebP, GIF ou AVIF.");
  if (arquivo.size > LIMITE_BYTES[tipo]) throw new Error(`Arquivo grande demais (máximo ${Math.round(LIMITE_BYTES[tipo] / 1024 / 1024)} MB).`);
  const info: InfoMidia = {
    id: `${tipo.startsWith("fundo") ? "f" : "w"}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    tipo,
    nome: arquivo.name.slice(0, 120),
    mime: arquivo.type,
    tamanho: arquivo.size,
    criadoEm: new Date().toISOString(),
  };
  await pedido("readwrite", (l) => l.put({ ...info, conta: prefixoDaConta(), blob: arquivo } satisfies Registro));
  return info;
}

export async function listarMidias(tipo?: TipoMidia): Promise<InfoMidia[]> {
  const todos = await pedido<Registro[]>("readonly", (l) => l.index("conta").getAll(prefixoDaConta()));
  return todos
    .filter((r) => !tipo || r.tipo === tipo)
    .map(({ id, tipo: t, nome, mime, tamanho, criadoEm }) => ({ id, tipo: t, nome, mime, tamanho, criadoEm }))
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

/** URL local (blob:) do arquivo, em cache enquanto o app está aberto. */
export async function urlDaMidia(id: string): Promise<string | null> {
  if (!id) return null;
  const pronta = urls.get(id);
  if (pronta) return pronta;
  const r = await pedido<Registro | undefined>("readonly", (l) => l.get(id));
  if (!r || r.conta !== prefixoDaConta()) return null;
  const url = URL.createObjectURL(r.blob);
  urls.set(id, url);
  return url;
}

export async function apagarMidia(id: string): Promise<void> {
  await pedido("readwrite", (l) => l.delete(id));
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
}

/** Apaga todas as fotos e vídeos da conta atual (usado ao excluir a conta). */
export async function apagarMidiasDaConta(): Promise<number> {
  const lista = await listarMidias();
  for (const m of lista) await apagarMidia(m.id);
  return lista.length;
}
