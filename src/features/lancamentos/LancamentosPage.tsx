import { useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Clock, History, PenLine, TriangleAlert } from "lucide-react";
import { Abas, useAbaDaPagina } from "../../components/ui/Abas";
import { toast } from "sonner";
import { usePreferencia } from "../../state/usePreferencia";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton, SkeletonLinhas } from "../../components/ui/Skeleton";
import { StatCard } from "../../components/ui/StatCard";
import { contabilidade } from "../../services/contabilidade";
import { dataAtualISO, formatarCentavos, primeiroDiaDoMesISO, ultimoDiaDoMesISO } from "../../services/formato";
import type { Agendamento, Conta, Lancamento, ResumoDashboard } from "../../types/accounting";
import { AgendamentoForm } from "./AgendamentoForm";
import { ContasAPagar } from "./ContasAPagar";
import { DespesaForm, type DespesaInicial } from "./DespesaForm";
import { HistoricoLancamentos } from "./HistoricoLancamentos";
import { ImportarExtratoForm } from "./ImportarExtratoForm";
import { NovaReceitaForm } from "./NovaReceitaForm";
import { TransferenciaForm } from "./TransferenciaForm";
import type { AnaliseLancamento } from "./analise";
import { useAoAlterarDados } from "../../state/useAoAlterarDados";

type Aba = "despesa" | "receita" | "agendar" | "transferencia" | "importar";

export function LancamentosPage() {
  const [aba, setAba] = useState<Aba>("despesa");
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [resumo, setResumo] = useState<ResumoDashboard | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [duplicando, setDuplicando] = useState<{ chave: number; dados: DespesaInicial } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [secao, setSecao] = useAbaDaPagina<"lancar" | "pagar" | "historico">("lancamentos", "lancar");
  const [contaPadrao] = usePreferencia<string>("conta_padrao", "");
  const [categoriaPadrao] = usePreferencia<string>("categoria_padrao", "");

  useAoAlterarDados(() => {
    carregar().catch(() => {});
  });

  async function carregar() {
    const hoje = dataAtualISO();
    const [c, l, a, r] = await Promise.all([
      contabilidade.listarContas(),
      contabilidade.listarLancamentos(2000),
      contabilidade.listarAgendamentos(),
      contabilidade.obterResumoDashboard(primeiroDiaDoMesISO(hoje), ultimoDiaDoMesISO(hoje)),
    ]);
    setContas(c);
    setLancamentos(l);
    setAgendamentos(a);
    setResumo(r);
    setCarregando(false);
  }

  useEffect(() => {
    carregar().catch((e) => {
      toast.error(String(e));
      setCarregando(false);
    });
  }, []);

  if (carregando) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <div className="rounded-xl border border-borda bg-cartao">
          <SkeletonLinhas quantidade={6} />
        </div>
      </div>
    );
  }

  const ativas = contas.filter((c) => c.ativa);
  const contasPagaveis = ativas.filter((c) => (c.tipo === "ATIVO" || c.tipo === "PASSIVO") && c.subtipo !== "CATEGORIA");
  const categoriasDespesa = ativas.filter((c) => c.tipo === "DESPESA" && c.subtipo !== "CATEGORIA");
  const categoriasReceita = ativas.filter((c) => c.tipo === "RECEITA" && c.subtipo !== "CATEGORIA");
  const contasAtivas = ativas.filter((c) => c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA");

  const hoje = dataAtualISO();
  const abertos = agendamentos.filter((a) => !a.pago_em && a.tipo !== "RECEBER");
  const atrasados = abertos.filter((a) => a.vencimento < hoje);
  const totalAberto = abertos.reduce((s, a) => s + a.valor_centavos, 0);
  const totalAtrasado = atrasados.reduce((s, a) => s + a.valor_centavos, 0);

  function duplicar(l: Lancamento, a: AnaliseLancamento) {
    const origem = l.partidas.find((p) => p.tipo === "CREDITO");
    setDuplicando({
      chave: Date.now(),
      dados: {
        descricao: l.descricao,
        valorCentavos: a.valorCentavos,
        contaOrigemId: origem?.conta_id,
        categoriaId: a.categoria?.id,
        etiqueta: l.etiqueta,
        observacao: l.observacao,
      },
    });
    setAba("despesa");
    setSecao("lancar");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast.info("Formulário preenchido com a despesa duplicada. Ajuste e registre.");
  }

  const abas: Array<{ id: Aba; rotulo: string }> = [
    { id: "despesa", rotulo: "Nova despesa" },
    { id: "receita", rotulo: "Nova receita" },
    { id: "agendar", rotulo: "Agendar (pagar ou receber)" },
    { id: "transferencia", rotulo: "Transferência entre contas" },
    { id: "importar", rotulo: "Importar extrato" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-texto-primario">Despesas e Receitas</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard titulo="Receitas do mês" valor={formatarCentavos(resumo?.receitas_mes_centavos ?? 0)} corValor="sucesso" icone={ArrowDownLeft} corIcone="sucesso" subtitulo="Entradas já recebidas" />
        <StatCard titulo="Despesas do mês" valor={formatarCentavos(resumo?.despesas_mes_centavos ?? 0)} corValor="erro" icone={ArrowUpRight} corIcone="erro" subtitulo="Saídas já pagas" />
        <StatCard titulo="A pagar" valor={formatarCentavos(totalAberto)} icone={Clock} corIcone="alerta" subtitulo={abertos.length === 0 ? "Nenhuma conta agendada" : `${abertos.length} conta(s) em aberto`} />
        <StatCard titulo="Em atraso" valor={formatarCentavos(totalAtrasado)} corValor={atrasados.length > 0 ? "erro" : "normal"} icone={TriangleAlert} corIcone="erro" subtitulo={atrasados.length === 0 ? "Tudo em dia" : `${atrasados.length} conta(s) vencida(s)`} />
      </div>

      <Abas
        ativa={secao}
        onChange={setSecao}
        abas={[
          { id: "lancar", rotulo: "Lançar", icone: PenLine },
          { id: "pagar", rotulo: "Agenda (pagar e receber)", icone: CalendarClock, contador: abertos.length },
          { id: "historico", rotulo: "Histórico", icone: History },
        ]}
      />

      {secao === "lancar" && (contasAtivas.length === 0 ? (
        <EmptyState titulo="Cadastre uma conta antes de lançar" descricao="Vá em Contas e cadastre sua conta bancária, carteira ou dinheiro em espécie primeiro." />
      ) : (
        <div ref={formRef} className="rounded-xl border border-borda bg-cartao p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {abas.map((a) => (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  aba === a.id
                    ? "bg-gradient-to-r from-primaria to-destaque text-primaria-texto shadow-[0_4px_16px_-6px_var(--cor-primaria)]"
                    : "text-texto-secundario hover:bg-borda/40"
                }`}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
          {aba === "despesa" && (
            <DespesaForm
              key={duplicando?.chave ?? "novo"}
              contasOrigem={contasPagaveis}
              categoriasDespesa={categoriasDespesa}
              onRegistrada={() => {
                setDuplicando(null);
                carregar();
              }}
              inicial={duplicando?.dados}
              contaPadraoId={contaPadrao}
              categoriaPadraoId={categoriaPadrao}
              lancamentos={lancamentos}
            />
          )}
          {aba === "receita" && <NovaReceitaForm contasDestino={contasAtivas} categoriasReceita={categoriasReceita} onRegistrada={carregar} />}
          {aba === "agendar" && <AgendamentoForm categoriasDespesa={categoriasDespesa} categoriasReceita={categoriasReceita} contas={contasPagaveis} onCriado={carregar} />}
          {aba === "transferencia" && <TransferenciaForm contas={contasAtivas} onRegistrada={carregar} />}
          {aba === "importar" && (
            <ImportarExtratoForm contasAtivas={contasAtivas} categoriasDespesa={categoriasDespesa} lancamentos={lancamentos} onImportado={carregar} />
          )}
        </div>
      ))}

      {secao === "pagar" && <ContasAPagar agendamentos={agendamentos} contasPagaveis={contasPagaveis} onAlterado={carregar} />}

      {secao === "historico" && <HistoricoLancamentos lancamentos={lancamentos} contas={contas} onAlterado={carregar} onDuplicar={duplicar} />}
    </div>
  );
}
