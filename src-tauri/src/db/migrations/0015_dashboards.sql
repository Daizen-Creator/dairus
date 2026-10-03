-- Layouts do painel inicial (dashboard): cada conta pode ter vários ("Visão geral",
-- "Contas do mês", "Investimentos"...) e alternar entre eles. Os widgets ficam em JSON
-- (posição x/y, tamanho w/h numa grade de 12 colunas, tipo e configuração), validados
-- pelo Rust antes de gravar. Ficam no banco para entrar no backup, na sincronização e
-- na criptografia.
CREATE TABLE dashboards (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL CHECK (length(nome) BETWEEN 1 AND 60),
    ordem INTEGER NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 0 CHECK (ativo IN (0, 1)),
    -- {"compactar": true, "espaco": "normal", "titulo": true}
    opcoes TEXT NOT NULL DEFAULT '{}',
    -- [{"i": "w1", "tipo": "grafico", "x": 0, "y": 0, "w": 6, "h": 8, "config": {...}}]
    widgets TEXT NOT NULL DEFAULT '[]',
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
-- No máximo um layout ativo por vez.
CREATE UNIQUE INDEX idx_dashboards_um_ativo ON dashboards(ativo) WHERE ativo = 1;
