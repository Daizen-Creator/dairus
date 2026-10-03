export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Palavras curtas ("vr", "tim", "99") só valem como palavra inteira. */
export function bateAlguma(textoNormalizado: string, palavras: string[]): boolean {
  return palavras.some((palavra) => {
    const p = normalizar(palavra).trim();
    return p.length <= 3
      ? new RegExp(`(^|[^a-z0-9])${p}([^a-z0-9]|$)`).test(textoNormalizado)
      : textoNormalizado.includes(p);
  });
}

/** Logos embutidos no app (public/marcas/*.png — favicons oficiais dos sites,
 * baixados uma vez; nada é buscado na internet durante o uso). */
const MARCAS: Array<{ arquivo: string; palavras: string[] }> = [
  { arquivo: "claude", palavras: ["claude", "anthropic"] },
  { arquivo: "wyden", palavras: ["wyden", "faculdade"] },
  { arquivo: "openai", palavras: ["openai", "chatgpt"] },
  { arquivo: "gemini", palavras: ["gemini"] },
  { arquivo: "google", palavras: ["google"] },
  { arquivo: "nubank", palavras: ["nubank", "nu pagamentos"] },
  { arquivo: "inter", palavras: ["banco inter"] },
  { arquivo: "itau", palavras: ["itau", "itaucard"] },
  { arquivo: "bradesco", palavras: ["bradesco"] },
  { arquivo: "santander", palavras: ["santander"] },
  { arquivo: "picpay", palavras: ["picpay"] },
  { arquivo: "mercadopago", palavras: ["mercado pago", "mercadopago"] },
  { arquivo: "uber", palavras: ["uber"] },
  { arquivo: "99", palavras: ["99", "99app", "99pop"] },
  { arquivo: "netflix", palavras: ["netflix"] },
  { arquivo: "spotify", palavras: ["spotify"] },
  { arquivo: "primevideo", palavras: ["prime video", "primevideo"] },
  { arquivo: "disneyplus", palavras: ["disney"] },
  { arquivo: "youtube", palavras: ["youtube"] },
  { arquivo: "ifood", palavras: ["ifood"] },
  { arquivo: "amazon", palavras: ["amazon"] },
  { arquivo: "mercadolivre", palavras: ["mercado livre", "mercadolivre"] },
  { arquivo: "shopee", palavras: ["shopee"] },
  { arquivo: "smartfit", palavras: ["smart fit", "smartfit"] },
  { arquivo: "claro", palavras: ["claro"] },
];

/** Marcas ensinadas pelo usuário: palavras → logo embutido ou imagem enviada (data URL). */
export interface MarcaUsuario {
  palavras: string[];
  imagem: string;
}

let marcasUsuario: MarcaUsuario[] = [];

/** Troca as marcas ensinadas em memória (lidas das preferências ao abrir a conta). */
export function definirMarcasUsuario(lista: MarcaUsuario[]): void {
  marcasUsuario = Array.isArray(lista) ? lista.filter((m) => m.palavras?.length && m.imagem) : [];
}

export const MARCAS_EMBUTIDAS = MARCAS.map((m) => ({ arquivo: m.arquivo, caminho: `/marcas/${m.arquivo}.png` }));

export function marcaDaDescricao(descricao: string): string | null {
  const texto = normalizar(descricao);
  // As que você ensinou vêm primeiro (podem corrigir uma marca embutida).
  const sua = marcasUsuario.find((m) => bateAlguma(texto, m.palavras));
  if (sua) return sua.imagem;
  const achou = MARCAS.find((m) => bateAlguma(texto, m.palavras));
  return achou ? `/marcas/${achou.arquivo}.png` : null;
}

/** Logos sem fundo próprio (desenho solto sobre transparente). Os demais já são ícones
 * de app com fundo colorido e ocupam o espaço todo, sem moldura. */
const LOGOS_TRANSPARENTES = new Set(["bradesco", "claro", "gemini", "netflix", "santander", "shopee"]);

export function logoTransparente(caminho: string): boolean {
  if (caminho.startsWith("data:")) return false;
  const arquivo = caminho.split("/").pop()?.replace(".png", "") ?? "";
  return LOGOS_TRANSPARENTES.has(arquivo);
}
