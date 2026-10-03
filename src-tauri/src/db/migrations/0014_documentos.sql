-- Garantias de compras (TV, celular…) e documentos importantes (IPVA, seguro,
-- contrato de aluguel…), com os arquivos guardados dentro do banco (assim entram
-- no backup, na sincronização e na criptografia).
CREATE TABLE documentos (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL CHECK (tipo IN ('GARANTIA', 'DOCUMENTO')),
    categoria TEXT NOT NULL,
    titulo TEXT NOT NULL,
    numero TEXT NULL,
    loja TEXT NULL,
    valor_centavos INTEGER NULL CHECK (valor_centavos IS NULL OR valor_centavos >= 0),
    data_compra TEXT NULL,
    garantia_meses INTEGER NULL CHECK (garantia_meses IS NULL OR garantia_meses BETWEEN 0 AND 240),
    garantia_estendida_meses INTEGER NOT NULL DEFAULT 0 CHECK (garantia_estendida_meses BETWEEN 0 AND 240),
    vencimento TEXT NULL,
    repete TEXT NULL CHECK (repete IS NULL OR repete IN ('MENSAL', 'ANUAL')),
    avisar_dias INTEGER NOT NULL DEFAULT 30 CHECK (avisar_dias BETWEEN 0 AND 365),
    lancamento_id TEXT NULL REFERENCES lancamentos(id) ON DELETE SET NULL,
    observacao TEXT NULL,
    arquivado INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_documentos_vencimento ON documentos(vencimento);

CREATE TABLE documento_arquivos (
    id TEXT PRIMARY KEY,
    documento_id TEXT NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    mime TEXT NOT NULL,
    tamanho INTEGER NOT NULL,
    conteudo BLOB NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_documento_arquivos_doc ON documento_arquivos(documento_id);
