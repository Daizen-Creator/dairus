import { useEffect, useState } from "react";
import { Check, CircleDollarSign, TriangleAlert, Wallet } from "lucide-react";
import { toast } from "sonner";
import { BarraProgresso, CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatCard } from "../../components/ui/StatCard";
import { contabilidade } from "../../services/contabilidade";
import { despesasPorCategoriaNoMes } from "../../services/agregacoes";
import { extras } from "../../services/extras";
import {
  centavosParaValorInput,
  dataAtualISO,
  formatarCentavos,
  nomeMesAno,
  primeiroDiaDoMesISO,
  ultimoDiaDoMesISO,
  valorInputParaCentavos,
} from "../../services/formato";
import { iconeDaCategoria } from "../dashboard/categoriaIcone";
import type { Conta, Lancamento } from "../../types/accounting";
import type { Orcamento } from "../../types/extras";

function corDoUso(pct: number): string {
  if (pct >= 100) return "#ff2d55";
  if (pct >= 80) return "var(--cor-alerta)";
  return "var(--cor-sucesso)";
}

export function OrcamentoPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);

  const hoje = dataAtualISO();
  const inicio = primeiroDiaDoMesISO(hoje);
  const fim = ultimoDiaDoMesISO(hoje);

  async function carregar() {
    try {
      const [c, l, o] = await Promise.all([
        contabilidade.listarContas(),
        contabilidade.listarLancamentos(2000),
        extras.listarOrcamentos(),
      ]);
      setContas(c);
      setLancamentos(l);
      setOrcamentos(o);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvar(categoriaId: string) {
    const texto = rascunhos[categoriaId];
    if (texto === undefined) return;
    try {
      await extras.definirOrcamento(categoriaId, valorInputParaCentavos(texto));
      setRascunhos(({ [categoriaId]: _, ...resto }) => resto);
      toast.success("Orçamento salvo.");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  if (carregando) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const categorias = contas.filter((c) => c.tipo === "DESPESA" && c.subtipo !== "CATEGORIA");
  const gastoPorCategoria = new Map(
    despesasPorCategoriaNoMes(lancamentos, contas, inicio, fim).map((f) => [f.contaId, f.valorCentavos]),
  );
  const limitePorCategoria = new Map(orcamentos.map((o) => [o.categoria_id, o.limite_centavos]));

  const comLimite = categorias.filter((c) => limitePorCategoria.has(c.id));
  const totalOrcado = comLimite.reduce((s, c) => s + (limitePorCategoria.get(c.id) ?? 0), 0);
  const totalGasto = comLimite.reduce((s, c) => s + (gastoPorCategoria.get(c.id) ?? 0), 0);
  const estouradas = comLimite.filter((c) => (gastoPorCategoria.get(c.id) ?? 0) > (limitePorCategoria.get(c.id) ?? 0));
  const semLimiteComGasto = categorias.filter((c) => !limitePorCategoria.has(c.id) && (gastoPorCategoria.get(c.id) ?? 0) > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-texto-primario">Orçamento</h1>
        <p className="text-sm text-texto-secundario">Limites mensais por categoria — {nomeMesAno(hoje)}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard titulo="Total orçado" valor={formatarCentavos(totalOrcado)} icone={Wallet} corIcone="primaria" subtitulo={`${comLimite.length} categoria(s) com limite`} />
        <StatCard titulo="Gasto nas categorias" valor={formatarCentavos(totalGasto)} icone={CircleDollarSign} corIcone="secundaria" subtitulo="Somente categorias com limite" />
        <StatCard
          titulo={totalOrcado - totalGasto >= 0 ? "Disponível" : "Acima do orçado"}
          valor={formatarCentavos(Math.abs(totalOrcado - totalGasto))}
          corValor={totalOrcado - totalGasto >= 0 ? "sucesso" : "erro"}
          icone={Check}
          corIcone="sucesso"
        />
        <StatCard
          titulo="Limites estourados"
          valor={String(estouradas.length)}
          corValor={estouradas.length ? "erro" : "normal"}
          icone={TriangleAlert}
          corIcone="erro"
          subtitulo={estouradas.length ? estouradas.map((c) => c.nome).join(", ") : "Nenhum este mês"}
        />
      </div>

      <Secao titulo="Categorias de despesa">
        {categorias.length === 0 ? (
          <p className="text-sm text-texto-secundario">Nenhuma categoria de despesa cadastrada.</p>
        ) : (
          <ul className="space-y-3">
            {categorias.map((c) => {
              const limite = limitePorCategoria.get(c.id) ?? 0;
              const gasto = gastoPorCategoria.get(c.id) ?? 0;
              const pct = limite > 0 ? (gasto / limite) * 100 : 0;
              const cor = corDoUso(pct);
              const ic = iconeDaCategoria(c.nome);
              const rascunho = rascunhos[c.id];
              return (
                <li
                  key={c.id}
                  className="rounded-xl border px-3.5 py-3"
                  style={{
                    borderColor: limite > 0 ? `color-mix(in srgb, ${cor} 35%, transparent)` : "var(--cor-borda)",
                    boxShadow: limite > 0 ? `0 6px 18px -14px ${cor}` : undefined,
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <IconeCoisa nome={c.nome} tamanho={36} redondo padrao={ic} />
                      <div>
                        <p className="text-sm font-medium text-texto-primario">{c.nome}</p>
                        <p className="text-xs text-texto-secundario">
                          {formatarCentavos(gasto)} gastos
                          {limite > 0 && ` de ${formatarCentavos(limite)} · ${Math.round(pct)}%`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        value={rascunho ?? (limite > 0 ? centavosParaValorInput(limite) : "")}
                        onChange={(e) => setRascunhos((r) => ({ ...r, [c.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && salvar(c.id)}
                        inputMode="decimal"
                        placeholder="Limite (R$)"
                        aria-label={`Limite mensal de ${c.nome}`}
                        className={`${CLASSE_INPUT} w-32`}
                      />
                      <button
                        onClick={() => salvar(c.id)}
                        disabled={rascunho === undefined}
                        className="rounded-lg border border-borda px-3 py-2 text-xs text-texto-secundario transition-colors hover:border-primaria hover:text-primaria disabled:opacity-40"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                  {limite > 0 && (
                    <div className="mt-3">
                      <BarraProgresso percentual={pct} cor={cor} />
                      {pct >= 100 ? (
                        <p className="mt-1.5 text-xs font-medium" style={{ color: cor }}>
                          Limite estourado em {formatarCentavos(gasto - limite)}.
                        </p>
                      ) : pct >= 80 ? (
                        <p className="mt-1.5 text-xs font-medium" style={{ color: cor }}>
                          Atenção: faltam {formatarCentavos(limite - gasto)} para o limite.
                        </p>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {semLimiteComGasto.length > 0 && (
          <p className="mt-4 text-xs text-texto-secundario">
            Sem limite definido mas com gastos este mês: {semLimiteComGasto.map((c) => c.nome).join(", ")}.
          </p>
        )}
        <p className="mt-2 text-xs text-texto-secundario">
          Deixe o campo vazio (ou 0) e salve para remover o limite de uma categoria.
        </p>
      </Secao>
    </div>
  );
}
