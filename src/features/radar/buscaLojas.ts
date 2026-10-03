// Busca de preços em várias lojas: API pública do Mercado Livre + IA (Gemini) com
// pesquisa no Google para as demais lojas, e links de busca prontos em cada loja.

import { buscarPreco } from "./radarAuto";

export interface OfertaLoja {
  loja: string;
  titulo: string;
  precoCentavos: number;
  url: string | null;
  fonte: "MERCADO_LIVRE" | "IA";
}

export const LOJAS: Array<{ nome: string; busca: (q: string) => string }> = [
  { nome: "Mercado Livre", busca: (q) => `https://lista.mercadolivre.com.br/${encodeURIComponent(q.replace(/\s+/g, "-"))}` },
  { nome: "Amazon", busca: (q) => `https://www.amazon.com.br/s?k=${encodeURIComponent(q)}` },
  { nome: "Magazine Luiza", busca: (q) => `https://www.magazineluiza.com.br/busca/${encodeURIComponent(q)}/` },
  { nome: "Kabum", busca: (q) => `https://www.kabum.com.br/busca/${encodeURIComponent(q.replace(/\s+/g, "-"))}` },
  { nome: "Americanas", busca: (q) => `https://www.americanas.com.br/busca/${encodeURIComponent(q.replace(/\s+/g, "-"))}` },
  { nome: "Casas Bahia", busca: (q) => `https://www.casasbahia.com.br/${encodeURIComponent(q.replace(/\s+/g, "-"))}/b` },
  { nome: "Shopee", busca: (q) => `https://shopee.com.br/search?keyword=${encodeURIComponent(q)}` },
  { nome: "AliExpress", busca: (q) => `https://pt.aliexpress.com/w/wholesale-${encodeURIComponent(q.replace(/\s+/g, "-"))}.html` },
  { nome: "Zoom (comparador)", busca: (q) => `https://www.zoom.com.br/search?q=${encodeURIComponent(q)}` },
  { nome: "Buscapé (comparador)", busca: (q) => `https://www.buscape.com.br/search?q=${encodeURIComponent(q)}` },
  { nome: "Google Shopping", busca: (q) => `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}` },
];

const urlOk = (u: unknown): u is string => typeof u === "string" && /^https?:\/\/[^\s]+$/.test(u);

/** Lê o JSON que a IA devolveu (aceita texto com cercas de código ao redor). */
export function lerOfertasIA(texto: string): OfertaLoja[] {
  const inicio = texto.indexOf("[");
  const fim = texto.lastIndexOf("]");
  if (inicio < 0 || fim <= inicio) return [];
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto.slice(inicio, fim + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(bruto)) return [];
  const saida: OfertaLoja[] = [];
  for (const o of bruto as Array<Record<string, unknown>>) {
    const preco = typeof o.preco === "number" ? o.preco : typeof o.preco === "string" ? Number(o.preco.replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) : NaN;
    const loja = typeof o.loja === "string" ? o.loja.trim().slice(0, 40) : "";
    if (!loja || !Number.isFinite(preco) || preco <= 0 || preco > 10_000_000) continue;
    saida.push({ loja, titulo: typeof o.titulo === "string" ? o.titulo.slice(0, 120) : "", precoCentavos: Math.round(preco * 100), url: urlOk(o.url) ? o.url : null, fonte: "IA" });
  }
  return saida;
}

/** Junta as ofertas, tira repetidas (mesma loja e preço) e ordena da mais barata. */
export function juntarOfertas(listas: OfertaLoja[][]): OfertaLoja[] {
  const vistas = new Set<string>();
  return listas
    .flat()
    .filter((o) => {
      const k = `${o.loja.toLowerCase()}|${o.precoCentavos}`;
      if (vistas.has(k)) return false;
      vistas.add(k);
      return true;
    })
    .sort((a, b) => a.precoCentavos - b.precoCentavos);
}

export async function buscarEmTodasAsLojas(nome: string, comIA: boolean): Promise<{ ofertas: OfertaLoja[]; erros: string[] }> {
  const erros: string[] = [];
  const ml = await buscarPreco(nome).then((o) => (o ? [{ loja: "Mercado Livre", titulo: o.titulo, precoCentavos: o.precoCentavos, url: o.url || null, fonte: "MERCADO_LIVRE" as const }] : [])).catch((e) => {
    erros.push(`Mercado Livre: ${String(e)}`);
    return [] as OfertaLoja[];
  });
  let ia: OfertaLoja[] = [];
  if (comIA) {
    try {
      const { perguntarIAComBusca } = await import("../../services/gemini");
      const r = await perguntarIAComBusca({
        instrucao: "Você pesquisa preços de produtos em lojas online do Brasil usando a busca do Google. Responda SOMENTE com um array JSON.",
        contexto: "Lojas de interesse: Amazon, Magazine Luiza, Kabum, Americanas, Casas Bahia, Mercado Livre, Shopee, Carrefour, Fast Shop, Ponto, Submarino, Pichau, Terabyte e outras lojas confiáveis do Brasil.",
        pergunta: `Encontre o preço atual de "${nome}" (produto novo) no máximo de lojas brasileiras que conseguir (até 12). Devolva [{"loja":"nome","titulo":"nome do anúncio","preco":1234.56,"url":"link da página do produto"}]. Preço à vista em reais. Não invente: só inclua o que encontrou na busca.`,
      });
      ia = lerOfertasIA(r.texto);
      if (!ia.length) erros.push("A IA não encontrou preços nas lojas (tente um nome mais específico, com marca e modelo).");
    } catch (e) {
      erros.push(`IA: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { ofertas: juntarOfertas([ml, ia]), erros };
}
