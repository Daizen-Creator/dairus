import { Link } from "react-router-dom";
import { EmptyState } from "../../components/ui/EmptyState";
import { formatarCentavos, formatarDataISOParaBR } from "../../services/formato";
import { degradeDeCor } from "../../services/gradientes";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { categoriaDoLancamento } from "./categoriaIcone";
import type { Conta, Lancamento } from "../../types/accounting";

interface TransacoesRecentesProps {
  lancamentos: Lancamento[];
  contas: Conta[];
}

const COLUNAS = "grid-cols-[84px_minmax(0,1.4fr)_minmax(0,1fr)_104px]";

export function TransacoesRecentes({ lancamentos, contas }: TransacoesRecentesProps) {
  return (
    <div className="rounded-xl border border-borda bg-cartao">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-texto-primario">Transações Recentes</h2>
        <Link to="/lancamentos" className="text-xs text-primaria hover:underline">
          Ver todas →
        </Link>
      </div>
      {lancamentos.length === 0 ? (
        <EmptyState
          titulo="Nenhum lançamento ainda"
          descricao="Registre seu salário ou uma despesa para começar a ver seu histórico aqui."
        />
      ) : (
        <>
          <div className={`grid ${COLUNAS} gap-3 border-b border-borda px-4 pb-2 text-[11px] uppercase tracking-wide text-texto-secundario`}>
            <span>Data</span>
            <span>Descrição</span>
            <span>Categoria</span>
            <span className="text-right">Valor</span>
          </div>
          <ul>
            {lancamentos.slice(0, 6).map((l) => {
              const valorTotal = l.partidas
                .filter((p) => p.tipo === "DEBITO")
                .reduce((soma, p) => soma + p.valor_centavos, 0);
              const categoria = categoriaDoLancamento(l, contas);
              const IconeCategoria = categoria.icone;
              const sinal = categoria.tipo === "RECEITA" ? "+ " : categoria.tipo === "DESPESA" ? "- " : "";
              const corValor =
                categoria.tipo === "RECEITA" ? "text-sucesso" : categoria.tipo === "DESPESA" ? "text-erro" : "text-texto-secundario";
              return (
                <li
                  key={l.id}
                  className={`grid ${COLUNAS} items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-primaria/5`}
                >
                  <span className="text-xs text-texto-secundario">{formatarDataISOParaBR(l.data)}</span>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <IconeCoisa nome={l.descricao} padrao={{ icone: categoria.icone, cor: categoria.cor }} />
                    <span className="truncate text-texto-primario">{l.descricao}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-2 text-xs text-texto-secundario">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
                      style={{ backgroundImage: degradeDeCor(categoria.cor) }}
                    >
                      <IconeCategoria size={11} strokeWidth={2.4} />
                    </span>
                    <span className="truncate">{categoria.nome}</span>
                  </span>
                  <span className={`text-right font-medium tabular-nums ${corValor}`}>
                    {sinal}
                    {formatarCentavos(valorTotal)}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
