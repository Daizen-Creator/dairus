export type CategoriaTema =
  | "Escuro"
  | "Claro"
  | "Minimalista"
  | "Corporativo"
  | "Moderno"
  | "Cyberpunk"
  | "Neon"
  | "Natural"
  | "Monocromático"
  | "Personalizado";

export interface CoresTema {
  fundo: string;
  superficie: string;
  cartao: string;
  primaria: string;
  primariaTexto: string;
  secundaria: string;
  secundariaTexto: string;
  textoPrimario: string;
  textoSecundario: string;
  borda: string;
  sucesso: string;
  alerta: string;
  erro: string;
  destaque: string;
  sombra: string;
  /** 5 cores usadas em sequência nos gráficos (recharts). */
  grafico: [string, string, string, string, string];
}

export interface Tema {
  id: string;
  nome: string;
  categoria: CategoriaTema;
  modoBase: "claro" | "escuro";
  cores: CoresTema;
  /** true = criado pelo usuário (editável/removível); false = tema do catálogo. */
  personalizado?: boolean;
}
