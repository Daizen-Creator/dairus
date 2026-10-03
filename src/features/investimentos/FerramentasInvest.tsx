import { useState } from "react";
import { CalendarClock, Calculator, Download, Eye, Scissors, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { exportarCsv, reais } from "../../services/exportacao";
import { investimentos, investimentosGestao } from "../../services/investimentos";
import { dataAtualISO, formatarCentavos, formatarDataISOParaBR } from "../../services/formato";
import { ROTULO_CLASSE } from "../../types/investimentos";
import { avisarDadosAlterados } from "../../state/useAoAlterarDados";
import { proximosVencimentos, simularPrecoMedio, yieldOnCost } from "./investExtras";
import type { Carteira, PosicaoCalculada } from "./useCarteira";

const num = (t: string) => Number(t.replace(/\./g, "").replace(",", ".")) || 0;
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(2).replace(".", ",")}%`);

/** Painel de um ativo: operações, simulador de preço médio, cotação manual, desdobramento e excluir. */
export function PainelAtivo({ posicao, carteira }: { posicao: PosicaoCalculada; carteira: Carteira }) {
  const a = posicao.ativo;
  const hoje = dataAtualISO();
  const [sim, setSim] = useState({ qtd: "", preco: "" });
  const [cotacao, setCotacao] = useState("");
  const [fator, setFator] = useState({ valor: "2", data: hoje });
  const [confirmar, setConfirmar] = useState(false);
  const s = num(sim.qtd) > 0 && num(sim.preco) > 0 ? simularPrecoMedio(a.quantidade, a.preco_medio, num(sim.qtd), num(sim.preco)) : null;
  const yoc = yieldOnCost(posicao.ops, a.custo_centavos, hoje);

  async function executar(acao: () => Promise<unknown>, ok: string) {
    try {
      await acao();
      toast.success(ok);
      avisarDadosAlterados();
      await carteira.recarregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-borda bg-fundo/40 p-3 text-xs">
      <div className="flex flex-wrap gap-4 text-texto-secundario">
        <span>Yield on cost (12m): <strong className="text-texto-primario">{pct(yoc)}</strong></span>
        <span>Proventos totais: <strong className="text-texto-primario">{formatarCentavos(a.proventos_centavos)}</strong></span>
        <span>Lucro realizado: <strong className={a.lucro_realizado_centavos >= 0 ? "text-sucesso" : "text-erro"}>{formatarCentavos(a.lucro_realizado_centavos)}</strong></span>
        {a.primeira_compra && <span>Desde {formatarDataISOParaBR(a.primeira_compra)}</span>}
      </div>
      <div>
        <p className="mb-1 font-semibold text-texto-primario">Operações ({posicao.ops.length})</p>
        <ul className="max-h-40 space-y-0.5 overflow-y-auto pr-1">
          {[...posicao.ops].sort((x, y) => y.data.localeCompare(x.data)).map((o) => (
            <li key={o.id} className="flex justify-between gap-2">
              <span className="text-texto-secundario">{formatarDataISOParaBR(o.data)} · {o.tipo.toLowerCase()}{o.quantidade ? ` · ${o.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 8 })} × ${o.preco_unitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}</span>
              <span className="tabular-nums">{formatarCentavos(o.valor_centavos)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Calculator size={12} className="text-texto-secundario" />
        <span className="text-texto-secundario">Se eu comprar</span>
        <input value={sim.qtd} onChange={(e) => setSim({ ...sim, qtd: e.target.value })} inputMode="decimal" placeholder="qtd." aria-label="Quantidade simulada" className={`${CLASSE_INPUT} w-20 py-1`} />
        <span className="text-texto-secundario">a</span>
        <input value={sim.preco} onChange={(e) => setSim({ ...sim, preco: e.target.value })} inputMode="decimal" placeholder="R$" aria-label="Preço simulado" className={`${CLASSE_INPUT} w-24 py-1`} />
        {s && <span>→ preço médio <strong>{s.precoMedio.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong> ({s.variacao >= 0 ? "+" : ""}{(s.variacao * 100).toFixed(1)}%) com {s.quantidade.toLocaleString("pt-BR")} cotas · custo extra {formatarCentavos(Math.round(num(sim.qtd) * num(sim.preco) * 100))}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Eye size={12} className="text-texto-secundario" />
        <span className="text-texto-secundario">Cotação manual</span>
        <input value={cotacao} onChange={(e) => setCotacao(e.target.value)} inputMode="decimal" placeholder={a.cotacao !== null ? String(a.cotacao).replace(".", ",") : "R$"} aria-label="Cotação manual" className={`${CLASSE_INPUT} w-24 py-1`} />
        <Button tamanho="pequeno" variante="secundaria" disabled={num(cotacao) <= 0} onClick={() => executar(() => investimentos.atualizarCotacoes([{ id: a.id, cotacao: num(cotacao) }]), "Cotação atualizada.")}>Salvar</Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Scissors size={12} className="text-texto-secundario" />
        <span className="text-texto-secundario">Desdobramento/grupamento: cada cota vira</span>
        <input value={fator.valor} onChange={(e) => setFator({ ...fator, valor: e.target.value })} inputMode="decimal" aria-label="Fator do desdobramento" className={`${CLASSE_INPUT} w-16 py-1`} />
        <span className="text-texto-secundario">em</span>
        <input type="date" value={fator.data} onChange={(e) => setFator({ ...fator, data: e.target.value })} aria-label="Data do desdobramento" className={`${CLASSE_INPUT} w-36 py-1`} />
        <Button tamanho="pequeno" variante="secundaria" onClick={() => executar(() => investimentosGestao.desdobrar(a.id, num(fator.valor), fator.data), "Quantidades e preços ajustados.")}>Aplicar</Button>
        <span className="w-full text-[11px] text-texto-secundario">Ex.: 2 = desdobramento 1:2; 0,1 = grupamento 10:1. O valor investido não muda.</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {confirmar ? (
          <>
            <span className="text-erro">Apagar {a.codigo} com {posicao.ops.length} operação(ões) e os lançamentos gerados?</span>
            <Button tamanho="pequeno" variante="perigo" onClick={() => executar(() => investimentosGestao.excluirCompleto(a.id), `${a.codigo} excluído.`)}>Excluir</Button>
            <Button tamanho="pequeno" variante="fantasma" onClick={() => setConfirmar(false)}>Cancelar</Button>
          </>
        ) : (
          <button onClick={() => setConfirmar(true)} className="inline-flex items-center gap-1 text-erro hover:underline"><Trash2 size={12} /> Excluir ativo</button>
        )}
      </div>
    </div>
  );
}

/** Seções extras da carteira: vencimentos, acompanhando (sem posição) e exportar. */
export function ExtrasCarteira({ carteira }: { carteira: Carteira }) {
  const hoje = dataAtualISO();
  const vencimentos = proximosVencimentos(carteira.ativos, hoje);
  const acompanhando = carteira.posicoes.filter((p) => p.ativo.ativo && p.ativo.quantidade === 0 && p.ativo.cotacao !== null);

  async function exportar() {
    try {
      const caminho = await exportarCsv(
        "carteira",
        ["Código", "Tipo", "Quantidade", "Preço médio (R$)", "Cotação (R$)", "Custo (R$)", "Valor (R$)", "Resultado (R$)", "Proventos (R$)", "Vencimento", "Objetivo"],
        carteira.posicoes.filter((p) => p.ativo.quantidade > 0).map((p) => [p.ativo.codigo, ROTULO_CLASSE[p.ativo.classe], p.ativo.quantidade, p.ativo.preco_medio.toFixed(4).replace(".", ","), p.ativo.cotacao?.toFixed(4).replace(".", ",") ?? "", reais(p.ativo.custo_centavos), reais(p.valor), reais(p.rent.resultadoTotal), reais(p.ativo.proventos_centavos), p.ativo.vencimento ? formatarDataISOParaBR(p.ativo.vencimento) : "", p.ativo.objetivo ?? ""]),
      );
      toast.success(`Carteira salva em ${caminho}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Secao titulo={<><CalendarClock size={15} className="text-alerta" /> Vencimentos (12 meses)</>}>
        {vencimentos.length === 0 ? <p className="text-xs text-texto-secundario">Nenhuma renda fixa vencendo no próximo ano.</p> : (
          <ul className="space-y-1 text-xs">{vencimentos.map((a) => <li key={a.id} className="flex justify-between"><span>{a.codigo}</span><span className="text-texto-secundario">{formatarDataISOParaBR(a.vencimento!)}</span></li>)}</ul>
        )}
      </Secao>
      <Secao titulo={<><Eye size={15} className="text-primaria" /> Acompanhando (sem posição)</>}>
        {acompanhando.length === 0 ? <p className="text-xs text-texto-secundario">Cadastre um ativo sem comprar (aba Lançar) para acompanhar a cotação aqui.</p> : (
          <ul className="space-y-1 text-xs">{acompanhando.map((p) => <li key={p.ativo.id} className="flex justify-between"><span>{p.ativo.codigo}</span><span className="tabular-nums">{p.ativo.cotacao!.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}{p.ativo.cotacao_em ? <span className="ml-1 text-texto-secundario">({formatarDataISOParaBR(p.ativo.cotacao_em.slice(0, 10)).slice(0, 5)})</span> : null}</span></li>)}</ul>
        )}
      </Secao>
      <Secao titulo="Exportar">
        <Button tamanho="pequeno" variante="secundaria" onClick={exportar}><Download size={13} /> Carteira em CSV</Button>
      </Secao>
    </div>
  );
}
