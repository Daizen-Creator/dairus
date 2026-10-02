-- Compra parcelada no cartão: o lançamento registra a compra inteira (ocupa
-- o limite todo de uma vez) e `parcelas` diz em quantas faturas ela se divide.
-- Cada parcela cai na fatura do mês certo; o limite volta aos poucos, conforme
-- as faturas são pagas.
ALTER TABLE lancamentos ADD COLUMN parcelas INTEGER NULL CHECK (parcelas IS NULL OR (parcelas BETWEEN 2 AND 72));

-- Correção de valor/data: o lançamento original é estornado e um novo é criado.
-- `corrige` aponta o novo para o original, para a tela mostrar "corrigido".
ALTER TABLE lancamentos ADD COLUMN corrige TEXT NULL REFERENCES lancamentos(id) ON DELETE RESTRICT;
