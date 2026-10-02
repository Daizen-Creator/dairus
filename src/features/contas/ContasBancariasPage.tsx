import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Landmark,
  Pencil,
  Plus,
  Scale,
  Search,
  Star,
  TriangleAlert,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Abas, useAbaDaPagina } from "../../components/ui/Abas";
import { BarraProgresso, CLASSE_INPUT } from "../../components/ui/Campos";
import { EmptyState } from "../../components/ui/EmptyState";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatCard } from "../../components/ui/StatCard";
import { contabilidade } from "../../services/contabilidade";
import { exportarCsv, reais } from "../../services/exportacao";
import { extras } from "../../services/extras";
import {
  centavosParaValorInput,
  dataAtualISO,
  formatarCentavos,
  formatarDataISOParaBR,
  primeiroDiaDoMesISO,
  ultimoDiaDoMesISO,
  valorInputParaCentavos,
} from "../../services/formato";
import { razaoDaConta } from "../../services/relatorios";
import { usePreferencia } from "../../state/usePreferencia";
import { NovaContaForm } from "./NovaContaForm";
import type { Agendamento, Conta, Lancamento } from "../../types/accounting";

const SUBTIPOS_CONTA = ["BANCO", "CARTEIRA_DIGITAL", "DINHEIRO", "INVESTIMENTO", "BENEFICIO"];
const ROTULO_SUBTIPO: Record<string, string> = {
  BANCO: "Contas bancárias",
  CARTEIRA_DIGITAL: "Carteiras digitais",
  DINHEIRO: "Dinheiro em espécie",
  INVESTIMENTO: "Investimentos",
  BENEFICIO: "Benefícios (VA/VR)",
};
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type Ordem = "NOME" | "MAIOR" | "MENOR";

function somaMes(base: string, delta: number): { chave: string; rotulo: string; fim: string } {
  const [a, m] = base.split("-").map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  const ano = d.getFullYear();
  const mes = d.getMonth() + 1;
  const ultimo = new Date(ano, mes, 0).getDate();
  return {
    chave: `${ano}-${String(mes).padStart(2, "0")}`,
    rotulo: MESES[mes - 1],
    fim: `${ano}-${String(mes).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`,
  };
}

export function ContasBancariasPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("NOME");
  const [agrupar, setAgrupar] = useState(true);
  const [verArquivadas, setVerArquivadas] = useState(false);
  const [ocultar, setOcultar] = usePreferencia<boolean>("ocultar_saldos", false);
  const [principal, setPrincipal] = usePreferencia<string>("conta_principal", "");
  const [expandida, setExpandida] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [ed, setEd] = useState({ nome: "", instituicao: "" });
  const [ajustando, setAjustando] = useState<string | null>(null);
  const [saldoReal, setSaldoReal] = useState("");
  const [transferindo, setTransferindo] = useState<string | null>(null);
  const [tf, setTf] = useState({ destino: "", valor: "" });
  const [secao, setSecao] = useAbaDaPagina<"contas" | "evolucao">("contas-bancarias", "contas");

  async function carregar() {
    const [c, l, a] = await Promise.all([
      contabilidade.listarContas(),
      contabilidade.listarLancamentos(3000),
      contabilidade.listarAgendamentos(),
    ]);
    setContas(c);
    setLancamentos(l);
    setAgendamentos(a);
    setCarregando(false);
  }

  useEffect(() => {
    carregar().catch((e) => {
      toast.error(String(e));
      setCarregando(false);
    });
  }, []);

  const hoje = dataAtualISO();
  const inicioMes = primeiroDiaDoMesISO(hoje);
  const fimMes = ultimoDiaDoMesISO(hoje);

  const todasContas = contas.filter((c) => c.tipo === "ATIVO" && SUBTIPOS_CONTA.includes(c.subtipo ?? ""));
  const ativas = todasContas.filter((c) => c.ativa);
  const arquivadas = todasContas.filter((c) => !c.ativa);
  const idsAtivas = new Set(ativas.map((c) => c.id));

  // Movimento do mês por conta (entradas/saídas) a partir das partidas.
  const movimentoMes = useMemo(() => {
    const mapa = new Map<string, { entradas: number; saidas: number }>();
    for (const l of lancamentos) {
      if (l.data < inicioMes || l.data > fimMes || l.origem === "SALDO_INICIAL") continue;
      for (const p of l.partidas) {
        const m = mapa.get(p.conta_id) ?? { entradas: 0, saidas: 0 };
        if (p.tipo === "DEBITO") m.entradas += p.valor_centavos;
        else m.saidas += p.valor_centavos;
        mapa.set(p.conta_id, m);
      }
    }
    return mapa;
  }, [lancamentos, inicioMes, fimMes]);

  // Evolução do saldo total das contas ativas nos últimos 12 meses.
  const evolucao = useMemo(() => {
    const meses = Array.from({ length: 12 }, (_, i) => somaMes(hoje.slice(0, 7), i - 11));
    return meses.map((m) => {
      let saldo = 0;
      for (const l of lancamentos) {
        if (l.data > m.fim) continue;
        for (const p of l.partidas) {
          if (idsAtivas.has(p.conta_id)) saldo += p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos;
        }
      }
      return { nome: m.rotulo, Saldo: saldo / 100 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancamentos, contas]);

  if (carregando) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-borda bg-cartao p-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-3 h-6 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const dinheiro = (centavos: number) => (ocultar ? "R$ ••••" : formatarCentavos(centavos));
  const saldoTotal = ativas.reduce((s, c) => s + c.saldo_atual_centavos, 0);
  const aPagar = agendamentos.filter((a) => !a.pago_em).reduce((s, a) => s + a.valor_centavos, 0);
  const maior = [...ativas].sort((a, b) => b.saldo_atual_centavos - a.saldo_atual_centavos)[0];
  const negativas = ativas.filter((c) => c.saldo_atual_centavos < 0);
  const entradasMes = ativas.reduce((s, c) => s + (movimentoMes.get(c.id)?.entradas ?? 0), 0);
  const saidasMes = ativas.reduce((s, c) => s + (movimentoMes.get(c.id)?.saidas ?? 0), 0);

  const termo = busca.trim().toLowerCase();
  const base = verArquivadas ? arquivadas : ativas;
  const filtradas = base
    .filter((c) => !termo || `${c.nome} ${c.instituicao ?? ""}`.toLowerCase().includes(termo))
    .sort((a, b) => {
      if (a.id === principal) return -1;
      if (b.id === principal) return 1;
      if (ordem === "MAIOR") return b.saldo_atual_centavos - a.saldo_atual_centavos;
      if (ordem === "MENOR") return a.saldo_atual_centavos - b.saldo_atual_centavos;
      return a.nome.localeCompare(b.nome);
    });

  const grupos: Array<{ titulo: string | null; contas: Conta[] }> = agrupar
    ? Object.keys(ROTULO_SUBTIPO)
        .map((sub) => ({ titulo: ROTULO_SUBTIPO[sub], contas: filtradas.filter((c) => c.subtipo === sub) }))
        .filter((g) => g.contas.length > 0)
    : [{ titulo: null, contas: filtradas }];

  async function salvarEdicao(c: Conta) {
    try {
      await extras.atualizarConta(c.id, ed.nome, ed.instituicao || null, c.limite_centavos, c.dia_fechamento_fatura, c.dia_vencimento_fatura);
      toast.success("Conta atualizada.");
      setEditando(null);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function arquivar(c: Conta, arquivar: boolean) {
    try {
      await extras.arquivarConta(c.id, arquivar);
      toast.success(arquivar ? `"${c.nome}" arquivada.` : `"${c.nome}" reativada.`);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  // Conciliação: diferença entre o saldo real (extrato do banco) e o do Dairus vira um
  // lançamento de ajuste contra o patrimônio (não infla receita nem despesa).
  async function ajustarSaldo(c: Conta) {
    const alvo = valorInputParaCentavos(saldoReal);
    const diferenca = alvo - c.saldo_atual_centavos;
    if (!saldoReal.trim() || diferenca === 0) {
      toast.info("O saldo informado já é o saldo do Dairus.");
      return;
    }
    const valor = Math.abs(diferenca);
    try {
      await contabilidade.criarLancamento({
        data: dataAtualISO(),
        descricao: `Ajuste de saldo — ${c.nome}`,
        observacao: `Conciliação: saldo informado ${formatarCentavos(alvo)}, saldo anterior ${formatarCentavos(c.saldo_atual_centavos)}.`,
        partidas:
          diferenca > 0
            ? [
                { conta_id: c.id, tipo: "DEBITO", valor_centavos: valor },
                { conta_id: "patrimonio-saldo-inicial", tipo: "CREDITO", valor_centavos: valor },
              ]
            : [
                { conta_id: "patrimonio-saldo-inicial", tipo: "DEBITO", valor_centavos: valor },
                { conta_id: c.id, tipo: "CREDITO", valor_centavos: valor },
              ],
      });
      toast.success("Saldo ajustado.");
      setAjustando(null);
      setSaldoReal("");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function transferir(c: Conta) {
    const valor = valorInputParaCentavos(tf.valor);
    if (!tf.destino || valor <= 0) {
      toast.error("Escolha o destino e informe o valor.");
      return;
    }
    try {
      await contabilidade.registrarTransferencia({
        conta_origem_id: c.id,
        conta_destino_id: tf.destino,
        valor_centavos: valor,
        data: dataAtualISO(),
        descricao: `Transferência: ${c.nome} → ${contas.find((x) => x.id === tf.destino)?.nome ?? ""}`,
      });
      toast.success("Transferência registrada.");
      setTransferindo(null);
      setTf({ destino: "", valor: "" });
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function exportar() {
    try {
      const caminho = await exportarCsv(
        "contas",
        ["Conta", "Tipo", "Instituição", "Saldo (R$)", "Entradas no mês (R$)", "Saídas no mês (R$)"],
        ativas.map((c) => [
          c.nome,
          ROTULO_SUBTIPO[c.subtipo ?? ""] ?? "",
          c.instituicao ?? "",
          reais(c.saldo_atual_centavos),
          reais(movimentoMes.get(c.id)?.entradas ?? 0),
          reais(movimentoMes.get(c.id)?.saidas ?? 0),
        ]),
      );
      toast.success(`Arquivo salvo em ${caminho}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  function renderConta(conta: Conta) {
    const mov = movimentoMes.get(conta.id) ?? { entradas: 0, saidas: 0 };
    const pct = saldoTotal > 0 ? Math.max(0, (conta.saldo_atual_centavos / saldoTotal) * 100) : 0;
    const negativa = conta.saldo_atual_centavos < 0;
    const cor = negativa ? "#ff2d55" : "var(--cor-primaria)";
    const aberta = expandida === conta.id;
    const extrato = aberta ? razaoDaConta(lancamentos, conta, "0000-01-01", "9999-12-31").linhas.slice(-12).reverse() : [];
    const protegida = conta.sistema;
    return (
      <li
        key={conta.id}
        className="rounded-xl border bg-cartao p-4"
        style={{
          borderColor: `color-mix(in srgb, ${cor} 35%, transparent)`,
          backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${cor} 11%, transparent), transparent 60%)`,
          boxShadow: `0 8px 24px -18px ${cor}`,
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <IconeCoisa nome={`${conta.nome} ${conta.instituicao ?? ""}`} tamanho={40} redondo padrao={{ icone: Landmark, cor: "#1677ff" }} />
            <div className="min-w-0">
              {editando === conta.id ? (
                <div className="space-y-1.5">
                  <input value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} aria-label="Nome" className={`${CLASSE_INPUT} w-full py-1`} />
                  <input value={ed.instituicao} onChange={(e) => setEd({ ...ed, instituicao: e.target.value })} placeholder="Instituição" aria-label="Instituição" className={`${CLASSE_INPUT} w-full py-1`} />
                </div>
              ) : (
                <>
                  <p className="truncate text-sm font-semibold text-texto-primario">{conta.nome}</p>
                  <p className="truncate text-xs text-texto-secundario">{conta.instituicao ?? ROTULO_SUBTIPO[conta.subtipo ?? ""] ?? "—"}</p>
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center">
            <button onClick={() => setPrincipal(principal === conta.id ? "" : conta.id)} title={principal === conta.id ? "Remover como principal" : "Marcar como conta principal"} aria-label="Conta principal" className="rounded-md p-1.5 hover:bg-borda/50">
              <Star size={14} className={principal === conta.id ? "fill-alerta text-alerta" : "text-texto-secundario"} />
            </button>
            {!protegida && (
              <button onClick={() => { setEditando(conta.id); setEd({ nome: conta.nome, instituicao: conta.instituicao ?? "" }); }} title="Editar" aria-label={`Editar ${conta.nome}`} className="rounded-md p-1.5 text-texto-secundario hover:bg-borda/50 hover:text-primaria">
                <Pencil size={14} />
              </button>
            )}
            {!protegida && (
              <button onClick={() => arquivar(conta, conta.ativa)} title={conta.ativa ? "Arquivar (exige saldo zero)" : "Reativar"} aria-label={conta.ativa ? "Arquivar" : "Reativar"} className="rounded-md p-1.5 text-texto-secundario hover:bg-borda/50 hover:text-alerta">
                {conta.ativa ? <Archive size={14} /> : <ArchiveRestore size={14} />}
              </button>
            )}
          </div>
        </div>

        {editando === conta.id && (
          <div className="mt-2 flex gap-2">
            <Button tamanho="pequeno" onClick={() => salvarEdicao(conta)}>Salvar</Button>
            <Button tamanho="pequeno" variante="fantasma" onClick={() => setEditando(null)}>Cancelar</Button>
          </div>
        )}

        <p className={`mt-3 text-xl font-bold tabular-nums ${negativa ? "text-erro" : "text-texto-primario"}`}>{dinheiro(conta.saldo_atual_centavos)}</p>
        {negativa && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-erro">
            <TriangleAlert size={12} /> Saldo negativo
          </p>
        )}
        <div className="mt-2 flex gap-4 text-xs tabular-nums">
          <span className="text-sucesso">▲ {dinheiro(mov.entradas)}</span>
          <span className="text-erro">▼ {dinheiro(mov.saidas)}</span>
          <span className="text-texto-secundario">no mês</span>
        </div>
        {conta.ativa && saldoTotal > 0 && (
          <div className="mt-2">
            <BarraProgresso percentual={pct} cor={cor} altura={5} />
            <p className="mt-1 text-[11px] text-texto-secundario">{pct.toFixed(0)}% do saldo total</p>
          </div>
        )}

        {conta.ativa && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button tamanho="pequeno" variante="secundaria" onClick={() => { setTransferindo(transferindo === conta.id ? null : conta.id); setAjustando(null); setTf({ destino: ativas.find((x) => x.id !== conta.id)?.id ?? "", valor: "" }); }}>
              <ArrowLeftRight size={13} /> Transferir
            </Button>
            <Button tamanho="pequeno" variante="secundaria" onClick={() => { setAjustando(ajustando === conta.id ? null : conta.id); setTransferindo(null); setSaldoReal(centavosParaValorInput(conta.saldo_atual_centavos)); }}>
              <Scale size={13} /> Ajustar saldo
            </Button>
            <button onClick={() => setExpandida(aberta ? null : conta.id)} className="ml-auto flex items-center gap-1 text-xs text-primaria hover:underline">
              Extrato {aberta ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          </div>
        )}

        {transferindo === conta.id && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-borda pt-3">
            <Select aria-label="Conta de destino" value={tf.destino} onValueChange={(v) => setTf({ ...tf, destino: v })} options={ativas.filter((x) => x.id !== conta.id).map((x) => ({ value: x.id, label: x.nome }))} className="w-40" />
            <input value={tf.valor} onChange={(e) => setTf({ ...tf, valor: e.target.value })} inputMode="decimal" placeholder="Valor (R$)" aria-label="Valor" className={`${CLASSE_INPUT} w-28`} />
            <Button tamanho="pequeno" onClick={() => transferir(conta)}>Confirmar</Button>
          </div>
        )}

        {ajustando === conta.id && (
          <div className="mt-3 space-y-2 border-t border-borda pt-3">
            <p className="text-xs text-texto-secundario">Informe o saldo real que aparece no extrato do banco. A diferença é lançada como ajuste de patrimônio (não conta como receita nem despesa).</p>
            <div className="flex items-center gap-2">
              <input value={saldoReal} onChange={(e) => setSaldoReal(e.target.value)} inputMode="decimal" aria-label="Saldo real" className={`${CLASSE_INPUT} w-32`} />
              <Button tamanho="pequeno" onClick={() => ajustarSaldo(conta)}>Ajustar</Button>
            </div>
          </div>
        )}

        {aberta && (
          <div className="mt-3 border-t border-borda pt-3">
            {extrato.length === 0 ? (
              <p className="text-xs text-texto-secundario">Sem movimentações.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {extrato.map((l) => {
                  const sinal = l.debito > 0 ? 1 : -1;
                  const v = l.debito > 0 ? l.debito : l.credito;
                  return (
                    <li key={l.lancamento.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-texto-secundario">
                        {formatarDataISOParaBR(l.lancamento.data).slice(0, 5)} · <span className="text-texto-primario">{l.lancamento.descricao}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        <span className={sinal > 0 ? "text-sucesso" : "text-erro"}>
                          {sinal > 0 ? "+" : "−"} {dinheiro(v)}
                        </span>
                        <span className="ml-2 text-texto-secundario">{dinheiro(l.saldo)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-texto-primario">
          <Landmark size={22} className="text-primaria" /> Contas Bancárias
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button variante="secundaria" tamanho="pequeno" onClick={() => setOcultar(!ocultar)} aria-label="Ocultar ou mostrar saldos">
            {ocultar ? <EyeOff size={14} /> : <Eye size={14} />} {ocultar ? "Mostrar saldos" : "Ocultar saldos"}
          </Button>
          <Button variante="secundaria" tamanho="pequeno" onClick={exportar} disabled={ativas.length === 0}>
            <Download size={14} /> CSV
          </Button>
          {!mostrarFormulario && (
            <Button onClick={() => setMostrarFormulario(true)}>
              <Plus size={16} /> Nova conta
            </Button>
          )}
        </div>
      </div>

      {mostrarFormulario && (
        <NovaContaForm
          categoriaFixa="conta"
          onCriada={() => {
            setMostrarFormulario(false);
            carregar();
          }}
          onCancelar={() => setMostrarFormulario(false)}
        />
      )}

      {ativas.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard titulo="Saldo total" valor={dinheiro(saldoTotal)} icone={Wallet} corIcone="primaria" subtitulo={`${ativas.length} conta(s) ativa(s)`} />
            <StatCard titulo="Saldo após contas a pagar" valor={dinheiro(saldoTotal - aPagar)} corValor={saldoTotal - aPagar < 0 ? "erro" : "normal"} icone={Scale} corIcone="alerta" subtitulo={`${dinheiro(aPagar)} agendados`} />
            <StatCard titulo="Entradas / saídas do mês" valor={dinheiro(entradasMes - saidasMes)} corValor={entradasMes - saidasMes < 0 ? "erro" : "sucesso"} icone={ArrowLeftRight} corIcone="sucesso" subtitulo={`▲ ${dinheiro(entradasMes)}  ▼ ${dinheiro(saidasMes)}`} />
            <StatCard titulo="Maior saldo" valor={maior ? dinheiro(maior.saldo_atual_centavos) : "—"} icone={Landmark} corIcone="secundaria" subtitulo={negativas.length ? `${negativas.length} conta(s) no negativo` : (maior?.nome ?? "")} />
          </div>

          {secao === "evolucao" && (
          <section className="rounded-xl border border-borda bg-cartao p-4">
            <h2 className="text-sm font-semibold text-texto-primario">Evolução do saldo total (12 meses)</h2>
            <div className="mt-2 h-40">
              {ocultar ? (
                <p className="pt-12 text-center text-sm text-texto-secundario">Saldos ocultos.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={evolucao}>
                    <defs>
                      <linearGradient id="gSaldo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1677ff" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#1677ff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="nome" tick={{ fontSize: 10, fill: "var(--cor-texto-secundario)" }} axisLine={false} tickLine={false} />
                    <YAxis hide domain={["auto", "auto"]} />
                    <Tooltip formatter={(v) => formatarCentavos(Math.round(Number(v) * 100))} contentStyle={{ background: "var(--cor-superficie)", border: "1px solid var(--cor-borda)", borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="Saldo" stroke="#1677ff" strokeWidth={2.5} fill="url(#gSaldo)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
          )}
        </>
      )}

      <Abas ativa={secao} onChange={setSecao} abas={[{ id: "contas", rotulo: "Contas", icone: Landmark, contador: undefined }, { id: "evolucao", rotulo: "Evolução do saldo", icone: TrendingUp }]} />

      {secao === "contas" && (<>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-secundario" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conta…" aria-label="Buscar conta" className={`${CLASSE_INPUT} w-56 pl-8`} />
        </div>
        <Select aria-label="Ordenar" value={ordem} onValueChange={(v) => setOrdem(v as Ordem)} options={[{ value: "NOME", label: "Ordem alfabética" }, { value: "MAIOR", label: "Maior saldo" }, { value: "MENOR", label: "Menor saldo" }]} className="w-44" />
        <label className="flex items-center gap-1.5 text-xs text-texto-secundario">
          <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--cor-primaria)]" />
          Agrupar por tipo
        </label>
        {arquivadas.length > 0 && (
          <button onClick={() => setVerArquivadas((v) => !v)} className="text-xs text-primaria hover:underline">
            {verArquivadas ? "Ver contas ativas" : `Ver arquivadas (${arquivadas.length})`}
          </button>
        )}
      </div>

      {filtradas.length === 0 ? (
        <EmptyState
          titulo={base.length === 0 ? (verArquivadas ? "Nenhuma conta arquivada" : "Nenhuma conta cadastrada") : "Nenhuma conta encontrada"}
          descricao={base.length === 0 ? "Cadastre sua conta bancária, carteira digital ou dinheiro em espécie para começar a lançar movimentações." : "Ajuste a busca."}
        />
      ) : (
        <div className="space-y-5">
          {grupos.map((g) => (
            <section key={g.titulo ?? "todas"}>
              {g.titulo && (
                <h2 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-texto-secundario">
                  <span>{g.titulo}</span>
                  <span className="normal-case tracking-normal tabular-nums">{dinheiro(g.contas.reduce((s, c) => s + c.saldo_atual_centavos, 0))}</span>
                </h2>
              )}
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {g.contas.map((c) => (
                  renderConta(c)
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      </>)}
    </div>
  );
}
