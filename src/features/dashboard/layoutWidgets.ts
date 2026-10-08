// Modelo do painel inicial (dashboard): catálogo de widgets, layouts com posição e
// tamanho livres numa grade de 12 colunas, encaixe automático, migração do formato
// antigo e modelos prontos. Sem React, para poder testar.

import type { ConfigGrafico } from "./graficoDados";

export type WidgetId =
  | "fimdomes" | "hoje" | "sequencia" | "metas" | "receber" | "faturas" | "assinaturas" | "investido" | "atalhos" | "notas" | "foco"
  | "relogio" | "fotos" | "video"
  | "contaspagar" | "orcamento" | "maioresgastos" | "ultimos" | "saldos" | "patrimonio" | "reserva" | "poupanca"
  | "calendario" | "cotacoes" | "dica" | "contagem" | "calculadora"
  | "grafico";

export type GrupoWidget = "Gráficos" | "Dinheiro" | "Planejamento" | "Mercado" | "Produtividade" | "Mídia";

export interface InfoWidget {
  id: WidgetId;
  rotulo: string;
  descricao: string;
  grupo: GrupoWidget;
  /** Tamanho ao adicionar e o mínimo, em células da grade (12 colunas). */
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  /** Pode aparecer várias vezes no mesmo layout (cada um com a sua configuração). */
  multiplo?: boolean;
  novo?: boolean;
}

export const COLUNAS = 12;
/** Altura de uma linha da grade, em pixels (sem o espaço entre os widgets). */
export const ALTURA_LINHA = 30;

export const CATALOGO: InfoWidget[] = [
  { id: "grafico", rotulo: "Gráfico personalizável", descricao: "Despesas, receitas, saldo ou uma categoria em linha, barras, rosca, tabela ou número.", grupo: "Gráficos", w: 6, h: 9, minW: 3, minH: 5, multiplo: true, novo: true },
  { id: "fimdomes", rotulo: "Saldo previsto no fim do mês", descricao: "Estimativa com as contas e recebimentos agendados.", grupo: "Dinheiro", w: 4, h: 4 },
  { id: "saldos", rotulo: "Saldos das contas", descricao: "Quanto há em cada banco, carteira e dinheiro.", grupo: "Dinheiro", w: 4, h: 6 },
  { id: "patrimonio", rotulo: "Patrimônio líquido", descricao: "Tudo o que você tem menos tudo o que deve.", grupo: "Dinheiro", w: 4, h: 4 },
  { id: "hoje", rotulo: "Gasto de hoje e da semana", descricao: "Despesas lançadas hoje e desde segunda.", grupo: "Dinheiro", w: 4, h: 4 },
  { id: "maioresgastos", rotulo: "Maiores gastos do mês", descricao: "As categorias onde mais saiu dinheiro.", grupo: "Dinheiro", w: 4, h: 6 },
  { id: "ultimos", rotulo: "Últimos lançamentos", descricao: "As cinco movimentações mais recentes.", grupo: "Dinheiro", w: 4, h: 6 },
  { id: "faturas", rotulo: "Faturas de cartão", descricao: "Faturas em aberto e quando vencem.", grupo: "Dinheiro", w: 4, h: 5 },
  { id: "assinaturas", rotulo: "Assinaturas do mês", descricao: "Total com a etiqueta “assinatura” e quanto dá no ano.", grupo: "Dinheiro", w: 4, h: 4 },
  { id: "contaspagar", rotulo: "Contas a pagar", descricao: "Atrasadas e as que vencem nos próximos 7 dias.", grupo: "Planejamento", w: 4, h: 6 },
  { id: "receber", rotulo: "Próximos recebimentos", descricao: "O que entra nos próximos 30 dias.", grupo: "Planejamento", w: 4, h: 5 },
  { id: "orcamento", rotulo: "Orçamento do mês", descricao: "Gasto × limite das categorias mais apertadas.", grupo: "Planejamento", w: 4, h: 6 },
  { id: "poupanca", rotulo: "Quanto sobrou no mês", descricao: "Receitas − despesas e a porcentagem guardada.", grupo: "Planejamento", w: 4, h: 4 },
  { id: "reserva", rotulo: "Reserva de emergência", descricao: "Quantos meses de gasto o dinheiro disponível cobre.", grupo: "Planejamento", w: 4, h: 5 },
  { id: "metas", rotulo: "Metas quase lá", descricao: "Metas acima de 70% do valor.", grupo: "Planejamento", w: 4, h: 4 },
  { id: "sequencia", rotulo: "Dias sem gastar", descricao: "Sua sequência atual sem despesas.", grupo: "Planejamento", w: 4, h: 4 },
  { id: "calendario", rotulo: "Calendário do mês", descricao: "Dias com contas a pagar e a receber marcados.", grupo: "Planejamento", w: 4, h: 9, minH: 8 },
  { id: "contagem", rotulo: "Contagem regressiva", descricao: "Dias até o salário ou uma data sua.", grupo: "Planejamento", w: 4, h: 4 },
  { id: "investido", rotulo: "Total investido", descricao: "Soma das contas de investimento.", grupo: "Mercado", w: 4, h: 4 },
  { id: "cotacoes", rotulo: "Dólar e euro", descricao: "Cotação do dia e a variação (internet).", grupo: "Mercado", w: 4, h: 4 },
  { id: "atalhos", rotulo: "Meus atalhos", descricao: "Botões para as telas que você mais usa.", grupo: "Produtividade", w: 4, h: 4 },
  { id: "notas", rotulo: "Bloco de notas", descricao: "Lembretes rápidos que salvam sozinhos.", grupo: "Produtividade", w: 4, h: 5 },
  { id: "foco", rotulo: "Foco do mês", descricao: "Um objetivo para o mês, renovado todo mês.", grupo: "Produtividade", w: 4, h: 4 },
  { id: "calculadora", rotulo: "Calculadora", descricao: "Contas rápidas com + − × ÷ e %.", grupo: "Produtividade", w: 4, h: 6 },
  { id: "dica", rotulo: "Dica do dia", descricao: "Uma dica do Dairus por dia.", grupo: "Produtividade", w: 4, h: 4 },
  { id: "relogio", rotulo: "Relógio", descricao: "Digital ou de ponteiros, com outros fusos.", grupo: "Mídia", w: 4, h: 5 },
  { id: "fotos", rotulo: "Fotos", descricao: "Álbum que troca sozinho e vira fundo, sem título por cima da foto.", grupo: "Mídia", w: 6, h: 8, minH: 4 },
  { id: "video", rotulo: "Vídeo", descricao: "Um vídeo seu em loop.", grupo: "Mídia", w: 6, h: 8, minH: 4 },
];

export const GRUPOS: GrupoWidget[] = ["Gráficos", "Dinheiro", "Planejamento", "Mercado", "Produtividade", "Mídia"];
const POR_ID = new Map(CATALOGO.map((w) => [w.id, w]));
export const infoDoWidget = (id: WidgetId): InfoWidget => POR_ID.get(id)!;
export const tipoValido = (t: unknown): t is WidgetId => typeof t === "string" && POR_ID.has(t as WidgetId);

// ---------------------------------------------------------------------------
// Modelo salvo no banco (tabela `dashboards`)

export interface ConfigWidget {
  /** Título próprio (vazio = o padrão do widget). */
  titulo?: string;
  /** Esconde a barra de título (ex.: foto ocupando o card inteiro). */
  semTitulo?: boolean;
  /** Fica na coluna lateral do Início (empilhado, na ordem de `y`), fora da grade. */
  lateral?: boolean;
  grafico?: ConfigGrafico;
}

export interface WidgetNoPainel {
  i: string;
  tipo: WidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: ConfigWidget;
}

export interface OpcoesPainel {
  /** true = os widgets sobem sozinhos para ocupar os buracos; false = posição 100% livre. */
  compactar: boolean;
  espaco: "compacto" | "normal" | "amplo";
  /** Mostrar a barra "Meus widgets" acima da grade. */
  titulo: boolean;
}

export interface Painel {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
  opcoes: OpcoesPainel;
  widgets: WidgetNoPainel[];
  atualizado_em?: string | null;
}

export const OPCOES_PADRAO: OpcoesPainel = { compactar: true, espaco: "normal", titulo: true };
export const MARGEM: Record<OpcoesPainel["espaco"], number> = { compacto: 8, normal: 12, amplo: 20 };

export function novoIdWidget(): string {
  return `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

const inteiro = (v: unknown, min: number, max: number, padrao: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : padrao);

export function normalizarOpcoes(o: unknown): OpcoesPainel {
  const x = (o && typeof o === "object" ? o : {}) as Partial<OpcoesPainel>;
  return {
    compactar: x.compactar !== false,
    espaco: x.espaco === "compacto" || x.espaco === "amplo" ? x.espaco : "normal",
    titulo: x.titulo !== false,
  };
}

/** Deixa um widget dentro da grade: tipo conhecido, id válido e único, tamanho entre o mínimo e 12 colunas. */
export function normalizarWidgets(lista: unknown): WidgetNoPainel[] {
  if (!Array.isArray(lista)) return [];
  const ids = new Set<string>();
  const saida: WidgetNoPainel[] = [];
  for (const bruto of lista as Array<Partial<WidgetNoPainel>>) {
    if (!bruto || !tipoValido(bruto.tipo)) continue;
    const info = infoDoWidget(bruto.tipo);
    let i = typeof bruto.i === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(bruto.i) ? bruto.i : novoIdWidget();
    while (ids.has(i)) i = novoIdWidget();
    ids.add(i);
    const w = inteiro(bruto.w, info.minW ?? 2, COLUNAS, info.w);
    saida.push({
      i,
      tipo: bruto.tipo,
      w,
      h: inteiro(bruto.h, info.minH ?? 3, 40, info.h),
      x: inteiro(bruto.x, 0, COLUNAS - w, 0),
      y: inteiro(bruto.y, 0, 2000, 0),
      config: bruto.config && typeof bruto.config === "object" ? bruto.config : undefined,
    });
  }
  return saida;
}

const sobrepoe = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Primeiro lugar livre (de cima para baixo, da esquerda para a direita) para um widget w×h. */
export function lugarLivre(widgets: Array<{ x: number; y: number; w: number; h: number }>, w: number, h: number): { x: number; y: number } {
  const largura = Math.min(w, COLUNAS);
  const fundo = widgets.reduce((m, x) => Math.max(m, x.y + x.h), 0);
  for (let y = 0; y <= fundo; y++) {
    for (let x = 0; x + largura <= COLUNAS; x++) {
      if (!widgets.some((o) => sobrepoe(o, { x, y, w: largura, h }))) return { x, y };
    }
  }
  return { x: 0, y: fundo };
}

/** Cria um widget do tipo no primeiro lugar livre do layout. */
export function criarWidget(widgets: WidgetNoPainel[], tipo: WidgetId, config?: ConfigWidget, tamanho?: { w?: number; h?: number }): WidgetNoPainel {
  const info = infoDoWidget(tipo);
  const w = tamanho?.w ?? info.w;
  const h = tamanho?.h ?? info.h;
  return { i: novoIdWidget(), tipo, w, h, ...lugarLivre(widgets, w, h), config: config ?? (tipo === "fotos" ? { semTitulo: true } : undefined) };
}

/** Monta os widgets em sequência (para modelos e para a migração do formato antigo). */
export function montar(itens: Array<{ tipo: WidgetId; w?: number; h?: number; config?: ConfigWidget }>): WidgetNoPainel[] {
  const widgets: WidgetNoPainel[] = [];
  for (const it of itens) widgets.push(criarWidget(widgets, it.tipo, it.config, it));
  return widgets;
}

export const naLateral = (w: WidgetNoPainel) => !!w.config?.lateral;
export const daGrade = (ws: WidgetNoPainel[]) => ws.filter((w) => !naLateral(w));
/** Widgets da coluna lateral, na ordem (de cima para baixo). */
export const daLateral = (ws: WidgetNoPainel[]) => ws.filter(naLateral).sort((a, b) => a.y - b.y);

/** Ordem de leitura (para telas estreitas, onde os widgets ficam um embaixo do outro). */
export function emOrdemDeLeitura<T extends { x: number; y: number }>(widgets: T[]): T[] {
  return [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
}

// ---------------------------------------------------------------------------
// Formato antigo (até a v0.2.4): lista de widgets ativos + tamanho P/M/G nas preferências

export const WIDGETS_PADRAO: WidgetId[] = ["fimdomes", "hoje", "sequencia", "metas", "receber", "faturas"];

/** Converte o formato antigo num layout com posições: P = largura padrão, M = 8 colunas, G = 12. */
export function migrarFormatoAntigo(ativos: unknown, tamanhos: unknown, largos: unknown, layout: unknown): { widgets: WidgetNoPainel[]; opcoes: OpcoesPainel } {
  const lista = Array.isArray(ativos) ? (ativos.filter((x, i, a) => tipoValido(x) && a.indexOf(x) === i) as WidgetId[]) : WIDGETS_PADRAO;
  const t = (tamanhos && typeof tamanhos === "object" ? tamanhos : {}) as Record<string, number>;
  const l = Array.isArray(largos) ? (largos as string[]) : [];
  const widgets = montar(lista.map((tipo) => {
    const tam = t[tipo] ?? (l.includes(tipo) ? 2 : 1);
    return { tipo, w: tam === 3 ? 12 : tam === 2 ? 8 : infoDoWidget(tipo).w, config: tipo === "fotos" ? { semTitulo: true } : undefined };
  }));
  const antigo = (layout && typeof layout === "object" ? layout : {}) as { espaco?: string; titulo?: boolean };
  return { widgets, opcoes: normalizarOpcoes({ compactar: true, espaco: antigo.espaco, titulo: antigo.titulo }) };
}

// ---------------------------------------------------------------------------
// Modelos prontos

export interface ModeloPainel {
  id: string;
  nome: string;
  descricao: string;
  itens: Array<{ tipo: WidgetId; w?: number; h?: number; config?: ConfigWidget }>;
  opcoes?: Partial<OpcoesPainel>;
}

const grafico = (c: ConfigGrafico, w = 6, h = 9, titulo?: string) => ({ tipo: "grafico" as const, w, h, config: { grafico: c, titulo } });

export const MODELOS: ModeloPainel[] = [
  { id: "visao", nome: "Visão geral", descricao: "O essencial do dia a dia, com o gráfico de despesas.", itens: [{ tipo: "fimdomes" }, { tipo: "hoje" }, { tipo: "contaspagar" }, grafico({ metrica: "despesas", periodo: "6m", granularidade: "mes", exibicao: "barras" }, 8), { tipo: "maioresgastos" }, { tipo: "receber" }, { tipo: "metas" }, { tipo: "sequencia" }] },
  { id: "relatorio", nome: "Relatório financeiro", descricao: "Receitas, despesas e resultado em números, linha, rosca e tabela.", itens: [grafico({ metrica: "resultado", periodo: "mes", granularidade: "auto", exibicao: "kpi" }, 4, 5, "Resultado do mês"), grafico({ metrica: "receitas", periodo: "mes", granularidade: "auto", exibicao: "kpi" }, 4, 5, "Receitas do mês"), grafico({ metrica: "despesas", periodo: "mes", granularidade: "auto", exibicao: "kpi" }, 4, 5, "Despesas do mês"), grafico({ metrica: "despesas", periodo: "12m", granularidade: "mes", exibicao: "linha" }, 8, 9), grafico({ metrica: "despesas", periodo: "mes", granularidade: "auto", exibicao: "rosca" }, 4, 9, "Despesas por categoria"), grafico({ metrica: "saldo", periodo: "6m", granularidade: "semana", exibicao: "linha" }, 6, 8, "Saldo disponível"), grafico({ metrica: "despesas", periodo: "mes", granularidade: "auto", exibicao: "tabela" }, 6, 8, "Despesas do mês por categoria")] },
  { id: "contas", nome: "Contas em dia", descricao: "Vencimentos, faturas, calendário e saldo previsto.", itens: [{ tipo: "contaspagar" }, { tipo: "calendario" }, { tipo: "faturas" }, { tipo: "fimdomes" }, { tipo: "receber" }, { tipo: "saldos" }] },
  { id: "economia", nome: "Economizar", descricao: "Orçamento, maiores gastos, sobra do mês e gasto por dia.", itens: [{ tipo: "orcamento", w: 8 }, { tipo: "poupanca" }, { tipo: "maioresgastos" }, grafico({ metrica: "despesas", periodo: "30d", granularidade: "dia", exibicao: "barras" }, 8, 8, "Gasto por dia"), { tipo: "sequencia" }, { tipo: "foco" }] },
  { id: "investidor", nome: "Investidor", descricao: "Patrimônio, reserva, investimentos e cotações.", itens: [{ tipo: "patrimonio" }, { tipo: "reserva" }, { tipo: "investido" }, grafico({ metrica: "saldo", periodo: "12m", granularidade: "mes", exibicao: "linha" }, 8, 9, "Evolução do saldo"), { tipo: "cotacoes" }, { tipo: "metas" }] },
  { id: "produtividade", nome: "Produtividade", descricao: "Relógio, calendário, notas, foco, atalhos e calculadora.", itens: [{ tipo: "relogio" }, { tipo: "calendario" }, { tipo: "notas" }, { tipo: "foco" }, { tipo: "atalhos" }, { tipo: "calculadora" }] },
  { id: "minimalista", nome: "Minimalista", descricao: "Só três números, sem distrações.", itens: [{ tipo: "fimdomes" }, { tipo: "hoje" }, { tipo: "contaspagar" }], opcoes: { espaco: "amplo", titulo: false } },
  { id: "vazio", nome: "Em branco", descricao: "Comece do zero e monte do seu jeito.", itens: [] },
];

export function widgetsDoModelo(m: ModeloPainel): WidgetNoPainel[] {
  return montar(m.itens);
}
