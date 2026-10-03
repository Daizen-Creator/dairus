// Aparência do Dairus: tudo o que o usuário personaliza além do tema de cores
// (fundo, menu, fonte, tamanho, bordas, transparência). Um único objeto JSON
// versionado, salvo nas preferências da conta e copiado para a nuvem.

export type TipoFundo = "tema" | "cor" | "gradiente" | "imagem" | "video" | "animado";
export type EstiloAnimado = "aurora" | "ondas" | "bolhas" | "gradiente";
export type AjusteImagem = "cover" | "contain" | "fill" | "repeat";
export type PosicaoImagem = "center" | "top" | "bottom" | "left" | "right";

export interface ParadaGradiente {
  cor: string;
  /** 0 a 100 (%). */
  pos: number;
}

export interface Gradiente {
  tipo: "linear" | "radial";
  /** Graus (só no linear). */
  angulo: number;
  paradas: ParadaGradiente[];
}

/** Ajustes comuns a imagem e vídeo para manter o texto legível. */
export interface AjustesMidia {
  /** 0 a 1. */
  opacidade: number;
  /** px. */
  desfoque: number;
  /** -100 (clarear) a 100 (escurecer). */
  escurecer: number;
  /** 0 a 200 (%). */
  saturacao: number;
}

export interface Aparencia {
  versao: 1;
  fundo: {
    tipo: TipoFundo;
    cor: string;
    gradiente: Gradiente;
    /** "galeria:<id>" ou "midia:<id>" (arquivo enviado, guardado neste computador). */
    imagem: string;
    ajuste: AjusteImagem;
    posicao: PosicaoImagem;
    /** Id do vídeo enviado (guardado neste computador). */
    video: string;
    animado: EstiloAnimado;
    /** 0.25 a 3. */
    velocidade: number;
    midia: AjustesMidia;
  };
  menu: {
    layout: "lateral" | "superior";
    /** fixo = aberto; recolhido = só ícones; gaveta = escondido, abre por um botão. */
    modo: "fixo" | "recolhido" | "gaveta";
    itens: "ambos" | "icones" | "texto";
    /** Rotas na ordem escolhida (as que faltarem vão para o fim). */
    ordem: string[];
    vidro: boolean;
    /** 0.2 a 1. */
    opacidade: number;
    corFundo: string | null;
    corSelecionado: string | null;
    corHover: string | null;
    /** px, menu lateral aberto. */
    largura: number;
  };
  tipografia: {
    fonte: string;
    /** % do tamanho base (87.5, 100, 112.5, 125). */
    tamanho: number;
  };
  formas: {
    /** Multiplica o arredondamento das bordas (0 = quadrado, 1 = padrão, 2.5 = bem redondo). */
    raio: number;
    /** 0.15 a 1: quanto o fundo aparece através dos cartões. */
    opacidadeCartoes: number;
    /** px de desfoque atrás dos cartões. */
    desfoqueCartoes: number;
    sombras: boolean;
    brilho: boolean;
    animacoes: boolean;
  };
  /** Predefinição aplicada por último (só para mostrar marcada). */
  preset: string | null;
  atualizadoEm: string;
}

export const APARENCIA_PADRAO: Aparencia = {
  versao: 1,
  fundo: {
    tipo: "tema",
    cor: "#0b1020",
    gradiente: { tipo: "linear", angulo: 135, paradas: [{ cor: "#1e3a8a", pos: 0 }, { cor: "#7c3aed", pos: 100 }] },
    imagem: "galeria:montanhas",
    ajuste: "cover",
    posicao: "center",
    video: "",
    animado: "aurora",
    velocidade: 1,
    midia: { opacidade: 1, desfoque: 0, escurecer: 35, saturacao: 100 },
  },
  menu: {
    layout: "lateral",
    modo: "fixo",
    itens: "ambos",
    ordem: [],
    vidro: false,
    opacidade: 1,
    corFundo: null,
    corSelecionado: null,
    corHover: null,
    largura: 232,
  },
  tipografia: { fonte: "padrao", tamanho: 100 },
  formas: { raio: 1, opacidadeCartoes: 1, desfoqueCartoes: 18, sombras: true, brilho: true, animacoes: true },
  preset: null,
  atualizadoEm: "1970-01-01T00:00:00.000Z",
};

export interface Fonte {
  id: string;
  nome: string;
  familia: string;
  grupo: "Sem serifa" | "Com serifa" | "Monoespaçada" | "Do Windows";
  /** Carrega o arquivo da fonte (embutida no app) só quando escolhida. */
  carregar?: () => Promise<unknown>;
}

export const FONTES: Fonte[] = [
  { id: "padrao", nome: "Padrão do Dairus", familia: '"Inter Variable", "Segoe UI", system-ui, sans-serif', grupo: "Sem serifa", carregar: () => import("@fontsource-variable/inter") },
  { id: "inter", nome: "Inter", familia: '"Inter Variable", system-ui, sans-serif', grupo: "Sem serifa", carregar: () => import("@fontsource-variable/inter") },
  { id: "dm-sans", nome: "DM Sans", familia: '"DM Sans Variable", system-ui, sans-serif', grupo: "Sem serifa", carregar: () => import("@fontsource-variable/dm-sans") },
  { id: "nunito", nome: "Nunito (arredondada)", familia: '"Nunito Variable", system-ui, sans-serif', grupo: "Sem serifa", carregar: () => import("@fontsource-variable/nunito") },
  { id: "quicksand", nome: "Quicksand", familia: '"Quicksand Variable", system-ui, sans-serif', grupo: "Sem serifa", carregar: () => import("@fontsource-variable/quicksand") },
  { id: "montserrat", nome: "Montserrat", familia: '"Montserrat Variable", system-ui, sans-serif', grupo: "Sem serifa", carregar: () => import("@fontsource-variable/montserrat") },
  { id: "outfit", nome: "Outfit", familia: '"Outfit Variable", system-ui, sans-serif', grupo: "Sem serifa", carregar: () => import("@fontsource-variable/outfit") },
  { id: "lora", nome: "Lora", familia: '"Lora Variable", Georgia, serif', grupo: "Com serifa", carregar: () => import("@fontsource-variable/lora") },
  { id: "playfair", nome: "Playfair Display", familia: '"Playfair Display Variable", Georgia, serif', grupo: "Com serifa", carregar: () => import("@fontsource-variable/playfair-display") },
  { id: "georgia", nome: "Georgia", familia: 'Georgia, "Times New Roman", serif', grupo: "Com serifa" },
  { id: "jetbrains", nome: "JetBrains Mono", familia: '"JetBrains Mono Variable", Consolas, monospace', grupo: "Monoespaçada", carregar: () => import("@fontsource-variable/jetbrains-mono") },
  { id: "cascadia", nome: "Cascadia / Consolas", familia: '"Cascadia Code", Consolas, monospace', grupo: "Monoespaçada" },
  { id: "segoe", nome: "Segoe UI", familia: '"Segoe UI", system-ui, sans-serif', grupo: "Do Windows" },
  { id: "verdana", nome: "Verdana (mais legível)", familia: "Verdana, Tahoma, sans-serif", grupo: "Do Windows" },
];

export const TAMANHOS = [
  { valor: 87.5, rotulo: "Pequeno" },
  { valor: 100, rotulo: "Médio" },
  { valor: 112.5, rotulo: "Grande" },
  { valor: 125, rotulo: "Muito grande" },
];

export const GRADIENTES_PRONTOS: Array<{ nome: string; gradiente: Gradiente }> = [
  { nome: "Galáxia", gradiente: { tipo: "linear", angulo: 135, paradas: [{ cor: "#0f0c29", pos: 0 }, { cor: "#302b63", pos: 50 }, { cor: "#24243e", pos: 100 }] } },
  { nome: "Oceano", gradiente: { tipo: "linear", angulo: 160, paradas: [{ cor: "#0b3c5d", pos: 0 }, { cor: "#1d7a8c", pos: 55 }, { cor: "#5fd1c9", pos: 100 }] } },
  { nome: "Pôr do sol", gradiente: { tipo: "linear", angulo: 135, paradas: [{ cor: "#2b1055", pos: 0 }, { cor: "#d53369", pos: 60 }, { cor: "#f6a04d", pos: 100 }] } },
  { nome: "Floresta", gradiente: { tipo: "linear", angulo: 150, paradas: [{ cor: "#0b2e1f", pos: 0 }, { cor: "#1f6f4a", pos: 60 }, { cor: "#9bd770", pos: 100 }] } },
  { nome: "Aurora", gradiente: { tipo: "radial", angulo: 0, paradas: [{ cor: "#22d3ee", pos: 0 }, { cor: "#6d28d9", pos: 45 }, { cor: "#020617", pos: 100 }] } },
  { nome: "Pêssego", gradiente: { tipo: "linear", angulo: 120, paradas: [{ cor: "#ffecd2", pos: 0 }, { cor: "#fcb69f", pos: 100 }] } },
  { nome: "Lavanda", gradiente: { tipo: "linear", angulo: 135, paradas: [{ cor: "#e0c3fc", pos: 0 }, { cor: "#8ec5fc", pos: 100 }] } },
  { nome: "Grafite", gradiente: { tipo: "linear", angulo: 180, paradas: [{ cor: "#232526", pos: 0 }, { cor: "#414345", pos: 100 }] } },
  { nome: "Neon", gradiente: { tipo: "linear", angulo: 90, paradas: [{ cor: "#ff00cc", pos: 0 }, { cor: "#3333ff", pos: 100 }] } },
  { nome: "Menta", gradiente: { tipo: "linear", angulo: 135, paradas: [{ cor: "#d4fc79", pos: 0 }, { cor: "#96e6a1", pos: 100 }] } },
];

export const CORES_PRONTAS = ["#0b1020", "#111827", "#1e1b4b", "#0f172a", "#052e2b", "#3b0764", "#f8fafc", "#faf7f2", "#ecfeff", "#fef3c7", "#fce7f3", "#e0e7ff"];

export const CORES_DESTAQUE = ["#1677ff", "#2563eb", "#7c3aed", "#db2777", "#e11d48", "#ea580c", "#f59e0b", "#16a34a", "#0d9488", "#06b6d4", "#64748b", "#a3e635"];

// ---------------------------------------------------------------------------
// Validação: o JSON salvo pode ser antigo, de outra versão ou editado à mão.

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const cor = (v: unknown, padrao: string) => (typeof v === "string" && HEX.test(v) ? v : padrao);
const corOuNulo = (v: unknown) => (typeof v === "string" && HEX.test(v) ? v : null);
const num = (v: unknown, min: number, max: number, padrao: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : padrao);
const opcao = <T extends string>(v: unknown, opcoes: readonly T[], padrao: T): T => (opcoes.includes(v as T) ? (v as T) : padrao);
const bool = (v: unknown, padrao: boolean) => (typeof v === "boolean" ? v : padrao);
const texto = (v: unknown, padrao: string, max = 200) => (typeof v === "string" && v.length <= max ? v : padrao);

function normalizarGradiente(g: unknown): Gradiente {
  const p = APARENCIA_PADRAO.fundo.gradiente;
  const o = (g ?? {}) as Partial<Gradiente>;
  const paradas = Array.isArray(o.paradas)
    ? o.paradas.slice(0, 6).map((x) => ({ cor: cor(x?.cor, "#000000"), pos: num(x?.pos, 0, 100, 0) })).sort((a, b) => a.pos - b.pos)
    : p.paradas;
  return { tipo: opcao(o.tipo, ["linear", "radial"] as const, p.tipo), angulo: num(o.angulo, 0, 360, p.angulo), paradas: paradas.length >= 2 ? paradas : p.paradas };
}

/** Aceita qualquer coisa (JSON salvo, importado ou da nuvem) e devolve uma aparência válida. */
export function normalizarAparencia(entrada: unknown): Aparencia {
  const e = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, any>;
  const P = APARENCIA_PADRAO;
  const f = e.fundo ?? {};
  const m = e.menu ?? {};
  const t = e.tipografia ?? {};
  const fo = e.formas ?? {};
  const mi = f.midia ?? {};
  return {
    versao: 1,
    fundo: {
      tipo: opcao(f.tipo, ["tema", "cor", "gradiente", "imagem", "video", "animado"] as const, P.fundo.tipo),
      cor: cor(f.cor, P.fundo.cor),
      gradiente: normalizarGradiente(f.gradiente),
      imagem: typeof f.imagem === "string" && /^(galeria|midia):[\w-]{1,80}$/.test(f.imagem) ? f.imagem : P.fundo.imagem,
      ajuste: opcao(f.ajuste, ["cover", "contain", "fill", "repeat"] as const, P.fundo.ajuste),
      posicao: opcao(f.posicao, ["center", "top", "bottom", "left", "right"] as const, P.fundo.posicao),
      video: typeof f.video === "string" && /^[\w-]{0,80}$/.test(f.video) ? f.video : "",
      animado: opcao(f.animado, ["aurora", "ondas", "bolhas", "gradiente"] as const, P.fundo.animado),
      velocidade: num(f.velocidade, 0.25, 3, 1),
      midia: {
        opacidade: num(mi.opacidade, 0.1, 1, P.fundo.midia.opacidade),
        desfoque: num(mi.desfoque, 0, 40, P.fundo.midia.desfoque),
        escurecer: num(mi.escurecer, -100, 100, P.fundo.midia.escurecer),
        saturacao: num(mi.saturacao, 0, 200, 100),
      },
    },
    menu: {
      layout: opcao(m.layout, ["lateral", "superior"] as const, P.menu.layout),
      modo: opcao(m.modo, ["fixo", "recolhido", "gaveta"] as const, P.menu.modo),
      itens: opcao(m.itens, ["ambos", "icones", "texto"] as const, P.menu.itens),
      ordem: Array.isArray(m.ordem) ? m.ordem.filter((r: unknown): r is string => typeof r === "string" && r.startsWith("/") && r.length < 60).slice(0, 60) : [],
      vidro: bool(m.vidro, P.menu.vidro),
      opacidade: num(m.opacidade, 0.2, 1, 1),
      corFundo: corOuNulo(m.corFundo),
      corSelecionado: corOuNulo(m.corSelecionado),
      corHover: corOuNulo(m.corHover),
      largura: num(m.largura, 200, 320, P.menu.largura),
    },
    tipografia: {
      fonte: FONTES.some((x) => x.id === t.fonte) ? t.fonte : "padrao",
      tamanho: num(t.tamanho, 75, 150, 100),
    },
    formas: {
      raio: num(fo.raio, 0, 2.5, 1),
      opacidadeCartoes: num(fo.opacidadeCartoes, 0.15, 1, 1),
      desfoqueCartoes: num(fo.desfoqueCartoes, 0, 40, 18),
      sombras: bool(fo.sombras, true),
      brilho: bool(fo.brilho, true),
      animacoes: bool(fo.animacoes, true),
    },
    preset: typeof e.preset === "string" ? texto(e.preset, "", 40) || null : null,
    atualizadoEm: typeof e.atualizadoEm === "string" && !Number.isNaN(Date.parse(e.atualizadoEm)) ? e.atualizadoEm : P.atualizadoEm,
  };
}

/** Mescla parcial profunda (só objetos simples), para `alterar({ menu: { vidro: true } })`. */
export type ParcialProfunda<T> = { [K in keyof T]?: T[K] extends Array<unknown> ? T[K] : T[K] extends object | null ? ParcialProfunda<T[K]> : T[K] };

export function mesclar<T>(base: T, parte: ParcialProfunda<T>): T {
  const saida: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const [k, v] of Object.entries(parte as object)) {
    const atual = (base as any)[k];
    saida[k] = v && typeof v === "object" && !Array.isArray(v) && atual && typeof atual === "object" && !Array.isArray(atual) ? mesclar(atual, v as any) : v;
  }
  return saida;
}

// ---------------------------------------------------------------------------
// CSS

export function cssGradiente(g: Gradiente): string {
  const paradas = g.paradas.map((p) => `${p.cor} ${Math.round(p.pos)}%`).join(", ");
  return g.tipo === "radial" ? `radial-gradient(circle at 30% 20%, ${paradas})` : `linear-gradient(${Math.round(g.angulo)}deg, ${paradas})`;
}

/** Variáveis CSS aplicadas no <html>; os componentes só leem as variáveis. */
export function variaveisCss(a: Aparencia): Record<string, string> {
  const r = a.formas.raio;
  const px = (base: number) => `${(base * r).toFixed(2)}px`;
  const fonte = FONTES.find((f) => f.id === a.tipografia.fonte) ?? FONTES[0];
  return {
    "--fonte-app": fonte.familia,
    "--radius-sm": px(4),
    "--radius-md": px(6),
    "--radius-lg": px(8),
    "--radius-xl": px(12),
    "--radius-2xl": px(16),
    "--radius-3xl": px(24),
    "--opacidade-cartao": String(a.formas.opacidadeCartoes),
    "--desfoque-cartao": `${a.formas.desfoqueCartoes}px`,
    "--menu-largura": `${a.menu.largura}px`,
    "--menu-opacidade": String(a.menu.opacidade),
    "--menu-fundo": a.menu.corFundo ?? "var(--cor-superficie)",
    "--menu-selecionado": a.menu.corSelecionado ?? "var(--cor-primaria)",
    "--menu-hover": a.menu.corHover ? `color-mix(in srgb, ${a.menu.corHover} 22%, transparent)` : "color-mix(in srgb, var(--cor-primaria) 10%, transparent)",
    "--menu-desfoque": a.menu.vidro ? "16px" : "0px",
  };
}

/** Classes no <html> para o que não é só valor (liga/desliga). */
export function classesHtml(a: Aparencia): Record<string, boolean> {
  return {
    "sem-sombras": !a.formas.sombras,
    "sem-brilho": !a.formas.brilho,
    "sem-animacoes-ui": !a.formas.animacoes,
    "fundo-personalizado": a.fundo.tipo !== "tema",
    "menu-vidro": a.menu.vidro,
  };
}

// ---------------------------------------------------------------------------
// Acessibilidade: contraste WCAG do texto contra o fundo escolhido.

export function hexParaRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbParaHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0")).join("")}`;
}

/** Luminância relativa (WCAG 2.x). */
export function luminancia([r, g, b]: [number, number, number]): number {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function razaoContraste(a: [number, number, number], b: [number, number, number]): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Mistura `cor` com preto (escurecer > 0) ou branco (< 0), como a camada por cima da imagem. */
export function aplicarCamada(rgb: [number, number, number], escurecer: number): [number, number, number] {
  const t = Math.abs(escurecer) / 100;
  const alvo = escurecer >= 0 ? 0 : 255;
  return rgb.map((v) => v + (alvo - v) * t) as [number, number, number];
}

export function mediaRgb(cores: Array<[number, number, number]>): [number, number, number] {
  const n = Math.max(1, cores.length);
  return cores.reduce<[number, number, number]>((s, c) => [s[0] + c[0] / n, s[1] + c[1] / n, s[2] + c[2] / n], [0, 0, 0]);
}

export type NivelContraste = "AAA" | "AA" | "AA grande" | "baixo";

export function nivelWcag(razao: number): NivelContraste {
  if (razao >= 7) return "AAA";
  if (razao >= 4.5) return "AA";
  if (razao >= 3) return "AA grande";
  return "baixo";
}

/**
 * Cor "média" do fundo como o usuário vê (antes dos cartões). Para imagem/vídeo
 * usa a cor média medida da mídia (`mediaMidia`), já com a camada de escurecer.
 */
export function corEfetivaDoFundo(a: Aparencia, fundoTema: string, mediaMidia: [number, number, number] | null): [number, number, number] {
  const f = a.fundo;
  switch (f.tipo) {
    case "cor":
      return hexParaRgb(f.cor);
    case "gradiente":
      return mediaRgb(f.gradiente.paradas.map((p) => hexParaRgb(p.cor)));
    case "imagem":
    case "video": {
      const base = mediaMidia ?? hexParaRgb(fundoTema);
      const comCamada = aplicarCamada(base, f.midia.escurecer);
      // Opacidade < 1 deixa ver o fundo do tema por trás.
      const tema = hexParaRgb(fundoTema);
      return comCamada.map((v, i) => v * f.midia.opacidade + tema[i] * (1 - f.midia.opacidade)) as [number, number, number];
    }
    default:
      return hexParaRgb(fundoTema);
  }
}

/** Quanto escurecer (ou clarear) a camada para o texto atingir 4,5:1 (AA). */
export function escurecerParaContraste(base: [number, number, number], texto: [number, number, number], alvo = 4.5): number | null {
  const textoClaro = luminancia(texto) > 0.4;
  for (let passo = 0; passo <= 100; passo += 5) {
    const e = textoClaro ? passo : -passo;
    if (razaoContraste(aplicarCamada(base, e), texto) >= alvo) return e;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Predefinições de um clique: tema + fundo + menu + fonte + formas.

export interface Predefinicao {
  id: string;
  nome: string;
  descricao: string;
  temaId: string;
  corDestaque: string | null;
  aparencia: ParcialProfunda<Aparencia>;
}

export const PREDEFINICOES: Predefinicao[] = [
  {
    id: "padrao",
    nome: "Neon Dark (original)",
    descricao: "O visual de fábrica do Dairus.",
    temaId: "noite-urbana",
    corDestaque: null,
    aparencia: {},
  },
  {
    id: "minimalista",
    nome: "Minimalista",
    descricao: "Claro, limpo, sem brilho nem sombra, bordas discretas.",
    temaId: "branco-puro",
    corDestaque: "#111827",
    aparencia: { fundo: { tipo: "cor", cor: "#f8fafc" }, formas: { raio: 0.6, sombras: false, brilho: false, opacidadeCartoes: 1 }, tipografia: { fonte: "inter" }, menu: { itens: "texto" } },
  },
  {
    id: "cyberpunk",
    nome: "Cyberpunk",
    descricao: "Neon rosa e azul, fonte mono e menu de vidro.",
    temaId: "synthwave",
    corDestaque: "#ff2bd6",
    aparencia: { fundo: { tipo: "imagem", imagem: "galeria:cidade-neon", midia: { opacidade: 1, desfoque: 0, escurecer: 45, saturacao: 130 } }, menu: { vidro: true, opacidade: 0.55 }, formas: { raio: 0.4, opacidadeCartoes: 0.7, brilho: true }, tipografia: { fonte: "jetbrains" } },
  },
  {
    id: "oceano",
    nome: "Oceano",
    descricao: "Degradê azul-turquesa, letras arredondadas, tudo bem redondo.",
    temaId: "oceano-profundo",
    corDestaque: "#06b6d4",
    aparencia: { fundo: { tipo: "gradiente", gradiente: GRADIENTES_PRONTOS[1].gradiente }, menu: { vidro: true, opacidade: 0.5 }, formas: { raio: 1.8, opacidadeCartoes: 0.65 }, tipografia: { fonte: "nunito" } },
  },
  {
    id: "noturno",
    nome: "Produtividade noturna",
    descricao: "Escuro e calmo: menu só com ícones, sem animação, sem brilho.",
    temaId: "obsidiana",
    corDestaque: "#64748b",
    aparencia: { fundo: { tipo: "cor", cor: "#0b0f17" }, menu: { modo: "recolhido" }, formas: { animacoes: false, brilho: false, raio: 0.8 }, tipografia: { fonte: "dm-sans" } },
  },
  {
    id: "natureza",
    nome: "Natureza",
    descricao: "Montanhas ao fundo com vidro fosco nos cartões.",
    temaId: "mata-atlantica",
    corDestaque: "#22c55e",
    aparencia: { fundo: { tipo: "imagem", imagem: "galeria:montanhas", midia: { opacidade: 1, desfoque: 2, escurecer: 40, saturacao: 100 } }, menu: { vidro: true, opacidade: 0.5 }, formas: { raio: 1.4, opacidadeCartoes: 0.6, desfoqueCartoes: 22 }, tipografia: { fonte: "outfit" } },
  },
  {
    id: "aurora",
    nome: "Aurora animada",
    descricao: "Fundo animado suave, menu superior.",
    temaId: "aurora-boreal",
    corDestaque: "#22d3ee",
    aparencia: { fundo: { tipo: "animado", animado: "aurora", velocidade: 1 }, menu: { layout: "superior", vidro: true, opacidade: 0.5 }, formas: { raio: 1.3, opacidadeCartoes: 0.6 } },
  },
  {
    id: "classico",
    nome: "Clássico",
    descricao: "Papel claro e fonte com serifa, como um livro-caixa.",
    temaId: "papel",
    corDestaque: "#9a3412",
    aparencia: { fundo: { tipo: "cor", cor: "#faf7f2" }, formas: { raio: 0.5, brilho: false }, tipografia: { fonte: "lora", tamanho: 106.25 } },
  },
];

/** Aplica a ordem escolhida pelo usuário; rotas novas (que ele ainda não ordenou) vão para o fim. */
export function ordenarPorPreferencia<T extends { rota: string }>(itens: T[], ordem: string[]): T[] {
  const pos = new Map(ordem.map((r, i) => [r, i]));
  return [...itens].sort((a, b) => (pos.get(a.rota) ?? 1000 + itens.indexOf(a)) - (pos.get(b.rota) ?? 1000 + itens.indexOf(b)));
}

/** Lê "#rrggbb", "#rgb", "rgb(…)" ou "rgba(…)" em [r, g, b, alfa]. */
export function corCssParaRgba(cor: string): [number, number, number, number] | null {
  const c = cor.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return [...hexParaRgb(c), 1];
  if (/^#[0-9a-f]{8}$/i.test(c)) return [...hexParaRgb(c.slice(0, 7)), parseInt(c.slice(7), 16) / 255];
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(c);
  if (!m) return null;
  const alfa = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return [Number(m[1]), Number(m[2]), Number(m[3]), Math.min(1, Math.max(0, alfa))];
}

/** Cor por cima de outra com transparência (como o navegador desenha). */
export function sobrepor(frente: [number, number, number, number], fundo: [number, number, number]): [number, number, number] {
  const a = frente[3];
  return [frente[0] * a + fundo[0] * (1 - a), frente[1] * a + fundo[1] * (1 - a), frente[2] * a + fundo[2] * (1 - a)];
}

export interface ResultadoContraste {
  /** Texto principal direto sobre o fundo (títulos da página). */
  sobreFundo: number;
  /** Texto principal dentro dos cartões. */
  sobreCartao: number;
  /** Texto secundário (legendas) dentro dos cartões: aceita 3:1 (texto de apoio). */
  secundario: number;
  /** Menor contraste do texto principal (meta WCAG AA: 4,5:1). */
  pior: number;
  nivel: NivelContraste;
}

export function avaliarContraste(a: Aparencia, cores: { fundo: string; cartao: string; texto: string; textoSecundario: string }, mediaMidia: [number, number, number] | null): ResultadoContraste {
  const fundo = corEfetivaDoFundo(a, /^#/.test(cores.fundo) ? cores.fundo : "#000000", mediaMidia);
  const cartaoBase = corCssParaRgba(cores.cartao) ?? [0, 0, 0, 1];
  const cartao = sobrepor([cartaoBase[0], cartaoBase[1], cartaoBase[2], cartaoBase[3] * a.formas.opacidadeCartoes], fundo);
  const texto = (corCssParaRgba(cores.texto) ?? [255, 255, 255, 1]).slice(0, 3) as [number, number, number];
  const sec = (corCssParaRgba(cores.textoSecundario) ?? [200, 200, 200, 1]).slice(0, 3) as [number, number, number];
  const sobreFundo = razaoContraste(texto, fundo);
  const sobreCartao = razaoContraste(texto, cartao);
  const secundario = razaoContraste(sec, cartao);
  const pior = Math.min(sobreFundo, sobreCartao);
  return { sobreFundo, sobreCartao, secundario, pior, nivel: nivelWcag(pior) };
}
