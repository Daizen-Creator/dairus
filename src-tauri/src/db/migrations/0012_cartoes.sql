-- Cartões: faturas fechadas (valor congelado no fechamento), cartões
-- adicionais no mesmo limite (quem usou cada compra), reembolsos ligados à
-- compra original, juros do rotativo por cartão e categoria de encargos.

INSERT OR IGNORE INTO contas_contabeis (id, codigo, nome, tipo, subtipo, categoria_pai_id, sistema) VALUES
  ('despesa-encargos-cartao', '5.ENC', 'Juros, Multas e IOF do Cartão', 'DESPESA', NULL, 'despesa', 1);

ALTER TABLE contas_contabeis ADD COLUMN juros_rotativo REAL NULL;

CREATE TABLE faturas (
    id TEXT PRIMARY KEY,
    cartao_id TEXT NOT NULL REFERENCES contas_contabeis(id) ON DELETE CASCADE,
    inicio TEXT NOT NULL,
    fechamento TEXT NOT NULL,
    vencimento TEXT NOT NULL,
    valor_centavos INTEGER NOT NULL,
    encargos_lancamento_id TEXT NULL REFERENCES lancamentos(id) ON DELETE SET NULL,
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (cartao_id, fechamento)
);

CREATE TABLE cartoes_adicionais (
    id TEXT PRIMARY KEY,
    cartao_id TEXT NOT NULL REFERENCES contas_contabeis(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    final TEXT NULL,
    limite_centavos INTEGER NULL,
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE lancamento_portador (
    lancamento_id TEXT PRIMARY KEY REFERENCES lancamentos(id) ON DELETE CASCADE,
    adicional_id TEXT NOT NULL REFERENCES cartoes_adicionais(id) ON DELETE CASCADE
);

CREATE TABLE reembolsos (
    reembolso_id TEXT PRIMARY KEY REFERENCES lancamentos(id) ON DELETE CASCADE,
    compra_id TEXT NOT NULL REFERENCES lancamentos(id) ON DELETE CASCADE
);
