import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { col, exportarXlsx } from "../../services/exportacao";
import { formatarCentavos, formatarDataISOParaBR } from "../../services/formato";
import { ROTULO_CLASSE } from "../../types/investimentos";
import { apurarIR, bensEDireitos, ehRendaFixa, rendimentosDoAno, valorRendaFixa, type CategoriaIR } from "./calculos";
import type { Carteira } from "./useCarteira";

const R = formatarCentavos;
const CATEGORIAS: Record<CategoriaIR, string> = { ACOES: "Ações", OUTROS_SWING: "ETF/BDR", FII: "FII", DAY_TRADE: "Day trade", CRIPTO: "Cripto" };

export function AbaImpostos({ carteira }: { carteira: Carteira }) {
  const { ativos, ops, posicoes, indices, hoje } = carteira;
  const anoAtual = Number(hoje.slice(0, 4));
  const [ano, setAno] = useState(anoAtual);
  const classe = new Map(ativos.map((a) => [a.id, a.classe]));
  const apuracao = apurarIR(ops, classe);
  const doAno = apuracao.filter((m) => m.mes.startsWith(String(ano)));
  const bens = bensEDireitos(ativos, ops, ano);
  const rend = rendimentosDoAno(ops, ano);
  const anos = [...new Set([anoAtual, ...ops.map((o) => Number(o.data.slice(0, 4)))])].sort((a, b) => b - a);
  const rf = posicoes.filter((p) => p.ativo.quantidade > 0 && ehRendaFixa(p.ativo)).map((p) => ({ p, v: valorRendaFixa(p.ativo, p.ops, indices, hoje) }));

  async function exportar() {
    try {
      const caminho = await exportarXlsx(`imposto-de-renda-investimentos-${ano}`, [
        {
          nome: "Apuração mensal",
          total: true,
          colunas: [col("Mês", "TEXTO", 10), col("Vendas de ações", "MOEDA"), col("Resultado ações", "MOEDA"), col("Resultado ETF/BDR", "MOEDA"), col("Resultado FII", "MOEDA"), col("Resultado day trade", "MOEDA"), col("Resultado cripto", "MOEDA"), col("Imposto", "MOEDA"), col("IR retido", "MOEDA"), col("DARF", "MOEDA"), col("Vencimento", "DATA")],
          linhas: doAno.map((m) => [m.mes, m.vendas.ACOES, m.resultado.ACOES, m.resultado.OUTROS_SWING, m.resultado.FII, m.resultado.DAY_TRADE, m.resultado.CRIPTO, m.imposto, m.irRetido, m.darf, m.darf ? m.vencimento : null]),
        },
        {
          nome: "Bens e direitos",
          colunas: [col("Grupo", "TEXTO", 8), col("Código", "TEXTO", 8), col("Discriminação", "TEXTO", 70), col(`Situação 31/12/${ano - 1}`, "MOEDA", 18), col(`Situação 31/12/${ano}`, "MOEDA", 18)],
          linhas: bens.map((b) => [b.grupo, b.codigo, b.discriminacao, b.situacaoAnterior, b.situacaoAtual]),
        },
        {
          nome: "Rendimentos",
          colunas: [col("Tipo", "TEXTO", 50), col("Valor", "MOEDA")],
          linhas: [
            ["Dividendos (isentos, linha 09)", rend.porTipo.DIVIDENDO],
            ["Rendimentos de FII (isentos, linha 26)", rend.porTipo.RENDIMENTO],
            ["JCP líquido (tributação exclusiva, linha 10)", rend.exclusivos],
          ],
        },
      ]);
      toast.success(`Arquivo salvo em ${caminho}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select aria-label="Ano" value={String(ano)} onValueChange={(v) => setAno(Number(v))} options={anos.map((a) => ({ value: String(a), label: String(a) }))} className="w-28" />
        <Button tamanho="pequeno" variante="secundaria" onClick={exportar}><Download size={13} /> Exportar para a declaração (.xlsx)</Button>
      </div>
      <p className="text-xs text-texto-secundario">Cálculos de referência para conferir com os informes da corretora e o programa da Receita: isenção de R$ 20 mil/mês em vendas de ações (swing trade), R$ 35 mil em cripto, 15% (ações, ETF, BDR, cripto), 20% (FII e day trade), compensação de prejuízo por categoria e DARF mínimo de R$ 10.</p>

      <Secao titulo="Apuração mensal (vendas) e DARF">
        {doAno.length === 0 ? <p className="text-sm text-texto-secundario">Nenhuma venda em {ano}.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-texto-secundario"><tr><th className="py-1.5 pr-3">Mês</th><th className="pr-3 text-right">Vendas ações</th><th className="pr-3">Resultados</th><th className="pr-3 text-right">Prejuízo a compensar</th><th className="pr-3 text-right">Imposto</th><th className="pr-3 text-right">DARF</th><th>Vence</th></tr></thead>
              <tbody>{doAno.map((m) => (
                <tr key={m.mes} className="border-t border-borda align-top">
                  <td className="py-1.5 pr-3">{m.mes.slice(5)}/{m.mes.slice(0, 4)}</td>
                  <td className="pr-3 text-right tabular-nums">{R(m.vendas.ACOES)}{m.isento.ACOES ? <span className="block text-[11px] text-sucesso">isento</span> : null}</td>
                  <td className="pr-3 text-xs">{(Object.keys(CATEGORIAS) as CategoriaIR[]).filter((c) => m.resultado[c] !== 0).map((c) => <span key={c} className={`block ${m.resultado[c] >= 0 ? "text-sucesso" : "text-erro"}`}>{CATEGORIAS[c]}: {R(m.resultado[c])}{m.isento[c] ? " (isento)" : ""}</span>)}</td>
                  <td className="pr-3 text-right text-xs tabular-nums">{(Object.keys(CATEGORIAS) as CategoriaIR[]).filter((c) => m.prejuizoAcumulado[c] > 0).map((c) => <span key={c} className="block">{CATEGORIAS[c]}: {R(m.prejuizoAcumulado[c])}</span>)}</td>
                  <td className="pr-3 text-right tabular-nums">{R(m.imposto)}{m.irRetido ? <span className="block text-[11px] text-texto-secundario">− retido {R(m.irRetido)}</span> : null}</td>
                  <td className="pr-3 text-right font-semibold tabular-nums">{m.darf ? R(m.darf) : m.acumuladoParaProximo ? <span className="text-[11px] font-normal text-texto-secundario">{R(m.acumuladoParaProximo)} p/ próximo mês</span> : "—"}</td>
                  <td>{m.darf ? formatarDataISOParaBR(m.vencimento) : ""}</td>
                </tr>
              ))}</tbody>
            </table>
            <p className="mt-2 text-[11px] text-texto-secundario">DARF código 6015 (pessoa física, bolsa); cripto em exchange nacional: código 4600. Pague pelo Sicalc da Receita.</p>
          </div>
        )}
      </Secao>

      <Secao titulo={`Bens e direitos (31/12/${ano})`}>
        {bens.length === 0 ? <p className="text-sm text-texto-secundario">Nenhum ativo para declarar.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-texto-secundario"><tr><th className="py-1.5 pr-3">Grupo/Código</th><th className="pr-3">Discriminação</th><th className="pr-3 text-right">31/12/{ano - 1}</th><th className="text-right">31/12/{ano}</th></tr></thead>
            <tbody>{bens.map((b) => (
              <tr key={b.ativo.id} className="border-t border-borda"><td className="py-1.5 pr-3 tabular-nums">{b.grupo}-{b.codigo}</td><td className="pr-3 text-xs">{b.discriminacao}</td><td className="pr-3 text-right tabular-nums">{R(b.situacaoAnterior)}</td><td className="text-right tabular-nums">{R(b.situacaoAtual)}</td></tr>
            ))}</tbody>
          </table>
        )}
        <p className="mt-2 text-[11px] text-texto-secundario">Valores pelo custo de aquisição (como pede a Receita), não pelo preço de mercado. Inclua o CNPJ da empresa/fundo e da corretora no programa.</p>
      </Secao>

      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo={`Rendimentos de ${ano}`}>
          <ul className="space-y-1 text-sm">
            <li className="flex justify-between"><span>Dividendos (isentos)</span><span className="tabular-nums">{R(rend.porTipo.DIVIDENDO)}</span></li>
            <li className="flex justify-between"><span>Rendimentos de FII (isentos)</span><span className="tabular-nums">{R(rend.porTipo.RENDIMENTO)}</span></li>
            <li className="flex justify-between"><span>JCP líquido (exclusiva na fonte)</span><span className="tabular-nums">{R(rend.exclusivos)}</span></li>
          </ul>
        </Secao>
        <Secao titulo="IR da renda fixa no resgate (estimativa hoje)">
          {rf.length === 0 ? <p className="text-sm text-texto-secundario">Nenhum título de renda fixa.</p> : (
            <ul className="space-y-1 text-sm">{rf.map(({ p, v }) => (
              <li key={p.ativo.id} className="flex justify-between gap-2"><span>{p.ativo.codigo} <span className="text-xs text-texto-secundario">({ROTULO_CLASSE[p.ativo.classe]}, {v.aliquota ? `${(v.aliquota * 100).toFixed(1).replace(".", ",")}%` : "isento"})</span></span><span className="tabular-nums">{R(v.ir)} · líquido {R(v.liquido)}</span></li>
            ))}</ul>
          )}
          <p className="mt-2 text-[11px] text-texto-secundario">Tabela regressiva: 22,5% até 180 dias, 20% até 360, 17,5% até 720 e 15% acima. LCI, LCA e poupança são isentas. O IR é retido pelo banco no resgate.</p>
        </Secao>
      </div>
    </div>
  );
}
