// Avisos automáticos no Windows: contas vencendo (3 dias, 1 dia, hoje),
// contas atrasadas, fatura fechando amanhã ou vencendo, limite do cartão,
// orçamento estourado e saldo negativo. Cada aviso tem um id estável e só é
// mostrado uma vez por dia.

import { calcularCiclo } from "../features/contas/ciclo";
import { despesasPorCategoriaNoMes } from "./agregacoes";
import { somarSubcategorias } from "./categorias";
import { formatarCentavos, primeiroDiaDoMesISO, ultimoDiaDoMesISO } from "./formato";
import type { Agendamento, Conta, Lancamento } from "../types/accounting";
import type { Orcamento } from "../types/extras";

export interface AvisoSistema {
  id: string;
  titulo: string;
  corpo: string;
}

export interface EntradaAvisos {
  hoje: string;
  contas: Conta[];
  agendamentos: Agendamento[];
  lancamentos: Lancamento[];
  orcamentos: Orcamento[];
  /** Com quantos dias de antecedência avisar das contas (padrão 3, 1 e no dia). */
  diasAntes?: number[];
}

function diasEntre(de: string, ate: string): number {
  const ms = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return Math.round((ms(ate) - ms(de)) / 86_400_000);
}

export function calcularAvisos(e: EntradaAvisos): AvisoSistema[] {
  const avisos: AvisoSistema[] = [];
  const r = formatarCentavos;

  for (const a of e.agendamentos.filter((x) => !x.pago_em && x.tipo === "RECEBER" && !x.automatico)) {
    const d = diasEntre(e.hoje, a.vencimento);
    if (d === 0) avisos.push({ id: `receber-${a.id}`, titulo: `${a.descricao} previsto para hoje`, corpo: `${r(a.valor_centavos)} · confirme o recebimento no Dairus.` });
    else if (d < 0 && d >= -7) avisos.push({ id: `receber-atraso-${a.id}`, titulo: `${a.descricao} ainda não confirmado`, corpo: `${r(a.valor_centavos)} previsto para ${a.vencimento.split("-").reverse().join("/")}.` });
  }
  for (const a of e.agendamentos.filter((x) => !x.pago_em && x.tipo !== "RECEBER")) {
    const d = diasEntre(e.hoje, a.vencimento);
    if ((e.diasAntes ?? [3, 1, 0]).includes(d)) {
      const quando = d === 0 ? "vence hoje" : d === 1 ? "vence amanhã" : `vence em ${d} dias`;
      avisos.push({ id: `venc-${a.id}-${d}`, titulo: `${a.descricao} ${quando}`, corpo: `${r(a.valor_centavos)} · abra o Dairus para marcar como paga.` });
    } else if (d < 0) {
      avisos.push({ id: `atraso-${a.id}`, titulo: `${a.descricao} está atrasada`, corpo: `${r(a.valor_centavos)} venceu há ${-d} dia(s).` });
    }
  }

  for (const c of e.contas.filter((x) => x.tipo === "PASSIVO" && x.subtipo === "CARTAO_CREDITO" && x.ativa)) {
    if (c.dia_fechamento_fatura && c.dia_vencimento_fatura) {
      const ciclo = calcularCiclo(c.dia_fechamento_fatura, c.dia_vencimento_fatura, e.hoje);
      if (ciclo.diasParaFechar === 1) {
        avisos.push({ id: `fecha-${c.id}-${ciclo.proximoFechamento}`, titulo: `A fatura do ${c.nome} fecha amanhã`, corpo: "Compras de amanhã em diante caem na fatura do mês que vem." });
      }
      if (c.saldo_atual_centavos > 0 && (ciclo.diasParaVencer === 3 || ciclo.diasParaVencer === 1 || ciclo.diasParaVencer === 0)) {
        const quando = ciclo.diasParaVencer === 0 ? "vence hoje" : ciclo.diasParaVencer === 1 ? "vence amanhã" : "vence em 3 dias";
        avisos.push({ id: `fatura-${c.id}-${ciclo.proximoVencimento}-${ciclo.diasParaVencer}`, titulo: `Fatura do ${c.nome} ${quando}`, corpo: `Saldo devedor de ${r(c.saldo_atual_centavos)}.` });
      }
    }
    const limite = c.limite_centavos ?? 0;
    if (limite > 0 && c.saldo_atual_centavos > limite) {
      avisos.push({ id: `estouro-${c.id}`, titulo: `Limite do ${c.nome} estourado`, corpo: `${r(c.saldo_atual_centavos)} usados de ${r(limite)}.` });
    } else if (limite > 0 && c.saldo_atual_centavos >= limite * 0.9) {
      avisos.push({ id: `limite90-${c.id}`, titulo: `${c.nome}: mais de 90% do limite usado`, corpo: `Disponível: ${r(limite - c.saldo_atual_centavos)}.` });
    }
  }

  const inicio = primeiroDiaDoMesISO(e.hoje);
  const fim = ultimoDiaDoMesISO(e.hoje);
  const gasto = somarSubcategorias(new Map(despesasPorCategoriaNoMes(e.lancamentos, e.contas, inicio, fim).map((f) => [f.contaId, f.valorCentavos])), e.contas);
  const nome = new Map(e.contas.map((c) => [c.id, c.nome]));
  for (const o of e.orcamentos) {
    const g = gasto.get(o.categoria_id) ?? 0;
    if (o.limite_centavos > 0 && g > o.limite_centavos) {
      avisos.push({ id: `orc-${o.categoria_id}-${inicio}`, titulo: `Orçamento de ${nome.get(o.categoria_id) ?? "categoria"} estourado`, corpo: `${r(g)} gastos de ${r(o.limite_centavos)} neste mês.` });
    }
  }

  for (const c of e.contas.filter((x) => x.tipo === "ATIVO" && x.subtipo !== "CATEGORIA" && x.ativa && x.saldo_atual_centavos < 0)) {
    avisos.push({ id: `negativo-${c.id}`, titulo: `${c.nome} está com saldo negativo`, corpo: `Saldo: ${r(c.saldo_atual_centavos)}.` });
  }
  return avisos;
}

/** Filtra o que ainda não foi avisado hoje e devolve o registro atualizado (guarda só 45 dias). */
export function filtrarNovos(
  avisos: AvisoSistema[],
  enviados: Record<string, string>,
  hoje: string,
): { novos: AvisoSistema[]; registro: Record<string, string> } {
  const registro: Record<string, string> = {};
  for (const [id, dia] of Object.entries(enviados)) if (diasEntre(dia, hoje) <= 45) registro[id] = dia;
  const novos = avisos.filter((a) => registro[a.id] !== hoje);
  for (const a of novos) registro[a.id] = hoje;
  return { novos, registro };
}

/** Texto do ícone da bandeja: saldo disponível e a próxima conta a pagar. */
export function textoDaBandeja(contas: Conta[], agendamentos: Agendamento[], hoje: string): string {
  const saldo = contas.filter((c) => c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA" && c.ativa).reduce((s, c) => s + c.saldo_atual_centavos, 0);
  const proxima = agendamentos.filter((a) => !a.pago_em && a.tipo !== "RECEBER" && a.vencimento >= hoje).sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
  const linhas = [`Dairus · saldo ${formatarCentavos(saldo)}`];
  if (proxima) linhas.push(`Próxima: ${proxima.descricao} ${proxima.vencimento.slice(8, 10)}/${proxima.vencimento.slice(5, 7)} (${formatarCentavos(proxima.valor_centavos)})`);
  return linhas.join("\n");
}

/** Grupo do aviso (pelo id), para o usuário escolher o que quer receber. */
export function grupoDoAviso(id: string): string {
  if (/^(venc|atraso|receber)/.test(id)) return "contas";
  if (/^(fecha|fatura|limite|teto)/.test(id)) return "cartoes";
  if (/^(orc|orcamento|ritmo)/.test(id)) return "orcamento";
  if (/^(meta|desafio)/.test(id)) return "metas";
  if (/^(invest|cotacao|aporte|darf|vencimento-rf|alerta)/.test(id)) return "investimentos";
  if (/^cobranca/.test(id)) return "pessoas";
  if (/^backup/.test(id)) return "backup";
  if (/^documento/.test(id)) return "documentos";
  if (/^(saldo|minimo|risco|negativo)/.test(id)) return "saldo";
  return "outros";
}

/** Dentro do horário silencioso? (ex.: 22 às 7, atravessando a meia-noite) */
export function emHorarioSilencioso(hora: number, inicio: number, fim: number): boolean {
  if (inicio === fim) return false;
  return inicio < fim ? hora >= inicio && hora < fim : hora >= inicio || hora < fim;
}
