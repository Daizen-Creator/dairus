-- Etiqueta de recorrência do lançamento (mensalidade, assinatura, fixo).
ALTER TABLE lancamentos ADD COLUMN etiqueta TEXT NULL
    CHECK (etiqueta IS NULL OR etiqueta IN ('MENSALIDADE', 'ASSINATURA', 'FIXO'));

-- Contas a pagar agendadas. Enquanto não são pagas NÃO geram lançamento
-- contábil (dinheiro que ainda não saiu não é despesa realizada); ao
-- marcar como paga, o motor cria o lançamento balanceado e grava o vínculo.
CREATE TABLE agendamentos (
    id TEXT PRIMARY KEY,
    descricao TEXT NOT NULL,
    valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
    vencimento TEXT NOT NULL,
    categoria_despesa_id TEXT NOT NULL REFERENCES contas_contabeis(id) ON DELETE RESTRICT,
    etiqueta TEXT NULL CHECK (etiqueta IS NULL OR etiqueta IN ('MENSALIDADE', 'ASSINATURA', 'FIXO')),
    lancamento_id TEXT NULL REFERENCES lancamentos(id) ON DELETE RESTRICT,
    pago_em TEXT NULL,
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_agendamentos_vencimento ON agendamentos(vencimento);
CREATE INDEX idx_agendamentos_pago ON agendamentos(pago_em);
