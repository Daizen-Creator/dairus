import { useCallback, useEffect, useMemo, useState } from "react";
import { contabilidade } from "../../services/contabilidade";
import { investimentos } from "../../services/investimentos";
import { dataAtualISO } from "../../services/formato";
import type { Conta, Lancamento } from "../../types/accounting";
import type { AtivoInvest, OperacaoInvest } from "../../types/investimentos";
import { INDICES_PADRAO, rentabilidade, valorAtual, type Indices, type Rentabilidade } from "./calculos";
import { carregarIndices } from "./mercado";

export interface PosicaoCalculada {
  ativo: AtivoInvest;
  ops: OperacaoInvest[];
  valor: number;
  fonte: "COTACAO" | "ESTIMATIVA" | "CUSTO";
  rent: Rentabilidade;
}

/** Carrega a carteira (ativos, operações, contas, índices) e calcula as posições. */
export function useCarteira() {
  const [ativos, setAtivos] = useState<AtivoInvest[]>([]);
  const [ops, setOps] = useState<OperacaoInvest[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [indices, setIndices] = useState<Indices & { fonte: "BCB" | "PADRAO" }>({ ...INDICES_PADRAO, fonte: "PADRAO" });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const [a, o, c, l] = await Promise.all([investimentos.listarAtivos(), investimentos.listarOperacoes(), contabilidade.listarContas(), contabilidade.listarLancamentos(3000)]);
      setAtivos(a);
      setOps(o);
      setContas(c);
      setLancamentos(l);
      setErro(null);
    } catch (e) {
      setErro(String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    recarregar();
    carregarIndices().then(setIndices).catch(() => {});
  }, [recarregar]);

  const hoje = dataAtualISO();
  const posicoes: PosicaoCalculada[] = useMemo(
    () =>
      ativos.map((a) => {
        const doAtivo = ops.filter((o) => o.ativo_id === a.id);
        const { valor, fonte } = valorAtual(a, doAtivo, indices, hoje);
        return { ativo: a, ops: doAtivo, valor, fonte, rent: rentabilidade(a, valor) };
      }),
    [ativos, ops, indices, hoje],
  );

  return { ativos, ops, contas, lancamentos, indices, posicoes, carregando, erro, recarregar, hoje };
}

export type Carteira = ReturnType<typeof useCarteira>;
