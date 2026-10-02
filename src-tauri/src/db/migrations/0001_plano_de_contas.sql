-- Plano de contas: toda conta bancária/carteira, cartão, categoria de
-- receita ou despesa é uma linha aqui. A árvore (categoria_pai_id) permite
-- subcategorias personalizáveis sem precisar de outra tabela.
CREATE TABLE contas_contabeis (
    id TEXT PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('ATIVO', 'PASSIVO', 'PATRIMONIO', 'RECEITA', 'DESPESA')),
    subtipo TEXT NULL CHECK (
        subtipo IS NULL OR subtipo IN (
            'BANCO', 'CARTEIRA_DIGITAL', 'DINHEIRO', 'INVESTIMENTO', 'BENEFICIO',
            'CARTAO_CREDITO', 'EMPRESTIMO', 'CATEGORIA'
        )
    ),
    categoria_pai_id TEXT NULL REFERENCES contas_contabeis(id) ON DELETE RESTRICT,
    instituicao TEXT NULL,
    saldo_inicial_centavos INTEGER NOT NULL DEFAULT 0,
    dia_fechamento_fatura INTEGER NULL,
    dia_vencimento_fatura INTEGER NULL,
    limite_centavos INTEGER NULL,
    sistema INTEGER NOT NULL DEFAULT 0,
    ativa INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_contas_contabeis_tipo ON contas_contabeis(tipo);
CREATE INDEX idx_contas_contabeis_pai ON contas_contabeis(categoria_pai_id);
