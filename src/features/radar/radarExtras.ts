// Radar: datas de promoção (calculadas) e total da lista de desejos.

import type { ItemRadar } from "../../types/extras";

const iso = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d)).toISOString().slice(0, 10);

/** n-ésimo dia da semana (0=domingo) de um mês. */
function enesimo(ano: number, mes: number, diaSemana: number, n: number): string {
  const primeiro = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();
  return iso(ano, mes, 1 + ((diaSemana - primeiro + 7) % 7) + (n - 1) * 7);
}

export function datasDePromocao(ano: number): Array<{ nome: string; data: string }> {
  const bf = enesimo(ano, 11, 5, 4);
  const cyber = new Date(Date.parse(`${bf}T12:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
  return [
    { nome: "Dia do Consumidor", data: iso(ano, 3, 15) },
    { nome: "Dia das Mães", data: enesimo(ano, 5, 0, 2) },
    { nome: "Dia dos Pais", data: enesimo(ano, 8, 0, 2) },
    { nome: "Dia das Crianças", data: iso(ano, 10, 12) },
    { nome: "Black Friday", data: bf },
    { nome: "Cyber Monday", data: cyber },
    { nome: "Natal", data: iso(ano, 12, 25) },
  ];
}

export function proximasPromocoes(hoje: string, n = 3): Array<{ nome: string; data: string; dias: number }> {
  const ano = Number(hoje.slice(0, 4));
  return [...datasDePromocao(ano), ...datasDePromocao(ano + 1)]
    .filter((d) => d.data >= hoje)
    .slice(0, n)
    .map((d) => ({ ...d, dias: Math.round((Date.parse(`${d.data}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000) }));
}

/** Soma do menor preço visto de cada item (o quanto custaria comprar tudo pelo melhor preço). */
export function totalDaLista(itens: ItemRadar[], filtro?: (i: ItemRadar) => boolean): { total: number; semPreco: number } {
  let total = 0;
  let semPreco = 0;
  for (const i of itens.filter(filtro ?? (() => true))) {
    if (!i.precos.length) semPreco++;
    else total += Math.min(...i.precos.map((p) => p.preco_centavos));
  }
  return { total, semPreco };
}
