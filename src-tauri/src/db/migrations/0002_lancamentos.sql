-- Lançamento = cabeçalho de uma operação. Partidas = as pernas de débito e
-- crédito desse lançamento. O motor contábil (Rust) garante, numa única
-- transação, que soma(débitos) = soma(créditos) antes de gravar qualquer uma
-- das duas tabelas — nunca confie em validação feita apenas no frontend.
CREATE TABLE lancamentos (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    descricao TEXT NOT NULL,
    observacao TEXT NULL,
    origem TEXT NOT NULL DEFAULT 'MANUAL' CHECK (
        origem IN ('MANUAL', 'SALARIO', 'CARTAO', 'FATURA', 'TRANSFERENCIA', 'SALDO_INICIAL', 'ESTORNO')
    ),
    estornado_de TEXT NULL REFERENCES lancamentos(id) ON DELETE RESTRICT,
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_lancamentos_data ON lancamentos(data);
CREATE INDEX idx_lancamentos_estornado_de ON lancamentos(estornado_de);

CREATE TABLE partidas (
    id TEXT PRIMARY KEY,
    lancamento_id TEXT NOT NULL REFERENCES lancamentos(id) ON DELETE CASCADE,
    conta_id TEXT NOT NULL REFERENCES contas_contabeis(id) ON DELETE RESTRICT,
    tipo TEXT NOT NULL CHECK (tipo IN ('DEBITO', 'CREDITO')),
    valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0)
);

CREATE INDEX idx_partidas_lancamento ON partidas(lancamento_id);
CREATE INDEX idx_partidas_conta ON partidas(conta_id);

-- Trilha de auditoria: nunca grava valores ou descrições, só o fato de que
-- algo aconteceu com qual entidade e quando (seção 14 do escopo).
CREATE TABLE auditoria (
    id TEXT PRIMARY KEY,
    acao TEXT NOT NULL,
    entidade TEXT NOT NULL,
    entidade_id TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_auditoria_entidade ON auditoria(entidade, entidade_id);
