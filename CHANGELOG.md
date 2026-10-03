# O que mudou no Dairus

Cada versão publicada no GitHub usa a seção correspondente daqui como lista de
mudanças (é o texto que aparece no aviso "O que mudou" dentro do app).

## 0.2.0

- Compra parcelada no cartão: ocupa o limite inteiro e cada parcela cai na fatura do mês certo.
- Corrigir valor e data de um lançamento com um clique.
- Exportação para Excel (.xlsx) com várias abas.
- Notificações do Windows: contas vencendo, fatura fechando, limite e orçamento estourados.
- Ícone na bandeja, abrir junto com o Windows e atalho global Ctrl+Alt+D para lançamento rápido.
- Sincronização automática entre computadores pela nuvem.
- Criptografia do banco e dos backups, com código de recuperação.
- Aviso de versão nova com a lista do que mudou e atualização com um clique.
- Atualização automática: procura versão nova no GitHub (com reserva no Supabase), baixa em segundo plano, confere o SHA-256 e instala ao fechar ou com "Reiniciar e atualizar". Canal beta opcional.
- Tela de login nova, com recursos do app, novidades, status da conexão, contas recentes e ajuda para problemas ao entrar.
- Página de retorno do login (127.0.0.1) com ícone na aba, visual do Dairus e fechamento automático; o app volta para a frente sozinho.
- Nova aba Garantias e documentos: nota fiscal e garantia de cada compra (com garantia estendida), documentos que vencem (IPVA, seguro, CNH, contrato de aluguel), arquivos guardados no banco, aviso antes de vencer, renovar documentos anuais, ler a nota fiscal com IA e preencher a partir de uma compra lançada.
- Correção: datas e nomes de mês não voltam mais um dia/mês em computadores fora do horário de Brasília; listas de opção mostram "Todas"/"Nenhuma" em vez de "Selecione…".
- Segurança: limite de tentativas gravado para senha do banco, código de recuperação e PIN (pausa de 1 min a 1 h), página de login local com cabeçalhos de segurança e só aceitando o navegador, validação dos lançamentos, teste contra SQL injection e auditoria automática de bibliotecas e segredos.
- Arquivo de log para diagnóstico.
- Nova aba de Investimentos: carteira, cotações, proventos, simuladores, imposto de renda e análises com IA (informativas).
- Lançamentos: subcategorias, etiquetas (#tags), anexos, regras de categoria, receitas e contas automáticas, reajuste anual, divisão de despesas.
- Cartões: faturas fechadas guardadas, juros/multa/IOF, cartões adicionais e reembolsos.
- Planejamento: orçamento por mês com sobra acumulada, metas ligadas a contas, empréstimos (Price/SAC), contas a receber e cobrança por Pix.
- Relatórios: previsão de saldo 30/60/90 dias, ano a ano, pacote do Imposto de Renda, calendário .ics, PDF automático todo dia 1º e resumo da semana.
- IA: lançar escrevendo, por foto/print/nota fiscal ou por voz; 24 análises prontas; organizar o histórico; diagnóstico do mês automático.
- Ajuda com tutorial e primeiros passos, tema automático por horário, modo viagem, entrar sem internet, verificação semanal do banco e excluir conta e dados.
