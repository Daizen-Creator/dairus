-- Investimentos: ativos da carteira, operações (compra, venda, proventos) e
-- séries de indicadores (Selic, CDI, IPCA) guardadas para uso offline.
-- Compras/vendas/proventos geram lançamentos contábeis de verdade: o dinheiro
-- sai da conta e entra na "Carteira de Investimentos" (pelo custo).

INSERT OR IGNORE INTO contas_contabeis (id, codigo, nome, tipo, subtipo, categoria_pai_id, sistema) VALUES
  ('ativo-investimentos', '1.INV', 'Carteira de Investimentos', 'ATIVO', 'INVESTIMENTO', 'ativo', 1),
  ('receita-investimentos', '4.INV', 'Rendimentos de Investimentos', 'RECEITA', NULL, 'receita', 1),
  ('despesa-investimentos', '5.INV', 'Perdas, Taxas e IR de Investimentos', 'DESPESA', NULL, 'despesa', 1);

CREATE TABLE ativos_invest (
    id TEXT PRIMARY KEY,
    codigo TEXT NOT NULL,
    nome TEXT NULL,
    classe TEXT NOT NULL CHECK (classe IN (
        'ACAO', 'FII', 'ETF', 'BDR', 'TESOURO', 'CDB', 'LCI', 'LCA', 'POUPANCA', 'CRIPTO', 'PREVIDENCIA', 'OUTRO'
    )),
    -- Renda fixa: indexador e taxa (CDI/SELIC: % do índice; IPCA: spread % a.a.; PRE: % a.a.).
    indexador TEXT NULL CHECK (indexador IS NULL OR indexador IN ('CDI', 'SELIC', 'IPCA', 'PRE')),
    taxa REAL NULL,
    vencimento TEXT NULL,
    objetivo TEXT NULL,
    setor TEXT NULL,
    risco TEXT NULL CHECK (risco IS NULL OR risco IN ('BAIXO', 'MEDIO', 'ALTO')),
    moeda TEXT NOT NULL DEFAULT 'BRL',
    cotacao REAL NULL,
    cotacao_em TEXT NULL,
    alerta_acima REAL NULL,
    alerta_abaixo REAL NULL,
    ativo INTEGER NOT NULL DEFAULT 1,
    notas TEXT NULL,
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE operacoes_invest (
    id TEXT PRIMARY KEY,
    ativo_id TEXT NOT NULL REFERENCES ativos_invest(id) ON DELETE RESTRICT,
    tipo TEXT NOT NULL CHECK (tipo IN ('COMPRA', 'VENDA', 'DIVIDENDO', 'JCP', 'RENDIMENTO', 'AMORTIZACAO')),
    data TEXT NOT NULL,
    quantidade REAL NOT NULL DEFAULT 0,
    preco_unitario REAL NOT NULL DEFAULT 0,
    taxas_centavos INTEGER NOT NULL DEFAULT 0,
    -- Valor bruto da operação (quantidade x preço; nos proventos, o valor recebido).
    valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
    ir_retido_centavos INTEGER NOT NULL DEFAULT 0,
    -- Custo (preço médio x quantidade) da parte vendida, gravado na venda.
    custo_centavos INTEGER NULL,
    day_trade INTEGER NOT NULL DEFAULT 0,
    conta_id TEXT NULL REFERENCES contas_contabeis(id) ON DELETE RESTRICT,
    lancamento_id TEXT NULL REFERENCES lancamentos(id) ON DELETE RESTRICT,
    notas TEXT NULL,
    criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_operacoes_invest_ativo ON operacoes_invest(ativo_id, data);

CREATE TABLE indicadores (
    serie TEXT NOT NULL,
    data TEXT NOT NULL,
    valor REAL NOT NULL,
    PRIMARY KEY (serie, data)
);
