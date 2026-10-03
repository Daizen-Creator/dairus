// Importação dos extratos da Área do Investidor da B3 (salvos como CSV):
//  - "Negociação": Data do Negócio; Tipo de Movimentação; Mercado; ...; Código de Negociação; Quantidade; Preço; Valor
//  - "Movimentação": Entrada/Saída; Data; Movimentação; Produto; Instituição; Quantidade; Preço unitário; Valor da Operação

import type { ClasseAtivo, TipoOperacao } from "../../types/investimentos";

export interface LinhaB3 {
  tipo: TipoOperacao;
  data: string;
  codigo: string;
  quantidade: number;
  preco: number;
  valorCentavos: number;
}

function separarLinha(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let aspas = false;
  for (const c of linha) {
    if (c === '"') aspas = !aspas;
    else if (c === sep && !aspas) {
      campos.push(atual.trim());
      atual = "";
    } else atual += c;
  }
  campos.push(atual.trim());
  return campos;
}

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "R$ 1.234,56" → 1234.56; "-" ou vazio → 0. Aceita também "1234.56". */
export function numeroBR(t: string): number {
  const limpo = t.replace(/R\$|\s/g, "");
  if (!limpo || limpo === "-") return 0;
  const n = limpo.includes(",") ? Number(limpo.replace(/\./g, "").replace(",", ".")) : Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

function dataISO(t: string): string | null {
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
}

/** Ticker do mercado fracionário (PETR4F) vira o normal (PETR4). */
export const tickerNormal = (t: string) => t.trim().toUpperCase().replace(/^([A-Z]{4}\d{1,2})F$/, "$1");

/** Palpite de classe pelo ticker (o usuário confirma antes de importar). */
export function classePeloTicker(t: string): ClasseAtivo {
  const c = tickerNormal(t);
  const ETFS = ["BOVA11", "IVVB11", "SMAL11", "HASH11", "BOVV11", "DIVO11", "XINA11", "GOLD11", "NASD11", "SPXI11", "ACWI11", "FIND11"];
  if (ETFS.includes(c)) return "ETF";
  if (/^[A-Z]{4}3[2-5]$/.test(c)) return "BDR";
  if (/^[A-Z]{4}11$/.test(c)) return "FII";
  return "ACAO";
}

export function lerExtratoB3(texto: string): { linhas: LinhaB3[]; ignoradas: number; formato: "NEGOCIACAO" | "MOVIMENTACAO" | null } {
  const linhasTexto = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (linhasTexto.length < 2) return { linhas: [], ignoradas: 0, formato: null };
  const sep = (linhasTexto[0].match(/;/g)?.length ?? 0) >= (linhasTexto[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const cab = separarLinha(linhasTexto[0], sep).map(semAcento);
  const col = (...nomes: string[]) => cab.findIndex((c) => nomes.some((n) => c.startsWith(n)));
  const linhas: LinhaB3[] = [];
  let ignoradas = 0;

  const iCodigo = col("codigo de negociacao");
  if (iCodigo >= 0) {
    const iData = col("data do negocio", "data");
    const iTipo = col("tipo de movimentacao");
    const iQtd = col("quantidade");
    const iPreco = col("preco");
    const iValor = col("valor");
    for (const l of linhasTexto.slice(1)) {
      const c = separarLinha(l, sep);
      const data = dataISO(c[iData] ?? "");
      const tipo = semAcento(c[iTipo] ?? "");
      if (!data || !(tipo.startsWith("compra") || tipo.startsWith("venda"))) {
        ignoradas++;
        continue;
      }
      const quantidade = numeroBR(c[iQtd] ?? "");
      const preco = numeroBR(c[iPreco] ?? "");
      const valor = numeroBR(c[iValor] ?? "") || quantidade * preco;
      linhas.push({ tipo: tipo.startsWith("compra") ? "COMPRA" : "VENDA", data, codigo: tickerNormal(c[iCodigo]), quantidade, preco, valorCentavos: Math.round(valor * 100) });
    }
    return { linhas, ignoradas, formato: "NEGOCIACAO" };
  }

  const iProduto = col("produto");
  const iMov = col("movimentacao");
  if (iProduto >= 0 && iMov >= 0) {
    const iData = col("data");
    const iEntrada = col("entrada/saida", "entrada");
    const iQtd = col("quantidade");
    const iPreco = col("preco unitario", "preco");
    const iValor = col("valor da operacao", "valor");
    for (const l of linhasTexto.slice(1)) {
      const c = separarLinha(l, sep);
      const data = dataISO(c[iData] ?? "");
      const mov = semAcento(c[iMov] ?? "");
      const credito = semAcento(c[iEntrada] ?? "credito").startsWith("credito");
      const codigo = tickerNormal((c[iProduto] ?? "").split(" - ")[0]);
      const valor = numeroBR(c[iValor] ?? "");
      const quantidade = numeroBR(c[iQtd] ?? "");
      let tipo: TipoOperacao | null = null;
      if (mov.startsWith("dividendo")) tipo = "DIVIDENDO";
      else if (mov.startsWith("juros sobre capital")) tipo = "JCP";
      else if (mov.startsWith("rendimento")) tipo = "RENDIMENTO";
      else if (mov.startsWith("amortizacao")) tipo = "AMORTIZACAO";
      else if (mov === "compra" || mov.startsWith("compra /")) tipo = credito ? "COMPRA" : "VENDA";
      if (!data || !tipo || !codigo || valor <= 0) {
        ignoradas++;
        continue;
      }
      linhas.push({ tipo, data, codigo, quantidade: tipo === "COMPRA" || tipo === "VENDA" ? quantidade : 0, preco: numeroBR(c[iPreco] ?? ""), valorCentavos: Math.round(valor * 100) });
    }
    return { linhas, ignoradas, formato: "MOVIMENTACAO" };
  }
  return { linhas: [], ignoradas: linhasTexto.length - 1, formato: null };
}
