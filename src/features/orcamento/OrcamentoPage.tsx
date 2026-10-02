import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  PiggyBank,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { BarraProgresso, CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatCard } from "../../components/ui/StatCard";
import { contabilidade } from "../../services/contabilidade";
import { despesasPorCategoriaNoMes } from "../../services/agregacoes";
import { exportarCsv, reais } from "../../services/exportacao";
import { extras } from "../../services/extras";
import {
  centavosParaValorInput,
  dataAtualISO,
  formatarCentavos,
  nomeMesAno,
  valorInputParaCentavos,
} from "../../services/formato";
import { usePreferencia } from "../../state/usePreferencia";
import { iconeDaCategoria } from "../dashboard/categoriaIcone";
import type { Conta, Lancamento } from "../../types/accounting";
import type { Orcamento } from "../../types/extras";

const NECESSIDADES = new Set(["despesa-moradia", "despesa-alimentacao", "despesa-transporte", "despesa-saude", "despesa-educacao"]);
const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type Ordem = "NOME" | "USO" | "GASTO";
type Visao = "TODAS" | "COM_LIMITE" | "ESTOURADAS" | "SEM_LIMITE";

function corDoUso(pct: number): string {
  if (pct >= 100) return "#ff2d55";
  if (pct >= 80) return "var(--cor-alerta)";
  return "var(--cor-sucesso)";
}

/** Primeiro/último dia do mês `deslocamento` meses a partir de hoje. */
function mesRelativo(hoje: string, deslocamento: number) {
  const [a, m] = hoje.split("-").map(Number);
  const d = new Date(a, m - 1 + deslocamento, 1);
  const ano = d.getFullYear();
  const mes = d.getMonth() + 1;
  const mm = String(mes).padStart(2, "0");
  const ultimo = new Date(ano, mes, 0).getDate();
  return { inicio: `${ano}-${mm}-01`, fim: `${ano}-${mm}-${String(ultimo).padStart(2, "0")}`, rotulo: MESES_CURTOS[mes - 1], ano, mes, diasNoMes: ultimo, ref: `${ano}-${mm}-15` };
}

export function OrcamentoPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [deslocamento, setDeslocamento] = useState(0);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("NOME");
  const [visao, setVisao] = useState<Visao>("TODAS");
  const [expandida, setExpandida] = useState<string | null>(null);
  const [novaCategoria, setNovaCategoria] = useState("");
  const [rendaBase, setRendaBase] = usePreferencia<number>("orcamento_renda_base", 0);
  const [rendaTexto, setRendaTexto] = useState("");
  const [confirmarLimpar, setConfirmarLimpar] = useState(false);

  const hoje = dataAtualISO();

  async function carregar() {
    try {
      const [c, l, o] = await Promise.all([contabilidade.listarContas(), contabilidade.listarLancamentos(5000), extras.listarOrcamentos()]);
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

  useEffect(() => {
    setRendaTexto(rendaBase > 0 ? centavosParaValorInput(rendaBase) : "");
  }, [rendaBase]);

  const mes = mesRelativo(hoje, deslocamento);
  const ehMesAtual = deslocamento === 0;
  const diaHoje = Number(hoje.slice(8, 10));
  const diasPassados = ehMesAtual ? diaHoje : deslocamento < 0 ? mes.diasNoMes : 0;

  const categorias = useMemo(() => contas.filter((c) => c.tipo === "DESPESA" && c.subtipo !== "CATEGORIA" && c.ativa), [contas]);

  const gastoMes = useMemo(
    () => new Map(despesasPorCategoriaNoMes(lancamentos, contas, mes.inicio, mes.fim).map((f) => [f.contaId, f.valorCentavos])),
    [lancamentos, contas, mes.inicio, mes.fim],
  );

  // Últimos 6 meses (incluindo o mês exibido) por categoria, para média e histórico.
  const historico = useMemo(() => {
    const meses = Array.from({ length: 6 }, (_, i) => mesRelativo(hoje, deslocamento - 5 + i));
    const porMes = meses.map((m) => new Map(despesasPorCategoriaNoMes(lancamentos, contas, m.inicio, m.fim).map((f) => [f.contaId, f.valorCentavos])));
    return { meses, porMes };
  }, [lancamentos, contas, hoje, deslocamento]);

  const receitaMes = useMemo(() => {
    let r = 0;
    const receitas = new Set(contas.filter((c) => c.tipo === "RECEITA").map((c) => c.id));
    for (const l of lancamentos) {
      if (l.data < mes.inicio || l.data > mes.fim) continue;
      for (const p of l.partidas) if (receitas.has(p.conta_id)) r += p.tipo === "CREDITO" ? p.valor_centavos : -p.valor_centavos;
    }
    return r;
  }, [lancamentos, contas, mes.inicio, mes.fim]);

  if (carregando) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const limite = new Map(orcamentos.map((o) => [o.categoria_id, o.limite_centavos]));
  const media3 = (id: string) => {
    // média dos 3 meses completos anteriores ao mês exibido
    const idx = historico.porMes.length - 1;
    const valores = [1, 2, 3].map((k) => historico.porMes[idx - k]?.get(id) ?? 0);
    return Math.round(valores.reduce((s, v) => s + v, 0) / 3);
  };

  const comLimite = categorias.filter((c) => limite.has(c.id));
  const totalOrcado = comLimite.reduce((s, c) => s + (limite.get(c.id) ?? 0), 0);
  const totalGastoLimitadas = comLimite.reduce((s, c) => s + (gastoMes.get(c.id) ?? 0), 0);
  const totalGasto = categorias.reduce((s, c) => s + (gastoMes.get(c.id) ?? 0), 0);
  const estouradas = comLimite.filter((c) => (gastoMes.get(c.id) ?? 0) > (limite.get(c.id) ?? 0));
  const renda = rendaBase > 0 ? rendaBase : receitaMes;
  const comprometido = renda > 0 ? (totalOrcado / renda) * 100 : 0;
  const poupanca = renda > 0 ? ((renda - totalGasto) / renda) * 100 : null;
  const decorrido = ehMesAtual ? (diaHoje / mes.diasNoMes) * 100 : deslocamento < 0 ? 100 : 0;
  const diasRestantes = ehMesAtual ? mes.diasNoMes - diaHoje : deslocamento > 0 ? mes.diasNoMes : 0;
  const disponivelAgora = totalOrcado - totalGastoLimitadas;
  const porDia = diasRestantes > 0 && disponivelAgora > 0 ? Math.floor(disponivelAgora / diasRestantes) : 0;
  const projecao = ehMesAtual && diasPassados >= 7 ? Math.round((totalGasto / diasPassados) * mes.diasNoMes) : null;
  const maisEconomica = [...comLimite]
    .map((c) => ({ c, pct: (gastoMes.get(c.id) ?? 0) / (limite.get(c.id) ?? 1) }))
    .sort((a, b) => a.pct - b.pct)[0];
  const maiorEstouro = [...estouradas]
    .map((c) => ({ c, excesso: (gastoMes.get(c.id) ?? 0) - (limite.get(c.id) ?? 0) }))
    .sort((a, b) => b.excesso - a.excesso)[0];

  const termo = busca.trim().toLowerCase();
  const lista = categorias
    .filter((c) => !termo || c.nome.toLowerCase().includes(termo))
    .filter((c) => {
      const lim = limite.get(c.id) ?? 0;
      const g = gastoMes.get(c.id) ?? 0;
      if (visao === "COM_LIMITE") return lim > 0;
      if (visao === "SEM_LIMITE") return lim === 0;
      if (visao === "ESTOURADAS") return lim > 0 && g > lim;
      return true;
    })
    .sort((a, b) => {
      const ga = gastoMes.get(a.id) ?? 0;
      const gb = gastoMes.get(b.id) ?? 0;
      if (ordem === "GASTO") return gb - ga;
      if (ordem === "USO") {
        const u = (c: Conta, g: number) => ((limite.get(c.id) ?? 0) > 0 ? g / (limite.get(c.id) ?? 1) : -1);
        return u(b, gb) - u(a, ga);
      }
      return a.nome.localeCompare(b.nome);
    });

  async function salvar(categoriaId: string, centavos?: number) {
    const valor = centavos ?? valorInputParaCentavos(rascunhos[categoriaId] ?? "");
    try {
      await extras.definirOrcamento(categoriaId, valor);
      setRascunhos(({ [categoriaId]: _, ...resto }) => resto);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function aplicarEmLote(entradas: Array<[string, number]>, mensagem: string) {
    try {
      for (const [id, v] of entradas) await extras.definirOrcamento(id, v);
      toast.success(mensagem);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  const sugerir503020 = () => {
    if (renda <= 0) return toast.error("Informe sua renda mensal (ou registre receitas no mês) para gerar a sugestão.");
    const nec = categorias.filter((c) => NECESSIDADES.has(c.id));
    const des = categorias.filter((c) => !NECESSIDADES.has(c.id));
    const entradas: Array<[string, number]> = [
      ...nec.map((c): [string, number] => [c.id, Math.round((renda * 0.5) / Math.max(1, nec.length))]),
      ...des.map((c): [string, number] => [c.id, Math.round((renda * 0.3) / Math.max(1, des.length))]),
    ];
    return aplicarEmLote(entradas, "Sugestão 50/30/20 aplicada: 50% necessidades, 30% desejos; os 20% restantes ficam para poupar.");
  };

  const usarMedias = () => {
    const entradas = categorias.map((c): [string, number] => [c.id, media3(c.id)]).filter(([, v]) => v > 0);
    if (entradas.length === 0) return toast.info("Ainda não há histórico de 3 meses para calcular médias.");
    return aplicarEmLote(entradas, "Limites definidos pela média dos últimos 3 meses.");
  };

  const limparTudo = async () => {
    setConfirmarLimpar(false);
    await aplicarEmLote(comLimite.map((c): [string, number] => [c.id, 0]), "Todos os limites foram removidos.");
  };

  async function criarCategoria(ev: React.FormEvent) {
    ev.preventDefault();
    if (!novaCategoria.trim()) return;
    try {
      await extras.criarCategoria(novaCategoria, "DESPESA");
      setNovaCategoria("");
      toast.success("Categoria criada.");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function arquivarCategoria(c: Conta) {
    try {
      await extras.arquivarConta(c.id, true);
      toast.success(`"${c.nome}" arquivada.`);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function exportar() {
    try {
      const caminho = await exportarCsv(
        `orcamento-${mes.ref.slice(0, 7)}`,
        ["Categoria", "Limite (R$)", "Gasto (R$)", "Uso (%)", "Média 3 meses (R$)"],
        categorias.map((c) => {
          const lim = limite.get(c.id) ?? 0;
          const g = gastoMes.get(c.id) ?? 0;
          return [c.nome, reais(lim), reais(g), lim > 0 ? Math.round((g / lim) * 100) : "", reais(media3(c.id))];
        }),
      );
      toast.success(`Arquivo salvo em ${caminho}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  const grupos = [
    { titulo: "Necessidades", itens: lista.filter((c) => NECESSIDADES.has(c.id)) },
    { titulo: "Desejos e outras", itens: lista.filter((c) => !NECESSIDADES.has(c.id)) },
  ].filter((g) => g.itens.length > 0);

  function renderCategoria(c: Conta) {
    const lim = limite.get(c.id) ?? 0;
    const gasto = gastoMes.get(c.id) ?? 0;
    const pct = lim > 0 ? (gasto / lim) * 100 : 0;
    const cor = corDoUso(pct);
    const ic = iconeDaCategoria(c.nome);
    const rascunho = rascunhos[c.id];
    const ritmoAlto = lim > 0 && ehMesAtual && pct > decorrido + 15 && pct < 100;
    const previsto = ehMesAtual && diasPassados >= 7 ? Math.round((gasto / diasPassados) * mes.diasNoMes) : null;
    const aberta = expandida === c.id;
    const serie = historico.porMes.map((m, i) => ({ rotulo: historico.meses[i].rotulo, v: m.get(c.id) ?? 0 }));
    const maxSerie = Math.max(1, lim, ...serie.map((s) => s.v));
    const custom = !c.sistema;
    return (
      <li
        key={c.id}
        className="rounded-xl border px-3.5 py-3"
        style={{
          borderColor: lim > 0 ? `color-mix(in srgb, ${cor} 35%, transparent)` : "var(--cor-borda)",
          boxShadow: lim > 0 ? `0 6px 18px -14px ${cor}` : undefined,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <IconeCoisa nome={c.nome} tamanho={36} redondo padrao={ic} />
            <div>
              <p className="text-sm font-medium text-texto-primario">{c.nome}</p>
              <p className="text-xs text-texto-secundario">
                {formatarCentavos(gasto)} gastos{lim > 0 && ` de ${formatarCentavos(lim)} · ${Math.round(pct)}%`}
                <span className="ml-2 opacity-80">média 3m {formatarCentavos(media3(c.id))}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              value={rascunho ?? (lim > 0 ? centavosParaValorInput(lim) : "")}
              onChange={(e) => setRascunhos((r) => ({ ...r, [c.id]: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && salvar(c.id)}
              inputMode="decimal"
              placeholder="Limite (R$)"
              aria-label={`Limite mensal de ${c.nome}`}
              className={`${CLASSE_INPUT} w-28`}
            />
            <button onClick={() => salvar(c.id)} disabled={rascunho === undefined} className="rounded-lg border border-borda px-3 py-2 text-xs text-texto-secundario transition-colors hover:border-primaria hover:text-primaria disabled:opacity-40">
              Salvar
            </button>
            <button onClick={() => salvar(c.id, media3(c.id))} disabled={media3(c.id) === 0} title="Usar a média dos últimos 3 meses como limite" aria-label="Usar média" className="rounded-md p-2 text-texto-secundario hover:bg-borda/50 hover:text-primaria disabled:opacity-30">
              <Sparkles size={14} />
            </button>
            <button onClick={() => setExpandida(aberta ? null : c.id)} title="Histórico de 6 meses" aria-label="Histórico" className="rounded-md p-2 text-texto-secundario hover:bg-borda/50 hover:text-primaria">
              {aberta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {custom && (
              <button onClick={() => arquivarCategoria(c)} title="Arquivar categoria (exige saldo zero)" aria-label={`Arquivar ${c.nome}`} className="rounded-md p-2 text-texto-secundario hover:bg-borda/50 hover:text-alerta">
                <Archive size={14} />
              </button>
            )}
          </div>
        </div>

        {lim > 0 && (
          <div className="mt-3">
            <div className="relative">
              <BarraProgresso percentual={pct} cor={cor} />
              {ehMesAtual && <span className="absolute top-[-2px] h-3 w-px bg-texto-secundario/70" style={{ left: `${decorrido}%` }} title="Ponto esperado do mês" />}
            </div>
            {pct >= 100 ? (
              <p className="mt-1.5 text-xs font-medium" style={{ color: cor }}>Limite estourado em {formatarCentavos(gasto - lim)}.</p>
            ) : pct >= 80 ? (
              <p className="mt-1.5 text-xs font-medium" style={{ color: cor }}>Atenção: faltam {formatarCentavos(lim - gasto)} para o limite.</p>
            ) : ritmoAlto ? (
              <p className="mt-1.5 text-xs font-medium text-alerta">Ritmo acima do esperado: já gastou {Math.round(pct)}% com {Math.round(decorrido)}% do mês.</p>
            ) : null}
            {previsto !== null && previsto > lim && pct < 100 && (
              <p className="mt-1 text-xs text-texto-secundario">Estimativa (no ritmo atual): fechar o mês em {formatarCentavos(previsto)}, {formatarCentavos(previsto - lim)} acima do limite.</p>
            )}
          </div>
        )}

        {aberta && (
          <div className="mt-3 border-t border-borda pt-3">
            <div className="flex items-end gap-2" aria-label="Gastos dos últimos 6 meses">
              {serie.map((s, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-texto-secundario">{s.v > 0 ? formatarCentavos(s.v) : ""}</span>
                  <div className="flex h-14 w-full items-end">
                    <div className="w-full rounded-t" style={{ height: `${Math.max(3, (s.v / maxSerie) * 100)}%`, backgroundImage: `linear-gradient(to top, color-mix(in srgb, ${ic.cor} 55%, transparent), ${ic.cor})` }} />
                  </div>
                  <span className="text-[10px] text-texto-secundario">{s.rotulo}</span>
                </div>
              ))}
            </div>
            {previsto !== null && <p className="mt-2 text-xs text-texto-secundario">Estimativa de fechamento do mês (ritmo atual): {formatarCentavos(previsto)}.</p>}
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto-primario">Orçamento</h1>
          <p className="text-sm text-texto-secundario">Limites mensais por categoria. Os limites valem para todos os meses.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-borda bg-cartao px-1.5 py-1">
            <button onClick={() => setDeslocamento((d) => d - 1)} aria-label="Mês anterior" className="rounded-md p-1.5 text-texto-secundario hover:bg-borda/50"><ChevronLeft size={15} /></button>
            <span className="flex min-w-36 items-center justify-center gap-1.5 text-sm font-medium text-texto-primario"><CalendarDays size={14} className="text-secundaria" />{nomeMesAno(mes.ref)}</span>
            <button onClick={() => setDeslocamento((d) => d + 1)} aria-label="Próximo mês" className="rounded-md p-1.5 text-texto-secundario hover:bg-borda/50"><ChevronRight size={15} /></button>
          </div>
          {!ehMesAtual && <Button tamanho="pequeno" variante="fantasma" onClick={() => setDeslocamento(0)}>Mês atual</Button>}
          <Button tamanho="pequeno" variante="secundaria" onClick={exportar}><Download size={13} /> CSV</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard titulo="Total orçado" valor={formatarCentavos(totalOrcado)} icone={Wallet} corIcone="primaria" subtitulo={renda > 0 ? `${comprometido.toFixed(0)}% da renda de ${formatarCentavos(renda)}` : `${comLimite.length} categoria(s) com limite`} />
        <StatCard titulo="Gasto nas categorias" valor={formatarCentavos(totalGastoLimitadas)} icone={CircleDollarSign} corIcone="secundaria" subtitulo={`Total geral do mês: ${formatarCentavos(totalGasto)}`} />
        <StatCard
          titulo={disponivelAgora >= 0 ? "Disponível nos limites" : "Acima do orçado"}
          valor={formatarCentavos(Math.abs(disponivelAgora))}
          corValor={disponivelAgora >= 0 ? "sucesso" : "erro"}
          icone={Check}
          corIcone="sucesso"
          subtitulo={porDia > 0 ? `≈ ${formatarCentavos(porDia)} por dia até o fim do mês` : ehMesAtual ? "Sem folga diária" : ""}
        />
        <StatCard titulo="Limites estourados" valor={String(estouradas.length)} corValor={estouradas.length ? "erro" : "normal"} icone={TriangleAlert} corIcone="erro" subtitulo={estouradas.length ? estouradas.map((c) => c.nome).join(", ") : "Nenhum neste mês"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Secao titulo={<><PiggyBank size={16} className="text-sucesso" /> Renda e poupança</>}>
          <div className="flex flex-wrap items-center gap-2">
            <input value={rendaTexto} onChange={(e) => setRendaTexto(e.target.value)} inputMode="decimal" placeholder="Renda mensal (R$)" aria-label="Renda mensal" className={`${CLASSE_INPUT} w-40`} />
            <Button tamanho="pequeno" variante="secundaria" onClick={() => setRendaBase(valorInputParaCentavos(rendaTexto))}>Salvar renda</Button>
          </div>
          <p className="mt-2 text-xs text-texto-secundario">
            {rendaBase > 0 ? "Usando a renda informada." : `Sem renda informada: usando as receitas do mês (${formatarCentavos(receitaMes)}).`}
          </p>
          {poupanca !== null && (
            <p className={`mt-2 text-sm font-medium ${poupanca >= 20 ? "text-sucesso" : poupanca >= 0 ? "text-alerta" : "text-erro"}`}>
              Taxa de poupança: {poupanca.toFixed(0)}% {poupanca >= 20 ? "— acima da meta de 20%" : poupanca >= 0 ? "— abaixo da meta de 20%" : "— gastou mais do que ganhou"}
            </p>
          )}
        </Secao>
        <Secao titulo="Ritmo do mês">
          <p className="text-sm text-texto-primario">{Math.round(decorrido)}% do mês decorrido · {diasRestantes} dia(s) restantes</p>
          {projecao !== null && (
            <p className="mt-2 text-xs text-texto-secundario">Estimativa (projeção linear do gasto atual): fechar em <strong className="text-texto-primario">{formatarCentavos(projecao)}</strong>{totalOrcado > 0 && ` — ${projecao > totalOrcado ? "acima" : "dentro"} do total orçado`}.</p>
          )}
          {maisEconomica && <p className="mt-2 text-xs text-texto-secundario">Mais econômica: <strong className="text-sucesso">{maisEconomica.c.nome}</strong> ({Math.round(maisEconomica.pct * 100)}% do limite)</p>}
          {maiorEstouro && <p className="mt-1 text-xs text-texto-secundario">Maior estouro: <strong className="text-erro">{maiorEstouro.c.nome}</strong> (+{formatarCentavos(maiorEstouro.excesso)})</p>}
        </Secao>
        <Secao titulo="Atalhos">
          <div className="flex flex-col items-start gap-2">
            <Button tamanho="pequeno" variante="secundaria" onClick={sugerir503020}><Sparkles size={13} /> Sugerir limites 50/30/20</Button>
            <Button tamanho="pequeno" variante="secundaria" onClick={usarMedias}>Usar média dos últimos 3 meses</Button>
            {confirmarLimpar ? (
              <span className="flex items-center gap-2 text-xs"><span className="text-alerta">Remover todos os limites?</span><Button tamanho="pequeno" variante="perigo" onClick={limparTudo}>Remover</Button><Button tamanho="pequeno" variante="fantasma" onClick={() => setConfirmarLimpar(false)}>Cancelar</Button></span>
            ) : (
              <Button tamanho="pequeno" variante="fantasma" onClick={() => setConfirmarLimpar(true)} disabled={comLimite.length === 0}><Trash2 size={13} /> Limpar todos os limites</Button>
            )}
          </div>
          <p className="mt-3 text-[11px] text-texto-secundario">A sugestão 50/30/20 é só um ponto de partida — ajuste à sua realidade.</p>
        </Secao>
      </div>

      <Secao
        titulo="Categorias de despesa"
        acao={
          <form onSubmit={criarCategoria} className="flex items-center gap-2">
            <input value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} placeholder="Nova categoria (ex.: Pets)" aria-label="Nova categoria" className={`${CLASSE_INPUT} w-48 py-1.5`} />
            <Button type="submit" tamanho="pequeno" variante="secundaria" disabled={!novaCategoria.trim()}><Plus size={13} /> Criar</Button>
          </form>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-secundario" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar categoria…" aria-label="Buscar categoria" className={`${CLASSE_INPUT} w-52 pl-8`} />
          </div>
          <Select aria-label="Mostrar" value={visao} onValueChange={(v) => setVisao(v as Visao)} options={[{ value: "TODAS", label: "Todas" }, { value: "COM_LIMITE", label: "Com limite" }, { value: "SEM_LIMITE", label: "Sem limite" }, { value: "ESTOURADAS", label: "Estouradas" }]} className="w-36" />
          <Select aria-label="Ordenar" value={ordem} onValueChange={(v) => setOrdem(v as Ordem)} options={[{ value: "NOME", label: "Ordem alfabética" }, { value: "USO", label: "Maior uso do limite" }, { value: "GASTO", label: "Maior gasto" }]} className="w-48" />
        </div>
        {grupos.length === 0 ? (
          <p className="text-sm text-texto-secundario">Nenhuma categoria encontrada.</p>
        ) : (
          <div className="space-y-5">
            {grupos.map((g) => (
              <div key={g.titulo}>
                <h3 className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wide text-texto-secundario">
                  <span>{g.titulo}</span>
                  <span className="normal-case tracking-normal tabular-nums">{formatarCentavos(g.itens.reduce((s, c) => s + (gastoMes.get(c.id) ?? 0), 0))} gastos · {formatarCentavos(g.itens.reduce((s, c) => s + (limite.get(c.id) ?? 0), 0))} orçados</span>
                </h3>
                <ul className="space-y-3">{g.itens.map((c) => renderCategoria(c))}</ul>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-texto-secundario">Deixe o campo vazio (ou 0) e salve para remover o limite. Categorias criadas por você podem ser arquivadas quando o saldo for zero.</p>
      </Secao>
    </div>
  );
}
