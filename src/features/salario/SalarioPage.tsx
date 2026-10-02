import { useEffect, useState } from "react";
import { Banknote } from "lucide-react";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { EmptyState } from "../../components/ui/EmptyState";
import { StatCard } from "../../components/ui/StatCard";
import { Skeleton, SkeletonLinhas } from "../../components/ui/Skeleton";
import { contabilidade } from "../../services/contabilidade";
import {
  dataAtualISO,
  formatarCentavos,
  formatarDataISOParaBR,
  nomeMesAno,
  primeiroDiaDoMesISO,
  ultimoDiaDoMesISO,
} from "../../services/formato";
import { CONTAS_SISTEMA } from "../../types/accounting";
import { RecebimentoForm } from "./RecebimentoForm";
import type { Conta, Lancamento } from "../../types/accounting";

export function SalarioPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    setCarregando(true);
    const [contasResp, lancamentosResp] = await Promise.all([
      contabilidade.listarContas(),
      contabilidade.listarLancamentos(300),
    ]);
    setContas(contasResp);
    setLancamentos(lancamentosResp);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  if (carregando) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <div className="rounded-xl border border-borda bg-cartao">
          <SkeletonLinhas quantidade={4} />
        </div>
      </div>
    );
  }

  const contasDestino = contas.filter(
    (c) => c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA" && c.id !== CONTAS_SISTEMA.valeAlimentacao,
  );

  const hoje = dataAtualISO();
  const inicioMes = primeiroDiaDoMesISO(hoje);
  const fimMes = ultimoDiaDoMesISO(hoje);

  const recebimentosDoMes = lancamentos.filter(
    (l) => l.origem === "SALARIO" && l.data >= inicioMes && l.data <= fimMes,
  );
  const totalRecebidoNoMes = recebimentosDoMes.reduce(
    (soma, l) => soma + l.partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0),
    0,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-texto-primario">Salário e Renda</h1>

      {contasDestino.length === 0 ? (
        <EmptyState
          titulo="Cadastre uma conta primeiro"
          descricao="Vá em Contas e cadastre a conta bancária onde o salário cai antes de registrar o recebimento."
        />
      ) : (
        <div className="rounded-xl border border-borda bg-cartao p-4">
          <RecebimentoForm contasDestino={contasDestino} onRegistrado={carregar} />
        </div>
      )}

      <StatCard
        titulo={`Total recebido em ${nomeMesAno(hoje)}`}
        valor={formatarCentavos(totalRecebidoNoMes)}
        corValor="sucesso"
      />

      <div className="rounded-xl border border-borda bg-cartao">
        <h2 className="border-b border-borda px-4 py-3 text-sm font-semibold text-texto-primario">
          Histórico de recebimentos
        </h2>
        {recebimentosDoMes.length === 0 && lancamentos.filter((l) => l.origem === "SALARIO").length === 0 ? (
          <EmptyState titulo="Nenhum recebimento ainda" descricao="Registre seu primeiro salário acima." />
        ) : (
          <ul className="divide-y divide-borda">
            {lancamentos
              .filter((l) => l.origem === "SALARIO")
              .slice(0, 20)
              .map((l) => {
                const valorTotal = l.partidas
                  .filter((p) => p.tipo === "DEBITO")
                  .reduce((soma, p) => soma + p.valor_centavos, 0);
                return (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <IconeCoisa nome={l.descricao} tamanho={34} redondo padrao={{ icone: Banknote, cor: "#00d395" }} />
                      <div className="min-w-0">
                        <p className="truncate text-texto-primario">{l.descricao}</p>
                        <p className="text-xs text-texto-secundario">{formatarDataISOParaBR(l.data)}</p>
                      </div>
                    </div>
                    <span className="shrink-0 tabular-nums text-sucesso">{formatarCentavos(valorTotal)}</span>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </div>
  );
}
