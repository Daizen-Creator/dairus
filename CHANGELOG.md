# O que mudou no Dairus

Cada versão publicada no GitHub usa a seção correspondente daqui como lista de
mudanças (é o texto que aparece no aviso "O que mudou" dentro do app).

## Próxima versão

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
