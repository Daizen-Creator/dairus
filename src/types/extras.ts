// Espelha os DTOs de src-tauri/src/extras.rs.

export interface Orcamento {
  categoria_id: string;
  limite_centavos: number;
}

export interface Meta {
  id: string;
  nome: string;
  valor_alvo_centavos: number;
  prazo: string | null;
  guardado_centavos: number;
}

export interface Avaliacao {
  data: string;
  valor_centavos: number;
}

export type TipoBem = "BEM" | "DIVIDA";

export interface Bem {
  id: string;
  nome: string;
  tipo: TipoBem;
  valor_centavos: number;
  avaliacoes: Avaliacao[];
}

export interface PrecoObservado {
  id: string;
  loja: string;
  preco_centavos: number;
  url: string | null;
  data: string;
}

export interface ItemRadar {
  id: string;
  nome: string;
  preco_alvo_centavos: number | null;
  precos: PrecoObservado[];
}

export interface InfoBackup {
  nome: string;
  caminho: string;
  tamanho_bytes: number;
  criado_em: string;
}
