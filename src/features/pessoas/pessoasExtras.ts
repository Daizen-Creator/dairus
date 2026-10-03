// Pessoas: histórico de cada pessoa e link de WhatsApp.

import type { AReceber } from "../../services/planejamento";

export interface HistoricoPessoa {
  pessoa: string;
  emAberto: number;
  recebido: number;
  perdoado: number;
  /** Média de dias entre o empréstimo e o pagamento (só itens recebidos). */
  diasMedios: number | null;
}

const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

export function historicoPorPessoa(itens: AReceber[]): HistoricoPessoa[] {
  const mapa = new Map<string, { emAberto: number; recebido: number; perdoado: number; dias: number[] }>();
  for (const i of itens) {
    const x = mapa.get(i.pessoa) ?? { emAberto: 0, recebido: 0, perdoado: 0, dias: [] };
    if (i.perdoado) x.perdoado += i.valor_centavos;
    else if (i.recebido_em) {
      x.recebido += i.valor_centavos;
      x.dias.push(dias(i.data, i.recebido_em));
    } else x.emAberto += i.valor_centavos;
    mapa.set(i.pessoa, x);
  }
  return [...mapa.entries()]
    .map(([pessoa, x]) => ({ pessoa, emAberto: x.emAberto, recebido: x.recebido, perdoado: x.perdoado, diasMedios: x.dias.length ? Math.round(x.dias.reduce((s, d) => s + d, 0) / x.dias.length) : null }))
    .sort((a, b) => b.emAberto - a.emAberto || a.pessoa.localeCompare(b.pessoa));
}

/** Link do WhatsApp com a mensagem (telefone brasileiro: só números, com DDD). */
export function linkWhatsApp(telefone: string, mensagem: string): string | null {
  let n = telefone.replace(/\D/g, "");
  if (n.length === 10 || n.length === 11) n = `55${n}`;
  if (n.length < 12 || n.length > 13) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(mensagem)}`;
}
