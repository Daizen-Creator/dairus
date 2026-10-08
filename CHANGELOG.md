# O que mudou no Dairus

Cada versão publicada no GitHub usa a seção correspondente daqui como lista de
mudanças (é o texto que aparece no aviso "O que mudou" dentro do app).

## Próxima versão

- Widgets também na coluna do lado do Início: no "Editar layout", o botão de painel lateral manda o widget para lá (acima de Metas e Vencimentos), com setas para ordenar e botão para voltar à grade.
- O card "Sincronização" do Início mostra o estado real (ativa e quando foi a última, falhou e por quê, ou desativada). Antes era um texto fixo "Desativada".

## 0.2.5

- Correção: a sincronização entre computadores não estava salvando na nuvem (o Supabase recusava o arquivo de controle). Agora funciona, e se falhar aparece um aviso na tela e em Backup → Nuvem.
- Início 100% personalizável: arraste qualquer widget para qualquer lugar e mude largura e altura puxando as bordas (grade de 12 colunas). Opção de encaixar automaticamente ou deixar cada um exatamente onde soltar.
- Vários layouts salvos (ex.: Visão geral, Relatório financeiro, Produtividade), com abas para alternar, criar a partir de 8 modelos, duplicar, renomear e excluir. Ficam no banco da conta: entram no backup e na sincronização.
- Gráfico personalizável: despesas, receitas, resultado, uma categoria ou saldo; período de 7 dias a 1 ano; por dia, semana ou mês; em barras, linha, rosca, tabela ou número com comparação. Pode ter vários, cada um com a sua configuração.
- Cada widget pode ter título próprio ou nenhum título. O widget de fotos voltou, agora sem o título "Minhas fotos": a foto ocupa o card inteiro.
- Foto do perfil da conta Google na barra de título e na saudação do Início, guardada para funcionar sem internet, com "Sincronizar com o Google" em Configurações e as iniciais do nome quando não houver foto.

## 0.2.4

- Dashboard totalmente personalizável: layout livre com widgets em grade, ordenação, remoção e modelos prontos para uso rápido.
- Novo fluxo de widgets do início: painel "Meus widgets" e botão "Editar layout" com suporte para alterar tamanho, posição e composição do dashboard.
- Ajuste do catálogo: widget de foto pessoal removido da interface, respeitando o pedido de não exibir "Minhas fotos" no painel.
- Sincronização da foto do perfil com a conta do Google e fallback visual quando a imagem falha.
- Compatibilidade e validação do módulo de dashboard para layouts antigos e novos, com testes automatizados para evitar regressões.
- Atualização do app e do instalador para a nova versão com suporte de auto update e publicação em release.

## 0.2.3

- Início: "Editar layout" direto na tela: arraste os widgets para mudar a ordem, escolha o tamanho (P, M ou G = linha inteira), remova e adicione na hora.
- Temas e aparência → nova aba "Widgets e layout": 6 modelos prontos (Padrão, Contas em dia, Economizar, Investidor, Minimalista, Painel completo), colunas (2, 3 ou 4), espaço entre widgets, prévia ao vivo e lista para ordenar com o mouse ou as setas.
- 13 widgets novos: contas a pagar (7 dias), orçamento do mês, maiores gastos, últimos lançamentos, saldos das contas, patrimônio líquido, reserva de emergência, quanto sobrou no mês, calendário do mês, dólar e euro, contagem regressiva (salário ou data), calculadora e dica do dia.
- Correção importante: "Reiniciar e atualizar" e "instalar ao fechar" fechavam o Dairus sem instalar a versão nova. Agora o instalador é aberto direto e reabre o app no fim.
- Tela de atualização: ao abrir o Dairus com versão nova, mostra baixando (MB, velocidade e tempo restante), conferindo, backup, instalando e reiniciando, bloqueando o app enquanto atualiza. Em caso de falha, mensagem clara com "Tentar de novo", "Baixar pelo site" ou "Continuar sem atualizar"; e, se a instalação não terminar, o app avisa na abertura seguinte.
- Segurança: limite de tentativas gravado para senha do banco, código de recuperação e PIN (pausa de 1 min a 1 h), página de login local com cabeçalhos de segurança e só aceitando o navegador, validação dos lançamentos, teste contra SQL injection e auditoria automática de bibliotecas e segredos.
- Lançamento sem data agora é recusado com uma mensagem clara (antes era gravado com a data vazia).
- Personalização completa (Temas e aparência): visuais prontos de um clique, fundo com cor, degradê (editor com ângulo e cores), imagem da galeria ou foto própria (escurecer, desfoque, opacidade, saturação, encaixe), vídeo em loop e fundos animados; menu lateral ou superior, fixo/só ícones/gaveta, ordem por arrastar, vidro fosco e cores; 14 fontes embutidas, tamanho do texto, arredondamento das bordas, transparência dos cartões, sombras, brilho e animações; alerta de contraste WCAG com correção automática; desfazer, restaurar padrão, exportar/importar e cópia na nuvem.
- Novos widgets no Início: Relógio (digital ou de ponteiros, com outros fusos), Minhas fotos (álbum que troca sozinho e vira fundo com um clique) e Vídeo.
- Nova aba Garantias e documentos: nota fiscal e garantia de cada compra (com garantia estendida), documentos que vencem (IPVA, seguro, CNH, contrato de aluguel), arquivos guardados no banco, aviso antes de vencer, renovar documentos anuais, ler a nota fiscal com IA e preencher a partir de uma compra lançada.
- Correção: datas e nomes de mês não voltam mais um dia/mês em computadores fora do horário de Brasília; listas de opção mostram "Todas"/"Nenhuma" em vez de "Selecione…".

## 0.2.2

- Atualização automática: procura versão nova no GitHub (com reserva no Supabase), baixa em segundo plano, confere o SHA-256 e instala ao fechar ou com "Reiniciar e atualizar". Canal beta opcional.
- Tela de login nova, com recursos do app, novidades, status da conexão, contas recentes e ajuda para problemas ao entrar.
- Página de retorno do login (127.0.0.1) com ícone na aba, visual do Dairus e fechamento automático; o app volta para a frente sozinho.
- Contas, cartões, lançamentos, orçamento, metas, patrimônio, investimentos, pessoas e salário: dezenas de funções novas em cada aba (juntar e excluir contas e cartões, ações em massa, calculadoras de holerite, 13º e férias, projeção de patrimônio e mais).
- Início com widgets escolhidos por você; relatórios extras; indicadores contábeis.
- Radar: busca em todas as lojas (comparador + IA com pesquisa no Google), links para 11 lojas, comparar produtos e datas de promoção.
- Assistente IA: anexar foto/PDF e falar na conversa, refazer resposta, ler em voz alta, perguntas salvas e conversas anteriores.
- Backup, configurações, temas e ajuda com novas opções; 120 logos de marcas nas compras e assinaturas.

## 0.2.1

- IA: chaves do Google que começam com AQ. voltaram a funcionar (vão primeiro ao Google AI Studio; o Vertex fica de reserva).
- IA: modelos atualizados (Gemini Flash-Lite como padrão); se o modelo estiver lotado ou indisponível, o app troca sozinho para outro.
- IA: controle de ritmo da chave (requisições por minuto ajustáveis, uma por vez, nova tentativa automática quando o Google pede para esperar) e contador de uso do dia.
- Radar de Compras: preços buscados em várias lojas pelo comparador Zoom (Buscapé de reserva), com lista de ofertas por loja e registro com um clique. O Mercado Livre bloqueou a busca antiga.

## 0.2.0

- Compra parcelada no cartão: ocupa o limite inteiro e cada parcela cai na fatura do mês certo.
- Corrigir valor e data de um lançamento com um clique.
- Exportação para Excel (.xlsx) com várias abas.
- Notificações do Windows: contas vencendo, fatura fechando, limite e orçamento estourados.
- Ícone na bandeja, abrir junto com o Windows e atalho global Ctrl+Alt+D para lançamento rápido.
- Sincronização automática entre computadores pela nuvem.
- Criptografia do banco e dos backups, com código de recuperação.
- Aviso de versão nova com a lista do que mudou e atualização com um clique.
- Arquivo de log para diagnóstico.
- Nova aba de Investimentos: carteira, cotações, proventos, simuladores, imposto de renda e análises com IA (informativas).
- Lançamentos: subcategorias, etiquetas (#tags), anexos, regras de categoria, receitas e contas automáticas, reajuste anual, divisão de despesas.
- Cartões: faturas fechadas guardadas, juros/multa/IOF, cartões adicionais e reembolsos.
- Planejamento: orçamento por mês com sobra acumulada, metas ligadas a contas, empréstimos (Price/SAC), contas a receber e cobrança por Pix.
- Relatórios: previsão de saldo 30/60/90 dias, ano a ano, pacote do Imposto de Renda, calendário .ics, PDF automático todo dia 1º e resumo da semana.
- IA: lançar escrevendo, por foto/print/nota fiscal ou por voz; 24 análises prontas; organizar o histórico; diagnóstico do mês automático.
- Ajuda com tutorial e primeiros passos, tema automático por horário, modo viagem, entrar sem internet, verificação semanal do banco e excluir conta e dados.
