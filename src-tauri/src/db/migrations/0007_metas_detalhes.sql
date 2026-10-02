-- Detalhes das metas: tipo (reserva, viagem…), prioridade e notas.
ALTER TABLE metas ADD COLUMN tipo TEXT NULL;
ALTER TABLE metas ADD COLUMN prioridade TEXT NULL CHECK (prioridade IS NULL OR prioridade IN ('ALTA', 'MEDIA', 'BAIXA'));
ALTER TABLE metas ADD COLUMN notas TEXT NULL;
