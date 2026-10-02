import { useEffect, useMemo, useState } from "react";
import {
  Bike,
  BookOpen,
  Download,
  Flag,
  Home,
  Pencil,
  Plane,
  PiggyBank,
  ShieldPlus,
  ShoppingBag,
  Target,
  Trash2,
  Wallet,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { BarraProgresso, CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { EmptyState } from "../../components/ui/EmptyState";
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
import type { AporteComMeta, AporteMeta, Meta } from "../../types/extras";

const TIPOS: Record<string, { rotulo: string; icone: LucideIcon; cor: string }> = {
  RESERVA: { rotulo: "Reserva de emergência", icone: ShieldPlus, cor: "#00d395" },
  VIAGEM: { rotulo: "Viagem", icone: Plane, cor: "#00d9ff" },
  COMPRA: { rotulo: "Compra", icone: ShoppingBag, cor: "#ec4899" },
  EDUCACAO: { rotulo: "Educação", icone: BookOpen, cor: "#a855f7" },
  CASA: { rotulo: "Casa", icone: Home, cor: "#eab308" },
  VEICULO: { rotulo: "Veículo", icone: Bike, cor: "#1677ff" },
  OUTRA: { rotulo: "Outra", icone: Target, cor: "#8a8aff" },
};
const PRIORIDADES: Record<string, { rotulo: string; cor: string; peso: number }> = {
  ALTA: { rotulo: "Alta", cor: "#ff2d55", peso: 0 },
  MEDIA: { rotulo: "Média", cor: "#f59e0b", peso: 1 },
  BAIXA: { rotulo: "Baixa", cor: "#00d9ff", peso: 2 },
};

type Ordem = "PRAZO" | "PROGRESSO" | "NOME" | "PRIORIDADE";
type Visao = "ATIVAS" | "CONCLUIDAS" | "TODAS";

function mesesAte(prazo: string, hoje: string): number {
  const [a1, m1] = hoje.split("-").map(Number);
  const [a2, m2] = prazo.split("-").map(Number);
  return Math.max(1, (a2 - a1) * 12 + (m2 - m1));
}

function mesISO(dataISO: string, delta: number): string {
  const [a, m] = dataISO.split("-").map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface Formulario {
  nome: string;
  alvo: string;
  prazo: string;
  tipo: string;
  prioridade: string;
  notas: string;
}
const FORM_VAZIO: Formulario = { nome: "", alvo: "", prazo: "", tipo: "OUTRA", prioridade: "MEDIA", notas: "" };

export function MetasPage() {
  const [metas, setMetas] = useState<Meta[]>([]);
  const [aportesTodos, setAportesTodos] = useState<AporteComMeta[]>([]);
  const [saldoDisponivel, setSaldoDisponivel] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<Formulario>(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edForm, setEdForm] = useState<Formulario>(FORM_VAZIO);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [datas, setDatas] = useState<Record<string, string>>({});
  const [historicoAberto, setHistoricoAberto] = useState<string | null>(null);
  const [aportesMeta, setAportesMeta] = useState<AporteMeta[]>([]);
  const [movendo, setMovendo] = useState<string | null>(null);
  const [mv, setMv] = useState({ destino: "", valor: "" });
  const [ordem, setOrdem] = useState<Ordem>("PRIORIDADE");
  const [visao, setVisao] = useState<Visao>("ATIVAS");
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null);
  const hoje = dataAtualISO();

  async function carregar() {
    try {
      const [m, resumo, ap] = await Promise.all([
        extras.listarMetas(),
        contabilidade.obterResumoDashboard(primeiroDiaDoMesISO(hoje), ultimoDiaDoMesISO(hoje)),
        extras.listarTodosAportes(),
      ]);
      setMetas(m);
      setSaldoDisponivel(resumo.saldo_disponivel_centavos);
      setAportesTodos(ap);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  // Ritmo de aportes: média líquida dos últimos 3 meses, por meta.
  const ritmoPorMeta = useMemo(() => {
    const desde = mesISO(hoje, -3) + "-01";
    const mapa = new Map<string, number>();
    for (const a of aportesTodos) if (a.data >= desde) mapa.set(a.meta_id, (mapa.get(a.meta_id) ?? 0) + a.valor_centavos);
    return new Map([...mapa.entries()].map(([id, total]) => [id, total / 3]));
  }, [aportesTodos, hoje]);

  // Evolução do total guardado, mês a mês (12 meses).
  const evolucao = useMemo(() => {
    const meses = Array.from({ length: 12 }, (_, i) => mesISO(hoje, i - 11));
    return meses.map((m) => {
      const total = aportesTodos.filter((a) => a.data.slice(0, 7) <= m).reduce((s, a) => s + a.valor_centavos, 0);
      return { nome: m.slice(5) + "/" + m.slice(2, 4), Guardado: total / 100 };
    });
  }, [aportesTodos, hoje]);

  if (carregando) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const totalGuardado = metas.reduce((s, m) => s + m.guardado_centavos, 0);
  const totalAlvo = metas.reduce((s, m) => s + m.valor_alvo_centavos, 0);
  const concluidas = metas.filter((m) => m.guardado_centavos >= m.valor_alvo_centavos).length;
  const saldoLivre = saldoDisponivel - totalGuardado;
  const progressoGeral = totalAlvo > 0 ? (totalGuardado / totalAlvo) * 100 : 0;
  const sugestaoMensalTotal = metas
    .filter((m) => m.guardado_centavos < m.valor_alvo_centavos && m.prazo && m.prazo >= hoje)
    .reduce((s, m) => s + Math.ceil((m.valor_alvo_centavos - m.guardado_centavos) / mesesAte(m.prazo!, hoje)), 0);

  const visiveis = metas
    .filter((m) => {
      const feita = m.guardado_centavos >= m.valor_alvo_centavos;
      return visao === "TODAS" || (visao === "CONCLUIDAS" ? feita : !feita);
    })
    .sort((a, b) => {
      if (ordem === "NOME") return a.nome.localeCompare(b.nome);
      if (ordem === "PROGRESSO") return b.guardado_centavos / b.valor_alvo_centavos - a.guardado_centavos / a.valor_alvo_centavos;
      if (ordem === "PRAZO") return (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999");
      return (PRIORIDADES[a.prioridade ?? "MEDIA"].peso - PRIORIDADES[b.prioridade ?? "MEDIA"].peso) || (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999");
    });

  async function criar(ev: React.FormEvent) {
    ev.preventDefault();
    const valor = valorInputParaCentavos(form.alvo);
    if (!form.nome.trim() || valor <= 0) return toast.error("Informe o nome e o valor da meta.");
    try {
      await extras.criarMeta(form.nome.trim(), valor, form.prazo || null, form.tipo, form.prioridade, form.notas || null);
      setForm(FORM_VAZIO);
      toast.success("Meta criada.");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function salvarEdicao(m: Meta) {
    const valor = valorInputParaCentavos(edForm.alvo);
    if (!edForm.nome.trim() || valor <= 0) return toast.error("Informe o nome e o valor da meta.");
    try {
      await extras.atualizarMeta(m.id, edForm.nome.trim(), valor, edForm.prazo || null, edForm.tipo, edForm.prioridade, edForm.notas || null);
      toast.success("Meta atualizada.");
      setEditandoId(null);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function aportar(meta: Meta, sinal: 1 | -1, valorCentavos?: number) {
    const valor = valorCentavos ?? valorInputParaCentavos(valores[meta.id] ?? "");
    if (valor <= 0) return toast.error("Informe um valor maior que zero.");
    try {
      const antes = meta.guardado_centavos;
      await extras.aportarMeta(meta.id, sinal * valor, datas[meta.id] || hoje);
      setValores((a) => ({ ...a, [meta.id]: "" }));
      if (sinal > 0 && antes < meta.valor_alvo_centavos && antes + valor >= meta.valor_alvo_centavos) {
        toast.success(`Meta "${meta.nome}" atingida! Parabéns.`, { duration: 7000 });
      } else toast.success(sinal > 0 ? "Valor guardado." : "Valor retirado da meta.");
      await carregar();
      if (historicoAberto === meta.id) setAportesMeta(await extras.listarAportesMeta(meta.id));
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function mover(meta: Meta) {
    const valor = valorInputParaCentavos(mv.valor);
    if (!mv.destino || valor <= 0) return toast.error("Escolha a meta de destino e o valor.");
    try {
      await extras.moverEntreMetas(meta.id, mv.destino, valor, hoje);
      toast.success("Valor movido entre metas.");
      setMovendo(null);
      setMv({ destino: "", valor: "" });
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function excluir(meta: Meta) {
    try {
      await extras.excluirMeta(meta.id);
      toast.success("Meta removida.");
      setConfirmarExcluir(null);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function alternarHistorico(meta: Meta) {
    if (historicoAberto === meta.id) return setHistoricoAberto(null);
    try {
      setAportesMeta(await extras.listarAportesMeta(meta.id));
      setHistoricoAberto(meta.id);
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function exportar() {
    try {
      const caminho = await exportarCsv(
        "metas",
        ["Meta", "Tipo", "Prioridade", "Alvo (R$)", "Guardado (R$)", "Progresso (%)", "Prazo", "Notas"],
        metas.map((m) => [
          m.nome,
          TIPOS[m.tipo ?? "OUTRA"]?.rotulo ?? "",
          PRIORIDADES[m.prioridade ?? ""]?.rotulo ?? "",
          reais(m.valor_alvo_centavos),
          reais(m.guardado_centavos),
          Math.round((m.guardado_centavos / m.valor_alvo_centavos) * 100),
          m.prazo ? formatarDataISOParaBR(m.prazo) : "",
          m.notas ?? "",
        ]),
      );
      toast.success(`Arquivo salvo em ${caminho}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  function campos(f: Formulario, set: (f: Formulario) => void) {
    return (
      <>
        <input value={f.nome} onChange={(e) => set({ ...f, nome: e.target.value })} placeholder="Ex.: Reserva de emergência" aria-label="Nome da meta" className={CLASSE_INPUT} />
        <input value={f.alvo} onChange={(e) => set({ ...f, alvo: e.target.value })} inputMode="decimal" placeholder="Valor da meta (R$)" aria-label="Valor da meta" className={CLASSE_INPUT} />
        <Select aria-label="Tipo" value={f.tipo} onValueChange={(v) => set({ ...f, tipo: v })} options={Object.entries(TIPOS).map(([value, t]) => ({ value, label: t.rotulo }))} />
        <Select aria-label="Prioridade" value={f.prioridade} onValueChange={(v) => set({ ...f, prioridade: v })} options={Object.entries(PRIORIDADES).map(([value, p]) => ({ value, label: `Prioridade ${p.rotulo.toLowerCase()}` }))} />
        <label className="flex items-center gap-2 text-xs text-texto-secundario">
          Prazo
          <input type="date" value={f.prazo} onChange={(e) => set({ ...f, prazo: e.target.value })} className={`${CLASSE_INPUT} min-w-0 flex-1`} />
        </label>
        <input value={f.notas} onChange={(e) => set({ ...f, notas: e.target.value })} placeholder="Notas (opcional)" aria-label="Notas" className={CLASSE_INPUT} />
      </>
    );
  }

  function renderMeta(m: Meta) {
    const pct = (m.guardado_centavos / m.valor_alvo_centavos) * 100;
    const feita = m.guardado_centavos >= m.valor_alvo_centavos;
    const tipo = TIPOS[m.tipo ?? "OUTRA"] ?? TIPOS.OUTRA;
    const Icone = tipo.icone;
    const cor = feita ? "var(--cor-sucesso)" : tipo.cor;
    const falta = Math.max(0, m.valor_alvo_centavos - m.guardado_centavos);
    const meses = m.prazo && m.prazo >= hoje ? mesesAte(m.prazo, hoje) : null;
    const sugestao = meses ? Math.ceil(falta / meses) : null;
    const atrasada = !!m.prazo && m.prazo < hoje && !feita;
    const ritmo = ritmoPorMeta.get(m.id) ?? 0;
    const mesesParaConcluir = !feita && ritmo > 0 ? Math.ceil(falta / ritmo) : null;
    const prio = m.prioridade ? PRIORIDADES[m.prioridade] : null;
    const emEdicao = editandoId === m.id;
    return (
      <li
        key={m.id}
        className="rounded-xl border bg-cartao p-4"
        style={{
          borderColor: `color-mix(in srgb, ${cor} 40%, transparent)`,
          backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${cor} 14%, transparent), transparent 60%)`,
          boxShadow: `0 8px 24px -16px ${cor}`,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${tipo.cor} 82%, white), ${tipo.cor}, color-mix(in srgb, ${tipo.cor} 72%, black))`, boxShadow: `0 0 14px -2px ${tipo.cor}` }}>
              <Icone size={19} strokeWidth={2.1} />
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 truncate text-sm font-semibold text-texto-primario">
                {m.nome}
                {feita && <span className="rounded-full border border-sucesso/70 bg-sucesso/10 px-2 py-0.5 text-[11px] font-semibold text-sucesso shadow-[0_0_10px_-4px_var(--cor-sucesso)]">Atingida</span>}
                {atrasada && <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={{ color: "#ff2d55", borderColor: "#ff2d5599" }}>Prazo vencido</span>}
                {prio && !feita && <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{ color: prio.cor, borderColor: `${prio.cor}88` }}>Prioridade {prio.rotulo.toLowerCase()}</span>}
              </p>
              <p className="text-xs text-texto-secundario">
                {tipo.rotulo} · {m.prazo ? `prazo ${formatarDataISOParaBR(m.prazo)}` : "sem prazo"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0">
            <button onClick={() => { setEditandoId(emEdicao ? null : m.id); setEdForm({ nome: m.nome, alvo: centavosParaValorInput(m.valor_alvo_centavos), prazo: m.prazo ?? "", tipo: m.tipo ?? "OUTRA", prioridade: m.prioridade ?? "MEDIA", notas: m.notas ?? "" }); }} aria-label={`Editar ${m.nome}`} className="rounded-md p-1.5 text-texto-secundario hover:bg-borda/50 hover:text-primaria"><Pencil size={14} /></button>
            <button onClick={() => (confirmarExcluir === m.id ? excluir(m) : setConfirmarExcluir(m.id))} aria-label={`Remover meta ${m.nome}`} title={confirmarExcluir === m.id ? "Clique de novo para confirmar" : "Remover meta"} className={`rounded-md p-1.5 transition-colors hover:bg-erro/15 ${confirmarExcluir === m.id ? "text-erro" : "text-texto-secundario hover:text-erro"}`}><Trash2 size={14} /></button>
          </div>
        </div>
        {confirmarExcluir === m.id && <p className="mt-1 text-xs text-erro">Clique na lixeira de novo para remover a meta e o histórico dela.</p>}

        {emEdicao && (
          <div className="mt-3 grid grid-cols-1 gap-2 border-t border-borda pt-3 sm:grid-cols-2">
            {campos(edForm, setEdForm)}
            <div className="flex gap-2 sm:col-span-2">
              <Button tamanho="pequeno" onClick={() => salvarEdicao(m)}>Salvar</Button>
              <Button tamanho="pequeno" variante="fantasma" onClick={() => setEditandoId(null)}>Cancelar</Button>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-end justify-between">
          <p className="text-xl font-bold tabular-nums text-texto-primario">{formatarCentavos(m.guardado_centavos)}</p>
          <p className="text-xs text-texto-secundario">de {formatarCentavos(m.valor_alvo_centavos)} · {Math.min(100, Math.round(pct))}%</p>
        </div>
        <div className="mt-2"><BarraProgresso percentual={pct} cor={cor} /></div>
        <p className="mt-2 text-xs text-texto-secundario">
          {feita ? "Meta atingida." : sugestao ? `Faltam ${formatarCentavos(falta)} — cerca de ${formatarCentavos(sugestao)} por mês até o prazo.` : `Faltam ${formatarCentavos(falta)}.`}
        </p>
        {mesesParaConcluir !== null && (
          <p className="mt-0.5 text-xs text-texto-secundario">Estimativa no seu ritmo atual ({formatarCentavos(Math.round(ritmo))}/mês): cerca de {mesesParaConcluir} mês(es).</p>
        )}
        {m.notas && <p className="mt-1 text-xs italic text-texto-secundario">{m.notas}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={valores[m.id] ?? ""} onChange={(e) => setValores((a) => ({ ...a, [m.id]: e.target.value }))} inputMode="decimal" placeholder="Valor (R$)" aria-label={`Valor para ${m.nome}`} className={`${CLASSE_INPUT} w-28`} />
          <input type="date" value={datas[m.id] ?? hoje} onChange={(e) => setDatas((a) => ({ ...a, [m.id]: e.target.value }))} aria-label="Data do aporte" className={`${CLASSE_INPUT} w-36 py-2`} />
          <Button tamanho="pequeno" onClick={() => aportar(m, 1)}>Guardar</Button>
          <Button tamanho="pequeno" variante="secundaria" onClick={() => aportar(m, -1)} disabled={m.guardado_centavos === 0}>Retirar</Button>
          {sugestao && !feita && <Button tamanho="pequeno" variante="fantasma" onClick={() => aportar(m, 1, sugestao)} title="Guardar o valor mensal sugerido">Guardar {formatarCentavos(sugestao)}</Button>}
        </div>

        <div className="mt-2 flex items-center gap-4 text-xs">
          <button onClick={() => alternarHistorico(m)} className="flex items-center gap-1 text-primaria hover:underline">{historicoAberto === m.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Histórico</button>
          <button onClick={() => { setMovendo(movendo === m.id ? null : m.id); setMv({ destino: metas.find((x) => x.id !== m.id)?.id ?? "", valor: "" }); }} disabled={m.guardado_centavos === 0 || metas.length < 2} className="flex items-center gap-1 text-primaria hover:underline disabled:opacity-40"><ArrowRightLeft size={13} /> Mover para outra meta</button>
        </div>

        {movendo === m.id && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Select aria-label="Meta de destino" value={mv.destino} onValueChange={(v) => setMv({ ...mv, destino: v })} options={metas.filter((x) => x.id !== m.id).map((x) => ({ value: x.id, label: x.nome }))} className="w-44" />
            <input value={mv.valor} onChange={(e) => setMv({ ...mv, valor: e.target.value })} inputMode="decimal" placeholder="Valor (R$)" aria-label="Valor a mover" className={`${CLASSE_INPUT} w-28`} />
            <Button tamanho="pequeno" onClick={() => mover(m)}>Mover</Button>
          </div>
        )}

        {historicoAberto === m.id && (
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto border-t border-borda pt-2 text-xs">
            {aportesMeta.length === 0 ? <li className="text-texto-secundario">Nenhum aporte ainda.</li> : aportesMeta.map((a, i) => (
              <li key={i} className="flex justify-between">
                <span className="text-texto-secundario">{formatarDataISOParaBR(a.data)}</span>
                <span className={`tabular-nums ${a.valor_centavos > 0 ? "text-sucesso" : "text-erro"}`}>{a.valor_centavos > 0 ? "+" : "−"} {formatarCentavos(Math.abs(a.valor_centavos))}</span>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto-primario">Metas Financeiras</h1>
          <p className="text-sm text-texto-secundario">O valor guardado é uma reserva sua dentro do saldo das contas — ele não sai da conta, só deixa de contar como livre.</p>
        </div>
        <Button tamanho="pequeno" variante="secundaria" onClick={exportar} disabled={metas.length === 0}><Download size={13} /> CSV</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard titulo="Metas ativas" valor={String(metas.length - concluidas)} icone={Target} corIcone="destaque" subtitulo={`${concluidas} concluída(s)`} />
        <StatCard titulo="Total guardado" valor={formatarCentavos(totalGuardado)} corValor="sucesso" icone={PiggyBank} corIcone="sucesso" subtitulo={`${progressoGeral.toFixed(0)}% de ${formatarCentavos(totalAlvo)} em metas`} />
        <StatCard titulo="Saldo em contas" valor={formatarCentavos(saldoDisponivel)} icone={Wallet} corIcone="primaria" />
        <StatCard titulo="Saldo livre" valor={formatarCentavos(saldoLivre)} corValor={saldoLivre < 0 ? "erro" : "normal"} icone={Flag} corIcone="secundaria" subtitulo={saldoLivre < 0 ? "Reservas maiores que o saldo das contas" : sugestaoMensalTotal > 0 ? `Para cumprir os prazos: ${formatarCentavos(sugestaoMensalTotal)}/mês` : "Saldo menos o que está reservado"} />
      </div>

      {aportesTodos.length > 0 && (
        <Secao titulo="Evolução do total guardado (12 meses)">
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={evolucao}>
                <defs>
                  <linearGradient id="gMetas" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a855f7" stopOpacity={0.5} /><stop offset="100%" stopColor="#a855f7" stopOpacity={0} /></linearGradient>
                </defs>
                <XAxis dataKey="nome" tick={{ fontSize: 10, fill: "var(--cor-texto-secundario)" }} axisLine={false} tickLine={false} />
                <YAxis hide domain={[0, "auto"]} />
                <Tooltip formatter={(v) => formatarCentavos(Math.round(Number(v) * 100))} contentStyle={{ background: "var(--cor-superficie)", border: "1px solid var(--cor-borda)", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="Guardado" stroke="#a855f7" strokeWidth={2.5} fill="url(#gMetas)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Secao>
      )}

      <Secao titulo="Nova meta">
        <form onSubmit={criar} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campos(form, setForm)}
          <Button type="submit" className="sm:col-span-2 lg:col-span-3">Criar meta</Button>
        </form>
      </Secao>

      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Mostrar" value={visao} onValueChange={(v) => setVisao(v as Visao)} options={[{ value: "ATIVAS", label: "Metas em andamento" }, { value: "CONCLUIDAS", label: "Metas atingidas" }, { value: "TODAS", label: "Todas as metas" }]} className="w-52" />
        <Select aria-label="Ordenar" value={ordem} onValueChange={(v) => setOrdem(v as Ordem)} options={[{ value: "PRIORIDADE", label: "Por prioridade" }, { value: "PRAZO", label: "Por prazo" }, { value: "PROGRESSO", label: "Por progresso" }, { value: "NOME", label: "Ordem alfabética" }]} className="w-48" />
      </div>

      {visiveis.length === 0 ? (
        <EmptyState titulo={metas.length === 0 ? "Nenhuma meta cadastrada" : "Nenhuma meta neste filtro"} descricao="Crie uma meta (reserva de emergência, viagem, compra…) e vá guardando valores." />
      ) : (
        <ul className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">{visiveis.map((m) => renderMeta(m))}</ul>
      )}
    </div>
  );
}
