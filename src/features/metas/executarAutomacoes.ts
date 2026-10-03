// Executa, com o app aberto, as automações configuradas em Metas → Automação:
// envelopes do salário, sobra do mês para a meta, arredondamento e lembrete mensal.

import { lerPreferencia, salvarPreferencia } from "../../services/armazenamento";
import { contabilidade } from "../../services/contabilidade";
import { extras } from "../../services/extras";
import { planejamento } from "../../services/planejamento";
import type { Meta } from "../../types/extras";
import { arredondamentos, dividirEnvelopes, sobraDoMes } from "./metasAuto";

export interface ConfigDestino {
  meta_id: string;
  conta_origem_id: string | null;
}

async function aportar(meta: Meta | undefined, valor: number, data: string, contaOrigem: string | null): Promise<boolean> {
  if (!meta || valor <= 0) return false;
  if (meta.conta_id && contaOrigem) await planejamento.aportarMetaComConta(meta.id, valor, data, contaOrigem);
  else await extras.aportarMeta(meta.id, valor, data);
  return true;
}

const mesAnterior = (hoje: string) => {
  const [a, m] = hoje.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
};
const real = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/** Devolve as mensagens do que foi feito (para notificar). */
export async function executarAutomacoesMetas(hoje: string): Promise<string[]> {
  const feitos: string[] = [];
  const envelopes = (await lerPreferencia<Array<{ meta_id: string; percentual: number }>>("meta_envelopes")) ?? [];
  const sobra = await lerPreferencia<ConfigDestino>("meta_sobra");
  const arred = await lerPreferencia<ConfigDestino & { base: number }>("meta_arredondar");
  const lembrete = (await lerPreferencia<boolean>("meta_lembrete")) ?? false;
  if (!envelopes.length && !sobra?.meta_id && !arred?.meta_id && !lembrete) return feitos;

  const [metas, contas, lancamentos] = await Promise.all([extras.listarMetas(), contabilidade.listarContas(), contabilidade.listarLancamentos(5000)]);
  const metaPor = new Map(metas.map((m) => [m.id, m]));

  // Envelopes: cada salário novo é dividido nas caixinhas.
  if (envelopes.length) {
    const desde = (await lerPreferencia<string>("meta_envelopes_desde")) ?? hoje;
    const feitosIds = new Set((await lerPreferencia<string[]>("meta_envelopes_processados")) ?? []);
    const estornados = new Set(lancamentos.map((l) => l.estornado_de).filter(Boolean));
    const salarios = lancamentos.filter((l) => l.data >= desde && !feitosIds.has(l.id) && !estornados.has(l.id) && l.partidas.some((p) => p.conta_id === "receita-salario" && p.tipo === "CREDITO"));
    for (const s of salarios) {
      const valor = s.partidas.filter((p) => p.conta_id === "receita-salario" && p.tipo === "CREDITO").reduce((x, p) => x + p.valor_centavos, 0);
      const destino = s.partidas.find((p) => p.tipo === "DEBITO")?.conta_id ?? null;
      for (const parte of dividirEnvelopes(valor, envelopes)) await aportar(metaPor.get(parte.meta_id), parte.valor, s.data, destino);
      feitosIds.add(s.id);
      feitos.push(`Salário de R$ ${real(valor)} dividido nas caixinhas.`);
    }
    await salvarPreferencia("meta_envelopes_processados", [...feitosIds].slice(-200));
  }

  // Sobra do mês anterior vai para a meta (uma vez por mês).
  if (sobra?.meta_id) {
    const mes = mesAnterior(hoje);
    if ((await lerPreferencia<string>("meta_sobra_ultimo")) !== mes) {
      const valor = sobraDoMes(lancamentos, contas, mes);
      if (await aportar(metaPor.get(sobra.meta_id), valor, hoje, sobra.conta_origem_id)) feitos.push(`Sobra de ${mes.split("-").reverse().join("/")} (R$ ${real(valor)}) guardada em ${metaPor.get(sobra.meta_id)?.nome}.`);
      await salvarPreferencia("meta_sobra_ultimo", mes);
    }
  }

  // Arredondamento: guarda a diferença dos gastos desde a última vez (uma vez por dia).
  if (arred?.meta_id) {
    const ultimo = (await lerPreferencia<string>("meta_arredondar_ate")) ?? hoje;
    if (ultimo < hoje) {
      const valor = arredondamentos(lancamentos, contas, ultimo, hoje, arred.base || 1000);
      if (await aportar(metaPor.get(arred.meta_id), valor, hoje, arred.conta_origem_id)) feitos.push(`Arredondamento: R$ ${real(valor)} guardados em ${metaPor.get(arred.meta_id)?.nome}.`);
    }
    await salvarPreferencia("meta_arredondar_ate", hoje);
  }

  // Lembrete mensal do plano de cada meta com prazo.
  if (lembrete && (await lerPreferencia<string>("meta_lembrete_ultimo")) !== hoje.slice(0, 7)) {
    for (const m of metas.filter((x) => x.prazo && x.prazo > hoje && x.guardado_centavos < x.valor_alvo_centavos)) {
      const meses = Math.max(1, (+m.prazo!.slice(0, 4) - +hoje.slice(0, 4)) * 12 + (+m.prazo!.slice(5, 7) - +hoje.slice(5, 7)));
      feitos.push(`Meta ${m.nome}: guarde R$ ${real(Math.ceil((m.valor_alvo_centavos - m.guardado_centavos) / meses))} este mês para chegar até ${m.prazo!.split("-").reverse().join("/")}.`);
    }
    await salvarPreferencia("meta_lembrete_ultimo", hoje.slice(0, 7));
  }
  return feitos;
}
