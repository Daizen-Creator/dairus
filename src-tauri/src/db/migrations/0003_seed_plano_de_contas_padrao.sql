-- Plano de contas inicial, pensado para uma pessoa física no Brasil
-- (salário + vale-alimentação + faculdade). O usuário pode criar novas
-- contas/categorias por cima disso; estas são `sistema = 1` e não podem
-- ser excluídas, só arquivadas, para não quebrar lançamentos existentes.

INSERT INTO contas_contabeis (id, codigo, nome, tipo, subtipo, categoria_pai_id, sistema) VALUES
  ('ativo', '1', 'Ativo', 'ATIVO', 'CATEGORIA', NULL, 1),
  ('ativo-caixa-carteiras', '1.1', 'Caixa e Carteiras', 'ATIVO', 'CATEGORIA', 'ativo', 1),
  ('ativo-dinheiro', '1.1.1', 'Dinheiro em Espécie', 'ATIVO', 'DINHEIRO', 'ativo-caixa-carteiras', 1),
  ('ativo-contas-bancarias', '1.2', 'Contas Bancárias', 'ATIVO', 'CATEGORIA', 'ativo', 1),
  ('ativo-vale-alimentacao', '1.3', 'Vale-Alimentação', 'ATIVO', 'BENEFICIO', 'ativo', 1),

  ('passivo', '2', 'Passivo', 'PASSIVO', 'CATEGORIA', NULL, 1),
  ('passivo-cartoes', '2.1', 'Cartões de Crédito', 'PASSIVO', 'CATEGORIA', 'passivo', 1),
  ('passivo-contas-a-pagar', '2.2', 'Contas a Pagar', 'PASSIVO', 'CATEGORIA', 'passivo', 1),

  ('patrimonio', '3', 'Patrimônio Líquido', 'PATRIMONIO', 'CATEGORIA', NULL, 1),
  ('patrimonio-saldo-inicial', '3.1', 'Saldo Inicial', 'PATRIMONIO', NULL, 'patrimonio', 1),

  ('receita', '4', 'Receita', 'RECEITA', 'CATEGORIA', NULL, 1),
  ('receita-salario', '4.1', 'Salário', 'RECEITA', NULL, 'receita', 1),
  ('receita-beneficios', '4.2', 'Benefícios (VA/VR)', 'RECEITA', NULL, 'receita', 1),
  ('receita-renda-extra', '4.3', 'Renda Extra', 'RECEITA', NULL, 'receita', 1),

  ('despesa', '5', 'Despesa', 'DESPESA', 'CATEGORIA', NULL, 1),
  ('despesa-moradia', '5.1', 'Moradia', 'DESPESA', NULL, 'despesa', 1),
  ('despesa-alimentacao', '5.2', 'Alimentação', 'DESPESA', NULL, 'despesa', 1),
  ('despesa-transporte', '5.3', 'Transporte', 'DESPESA', NULL, 'despesa', 1),
  ('despesa-educacao', '5.4', 'Educação', 'DESPESA', NULL, 'despesa', 1),
  ('despesa-lazer', '5.5', 'Lazer', 'DESPESA', NULL, 'despesa', 1),
  ('despesa-saude', '5.6', 'Saúde', 'DESPESA', NULL, 'despesa', 1),
  ('despesa-vestuario', '5.7', 'Vestuário', 'DESPESA', NULL, 'despesa', 1),
  ('despesa-outras', '5.8', 'Outras Despesas', 'DESPESA', NULL, 'despesa', 1);
