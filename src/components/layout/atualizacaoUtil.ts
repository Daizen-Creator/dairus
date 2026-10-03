// Cálculos da tela de atualização (sem React, para poder testar).

/** "v1.2.3" ou "1.2.3-beta" → [1, 2, 3]; null se não for versão. */
export function partesDaVersao(texto: string): [number, number, number] | null {
  const nucleo = texto.trim().replace(/^v/i, "").split(/[-+]/)[0];
  const partes = nucleo.split(".").map((p) => (p === "" ? NaN : Number(p)));
  if (!partes.length || partes.some((p) => !Number.isInteger(p) || p < 0)) return null;
  return [partes[0], partes[1] ?? 0, partes[2] ?? 0];
}

/** true se `a` for igual ou mais nova que `b`. */
export function versaoMaiorOuIgual(a: string, b: string): boolean {
  const x = partesDaVersao(a);
  const y = partesDaVersao(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return true;
}

/** 1536000 → "1,5 MB". */
export function formatarMB(bytes: number): string {
  const mb = bytes / 1_048_576;
  return `${mb.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}

/** Porcentagem inteira de 0 a 100 (0 quando o tamanho é desconhecido). */
export function porcentagem(baixados: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((baixados / total) * 100)));
}

/** "2,1 MB/s · faltam 12 s" a partir do que já foi baixado e do tempo decorrido. */
export function velocidadeERestante(baixados: number, total: number, msDecorridos: number): string {
  if (msDecorridos < 800 || baixados <= 0) return "";
  const porSegundo = baixados / (msDecorridos / 1000);
  const vel = `${formatarMB(porSegundo).replace(" MB", "")} MB/s`;
  if (total <= 0 || baixados >= total) return vel;
  const s = Math.ceil((total - baixados) / porSegundo);
  const resta = s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
  return `${vel} · faltam ${resta}`;
}
