import { useState } from "react";
import { CalendarRange, Calculator, Gift, Gauge, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { BarraProgresso, CLASSE_INPUT } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { exportarCsv, reais } from "../../services/exportacao";
import { centavosParaValorInput, dataAtualISO, formatarDataISOParaBR, valorInputParaCentavos } from "../../services/formato";
import { usePreferencia } from "../../state/usePreferencia";
import { avisarDadosAlterados } from "../../state/useAoAlterarDados";
import type { Conta } from "../../types/accounting";
import { faturasFuturas, simularCompra } from "./cartoesExtras";
import type { CompraCartao } from "./CartoesPage";

interface Props {
  cartao: Conta;
  compras: CompraCartao[];
  /** Gasto da fatura aberta. */
  atual: number;
  dinheiro: (v: number) => string;
  onAlterado: () => void;
}

/** Faturas futuras, simulador de parcelamento, teto mensal, cashback e todas as compras com busca. */
export function FerramentasCartao({ cartao, compras, atual, dinheiro, onAlterado }: Props) {
  const hoje = dataAtualISO();
  const fech = cartao.dia_fechamento_fatura ?? 1;
  const venc = cartao.dia_vencimento_fatura ?? 10;
  const [tetos, setTetos] = usePreferencia<Record<string, number>>("teto_cartoes", {});
  const [teto, setTeto] = useState(tetos[cartao.id] ? centavosParaValorInput(tetos[cartao.id]) : "");
  const [sim, setSim] = useState({ valor: "", parcelas: "1" });
  const [cashback, setCashback] = useState("");
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [todas, setTodas] = useState(false);

  const futuras = faturasFuturas(compras.map((c) => ({ data: c.data, valor: c.valor })), fech, venc, hoje);
  const maxFutura = Math.max(1, ...futuras.map((f) => f.valor));
  const disponivel = (cartao.limite_centavos ?? 0) - cartao.saldo_atual_centavos;
  const valorSim = valorInputParaCentavos(sim.valor);
  const simulacao = valorSim > 0 ? simularCompra(valorSim, Math.min(72, Math.max(1, Number(sim.parcelas) || 1)), hoje, fech, venc, futuras, disponivel) : null;
  const tetoAtual = tetos[cartao.id];
  const categorias = [...new Set(compras.map((c) => c.categoria?.nome ?? "Outros"))].sort();
  const termo = busca.trim().toLowerCase();
  const filtradas = compras.filter((c) => (!termo || c.l.descricao.toLowerCase().includes(termo)) && (!categoria || (c.categoria?.nome ?? "Outros") === categoria));

  async function lancarCashback() {
    const v = valorInputParaCentavos(cashback);
    if (v <= 0) return toast.error("Informe o valor do cashback.");
    try {
      // Crédito no cartão (abate da fatura) contra uma receita.
      await contabilidade.criarLancamento({
        data: hoje,
        descricao: `Cashback — ${cartao.nome}`,
        observacao: null,
        partidas: [
          { conta_id: cartao.id, tipo: "DEBITO", valor_centavos: v },
          { conta_id: "receita-renda-extra", tipo: "CREDITO", valor_centavos: v },
        ],
      });
      toast.success("Cashback lançado: abate da fatura.");
      setCashback("");
      avisarDadosAlterados();
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function exportarCompras() {
    try {
      const caminho = await exportarCsv(
        `compras-${cartao.nome}`,
        ["Data", "Descrição", "Categoria", "Parcela", "Valor (R$)", "Vence em"],
        filtradas.map((c) => [formatarDataISOParaBR(c.data), c.l.descricao, c.categoria?.nome ?? "", c.parcela ? `${c.parcela.numero}/${c.parcela.total}` : "", reais(c.valor), formatarDataISOParaBR(vencimentoDe(c.data))]),
      );
      toast.success(`Arquivo salvo em ${caminho}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }
  const vencimentoDe = (data: string) => faturasFuturas([{ data, valor: 1 }], fech, venc, "0000-01-01")[0]?.vencimento ?? data;

  return (
    <div className="mt-3 space-y-4 border-t border-borda pt-3 text-xs">
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-texto-primario"><CalendarRange size={13} /> Próximas faturas (com as parcelas já lançadas)</p>
        {futuras.length === 0 ? <p className="text-texto-secundario">Nada comprometido nas próximas faturas.</p> : (
          <ul className="space-y-1">
            {futuras.map((f) => (
              <li key={f.vencimento} className="flex items-center gap-2">
                <span className="w-16 text-texto-secundario">{formatarDataISOParaBR(f.vencimento).slice(0, 5)}</span>
                <span className="flex-1"><BarraProgresso percentual={(f.valor / maxFutura) * 100} cor="var(--cor-erro)" altura={5} /></span>
                <span className="w-20 text-right tabular-nums text-texto-primario">{dinheiro(f.valor)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-texto-primario"><Calculator size={13} /> Simular uma compra</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <input value={sim.valor} onChange={(e) => setSim({ ...sim, valor: e.target.value })} inputMode="decimal" placeholder="Valor (R$)" aria-label="Valor da simulação" className={`${CLASSE_INPUT} w-28 py-1`} />
          <span className="text-texto-secundario">em</span>
          <input value={sim.parcelas} onChange={(e) => setSim({ ...sim, parcelas: e.target.value })} inputMode="numeric" aria-label="Parcelas da simulação" className={`${CLASSE_INPUT} w-14 py-1`} />
          <span className="text-texto-secundario">x</span>
        </div>
        {simulacao && (
          <div className="mt-2 space-y-1">
            <p className={simulacao.disponivelDepois < 0 ? "text-erro" : "text-texto-secundario"}>
              Parcela de {dinheiro(simulacao.parcela)} · limite disponível depois: {dinheiro(simulacao.disponivelDepois)}{simulacao.disponivelDepois < 0 ? " (passa do limite!)" : ""} · maior fatura: {dinheiro(simulacao.maiorFatura)}
            </p>
            <ul className="space-y-0.5">
              {simulacao.porFatura.slice(0, 8).map((f) => (
                <li key={f.vencimento} className="flex justify-between tabular-nums"><span className="text-texto-secundario">Fatura {formatarDataISOParaBR(f.vencimento).slice(0, 5)}</span><span>{dinheiro(f.antes)} → <strong className="text-texto-primario">{dinheiro(f.valor)}</strong></span></li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-texto-primario"><Gauge size={13} /> Teto de gasto por fatura</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <input value={teto} onChange={(e) => setTeto(e.target.value)} inputMode="decimal" placeholder="Ex.: 1.500" aria-label="Teto da fatura" className={`${CLASSE_INPUT} w-28 py-1`} />
          <Button tamanho="pequeno" variante="secundaria" onClick={() => { const t = { ...tetos }; if (teto.trim()) t[cartao.id] = valorInputParaCentavos(teto); else delete t[cartao.id]; setTetos(t); toast.success(teto.trim() ? "Teto salvo: o Dairus avisa ao passar de 80% e de 100%." : "Teto removido."); }}>Salvar</Button>
        </div>
        {tetoAtual !== undefined && (
          <div className="mt-1.5">
            <BarraProgresso percentual={Math.min(100, (atual / tetoAtual) * 100)} cor={atual > tetoAtual ? "var(--cor-erro)" : atual > tetoAtual * 0.8 ? "var(--cor-alerta)" : "var(--cor-sucesso)"} altura={5} />
            <p className="mt-1 text-texto-secundario">{dinheiro(atual)} de {dinheiro(tetoAtual)} nesta fatura ({Math.round((atual / tetoAtual) * 100)}%)</p>
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-texto-primario"><Gift size={13} /> Cashback ou crédito recebido</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <input value={cashback} onChange={(e) => setCashback(e.target.value)} inputMode="decimal" placeholder="Valor (R$)" aria-label="Valor do cashback" className={`${CLASSE_INPUT} w-28 py-1`} />
          <Button tamanho="pequeno" variante="secundaria" onClick={lancarCashback}>Lançar</Button>
          <span className="text-texto-secundario">abate da fatura e entra como renda extra.</span>
        </div>
      </div>

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-texto-primario"><Search size={13} /> Todas as compras</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar compra…" aria-label="Buscar compra" className={`${CLASSE_INPUT} w-36 py-1`} />
          <Select aria-label="Filtrar categoria" value={categoria} onValueChange={setCategoria} options={[{ value: "", label: "Todas as categorias" }, ...categorias.map((c) => ({ value: c, label: c }))]} className="w-44" />
          <button onClick={exportarCompras} disabled={!filtradas.length} className="text-primaria hover:underline disabled:opacity-50">CSV</button>
        </div>
        <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">
          {(todas ? filtradas : filtradas.slice(0, 30)).map((c) => (
            <li key={`${c.l.id}-${c.parcela?.numero ?? 0}`} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-texto-secundario">{formatarDataISOParaBR(c.data)} · <span className="text-texto-primario">{c.l.descricao}</span>{c.parcela && ` (${c.parcela.numero}/${c.parcela.total})`} · {c.categoria?.nome ?? "Outros"}</span>
              <span className={`shrink-0 tabular-nums ${c.valor < 0 ? "text-sucesso" : "text-texto-primario"}`}>{dinheiro(c.valor)}</span>
            </li>
          ))}
        </ul>
        {!todas && filtradas.length > 30 && <button onClick={() => setTodas(true)} className="mt-1 text-primaria hover:underline">Ver todas ({filtradas.length})</button>}
        <p className="mt-1 text-texto-secundario">Total filtrado: {dinheiro(filtradas.reduce((s, c) => s + c.valor, 0))}</p>
      </div>
    </div>
  );
}
