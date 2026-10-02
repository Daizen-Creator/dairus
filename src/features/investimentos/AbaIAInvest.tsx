import { useState } from "react";
import { FileText, Send, Sparkles } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { arquivoParaAnexo, perguntarIA } from "../../services/gemini";
import { formatarCentavos } from "../../services/formato";
import { CLASSES_BOLSA, ROTULO_CLASSE } from "../../types/investimentos";
import { rendaPassivaMensal } from "./calculos";
import { cotacaoBrapi } from "./mercado";
import type { Carteira } from "./useCarteira";

const INSTRUCAO_INVEST = `Você é o assistente de investimentos do app Dairus, para um usuário brasileiro.
REGRAS OBRIGATÓRIAS: responda em português do Brasil; use somente os dados fornecidos; nunca invente números, notícias ou fatos.
Você NÃO pode recomendar comprar, vender ou manter ativos específicos nem dizer qual é "melhor" para o usuário:
recomendação personalizada de investimento é atividade regulada pela CVM. Seja informativo, neutro e educativo:
explique, compare critérios, aponte riscos e concentração, e lembre que a decisão é do usuário.
Você não tem acesso a notícias em tempo real: quando falar de causas de alta/queda, diga que são hipóteses gerais
baseadas nos dados (preço, indicadores, setor, juros) e sugira conferir as notícias e os fatos relevantes da empresa.
Marque claramente o que é estimativa.`;

function contextoCarteira(c: Carteira): string {
  const total = c.posicoes.filter((p) => p.ativo.quantidade > 0).reduce((s, p) => s + p.valor, 0);
  const linhas = c.posicoes
    .filter((p) => p.ativo.quantidade > 0)
    .map((p) => `${p.ativo.codigo} (${ROTULO_CLASSE[p.ativo.classe]}${p.ativo.setor ? `, setor ${p.ativo.setor}` : ""}${p.ativo.objetivo ? `, objetivo ${p.ativo.objetivo}` : ""}): valor ${formatarCentavos(p.valor)} (${total ? ((p.valor / total) * 100).toFixed(1) : 0}% da carteira), custo ${formatarCentavos(p.ativo.custo_centavos)}, resultado ${formatarCentavos(p.rent.resultadoTotal)}${p.fonte === "ESTIMATIVA" ? " [valor estimado]" : p.fonte === "CUSTO" ? " [sem cotação]" : ""}`);
  return [
    `Data: ${c.hoje}. Índices: Selic ${(c.indices.selicAnual * 100).toFixed(2)}% a.a., CDI ${(c.indices.cdiAnual * 100).toFixed(2)}% a.a., IPCA 12m ${(c.indices.ipca12m * 100).toFixed(2)}%.`,
    `Carteira total: ${formatarCentavos(total)}. Renda passiva média (12 meses): ${formatarCentavos(rendaPassivaMensal(c.ops, c.hoje))}/mês.`,
    "Posições:",
    ...linhas,
  ].join("\n");
}

const PERGUNTAS = [
  ["Explicar minha carteira", "Explique minha carteira em linguagem simples: como está dividida, quais são os riscos, a concentração (por ativo, setor e classe) e o nível de diversificação. Não recomende compras ou vendas."],
  ["Riscos de concentração", "Aponte riscos de concentração da carteira (ativo, setor, classe, emissor) com os percentuais, de forma neutra."],
  ["Renda passiva", "Analise minha renda passiva atual e explique, com números, o que muda o tamanho dela (sem recomendar ativos)."],
  ["Quanto rendeu", "Quanto cada classe de ativo rendeu até agora e qual pesa mais na carteira?"],
] as const;

export function AbaIAInvest({ carteira }: { carteira: Carteira }) {
  const bolsa = carteira.ativos.filter((a) => CLASSES_BOLSA.includes(a.classe));
  const [resposta, setResposta] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pergunta, setPergunta] = useState("");
  const [conceito, setConceito] = useState("");
  const [ativoA, setAtivoA] = useState(bolsa[0]?.codigo ?? "");
  const [ativoB, setAtivoB] = useState(bolsa[1]?.codigo ?? "");

  async function rodar(texto: string, extra = "", anexo?: { mime: string; base64: string }) {
    try {
      setCarregando(true);
      setErro(null);
      setResposta("");
      setResposta(await perguntarIA({ instrucao: INSTRUCAO_INVEST, contexto: `${contextoCarteira(carteira)}${extra ? `\n\n${extra}` : ""}`, pergunta: texto, anexo }));
    } catch (e) {
      setErro(String(e));
    } finally {
      setCarregando(false);
    }
  }

  async function dadosDe(codigo: string): Promise<string> {
    const c = await cotacaoBrapi(codigo, { range: "3mo", fundamentos: true }).catch(() => null);
    if (!c) return `${codigo}: sem dados de mercado.`;
    const h = c.historico;
    const var3m = h.length > 1 ? ((h[h.length - 1].valor / h[0].valor - 1) * 100).toFixed(1) : "?";
    const semana = h.length > 5 ? ((h[h.length - 1].valor / h[h.length - 6].valor - 1) * 100).toFixed(1) : "?";
    return `${c.ticker} (${c.nome ?? ""}): preço R$ ${c.preco ?? "?"}, variação no dia ${c.variacaoDia?.toFixed(2) ?? "?"}%, em 5 pregões ${semana}%, em 3 meses ${var3m}%, P/L ${c.precoLucro ?? "?"}, DY ${c.dividendYield !== null ? (c.dividendYield * 100).toFixed(2) + "%" : "?"}, P/VP ${c.precoValorPatrimonial ?? "?"}.`;
  }

  async function resumoSemana() {
    setCarregando(true);
    const dados = await Promise.all(bolsa.filter((a) => a.ativo && a.quantidade > 0).slice(0, 12).map((a) => dadosDe(a.codigo)));
    await rodar("Faça um resumo da semana de mercado focado nos meus ativos: o que mais subiu e caiu, como os juros (Selic/CDI) e a inflação afetam a carteira, e pontos de atenção. Sem recomendar compra ou venda.", `Dados de mercado dos meus ativos:\n${dados.join("\n")}`);
  }

  async function porQue() {
    setCarregando(true);
    await rodar(`Explique possíveis motivos, em termos gerais, para o movimento recente de ${ativoA}, com base nos dados abaixo. Deixe claro que são hipóteses e que é preciso conferir notícias e fatos relevantes.`, await dadosDe(ativoA));
  }

  async function comparar() {
    setCarregando(true);
    const [a, b] = await Promise.all([dadosDe(ativoA), dadosDe(ativoB)]);
    await rodar(`Compare ${ativoA} e ${ativoB} lado a lado, de forma neutra (indicadores, risco, setor, papel na carteira), sem dizer qual comprar.`, `${a}\n${b}`);
  }

  async function relatorio(arquivo: File) {
    await rodar("Traduza este relatório (de empresa ou FII) em pontos principais em português simples: resultados, dívida, proventos, riscos e o que mudou. Não recomende compra ou venda.", "", await arquivoParaAnexo(arquivo));
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-borda bg-fundo/60 px-3 py-2 text-xs text-texto-secundario">
        A IA explica, compara e aponta riscos, mas não diz “compre” ou “venda”: recomendação personalizada de investimento é atividade regulada pela CVM. Os dados da sua carteira vão para o Gemini só quando você clica.
      </p>
      <Secao titulo={<><Sparkles size={16} className="text-destaque" /> Análises com IA</>}>
        <div className="flex flex-wrap gap-2">
          {PERGUNTAS.map(([rotulo, texto]) => <Button key={rotulo} tamanho="pequeno" variante="secundaria" disabled={carregando} onClick={() => rodar(texto)}>{rotulo}</Button>)}
          <Button tamanho="pequeno" variante="secundaria" disabled={carregando || bolsa.length === 0} onClick={resumoSemana}>Resumo da semana dos meus ativos</Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Ativo" value={ativoA} onValueChange={setAtivoA} options={bolsa.map((a) => ({ value: a.codigo, label: a.codigo }))} className="w-32" />
            <Button tamanho="pequeno" variante="secundaria" disabled={carregando || !ativoA} onClick={porQue}>Por que subiu/caiu?</Button>
            <Select aria-label="Comparar com" value={ativoB} onValueChange={setAtivoB} options={bolsa.map((a) => ({ value: a.codigo, label: a.codigo }))} className="w-32" />
            <Button tamanho="pequeno" variante="secundaria" disabled={carregando || !ativoA || !ativoB || ativoA === ativoB} onClick={comparar}>Comparar</Button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (conceito.trim()) rodar(`Explique o conceito "${conceito}" de forma simples, com um exemplo em reais.`); }} className="flex gap-2">
            <input value={conceito} onChange={(e) => setConceito(e.target.value)} placeholder="Explicar conceito (ex.: come-cotas, marcação a mercado)" aria-label="Conceito" className={`${CLASSE_INPUT} flex-1`} />
            <Button tamanho="pequeno" type="submit" disabled={carregando}>Explicar</Button>
          </form>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-texto-secundario"><FileText size={14} /> Resumir relatório de empresa/FII (PDF):
          <input type="file" accept="application/pdf" aria-label="Relatório em PDF" disabled={carregando} onChange={(e) => e.target.files?.[0] && relatorio(e.target.files[0])} className="text-xs" />
        </label>
        <form onSubmit={(e) => { e.preventDefault(); if (pergunta.trim()) rodar(pergunta); }} className="mt-3 flex gap-2">
          <input value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="Pergunte sobre a sua carteira (ex.: quanto meus FIIs renderam em 2026?)" aria-label="Pergunta" className={`${CLASSE_INPUT} flex-1`} />
          <Button type="submit" disabled={carregando}><Send size={14} /></Button>
        </form>
      </Secao>
      {(carregando || resposta || erro) && (
        <Secao titulo="Resposta">
          {carregando && <p className="text-sm text-texto-secundario">Pensando…</p>}
          {erro && <p className="text-sm text-erro">{erro}</p>}
          {resposta && <div className="whitespace-pre-wrap text-sm leading-relaxed text-texto-primario">{resposta.replace(/\*\*/g, "")}</div>}
        </Secao>
      )}
    </div>
  );
}
