/** Degradê de preenchimento (claro → escuro) a partir de uma cor base
 * qualquer (hex ou var(--cor-...)). Usado em ícones, chips e barras. */
export function degradeDeCor(cor: string): string {
  return `linear-gradient(135deg, color-mix(in srgb, ${cor} 82%, white) 0%, ${cor} 45%, color-mix(in srgb, ${cor} 72%, black) 100%)`;
}

export function brilhoDeCor(cor: string, intensidade = 0.55): string {
  return `0 0 14px -2px color-mix(in srgb, ${cor} ${Math.round(intensidade * 100)}%, transparent)`;
}
