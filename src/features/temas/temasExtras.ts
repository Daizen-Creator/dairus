// Temas: contraste (WCAG), tema do dia e escolha aleatória.

import type { Tema } from "../../types/theme";

function luminancia(hex: string): number {
  const h = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) return 0;
  const canal = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
}

/** Razão de contraste entre duas cores (1 a 21). 4,5 é o mínimo recomendado para texto. */
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

export function notaContraste(t: Tema): { razao: number; nivel: "AAA" | "AA" | "baixo" } {
  const razao = contraste(t.cores.textoPrimario, t.cores.fundo);
  return { razao, nivel: razao >= 7 ? "AAA" : razao >= 4.5 ? "AA" : "baixo" };
}

/** Tema do dia: gira pelos favoritos (ou todos) conforme o dia do ano. */
export function temaDoDia(ids: string[], hoje: string): string | null {
  if (!ids.length) return null;
  const inicio = Date.UTC(+hoje.slice(0, 4), 0, 1);
  const dia = Math.floor((Date.parse(`${hoje}T12:00:00Z`) - inicio) / 86_400_000);
  return ids[dia % ids.length];
}

export function aleatorio<T>(lista: T[], excluir?: T): T | null {
  const opcoes = lista.filter((x) => x !== excluir);
  return opcoes.length ? opcoes[Math.floor(Math.random() * opcoes.length)] : null;
}
