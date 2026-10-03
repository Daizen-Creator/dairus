-- Tags livres (além das etiquetas fixas), comprovantes anexados (guardados
-- dentro do banco, para entrarem no backup, na sincronização e na
-- criptografia), contas a receber/receitas recorrentes com lançamento
-- automático e reajuste anual, e regras de categoria automática.

CREATE TABLE lancamento_tags (
    lancamento_id TEXT NOT NULL REFERENCES lancamentos(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (lancamento_id, tag)
);
CREATE INDEX idx_lancamento_tags_tag ON lancamento_tags(tag);

CREATE TABLE anexos (
    id TEXT PRIMARY KEY,
    lancamento_id TEXT NULL REFERENCES lancamentos(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    mime TEXT NOT NULL,
    tamanho INTEGER NOT NULL,
    conteudo BLOB NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_anexos_lancamento ON anexos(lancamento_id);

ALTER TABLE agendamentos ADD COLUMN tipo TEXT NOT NULL DEFAULT 'PAGAR' CHECK (tipo IN ('PAGAR', 'RECEBER'));
ALTER TABLE agendamentos ADD COLUMN automatico INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agendamentos ADD COLUMN conta_id TEXT NULL REFERENCES contas_contabeis(id) ON DELETE RESTRICT;
ALTER TABLE agendamentos ADD COLUMN reajuste_anual REAL NULL;
ALTER TABLE agendamentos ADD COLUMN mes_reajuste INTEGER NULL CHECK (mes_reajuste IS NULL OR mes_reajuste BETWEEN 1 AND 12);
ALTER TABLE agendamentos ADD COLUMN pessoa TEXT NULL;

CREATE TABLE regras_categoria (
    id TEXT PRIMARY KEY,
    padrao TEXT NOT NULL UNIQUE,
    categoria_id TEXT NOT NULL REFERENCES contas_contabeis(id) ON DELETE CASCADE,
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
