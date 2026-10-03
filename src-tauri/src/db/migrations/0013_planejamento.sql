-- Orçamento por mês e sobra acumulada, metas ligadas a contas reais,
-- empréstimos/financiamentos, valores a receber de pessoas e radar ligado a metas.

INSERT OR IGNORE INTO contas_contabeis (id, codigo, nome, tipo, subtipo, categoria_pai_id, sistema) VALUES
  ('ativo-a-receber', '1.REC', 'Valores a Receber de Pessoas', 'ATIVO', NULL, 'ativo', 1),
  ('despesa-juros-emprestimos', '5.JUR', 'Juros de Empréstimos e Financiamentos', 'DESPESA', NULL, 'despesa', 1),
  ('passivo-emprestimos', '2.3', 'Empréstimos e Financiamentos', 'PASSIVO', 'CATEGORIA', 'passivo', 1);

-- Limite diferente num mês específico (ex.: dezembro com mais lazer).
CREATE TABLE orcamentos_mes (
    categoria_id TEXT NOT NULL REFERENCES contas_contabeis(id) ON DELETE CASCADE,
    mes TEXT NOT NULL,
    limite_centavos INTEGER NOT NULL CHECK (limite_centavos >= 0),
    PRIMARY KEY (categoria_id, mes)
);

-- Sobra do orçamento passa para o mês seguinte, a partir do mês `desde`.
ALTER TABLE orcamentos ADD COLUMN acumular INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orcamentos ADD COLUMN acumular_desde TEXT NULL;

-- Meta ligada a uma conta de verdade: o guardado é o saldo da conta e o aporte transfere dinheiro.
ALTER TABLE metas ADD COLUMN conta_id TEXT NULL REFERENCES contas_contabeis(id) ON DELETE SET NULL;
ALTER TABLE metas_aportes ADD COLUMN lancamento_id TEXT NULL REFERENCES lancamentos(id) ON DELETE SET NULL;

CREATE TABLE emprestimos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    sistema TEXT NOT NULL CHECK (sistema IN ('PRICE', 'SAC')),
    principal_centavos INTEGER NOT NULL CHECK (principal_centavos > 0),
    taxa_mensal REAL NOT NULL CHECK (taxa_mensal >= 0),
    parcelas INTEGER NOT NULL CHECK (parcelas BETWEEN 1 AND 600),
    primeiro_vencimento TEXT NOT NULL,
    conta_passivo_id TEXT NOT NULL REFERENCES contas_contabeis(id) ON DELETE RESTRICT,
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE emprestimo_parcelas (
    emprestimo_id TEXT NOT NULL REFERENCES emprestimos(id) ON DELETE CASCADE,
    numero INTEGER NOT NULL,
    pago_em TEXT NOT NULL,
    lancamento_id TEXT NOT NULL REFERENCES lancamentos(id) ON DELETE RESTRICT,
    PRIMARY KEY (emprestimo_id, numero)
);

-- Quem te deve: cada linha é um valor a receber de uma pessoa (pago por você ou emprestado).
CREATE TABLE a_receber (
    id TEXT PRIMARY KEY,
    pessoa TEXT NOT NULL,
    descricao TEXT NOT NULL,
    valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
    data TEXT NOT NULL,
    lancamento_id TEXT NULL REFERENCES lancamentos(id) ON DELETE SET NULL,
    recebido_em TEXT NULL,
    recebimento_lancamento_id TEXT NULL REFERENCES lancamentos(id) ON DELETE SET NULL,
    perdoado INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_a_receber_pessoa ON a_receber(pessoa);

ALTER TABLE radar_itens ADD COLUMN meta_id TEXT NULL REFERENCES metas(id) ON DELETE SET NULL;
