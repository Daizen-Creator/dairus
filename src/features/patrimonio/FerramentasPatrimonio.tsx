import { useState } from "react";
import { BadgeDollarSign, CalendarPlus, FileSpreadsheet, Goal, HandCoins, LineChart, TrendingDown, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { BarraProgresso, CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { exportarCsv, reais } from "../../services/exportacao";
import { extras } from "../../services/extras";
import { centavosParaValorInput, dataAtualISO, formatarCentavos, formatarDataISOParaBR, valorInputParaCentavos } from "../../services/formato";
import { usePreferencia } from "../../state/usePreferencia";
import { avisarDadosAlterados } from "../../state/useAoAlterarDados";
import type { Conta } from "../../types/accounting";
import type { Bem } from "../../types/extras";
import { depreciar, independencia, mesesAteAlvo, projetarPatrimonio } from "./patrimonioExtras";

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** Ações de um bem/dívida: depreciar, vender, pagar parcela e agendar custo (IPVA, seguro…). */
export function FerramentasBem({ bem, contas, onAlterado }: { bem: Bem; contas: Conta[]; onAlterado: () => void }) {
  const hoje = dataAtualISO();
  const divida = bem.tipo === "DIVIDA";
  const contasAtivas = contas.filter((c) => c.ativa && c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA" && c.subtipo !== "INVESTIMENTO");
  const despesas = contas.filter((c) => c.ativa && c.tipo === "DESPESA" && c.subtipo !== "CATEGORIA");
  const [taxa, setTaxa] = useState("10");
  const [conta, setConta] = useState(contasAtivas[0]?.id ?? "");
  const [valor, setValor] = useState("");
  const [custo, setCusto] = useState({ desc: "IPVA", valor: "", venc: hoje, rec: "ANUAL", cat: despesas.find((c) => c.id === "despesa-transporte")?.id ?? despesas[0]?.id ?? "" });
  const ultima = bem.avaliacoes[0];
  const dias = diasEntre(ultima.data, hoje);
  const sugerido = depreciar(bem.valor_centavos, (Number(taxa.replace(",", ".")) || 0) / 100, dias);

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

  return (
    <div className="mt-3 space-y-2 border-t border-borda pt-3 text-xs">
      {!divida && (
        <div className="flex flex-wrap items-center gap-1.5">
          <TrendingDown size={12} className="text-texto-secundario" />
          <span className="text-texto-secundario">Depreciação de</span>
          <input value={taxa} onChange={(e) => setTaxa(e.target.value)} inputMode="decimal" aria-label="Depreciação ao ano (%)" className={`${CLASSE_INPUT} w-14 py-1`} />
          <span className="text-texto-secundario">% ao ano → hoje ≈ <strong className="text-texto-primario">{formatarCentavos(sugerido)}</strong> ({dias} dias desde a última avaliação)</span>
          <Button tamanho="pequeno" variante="secundaria" disabled={sugerido === bem.valor_centavos} onClick={() => executar(() => extras.atualizarBem(bem.id, sugerido, hoje), "Depreciação aplicada.")}>Aplicar</Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {divida ? <HandCoins size={12} className="text-texto-secundario" /> : <BadgeDollarSign size={12} className="text-texto-secundario" />}
        <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder={divida ? "Valor da parcela" : "Valor da venda"} aria-label={divida ? "Valor da parcela" : "Valor da venda"} className={`${CLASSE_INPUT} w-32 py-1`} />
        <Select aria-label="Conta" value={conta} onValueChange={setConta} options={contasAtivas.map((c) => ({ value: c.id, label: `${divida ? "pagar de" : "receber em"} ${c.nome}` }))} className="w-44" />
        <Button
          tamanho="pequeno"
          variante="secundaria"
          disabled={valorInputParaCentavos(valor) <= 0 || !conta}
          onClick={() => {
            const v = valorInputParaCentavos(valor);
            return divida
              ? executar(async () => {
                  await contabilidade.registrarDespesa({ conta_origem_id: conta, categoria_despesa_id: "despesa-juros-emprestimos", valor_centavos: v, data: hoje, descricao: `Parcela — ${bem.nome}` });
                  await extras.atualizarBem(bem.id, Math.max(0, bem.valor_centavos - v), hoje);
                }, "Parcela paga: saiu da conta e a dívida diminuiu.")
              : executar(async () => {
                  await contabilidade.registrarRecebimento({ conta_destino_id: conta, conta_receita_id: "receita-renda-extra", valor_centavos: v, data: hoje, descricao: `Venda — ${bem.nome}` });
                  await extras.atualizarBem(bem.id, 0, hoje);
                }, "Venda registrada: o dinheiro entrou e o bem foi zerado.");
          }}
        >
          {divida ? "Pagar parcela" : "Registrar venda"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <CalendarPlus size={12} className="text-texto-secundario" />
        <input value={custo.desc} onChange={(e) => setCusto({ ...custo, desc: e.target.value })} aria-label="Custo do bem" className={`${CLASSE_INPUT} w-28 py-1`} />
        <input value={custo.valor} onChange={(e) => setCusto({ ...custo, valor: e.target.value })} inputMode="decimal" placeholder="Valor" aria-label="Valor do custo" className={`${CLASSE_INPUT} w-24 py-1`} />
        <input type="date" value={custo.venc} onChange={(e) => setCusto({ ...custo, venc: e.target.value })} aria-label="Vencimento do custo" className={`${CLASSE_INPUT} w-36 py-1`} />
        <Select aria-label="Repetição do custo" value={custo.rec} onValueChange={(v) => setCusto({ ...custo, rec: v })} options={[{ value: "ANUAL", label: "Todo ano" }, { value: "MENSAL", label: "Todo mês" }]} className="w-28" />
        <Select aria-label="Categoria do custo" value={custo.cat} onValueChange={(v) => setCusto({ ...custo, cat: v })} options={despesas.map((c) => ({ value: c.id, label: c.nome }))} className="w-36" />
        <Button tamanho="pequeno" variante="secundaria" disabled={valorInputParaCentavos(custo.valor) <= 0} onClick={() => executar(() => contabilidade.criarAgendamento({ descricao: `${custo.desc} — ${bem.nome}`, valor_centavos: valorInputParaCentavos(custo.valor), vencimento: custo.venc, categoria_despesa_id: custo.cat, recorrencia: custo.rec as "ANUAL" | "MENSAL", etiqueta: "FIXO", tipo: "PAGAR" }), "Custo agendado na agenda de contas a pagar.")}>Agendar custo</Button>
      </div>
    </div>
  );
}

/** Ferramentas gerais: meta de patrimônio, projeção, independência financeira, revisar valores e exportar para o IR. */
export function FerramentasPatrimonio({ bens, liquido, gastoMensal, onAlterado }: { bens: Bem[]; liquido: number; gastoMensal: number; onAlterado: () => void }) {
  const hoje = dataAtualISO();
  const [alvo, setAlvo] = usePreferencia<number>("meta_patrimonio", 0);
  const [alvoTexto, setAlvoTexto] = useState(alvo ? centavosParaValorInput(alvo) : "");
  const [aporte, setAporte] = useState("1.000");
  const [taxa, setTaxa] = useState("10");
  const aporteC = valorInputParaCentavos(aporte);
  const taxaA = (Number(taxa.replace(",", ".")) || 0) / 100;
  const proj = projetarPatrimonio(liquido, aporteC, taxaA, 10);
  const prazo = alvo > 0 ? mesesAteAlvo(liquido, aporteC, taxaA, alvo) : null;
  const ind = independencia(liquido, gastoMensal);
  const antigos = bens.filter((b) => b.valor_centavos > 0 && diasEntre(b.avaliacoes[0].data, hoje) > 90);

  async function confirmarValores() {
    try {
      for (const b of antigos) await extras.atualizarBem(b.id, b.valor_centavos, hoje);
      toast.success(`${antigos.length} item(ns) confirmados com o valor atual.`);
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function exportarIR() {
    const ano = Number(hoje.slice(0, 4)) - 1;
    const fim = `${ano}-12-31`;
    const valorEm = (b: Bem, data: string) => b.avaliacoes.find((a) => a.data <= data)?.valor_centavos ?? 0;
    try {
      const caminho = await exportarCsv(
        `bens-e-direitos-${ano}`,
        ["Item", "Tipo", "Data da compra", "Valor de compra (R$)", `Situação em 31/12/${ano - 1} (R$)`, `Situação em 31/12/${ano} (R$)`, "Valor de mercado atual (R$)", "Notas"],
        bens.map((b) => [b.nome, b.tipo === "BEM" ? "Bem" : "Dívida", b.aquisicao_data ? formatarDataISOParaBR(b.aquisicao_data) : "", b.aquisicao_valor_centavos != null ? reais(b.aquisicao_valor_centavos) : "", b.aquisicao_valor_centavos != null && (b.aquisicao_data ?? "9999") <= `${ano - 1}-12-31` ? reais(b.aquisicao_valor_centavos) : reais(valorEm(b, `${ano - 1}-12-31`)), b.aquisicao_valor_centavos != null && (b.aquisicao_data ?? "9999") <= fim ? reais(b.aquisicao_valor_centavos) : reais(valorEm(b, fim)), reais(b.valor_centavos), b.notas ?? ""]),
      );
      toast.success(`Planilha salva em ${caminho}. No IR, bens vão pelo valor de compra (não de mercado).`, { duration: 10000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Secao titulo={<><Goal size={16} className="text-sucesso" /> Meta de patrimônio</>}>
        <div className="flex flex-wrap items-center gap-2">
          <input value={alvoTexto} onChange={(e) => setAlvoTexto(e.target.value)} inputMode="decimal" placeholder="Ex.: 1.000.000" aria-label="Meta de patrimônio" className={`${CLASSE_INPUT} w-40`} />
          <Button tamanho="pequeno" variante="secundaria" onClick={() => { setAlvo(valorInputParaCentavos(alvoTexto)); toast.success("Meta salva."); }}>Salvar</Button>
        </div>
        {alvo > 0 && (
          <div className="mt-2">
            <BarraProgresso percentual={Math.max(0, Math.min(100, (liquido / alvo) * 100))} cor="var(--cor-sucesso)" />
            <p className="mt-1 text-xs text-texto-secundario">{formatarCentavos(liquido)} de {formatarCentavos(alvo)} · {prazo === 0 ? "atingida!" : prazo ? `chega em ≈ ${Math.floor(prazo / 12)} ano(s) e ${prazo % 12} mês(es) no ritmo abaixo (estimativa)` : "com esse aporte não chega em 100 anos"}</p>
          </div>
        )}
      </Secao>
      <Secao titulo={<><LineChart size={16} className="text-primaria" /> Projeção (estimativa)</>}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-texto-secundario">
          Guardando <input value={aporte} onChange={(e) => setAporte(e.target.value)} inputMode="decimal" aria-label="Aporte mensal" className={`${CLASSE_INPUT} w-24 py-1`} /> por mês, rendendo
          <input value={taxa} onChange={(e) => setTaxa(e.target.value)} inputMode="decimal" aria-label="Rendimento ao ano (%)" className={`${CLASSE_INPUT} w-14 py-1`} /> % ao ano:
        </div>
        <ul className="mt-2 grid grid-cols-3 gap-2 text-xs">
          {[1, 5, 10].map((a) => <li key={a} className="rounded-lg border border-borda p-2"><span className="text-texto-secundario">{a} ano(s)</span><br /><strong className="text-texto-primario">{formatarCentavos(proj[a - 1] ?? liquido)}</strong></li>)}
        </ul>
      </Secao>
      <Secao titulo="Independência financeira">
        <p className="text-sm text-texto-primario">Seu patrimônio pagaria <strong className={ind >= 100 ? "text-sucesso" : "text-texto-primario"}>{ind}%</strong> dos seus gastos vivendo de renda.</p>
        <BarraProgresso percentual={Math.min(100, ind)} cor="var(--cor-primaria)" />
        <p className="mt-1 text-xs text-texto-secundario">Regra dos 4% ao ano sobre o patrimônio líquido, com gasto médio de {formatarCentavos(gastoMensal)}/mês (estimativa).</p>
      </Secao>
      <Secao titulo="Revisão e Imposto de Renda">
        <div className="flex flex-col items-start gap-2 text-xs">
          <Button tamanho="pequeno" variante="secundaria" disabled={!antigos.length} onClick={confirmarValores}><CheckCheck size={13} /> Confirmar valores atuais ({antigos.length} desatualizado(s))</Button>
          <Button tamanho="pequeno" variante="secundaria" onClick={exportarIR}><FileSpreadsheet size={13} /> Planilha de Bens e Direitos (IR)</Button>
        </div>
      </Secao>
    </div>
  );
}
