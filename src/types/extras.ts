// Espelha os DTOs de src-tauri/src/extras.rs.

export interface Orcamento {
  categoria_id: string;
  limite_centavos: number;
  /** A sobra do mês passa para o seguinte. */
  acumular: boolean;
  acumular_desde: string | null;
}

export interface Meta {
  id: string;
  nome: string;
  valor_alvo_centavos: number;
  prazo: string | null;
  guardado_centavos: number;
  tipo: string | null;
  prioridade: "ALTA" | "MEDIA" | "BAIXA" | null;
  notas: string | null;
  /** Conta real da meta (o guardado é o saldo dela). */
  conta_id: string | null;
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
  categoria: string | null;
  notas: string | null;
  aquisicao_data: string | null;
  aquisicao_valor_centavos: number | null;
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
  meta_id: string | null;
}

export interface InfoBackup {
  nome: string;
  caminho: string;
  tamanho_bytes: number;
  criado_em: string;
}

export interface AporteMeta {
  data: string;
  valor_centavos: number;
}

export interface AporteComMeta {
  meta_id: string;
  data: string;
  valor_centavos: number;
}

export interface RegistroAuditoria {
  acao: string;
  entidade: string;
  entidade_id: string;
  criado_em: string;
}

export interface InfoBanco {
  caminho: string;
  tamanho_bytes: number;
  lancamentos: number;
  contas: number;
  agendamentos: number;
  metas: number;
  bens: number;
  versao_sqlite: string;
  migracoes: number;
}
