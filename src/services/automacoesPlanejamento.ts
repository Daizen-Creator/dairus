// Rotinas de fundo do planejamento: orçamento automático no início do mês e
// avisos de parcela de empréstimo, ritmo do orçamento e radar ligado às metas.

import { lerPreferencia, salvarPreferencia } from "./armazenamento";
import { contabilidade } from "./contabilidade";
import { despesasPorCategoriaNoMes } from "./agregacoes";
import { somarSubcategorias } from "./categorias";
import { extras } from "./extras";
import { formatarCentavos } from "./formato";
import { planejamento } from "./planejamento";
import type { AvisoSistema } from "./avisos";
import { limiteEfetivo, ritmo } from "../features/orcamento/calculoOrcamento";

const mesesAtras = (hoje: string, k: number) => {
  const d = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1 - k, 1));
  const m = d.toISOString().slice(0, 7);
  const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { m, inicio: `${m}-01`, fim };
};
const diasAte = (de: string, ate: string) => Math.round((Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10)) - Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 86_400_000);

/** No primeiro dia em que o app abre no mês, propõe limites pela média dos 3 meses anteriores. */
export async function orcamentoAutomatico(hoje: string): Promise<string | null> {
  if (!(await lerPreferencia<boolean>("orcamento_auto"))) return null;
  const mes = hoje.slice(0, 7);
  if ((await lerPreferencia<string>("orcamento_auto_ultimo")) === mes) return null;
  const [contas, lancamentos, existentes] = await Promise.all([contabilidade.listarContas(), contabilidade.listarLancamentos(5000), planejamento.listarOrcamentosMes()]);
  const somas = new Map<string, number>();
  for (const k of [1, 2, 3]) {
    const p = mesesAtras(hoje, k);
    for (const f of despesasPorCategoriaNoMes(lancamentos, contas, p.inicio, p.fim)) somas.set(f.contaId, (somas.get(f.contaId) ?? 0) + f.valorCentavos);
  }
  let n = 0;
  for (const [id, total] of somas) {
    if (existentes.some((l) => l.categoria_id === id && l.mes === mes)) continue;
    const media = Math.ceil(total / 3 / 1000) * 1000;
    if (media <= 0) continue;
    await planejamento.definirOrcamentoMes(id, mes, media);
    n++;
  }
  await salvarPreferencia("orcamento_auto_ultimo", mes);
  return n ? `Orçamento do mês proposto para ${n} categoria(s) pela média dos últimos 3 meses. Ajuste em Orçamento.` : null;
}

export async function avisosDePlanejamento(hoje: string): Promise<AvisoSistema[]> {
  const avisos: AvisoSistema[] = [];
  const [emprestimos, orcamentos, limitesMes, contas, lancamentos, radar, metas] = await Promise.all([
    planejamento.listarEmprestimos().catch(() => []),
    extras.listarOrcamentos().catch(() => []),
    planejamento.listarOrcamentosMes().catch(() => []),
    contabilidade.listarContas(),
    contabilidade.listarLancamentos(5000),
    extras.listarRadar().catch(() => []),
    extras.listarMetas().catch(() => []),
  ]);

  for (const e of emprestimos) {
    const proxima = e.tabela.find((p) => !e.pagas.includes(p.numero));
    if (!proxima) continue;
    const d = diasAte(hoje, proxima.vencimento);
    if (d === 3 || d === 1 || d === 0 || d < 0) {
      avisos.push({
        id: `emp-${e.id}-${proxima.numero}-${d < 0 ? "atraso" : d}`,
        titulo: d < 0 ? `Parcela ${proxima.numero} de ${e.nome} atrasada` : `Parcela ${proxima.numero} de ${e.nome} vence ${d === 0 ? "hoje" : d === 1 ? "amanhã" : "em 3 dias"}`,
        corpo: `${formatarCentavos(proxima.parcela)} (juros ${formatarCentavos(proxima.juros)}). Registre em Patrimônio → Empréstimos.`,
      });
    }
  }

  // Ritmo do orçamento: avisa uma vez por semana se uma categoria está bem acima do esperado.
  const dia = Number(hoje.slice(8, 10));
  if (dia >= 7) {
    const mes = hoje.slice(0, 7);
    const cache = new Map<string, Map<string, number>>();
    const gasto = (m: string) => {
      if (!cache.has(m)) {
        const [a, mm] = m.split("-").map(Number);
        cache.set(m, somarSubcategorias(new Map(despesasPorCategoriaNoMes(lancamentos, contas, `${m}-01`, `${m}-${String(new Date(a, mm, 0).getDate()).padStart(2, "0")}`).map((f) => [f.contaId, f.valorCentavos])), contas));
      }
      return cache.get(m)!;
    };
    const semana = Math.ceil(dia / 7);
    for (const o of orcamentos) {
      const lim = limiteEfetivo(o.categoria_id, mes, orcamentos, limitesMes, (m) => gasto(m).get(o.categoria_id) ?? 0).efetivo;
      const g = gasto(mes).get(o.categoria_id) ?? 0;
      const r = ritmo(lim, g, hoje);
      if (r && g < lim && r.desvio >= 0.2) {
        const nome = contas.find((c) => c.id === o.categoria_id)?.nome ?? "Categoria";
        avisos.push({ id: `ritmo-${o.categoria_id}-${mes}-${semana}`, titulo: `${nome}: ${Math.round(r.desvio * 100)}% acima do ritmo`, corpo: `Para fechar o mês no limite, dá para gastar ${formatarCentavos(r.porDia)} por dia.` });
      }
    }
  }

  // Radar ligado a metas: o produto da meta chegou ao preço-alvo.
  for (const item of radar.filter((x) => x.meta_id && x.preco_alvo_centavos)) {
    const menor = Math.min(...item.precos.map((p) => p.preco_centavos));
    if (Number.isFinite(menor) && menor <= item.preco_alvo_centavos!) {
      const meta = metas.find((m) => m.id === item.meta_id);
      avisos.push({ id: `radar-meta-${item.id}-${menor}`, titulo: `${item.nome} chegou ao preço-alvo`, corpo: `${formatarCentavos(menor)}${meta ? ` · meta ${meta.nome}: ${formatarCentavos(meta.guardado_centavos)} guardados de ${formatarCentavos(meta.valor_alvo_centavos)}` : ""}.` });
    }
  }
  return avisos;
}
