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
