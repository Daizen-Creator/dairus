// Dados de exemplo para os testes das telas.
import type { Agendamento, Conta, Lancamento } from "../types/accounting";

export function conta(p: Partial<Conta> & Pick<Conta, "id" | "nome" | "tipo">): Conta {
  return {
    codigo: p.id,
    subtipo: null,
    categoria_pai_id: null,
    instituicao: null,
    saldo_inicial_centavos: 0,
    dia_fechamento_fatura: null,
    dia_vencimento_fatura: null,
    limite_centavos: null,
    sistema: false,
    ativa: true,
    saldo_atual_centavos: 0,
    ...p,
  };
}

export const CONTAS: Conta[] = [
  conta({ id: "ativo-dinheiro", nome: "Dinheiro", tipo: "ATIVO", subtipo: "DINHEIRO", saldo_atual_centavos: 50_000 }),
  conta({ id: "cartao-nu", nome: "Nubank", tipo: "PASSIVO", subtipo: "CARTAO_CREDITO", dia_fechamento_fatura: 5, dia_vencimento_fatura: 12, limite_centavos: 100_000, saldo_atual_centavos: 95_000 }),
  conta({ id: "despesa-alimentacao", nome: "Alimentação", tipo: "DESPESA" }),
  conta({ id: "despesa-transporte", nome: "Transporte", tipo: "DESPESA" }),
  conta({ id: "receita-salario", nome: "Salário", tipo: "RECEITA" }),
];

export function lancamento(p: Partial<Lancamento> & Pick<Lancamento, "id" | "data" | "descricao">, valor = 4590, de = "ativo-dinheiro", para = "despesa-alimentacao"): Lancamento {
  return {
    observacao: null,
    origem: "MANUAL",
    etiqueta: null,
    estornado_de: null,
    parcelas: null,
    corrige: null,
    partidas: [
      { id: `${p.id}-d`, conta_id: para, tipo: "DEBITO", valor_centavos: valor },
      { id: `${p.id}-c`, conta_id: de, tipo: "CREDITO", valor_centavos: valor },
    ],
    ...p,
  };
}

export function agendamento(p: Partial<Agendamento> & Pick<Agendamento, "id" | "descricao" | "vencimento">): Agendamento {
  return { valor_centavos: 10_000, categoria_despesa_id: "despesa-alimentacao", etiqueta: null, lancamento_id: null, pago_em: null, recorrencia: null, tipo: "PAGAR", automatico: false, conta_id: null, reajuste_anual: null, mes_reajuste: null, pessoa: null, ...p };
}
