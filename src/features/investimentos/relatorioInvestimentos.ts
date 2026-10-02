// Relatório mensal de investimentos em PDF (A4): resumo, posições, proventos
// e apuração do IR do mês.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatarCentavos, formatarDataISOParaBR, nomeMesAno } from "../../services/formato";
import { ROTULO_CLASSE } from "../../types/investimentos";
import { apurarIR, proventosPorMes, rendaPassivaMensal } from "./calculos";
import type { Carteira } from "./useCarteira";

const real = (c: number) => formatarCentavos(Math.round(c)).replace(/−/g, "-");

export function gerarPdfInvestimentos(c: Carteira, mes: string, titular: string): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const posicoes = c.posicoes.filter((p) => p.ativo.quantidade > 0);
  const total = posicoes.reduce((s, p) => s + p.valor, 0);
  const custo = posicoes.reduce((s, p) => s + p.ativo.custo_centavos, 0);
  const proventosMes = proventosPorMes(c.ops).get(mes) ?? 0;
  const ir = apurarIR(c.ops, new Map(c.ativos.map((a) => [a.id, a.classe]))).find((m) => m.mes === mes);

  doc.setFillColor(6, 20, 38);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("Dairus · Relatório de investimentos", 14, 13);
  doc.setFontSize(10);
  doc.text(`${nomeMesAno(`${mes}-01`)} · ${titular} · gerado em ${formatarDataISOParaBR(c.hoje)}`, 14, 21);

  doc.setTextColor(15, 23, 42);
  const cards: Array<[string, string]> = [
    ["Valor da carteira", real(total)],
    ["Custo", real(custo)],
    ["Resultado (não realizado)", real(total - custo)],
    ["Proventos no mês", real(proventosMes)],
    ["Renda passiva média", `${real(rendaPassivaMensal(c.ops, c.hoje))}/mês`],
    ["DARF do mês", ir?.darf ? `${real(ir.darf)} (vence ${formatarDataISOParaBR(ir.vencimento)})` : "Nada a pagar"],
  ];
  cards.forEach(([t, v], i) => {
    const x = 14 + (i % 3) * 61;
    const y = 36 + Math.floor(i / 3) * 20;
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, 58, 16, 2, 2, "FD");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(t, x + 3, y + 5.5);
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(v, x + 3, y + 12, { maxWidth: 54 });
  });

  autoTable(doc, {
    startY: 80,
    head: [["Ativo", "Classe", "Quantidade", "Preço médio", "Valor", "Resultado", "%"]],
    body: posicoes.map((p) => [
      p.ativo.codigo,
      ROTULO_CLASSE[p.ativo.classe],
      p.ativo.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 6 }),
      real(p.ativo.preco_medio * 100),
      `${real(p.valor)}${p.fonte === "ESTIMATIVA" ? "*" : ""}`,
      real(p.rent.resultadoTotal),
      total ? `${((p.valor / total) * 100).toFixed(1).replace(".", ",")}%` : "",
    ]),
    styles: { fontSize: 8.5 },
    headStyles: { fillColor: [22, 119, 255] },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
  });

  const proventosDoMes = c.ops.filter((o) => o.data.startsWith(mes) && (o.tipo === "DIVIDENDO" || o.tipo === "JCP" || o.tipo === "RENDIMENTO"));
  const codigo = new Map(c.ativos.map((a) => [a.id, a.codigo]));
  if (proventosDoMes.length) {
    autoTable(doc, {
      head: [["Data", "Ativo", "Tipo", "Bruto", "IR", "Líquido"]],
      body: proventosDoMes.map((o) => [formatarDataISOParaBR(o.data), codigo.get(o.ativo_id) ?? "", o.tipo, real(o.valor_centavos), real(o.ir_retido_centavos), real(o.valor_centavos - o.ir_retido_centavos)]),
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [0, 158, 112] },
    });
  }
  const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "* Renda fixa com valor estimado pelo indexador. Relatório informativo, não é recomendação de investimento. Confira os valores oficiais nos extratos da corretora.",
    14,
    Math.min(285, y + 8),
    { maxWidth: 182 },
  );
  return new Uint8Array(doc.output("arraybuffer"));
}
