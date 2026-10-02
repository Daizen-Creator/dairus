-- Detalhes de bens e dívidas: categoria, notas e dados de aquisição.
ALTER TABLE bens ADD COLUMN categoria TEXT NULL;
ALTER TABLE bens ADD COLUMN notas TEXT NULL;
ALTER TABLE bens ADD COLUMN aquisicao_data TEXT NULL;
ALTER TABLE bens ADD COLUMN aquisicao_valor_centavos INTEGER NULL CHECK (aquisicao_valor_centavos IS NULL OR aquisicao_valor_centavos >= 0);
