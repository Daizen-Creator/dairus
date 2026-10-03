// Backups na nuvem (Supabase Storage, bucket privado "backups"). Cada conta só enxerga
// a própria pasta (<id da conta>/…), garantido pelas regras de acesso do Supabase.

import { extras } from "./extras";
import { supabase } from "./supabase";

const BUCKET = "backups";

export interface ArquivoNuvem {
  nome: string;
  tamanho: number;
  criadoEm: string | null;
}

async function pastaDaConta(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Entre na sua conta para usar a nuvem.");
  return id;
}

export async function listarBackupsNaNuvem(): Promise<ArquivoNuvem[]> {
  const pasta = await pastaDaConta();
  const { data, error } = await supabase.storage.from(BUCKET).list(pasta, { limit: 200, sortBy: { column: "created_at", order: "desc" } });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((a) => a.name.endsWith(".db"))
    .map((a) => ({ nome: a.name, tamanho: (a.metadata as { size?: number } | null)?.size ?? 0, criadoEm: a.created_at ?? null }));
}

export async function enviarBackupParaNuvem(nome: string): Promise<void> {
  const pasta = await pastaDaConta();
  const bytes = await extras.lerBackup(nome);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${pasta}/${nome}`, new Blob([bytes], { type: "application/octet-stream" }), { upsert: true, contentType: "application/octet-stream" });
  if (error) throw new Error(error.message);
}

export async function baixarBackupDaNuvem(nome: string) {
  const pasta = await pastaDaConta();
  const { data, error } = await supabase.storage.from(BUCKET).download(`${pasta}/${nome}`);
  if (error || !data) throw new Error(error?.message ?? "Falha ao baixar.");
  return extras.gravarBackupBaixado(nome, new Uint8Array(await data.arrayBuffer()));
}

export async function apagarBackupDaNuvem(nome: string): Promise<void> {
  const pasta = await pastaDaConta();
  const { error } = await supabase.storage.from(BUCKET).remove([`${pasta}/${nome}`]);
  if (error) throw new Error(error.message);
}

/** Envia um arquivo qualquer (ex.: relatório em PDF) para <conta>/<subpasta>/ na nuvem. */
export async function enviarArquivoParaNuvem(subpasta: string, nome: string, bytes: Uint8Array, tipo: string): Promise<void> {
  const pasta = await pastaDaConta();
  const { error } = await supabase.storage.from(BUCKET).upload(`${pasta}/${subpasta}/${nome}`, new Blob([new Uint8Array(bytes)], { type: tipo }), { upsert: true, contentType: tipo });
  if (error) throw new Error(error.message);
}

/** Apaga tudo da conta na nuvem (backups, sincronização, relatórios e aparência). Devolve quantos arquivos apagou. */
export async function apagarTudoDaNuvem(): Promise<number> {
  const raiz = await pastaDaConta();
  const arquivos: string[] = [];
  const visitar = async (pasta: string, nivel: number) => {
    const { data, error } = await supabase.storage.from(BUCKET).list(pasta, { limit: 1000 });
    if (error) throw new Error(error.message);
    for (const item of data ?? []) {
      const caminho = `${pasta}/${item.name}`;
      // Pastas vêm sem id no Storage.
      if (item.id === null && nivel < 4) await visitar(caminho, nivel + 1);
      else if (item.id !== null) arquivos.push(caminho);
    }
  };
  await visitar(raiz, 0);
  for (let i = 0; i < arquivos.length; i += 100) {
    const { error } = await supabase.storage.from(BUCKET).remove(arquivos.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
  // A aparência (fundo, menu, fonte) também fica na nuvem, numa tabela própria.
  const { data: sessao } = await supabase.auth.getSession();
  const uid = sessao.session?.user.id;
  if (uid) {
    const { error } = await supabase.from("preferencias_aparencia").delete().eq("user_id", uid);
    if (error) throw new Error(error.message);
  }
  return arquivos.length;
}
