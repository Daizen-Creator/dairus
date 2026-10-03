import { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Archive, ArchiveRestore, Pencil, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { StatCard } from "../../components/ui/StatCard";
import { investimentos } from "../../services/investimentos";
import { formatarCentavos, formatarDataISOParaBR, primeiroDiaDoMesISO } from "../../services/formato";
import { useThemeStore } from "../../state/theme-store";
import { ROTULO_CLASSE, type AtivoInvest } from "../../types/investimentos";
import { acumularDiario, acumularMensal, concentracoes, dividirPor, rendaPassivaMensal } from "./calculos";
import { totalPorTipo } from "../dashboard/inteligencia";
import { FormAtivo } from "./Formularios";
import { atualizarCotacoesCarteira, serieBcb } from "./mercado";
import type { Carteira } from "./useCarteira";

const pct = (v: number | null, casas = 1) => (v === null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(casas).replace(".", ",")}%`);
const ROTULO_RISCO = { BAIXO: "Baixo", MEDIO: "Médio", ALTO: "Alto" } as const;
const AGRUPAR = [
  { value: "classe", label: "Por tipo" },
  { value: "setor", label: "Por setor" },
  { value: "risco", label: "Por risco" },
  { value: "objetivo", label: "Por objetivo" },
];

export function AbaCarteira({ carteira, onEditar }: { carteira: Carteira; onEditar?: (a: AtivoInvest) => void }) {
  const { posicoes, ops, recarregar, indices, hoje, lancamentos, contas } = carteira;
  const cores = useThemeStore((s) => s.temaAtivo()).cores.grafico;
  const [agrupar, setAgrupar] = useState("classe");
  const [objetivo, setObjetivo] = useState("TODOS");
  const [editando, setEditando] = useState<AtivoInvest | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [verArquivados, setVerArquivados] = useState(false);
  const [bench, setBench] = useState<{ cdi: number | null; ipca: number | null; poupanca: number | null }>({ cdi: null, ipca: null, poupanca: null });

  const objetivos = [...new Set(posicoes.map((p) => p.ativo.objetivo).filter((o): o is string => !!o))];
  const visiveis = posicoes.filter((p) => (verArquivados ? !p.ativo.ativo : p.ativo.ativo)).filter((p) => objetivo === "TODOS" || (p.ativo.objetivo ?? "") === objetivo);
  const comPosicao = visiveis.filter((p) => p.ativo.quantidade > 0);
  const total = comPosicao.reduce((s, p) => s + p.valor, 0);
  const custo = comPosicao.reduce((s, p) => s + p.ativo.custo_centavos, 0);
  const proventos = visiveis.reduce((s, p) => s + p.ativo.proventos_centavos, 0);
  const realizado = visiveis.reduce((s, p) => s + p.ativo.lucro_realizado_centavos, 0);
  const resultado = total - custo + proventos + realizado;
  const renda = rendaPassivaMensal(ops.filter((o) => visiveis.some((p) => p.ativo.id === o.ativo_id)), hoje);
  const inicio = useMemo(() => comPosicao.map((p) => p.ativo.primeira_compra).filter((d): d is string => !!d).sort()[0] ?? null, [comPosicao]);
  // Sobra do mês (receitas - despesas) como valor disponível para investir.
  const ini = primeiroDiaDoMesISO(hoje);
  const sobraMes = totalPorTipo(lancamentos, contas, "RECEITA", ini, hoje) - totalPorTipo(lancamentos, contas, "DESPESA", ini, hoje);

  useEffect(() => {
    if (!inicio) return;
    Promise.all([serieBcb("cdiDiario", inicio, hoje), serieBcb("ipcaMensal", inicio, hoje), serieBcb("poupanca", inicio, hoje)])
      .then(([cdi, ipca, poup]) => setBench({ cdi: cdi.length ? acumularDiario(cdi, inicio, hoje) : null, ipca: ipca.length ? acumularMensal(ipca, inicio, hoje) : null, poupanca: poup.length ? acumularMensal(poup, inicio, hoje) : null }))
      .catch(() => {});
  }, [inicio, hoje]);

  const fatias = dividirPor(
    comPosicao,
    (p) => (agrupar === "classe" ? ROTULO_CLASSE[p.ativo.classe] : agrupar === "setor" ? p.ativo.setor || "Sem setor" : agrupar === "risco" ? (p.ativo.risco ? ROTULO_RISCO[p.ativo.risco] : "Não informado") : p.ativo.objetivo || "Sem objetivo"),
    (p) => p.valor,
  );
  const porAtivo = dividirPor(comPosicao, (p) => p.ativo.codigo, (p) => p.valor);
  const avisos = [...concentracoes(porAtivo, 0.25).map((f) => `${f.chave} é ${pct(f.percentual, 0)} da carteira`), ...concentracoes(dividirPor(comPosicao, (p) => p.ativo.setor || "", (p) => p.valor).filter((f) => f.chave), 0.5).map((f) => `${pct(f.percentual, 0)} está no setor ${f.chave}`)];

  async function atualizar() {
    try {
      setAtualizando(true);
      const r = await atualizarCotacoesCarteira(carteira.ativos);
      await recarregar();
      if (r.falhas.length) toast.warning(`${r.atualizados} cotação(ões) atualizada(s). Sem cotação: ${r.falhas.join(", ")}.`, { duration: 9000 });
      else toast.success(`${r.atualizados} cotação(ões) atualizada(s).`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setAtualizando(false);
    }
  }

  async function arquivar(a: AtivoInvest) {
    try {
      await investimentos.arquivarAtivo(a.id, a.ativo);
      await recarregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  const rentTotal = custo > 0 ? resultado / custo : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard titulo="Valor da carteira" valor={formatarCentavos(total)} subtitulo={`Custo ${formatarCentavos(custo)}`} corIcone="primaria" />
        <StatCard titulo="Resultado total" valor={formatarCentavos(resultado)} corValor={resultado >= 0 ? "sucesso" : "erro"} subtitulo={`${pct(rentTotal)} desde o início (inclui proventos e vendas)`} corIcone="sucesso" />
        <StatCard titulo="Renda passiva (média 12 meses)" valor={formatarCentavos(renda)} subtitulo={`Proventos recebidos: ${formatarCentavos(proventos)}`} corIcone="destaque" />
        <StatCard titulo="Disponível para investir" valor={formatarCentavos(Math.max(0, sobraMes))} subtitulo="Sobra do mês (receitas − despesas)" corIcone="secundaria" />
      </div>

      <Secao titulo="Comparação desde a primeira compra" acao={<span className="text-xs text-texto-secundario">{inicio ? `desde ${formatarDataISOParaBR(inicio)}` : "sem compras"}</span>}>
        <div className="grid gap-3 text-sm sm:grid-cols-4">
          {[["Sua carteira", rentTotal], ["CDI", bench.cdi], ["IPCA", bench.ipca], ["Poupança", bench.poupanca]].map(([nome, v]) => (
            <div key={nome as string} className="rounded-lg border border-borda bg-fundo/50 p-3">
              <p className="text-xs text-texto-secundario">{nome as string}</p>
              <p className={`text-lg font-semibold tabular-nums ${(v as number | null) !== null && (v as number) < 0 ? "text-erro" : "text-texto-primario"}`}>{pct(v as number | null)}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-texto-secundario">
          Índices do Banco Central{indices.fonte === "PADRAO" ? " (sem conexão: valores de referência)" : ""}: Selic {pct(indices.selicAnual, 2)} · CDI {pct(indices.cdiAnual, 2)} · IPCA 12m {pct(indices.ipca12m, 2)}. A rentabilidade da carteira é simples (resultado ÷ custo), não ponderada pelo tempo.
        </p>
      </Secao>

      {avisos.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-alerta/50 bg-alerta/10 px-3 py-2 text-sm text-texto-primario">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-alerta" />
          <span>Concentração: {avisos.join("; ")}. Isso é só um alerta informativo, não uma recomendação.</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Secao
          titulo={`Posições (${comPosicao.length})`}
          acao={
            <div className="flex flex-wrap items-center gap-2">
              {objetivos.length > 0 && <Select aria-label="Objetivo" value={objetivo} onValueChange={setObjetivo} options={[{ value: "TODOS", label: "Todos os objetivos" }, ...objetivos.map((o) => ({ value: o, label: o }))]} className="w-44" />}
              <Button tamanho="pequeno" variante="secundaria" onClick={atualizar} disabled={atualizando}><RefreshCw size={13} className={atualizando ? "animate-spin" : ""} /> Atualizar cotações</Button>
            </div>
          }
        >
          {editando && (
            <div className="mb-4 rounded-lg border border-borda p-3">
              <FormAtivo inicial={editando} onSalvo={() => { setEditando(null); recarregar(); }} onCancelar={() => setEditando(null)} />
            </div>
          )}
          {visiveis.length === 0 ? (
            <p className="text-sm text-texto-secundario">Nenhum ativo {verArquivados ? "arquivado" : "na carteira"}. Use a aba “Lançar” para cadastrar e registrar compras ou importar o extrato da B3.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-texto-secundario">
                  <tr>
                    <th className="py-2 pr-3">Ativo</th>
                    <th className="py-2 pr-3 text-right">Qtd.</th>
                    <th className="py-2 pr-3 text-right">Preço médio</th>
                    <th className="py-2 pr-3 text-right">Cotação</th>
                    <th className="py-2 pr-3 text-right">Valor</th>
                    <th className="py-2 pr-3 text-right">Resultado</th>
                    <th className="py-2 pr-3 text-right">% carteira</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((p) => (
                    <tr key={p.ativo.id} className="border-t border-borda">
                      <td className="py-2 pr-3">
                        <p className="font-medium text-texto-primario">{p.ativo.codigo}</p>
                        <p className="text-[11px] text-texto-secundario">{ROTULO_CLASSE[p.ativo.classe]}{p.ativo.indexador ? ` · ${p.ativo.taxa ?? ""}${p.ativo.indexador === "CDI" || p.ativo.indexador === "SELIC" ? "% " : " "}${p.ativo.indexador}` : ""}{p.ativo.vencimento ? ` · vence ${formatarDataISOParaBR(p.ativo.vencimento)}` : ""}</p>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{p.ativo.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 8 })}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{p.ativo.quantidade > 0 ? formatarCentavos(Math.round(p.ativo.preco_medio * 100)) : "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {p.fonte === "ESTIMATIVA" ? <span className="text-[11px] text-texto-secundario">estimado</span> : p.ativo.cotacao !== null ? formatarCentavos(Math.round(p.ativo.cotacao * 100)) : <span className="text-[11px] text-texto-secundario">sem cotação</span>}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatarCentavos(p.valor)}</td>
                      <td className={`py-2 pr-3 text-right tabular-nums ${p.rent.resultadoTotal >= 0 ? "text-sucesso" : "text-erro"}`}>
                        {formatarCentavos(p.rent.resultadoTotal)}
                        <span className="block text-[11px]">{pct(p.rent.percentual)}</span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{total > 0 ? pct(p.valor / total) : "—"}</td>
                      <td className="py-2 text-right">
                        <button onClick={() => (onEditar ? onEditar(p.ativo) : setEditando(p.ativo))} aria-label={`Editar ${p.ativo.codigo}`} className="rounded p-1 text-texto-secundario hover:text-primaria"><Pencil size={14} /></button>
                        <button onClick={() => arquivar(p.ativo)} aria-label={p.ativo.ativo ? `Arquivar ${p.ativo.codigo}` : `Reativar ${p.ativo.codigo}`} className="rounded p-1 text-texto-secundario hover:text-alerta">{p.ativo.ativo ? <Archive size={14} /> : <ArchiveRestore size={14} />}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button onClick={() => setVerArquivados(!verArquivados)} className="mt-3 text-xs text-primaria hover:underline">{verArquivados ? "Ver ativos da carteira" : "Ver arquivados"}</button>
        </Secao>

        <Secao titulo="Divisão da carteira" acao={<Select aria-label="Agrupar" value={agrupar} onValueChange={setAgrupar} options={AGRUPAR} className="w-36" />}>
          {fatias.length === 0 ? (
            <p className="text-sm text-texto-secundario">Sem posições.</p>
          ) : (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={fatias} dataKey="valor" nameKey="chave" innerRadius={45} outerRadius={80} paddingAngle={2}>
                      {fatias.map((f, i) => <Cell key={f.chave} fill={cores[i % cores.length]} stroke="none" />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatarCentavos(Number(v))} contentStyle={{ background: "var(--cor-cartao)", border: "1px solid var(--cor-borda)", borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {fatias.map((f, i) => (
                  <li key={f.chave} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-texto-secundario"><span className="h-2.5 w-2.5 rounded-full" style={{ background: cores[i % cores.length] }} />{f.chave}</span>
                    <span className="tabular-nums text-texto-primario">{pct(f.percentual)} · {formatarCentavos(f.valor)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Secao>
      </div>
      <p className="text-xs text-texto-secundario">
        O total investido (pelo custo) entra no patrimônio líquido do Dairus pela conta “Carteira de Investimentos”. Valores de renda fixa são estimados pelo indexador; o extrato da corretora é o valor oficial.
      </p>
    </div>
  );
}
