import { createContext, useContext } from "react";
import type { Agendamento, Conta, Lancamento } from "../../../types/accounting";
import type { Meta, Orcamento } from "../../../types/extras";
import type { ConfigWidget } from "../layoutWidgets";

/** Dados que os widgets do Início usam (carregados uma vez pelo painel). */
export interface DadosPainel {
  contas: Conta[];
  lancamentos: Lancamento[];
  agendamentos: Agendamento[];
  metas: Meta[];
  orcamentos: Orcamento[];
  hoje: string;
  dinheiro: (centavos: number) => string;
}

export const ContextoDados = createContext<DadosPainel | null>(null);

export function useDadosPainel(): DadosPainel {
  const d = useContext(ContextoDados);
  if (!d) throw new Error("Widget fora do painel");
  return d;
}

/** Configuração da instância do widget (título próprio, esconder título) para as molduras. */
export interface InstanciaWidget {
  i: string;
  config: ConfigWidget;
  configurar: (c: ConfigWidget) => void;
}

export const ContextoInstancia = createContext<InstanciaWidget | null>(null);
export const useInstancia = () => useContext(ContextoInstancia);
