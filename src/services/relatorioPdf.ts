// Relatório financeiro em PDF (A4), com layout próprio: faixa de cabeçalho com o logo,
// indicadores, gráfico de fluxo de caixa, despesas por categoria e tabelas detalhadas.
// Fundo claro para imprimir bem; acentos nas cores do Dairus.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { despesasPorCategoriaNoMes } from "./agregacoes";
import { formatarCentavos, formatarDataISOParaBR } from "./formato";
import { balancete, resultadoPorTipo } from "./relatorios";
import type { Agendamento, Conta, Lancamento } from "../types/accounting";
import type { Bem, Meta, Orcamento } from "../types/extras";

import type { SecaoPdf } from "./relatorioPdfSecoes";
export type { SecaoPdf } from "./relatorioPdfSecoes";

export interface DadosRelatorio {
  inicio: string;
  fim: string;
  titularNome: string;
  titularEmail: string;
  contas: Conta[];
  lancamentos: Lancamento[];
  agendamentos: Agendamento[];
  orcamentos: Orcamento[];
  metas: Meta[];
  bens: Bem[];
  secoes: Set<SecaoPdf>;
}

type RGB = [number, number, number];
const COR = {
  navy: [6, 20, 38] as RGB,
  navy2: [13, 37, 80] as RGB,
  azul: [22, 119, 255] as RGB,
  ciano: [0, 186, 230] as RGB,
  roxo: [139, 92, 246] as RGB,
  verde: [0, 158, 112] as RGB,
  vermelho: [225, 29, 72] as RGB,
  ambar: [217, 119, 6] as RGB,
  texto: [15, 23, 42] as RGB,
  suave: [100, 116, 139] as RGB,
  borda: [226, 232, 240] as RGB,
  fundoCard: [248, 250, 252] as RGB,
  branco: [255, 255, 255] as RGB,
};
const PALETA: RGB[] = [COR.azul, COR.verde, COR.ambar, COR.roxo, COR.ciano, COR.vermelho, [236, 72, 153], [100, 116, 139]];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const M = 14; // margem
const LARGURA = 210;
const UTIL = LARGURA - 2 * M;

const real = (c: number) => formatarCentavos(c).replace(/−/g, "-");
const pct1 = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;
const dataBR = (iso: string) => formatarDataISOParaBR(iso);

function totalTipo(lancs: Lancamento[], contas: Conta[], tipo: "RECEITA" | "DESPESA", inicio: string, fim: string): number {
  return resultadoPorTipo(lancs, contas, tipo, inicio, fim).reduce((s, r) => s + r.valor, 0);
}

function periodoAnterior(inicio: string, fim: string) {
  const ms = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const dias = Math.round((ms(fim) - ms(inicio)) / 86_400_000) + 1;
  const fmt = (v: number) => new Date(v).toISOString().slice(0, 10);
  return { inicio: fmt(ms(inicio) - dias * 86_400_000), fim: fmt(ms(inicio) - 86_400_000) };
}

async function carregarLogo(): Promise<string | null> {
  try {
    const resp = await fetch("/dairus-256.png");
    const blob = await resp.blob();
    return await new Promise((ok) => {
      const leitor = new FileReader();
      leitor.onload = () => ok(String(leitor.result));
      leitor.onerror = () => ok(null);
      leitor.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function titulo(doc: jsPDF, texto: string, y: number): number {
  doc.setFillColor(...COR.azul);
  doc.rect(M, y - 3.6, 1.4, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...COR.texto);
  doc.text(texto, M + 4, y);
  return y + 5;
}

/** Garante espaço na página; se não houver, abre outra. Devolve o y para continuar. */
function espaco(doc: jsPDF, y: number, precisa: number): number {
  if (y + precisa > 297 - 18) {
    doc.addPage();
    return 20;
  }
  return y;
}

function tabela(doc: jsPDF, y: number, cabecalho: string[], linhas: Array<Array<string | number>>, alinharDireita: number[] = []): number {
  const colunas: Record<number, { halign: "right" }> = {};
  for (const i of alinharDireita) colunas[i] = { halign: "right" };
  autoTable(doc, {
    startY: y,
    head: [cabecalho],
    body: linhas.map((l) => l.map(String)),
    margin: { left: M, right: M, top: 20, bottom: 18 },
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.8, textColor: COR.texto, lineColor: COR.borda, lineWidth: 0.2 },
    headStyles: { fillColor: COR.navy, textColor: COR.branco, fontStyle: "bold", lineColor: COR.navy },
    alternateRowStyles: { fillColor: COR.fundoCard },
    columnStyles: colunas,
    didParseCell: (dado) => {
      if (dado.section === "head" && alinharDireita.includes(dado.column.index)) dado.cell.styles.halign = "right";
    },
  });
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
}

export async function gerarRelatorioPdf(d: DadosRelatorio): Promise<Uint8Array> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  doc.setProperties({ title: `Relatório financeiro ${d.inicio} a ${d.fim}`, author: d.titularNome || "Dairus", creator: "Dairus" });
  const ant = periodoAnterior(d.inicio, d.fim);
  const estornados = new Set(d.lancamentos.map((l) => l.estornado_de).filter(Boolean));
  const despesasIds = new Set(d.contas.filter((c) => c.tipo === "DESPESA").map((c) => c.id));
  const nomeConta = new Map(d.contas.map((c) => [c.id, c.nome]));

  // ---------- Cabeçalho
  doc.setFillColor(...COR.navy);
  doc.rect(0, 0, LARGURA, 40, "F");
  doc.setFillColor(...COR.navy2);
  doc.triangle(LARGURA, 0, LARGURA, 40, LARGURA - 70, 0, "F");
  const faixa: RGB[] = [COR.ciano, COR.azul, COR.roxo];
  faixa.forEach((cor, i) => {
    doc.setFillColor(...cor);
    doc.rect((LARGURA / 3) * i, 40, LARGURA / 3, 1.2, "F");
  });
  const logo = await carregarLogo();
  if (logo) doc.addImage(logo, "PNG", M, 9, 22, 22);
  doc.setTextColor(...COR.branco);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Dairus", M + 27, 19);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(0, 217, 255);
  doc.text("Relatório financeiro", M + 27, 26.5);
  doc.setTextColor(203, 213, 225);
  doc.setFontSize(9);
  doc.text(`Período: ${dataBR(d.inicio)} a ${dataBR(d.fim)}`, LARGURA - M, 16, { align: "right" });
  if (d.titularNome || d.titularEmail) doc.text(d.titularNome || d.titularEmail, LARGURA - M, 21.5, { align: "right" });
  const agora = new Date();
  doc.text(`Gerado em ${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, LARGURA - M, 27, { align: "right" });

  // ---------- Indicadores
  const receitas = totalTipo(d.lancamentos, d.contas, "RECEITA", d.inicio, d.fim);
  const despesas = totalTipo(d.lancamentos, d.contas, "DESPESA", d.inicio, d.fim);
  const receitasAnt = totalTipo(d.lancamentos, d.contas, "RECEITA", ant.inicio, ant.fim);
  const despesasAnt = totalTipo(d.lancamentos, d.contas, "DESPESA", ant.inicio, ant.fim);
  const resultado = receitas - despesas;
  const taxa = receitas > 0 ? (resultado / receitas) * 100 : null;
  const variacao = (a: number, b: number) => (b > 0 ? `${a >= b ? "+" : "-"}${Math.abs(((a - b) / b) * 100).toFixed(0)}% vs. período anterior` : "sem período anterior");

  const cards: Array<{ rotulo: string; valor: string; sub: string; cor: RGB }> = [
    { rotulo: "Receitas", valor: real(receitas), sub: variacao(receitas, receitasAnt), cor: COR.verde },
    { rotulo: "Despesas", valor: real(despesas), sub: variacao(despesas, despesasAnt), cor: COR.vermelho },
    { rotulo: resultado >= 0 ? "Superávit" : "Déficit", valor: real(Math.abs(resultado)), sub: `anterior: ${real(receitasAnt - despesasAnt)}`, cor: resultado >= 0 ? COR.azul : COR.vermelho },
    { rotulo: "Taxa de poupança", valor: taxa !== null ? `${taxa.toFixed(0)}%` : "-", sub: "meta de referência: 20%", cor: COR.roxo },
  ];
  const larguraCard = (UTIL - 3 * 4) / 4;
  let y = 49;
  cards.forEach((c, i) => {
    const x = M + i * (larguraCard + 4);
    doc.setFillColor(...COR.fundoCard);
    doc.setDrawColor(...COR.borda);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, larguraCard, 25, 2.5, 2.5, "FD");
    doc.setFillColor(...c.cor);
    doc.roundedRect(x, y, 1.6, 25, 0.8, 0.8, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COR.suave);
    doc.text(c.rotulo, x + 5, y + 6.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...c.cor);
    doc.text(c.valor, x + 5, y + 14.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.6);
    doc.setTextColor(...COR.suave);
    doc.text(c.sub, x + 5, y + 20.5, { maxWidth: larguraCard - 7 });
  });

  // ---------- Gráfico: fluxo de caixa 12 meses (até o fim do período)
  y = 86;
  y = titulo(doc, "Fluxo de caixa — últimos 12 meses", y);
  const [af, mf] = d.fim.split("-").map(Number);
  const meses = Array.from({ length: 12 }, (_, i) => {
    const dt = new Date(af, mf - 1 - (11 - i), 1);
    const ano = dt.getFullYear();
    const mes = dt.getMonth() + 1;
    const mm = String(mes).padStart(2, "0");
    const ini = `${ano}-${mm}-01`;
    const fim = `${ano}-${mm}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}`;
    return { rotulo: MESES[mes - 1], r: totalTipo(d.lancamentos, d.contas, "RECEITA", ini, fim), d: totalTipo(d.lancamentos, d.contas, "DESPESA", ini, fim) };
  });
  const altura = 46;
  const base = y + altura;
  const maximo = Math.max(1, ...meses.flatMap((m) => [m.r, m.d]));
  doc.setDrawColor(...COR.borda);
  doc.setLineWidth(0.2);
  for (let k = 0; k <= 4; k++) {
    const yy = base - (altura * k) / 4;
    doc.line(M + 16, yy, LARGURA - M, yy);
    doc.setFontSize(6.5);
    doc.setTextColor(...COR.suave);
    doc.text(real(Math.round((maximo * k) / 4)).replace(",00", ""), M + 15, yy + 1, { align: "right" });
  }
  const larguraGrupo = (UTIL - 18) / 12;
  const barra = Math.min(4.2, larguraGrupo / 2.6);
  meses.forEach((m, i) => {
    const xg = M + 18 + i * larguraGrupo + (larguraGrupo - 2 * barra - 0.8) / 2;
    const hr = (m.r / maximo) * altura;
    const hd = (m.d / maximo) * altura;
    if (hr > 0) {
      doc.setFillColor(...COR.verde);
      doc.roundedRect(xg, base - hr, barra, hr, 0.6, 0.6, "F");
    }
    if (hd > 0) {
      doc.setFillColor(...COR.vermelho);
      doc.roundedRect(xg + barra + 0.8, base - hd, barra, hd, 0.6, 0.6, "F");
    }
    doc.setFontSize(7);
    doc.setTextColor(...(i === 11 ? COR.texto : COR.suave));
    doc.text(m.rotulo, xg + barra + 0.4, base + 4.5, { align: "center" });
  });
  const legenda = (x: number, cor: RGB, texto: string) => {
    doc.setFillColor(...cor);
    doc.circle(x, base + 9.4, 1.2, "F");
    doc.setFontSize(7.5);
    doc.setTextColor(...COR.texto);
    doc.text(texto, x + 2.5, base + 10.4);
  };
  legenda(M + 18, COR.verde, "Receitas");
  legenda(M + 40, COR.vermelho, "Despesas");

  // ---------- Despesas por categoria (barras) + destaques
  y = base + 20;
  y = titulo(doc, "Despesas por categoria no período", y);
  const categorias = despesasPorCategoriaNoMes(d.lancamentos, d.contas, d.inicio, d.fim);
  const totalCat = categorias.reduce((s, c) => s + c.valorCentavos, 0);
  const colEsq = UTIL * 0.58;
  if (categorias.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(...COR.suave);
    doc.text("Nenhuma despesa no período.", M, y + 4);
  }
  categorias.slice(0, 8).forEach((c, i) => {
    const yy = y + 2 + i * 8;
    const pct = totalCat > 0 ? c.valorCentavos / totalCat : 0;
    doc.setFontSize(8);
    doc.setTextColor(...COR.texto);
    doc.text(c.nome, M, yy + 2.6, { maxWidth: 34 });
    doc.setFillColor(...COR.borda);
    doc.roundedRect(M + 36, yy, colEsq - 64, 3.6, 1.8, 1.8, "F");
    doc.setFillColor(...PALETA[i % PALETA.length]);
    doc.roundedRect(M + 36, yy, Math.max(1.5, (colEsq - 64) * pct), 3.6, 1.8, 1.8, "F");
    doc.setTextColor(...COR.suave);
    doc.text(`${(pct * 100).toFixed(0)}%`, M + colEsq - 26, yy + 2.8, { align: "right" });
    doc.setTextColor(...COR.texto);
    doc.text(real(c.valorCentavos), M + colEsq, yy + 2.8, { align: "right" });
  });

  // Destaques (coluna direita)
  const xd = M + colEsq + 8;
  const ld = UTIL - colEsq - 8;
  const abertos = d.agendamentos.filter((a) => !a.pago_em);
  const hojeISO = new Date().toISOString().slice(0, 10);
  const atrasados = abertos.filter((a) => a.vencimento < hojeISO);
  const saldoContas = d.contas.filter((c) => c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA" && c.ativa).reduce((s, c) => s + c.saldo_atual_centavos, 0);
  const passivos = d.contas.filter((c) => c.tipo === "PASSIVO" && c.subtipo !== "CATEGORIA").reduce((s, c) => s + c.saldo_atual_centavos, 0);
  const bensValor = d.bens.filter((b) => b.tipo === "BEM").reduce((s, b) => s + b.valor_centavos, 0);
  const dividas = d.bens.filter((b) => b.tipo === "DIVIDA").reduce((s, b) => s + b.valor_centavos, 0);
  const noPeriodo = d.lancamentos.filter((l) => l.data >= d.inicio && l.data <= d.fim);
  const destaques: Array<[string, string]> = [
    ["Saldo em contas hoje", real(saldoContas)],
    ["Patrimônio líquido", real(saldoContas + bensValor - passivos - dividas)],
    ["Contas a pagar em aberto", `${abertos.length} · ${real(abertos.reduce((s, a) => s + a.valor_centavos, 0))}`],
    ["Contas atrasadas", String(atrasados.length)],
    ["Lançamentos no período", String(noPeriodo.length)],
    ["Maior categoria", categorias[0] ? categorias[0].nome : "-"],
  ];
  doc.setFillColor(...COR.fundoCard);
  doc.setDrawColor(...COR.borda);
  doc.roundedRect(xd, y, ld, destaques.length * 8 + 5, 2.5, 2.5, "FD");
  destaques.forEach(([k, v], i) => {
    const yy = y + 7 + i * 8;
    doc.setFontSize(7.5);
    doc.setTextColor(...COR.suave);
    doc.text(k, xd + 4, yy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COR.texto);
    doc.text(v, xd + ld - 4, yy, { align: "right", maxWidth: ld * 0.55 });
    doc.setFont("helvetica", "normal");
  });

  // ---------- Tabelas
  doc.addPage();
  y = 20;
  const valorDespesa = (l: Lancamento) => l.partidas.filter((p) => despesasIds.has(p.conta_id) && p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0);

  if (d.secoes.has("categorias") && categorias.length) {
    const anteriores = new Map(despesasPorCategoriaNoMes(d.lancamentos, d.contas, ant.inicio, ant.fim).map((c) => [c.contaId, c.valorCentavos]));
    y = titulo(doc, "Despesas por categoria", y);
    y = tabela(
      doc,
      y,
      ["Categoria", "Gasto", "% do total", "Período anterior", "Variação"],
      categorias.map((c) => {
        const a = anteriores.get(c.contaId) ?? 0;
        return [c.nome, real(c.valorCentavos), totalCat ? pct1((c.valorCentavos / totalCat) * 100) : "0%", real(a), a > 0 ? `${c.valorCentavos >= a ? "+" : "-"}${Math.abs(((c.valorCentavos - a) / a) * 100).toFixed(0)}%` : "novo"];
      }),
      [1, 2, 3, 4],
    );
  }

  if (d.secoes.has("receitas")) {
    const fontes = resultadoPorTipo(d.lancamentos, d.contas, "RECEITA", d.inicio, d.fim);
    if (fontes.length) {
      y = espaco(doc, y, 30);
      y = titulo(doc, "Receitas por fonte", y);
      y = tabela(doc, y, ["Fonte", "Total", "% das receitas"], fontes.map((f) => [f.conta.nome, real(f.valor), receitas ? pct1((f.valor / receitas) * 100) : "0%"]), [1, 2]);
    }
  }

  if (d.secoes.has("maiores")) {
    const maiores = noPeriodo
      .filter((l) => l.origem !== "ESTORNO" && !estornados.has(l.id))
      .map((l) => ({ l, v: valorDespesa(l) }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 12);
    if (maiores.length) {
      y = espaco(doc, y, 30);
      y = titulo(doc, "Maiores despesas", y);
      y = tabela(
        doc,
        y,
        ["Data", "Descrição", "Categoria", "Valor"],
        maiores.map(({ l, v }) => [dataBR(l.data), l.descricao, nomeConta.get(l.partidas.find((p) => despesasIds.has(p.conta_id))?.conta_id ?? "") ?? "", real(v)]),
        [3],
      );
    }
  }

  if (d.secoes.has("orcamento") && d.orcamentos.length) {
    const gasto = new Map(categorias.map((c) => [c.contaId, c.valorCentavos]));
    y = espaco(doc, y, 30);
    y = titulo(doc, "Orçado x realizado", y);
    y = tabela(
      doc,
      y,
      ["Categoria", "Limite mensal", "Gasto no período", "Uso", "Situação"],
      d.orcamentos.map((o) => {
        const g = gasto.get(o.categoria_id) ?? 0;
        const uso = (g / o.limite_centavos) * 100;
        return [nomeConta.get(o.categoria_id) ?? "", real(o.limite_centavos), real(g), `${uso.toFixed(0)}%`, uso >= 100 ? "Estourado" : uso >= 80 ? "Atenção" : "Dentro"];
      }),
      [1, 2, 3],
    );
  }

  if (d.secoes.has("contas")) {
    const linhas = d.contas
      .filter((c) => (c.tipo === "ATIVO" || c.tipo === "PASSIVO") && c.subtipo !== "CATEGORIA" && c.ativa)
      .map((c) => [c.nome, c.tipo === "PASSIVO" ? (c.subtipo === "CARTAO_CREDITO" ? "Cartão" : "Dívida") : "Conta", real(c.tipo === "PASSIVO" ? -c.saldo_atual_centavos : c.saldo_atual_centavos)]);
    for (const b of d.bens) linhas.push([b.nome, b.tipo === "BEM" ? "Bem" : "Dívida", real(b.tipo === "BEM" ? b.valor_centavos : -b.valor_centavos)]);
    if (linhas.length) {
      y = espaco(doc, y, 30);
      y = titulo(doc, "Contas, cartões e patrimônio", y);
      y = tabela(doc, y, ["Item", "Tipo", "Valor"], linhas, [2]);
    }
  }

  if (d.secoes.has("pagar") && abertos.length) {
    y = espaco(doc, y, 30);
    y = titulo(doc, "Contas a pagar em aberto", y);
    y = tabela(
      doc,
      y,
      ["Vencimento", "Descrição", "Valor", "Situação"],
      [...abertos].sort((a, b) => a.vencimento.localeCompare(b.vencimento)).map((a) => [dataBR(a.vencimento), a.descricao, real(a.valor_centavos), a.vencimento < hojeISO ? "Atrasada" : "Pendente"]),
      [2],
    );
  }

  if (d.secoes.has("metas") && d.metas.length) {
    y = espaco(doc, y, 30);
    y = titulo(doc, "Metas", y);
    y = tabela(
      doc,
      y,
      ["Meta", "Guardado", "Alvo", "Progresso", "Prazo"],
      d.metas.map((m) => [m.nome, real(m.guardado_centavos), real(m.valor_alvo_centavos), `${Math.min(100, (m.guardado_centavos / m.valor_alvo_centavos) * 100).toFixed(0)}%`, m.prazo ? dataBR(m.prazo) : "-"]),
      [1, 2, 3],
    );
  }

  if (d.secoes.has("lancamentos") && noPeriodo.length) {
    y = espaco(doc, y, 30);
    y = titulo(doc, "Lançamentos do período", y);
    y = tabela(
      doc,
      y,
      ["Data", "Descrição", "Contas", "Valor"],
      [...noPeriodo]
        .sort((a, b) => a.data.localeCompare(b.data))
        .map((l) => [
          dataBR(l.data),
          l.descricao + (l.origem === "ESTORNO" ? " (estorno)" : ""),
          l.partidas.map((p) => `${p.tipo === "DEBITO" ? "D" : "C"} ${nomeConta.get(p.conta_id) ?? ""}`).join(" / "),
          real(l.partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0)),
        ]),
      [3],
    );
  }

  if (d.secoes.has("balancete")) {
    const linhas = balancete(d.lancamentos, d.contas, d.fim);
    if (linhas.length) {
      y = espaco(doc, y, 30);
      y = titulo(doc, `Balancete de verificação até ${dataBR(d.fim)}`, y);
      const td = linhas.reduce((s, l) => s + l.debitos, 0);
      const tc = linhas.reduce((s, l) => s + l.creditos, 0);
      y = tabela(
        doc,
        y,
        ["Código", "Conta", "Débitos", "Créditos", "Saldo"],
        [...linhas.map((l) => [l.conta.codigo, l.conta.nome, real(l.debitos), real(l.creditos), real(l.saldo)]), ["", "Totais", real(td), real(tc), td === tc ? "D = C" : "divergência"]],
        [2, 3, 4],
      );
    }
  }

  y = espaco(doc, y, 20);
  doc.setFontSize(7.5);
  doc.setTextColor(...COR.suave);
  doc.text(
    "Valores calculados a partir dos lançamentos registrados no Dairus (contabilidade de partidas dobradas). Percentuais e comparações são informativos; não constituem aconselhamento financeiro.",
    M,
    y,
    { maxWidth: UTIL },
  );

  // ---------- Rodapé em todas as páginas
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(...COR.borda);
    doc.setLineWidth(0.3);
    doc.line(M, 285, LARGURA - M, 285);
    doc.setFontSize(7.5);
    doc.setTextColor(...COR.suave);
    doc.text(`Dairus · Relatório financeiro · ${dataBR(d.inicio)} a ${dataBR(d.fim)}`, M, 290);
    doc.text(`Página ${p} de ${total}`, LARGURA - M, 290, { align: "right" });
    if (p > 1) {
      doc.setFillColor(...COR.navy);
      doc.rect(0, 0, LARGURA, 9, "F");
      doc.setFontSize(8);
      doc.setTextColor(...COR.branco);
      doc.text("Dairus · Relatório financeiro", M, 6);
      doc.text(`${dataBR(d.inicio)} a ${dataBR(d.fim)}`, LARGURA - M, 6, { align: "right" });
    }
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
