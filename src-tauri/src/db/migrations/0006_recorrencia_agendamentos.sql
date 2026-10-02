-- Contas a pagar recorrentes: ao pagar, o motor agenda a próxima ocorrência.
ALTER TABLE agendamentos ADD COLUMN recorrencia TEXT NULL
    CHECK (recorrencia IS NULL OR recorrencia IN ('SEMANAL', 'MENSAL', 'ANUAL'));
