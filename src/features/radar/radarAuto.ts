// Radar de Compras automático: busca o menor preço no Mercado Livre (API
// pública de busca), registra no histórico e avisa quando baixa ou chega ao alvo.

import { lerPreferencia, salvarPreferencia } from "../../services/armazenamento";
import { extras } from "../../services/extras";
import { investimentos } from "../../services/investimentos";
import type { ItemRadar } from "../../types/extras";

export interface Oferta {
  titulo: string;
  precoCentavos: number;
  url: string;
}

/** Lê a resposta da busca e devolve a oferta mais barata de produto novo. */
export function menorOferta(json: unknown): Oferta | null {
  const resultados = (json as { results?: Array<{ title?: string; price?: number; permalink?: string; condition?: string }> })?.results ?? [];
  const validos = resultados.filter((r) => typeof r.price === "number" && r.price > 0 && (r.condition ?? "new") === "new");
  if (!validos.length) return null;
  const m = validos.reduce((a, b) => (b.price! < a.price! ? b : a));
  return { titulo: m.title ?? "", precoCentavos: Math.round(m.price! * 100), url: m.permalink ?? "" };
}

export async function buscarPreco(nome: string): Promise<Oferta | null> {
  const json = await investimentos.buscarJson(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(nome)}&limit=20`);
  return menorOferta(json);
}

export async function buscarERegistrar(item: ItemRadar, hoje: string): Promise<{ oferta: Oferta | null; baixou: boolean; noAlvo: boolean }> {
  const oferta = await buscarPreco(item.nome);
  if (!oferta) return { oferta, baixou: false, noAlvo: false };
  const menorAntes = item.precos.length ? Math.min(...item.precos.map((p) => p.preco_centavos)) : null;
  await extras.registrarPrecoRadar(item.id, "Mercado Livre (automático)", oferta.precoCentavos, oferta.url || null, hoje);
  return { oferta, baixou: menorAntes !== null && oferta.precoCentavos < menorAntes, noAlvo: !!item.preco_alvo_centavos && oferta.precoCentavos <= item.preco_alvo_centavos };
}

/** Uma vez por dia, com "buscar sozinho" ligado. Devolve as mensagens para avisar. */
export async function radarAutomatico(hoje: string): Promise<string[]> {
  if (!(await lerPreferencia<boolean>("radar_auto"))) return [];
  if ((await lerPreferencia<string>("radar_auto_ultimo")) === hoje) return [];
  await salvarPreferencia("radar_auto_ultimo", hoje);
  const mensagens: string[] = [];
  const comIA = (await lerPreferencia<boolean>("radar_auto_ia")) === true;
  for (const item of await extras.listarRadar()) {
    try {
      if (comIA) {
        const { buscarEmTodasAsLojas } = await import("./buscaLojas");
        const { ofertas } = await buscarEmTodasAsLojas(item.nome, true);
        const melhor = ofertas[0];
        if (!melhor) continue;
        const menorAntes = item.precos.length ? Math.min(...item.precos.map((p) => p.preco_centavos)) : null;
        await extras.registrarPrecoRadar(item.id, `${melhor.loja} (automático)`, melhor.precoCentavos, melhor.url, hoje);
        const preco = `R$ ${(melhor.precoCentavos / 100).toFixed(2).replace(".", ",")}`;
        if (item.preco_alvo_centavos && melhor.precoCentavos <= item.preco_alvo_centavos) mensagens.push(`${item.nome} chegou ao preço-alvo: ${preco} na ${melhor.loja}.`);
        else if (menorAntes !== null && melhor.precoCentavos < menorAntes) mensagens.push(`${item.nome} baixou para ${preco} na ${melhor.loja}.`);
        continue;
      }
      const r = await buscarERegistrar(item, hoje);
      const preco = r.oferta ? `R$ ${(r.oferta.precoCentavos / 100).toFixed(2).replace(".", ",")}` : "";
      if (r.noAlvo) mensagens.push(`${item.nome} chegou ao preço-alvo: ${preco} no Mercado Livre.`);
      else if (r.baixou) mensagens.push(`${item.nome} baixou para ${preco} no Mercado Livre.`);
    } catch {
      // sem internet ou serviço fora do ar: tenta de novo amanhã
    }
  }
  return mensagens;
}
