import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Banknote,
  CalendarClock,
  Calculator,
  Clock,
  Download,
  Eye,
  EyeOff,
  Pencil,
  Percent,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Abas, useAbaDaPagina } from "../../components/ui/Abas";
import { BarraProgresso, CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { EmptyState } from "../../components/ui/EmptyState";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatCard } from "../../components/ui/StatCard";
import { contabilidade } from "../../services/contabilidade";
import { exportarCsv, reais } from "../../services/exportacao";
import { extras } from "../../services/extras";
import { centavosParaValorInput, dataAtualISO, formatarCentavos, formatarDataISOParaBR, nomeMesAno, valorInputParaCentavos } from "../../services/formato";
import { useThemeStore } from "../../state/theme-store";
import { usePreferencia } from "../../state/usePreferencia";
import { CONTAS_SISTEMA } from "../../types/accounting";
import type { Conta, Lancamento } from "../../types/accounting";
import { RecebimentoForm } from "./RecebimentoForm";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface PerfilRenda {
  bruto: number;
  liquido: number;
  diaPagamento: number;
  vaMensal: number;
  metaMensal: number;
  horasMes: number;
}
const PERFIL_VAZIO: PerfilRenda = { bruto: 0, liquido: 0, diaPagamento: 5, vaMensal: 0, metaMensal: 0, horasMes: 220 };

type Fonte = "TODAS" | "SALARIO" | "BENEFICIO" | "EXTRA";
const FONTES: Record<string, { rotulo: string; cor: string; contaId: string }> = {
  SALARIO: { rotulo: "Salário", cor: "#00d395", contaId: CONTAS_SISTEMA.receitaSalario },
  BENEFICIO: { rotulo: "Benefícios", cor: "#00d9ff", contaId: CONTAS_SISTEMA.receitaBeneficios },
  EXTRA: { rotulo: "Renda extra", cor: "#a855f7", contaId: CONTAS_SISTEMA.receitaRendaExtra },
};

function mesRel(hoje: string, delta: number) {
  const [a, m] = hoje.split("-").map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  const ano = d.getFullYear();
  const mes = d.getMonth() + 1;
  return { chave: `${ano}-${String(mes).padStart(2, "0")}`, rotulo: MESES[mes - 1] };
}

function diasEntre(deISO: string, ateISO: string): number {
  const [a1, m1, d1] = deISO.split("-").map(Number);
  const [a2, m2, d2] = ateISO.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

function proximoPagamento(dia: number, hoje: string): string {
  const [a, m, d] = hoje.split("-").map(Number);
  const noMes = (ano: number, mes0: number) => new Date(ano, mes0, Math.min(dia, new Date(ano, mes0 + 1, 0).getDate()));
  const alvo = d <= dia ? noMes(a, m - 1) : noMes(a, m);
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}-${String(alvo.getDate()).padStart(2, "0")}`;
}

interface Recebimento {
  l: Lancamento;
  fonte: Exclude<Fonte, "TODAS">;
  valor: number;
}

export function SalarioPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [perfil, setPerfil] = usePreferencia<PerfilRenda>("perfil_renda", PERFIL_VAZIO);
  const [rascunho, setRascunho] = useState({ bruto: "", liquido: "", dia: "5", va: "", meta: "", horas: "220" });
  const [editandoPerfil, setEditandoPerfil] = useState(false);
  const [fonte, setFonte] = useState<Fonte>("TODAS");
  const [ocultar, setOcultar] = usePreferencia<boolean>("ocultar_saldos", false);
  const [aumento, setAumento] = useState("5");
  const [incluir13, setIncluir13] = useState(true);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edDescricao, setEdDescricao] = useState("");
  const [secao, setSecao] = useAbaDaPagina<"registrar" | "analises" | "historico">("salario", "registrar");
  const cores = useThemeStore((s) => s.temaAtivo()).cores.grafico;
  const hoje = dataAtualISO();

  async function carregar() {
    try {
      const [c, l] = await Promise.all([contabilidade.listarContas(), contabilidade.listarLancamentos(5000)]);
      setContas(c);
      setLancamentos(l);
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
    setRascunho({
      bruto: perfil.bruto ? centavosParaValorInput(perfil.bruto) : "",
      liquido: perfil.liquido ? centavosParaValorInput(perfil.liquido) : "",
      dia: String(perfil.diaPagamento),
      va: perfil.vaMensal ? centavosParaValorInput(perfil.vaMensal) : "",
      meta: perfil.metaMensal ? centavosParaValorInput(perfil.metaMensal) : "",
      horas: String(perfil.horasMes),
    });
  }, [perfil]);

  const idsFonte = useMemo(() => {
    const m = new Map<string, Exclude<Fonte, "TODAS">>();
    for (const [k, f] of Object.entries(FONTES)) m.set(f.contaId, k as Exclude<Fonte, "TODAS">);
    return m;
  }, []);

  // Todos os recebimentos (créditos em contas de receita), sem estornos.
  const recebimentos: Recebimento[] = useMemo(() => {
    const estornados = new Set(lancamentos.map((l) => l.estornado_de).filter(Boolean));
    const lista: Recebimento[] = [];
    for (const l of lancamentos) {
      if (l.origem === "ESTORNO" || estornados.has(l.id)) continue;
      const p = l.partidas.find((x) => x.tipo === "CREDITO" && idsFonte.has(x.conta_id));
      if (p) lista.push({ l, fonte: idsFonte.get(p.conta_id)!, valor: p.valor_centavos });
    }
    return lista.sort((a, b) => b.l.data.localeCompare(a.l.data));
  }, [lancamentos, idsFonte]);

  if (carregando) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const dinheiro = (v: number) => (ocultar ? "R$ ••••" : formatarCentavos(v));
  const contasDestino = contas.filter((c) => c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA" && c.ativa && c.id !== CONTAS_SISTEMA.valeAlimentacao);
  const mesAtual = hoje.slice(0, 7);
  const somaMes = (chave: string, f?: Exclude<Fonte, "TODAS">) =>
    recebimentos.filter((r) => r.l.data.startsWith(chave) && (!f || r.fonte === f)).reduce((s, r) => s + r.valor, 0);

  const totalMes = somaMes(mesAtual);
  const mesAnterior = mesRel(hoje, -1).chave;
  const totalAnterior = somaMes(mesAnterior);
  const variacao = totalAnterior > 0 ? ((totalMes - totalAnterior) / totalAnterior) * 100 : null;

  const meses12 = Array.from({ length: 12 }, (_, i) => mesRel(hoje, i - 11));
  const serie = meses12.map((m) => ({
    nome: m.rotulo,
    Salário: somaMes(m.chave, "SALARIO") / 100,
    Benefícios: somaMes(m.chave, "BENEFICIO") / 100,
    "Renda extra": somaMes(m.chave, "EXTRA") / 100,
    total: somaMes(m.chave) / 100,
  }));
  const comRenda = serie.filter((s) => s.total > 0);
  const media12 = comRenda.length ? (comRenda.reduce((s, x) => s + x.total, 0) / comRenda.length) * 100 : 0;
  const melhor = comRenda.length ? comRenda.reduce((a, b) => (b.total > a.total ? b : a)) : null;
  const pior = comRenda.length ? comRenda.reduce((a, b) => (b.total < a.total ? b : a)) : null;

  const porFonteMes = (Object.keys(FONTES) as Array<Exclude<Fonte, "TODAS">>).map((k) => ({ k, nome: FONTES[k].rotulo, valor: somaMes(mesAtual, k), cor: FONTES[k].cor })).filter((f) => f.valor > 0);

  // Gastos do mês vs renda do mês.
  const despesas = new Set(contas.filter((c) => c.tipo === "DESPESA").map((c) => c.id));
  let gastoMes = 0;
  for (const l of lancamentos) {
    if (!l.data.startsWith(mesAtual)) continue;
    for (const p of l.partidas) if (despesas.has(p.conta_id)) gastoMes += p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos;
  }
  const rendaReferencia = totalMes > 0 ? totalMes : perfil.liquido + perfil.vaMensal;
  const sobra = rendaReferencia - gastoMes;
  const pctGasto = rendaReferencia > 0 ? (gastoMes / rendaReferencia) * 100 : 0;

  // Extra: ranking por descrição.
  const extrasPorNome = new Map<string, number>();
  for (const r of recebimentos.filter((x) => x.fonte === "EXTRA")) extrasPorNome.set(r.l.descricao, (extrasPorNome.get(r.l.descricao) ?? 0) + r.valor);
  const rankingExtras = [...extrasPorNome.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const recebeuSalarioMes = recebimentos.some((r) => r.fonte === "SALARIO" && r.l.data.startsWith(mesAtual));
  const proxPag = perfil.liquido > 0 && perfil.diaPagamento ? proximoPagamento(perfil.diaPagamento, hoje) : null;
  const diasPag = proxPag ? diasEntre(hoje, proxPag) : null;

  const descontos = perfil.bruto > 0 && perfil.liquido > 0 ? perfil.bruto - perfil.liquido : null;
  const descontoPct = descontos !== null && perfil.bruto > 0 ? (descontos / perfil.bruto) * 100 : null;
  const valorHora = perfil.liquido > 0 && perfil.horasMes > 0 ? Math.round(perfil.liquido / perfil.horasMes) : null;
  const pctAumento = Number(aumento.replace(",", ".")) || 0;
  const novoLiquido = Math.round(perfil.liquido * (1 + pctAumento / 100));
  const ganhoAnual = (novoLiquido - perfil.liquido) * (incluir13 ? 13 : 12);
  const projecaoAnual = (perfil.liquido + perfil.vaMensal) * 12 + (incluir13 ? perfil.liquido : 0);
  const metaPct = perfil.metaMensal > 0 ? (totalMes / perfil.metaMensal) * 100 : null;

  const lista = recebimentos.filter((r) => fonte === "TODAS" || r.fonte === fonte);

  async function salvarPerfil(ev: React.FormEvent) {
    ev.preventDefault();
    const dia = Math.min(31, Math.max(1, Number(rascunho.dia) || 5));
    setPerfil({
      bruto: valorInputParaCentavos(rascunho.bruto),
      liquido: valorInputParaCentavos(rascunho.liquido),
      diaPagamento: dia,
      vaMensal: valorInputParaCentavos(rascunho.va),
      metaMensal: valorInputParaCentavos(rascunho.meta),
      horasMes: Number(rascunho.horas) || 220,
    });
    setEditandoPerfil(false);
    toast.success("Perfil de renda salvo.");
  }

  async function registrarRapido(tipo: "SALARIO" | "VA") {
    const valor = tipo === "SALARIO" ? perfil.liquido : perfil.vaMensal;
    if (valor <= 0) return toast.error("Cadastre o valor no perfil de renda primeiro.");
    const conta = tipo === "VA" ? CONTAS_SISTEMA.valeAlimentacao : contasDestino[0]?.id;
    if (!conta) return toast.error("Cadastre uma conta de destino primeiro.");
    try {
      await contabilidade.registrarRecebimento({
        conta_destino_id: conta,
        conta_receita_id: tipo === "SALARIO" ? CONTAS_SISTEMA.receitaSalario : CONTAS_SISTEMA.receitaBeneficios,
        valor_centavos: valor,
        data: hoje,
        descricao: tipo === "SALARIO" ? "Salário" : "Vale-Alimentação",
      });
      toast.success(tipo === "SALARIO" ? "Salário do mês registrado." : "Vale-Alimentação do mês registrado.");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function salvarDescricao(l: Lancamento) {
    try {
      await extras.atualizarLancamentoInfo(l.id, edDescricao, l.observacao, l.etiqueta);
      toast.success("Descrição atualizada.");
      setEditandoId(null);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function estornar(id: string) {
    try {
      await contabilidade.estornarLancamento(id);
      toast.success("Recebimento estornado.");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function exportar() {
    try {
      const caminho = await exportarCsv(
        "recebimentos",
        ["Data", "Descrição", "Fonte", "Valor (R$)"],
        recebimentos.map((r) => [formatarDataISOParaBR(r.l.data), r.l.descricao, FONTES[r.fonte].rotulo, reais(r.valor)]),
      );
      toast.success(`Arquivo salvo em ${caminho}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto-primario">Salário e Renda</h1>
          <p className="text-sm text-texto-secundario">Registre o que entra, acompanhe a evolução da renda e simule cenários.</p>
        </div>
        <div className="flex gap-2">
          <Button tamanho="pequeno" variante="secundaria" onClick={() => setOcultar(!ocultar)}>{ocultar ? <EyeOff size={14} /> : <Eye size={14} />} {ocultar ? "Mostrar valores" : "Ocultar valores"}</Button>
          <Button tamanho="pequeno" variante="secundaria" onClick={exportar} disabled={recebimentos.length === 0}><Download size={13} /> CSV</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard titulo={`Recebido em ${nomeMesAno(hoje)}`} valor={dinheiro(totalMes)} corValor="sucesso" icone={Banknote} corIcone="sucesso" subtitulo={variacao !== null ? `${variacao >= 0 ? "▲" : "▼"} ${Math.abs(variacao).toFixed(0)}% vs mês anterior (${dinheiro(totalAnterior)})` : "Sem mês anterior para comparar"} />
        <StatCard titulo="Média mensal (12 meses)" valor={dinheiro(Math.round(media12))} icone={TrendingUp} corIcone="primaria" subtitulo={comRenda.length > 1 && melhor && pior ? `Melhor ${melhor.nome} · menor ${pior.nome}` : "Histórico de apenas 1 mês até agora"} />
        <StatCard titulo="Próximo pagamento" valor={proxPag ? formatarDataISOParaBR(proxPag).slice(0, 5) : "—"} icone={CalendarClock} corIcone="secundaria" subtitulo={diasPag === null ? "Cadastre o perfil de renda" : recebeuSalarioMes ? `Salário de ${MESES[Number(hoje.slice(5, 7)) - 1]} já recebido` : diasPag === 0 ? "É hoje" : `em ${diasPag} dia(s)`} />
        <StatCard titulo="Sobra do mês" valor={dinheiro(sobra)} corValor={sobra < 0 ? "erro" : "normal"} icone={Wallet} corIcone="alerta" subtitulo={rendaReferencia > 0 ? `${pctGasto.toFixed(0)}% da renda já gasta` : "Sem renda registrada"} />
      </div>

      <Abas ativa={secao} onChange={setSecao} abas={[{ id: "registrar", rotulo: "Registrar e perfil", icone: Banknote }, { id: "analises", rotulo: "Análises e simulador", icone: TrendingUp }, { id: "historico", rotulo: "Histórico", icone: CalendarClock }]} />

      {secao === "analises" && metaPct !== null && (
        <Secao titulo={<><Target size={16} className="text-destaque" /> Meta de renda mensal</>}>
          <div className="flex items-end justify-between text-sm"><span className="text-texto-primario">{dinheiro(totalMes)} de {dinheiro(perfil.metaMensal)}</span><span className="text-texto-secundario">{Math.min(100, Math.round(metaPct))}%</span></div>
          <div className="mt-2"><BarraProgresso percentual={metaPct} cor={metaPct >= 100 ? "var(--cor-sucesso)" : "var(--cor-destaque)"} /></div>
        </Secao>
      )}

      {secao === "registrar" && (<>
      <Secao
        titulo={<><Pencil size={15} className="text-primaria" /> Perfil de renda</>}
        acao={!editandoPerfil && <Button tamanho="pequeno" variante="secundaria" onClick={() => setEditandoPerfil(true)}>{perfil.liquido ? "Editar" : "Cadastrar"}</Button>}
      >
        {editandoPerfil ? (
          <form onSubmit={salvarPerfil} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs text-texto-secundario">Salário bruto (R$)<input value={rascunho.bruto} onChange={(e) => setRascunho({ ...rascunho, bruto: e.target.value })} inputMode="decimal" className={`${CLASSE_INPUT} mt-1 w-full`} /></label>
            <label className="text-xs text-texto-secundario">Salário líquido (R$)<input value={rascunho.liquido} onChange={(e) => setRascunho({ ...rascunho, liquido: e.target.value })} inputMode="decimal" className={`${CLASSE_INPUT} mt-1 w-full`} /></label>
            <label className="text-xs text-texto-secundario">Dia do pagamento<input type="number" min={1} max={31} value={rascunho.dia} onChange={(e) => setRascunho({ ...rascunho, dia: e.target.value })} className={`${CLASSE_INPUT} mt-1 w-full`} /></label>
            <label className="text-xs text-texto-secundario">Vale-alimentação mensal (R$)<input value={rascunho.va} onChange={(e) => setRascunho({ ...rascunho, va: e.target.value })} inputMode="decimal" className={`${CLASSE_INPUT} mt-1 w-full`} /></label>
            <label className="text-xs text-texto-secundario">Meta de renda mensal (R$)<input value={rascunho.meta} onChange={(e) => setRascunho({ ...rascunho, meta: e.target.value })} inputMode="decimal" className={`${CLASSE_INPUT} mt-1 w-full`} /></label>
            <label className="text-xs text-texto-secundario">Horas trabalhadas por mês<input type="number" min={1} value={rascunho.horas} onChange={(e) => setRascunho({ ...rascunho, horas: e.target.value })} className={`${CLASSE_INPUT} mt-1 w-full`} /></label>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3"><Button type="submit">Salvar perfil</Button><Button type="button" variante="fantasma" onClick={() => setEditandoPerfil(false)}>Cancelar</Button></div>
          </form>
        ) : perfil.liquido ? (
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-texto-secundario">Líquido</dt><dd className="font-semibold text-texto-primario">{dinheiro(perfil.liquido)}</dd></div>
            <div><dt className="text-xs text-texto-secundario">Bruto</dt><dd className="font-semibold text-texto-primario">{perfil.bruto ? dinheiro(perfil.bruto) : "—"}</dd></div>
            <div><dt className="text-xs text-texto-secundario">Descontos</dt><dd className="font-semibold text-texto-primario">{descontos !== null ? `${dinheiro(descontos)} (${descontoPct!.toFixed(1)}%)` : "—"}</dd></div>
            <div><dt className="text-xs text-texto-secundario">Valor da hora</dt><dd className="font-semibold text-texto-primario">{valorHora ? dinheiro(valorHora) : "—"}</dd></div>
            <div><dt className="text-xs text-texto-secundario">Vale-alimentação</dt><dd className="font-semibold text-texto-primario">{perfil.vaMensal ? dinheiro(perfil.vaMensal) : "—"}</dd></div>
            <div><dt className="text-xs text-texto-secundario">Dia do pagamento</dt><dd className="font-semibold text-texto-primario">{perfil.diaPagamento}</dd></div>
            <div><dt className="text-xs text-texto-secundario">Meta mensal</dt><dd className="font-semibold text-texto-primario">{perfil.metaMensal ? dinheiro(perfil.metaMensal) : "—"}</dd></div>
            <div><dt className="text-xs text-texto-secundario">Projeção anual (estimativa)</dt><dd className="font-semibold text-texto-primario">{dinheiro(projecaoAnual)}</dd></div>
          </dl>
        ) : (
          <p className="text-sm text-texto-secundario">Cadastre seu salário líquido, dia de pagamento e vale-alimentação para ativar atalhos, projeções e a simulação de aumento.</p>
        )}
        {!editandoPerfil && perfil.liquido > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button tamanho="pequeno" onClick={() => registrarRapido("SALARIO")} disabled={recebeuSalarioMes} title={recebeuSalarioMes ? "O salário deste mês já foi registrado" : ""}>
              {recebeuSalarioMes ? "Salário do mês já registrado" : `Registrar salário de ${dinheiro(perfil.liquido)}`}
            </Button>
            {perfil.vaMensal > 0 && !recebimentos.some((r) => r.fonte === "BENEFICIO" && r.l.data.startsWith(mesAtual)) && (
              <Button tamanho="pequeno" variante="secundaria" onClick={() => registrarRapido("VA")}>Registrar VA de {dinheiro(perfil.vaMensal)}</Button>
            )}
          </div>
        )}
      </Secao>

      {contasDestino.length === 0 ? (
        <EmptyState titulo="Cadastre uma conta primeiro" descricao="Vá em Contas e cadastre a conta bancária onde o salário cai antes de registrar o recebimento." />
      ) : (
        <div className="rounded-xl border border-borda bg-cartao p-4">
          <RecebimentoForm contasDestino={contasDestino} onRegistrado={carregar} salarioLiquidoCentavos={perfil.liquido} vaMensalCentavos={perfil.vaMensal} />
        </div>
      )}

      </>)}

      {secao === "analises" && (<>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Secao titulo="Renda dos últimos 12 meses">
          <div className="h-52">
            {ocultar ? <p className="pt-20 text-center text-sm text-texto-secundario">Valores ocultos.</p> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie}>
                  <XAxis dataKey="nome" tick={{ fontSize: 10, fill: "var(--cor-texto-secundario)" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={(v) => formatarCentavos(Math.round(Number(v) * 100))} contentStyle={{ background: "var(--cor-superficie)", border: "1px solid var(--cor-borda)", borderRadius: 8, fontSize: 12 }} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="Salário" stackId="a" fill={FONTES.SALARIO.cor} />
                  <Bar dataKey="Benefícios" stackId="a" fill={FONTES.BENEFICIO.cor} />
                  <Bar dataKey="Renda extra" stackId="a" fill={FONTES.EXTRA.cor} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Secao>
        <Secao titulo={`Fontes em ${MESES[Number(hoje.slice(5, 7)) - 1]}`}>
          {porFonteMes.length === 0 ? <p className="text-sm text-texto-secundario">Nada recebido neste mês.</p> : (
            <div className="flex items-center gap-3">
              <div className="h-32 w-32 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={porFonteMes} dataKey="valor" nameKey="nome" innerRadius="60%" outerRadius="95%" stroke="none" paddingAngle={2}>{porFonteMes.map((f, i) => <Cell key={f.k} fill={f.cor ?? cores[i]} />)}</Pie></PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-1 text-xs">{porFonteMes.map((f) => <li key={f.k} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: f.cor }} /><span className="text-texto-secundario">{f.nome}</span><span className="tabular-nums text-texto-primario">{dinheiro(f.valor)}</span></li>)}</ul>
            </div>
          )}
          {rankingExtras.length > 0 && (
            <div className="mt-4 border-t border-borda pt-3">
              <p className="mb-1 text-xs font-semibold text-texto-secundario">Maiores fontes de renda extra</p>
              <ul className="space-y-1 text-xs">{rankingExtras.map(([nome, v]) => <li key={nome} className="flex justify-between"><span className="truncate text-texto-secundario">{nome}</span><span className="tabular-nums text-texto-primario">{dinheiro(v)}</span></li>)}</ul>
            </div>
          )}
        </Secao>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo={<><Calculator size={15} className="text-secundaria" /> Simulador de aumento</>}>
          {perfil.liquido > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Percent size={14} className="text-texto-secundario" />
                <input value={aumento} onChange={(e) => setAumento(e.target.value)} inputMode="decimal" aria-label="Percentual de aumento" className={`${CLASSE_INPUT} w-24`} />
                <label className="flex items-center gap-1.5 text-xs text-texto-secundario"><input type="checkbox" checked={incluir13} onChange={(e) => setIncluir13(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--cor-primaria)]" />Contar 13º salário</label>
              </div>
              <p className="mt-3 text-sm text-texto-primario">Novo líquido: <strong>{dinheiro(novoLiquido)}</strong> ({dinheiro(novoLiquido - perfil.liquido)} a mais por mês)</p>
              <p className="mt-1 text-sm text-texto-primario">Ganho em 12 meses: <strong className="text-sucesso">{dinheiro(ganhoAnual)}</strong></p>
              <p className="mt-2 text-[11px] text-texto-secundario">Estimativa simples: aplica o percentual direto no líquido, sem recalcular INSS/IR (as faixas de desconto podem mudar o resultado real).</p>
            </>
          ) : <p className="text-sm text-texto-secundario">Cadastre o salário líquido no perfil para simular.</p>}
        </Secao>
        <Secao titulo={<><Clock size={15} className="text-alerta" /> Para onde foi a renda</>}>
          {rendaReferencia > 0 ? (
            <>
              <div className="flex justify-between text-sm"><span className="text-texto-secundario">Renda de referência</span><span className="tabular-nums text-texto-primario">{dinheiro(rendaReferencia)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-texto-secundario">Gasto no mês</span><span className="tabular-nums text-erro">{dinheiro(gastoMes)}</span></div>
              <div className="mt-2"><BarraProgresso percentual={pctGasto} cor={pctGasto >= 100 ? "#ff2d55" : pctGasto >= 80 ? "var(--cor-alerta)" : "var(--cor-sucesso)"} /></div>
              <p className="mt-2 text-xs text-texto-secundario">Regra 50/30/20 sobre esta renda (sugestão): necessidades {dinheiro(Math.round(rendaReferencia * 0.5))} · desejos {dinheiro(Math.round(rendaReferencia * 0.3))} · poupar {dinheiro(Math.round(rendaReferencia * 0.2))}.</p>
            </>
          ) : <p className="text-sm text-texto-secundario">Registre um recebimento ou cadastre o perfil para ver a análise.</p>}
        </Secao>
      </div>

      </>)}

      {secao === "historico" && (
      <section className="rounded-xl border border-borda bg-cartao">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-4 py-3">
          <h2 className="text-sm font-semibold text-texto-primario">Histórico de recebimentos ({lista.length})</h2>
          <Select aria-label="Fonte" value={fonte} onValueChange={(v) => setFonte(v as Fonte)} options={[{ value: "TODAS", label: "Todas as fontes" }, ...Object.entries(FONTES).map(([value, f]) => ({ value, label: f.rotulo }))]} className="w-44" />
        </div>
        {lista.length === 0 ? (
          <div className="p-4"><EmptyState titulo="Nenhum recebimento ainda" descricao="Registre seu primeiro salário acima." /></div>
        ) : (
          <ul className="space-y-2 p-3">
            {lista.slice(0, 60).map(({ l, fonte: f, valor }) => (
              <li key={l.id} className="rounded-xl border px-3.5 py-2.5" style={{ borderColor: `color-mix(in srgb, ${FONTES[f].cor} 30%, transparent)`, backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${FONTES[f].cor} 9%, transparent), transparent 55%)` }}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <IconeCoisa nome={l.descricao} tamanho={34} redondo padrao={{ icone: f === "EXTRA" ? TrendingDown : Banknote, cor: FONTES[f].cor }} />
                    <div className="min-w-0">
                      {editandoId === l.id ? (
                        <div className="flex items-center gap-2"><input value={edDescricao} onChange={(e) => setEdDescricao(e.target.value)} aria-label="Descrição" className={`${CLASSE_INPUT} py-1`} /><Button tamanho="pequeno" onClick={() => salvarDescricao(l)}>Salvar</Button></div>
                      ) : <p className="truncate text-texto-primario">{l.descricao}</p>}
                      <p className="text-xs text-texto-secundario">{formatarDataISOParaBR(l.data)} · {FONTES[f].rotulo}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums font-semibold text-sucesso">+ {dinheiro(valor)}</span>
                    <button onClick={() => { setEditandoId(editandoId === l.id ? null : l.id); setEdDescricao(l.descricao); }} aria-label="Editar descrição" className="rounded-md p-1.5 text-texto-secundario hover:bg-borda/50 hover:text-primaria"><Pencil size={13} /></button>
                    <button onClick={() => estornar(l.id)} className="text-xs text-texto-secundario hover:text-erro hover:underline">Estornar</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}
    </div>
  );
}
