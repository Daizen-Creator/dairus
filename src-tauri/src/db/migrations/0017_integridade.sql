-- Integridade das regras de dinheiro.
--
-- 1) Dia-âncora da recorrência mensal/anual: uma conta que vence dia 31 vai
--    para 28/02 em fevereiro, mas volta a 31/03 em março (antes ficava presa
--    no dia 28 para sempre). Contas antigas recebem o dia do vencimento atual.
ALTER TABLE agendamentos ADD COLUMN dia_original INTEGER NULL;
UPDATE agendamentos SET dia_original = CAST(substr(vencimento, 9, 2) AS INTEGER) WHERE dia_original IS NULL;

-- Quem cria um agendamento sem informar o dia (código antigo, importação,
-- sincronização) fica com o dia do vencimento.
CREATE TRIGGER IF NOT EXISTS agendamentos_dia_original_ao_criar
AFTER INSERT ON agendamentos
WHEN NEW.dia_original IS NULL
BEGIN
    UPDATE agendamentos SET dia_original = CAST(substr(NEW.vencimento, 9, 2) AS INTEGER) WHERE id = NEW.id;
END;

-- A pessoa mudou o vencimento na edição: o novo dia passa a ser a âncora.
CREATE TRIGGER IF NOT EXISTS agendamentos_dia_original_ao_editar
AFTER UPDATE OF vencimento ON agendamentos
WHEN NEW.vencimento IS NOT OLD.vencimento
BEGIN
    UPDATE agendamentos SET dia_original = CAST(substr(NEW.vencimento, 9, 2) AS INTEGER) WHERE id = NEW.id;
END;

-- 2) Índices nas colunas que apontam para lançamentos (estorno, correção,
--    exclusão e reembolso procuram por elas).
CREATE INDEX IF NOT EXISTS idx_lancamentos_corrige ON lancamentos(corrige);
CREATE INDEX IF NOT EXISTS idx_reembolsos_compra ON reembolsos(compra_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_lancamento ON agendamentos(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_operacoes_invest_lancamento ON operacoes_invest(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_emprestimo_parcelas_lancamento ON emprestimo_parcelas(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_lancamento_portador_adicional ON lancamento_portador(adicional_id);
CREATE INDEX IF NOT EXISTS idx_a_receber_lancamento ON a_receber(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_a_receber_recebimento ON a_receber(recebimento_lancamento_id);
CREATE INDEX IF NOT EXISTS idx_faturas_encargos ON faturas(encargos_lancamento_id);
CREATE INDEX IF NOT EXISTS idx_metas_aportes_lancamento ON metas_aportes(lancamento_id);
