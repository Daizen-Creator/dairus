// Catálogo dos widgets do Início e regras do layout (ordem, tamanho, colunas). Sem React.

export type WidgetId =
  | "fimdomes" | "hoje" | "sequencia" | "metas" | "receber" | "faturas" | "assinaturas" | "investido" | "atalhos" | "notas" | "foco"
  | "relogio" | "fotos" | "video"
  | "contaspagar" | "orcamento" | "maioresgastos" | "ultimos" | "saldos" | "patrimonio" | "reserva" | "poupanca"
  | "calendario" | "cotacoes" | "dica" | "contagem" | "calculadora";

export type GrupoWidget = "Dinheiro" | "Planejamento" | "Mercado" | "Produtividade" | "Mídia";
export type Tamanho = 1 | 2 | 3;

export interface InfoWidget {
  id: WidgetId;
  rotulo: string;
  descricao: string;
  grupo: GrupoWidget;
  /** Novo nesta versão (mostra o selo "novo" no catálogo). */
  novo?: boolean;
}

export const CATALOGO: InfoWidget[] = [
  { id: "fimdomes", rotulo: "Saldo previsto no fim do mês", descricao: "Estimativa com as contas e recebimentos agendados.", grupo: "Dinheiro" },
  { id: "saldos", rotulo: "Saldos das contas", descricao: "Quanto há em cada banco, carteira e dinheiro.", grupo: "Dinheiro", novo: true },
  { id: "patrimonio", rotulo: "Patrimônio líquido", descricao: "Tudo o que você tem menos tudo o que deve.", grupo: "Dinheiro", novo: true },
  { id: "hoje", rotulo: "Gasto de hoje e da semana", descricao: "Despesas lançadas hoje e desde segunda.", grupo: "Dinheiro" },
  { id: "maioresgastos", rotulo: "Maiores gastos do mês", descricao: "As categorias onde mais saiu dinheiro.", grupo: "Dinheiro", novo: true },
  { id: "ultimos", rotulo: "Últimos lançamentos", descricao: "As cinco movimentações mais recentes.", grupo: "Dinheiro", novo: true },
  { id: "faturas", rotulo: "Faturas de cartão", descricao: "Faturas em aberto e quando vencem.", grupo: "Dinheiro" },
  { id: "assinaturas", rotulo: "Assinaturas do mês", descricao: "Total com a etiqueta “assinatura” e quanto dá no ano.", grupo: "Dinheiro" },
  { id: "contaspagar", rotulo: "Contas a pagar", descricao: "Atrasadas e as que vencem nos próximos 7 dias.", grupo: "Planejamento", novo: true },
  { id: "receber", rotulo: "Próximos recebimentos", descricao: "O que entra nos próximos 30 dias.", grupo: "Planejamento" },
  { id: "orcamento", rotulo: "Orçamento do mês", descricao: "Gasto × limite das categorias mais apertadas.", grupo: "Planejamento", novo: true },
  { id: "poupanca", rotulo: "Quanto sobrou no mês", descricao: "Receitas − despesas e a porcentagem guardada.", grupo: "Planejamento", novo: true },
  { id: "reserva", rotulo: "Reserva de emergência", descricao: "Quantos meses de gasto o dinheiro disponível cobre.", grupo: "Planejamento", novo: true },
  { id: "metas", rotulo: "Metas quase lá", descricao: "Metas acima de 70% do valor.", grupo: "Planejamento" },
  { id: "sequencia", rotulo: "Dias sem gastar", descricao: "Sua sequência atual sem despesas.", grupo: "Planejamento" },
  { id: "calendario", rotulo: "Calendário do mês", descricao: "Dias com contas a pagar e a receber marcados.", grupo: "Planejamento", novo: true },
  { id: "contagem", rotulo: "Contagem regressiva", descricao: "Dias até o salário ou uma data sua.", grupo: "Planejamento", novo: true },
  { id: "investido", rotulo: "Total investido", descricao: "Soma das contas de investimento.", grupo: "Mercado" },
  { id: "cotacoes", rotulo: "Dólar e euro", descricao: "Cotação do dia e a variação (internet).", grupo: "Mercado", novo: true },
  { id: "atalhos", rotulo: "Meus atalhos", descricao: "Botões para as telas que você mais usa.", grupo: "Produtividade" },
  { id: "notas", rotulo: "Bloco de notas", descricao: "Lembretes rápidos que salvam sozinhos.", grupo: "Produtividade" },
  { id: "foco", rotulo: "Foco do mês", descricao: "Um objetivo para o mês, renovado todo mês.", grupo: "Produtividade" },
  { id: "calculadora", rotulo: "Calculadora", descricao: "Contas rápidas com + − × ÷ e %.", grupo: "Produtividade", novo: true },
  { id: "dica", rotulo: "Dica do dia", descricao: "Uma dica do Dairus por dia.", grupo: "Produtividade", novo: true },
  { id: "relogio", rotulo: "Relógio", descricao: "Digital ou de ponteiros, com outros fusos.", grupo: "Mídia" },
  { id: "fotos", rotulo: "Minhas fotos", descricao: "Álbum que troca sozinho e vira fundo.", grupo: "Mídia" },
  { id: "video", rotulo: "Vídeo", descricao: "Um vídeo seu em loop.", grupo: "Mídia" },
];

export const GRUPOS: GrupoWidget[] = ["Dinheiro", "Planejamento", "Mercado", "Produtividade", "Mídia"];
const IDS = new Set<string>(CATALOGO.map((w) => w.id));
export const infoDoWidget = (id: WidgetId) => CATALOGO.find((w) => w.id === id)!;

export const WIDGETS_PADRAO: WidgetId[] = ["fimdomes", "hoje", "sequencia", "metas", "receber", "faturas"];

export interface LayoutWidgets {
  /** Colunas em telas largas (em telas pequenas cai para 1 ou 2). */
  colunas: 2 | 3 | 4;
  espaco: "compacto" | "normal" | "amplo";
  /** Mostrar o título "Meus widgets" e o botão de editar. */
  titulo: boolean;
}

export const LAYOUT_PADRAO: LayoutWidgets = { colunas: 3, espaco: "normal", titulo: true };

/** Tamanhos padrão de alguns widgets (os outros ocupam 1 coluna). */
export const TAMANHOS_PADRAO: Partial<Record<WidgetId, Tamanho>> = { calendario: 1, ultimos: 1 };

/** Remove ids desconhecidos ou repetidos (preferências antigas ou importadas). */
export function normalizarAtivos(lista: unknown): WidgetId[] {
  if (!Array.isArray(lista)) return [...WIDGETS_PADRAO];
  const vistos = new Set<string>();
  return lista.filter((x): x is WidgetId => typeof x === "string" && IDS.has(x) && !vistos.has(x) && !!vistos.add(x));
}

export function normalizarLayout(l: unknown): LayoutWidgets {
  const o = (l && typeof l === "object" ? l : {}) as Partial<LayoutWidgets>;
  return {
    colunas: o.colunas === 2 || o.colunas === 4 ? o.colunas : 3,
    espaco: o.espaco === "compacto" || o.espaco === "amplo" ? o.espaco : "normal",
    titulo: o.titulo !== false,
  };
}

/** Tamanhos salvos; aceita o formato antigo (lista de widgets "largos"). */
export function normalizarTamanhos(t: unknown, largosAntigos?: unknown): Partial<Record<WidgetId, Tamanho>> {
  const saida: Partial<Record<WidgetId, Tamanho>> = {};
  if (Array.isArray(largosAntigos)) for (const id of largosAntigos) if (IDS.has(id)) saida[id as WidgetId] = 2;
  if (t && typeof t === "object") {
    for (const [id, v] of Object.entries(t)) if (IDS.has(id) && (v === 1 || v === 2 || v === 3)) saida[id as WidgetId] = v;
  }
  return saida;
}

/** Move o item da posição `de` para `para`. */
export function mover<T>(lista: T[], de: number, para: number): T[] {
  if (de === para || de < 0 || para < 0 || de >= lista.length || para >= lista.length) return lista;
  const copia = [...lista];
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item);
  return copia;
}

/** Classes da grade conforme as colunas e o espaçamento. */
export function classesDaGrade(l: LayoutWidgets): string {
  const colunas = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 xl:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" }[l.colunas];
  const espaco = { compacto: "gap-2", normal: "gap-3", amplo: "gap-5" }[l.espaco];
  return `grid ${colunas} ${espaco}`;
}

/** Colunas que o widget ocupa: P = 1, M = 2, G = a linha inteira. */
export function colunasDoTamanho(t: Tamanho, colunas: LayoutWidgets["colunas"]): number {
  return t === 3 ? colunas : Math.min(t, colunas);
}

/** Classes de largura do widget, acompanhando os pontos de quebra da grade. */
export function classeDoTamanho(t: Tamanho, l: LayoutWidgets): string {
  const n = colunasDoTamanho(t, l.colunas);
  if (n === 1) return "";
  if (n === 2) return "sm:col-span-2";
  return n === 3 ? "sm:col-span-2 xl:col-span-3" : "sm:col-span-2 lg:col-span-3 2xl:col-span-4";
}

export interface ModeloLayout {
  id: string;
  nome: string;
  descricao: string;
  widgets: WidgetId[];
  tamanhos: Partial<Record<WidgetId, Tamanho>>;
  layout: LayoutWidgets;
}

export const MODELOS: ModeloLayout[] = [
  { id: "padrao", nome: "Padrão", descricao: "O essencial do dia a dia.", widgets: WIDGETS_PADRAO, tamanhos: {}, layout: LAYOUT_PADRAO },
  { id: "contas", nome: "Contas em dia", descricao: "Vencimentos, faturas, calendário e saldo previsto.", widgets: ["contaspagar", "calendario", "faturas", "fimdomes", "receber", "saldos"], tamanhos: { calendario: 1 }, layout: { colunas: 3, espaco: "normal", titulo: true } },
  { id: "economia", nome: "Economizar", descricao: "Orçamento, maiores gastos, sobra do mês e sequência.", widgets: ["orcamento", "maioresgastos", "poupanca", "sequencia", "hoje", "foco"], tamanhos: { orcamento: 2 }, layout: { colunas: 3, espaco: "normal", titulo: true } },
  { id: "investidor", nome: "Investidor", descricao: "Patrimônio, reserva, investimentos e cotações.", widgets: ["patrimonio", "reserva", "investido", "cotacoes", "metas", "poupanca"], tamanhos: {}, layout: { colunas: 3, espaco: "normal", titulo: true } },
  { id: "minimalista", nome: "Minimalista", descricao: "Só três números, sem distrações.", widgets: ["fimdomes", "hoje", "contaspagar"], tamanhos: {}, layout: { colunas: 3, espaco: "amplo", titulo: false } },
  { id: "completo", nome: "Painel completo", descricao: "Muita informação numa tela larga.", widgets: ["fimdomes", "saldos", "contaspagar", "orcamento", "maioresgastos", "ultimos", "calendario", "poupanca", "reserva", "cotacoes", "relogio", "atalhos"], tamanhos: { orcamento: 2, relogio: 1 }, layout: { colunas: 4, espaco: "compacto", titulo: true } },
];
