// Modo viagem: enquanto ligado, toda despesa nova ganha a etiqueta da viagem
// (ex.: #viagem-praia-2026) e uma faixa mostra quanto já foi gasto x o orçamento.

import { lerPreferencia, salvarPreferencia } from "./armazenamento";

export interface Viagem {
  ativo: boolean;
  nome: string;
  inicio: string;
  fim: string | null;
  orcamento_centavos: number | null;
}

export const EVENTO_VIAGEM = "dairus:viagem";

export function tagDaViagem(v: Pick<Viagem, "nome" | "inicio">): string {
  const slug = v.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
  return `viagem-${slug || v.inicio.slice(0, 7)}`;
}

/** Ativa até o fim (inclusive); depois do fim, desliga sozinha. */
export function viagemValida(v: Viagem | null, hoje: string): v is Viagem {
  return !!v && v.ativo && (!v.fim || hoje <= v.fim);
}

export async function viagemAtual(hoje: string): Promise<Viagem | null> {
  const v = await lerPreferencia<Viagem>("modo_viagem");
  if (v?.ativo && v.fim && hoje > v.fim) {
    await salvarPreferencia("modo_viagem", { ...v, ativo: false });
    return null;
  }
  return viagemValida(v, hoje) ? v : null;
}

/** Junta a etiqueta da viagem às etiquetas do lançamento (se a viagem estiver ligada na data). */
export async function tagsComViagem(tags: string[], data: string): Promise<string[]> {
  const v = await lerPreferencia<Viagem>("modo_viagem");
  if (!v?.ativo || data < v.inicio || (v.fim && data > v.fim)) return tags;
  return [...new Set([...tags, tagDaViagem(v)])];
}

export async function definirViagem(v: Viagem | null): Promise<void> {
  await salvarPreferencia("modo_viagem", v);
  window.dispatchEvent(new CustomEvent(EVENTO_VIAGEM));
}
