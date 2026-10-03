// Organizar o histórico: duplicatas suspeitas e descrições despadronizadas (local),
// e a validação das sugestões da IA (renomear, etiqueta, regra e subcategoria).

import type { Conta, Etiqueta, Lancamento } from "../../types/accounting";
import { categoriaRaiz, marcaDaDescricao, padronizarDescricao } from "../../services/categorias";

const dias = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;
const valorDe = (l: Lancamento) => l.partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0);
const ativos = (ls: Lancamento[]) => {
  const estornados = new Set(ls.map((l) => l.estornado_de).filter(Boolean));
  return ls.filter((l) => l.origem !== "ESTORNO" && !estornados.has(l.id) && !l.corrige);
};

/** Pares com mesmo valor, mesma marca e até 2 dias de diferença. */
export function duplicatasSuspeitas(lancamentos: Lancamento[], desde: string): Array<[Lancamento, Lancamento]> {
  const ls = ativos(lancamentos).filter((l) => l.data >= desde).sort((a, b) => a.data.localeCompare(b.data));
  const pares: Array<[Lancamento, Lancamento]> = [];
  const usados = new Set<string>();
  for (let i = 0; i < ls.length; i++) {
    for (let j = i + 1; j < ls.length && dias(ls[i].data, ls[j].data) <= 2; j++) {
      const a = ls[i], b = ls[j];
      if (usados.has(b.id) || valorDe(a) !== valorDe(b) || (a.parcelas ?? 0) > 1) continue;
      const m = marcaDaDescricao(a.descricao);
      if (m && m === marcaDaDescricao(b.descricao)) {
        pares.push([a, b]);
        usados.add(b.id);
      }
    }
  }
  return pares;
}

/** Marcas escritas de jeitos diferentes: sugere um nome único (o mais usado, padronizado). */
export function descricoesParaPadronizar(lancamentos: Lancamento[], desde: string): Array<{ marca: string; variantes: string[]; sugestao: string; ids: string[] }> {
  const grupos = new Map<string, Lancamento[]>();
  for (const l of ativos(lancamentos).filter((x) => x.data >= desde)) {
    const m = marcaDaDescricao(l.descricao);
    if (m) grupos.set(m, [...(grupos.get(m) ?? []), l]);
  }
  const saida = [];
  for (const [marca, ls] of grupos) {
    const contagem = new Map<string, number>();
    for (const l of ls) contagem.set(l.descricao, (contagem.get(l.descricao) ?? 0) + 1);
    if (contagem.size < 2) continue;
    const maisUsada = [...contagem.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
    const sugestao = padronizarDescricao(maisUsada);
    saida.push({ marca, variantes: [...contagem.keys()], sugestao, ids: ls.filter((l) => l.descricao !== sugestao).map((l) => l.id) });
  }
  return saida.filter((s) => s.ids.length).sort((a, b) => b.ids.length - a.ids.length);
}

export interface SugestaoIA {
  descricao: string;
  nova_descricao: string | null;
  etiqueta: Etiqueta | null;
  categoria_id: string | null;
  subcategoria: string | null;
}

/** Descrições distintas (com a categoria atual) para enviar à IA. */
export function descricoesParaIA(lancamentos: Lancamento[], contas: Conta[], desde: string, limite = 150): Array<{ descricao: string; categoria: string; vezes: number; etiqueta: string | null }> {
  const porId = new Map(contas.map((c) => [c.id, c]));
  const mapa = new Map<string, { descricao: string; categoria: string; vezes: number; etiqueta: string | null }>();
  for (const l of ativos(lancamentos).filter((x) => x.data >= desde)) {
    const cat = l.partidas.map((p) => porId.get(p.conta_id)).find((c) => c?.tipo === "DESPESA");
    if (!cat) continue;
    const x = mapa.get(l.descricao) ?? { descricao: l.descricao, categoria: cat.nome, vezes: 0, etiqueta: l.etiqueta };
    x.vezes += 1;
    mapa.set(l.descricao, x);
  }
  return [...mapa.values()].sort((a, b) => b.vezes - a.vezes).slice(0, limite);
}

export function validarSugestoes(bruto: unknown, descricoes: Set<string>, contas: Conta[]): SugestaoIA[] {
  const lista = (bruto as { sugestoes?: unknown[] })?.sugestoes;
  if (!Array.isArray(lista)) return [];
  const despesas = new Map(contas.filter((c) => c.tipo === "DESPESA" && c.ativa).map((c) => [c.id, c]));
  const etiquetas = new Set(["ASSINATURA", "MENSALIDADE", "FIXO"]);
  const saida: SugestaoIA[] = [];
  for (const s of lista as Array<Record<string, unknown>>) {
    const descricao = String(s?.descricao ?? "");
    if (!descricoes.has(descricao)) continue;
    const nova = typeof s.nova_descricao === "string" && s.nova_descricao.trim() && s.nova_descricao.trim() !== descricao ? s.nova_descricao.trim().slice(0, 80) : null;
    const etiqueta = typeof s.etiqueta === "string" && etiquetas.has(s.etiqueta) ? (s.etiqueta as Etiqueta) : null;
    const cat = typeof s.categoria_id === "string" && despesas.get(s.categoria_id)?.subtipo !== "CATEGORIA" && despesas.has(s.categoria_id) ? s.categoria_id : null;
    const sub = typeof s.subcategoria === "string" && s.subcategoria.trim() ? s.subcategoria.trim().slice(0, 40) : null;
    if (nova || etiqueta || cat || sub) saida.push({ descricao, nova_descricao: nova, etiqueta, categoria_id: cat, subcategoria: sub });
  }
  return saida;
}

/** Categoria principal atual de uma descrição (para criar a subcategoria sugerida embaixo dela). */
export function categoriaPrincipalDe(descricao: string, lancamentos: Lancamento[], contas: Conta[]): Conta | null {
  const porId = new Map(contas.map((c) => [c.id, c]));
  const l = lancamentos.find((x) => x.descricao === descricao);
  const cat = l?.partidas.map((p) => porId.get(p.conta_id)).find((c) => c?.tipo === "DESPESA");
  return cat ? categoriaRaiz(cat, porId) : null;
}
