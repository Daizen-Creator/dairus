// Linha do tempo do patrimônio: série mensal desde o primeiro lançamento e os marcos
// (primeiro mês no azul, patamares redondos, dívidas zeradas, bens adquiridos, maior alta).

import type { Conta, Lancamento } from "../../types/accounting";
import type { Bem } from "../../types/extras";

export interface PontoMes {
  mes: string; // AAAA-MM
  liquido: number;
  dividas: number;
}

export interface Marco {
  mes: string;
  titulo: string;
  tipo: "positivo" | "patamar" | "divida" | "bem" | "recorde";
}

const PATAMARES = [1_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000, 250_000_000, 500_000_000]; // centavos

const fimDoMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

export function serieMensal(hoje: string, contas: Conta[], lancamentos: Lancamento[], bens: Bem[]): PontoMes[] {
  const datas = [...lancamentos.map((l) => l.data), ...bens.flatMap((b) => b.avaliacoes.map((a) => a.data))].filter((d) => d <= hoje).sort();
  if (!datas.length) return [];
  const tipo = new Map(contas.map((c) => [c.id, c.tipo]));
  const ordenados = [...lancamentos].sort((a, b) => a.data.localeCompare(b.data));
  const meses: string[] = [];
  let [a, m] = datas[0].slice(0, 7).split("-").map(Number);
  const ultimo = hoje.slice(0, 7);
  for (let i = 0; i < 600; i++) {
    const mes = `${a}-${String(m).padStart(2, "0")}`;
    meses.push(mes);
    if (mes >= ultimo) break;
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  const serie: PontoMes[] = [];
  let ativo = 0;
  let passivo = 0;
  let k = 0;
  for (const mes of meses) {
    const fim = fimDoMes(mes);
    for (; k < ordenados.length && ordenados[k].data <= fim; k++) {
      for (const p of ordenados[k].partidas) {
        const t = tipo.get(p.conta_id);
        if (t === "ATIVO") ativo += p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos;
        else if (t === "PASSIVO") passivo += p.tipo === "CREDITO" ? p.valor_centavos : -p.valor_centavos;
      }
    }
    let bensValor = 0;
    let dividasBens = 0;
    for (const b of bens) {
      const vigente = [...b.avaliacoes].sort((x, y) => y.data.localeCompare(x.data)).find((x) => x.data <= fim);
      if (!vigente) continue;
      if (b.tipo === "BEM") bensValor += vigente.valor_centavos;
      else dividasBens += vigente.valor_centavos;
    }
    serie.push({ mes, liquido: ativo - passivo + bensValor - dividasBens, dividas: passivo + dividasBens });
  }
  return serie;
}

const reais = (c: number) => `R$ ${(c / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export function marcosDoPatrimonio(serie: PontoMes[], bens: Bem[]): Marco[] {
  const marcos: Marco[] = [];
  let recorde = -Infinity;
  let maiorAlta = { mes: "", valor: 0 };
  for (let i = 0; i < serie.length; i++) {
    const p = serie[i];
    const ant = serie[i - 1];
    if (ant && ant.liquido < 0 && p.liquido >= 0) marcos.push({ mes: p.mes, titulo: "Patrimônio voltou para o azul", tipo: "positivo" });
    for (const t of PATAMARES) if ((ant ? ant.liquido : 0) < t && p.liquido >= t && !marcos.some((x) => x.titulo.includes(reais(t)))) marcos.push({ mes: p.mes, titulo: `Passou de ${reais(t)}`, tipo: "patamar" });
    if (ant && ant.dividas > 0 && p.dividas <= 0) marcos.push({ mes: p.mes, titulo: "Zerou as dívidas", tipo: "divida" });
    if (ant && p.liquido - ant.liquido > maiorAlta.valor) maiorAlta = { mes: p.mes, valor: p.liquido - ant.liquido };
    recorde = Math.max(recorde, p.liquido);
  }
  for (const b of bens) {
    if (b.tipo !== "BEM" || !b.avaliacoes.length) continue;
    const primeira = [...b.avaliacoes].sort((x, y) => x.data.localeCompare(y.data))[0];
    marcos.push({ mes: primeira.data.slice(0, 7), titulo: `${b.nome} entrou no patrimônio`, tipo: "bem" });
  }
  if (maiorAlta.valor > 0) marcos.push({ mes: maiorAlta.mes, titulo: `Maior alta em um mês: +${reais(maiorAlta.valor)}`, tipo: "recorde" });
  const atual = serie[serie.length - 1];
  if (atual && serie.length > 1 && atual.liquido === recorde && atual.liquido > serie[0].liquido) marcos.push({ mes: atual.mes, titulo: "Patrimônio no maior valor da história", tipo: "recorde" });
  return marcos.sort((a, b) => a.mes.localeCompare(b.mes));
}
