import { useState } from "react";
import { CheckSquare, Copy, Download, Merge, Palette, PiggyBank, ReceiptText, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { exportarCsv, reais } from "../../services/exportacao";
import { extras } from "../../services/extras";
import { centavosParaValorInput, dataAtualISO, formatarDataISOParaBR, valorInputParaCentavos } from "../../services/formato";
import { gestao, type UsoDaConta } from "../../services/gestao";
import { usePreferencia } from "../../state/usePreferencia";
import { avisarDadosAlterados } from "../../state/useAoAlterarDados";
import type { Conta, Lancamento } from "../../types/accounting";
import { extratoDaConta, textoDadosBancarios, type DadosBancarios } from "./ferramentasContas";

type Aba = "extrato" | "conferir" | "dados" | "mais";
const CORES = ["#1677ff", "#00d395", "#8b5cf6", "#ff7a00", "#ff2d55", "#00bae6", "#e5b400", "#7d8597"];

const somarDias = (iso: string, d: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + d)).toISOString().slice(0, 10);

interface Props {
  conta: Conta;
  /** Contas do mesmo tipo (destino de transferência/junção). */
  outras: Conta[];
  lancamentos: Lancamento[];
  dinheiro: (v: number) => string;
  onAlterado: () => void;
  /** Rótulo do tipo, para as mensagens ("conta", "cartão"). */
  rotulo?: string;
}

/** Ferramentas de uma conta: extrato filtrável, conferência, dados bancários e ações (excluir, juntar…). */
export function PainelConta({ conta, outras, lancamentos, dinheiro, onAlterado, rotulo = "conta" }: Props) {
  const hoje = dataAtualISO();
  const [aba, setAba] = useState<Aba>("extrato");
  const [inicio, setInicio] = useState(somarDias(hoje, -90));
  const [fim, setFim] = useState(hoje);
  const [busca, setBusca] = useState("");
  const [conferidos, setConferidos] = usePreferencia<Record<string, string[]>>("conferidos_contas", {});
  const [dadosTodos, setDadosTodos] = usePreferencia<Record<string, DadosBancarios>>("dados_bancarios", {});
  const [minimos, setMinimos] = usePreferencia<Record<string, number>>("saldo_minimo_contas", {});
  const [cores, setCores] = usePreferencia<Record<string, string>>("cores_contas", {});
  const [dados, setDados] = useState<DadosBancarios>(dadosTodos[conta.id] ?? {});
  const [minimo, setMinimo] = useState(minimos[conta.id] !== undefined ? centavosParaValorInput(minimos[conta.id]) : "");
  const [rendimento, setRendimento] = useState("");
  const [tarifa, setTarifa] = useState({ valor: "", dia: "10" });
  const [destino, setDestino] = useState("");
  const [uso, setUso] = useState<UsoDaConta | null>(null);
  const [confirmar, setConfirmar] = useState("");

  const linhas = extratoDaConta(conta, lancamentos, inicio, fim, busca);
  const meusConferidos = new Set(conferidos[conta.id] ?? []);
  const todasLinhas = extratoDaConta(conta, lancamentos, "0000-01-01", "9999-12-31");
  const naoConferidas = todasLinhas.filter((l) => !meusConferidos.has(l.lancamento.id));
  const saldoConferido = todasLinhas.filter((l) => meusConferidos.has(l.lancamento.id)).reduce((s, l) => s + l.valor, 0);

  async function executar(acao: () => Promise<unknown>, ok: string) {
    try {
      await acao();
      toast.success(ok);
      avisarDadosAlterados();
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  function alternarConferido(id: string) {
    const s = new Set(meusConferidos);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setConferidos({ ...conferidos, [conta.id]: [...s] });
  }

  async function exportarExtrato() {
    try {
      const caminho = await exportarCsv(
        `extrato-${conta.nome}`,
        ["Data", "Descrição", "Valor (R$)", "Saldo (R$)", "Conferido"],
        linhas.map((l) => [formatarDataISOParaBR(l.lancamento.data), l.lancamento.descricao, reais(l.valor), reais(l.saldo), meusConferidos.has(l.lancamento.id) ? "sim" : ""]),
      );
      toast.success(`Extrato salvo em ${caminho}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function lancarRendimento() {
    const v = valorInputParaCentavos(rendimento);
    if (v <= 0) return toast.error("Informe o rendimento.");
    await executar(() => contabilidade.registrarRecebimento({ conta_destino_id: conta.id, conta_receita_id: "receita-investimentos", valor_centavos: v, data: hoje, descricao: `Rendimento — ${conta.nome}` }), "Rendimento lançado.");
    setRendimento("");
  }

  async function agendarTarifa() {
    const v = valorInputParaCentavos(tarifa.valor);
    const dia = Math.min(28, Math.max(1, Number(tarifa.dia) || 10));
    if (v <= 0) return toast.error("Informe o valor da tarifa.");
    await executar(async () => {
      const todas = await contabilidade.listarContas();
      const cat = todas.find((c) => c.tipo === "DESPESA" && c.nome.toLowerCase() === "tarifas bancárias")?.id ?? (await extras.criarCategoria("Tarifas bancárias", "DESPESA"));
      const base = `${hoje.slice(0, 8)}${String(dia).padStart(2, "0")}`;
      const venc = base >= hoje ? base : new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7), dia)).toISOString().slice(0, 10);
      await contabilidade.criarAgendamento({ descricao: `Tarifa — ${conta.nome}`, valor_centavos: v, vencimento: venc, categoria_despesa_id: cat, recorrencia: "MENSAL", etiqueta: "FIXO", tipo: "PAGAR", automatico: true, conta_id: conta.id });
    }, "Tarifa mensal agendada: será lançada sozinha todo mês.");
    setTarifa({ ...tarifa, valor: "" });
  }

  async function prepararExclusao() {
    try {
      setUso(await gestao.usoDaConta(conta.id));
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function excluir(apagarHistorico: boolean) {
    try {
      if (apagarHistorico) await extras.criarBackup();
      const n = await gestao.excluirConta(conta.id, apagarHistorico);
      toast.success(`${rotulo[0].toUpperCase() + rotulo.slice(1)} “${conta.nome}” excluída${n ? ` com ${n} lançamento(s)` : ""}.${apagarHistorico ? " Um backup foi feito antes." : ""}`);
      avisarDadosAlterados();
      onAlterado();
    } catch (e) {
      toast.error(String(e), { duration: 10000 });
    }
  }

  async function juntar() {
    if (!destino) return toast.error("Escolha a conta que vai ficar.");
    const alvo = outras.find((c) => c.id === destino);
    await executar(async () => {
      await extras.criarBackup();
      await gestao.mesclarContas(conta.id, destino);
    }, `“${conta.nome}” foi juntada em “${alvo?.nome}”. Um backup foi feito antes.`);
  }

  const botaoAba = (id: Aba, texto: string) => (
    <button onClick={() => setAba(id)} className={`rounded-full px-2.5 py-1 text-[11px] ${aba === id ? "bg-primaria text-primaria-texto" : "bg-superficie text-texto-secundario hover:text-texto-primario"}`}>{texto}</button>
  );

  return (
    <div className="mt-3 space-y-3 border-t border-borda pt-3 text-xs">
      <div className="flex flex-wrap gap-1.5">
        {botaoAba("extrato", "Extrato")}
        {botaoAba("conferir", `Conferir${naoConferidas.length ? ` (${naoConferidas.length})` : ""}`)}
        {botaoAba("dados", "Dados bancários")}
        {botaoAba("mais", "Mais ações")}
      </div>

      {aba === "extrato" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} aria-label="Extrato de" className={`${CLASSE_INPUT} w-36 py-1`} />
            <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} aria-label="Extrato até" className={`${CLASSE_INPUT} w-36 py-1`} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" aria-label="Buscar no extrato" className={`${CLASSE_INPUT} w-28 py-1`} />
            <button onClick={exportarExtrato} disabled={!linhas.length} className="inline-flex items-center gap-1 text-primaria hover:underline disabled:opacity-50"><Download size={12} /> CSV</button>
          </div>
          {linhas.length === 0 ? <p className="text-texto-secundario">Sem movimentações no período.</p> : (
            <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {[...linhas].reverse().map((l) => (
                <li key={l.lancamento.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-texto-secundario">{formatarDataISOParaBR(l.lancamento.data).slice(0, 5)} · <span className="text-texto-primario">{l.lancamento.descricao}</span></span>
                  <span className="shrink-0 tabular-nums"><span className={l.valor >= 0 ? "text-sucesso" : "text-erro"}>{l.valor >= 0 ? "+" : "−"} {dinheiro(Math.abs(l.valor))}</span><span className="ml-2 text-texto-secundario">{dinheiro(l.saldo)}</span></span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-texto-secundario">Entradas {dinheiro(linhas.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0))} · saídas {dinheiro(-linhas.filter((l) => l.valor < 0).reduce((s, l) => s + l.valor, 0))} no período.</p>
        </div>
      )}

      {aba === "conferir" && (
        <div className="space-y-2">
          <p className="text-texto-secundario">Marque o que já bateu com o extrato do banco. Saldo conferido: <strong className="text-texto-primario">{dinheiro(saldoConferido)}</strong> · falta conferir: {naoConferidas.length}.</p>
          <div className="flex gap-2">
            <button onClick={() => setConferidos({ ...conferidos, [conta.id]: todasLinhas.map((l) => l.lancamento.id) })} className="text-primaria hover:underline">Marcar tudo</button>
            <button onClick={() => setConferidos({ ...conferidos, [conta.id]: [] })} className="text-texto-secundario hover:underline">Desmarcar tudo</button>
          </div>
          <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {[...todasLinhas].reverse().slice(0, 200).map((l) => (
              <li key={l.lancamento.id}>
                <button onClick={() => alternarConferido(l.lancamento.id)} className="flex w-full items-center justify-between gap-2 text-left">
                  <span className="flex min-w-0 items-center gap-1.5 truncate">
                    {meusConferidos.has(l.lancamento.id) ? <CheckSquare size={13} className="shrink-0 text-sucesso" /> : <Square size={13} className="shrink-0 text-texto-secundario" />}
                    <span className="truncate text-texto-primario">{formatarDataISOParaBR(l.lancamento.data).slice(0, 5)} {l.lancamento.descricao}</span>
                  </span>
                  <span className={`shrink-0 tabular-nums ${l.valor >= 0 ? "text-sucesso" : "text-erro"}`}>{dinheiro(l.valor)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {aba === "dados" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <input value={dados.agencia ?? ""} onChange={(e) => setDados({ ...dados, agencia: e.target.value })} placeholder="Agência" aria-label="Agência" className={`${CLASSE_INPUT} py-1`} />
            <input value={dados.numero ?? ""} onChange={(e) => setDados({ ...dados, numero: e.target.value })} placeholder="Número da conta" aria-label="Número da conta" className={`${CLASSE_INPUT} py-1`} />
            <input value={dados.pix ?? ""} onChange={(e) => setDados({ ...dados, pix: e.target.value })} placeholder="Chave Pix" aria-label="Chave Pix" className={`${CLASSE_INPUT} col-span-2 py-1`} />
            <input value={dados.obs ?? ""} onChange={(e) => setDados({ ...dados, obs: e.target.value })} placeholder="Observação (gerente, telefone…)" aria-label="Observação" className={`${CLASSE_INPUT} col-span-2 py-1`} />
          </div>
          <div className="flex gap-2">
            <Button tamanho="pequeno" onClick={() => { setDadosTodos({ ...dadosTodos, [conta.id]: dados }); toast.success("Dados salvos neste computador."); }}>Salvar</Button>
            <Button tamanho="pequeno" variante="secundaria" onClick={() => navigator.clipboard.writeText(textoDadosBancarios(conta, dados)).then(() => toast.success("Copiado."))}><Copy size={12} /> Copiar</Button>
          </div>
        </div>
      )}

      {aba === "mais" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-texto-secundario">Avisar quando o saldo ficar abaixo de</span>
            <input value={minimo} onChange={(e) => setMinimo(e.target.value)} inputMode="decimal" placeholder="R$" aria-label="Saldo mínimo" className={`${CLASSE_INPUT} w-24 py-1`} />
            <Button tamanho="pequeno" variante="secundaria" onClick={() => { const m = { ...minimos }; if (minimo.trim()) m[conta.id] = valorInputParaCentavos(minimo); else delete m[conta.id]; setMinimos(m); toast.success(minimo.trim() ? "Alerta de saldo mínimo salvo." : "Alerta removido."); }}>Salvar</Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Palette size={13} className="text-texto-secundario" />
            {CORES.map((c) => <button key={c} onClick={() => setCores({ ...cores, [conta.id]: c })} aria-label={`Cor ${c}`} className={`h-5 w-5 rounded-full border-2 ${cores[conta.id] === c ? "border-texto-primario" : "border-transparent"}`} style={{ background: c }} />)}
            {cores[conta.id] && <button onClick={() => { const n = { ...cores }; delete n[conta.id]; setCores(n); }} className="text-texto-secundario hover:underline">padrão</button>}
          </div>
          {conta.tipo === "ATIVO" && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <PiggyBank size={13} className="text-texto-secundario" />
                <input value={rendimento} onChange={(e) => setRendimento(e.target.value)} inputMode="decimal" placeholder="Rendimento (R$)" aria-label="Rendimento" className={`${CLASSE_INPUT} w-28 py-1`} />
                <Button tamanho="pequeno" variante="secundaria" onClick={lancarRendimento}>Lançar rendimento</Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <ReceiptText size={13} className="text-texto-secundario" />
                <input value={tarifa.valor} onChange={(e) => setTarifa({ ...tarifa, valor: e.target.value })} inputMode="decimal" placeholder="Tarifa mensal (R$)" aria-label="Tarifa mensal" className={`${CLASSE_INPUT} w-32 py-1`} />
                <span className="text-texto-secundario">dia</span>
                <input value={tarifa.dia} onChange={(e) => setTarifa({ ...tarifa, dia: e.target.value })} inputMode="numeric" aria-label="Dia da tarifa" className={`${CLASSE_INPUT} w-12 py-1`} />
                <Button tamanho="pequeno" variante="secundaria" onClick={agendarTarifa}>Agendar tarifa</Button>
              </div>
            </>
          )}
          {outras.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Merge size={13} className="text-texto-secundario" />
              <span className="text-texto-secundario">Juntar com</span>
              <Select aria-label="Juntar com" value={destino} onValueChange={setDestino} options={[{ value: "", label: "Escolha…" }, ...outras.map((c) => ({ value: c.id, label: c.nome }))]} className="w-40" />
              <Button tamanho="pequeno" variante="secundaria" onClick={juntar} disabled={!destino}>Juntar</Button>
              <span className="w-full text-[11px] text-texto-secundario">Todo o histórico de “{conta.nome}” passa para a escolhida e esta {rotulo} é apagada. Útil para {rotulo}s cadastradas em dobro.</span>
            </div>
          )}
          {!conta.sistema && (
            <div className="rounded-lg border border-erro/40 p-2">
              {!uso ? (
                <button onClick={prepararExclusao} className="inline-flex items-center gap-1 text-erro hover:underline"><Trash2 size={12} /> Excluir {rotulo}</button>
              ) : uso.lancamentos === 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-texto-primario">Excluir “{conta.nome}”? Ela não tem movimentações{uso.saldo_inicial ? " (o saldo inicial sai junto)" : ""}.</span>
                  <Button tamanho="pequeno" variante="perigo" onClick={() => excluir(false)}>Excluir</Button>
                  <Button tamanho="pequeno" variante="fantasma" onClick={() => setUso(null)}>Cancelar</Button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-texto-primario">“{conta.nome}” tem <strong>{uso.lancamentos}</strong> lançamento(s){uso.agendamentos ? ` e ${uso.agendamentos} conta(s) agendada(s)` : ""}. Excluir apaga esses lançamentos inteiros (o saldo das outras contas envolvidas também muda). Alternativas: arquivar ou juntar com outra {rotulo}.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input value={confirmar} onChange={(e) => setConfirmar(e.target.value)} placeholder="Digite EXCLUIR" aria-label="Confirmar exclusão" className={`${CLASSE_INPUT} w-32 py-1`} />
                    <Button tamanho="pequeno" variante="perigo" disabled={confirmar.trim() !== "EXCLUIR"} onClick={() => excluir(true)}>Excluir com o histórico</Button>
                    <Button tamanho="pequeno" variante="fantasma" onClick={() => { setUso(null); setConfirmar(""); }}>Cancelar</Button>
                  </div>
                  <p className="text-[11px] text-texto-secundario">Um backup é feito automaticamente antes.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
