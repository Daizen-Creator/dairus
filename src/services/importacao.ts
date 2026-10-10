// Leitura de extratos bancários (OFX e CSV). Tudo local: o arquivo nunca sai do computador.

export interface LinhaExtrato {
  data: string; // AAAA-MM-DD
  descricao: string;
  /** Centavos com sinal: negativo = saída, positivo = entrada. */
  valorCentavos: number;
}

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Converte "1.234,56", "1234.56", "1.234", "-R$ 10,00" ou "(10,00)" em centavos com sinal.
 *
 * Regras (a tabela de casos está em importacao.test.ts):
 *  - vírgula é sempre decimal ("1,234" = R$ 1,23);
 *  - com vírgula e ponto juntos, o último é o decimal ("1.234,56" e "1,234.56");
 *  - ponto repetido é milhar ("1.234.567");
 *  - ponto único com exatamente 3 dígitos depois e 1 a 3 antes (fora "0") é milhar no CSV
 *    ("1.234" = R$ 1.234,00); no OFX o ponto é sempre decimal ("1.234" = R$ 1,23).
 */
export function valorTextoParaCentavos(bruto: string, formato: "csv" | "ofx" = "csv"): number | null {
  let t = bruto.trim();
  if (!t) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(t)) {
    negativo = true;
    t = t.slice(1, -1);
  }
  if (/-/.test(t)) negativo = true;
  t = t.replace(/[^\d.,]/g, "");
  if (!/\d/.test(t)) return null;

  const ultimaVirgula = t.lastIndexOf(",");
  const ultimoPonto = t.lastIndexOf(".");
  const pontos = (t.match(/\./g) ?? []).length;
  let inteira: string;
  let decimal = "";
  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    // Os dois aparecem: o que vem por último é o decimal, o outro é milhar.
    const sep = Math.max(ultimaVirgula, ultimoPonto);
    inteira = t.slice(0, sep).replace(/[.,]/g, "");
    decimal = t.slice(sep + 1).replace(/[.,]/g, "");
  } else if (ultimaVirgula >= 0) {
    // Só vírgula: decimal (repetida, não faz sentido; usa a última).
    inteira = t.slice(0, ultimaVirgula).replace(/,/g, "");
    decimal = t.slice(ultimaVirgula + 1);
  } else if (ultimoPonto >= 0) {
    const antes = t.slice(0, ultimoPonto);
    const depois = t.slice(ultimoPonto + 1);
    const milhar = pontos > 1 || (formato === "csv" && /^\d{3}$/.test(depois) && /^[1-9]\d{0,2}$/.test(antes));
    if (milhar) inteira = t.replace(/\./g, "");
    else {
      inteira = antes;
      decimal = depois;
    }
  } else inteira = t;

  if (!/^\d*$/.test(inteira) || !/^\d*$/.test(decimal)) return null;
  // Aritmética de inteiros: sem erro de ponto flutuante (0,285 -> 29 centavos, arredonda para cima).
  const centavos = Number(inteira || "0") * 100 + Number(decimal.slice(0, 2).padEnd(2, "0")) + (Number(decimal[2] ?? "0") >= 5 ? 1 : 0);
  if (!Number.isFinite(centavos)) return null;
  return negativo ? -centavos : centavos;
}

export function dataTextoParaISO(bruto: string): string | null {
  const t = bruto.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = t.match(/^(\d{4})(\d{2})(\d{2})/); // OFX
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

export function lerOfx(texto: string): LinhaExtrato[] {
  const linhas: LinhaExtrato[] = [];
  const blocos = texto.split(/<STMTTRN>/i).slice(1);
  for (const bloco of blocos) {
    const campo = (tag: string) => bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"))?.[1]?.trim() ?? "";
    const data = dataTextoParaISO(campo("DTPOSTED"));
    const valor = valorTextoParaCentavos(campo("TRNAMT"), "ofx");
    const descricao = campo("MEMO") || campo("NAME") || "Lançamento importado";
    if (data && valor !== null && valor !== 0) linhas.push({ data, descricao, valorCentavos: valor });
  }
  return linhas;
}

function dividirLinhaCsv(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else aspas = !aspas;
    } else if (c === sep && !aspas) {
      campos.push(atual);
      atual = "";
    } else atual += c;
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

export function lerCsv(texto: string): LinhaExtrato[] {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return [];
  const sep = [";", ",", "\t"].map((s) => ({ s, n: linhas[0].split(s).length })).sort((a, b) => b.n - a.n)[0].s;
  const cab = dividirLinhaCsv(linhas[0], sep).map(normalizar);
  const achar = (...nomes: string[]) => cab.findIndex((c) => nomes.some((n) => c.includes(n)));

  const iData = achar("data", "date");
  const iDesc = achar("descri", "histor", "title", "titulo", "memo", "lancamento", "estabelecimento");
  const iValor = achar("valor", "amount", "montante");
  const iDeb = achar("debito");
  const iCred = achar("credito");
  if (iData < 0 || iDesc < 0 || (iValor < 0 && iDeb < 0 && iCred < 0)) {
    throw new Error("Não encontrei as colunas de data, descrição e valor no cabeçalho do CSV.");
  }

  const saida: LinhaExtrato[] = [];
  for (const linha of linhas.slice(1)) {
    const c = dividirLinhaCsv(linha, sep);
    const data = dataTextoParaISO(c[iData] ?? "");
    let valor: number | null = null;
    if (iValor >= 0) valor = valorTextoParaCentavos(c[iValor] ?? "");
    else {
      const deb = valorTextoParaCentavos(c[iDeb] ?? "");
      const cred = valorTextoParaCentavos(c[iCred] ?? "");
      valor = cred ? Math.abs(cred) : deb ? -Math.abs(deb) : null;
    }
    if (data && valor !== null && valor !== 0) {
      saida.push({ data, descricao: c[iDesc] || "Lançamento importado", valorCentavos: valor });
    }
  }
  return saida;
}

export function lerExtrato(nomeArquivo: string, texto: string): LinhaExtrato[] {
  if (/\.ofx$/i.test(nomeArquivo) || /<OFX>|<STMTTRN>/i.test(texto)) return lerOfx(texto);
  return lerCsv(texto);
}

/** Lê o arquivo como UTF-8 e, se houver caracteres inválidos (extratos antigos), como Windows-1252. */
export async function lerArquivoTexto(arquivo: File): Promise<string> {
  const buf = await arquivo.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buf);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(buf) : utf8;
}

export function chaveDeDuplicidade(data: string, valorCentavos: number): string {
  return `${data}|${Math.abs(valorCentavos)}`;
}
