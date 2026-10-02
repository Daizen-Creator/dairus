-- Orçamento: um limite mensal por categoria de despesa.
CREATE TABLE orcamentos (
    categoria_id TEXT PRIMARY KEY REFERENCES contas_contabeis(id) ON DELETE CASCADE,
    limite_centavos INTEGER NOT NULL CHECK (limite_centavos > 0),
    atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Metas: o dinheiro "guardado" é uma reserva lógica (soma dos aportes);
-- não mexe nos saldos contábeis das contas.
CREATE TABLE metas (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    valor_alvo_centavos INTEGER NOT NULL CHECK (valor_alvo_centavos > 0),
    prazo TEXT NULL,
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE metas_aportes (
    id TEXT PRIMARY KEY,
    meta_id TEXT NOT NULL REFERENCES metas(id) ON DELETE CASCADE,
    valor_centavos INTEGER NOT NULL CHECK (valor_centavos <> 0),
    data TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_metas_aportes_meta ON metas_aportes(meta_id);

-- Patrimônio: bens e dívidas informados manualmente, com histórico de avaliações.
CREATE TABLE bens (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('BEM', 'DIVIDA')),
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE bens_avaliacoes (
    id TEXT PRIMARY KEY,
    bem_id TEXT NOT NULL REFERENCES bens(id) ON DELETE CASCADE,
    valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
    data TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_bens_avaliacoes_bem ON bens_avaliacoes(bem_id);

-- Radar de compras: preços que o próprio usuário observa (sem busca automática).
CREATE TABLE radar_itens (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    preco_alvo_centavos INTEGER NULL CHECK (preco_alvo_centavos IS NULL OR preco_alvo_centavos > 0),
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE radar_precos (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES radar_itens(id) ON DELETE CASCADE,
    loja TEXT NOT NULL,
    preco_centavos INTEGER NOT NULL CHECK (preco_centavos > 0),
    url TEXT NULL,
    data TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_radar_precos_item ON radar_precos(item_id);
