// Radar de Compras automático: busca o produto nos comparadores de preço (Zoom, com
// o Buscapé de reserva), que juntam as ofertas de várias lojas (Magazine Luiza, Amazon,
// Casas Bahia, Fast Shop, Mercado Livre, Kabum…). Registra o menor preço no histórico e
// avisa quando baixa ou chega ao alvo.

import { invoke } from "@tauri-apps/api/core";
import { lerPreferencia, salvarPreferencia } from "../../services/armazenamento";
import { extras } from "../../services/extras";
import type { ItemRadar } from "../../types/extras";

export interface Oferta {
  titulo: string;
  precoCentavos: number;
  url: string;
  /** Loja com o menor preço para este produto. */
  loja: string;
  /** Todas as lojas que vendem o produto no comparador. */
  lojas: string[];
  /** De 0 a 1: quanto o nome do produto bate com o que foi buscado. */
  relevancia: number;
}

export interface RespostaComparador {
  fonte: string;
  site: string;
  produtos: unknown[];
}

interface ProdutoComparador {
  name?: string;
  price?: number;
  url?: string;
  type?: string;
  bestOffer?: { merchantName?: string };
  merchants?: Array<{ name?: string }>;
}

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Fração das palavras buscadas que aparecem no nome do produto. */
export function relevancia(busca: string, nome: string): number {
  const palavras = [...new Set(normalizar(busca).split(" ").filter((p) => p.length >= 2))];
  if (!palavras.length) return 0;
  const alvo = ` ${normalizar(nome)} `;
  const achadas = palavras.filter((p) => alvo.includes(` ${p} `) || (p.length >= 4 && alvo.includes(p)));
  return achadas.length / palavras.length;
}

/** Converte a resposta do comparador em ofertas, das mais relevantes e baratas para as outras. */
export function ofertasDoComparador(resposta: RespostaComparador | null | undefined, busca: string): Oferta[] {
  if (!resposta || !Array.isArray(resposta.produtos)) return [];
  const ofertas: Oferta[] = [];
  for (const bruto of resposta.produtos as ProdutoComparador[]) {
    if (!bruto || typeof bruto.price !== "number" || bruto.price <= 0 || !bruto.name) continue;
    const lojas = [...new Set((bruto.merchants ?? []).map((m) => m.name).filter((n): n is string => !!n))];
    const loja = bruto.bestOffer?.merchantName ?? lojas[0] ?? resposta.fonte;
    const url = bruto.url ? (/^https?:\/\//.test(bruto.url) ? bruto.url : `${resposta.site}${bruto.url.startsWith("/") ? "" : "/"}${bruto.url}`) : "";
    ofertas.push({ titulo: bruto.name.trim(), precoCentavos: Math.round(bruto.price * 100), url, loja, lojas: lojas.length ? lojas : [loja], relevancia: relevancia(busca, bruto.name) });
  }
  const melhor = Math.max(0, ...ofertas.map((o) => o.relevancia));
  // Fica só com os que batem quase tanto quanto o melhor (evita acessórios e produtos parecidos).
  return ofertas
    .filter((o) => o.relevancia >= Math.max(0.5, melhor - 0.15))
    .sort((a, b) => b.relevancia - a.relevancia || a.precoCentavos - b.precoCentavos);
}

/** A oferta mais barata entre as mais relevantes. */
export function menorOferta(ofertas: Oferta[]): Oferta | null {
  if (!ofertas.length) return null;
  const topo = ofertas[0].relevancia;
  return ofertas.filter((o) => o.relevancia >= topo - 0.15).reduce((a, b) => (b.precoCentavos < a.precoCentavos ? b : a));
}

export async function buscarOfertas(nome: string): Promise<{ fonte: string; ofertas: Oferta[] }> {
  const resposta = await invoke<RespostaComparador>("buscar_precos_lojas", { termo: nome });
  return { fonte: resposta.fonte, ofertas: ofertasDoComparador(resposta, nome) };
}

export async function buscarPreco(nome: string): Promise<Oferta | null> {
  return menorOferta((await buscarOfertas(nome)).ofertas);
}

/** Nome da loja como fica no histórico do Radar. */
export const lojaDaOferta = (o: Oferta) => `${o.loja} (automático)`;

export async function registrarOferta(item: ItemRadar, oferta: Oferta, hoje: string) {
  await extras.registrarPrecoRadar(item.id, lojaDaOferta(oferta), oferta.precoCentavos, oferta.url || null, hoje);
}

export async function buscarERegistrar(item: ItemRadar, hoje: string): Promise<{ oferta: Oferta | null; ofertas: Oferta[]; baixou: boolean; noAlvo: boolean }> {
  const { ofertas } = await buscarOfertas(item.nome);
  const oferta = menorOferta(ofertas);
  if (!oferta) return { oferta, ofertas, baixou: false, noAlvo: false };
  const menorAntes = item.precos.length ? Math.min(...item.precos.map((p) => p.preco_centavos)) : null;
  await registrarOferta(item, oferta, hoje);
  return { oferta, ofertas, baixou: menorAntes !== null && oferta.precoCentavos < menorAntes, noAlvo: !!item.preco_alvo_centavos && oferta.precoCentavos <= item.preco_alvo_centavos };
}

/** Uma vez por dia, com "buscar sozinho" ligado. Devolve as mensagens para avisar. */
export async function radarAutomatico(hoje: string): Promise<string[]> {
  if (!(await lerPreferencia<boolean>("radar_auto"))) return [];
  if ((await lerPreferencia<string>("radar_auto_ultimo")) === hoje) return [];
  await salvarPreferencia("radar_auto_ultimo", hoje);
  const mensagens: string[] = [];
  for (const item of await extras.listarRadar()) {
    try {
      const r = await buscarERegistrar(item, hoje);
      const preco = r.oferta ? `R$ ${(r.oferta.precoCentavos / 100).toFixed(2).replace(".", ",")}` : "";
      if (r.noAlvo) mensagens.push(`${item.nome} chegou ao preço-alvo: ${preco} na ${r.oferta!.loja}.`);
      else if (r.baixou) mensagens.push(`${item.nome} baixou para ${preco} na ${r.oferta!.loja}.`);
    } catch {
      // sem internet ou serviço fora do ar: tenta de novo amanhã
    }
  }
  return mensagens;
}
