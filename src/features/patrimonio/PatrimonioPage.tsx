import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Car,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  Gem,
  Landmark,
  Laptop,
  Pencil,
  Scale,
  Search,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Abas, useAbaDaPagina } from "../../components/ui/Abas";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { EmptyState } from "../../components/ui/EmptyState";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatCard } from "../../components/ui/StatCard";
import { contabilidade } from "../../services/contabilidade";
import { exportarCsv, reais } from "../../services/exportacao";
import { extras } from "../../services/extras";
import { centavosParaValorInput, dataAtualISO, formatarCentavos, formatarDataISOParaBR, valorInputParaCentavos } from "../../services/formato";
import { usePreferencia } from "../../state/usePreferencia";
import { useThemeStore } from "../../state/theme-store";
import type { Conta, Lancamento } from "../../types/accounting";
import type { Bem, TipoBem } from "../../types/extras";

const CATEGORIAS_BEM: Record<string, { rotulo: string; icone: LucideIcon; cor: string }> = {
  IMOVEL: { rotulo: "Imóvel", icone: Building2, cor: "#eab308" },
  VEICULO: { rotulo: "Veículo", icone: Car, cor: "#1677ff" },
  ELETRONICO: { rotulo: "Eletrônico", icone: Laptop, cor: "#00d9ff" },
  INVESTIMENTO: { rotulo: "Investimento", icone: Landmark, cor: "#00d395" },
  OUTRO: { rotulo: "Outro bem", icone: Gem, cor: "#a855f7" },
};
const CATEGORIAS_DIVIDA: Record<string, { rotulo: string; icone: LucideIcon; cor: string }> = {
  FINANCIAMENTO: { rotulo: "Financiamento", icone: Building2, cor: "#f43f5e" },
  EMPRESTIMO: { rotulo: "Empréstimo", icone: Landmark, cor: "#ec4899" },
  PESSOAL: { rotulo: "Dívida pessoal", icone: CreditCard, cor: "#f59e0b" },
  OUTRA: { rotulo: "Outra dívida", icone: CreditCard, cor: "#8a8aff" },
};
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type Visao = "TODOS" | "BEM" | "DIVIDA";
type Ordem = "VALOR" | "NOME" | "ATUALIZACAO";

interface Formulario {
  nome: string;
  tipo: TipoBem;
  categoria: string;
  valor: string;
  notas: string;
  aqData: string;
  aqValor: string;
}
const FORM_VAZIO: Formulario = { nome: "", tipo: "BEM", categoria: "OUTRO", valor: "", notas: "", aqData: "", aqValor: "" };

const catalogo = (tipo: TipoBem) => (tipo === "BEM" ? CATEGORIAS_BEM : CATEGORIAS_DIVIDA);

function diasEntre(deISO: string, ateISO: string): number {
  const [a1, m1, d1] = deISO.split("-").map(Number);
  const [a2, m2, d2] = ateISO.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

export function PatrimonioPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [bens, setBens] = useState<Bem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<Formulario>(FORM_VAZIO);
  const [novosValores, setNovosValores] = useState<Record<string, string>>({});
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<string | null>(null);
  const [ed, setEd] = useState<Formulario>(FORM_VAZIO);
  const [busca, setBusca] = useState("");
  const [visao, setVisao] = useState<Visao>("TODOS");
  const [ordem, setOrdem] = useState<Ordem>("VALOR");
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null);
  const [secao, setSecao] = useAbaDaPagina<"itens" | "adicionar" | "visao">("patrimonio", "itens");
  const [ocultar, setOcultar] = usePreferencia<boolean>("ocultar_saldos", false);
  const cores = useThemeStore((s) => s.temaAtivo()).cores.grafico;
  const hoje = dataAtualISO();

  async function carregar() {
    try {
      const [c, l, b] = await Promise.all([contabilidade.listarContas(), contabilidade.listarLancamentos(5000), extras.listarBens()]);
      setContas(c);
      setLancamentos(l);
      setBens(b);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  // Evolução do patrimônio líquido (12 meses): saldos das contas por lançamentos + avaliações vigentes dos bens.
  const evolucao = useMemo(() => {
    const [ah, mh] = hoje.split("-").map(Number);
    const tipoPorConta = new Map(contas.map((c) => [c.id, c.tipo]));
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(ah, mh - 1 - (11 - i), 1);
      const ano = d.getFullYear();
      const mes = d.getMonth() + 1;
      const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}`;
      let liquido = 0;
      for (const l of lancamentos) {
        if (l.data > fim) continue;
        for (const p of l.partidas) {
          const t = tipoPorConta.get(p.conta_id);
          if (t === "ATIVO") liquido += p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos;
          else if (t === "PASSIVO") liquido -= p.tipo === "CREDITO" ? p.valor_centavos : -p.valor_centavos;
        }
      }
      for (const b of bens) {
        const vigente = b.avaliacoes.find((a) => a.data <= fim);
        if (vigente) liquido += b.tipo === "BEM" ? vigente.valor_centavos : -vigente.valor_centavos;
      }
      return { nome: MESES[d.getMonth()], Liquido: liquido / 100 };
    });
  }, [lancamentos, contas, bens, hoje]);

  if (carregando) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const dinheiro = (v: number) => (ocultar ? "R$ ••••" : formatarCentavos(v));
  const ativosContas = contas.filter((c) => c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA").reduce((s, c) => s + c.saldo_atual_centavos, 0);
  const passivosContas = contas.filter((c) => c.tipo === "PASSIVO" && c.subtipo !== "CATEGORIA").reduce((s, c) => s + c.saldo_atual_centavos, 0);
  const totalBens = bens.filter((b) => b.tipo === "BEM").reduce((s, b) => s + b.valor_centavos, 0);
  const totalDividas = bens.filter((b) => b.tipo === "DIVIDA").reduce((s, b) => s + b.valor_centavos, 0);
  const totalAtivos = ativosContas + totalBens;
  const totalPassivos = passivosContas + totalDividas;
  const liquido = totalAtivos - totalPassivos;
  const endividamento = totalAtivos > 0 ? (totalPassivos / totalAtivos) * 100 : 0;
  const liquidez = totalPassivos > 0 ? ativosContas / totalPassivos : null;
  const maiorAtivo = [...bens.filter((b) => b.tipo === "BEM")].sort((a, b) => b.valor_centavos - a.valor_centavos)[0];
  const maiorPassivo = [...bens.filter((b) => b.tipo === "DIVIDA")].sort((a, b) => b.valor_centavos - a.valor_centavos)[0];
  const desatualizados = bens.filter((b) => b.valor_centavos > 0 && diasEntre(b.avaliacoes[0].data, hoje) > 90);

  const composicao = [
    { nome: "Contas e carteiras", valor: ativosContas },
    ...Object.entries(CATEGORIAS_BEM).map(([k, c]) => ({ nome: c.rotulo, valor: bens.filter((b) => b.tipo === "BEM" && (b.categoria ?? "OUTRO") === k).reduce((s, b) => s + b.valor_centavos, 0) })),
  ].filter((x) => x.valor > 0);

  const termo = busca.trim().toLowerCase();
  const lista = bens
    .filter((b) => visao === "TODOS" || b.tipo === visao)
    .filter((b) => !termo || `${b.nome} ${b.notas ?? ""}`.toLowerCase().includes(termo))
    .sort((a, b) => {
      if (ordem === "NOME") return a.nome.localeCompare(b.nome);
      if (ordem === "ATUALIZACAO") return a.avaliacoes[0].data.localeCompare(b.avaliacoes[0].data);
      return b.valor_centavos - a.valor_centavos;
    });

  async function criar(ev: React.FormEvent) {
    ev.preventDefault();
    const centavos = valorInputParaCentavos(form.valor);
    if (!form.nome.trim() || centavos <= 0) return toast.error("Informe o nome e o valor.");
    try {
      await extras.criarBem(form.nome.trim(), form.tipo, centavos, hoje, form.categoria, form.notas || null, form.aqData || null, form.aqValor ? valorInputParaCentavos(form.aqValor) : null);
      setForm({ ...FORM_VAZIO, tipo: form.tipo, categoria: form.tipo === "BEM" ? "OUTRO" : "OUTRA" });
      setSecao("itens");
      toast.success("Item adicionado.");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function reavaliar(bem: Bem, valorCentavos?: number) {
    const centavos = valorCentavos ?? valorInputParaCentavos(novosValores[bem.id] ?? "");
    if (valorCentavos === undefined && !(novosValores[bem.id] ?? "").trim()) return toast.error("Informe o novo valor.");
    try {
      await extras.atualizarBem(bem.id, centavos, hoje);
      setNovosValores((n) => ({ ...n, [bem.id]: "" }));
      toast.success(valorCentavos === 0 ? "Marcado como quitado/zerado." : "Valor atualizado.");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function salvarEdicao(bem: Bem) {
    try {
      await extras.atualizarBemDetalhes(bem.id, ed.nome, ed.categoria, ed.notas || null, ed.aqData || null, ed.aqValor ? valorInputParaCentavos(ed.aqValor) : null);
      toast.success("Item atualizado.");
      setEditando(null);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function excluir(bem: Bem) {
    try {
      await extras.excluirBem(bem.id);
      toast.success("Item removido.");
      setConfirmarExcluir(null);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function exportar() {
    try {
      const caminho = await exportarCsv(
        "patrimonio",
        ["Item", "Tipo", "Categoria", "Valor atual (R$)", "Última avaliação", "Compra (R$)", "Data da compra", "Notas"],
        bens.map((b) => [b.nome, b.tipo === "BEM" ? "Bem" : "Dívida", catalogo(b.tipo)[b.categoria ?? ""]?.rotulo ?? "", reais(b.valor_centavos), formatarDataISOParaBR(b.avaliacoes[0].data), b.aquisicao_valor_centavos != null ? reais(b.aquisicao_valor_centavos) : "", b.aquisicao_data ? formatarDataISOParaBR(b.aquisicao_data) : "", b.notas ?? ""]),
      );
      toast.success(`Arquivo salvo em ${caminho}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  function camposForm(f: Formulario, set: (f: Formulario) => void, completo: boolean) {
    const cat = catalogo(f.tipo);
    return (
      <>
        <input value={f.nome} onChange={(e) => set({ ...f, nome: e.target.value })} placeholder="Ex.: Notebook, Moto, Financiamento" aria-label="Nome" className={CLASSE_INPUT} />
        {completo && (
          <Select
            aria-label="Tipo"
            value={f.tipo}
            onValueChange={(v) => set({ ...f, tipo: v as TipoBem, categoria: v === "BEM" ? "OUTRO" : "OUTRA" })}
            options={[{ value: "BEM", label: "Bem (ativo)" }, { value: "DIVIDA", label: "Dívida (passivo)" }]}
          />
        )}
        <Select aria-label="Categoria" value={f.categoria} onValueChange={(v) => set({ ...f, categoria: v })} options={Object.entries(cat).map(([value, c]) => ({ value, label: c.rotulo }))} />
        {completo && <input value={f.valor} onChange={(e) => set({ ...f, valor: e.target.value })} inputMode="decimal" placeholder="Valor atual (R$)" aria-label="Valor atual" className={CLASSE_INPUT} />}
        <input value={f.aqValor} onChange={(e) => set({ ...f, aqValor: e.target.value })} inputMode="decimal" placeholder={f.tipo === "BEM" ? "Valor pago na compra (opcional)" : "Valor original (opcional)"} aria-label="Valor de aquisição" className={CLASSE_INPUT} />
        <label className="flex items-center gap-2 text-xs text-texto-secundario">
          Data
          <input type="date" value={f.aqData} onChange={(e) => set({ ...f, aqData: e.target.value })} className={`${CLASSE_INPUT} min-w-0 flex-1`} />
        </label>
        <input value={f.notas} onChange={(e) => set({ ...f, notas: e.target.value })} placeholder="Notas (opcional)" aria-label="Notas" className={CLASSE_INPUT} />
      </>
    );
  }

  function renderItem(b: Bem) {
    const divida = b.tipo === "DIVIDA";
    const cat = catalogo(b.tipo)[b.categoria ?? ""] ?? Object.values(catalogo(b.tipo)).slice(-1)[0];
    const Icone = cat.icone;
    const cor = divida ? "#ff2d55" : "var(--cor-sucesso)";
    const anterior = b.avaliacoes[1];
    const variacao = anterior ? b.valor_centavos - anterior.valor_centavos : null;
    const ganho = b.aquisicao_valor_centavos != null && b.aquisicao_valor_centavos > 0 ? b.valor_centavos - b.aquisicao_valor_centavos : null;
    const ganhoPct = ganho !== null ? (ganho / (b.aquisicao_valor_centavos as number)) * 100 : null;
    const primeira = b.avaliacoes[b.avaliacoes.length - 1];
    const dias = diasEntre(primeira.data, b.avaliacoes[0].data);
    // Estimativa de variação anual a partir da primeira e da última avaliação (só com intervalo >= 60 dias).
    const anual = b.avaliacoes.length > 1 && dias >= 60 && primeira.valor_centavos > 0 ? (Math.pow(b.valor_centavos / primeira.valor_centavos, 365 / dias) - 1) * 100 : null;
    const aberto = abertos.has(b.id);
    const serie = [...b.avaliacoes].reverse().map((a) => ({ data: formatarDataISOParaBR(a.data).slice(0, 5), valor: a.valor_centavos / 100 }));
    const desatualizado = b.valor_centavos > 0 && diasEntre(b.avaliacoes[0].data, hoje) > 90;
    return (
      <li
        key={b.id}
        className="rounded-xl border bg-cartao px-4 py-3"
        style={{ borderColor: `color-mix(in srgb, ${cor} 32%, transparent)`, backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${cor} 9%, transparent), transparent 55%)`, boxShadow: `0 6px 18px -14px ${cor}` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${cat.cor} 82%, white), ${cat.cor}, color-mix(in srgb, ${cat.cor} 72%, black))`, boxShadow: `0 0 12px -3px ${cat.cor}` }}>
              <Icone size={18} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-texto-primario">{b.nome}</p>
              <p className="text-xs text-texto-secundario">
                {cat.rotulo} · atualizado em {formatarDataISOParaBR(b.avaliacoes[0].data)}
                {desatualizado && <span className="ml-1 inline-flex items-center gap-0.5 text-alerta"><AlertTriangle size={11} /> desatualizado</span>}
              </p>
              <p className="text-xs">
                {variacao !== null && variacao !== 0 && (
                  <span className={variacao > 0 ? (divida ? "text-erro" : "text-sucesso") : divida ? "text-sucesso" : "text-erro"}>
                    {variacao > 0 ? "▲" : "▼"} {dinheiro(Math.abs(variacao))} desde a avaliação anterior
                  </span>
                )}
                {ganho !== null && ganhoPct !== null && (
                  <span className="ml-2 text-texto-secundario">
                    {divida ? "Pago até agora" : ganho >= 0 ? "Valorização" : "Desvalorização"} desde a compra: <strong className={(divida ? ganho <= 0 : ganho >= 0) ? "text-sucesso" : "text-erro"}>{ganho >= 0 ? "+" : "−"}{dinheiro(Math.abs(ganho))} ({ganhoPct.toFixed(0)}%)</strong>
                  </span>
                )}
                {anual !== null && <span className="ml-2 text-texto-secundario">≈ {anual.toFixed(1)}%/ano (estimativa)</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 text-base font-bold tabular-nums" style={{ color: cor }}>{divida && b.valor_centavos > 0 ? "− " : ""}{dinheiro(b.valor_centavos)}</span>
            <input value={novosValores[b.id] ?? ""} onChange={(e) => setNovosValores((n) => ({ ...n, [b.id]: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && reavaliar(b)} inputMode="decimal" placeholder="Novo valor" aria-label={`Novo valor de ${b.nome}`} className={`${CLASSE_INPUT} w-28`} />
            <Button tamanho="pequeno" variante="secundaria" onClick={() => reavaliar(b)}>Atualizar</Button>
            {divida && b.valor_centavos > 0 && <Button tamanho="pequeno" variante="fantasma" onClick={() => reavaliar(b, 0)}>Quitar</Button>}
            <button onClick={() => { setEditando(editando === b.id ? null : b.id); setEd({ nome: b.nome, tipo: b.tipo, categoria: b.categoria ?? (divida ? "OUTRA" : "OUTRO"), valor: "", notas: b.notas ?? "", aqData: b.aquisicao_data ?? "", aqValor: b.aquisicao_valor_centavos != null ? centavosParaValorInput(b.aquisicao_valor_centavos) : "" }); }} aria-label={`Editar ${b.nome}`} className="rounded-md p-1.5 text-texto-secundario hover:bg-borda/50 hover:text-primaria"><Pencil size={14} /></button>
            <button onClick={() => setAbertos((s) => { const n = new Set(s); n.has(b.id) ? n.delete(b.id) : n.add(b.id); return n; })} aria-label="Histórico" title="Histórico de avaliações" className="rounded-md p-1.5 text-texto-secundario hover:bg-borda/50 hover:text-primaria">{aberto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
            <button onClick={() => (confirmarExcluir === b.id ? excluir(b) : setConfirmarExcluir(b.id))} aria-label={`Remover ${b.nome}`} title={confirmarExcluir === b.id ? "Clique de novo para confirmar" : "Remover"} className={`rounded-md p-1.5 hover:bg-erro/15 ${confirmarExcluir === b.id ? "text-erro" : "text-texto-secundario hover:text-erro"}`}><Trash2 size={15} /></button>
          </div>
        </div>
        {confirmarExcluir === b.id && <p className="mt-1 text-xs text-erro">Clique na lixeira de novo para remover o item e todo o histórico de avaliações.</p>}
        {b.notas && editando !== b.id && <p className="mt-1 text-xs italic text-texto-secundario">{b.notas}</p>}

        {editando === b.id && (
          <div className="mt-3 grid grid-cols-1 gap-2 border-t border-borda pt-3 sm:grid-cols-2 lg:grid-cols-3">
            {camposForm(ed, setEd, false)}
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <Button tamanho="pequeno" onClick={() => salvarEdicao(b)}>Salvar</Button>
              <Button tamanho="pequeno" variante="fantasma" onClick={() => setEditando(null)}>Cancelar</Button>
            </div>
          </div>
        )}

        {aberto && (
          <div className="mt-3 grid gap-4 border-t border-borda pt-3 lg:grid-cols-2">
            <ul className="space-y-1 text-xs text-texto-secundario">
              {b.avaliacoes.map((a, i) => (
                <li key={i} className="flex justify-between"><span>{formatarDataISOParaBR(a.data)}</span><span className="tabular-nums">{dinheiro(a.valor_centavos)}</span></li>
              ))}
            </ul>
            {serie.length > 1 && (
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={serie}>
                    <defs><linearGradient id={`gb-${b.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={cat.cor} stopOpacity={0.5} /><stop offset="100%" stopColor={cat.cor} stopOpacity={0} /></linearGradient></defs>
                    <XAxis dataKey="data" tick={{ fontSize: 10, fill: "var(--cor-texto-secundario)" }} axisLine={false} tickLine={false} />
                    <YAxis hide domain={["auto", "auto"]} />
                    <Tooltip formatter={(v) => formatarCentavos(Math.round(Number(v) * 100))} contentStyle={{ background: "var(--cor-superficie)", border: "1px solid var(--cor-borda)", borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="valor" stroke={cat.cor} strokeWidth={2.5} fill={`url(#gb-${b.id})`} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto-primario">Patrimônio</h1>
          <p className="text-sm text-texto-secundario">Saldos das contas e cartões somados aos bens e dívidas que você cadastra aqui. Os valores dos bens são informados por você.</p>
        </div>
        <div className="flex gap-2">
          <Button tamanho="pequeno" variante="secundaria" onClick={() => setOcultar(!ocultar)}>{ocultar ? <EyeOff size={14} /> : <Eye size={14} />} {ocultar ? "Mostrar valores" : "Ocultar valores"}</Button>
          <Button tamanho="pequeno" variante="secundaria" onClick={exportar} disabled={bens.length === 0}><Download size={13} /> CSV</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard titulo="Patrimônio líquido" valor={dinheiro(liquido)} corValor={liquido < 0 ? "erro" : "sucesso"} icone={Scale} corIcone="sucesso" subtitulo="Ativos menos passivos" />
        <StatCard titulo="Total de ativos" valor={dinheiro(totalAtivos)} icone={Landmark} corIcone="primaria" subtitulo={`${dinheiro(ativosContas)} em contas · ${dinheiro(totalBens)} em bens`} />
        <StatCard titulo="Total de passivos" valor={dinheiro(totalPassivos)} icone={CreditCard} corIcone="erro" subtitulo={`${dinheiro(passivosContas)} em cartões · ${dinheiro(totalDividas)} em dívidas`} />
        <StatCard titulo="Endividamento" valor={`${endividamento.toFixed(0)}%`} corValor={endividamento >= 50 ? "erro" : "normal"} icone={Building2} corIcone="alerta" subtitulo={liquidez !== null ? `Liquidez: ${liquidez.toFixed(1)}x (contas ÷ passivos)` : "Sem passivos"} />
      </div>

      <Abas ativa={secao} onChange={setSecao} abas={[{ id: "itens", rotulo: "Bens e dívidas", icone: Building2, contador: desatualizados.length }, { id: "adicionar", rotulo: "Adicionar", icone: Gem }, { id: "visao", rotulo: "Evolução e composição", icone: Scale }]} />

      {secao === "visao" && (
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Secao titulo="Evolução do patrimônio líquido (12 meses)">
          <div className="h-52">
            {ocultar ? <p className="pt-20 text-center text-sm text-texto-secundario">Valores ocultos.</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={evolucao}>
                  <defs><linearGradient id="gPL" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00d395" stopOpacity={0.5} /><stop offset="100%" stopColor="#00d395" stopOpacity={0} /></linearGradient></defs>
                  <XAxis dataKey="nome" tick={{ fontSize: 10, fill: "var(--cor-texto-secundario)" }} axisLine={false} tickLine={false} />
                  <YAxis hide domain={["auto", "auto"]} />
                  <Tooltip formatter={(v) => formatarCentavos(Math.round(Number(v) * 100))} contentStyle={{ background: "var(--cor-superficie)", border: "1px solid var(--cor-borda)", borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="Liquido" stroke="#00d395" strokeWidth={2.5} fill="url(#gPL)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="mt-1 text-[11px] text-texto-secundario">Bens entram a partir da data da primeira avaliação cadastrada.</p>
        </Secao>
        <Secao titulo="Composição dos ativos">
          {composicao.length === 0 ? <p className="text-sm text-texto-secundario">Sem ativos.</p> : (
            <div className="flex items-center gap-3">
              <div className="h-36 w-36 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={composicao} dataKey="valor" nameKey="nome" innerRadius="60%" outerRadius="95%" stroke="none" paddingAngle={2}>
                      {composicao.map((_, i) => <Cell key={i} fill={cores[i % cores.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-1 text-xs">
                {composicao.map((c, i) => (
                  <li key={c.nome} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: cores[i % cores.length] }} /><span className="text-texto-secundario">{c.nome}</span><span className="tabular-nums text-texto-primario">{totalAtivos > 0 ? ((c.valor / totalAtivos) * 100).toFixed(0) : 0}%</span></li>
                ))}
              </ul>
            </div>
          )}
          {(maiorAtivo || maiorPassivo) && (
            <p className="mt-3 text-xs text-texto-secundario">
              {maiorAtivo && <>Maior bem: <strong className="text-texto-primario">{maiorAtivo.nome}</strong> ({dinheiro(maiorAtivo.valor_centavos)}). </>}
              {maiorPassivo && <>Maior dívida: <strong className="text-texto-primario">{maiorPassivo.nome}</strong> ({dinheiro(maiorPassivo.valor_centavos)}).</>}
            </p>
          )}
        </Secao>
      </div>

      )}

      {secao === "itens" && desatualizados.length > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-alerta/50 bg-alerta/10 px-3 py-2 text-xs text-alerta">
          <AlertTriangle size={14} /> {desatualizados.length} item(ns) sem atualização há mais de 90 dias: {desatualizados.map((b) => b.nome).join(", ")}.
        </p>
      )}

      {secao === "adicionar" && (
      <Secao titulo="Adicionar bem ou dívida">
        <form onSubmit={criar} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {camposForm(form, setForm, true)}
          <Button type="submit" className="lg:col-span-4">Adicionar</Button>
        </form>
      </Secao>
      )}

      {secao === "itens" && (<>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-secundario" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item…" aria-label="Buscar item" className={`${CLASSE_INPUT} w-52 pl-8`} />
        </div>
        <Select aria-label="Mostrar" value={visao} onValueChange={(v) => setVisao(v as Visao)} options={[{ value: "TODOS", label: "Bens e dívidas" }, { value: "BEM", label: "Só bens" }, { value: "DIVIDA", label: "Só dívidas" }]} className="w-44" />
        <Select aria-label="Ordenar" value={ordem} onValueChange={(v) => setOrdem(v as Ordem)} options={[{ value: "VALOR", label: "Maior valor" }, { value: "NOME", label: "Ordem alfabética" }, { value: "ATUALIZACAO", label: "Mais desatualizados" }]} className="w-48" />
      </div>

      {lista.length === 0 ? (
        <EmptyState titulo={bens.length === 0 ? "Nenhum bem ou dívida cadastrado" : "Nada encontrado"} descricao="Cadastre bens (eletrônicos, veículo, imóvel) e dívidas para ver seu patrimônio líquido completo." />
      ) : (
        <ul className="space-y-3">{lista.map((b) => renderItem(b))}</ul>
      )}
      </>)}
    </div>
  );
}
