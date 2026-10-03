import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  CalendarClock,
  Bell,
  CreditCard,
  Landmark,
  Lightbulb,
  Lock,
  Receipt,
  RefreshCw,
  Send,
  ShieldCheck,
  Shield,
  Sparkles,
  Target,
  TrendingDown,
  User,
  Eye,
  EyeOff,
  Pencil,
  SlidersHorizontal,
  LayoutGrid,
} from "lucide-react";
import { contabilidade } from "../../services/contabilidade";
import { dataAtualISO, formatarCentavos, formatarDataISOParaBR, nomeMesAno, proximaDataComDia } from "../../services/formato";
import { despesasPorCategoriaNoMes, fluxoCaixaPorAno } from "../../services/agregacoes";
import { FinancialCalendar } from "./FinancialCalendar";
import { FluxoCaixaChart } from "./FluxoCaixaChart";
import { DespesasDonut } from "./DespesasDonut";
import { TransacoesRecentes } from "./TransacoesRecentes";
import { BannerMotivacional } from "./BannerMotivacional";
import { CardAtalho } from "./CardAtalho";
import { calcularPeriodo, SeletorPeriodo, type Periodo } from "./SeletorPeriodo";
import { StatusRodape } from "./StatusRodape";
import { CardDiagnosticoIA, CardResumoSemanal } from "./CardResumoSemanal";
import { PrimeirosPassos } from "../ajuda/PrimeirosPassos";
import { WidgetsInicio } from "./WidgetsInicio";
import { StatCard } from "../../components/ui/StatCard";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton, SkeletonStatCards, SkeletonLinhas } from "../../components/ui/Skeleton";
import { useThemeStore } from "../../state/theme-store";
import { useSegurancaStore } from "../../state/seguranca-store";
import { extras } from "../../services/extras";
import { usePreferencia } from "../../state/usePreferencia";
import { Abas, useAbaDaPagina } from "../../components/ui/Abas";
import { PainelInteligente, SECOES_PAINEL, type SecaoPainel } from "./PainelInteligente";
import type { Orcamento } from "../../types/extras";
import { BarraProgresso } from "../../components/ui/Campos";
import type { InfoBackup, Meta } from "../../types/extras";
import type { Agendamento, Conta, Lancamento, ResumoDashboard } from "../../types/accounting";
import { useAoAlterarDados } from "../../state/useAoAlterarDados";

export function DashboardPage() {
  const [resumo, setResumo] = useState<ResumoDashboard | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [recarga, setRecarga] = useState(0);
  useAoAlterarDados(() => setRecarga((r) => r + 1));
  const [nomeUsuario, setNomeUsuario] = usePreferencia<string>("nome_usuario", "");
  const [colunaRecolhida, setColunaRecolhida] = usePreferencia<boolean>("dashboard_coluna_recolhida", false);
  const [editandoNome, setEditandoNome] = useState(false);
  const [rascunhoNome, setRascunhoNome] = useState("");
  const [ocultar, setOcultar] = usePreferencia<boolean>("ocultar_saldos", false);
  const [secoesOcultas, setSecoesOcultas] = usePreferencia<SecaoPainel[]>("dashboard_secoes_ocultas", []);
  const [personalizando, setPersonalizando] = useState(false);
  const [perfilRenda] = usePreferencia<{ liquido: number; vaMensal: number; diaPagamento: number } | null>("perfil_renda", null);
  const [secao, setSecao] = useAbaDaPagina<"resumo" | "analises" | "movimentacoes">("dashboard", "resumo");
  const [ultimoBackup, setUltimoBackup] = useState<InfoBackup | null>(null);
  const pinAtivo = useSegurancaStore((s) => s.pinAtivo);
  const totalGuardado = metas.reduce((s, m) => s + m.guardado_centavos, 0);
  const hoje = dataAtualISO();
  const [periodo, setPeriodo] = useState<Periodo>(() => calcularPeriodo("este-mes", hoje));
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const temaAtivo = useThemeStore((s) => s.temaAtivo());

  const anoAtual = Number(hoje.slice(0, 4));
  const inicioMes = periodo.inicio;
  const fimMes = periodo.fim;
  const ehMesAtual = periodo.id === "este-mes";

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      try {
        const [resumoResp, lancamentosResp, contasResp, agendamentosResp, metasResp, backupsResp, orcamentosResp] = await Promise.all([
          contabilidade.obterResumoDashboard(inicioMes, fimMes),
          contabilidade.listarLancamentos(3000),
          contabilidade.listarContas(),
          contabilidade.listarAgendamentos(),
          extras.listarMetas(),
          extras.listarBackups().catch(() => [] as InfoBackup[]),
          extras.listarOrcamentos(),
        ]);
        if (cancelado) return;
        setMetas(metasResp);
        setOrcamentos(orcamentosResp);
        setUltimoBackup(backupsResp.find((b) => !b.nome.startsWith("antes-de-restaurar")) ?? null);
        setResumo(resumoResp);
        setLancamentos(lancamentosResp);
        setContas(contasResp);
        setAgendamentos(agendamentosResp);
        setErro(null);
      } catch (e) {
        if (!cancelado) setErro(String(e));
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }
    carregar();
    return () => {
      cancelado = true;
    };
  }, [inicioMes, fimMes, recarga]);

  if (carregando) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <SkeletonStatCards />
        <div className="rounded-xl border border-borda bg-cartao">
          <SkeletonLinhas quantidade={5} />
        </div>
      </div>
    );
  }

  if (erro) {
    return <EmptyState titulo="Não foi possível carregar o painel" descricao={erro} />;
  }

  const despesasPorCategoria = despesasPorCategoriaNoMes(lancamentos, contas, inicioMes, fimMes);
  const maiorDespesa = despesasPorCategoria[0] ?? null;

  const lancamentosDoMes = lancamentos.filter((l) => l.data >= inicioMes && l.data <= fimMes);

  const recebimentoSalario = lancamentos
    .filter((l) => l.origem === "SALARIO" && l.data >= inicioMes && l.data <= fimMes)
    .sort((a, b) => a.data.localeCompare(b.data))[0];

  const cartoes = contas.filter((c) => c.tipo === "PASSIVO" && c.subtipo === "CARTAO_CREDITO");
  const limiteTotal = cartoes.reduce((soma, c) => soma + (c.limite_centavos ?? 0), 0);
  const limiteDisponivel = cartoes.reduce(
    (soma, c) => soma + ((c.limite_centavos ?? 0) - c.saldo_atual_centavos),
    0,
  );

  const contasAPagar = agendamentos.filter((a) => !a.pago_em && a.tipo !== "RECEBER");
  const totalAPagar = contasAPagar.reduce((soma, a) => soma + a.valor_centavos, 0);
  const atrasadas = contasAPagar.filter((a) => a.vencimento < hoje).length;

  const vencimentos = [
    ...cartoes
      .filter((c) => c.dia_vencimento_fatura != null && c.saldo_atual_centavos > 0)
      .map((c) => ({
        nome: c.nome,
        data: proximaDataComDia(c.dia_vencimento_fatura!),
        valorCentavos: c.saldo_atual_centavos,
      })),
    ...contasAPagar.map((a) => ({ nome: a.descricao, data: a.vencimento, valorCentavos: a.valor_centavos })),
  ].sort((a, b) => a.data.localeCompare(b.data));

  const dadosFluxo = fluxoCaixaPorAno(lancamentos, contas, anoAtual).map((m) => ({
    nome: m.mes,
    Receitas: m.receitasCentavos / 100,
    Despesas: m.despesasCentavos / 100,
    Saldo: m.saldoCentavos / 100,
  }));
  const mesAbrev = dadosFluxo[Number(hoje.slice(5, 7)) - 1].nome;

  const hora = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  const saudacao = hora < 5 ? "Boa madrugada" : hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const dinheiro = (v: number) => (ocultar ? "R$ ••••" : formatarCentavos(v));

  // Previsão do que ainda entra no mês, a partir do perfil de renda (aba Salário e Renda).
  const mesAtualISO = hoje.slice(0, 7);
  const recebeuNoMes = (contaReceita: string) =>
    lancamentos.some((l) => l.data.startsWith(mesAtualISO) && l.origem !== "ESTORNO" && l.partidas.some((p) => p.conta_id === contaReceita && p.tipo === "CREDITO"));
  const aReceber = (() => {
    if (!perfilRenda || perfilRenda.liquido <= 0) return { valor: 0, texto: "Cadastre o perfil de renda em Salário" };
    const salario = recebeuNoMes("receita-salario") ? 0 : perfilRenda.liquido;
    const va = perfilRenda.vaMensal > 0 && !recebeuNoMes("receita-beneficios") ? perfilRenda.vaMensal : 0;
    const valor = salario + va;
    if (valor === 0) return { valor: 0, texto: "Salário do mês já recebido" };
    const dia = Math.min(perfilRenda.diaPagamento || 5, Number(fimMes.slice(8, 10)));
    return { valor, texto: `Previsto para ${String(dia).padStart(2, "0")}/${mesAtualISO.slice(5, 7)}${va && salario ? " (salário + VA)" : va ? " (VA)" : ""}` };
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primaria/10 text-primaria">
            <User size={20} />
          </span>
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold text-texto-primario">
              {saudacao}{nomeUsuario ? `, ${nomeUsuario}` : ""}!
              <button onClick={() => { setRascunhoNome(nomeUsuario); setEditandoNome(true); }} aria-label="Definir seu nome" title="Definir seu nome" className="rounded p-1 text-texto-secundario hover:text-primaria"><Pencil size={12} /></button>
            </h1>
            {editandoNome && (
              <form onSubmit={(e) => { e.preventDefault(); setNomeUsuario(rascunhoNome.trim()); setEditandoNome(false); }} className="mt-1 flex items-center gap-2">
                <input autoFocus value={rascunhoNome} onChange={(e) => setRascunhoNome(e.target.value)} placeholder="Seu nome" aria-label="Seu nome" className="rounded-lg border border-borda bg-fundo px-2 py-1 text-sm text-texto-primario outline-none focus:border-primaria" />
                <button type="submit" className="text-xs text-primaria hover:underline">Salvar</button>
              </form>
            )}
            <p className="text-sm text-texto-secundario">Aqui está o resumo da sua vida financeira.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setOcultar(!ocultar)} aria-label="Ocultar ou mostrar valores" title={ocultar ? "Mostrar valores" : "Ocultar valores"} className="rounded-xl border border-borda bg-cartao p-2.5 text-texto-secundario transition-colors hover:text-primaria">{ocultar ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          <div className="relative">
            <button onClick={() => setPersonalizando((v) => !v)} aria-label="Personalizar painel" title="Personalizar painel" className="rounded-xl border border-borda bg-cartao p-2.5 text-texto-secundario transition-colors hover:text-primaria"><SlidersHorizontal size={16} /></button>
            {personalizando && (
              <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-borda bg-superficie p-3 shadow-[0_16px_40px_-12px_rgba(0,0,0,.7)]">
                <p className="mb-2 text-xs font-semibold text-texto-secundario">Seções do painel</p>
                {SECOES_PAINEL.map((sec) => (
                  <label key={sec.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm text-texto-primario">
                    <input type="checkbox" checked={!secoesOcultas.includes(sec.id)} onChange={() => setSecoesOcultas(secoesOcultas.includes(sec.id) ? secoesOcultas.filter((x) => x !== sec.id) : [...secoesOcultas, sec.id])} className="h-4 w-4 accent-[var(--cor-primaria)]" />
                    {sec.rotulo}
                  </label>
                ))}
                <button onClick={() => setPersonalizando(false)} className="mt-2 text-xs text-primaria hover:underline">Fechar</button>
              </div>
            )}
          </div>
          <SeletorPeriodo periodo={periodo} hoje={hoje} onChange={setPeriodo} />
        </div>
      </div>

      <Abas
        ativa={secao}
        onChange={setSecao}
        abas={[
          { id: "resumo", rotulo: "Resumo", icone: LayoutGrid },
          { id: "analises", rotulo: "Análises e alertas", icone: Sparkles },
          { id: "movimentacoes", rotulo: "Movimentações e calendário", icone: CalendarClock },
        ]}
      />

      <div className={`grid grid-cols-1 gap-6 ${colunaRecolhida ? "" : "xl:grid-cols-[1fr_320px]"}`}>
        <div className="min-w-0 space-y-6">
          {secao === "resumo" && (<>
          <PrimeirosPassos compacto />
          <CardDiagnosticoIA oculto={ocultar} />
          <CardResumoSemanal dinheiro={dinheiro} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              titulo="Saldo em Conta"
              valor={dinheiro(resumo?.saldo_disponivel_centavos ?? 0)}
              icone={Landmark}
              corIcone="sucesso"
            />
            <StatCard
              titulo={ehMesAtual ? "Salário do Mês" : "Receitas no Período"}
              valor={dinheiro(resumo?.receitas_mes_centavos ?? 0)}
              subtitulo={recebimentoSalario ? `Recebido em ${formatarDataISOParaBR(recebimentoSalario.data)}` : ehMesAtual ? "Ainda não recebido este mês" : "Sem salário registrado no período"}
              icone={Banknote}
              corIcone="secundaria"
            />
            <StatCard
              titulo={maiorDespesa ? `Maior Despesa · ${maiorDespesa.nome}` : "Maior Despesa"}
              valor={dinheiro(maiorDespesa?.valorCentavos ?? 0)}
              icone={TrendingDown}
              corIcone="destaque"
            />
            <StatCard
              titulo={ehMesAtual ? "Despesas do Mês" : "Despesas no Período"}
              valor={dinheiro(resumo?.despesas_mes_centavos ?? 0)}
              subtitulo={`${lancamentosDoMes.length} lançamento(s) ${ehMesAtual ? "este mês" : "no período"}`}
              icone={Receipt}
              corIcone="alerta"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
            <div className="rounded-xl border border-borda bg-cartao p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="whitespace-nowrap text-sm font-semibold text-texto-primario">Fluxo de Caixa Mensal</h2>
                <div className="flex items-center gap-3 whitespace-nowrap text-[11px] text-texto-secundario">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sucesso" />Receitas</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-erro" />Despesas</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primaria" />Saldo</span>
                </div>
              </div>
              <div className="mt-2 h-60">
                <FluxoCaixaChart dados={dadosFluxo} mesAtual={mesAbrev} anoAtual={anoAtual} />
              </div>
            </div>

            <DespesasDonut
              fatias={despesasPorCategoria}
              cores={temaAtivo.cores.grafico}
              mesPorExtenso={ehMesAtual ? `em ${nomeMesAno(hoje).toLowerCase()}` : "no período selecionado"}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CardAtalho
              to="/lancamentos"
              titulo="Contas a Pagar"
              valor={formatarCentavos(totalAPagar)}
              subtitulo={
                contasAPagar.length === 0
                  ? "Nenhuma conta cadastrada"
                  : `${contasAPagar.length} em aberto${atrasadas > 0 ? ` · ${atrasadas} atrasada(s)` : ""}`
              }
              icone={Receipt}
              cor="erro"
            />
            <CardAtalho
              to="/salario"
              titulo="Receber"
              valor={dinheiro(aReceber.valor)}
              subtitulo={aReceber.texto}
              icone={Banknote}
              cor="sucesso"
            />
            <CardAtalho
              to="/cartoes"
              titulo="Limite dos Cartões"
              valor={formatarCentavos(limiteDisponivel)}
              subtitulo={<>Disponível de <span className="text-primaria">{formatarCentavos(limiteTotal)}</span></>}
              icone={CreditCard}
              cor="primaria"
            />
            <CardAtalho
              to="/metas"
              titulo="Metas Ativas"
              valor={`${metas.length} ${metas.length === 1 ? "meta" : "metas"}`}
              subtitulo={formatarCentavos(totalGuardado) + " acumulado"}
              icone={Target}
              cor="destaque"
            />
          </div>
          <WidgetsInicio contas={contas} lancamentos={lancamentos} agendamentos={agendamentos} metas={metas} hoje={hoje} dinheiro={dinheiro} />

          </>)}

          {secao === "analises" && (<>
            <div className="rounded-xl border border-borda bg-cartao p-4">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-texto-primario">
                  <Sparkles size={16} className="text-primaria" /> Assistente Financeiro IA
                </h2>
                <span className="rounded-full bg-borda px-2 py-0.5 text-[10px] font-medium text-texto-secundario">
                  Gemini
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-texto-secundario">
                Ainda não conectado. Adicione sua chave do Google Gemini em Configurações para receber análises e
                projeções — sempre indicando o que é dado real e o que é estimativa.
              </p>
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-texto-secundario">
                Prévia do que você vai receber
              </p>
              <ul className="mt-2 space-y-2">
                {[
                  { icone: ShieldCheck, cor: "var(--cor-sucesso)", texto: "Resumo dos gastos do período e o peso de cada categoria no seu orçamento." },
                  { icone: Lightbulb, cor: "var(--cor-destaque)", texto: "Sugestões de ajuste de orçamento — você decide se aplica ou não." },
                  { icone: CalendarClock, cor: "var(--cor-primaria)", texto: "Aviso dos próximos vencimentos e projeção do saldo." },
                ].map((topico) => (
                  <li
                    key={topico.texto}
                    className="flex items-start gap-2.5 rounded-lg border border-dashed border-borda bg-fundo/50 p-2.5"
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: topico.cor, boxShadow: `0 0 10px -2px ${topico.cor}` }}
                    >
                      <topico.icone size={14} strokeWidth={2.2} />
                    </span>
                    <span className="text-xs leading-snug text-texto-secundario">{topico.texto}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/ia"
                className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-primaria to-destaque py-2 text-xs font-medium text-primaria-texto shadow-[0_2px_14px_-4px_var(--cor-primaria)] transition-[transform] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97]"
              >
                Configurar IA →
              </Link>
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-borda bg-fundo px-3 py-2">
                <input
                  disabled
                  placeholder="Digite sua dúvida…"
                  className="flex-1 bg-transparent text-xs text-texto-secundario outline-none"
                />
                <Send size={14} className="text-texto-secundario" />
              </div>
            </div>
            <PainelInteligente
              dados={{ hoje, contas, lancamentos, agendamentos, metas, orcamentos, ultimoBackup }}
              visiveis={new Set(SECOES_PAINEL.map((x) => x.id).filter((id) => !secoesOcultas.includes(id)))}
              ocultar={ocultar}
              onLancado={() => setRecarga((n) => n + 1)}
            />
          </>)}

          {secao === "movimentacoes" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.15fr]">
              <TransacoesRecentes lancamentos={lancamentos} contas={contas} />
              <FinancialCalendar eventos={vencimentos} />
            </div>
          )}
          {secao === "movimentacoes" && <BannerMotivacional />}
        </div>

        <div className="space-y-4">
          <button onClick={() => setColunaRecolhida(!colunaRecolhida)} className="hidden w-full items-center justify-end gap-1 text-xs text-texto-secundario hover:text-primaria xl:flex" aria-label={colunaRecolhida ? "Mostrar coluna lateral" : "Recolher coluna lateral"}>{colunaRecolhida ? "Mostrar painel lateral" : "Recolher painel lateral →"}</button>
          <div className={`space-y-4 ${colunaRecolhida ? "xl:hidden" : ""}`}>
          <div className="rounded-xl border border-borda bg-cartao p-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-texto-primario">
                <Target size={16} className="text-destaque" /> Metas Financeiras
              </h2>
              <Link to="/metas" className="text-xs text-primaria hover:underline">
                Ver todas
              </Link>
            </div>
            {metas.length === 0 ? (
              <p className="mt-3 text-xs text-texto-secundario">Nenhuma meta cadastrada ainda.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {metas.slice(0, 3).map((m) => {
                  const pct = (m.guardado_centavos / m.valor_alvo_centavos) * 100;
                  return (
                    <li key={m.id}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="truncate text-texto-primario">{m.nome}</span>
                        <span className="tabular-nums text-texto-secundario">{Math.min(100, Math.round(pct))}%</span>
                      </div>
                      <BarraProgresso percentual={pct} cor="var(--cor-destaque)" altura={6} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-borda bg-cartao p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-texto-primario">
              <Bell size={16} className="text-alerta" /> Próximos Vencimentos
            </h2>
            {vencimentos.length === 0 ? (
              <p className="mt-3 text-xs text-texto-secundario">Nenhum vencimento cadastrado.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {vencimentos.slice(0, 5).map((ev) => {
                  const vencido = ev.data < hoje;
                  return (
                    <li key={ev.nome + ev.data} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2.5 text-texto-primario">
                        <IconeCoisa nome={ev.nome} tamanho={26} padrao={{ icone: CreditCard, cor: "#a855f7" }} />
                        {ev.nome}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums text-xs text-texto-secundario">
                          {formatarCentavos(ev.valorCentavos)}
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            vencido ? "bg-erro/15 text-erro" : "bg-sucesso/15 text-sucesso"
                          }`}
                        >
                          {vencido ? "Vencido" : "Em dia"}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <StatusRodape
            itens={[
              {
                titulo: "Backup",
                status: ultimoBackup ? `Último: ${ultimoBackup.criado_em.slice(8, 10)}/${ultimoBackup.criado_em.slice(5, 7)}/${ultimoBackup.criado_em.slice(0, 4)}` : "Nunca realizado",
                icone: Shield,
                cor: "sucesso",
                corStatus: ultimoBackup ? "sucesso" : "alerta",
                to: "/backup",
              },
              { titulo: "Sincronização", status: "Desativada", icone: RefreshCw, cor: "primaria", corStatus: "primaria", to: "/configuracoes" },
              {
                titulo: "Modo Seguro",
                status: pinAtivo ? "PIN ativo" : "Desativado",
                icone: Lock,
                cor: "destaque",
                corStatus: pinAtivo ? "sucesso" : "destaque",
                to: "/backup",
              },
            ]}
          />
          </div>
        </div>
      </div>
    </div>
  );
}
