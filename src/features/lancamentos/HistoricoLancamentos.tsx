import { useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { ChevronDown, ChevronRight, Copy, Download, FilterX, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT } from "../../components/ui/Campos";
import { EmptyState } from "../../components/ui/EmptyState";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { exportarCsv, reais } from "../../services/exportacao";
import { extras } from "../../services/extras";
import { centavosParaValorInput, dataAtualISO, formatarCentavos, formatarDataISOParaBR, valorInputParaCentavos } from "../../services/formato";
import type { Conta, Lancamento } from "../../types/accounting";
import { iconeDaCategoria } from "../dashboard/categoriaIcone";
import { calcularPeriodo, SeletorPeriodo, type Periodo } from "../dashboard/SeletorPeriodo";
import { SeloEtiqueta, SeloStatus, type StatusPagamento } from "./Selos";
import { OPCOES_ETIQUETA } from "./opcoesEtiqueta";
import {
  aplicarFiltros,
  filtrosAtivos,
  FILTROS_PADRAO,
  totalizar,
  type AnaliseLancamento,
  type Filtros,
  type Ordem,
  type TipoLancamento,
} from "./analise";

const VERMELHO_VIVO = "#ff2d55";

const ORIGENS_LEGIVEIS: Record<string, string> = {
  MANUAL: "Manual",
  SALARIO: "Recebimento",
  CARTAO: "Cartão",
  FATURA: "Fatura",
  TRANSFERENCIA: "Transferência",
  SALDO_INICIAL: "Saldo inicial",
  ESTORNO: "Estorno",
};

const TIPOS: Array<{ value: TipoLancamento | "TODOS"; label: string }> = [
  { value: "TODOS", label: "Todos os tipos" },
  { value: "RECEITA", label: "Receitas" },
  { value: "DESPESA", label: "Despesas" },
  { value: "TRANSFERENCIA", label: "Transferências" },
  { value: "FATURA", label: "Pagamentos de fatura" },
  { value: "OUTRO", label: "Outros (saldo inicial)" },
];

const ORDENS: Array<{ value: Ordem; label: string }> = [
  { value: "RECENTES", label: "Mais recentes" },
  { value: "ANTIGOS", label: "Mais antigos" },
  { value: "MAIOR", label: "Maior valor" },
  { value: "MENOR", label: "Menor valor" },
];

type ItemLista =
  | { tipo: "dia"; data: string; entradas: number; saidas: number }
  | { tipo: "lanc"; l: Lancamento; a: AnaliseLancamento };

interface HistoricoProps {
  lancamentos: Lancamento[];
  contas: Conta[];
  onAlterado: () => void;
  onDuplicar: (l: Lancamento, a: AnaliseLancamento) => void;
}

export function HistoricoLancamentos({ lancamentos, contas, onAlterado, onDuplicar }: HistoricoProps) {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_PADRAO);
  const [periodo, setPeriodo] = useState<Periodo | null>(null);
  const [agruparPorDia, setAgruparPorDia] = useState(true);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<string | null>(null);
  const [edDescricao, setEdDescricao] = useState("");
  const [edObs, setEdObs] = useState("");
  const [edEtiqueta, setEdEtiqueta] = useState("NENHUMA");
  const [corrigindo, setCorrigindo] = useState<string | null>(null);
  const [crValor, setCrValor] = useState("");
  const [crData, setCrData] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [confirmarLote, setConfirmarLote] = useState(false);
  const buscaRef = useRef<HTMLInputElement>(null);

  const contaPorId = useMemo(() => new Map(contas.map((c) => [c.id, c])), [contas]);
  const idsEstornados = useMemo(
    () => new Set(lancamentos.map((l) => l.estornado_de).filter((id): id is string => !!id)),
    [lancamentos],
  );

  const f = { ...filtros, inicio: periodo?.inicio ?? null, fim: periodo?.fim ?? null };
  const itens = useMemo(
    () => aplicarFiltros(lancamentos, contaPorId, f, idsEstornados),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lancamentos, contaPorId, idsEstornados, filtros, periodo],
  );
  const totais = totalizar(itens);
  const nFiltros = filtrosAtivos(f);

  // Atalho "/" foca a busca; Esc limpa o texto quando a busca está em foco.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      const digitando = alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable;
      if (e.key === "/" && !digitando) {
        e.preventDefault();
        buscaRef.current?.focus();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  const lista: ItemLista[] = useMemo(() => {
    if (!agruparPorDia || (filtros.ordem !== "RECENTES" && filtros.ordem !== "ANTIGOS")) {
      return itens.map(({ l, a }) => ({ tipo: "lanc", l, a }));
    }
    const saida: ItemLista[] = [];
    let atual: Extract<ItemLista, { tipo: "dia" }> | null = null;
    for (const { l, a } of itens) {
      if (!atual || atual.data !== l.data) {
        atual = { tipo: "dia", data: l.data, entradas: 0, saidas: 0 };
        saida.push(atual);
      }
      if (a.entrada) atual.entradas += a.valorCentavos;
      else if (a.saida) atual.saidas += a.valorCentavos;
      saida.push({ tipo: "lanc", l, a });
    }
    return saida;
  }, [itens, agruparPorDia, filtros.ordem]);

  function mudar<K extends keyof Filtros>(chave: K, valor: Filtros[K]) {
    setFiltros((s) => ({ ...s, [chave]: valor }));
  }

  function limpar() {
    setFiltros(FILTROS_PADRAO);
    setPeriodo(null);
  }

  function alternar(conjunto: Set<string>, id: string): Set<string> {
    const novo = new Set(conjunto);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    return novo;
  }

  function iniciarEdicao(l: Lancamento) {
    setEditando(l.id);
    setEdDescricao(l.descricao);
    setEdObs(l.observacao ?? "");
    setEdEtiqueta(l.etiqueta ?? "NENHUMA");
  }

  async function salvarEdicao(l: Lancamento) {
    try {
      await extras.atualizarLancamentoInfo(l.id, edDescricao, edObs || null, edEtiqueta === "NENHUMA" ? null : edEtiqueta);
      toast.success("Lançamento atualizado.");
      setEditando(null);
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  function iniciarCorrecao(l: Lancamento) {
    setCorrigindo(l.id);
    setEditando(null);
    const total = l.partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0);
    setCrValor(centavosParaValorInput(total));
    setCrData(l.data);
  }

  async function salvarCorrecao(l: Lancamento) {
    const centavos = valorInputParaCentavos(crValor);
    if (centavos <= 0 || !crData) return toast.error("Informe o valor e a data corretos.");
    try {
      await contabilidade.corrigirLancamento({ lancamento_id: l.id, nova_data: crData, novo_valor_centavos: centavos });
      toast.success("Lançamento corrigido (o original foi estornado na data dele).");
      setCorrigindo(null);
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function estornar(id: string) {
    try {
      await contabilidade.estornarLancamento(id);
      toast.success("Lançamento estornado.");
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function estornarLote() {
    let feitos = 0;
    try {
      for (const id of selecionados) {
        await contabilidade.estornarLancamento(id);
        feitos++;
      }
      toast.success(`${feitos} lançamento(s) estornado(s).`);
    } catch (e) {
      toast.error(`${String(e)} — ${feitos} já tinham sido estornados.`);
    } finally {
      setSelecionados(new Set());
      setConfirmarLote(false);
      onAlterado();
    }
  }

  async function exportar() {
    try {
      const caminho = await exportarCsv(
        "historico",
        ["Data", "Descrição", "Tipo", "Categoria", "Contas", "Etiqueta", "Valor (R$)", "Observação"],
        itens.map(({ l, a }) => [
          formatarDataISOParaBR(l.data),
          l.descricao,
          a.tipo,
          a.categoria?.nome ?? "",
          a.contasEnvolvidas.map((c) => c.nome).join(" / "),
          l.etiqueta ?? "",
          `${a.saida ? "-" : ""}${reais(a.valorCentavos)}`,
          l.observacao ?? "",
        ]),
      );
      toast.success(`Arquivo salvo em ${caminho}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  const categorias = contas.filter((c) => (c.tipo === "DESPESA" || c.tipo === "RECEITA") && c.subtipo !== "CATEGORIA");
  const contasMov = contas.filter((c) => (c.tipo === "ATIVO" || c.tipo === "PASSIVO") && c.subtipo !== "CATEGORIA");

  return (
    <section className="rounded-xl border border-borda bg-cartao">
      <div className="space-y-3 border-b border-borda px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-texto-primario">
            Histórico{" "}
            <span className="font-normal text-texto-secundario">
              ({itens.length === lancamentos.length ? itens.length : `${itens.length} de ${lancamentos.length}`})
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-texto-secundario">
              <input type="checkbox" checked={agruparPorDia} onChange={(e) => setAgruparPorDia(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--cor-primaria)]" />
              Agrupar por dia
            </label>
            <label className="flex items-center gap-1.5 text-xs text-texto-secundario">
              <input type="checkbox" checked={filtros.mostrarEstornados} onChange={(e) => mudar("mostrarEstornados", e.target.checked)} className="h-3.5 w-3.5 accent-[var(--cor-primaria)]" />
              Mostrar estornados
            </label>
            <Button tamanho="pequeno" variante="secundaria" onClick={exportar} disabled={itens.length === 0}>
              <Download size={13} /> CSV
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative lg:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-secundario" />
            <input
              ref={buscaRef}
              value={filtros.texto}
              onChange={(e) => mudar("texto", e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && mudar("texto", "")}
              placeholder="Buscar por descrição, observação ou categoria  ( / )"
              aria-label="Buscar lançamentos"
              className={`${CLASSE_INPUT} w-full pl-8`}
            />
          </div>
          <Select aria-label="Tipo" value={filtros.tipo} onValueChange={(v) => mudar("tipo", v as Filtros["tipo"])} options={TIPOS} />
          <Select aria-label="Ordenar por" value={filtros.ordem} onValueChange={(v) => mudar("ordem", v as Ordem)} options={ORDENS} />
          <Select
            aria-label="Categoria"
            value={filtros.categoriaId}
            onValueChange={(v) => mudar("categoriaId", v)}
            options={[{ value: "TODAS", label: "Todas as categorias" }, ...categorias.map((c) => ({ value: c.id, label: c.nome }))]}
          />
          <Select
            aria-label="Conta"
            value={filtros.contaId}
            onValueChange={(v) => mudar("contaId", v)}
            options={[{ value: "TODAS", label: "Todas as contas" }, ...contasMov.map((c) => ({ value: c.id, label: c.nome }))]}
          />
          <Select
            aria-label="Etiqueta"
            value={filtros.etiqueta}
            onValueChange={(v) => mudar("etiqueta", v as Filtros["etiqueta"])}
            options={[
              { value: "TODAS", label: "Todas as etiquetas" },
              ...OPCOES_ETIQUETA.filter((o) => o.value !== "NENHUMA"),
              { value: "NENHUMA", label: "Sem etiqueta" },
            ]}
          />
          <div className="flex items-center gap-2">
            {periodo ? (
              <SeletorPeriodo periodo={periodo} hoje={dataAtualISO()} onChange={setPeriodo} />
            ) : (
              <Button variante="secundaria" className="w-full" onClick={() => setPeriodo(calcularPeriodo("este-mes", dataAtualISO()))}>
                Filtrar por período
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-4 tabular-nums">
            <span className="text-texto-secundario">Entradas <strong className="text-sucesso">{formatarCentavos(totais.entradas)}</strong></span>
            <span className="text-texto-secundario">Saídas <strong style={{ color: VERMELHO_VIVO }}>{formatarCentavos(totais.saidas)}</strong></span>
            <span className="text-texto-secundario">Saldo <strong className={totais.saldo < 0 ? "text-erro" : "text-texto-primario"}>{formatarCentavos(totais.saldo)}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            {selecionados.size > 0 &&
              (confirmarLote ? (
                <span className="flex items-center gap-2">
                  <span className="text-alerta">Estornar {selecionados.size} lançamento(s)?</span>
                  <Button tamanho="pequeno" variante="perigo" onClick={estornarLote}>Confirmar</Button>
                  <Button tamanho="pequeno" variante="fantasma" onClick={() => setConfirmarLote(false)}>Cancelar</Button>
                </span>
              ) : (
                <>
                  <Button tamanho="pequeno" variante="secundaria" onClick={() => setConfirmarLote(true)}>
                    Estornar selecionados ({selecionados.size})
                  </Button>
                  <Button tamanho="pequeno" variante="fantasma" onClick={() => setSelecionados(new Set())}>Limpar seleção</Button>
                </>
              ))}
            {nFiltros > 0 && (
              <Button tamanho="pequeno" variante="fantasma" onClick={limpar}>
                <FilterX size={13} /> Limpar {nFiltros} filtro(s)
              </Button>
            )}
          </div>
        </div>
      </div>

      {itens.length === 0 ? (
        <div className="p-4">
          <EmptyState
            titulo={lancamentos.length === 0 ? "Nenhum lançamento ainda" : "Nenhum lançamento com esses filtros"}
            descricao={lancamentos.length === 0 ? "Seus lançamentos aparecerão aqui." : "Ajuste ou limpe os filtros para ver mais resultados."}
          />
        </div>
      ) : (
        <Virtuoso
          style={{ height: "max(360px, calc(100vh - 560px))" }}
          data={lista}
          itemContent={(_, item) => {
            if (item.tipo === "dia") {
              return (
                <div className="flex items-center justify-between px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-texto-secundario">
                  <span>{formatarDataISOParaBR(item.data)}</span>
                  <span className="tabular-nums normal-case tracking-normal">
                    {item.entradas > 0 && <span className="text-sucesso">+ {formatarCentavos(item.entradas)} </span>}
                    {item.saidas > 0 && <span style={{ color: VERMELHO_VIVO }}>− {formatarCentavos(item.saidas)}</span>}
                  </span>
                </div>
              );
            }
            const { l, a } = item;
            const jaEstornado = idsEstornados.has(l.id);
            const cor = a.entrada ? "var(--cor-sucesso)" : a.saida ? VERMELHO_VIVO : "var(--cor-primaria)";
            const corValor = a.entrada ? "text-sucesso" : a.saida ? "text-erro" : "text-texto-primario";
            const sinal = a.entrada ? "+ " : a.saida ? "− " : "";
            const status: StatusPagamento | null = a.estorno
              ? "ESTORNO"
              : jaEstornado
                ? "ESTORNADO"
                : a.tipo === "RECEITA"
                  ? "RECEBIDO"
                  : a.tipo === "DESPESA"
                    ? "PAGO"
                    : null;
            const aberto = abertos.has(l.id);
            const emEdicao = editando === l.id;
            const podeSelecionar = !a.estorno && !jaEstornado && a.tipo !== "OUTRO";
            return (
              <div className="px-3 py-1.5">
                <div
                  className="rounded-xl border px-3.5 py-3"
                  style={{
                    borderColor: `color-mix(in srgb, ${cor} 28%, transparent)`,
                    backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${cor} 9%, transparent), transparent 55%)`,
                    boxShadow: `0 6px 18px -14px ${cor}`,
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <input
                        type="checkbox"
                        disabled={!podeSelecionar}
                        checked={selecionados.has(l.id)}
                        onChange={() => setSelecionados((s) => alternar(s, l.id))}
                        aria-label={`Selecionar ${l.descricao}`}
                        className="h-4 w-4 shrink-0 accent-[var(--cor-primaria)] disabled:opacity-30"
                      />
                      <IconeCoisa
                        nome={l.descricao}
                        tamanho={38}
                        redondo
                        padrao={a.categoria ? iconeDaCategoria(a.categoria.nome) : undefined}
                      />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-texto-primario">
                          <span className="truncate">{l.descricao}</span>
                          {l.parcelas && <span className="rounded bg-borda/60 px-1.5 text-[10px] text-texto-secundario">{l.parcelas}x</span>}
                          {l.corrige && <span className="rounded bg-borda/60 px-1.5 text-[10px] text-texto-secundario">corrigido</span>}
                          <SeloEtiqueta etiqueta={l.etiqueta} />
                          {status && <SeloStatus status={status} />}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-texto-secundario">
                          {formatarDataISOParaBR(l.data)} · {ORIGENS_LEGIVEIS[l.origem] ?? l.origem}
                          {a.categoria && ` · ${a.categoria.nome}`}
                          {a.contasEnvolvidas.length > 0 && ` · ${a.contasEnvolvidas.map((c) => c.nome).join(" → ")}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className={`mr-1 text-base font-bold tabular-nums ${corValor}`}>
                        {sinal}
                        {formatarCentavos(a.valorCentavos)}
                      </span>
                      {!a.estorno && a.tipo === "DESPESA" && (
                        <button onClick={() => onDuplicar(l, a)} title="Duplicar como nova despesa" aria-label="Duplicar" className="rounded-md p-1.5 text-texto-secundario transition-colors hover:bg-borda/50 hover:text-primaria">
                          <Copy size={14} />
                        </button>
                      )}
                      <button onClick={() => (emEdicao ? setEditando(null) : iniciarEdicao(l))} title="Editar descrição, observação e etiqueta" aria-label="Editar" className="rounded-md p-1.5 text-texto-secundario transition-colors hover:bg-borda/50 hover:text-primaria">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setAbertos((s) => alternar(s, l.id))} title="Ver partidas contábeis" aria-label="Detalhes" className="rounded-md p-1.5 text-texto-secundario transition-colors hover:bg-borda/50 hover:text-primaria">
                        {aberto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                      {!a.estorno && !jaEstornado && l.origem !== "SALDO_INICIAL" && (
                        <button onClick={() => (corrigindo === l.id ? setCorrigindo(null) : iniciarCorrecao(l))} className="ml-1 text-xs text-texto-secundario transition-colors hover:text-primaria hover:underline" title="Corrigir valor ou data">
                          Corrigir
                        </button>
                      )}
                      {!a.estorno && !jaEstornado && (
                        <button onClick={() => estornar(l.id)} className="ml-1 text-xs text-texto-secundario transition-colors hover:text-erro hover:underline" title="Estornar este lançamento">
                          Estornar
                        </button>
                      )}
                    </div>
                  </div>

                  {emEdicao && (
                    <div className="mt-3 grid grid-cols-1 gap-2 border-t border-borda pt-3 sm:grid-cols-[2fr_2fr_1fr_auto]">
                      <input value={edDescricao} onChange={(e) => setEdDescricao(e.target.value)} aria-label="Descrição" className={CLASSE_INPUT} />
                      <input value={edObs} onChange={(e) => setEdObs(e.target.value)} placeholder="Observação" aria-label="Observação" className={CLASSE_INPUT} />
                      <Select aria-label="Etiqueta" value={edEtiqueta} onValueChange={setEdEtiqueta} options={OPCOES_ETIQUETA} />
                      <div className="flex gap-2">
                        <Button tamanho="pequeno" onClick={() => salvarEdicao(l)}>Salvar</Button>
                        <Button tamanho="pequeno" variante="fantasma" onClick={() => setEditando(null)}>Cancelar</Button>
                      </div>
                      <p className="text-[11px] text-texto-secundario sm:col-span-4">
                        Para mudar valor ou data, use “Corrigir”: o app estorna o original e lança o certo sozinho.
                      </p>
                    </div>
                  )}

                  {corrigindo === l.id && (
                    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-borda pt-3">
                      <label className="text-[11px] text-texto-secundario">
                        Valor correto
                        <input value={crValor} onChange={(e) => setCrValor(e.target.value)} inputMode="decimal" aria-label="Valor correto" className={`${CLASSE_INPUT} mt-1 block w-32`} />
                      </label>
                      <label className="text-[11px] text-texto-secundario">
                        Data correta
                        <input type="date" value={crData} onChange={(e) => setCrData(e.target.value)} aria-label="Data correta" className={`${CLASSE_INPUT} mt-1 block`} />
                      </label>
                      <Button tamanho="pequeno" onClick={() => salvarCorrecao(l)}>Salvar correção</Button>
                      <Button tamanho="pequeno" variante="fantasma" onClick={() => setCorrigindo(null)}>Cancelar</Button>
                      {l.parcelas && <p className="w-full text-[11px] text-texto-secundario">Compra em {l.parcelas}x: o novo valor é o total, dividido nas mesmas parcelas.</p>}
                    </div>
                  )}

                  {aberto && (
                    <div className="mt-3 space-y-1 border-t border-borda pt-3 text-xs">
                      {l.observacao && <p className="mb-2 text-texto-secundario">Obs.: {l.observacao}</p>}
                      {l.partidas.map((p) => (
                        <div key={p.id} className={`flex justify-between ${p.tipo === "CREDITO" ? "pl-6" : ""}`}>
                          <span className="text-texto-secundario">
                            {p.tipo === "DEBITO" ? "Débito" : "Crédito"} · {contaPorId.get(p.conta_id)?.nome ?? p.conta_id}
                          </span>
                          <span className="tabular-nums text-texto-primario">{formatarCentavos(p.valor_centavos)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          }}
        />
      )}
    </section>
  );
}
