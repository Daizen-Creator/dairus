// Manual curto do Dairus: usado na tela de Ajuda, no tutorial de primeiro uso
// e como contexto quando o usuário pergunta à IA "como faço X no Dairus?".

export interface TopicoAjuda {
  id: string;
  titulo: string;
  rota: string;
  texto: string;
}

export const TOPICOS_AJUDA: TopicoAjuda[] = [
  { id: "inicio", titulo: "Início (painel)", rota: "/", texto: "Resumo do período: saldo, receitas, despesas, gráficos de fluxo de caixa e categorias, calendário financeiro, contas a vencer, resumo da semana e diagnóstico do mês. O ícone de olho oculta os valores; o ícone de ajustes escolhe as seções do painel." },
  { id: "contas", titulo: "Contas bancárias", rota: "/contas-bancarias", texto: "Cadastre conta corrente, poupança, dinheiro e vale-alimentação com o saldo inicial. O saldo muda sozinho a cada lançamento. Transferência entre contas fica em Lançamentos → Transferência." },
  { id: "cartoes", titulo: "Cartões de crédito", rota: "/cartoes", texto: "Cadastre o cartão com limite, dia de fechamento e vencimento. Compras parceladas aparecem fatura a fatura. As faturas fechadas ficam guardadas com o status (paga, em parte, atrasada); dá para lançar juros/multa/IOF, cadastrar cartões adicionais e registrar reembolsos. Para pagar a fatura, use “Pagar fatura”." },
  { id: "lancamentos", titulo: "Lançamentos", rota: "/lancamentos", texto: "Abas: Despesa, Receita, Transferência, Agendar (contas a pagar e receitas futuras, com repetição, lançamento automático e reajuste anual), Importar extrato (OFX/CSV, com regras de categoria e IA) e Histórico (filtros, corrigir valor/data, estornar, tags e anexos). Atalho global: Ctrl+Alt+D abre o lançamento rápido de qualquer lugar." },
  { id: "orcamento", titulo: "Orçamento", rota: "/orcamento", texto: "Defina limites por categoria, por mês se quiser, com sobra acumulando para o mês seguinte. Mostra o ritmo de gasto (se está acima do esperado para o dia do mês). Pode montar o orçamento automaticamente pela média dos últimos meses." },
  { id: "metas", titulo: "Metas", rota: "/metas", texto: "Crie metas com valor e prazo; ligue a meta a uma conta real (o guardado passa a ser o saldo dela). Aba Automação: guardar a sobra do mês, arredondamento das compras e lembretes. Aba Desafios: desafios de economia e conquistas." },
  { id: "patrimonio", titulo: "Patrimônio", rota: "/patrimonio", texto: "Bens (imóvel, carro…) e dívidas com avaliações ao longo do tempo, evolução do patrimônio líquido, linha do tempo com marcos e empréstimos (tabela Price/SAC, pagar parcela)." },
  { id: "investimentos", titulo: "Investimentos", rota: "/investimentos", texto: "Carteira (ações, FIIs, renda fixa, cripto) com preço médio, cotações, proventos, simuladores, imposto de renda (DARF, isenção de R$ 20 mil em ações) e análises com IA apenas informativas (não é recomendação)." },
  { id: "pessoas", titulo: "Pessoas e divisões", rota: "/pessoas", texto: "Contas a receber de outras pessoas, divisão de despesas (rachar a conta), cobrança por Pix e marcar como recebido ou perdoado." },
  { id: "salario", titulo: "Salário", rota: "/salario", texto: "Registra o salário e o vale-alimentação do mês em poucos cliques; pode virar receita automática agendada." },
  { id: "contabilidade", titulo: "Contabilidade", rota: "/contabilidade", texto: "Plano de contas, razão, balancete, balanço patrimonial e DRE. Todo lançamento é de partidas dobradas (débito e crédito)." },
  { id: "relatorios", titulo: "Relatórios", rota: "/relatorios", texto: "Fluxo de caixa, categorias, previsão de saldo 30/60/90 dias, ano a ano, pacote do Imposto de Renda, calendário .ics e PDF (manual ou automático todo dia 1º, com cópia na nuvem). Exporta Excel e CSV." },
  { id: "ia", titulo: "Assistente IA", rota: "/ia", texto: "Conversa com o Gemini usando a sua chave. Aba Lançar: escreva, cole uma notificação, envie foto/print/nota fiscal ou fale, e revise antes de gravar. Aba Análises: diagnóstico do mês, vazamentos, planos, avaliar compra, cenários e mais. Você escolhe o que é enviado ao Google." },
  { id: "radar", titulo: "Radar de preços", rota: "/radar", texto: "Acompanhe preços de produtos que quer comprar, ligue a uma meta e receba aviso quando o preço cair." },
  { id: "documentos", titulo: "Garantias e documentos", rota: "/documentos", texto: "Guarde a nota fiscal e a garantia de cada compra (TV, celular, geladeira): o Dairus calcula até quando vai a garantia (com a estendida) e avisa antes de acabar. Guarde também documentos que vencem, como IPVA, seguro, licenciamento, CNH e contrato de aluguel, com os arquivos (PDF ou foto). Dá para preencher a partir de uma compra lançada, ler a nota fiscal com a IA, renovar documentos anuais com um clique e arquivar o que já passou. Os arquivos ficam dentro do banco, então entram no backup, na sincronização e na criptografia." },
  { id: "backup", titulo: "Backup e nuvem", rota: "/backup", texto: "Backup automático local, criptografia do banco com senha e código de recuperação, sincronização com a nuvem entre computadores e restauração." },
  { id: "configuracoes", titulo: "Configurações", rota: "/configuracoes", texto: "Nome, conta e categoria padrão, página inicial, avisos do Windows, iniciar com o Windows, bloqueio ao minimizar, modo viagem, tema automático por horário, atualizações, exportar/excluir dados e refazer o tutorial." },
];

export function manualEmTexto(): string {
  return TOPICOS_AJUDA.map((t) => `${t.titulo} (menu ${t.rota}): ${t.texto}`).join("\n");
}

/** Busca simples nos tópicos (sem acento, por palavra). */
export function buscarAjuda(termo: string): TopicoAjuda[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const palavras = norm(termo).split(/\s+/).filter((p) => p.length >= 3);
  if (!palavras.length) return TOPICOS_AJUDA;
  return TOPICOS_AJUDA.map((t) => ({ t, n: palavras.filter((p) => norm(`${t.titulo} ${t.texto}`).includes(p)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((x) => x.t);
}

export interface Passo {
  id: string;
  titulo: string;
  rota: string;
  feito: boolean;
}

/** Mentor de primeira vez: o que falta para o Dairus ficar redondo. */
export function primeirosPassos(d: {
  contas: Array<{ id: string; tipo: string; subtipo: string | null; sistema: boolean; ativa: boolean }>;
  lancamentos: number;
  agendamentos: number;
  orcamentos: number;
  metas: number;
  backupAuto: boolean;
  chaveIA: boolean;
}): Passo[] {
  const minhas = d.contas.filter((c) => c.ativa && !c.sistema);
  return [
    { id: "conta", titulo: "Cadastrar sua conta bancária com o saldo de hoje", rota: "/contas-bancarias", feito: minhas.some((c) => c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA" && c.subtipo !== "INVESTIMENTO") },
    { id: "cartao", titulo: "Cadastrar seu cartão de crédito (se tiver)", rota: "/cartoes", feito: minhas.some((c) => c.subtipo === "CARTAO_CREDITO") },
    { id: "lancamento", titulo: "Fazer o primeiro lançamento (ou importar um extrato)", rota: "/lancamentos", feito: d.lancamentos > 0 },
    { id: "agenda", titulo: "Agendar as contas fixas do mês (aluguel, luz, internet…)", rota: "/lancamentos", feito: d.agendamentos > 0 },
    { id: "orcamento", titulo: "Definir limites no orçamento", rota: "/orcamento", feito: d.orcamentos > 0 },
    { id: "meta", titulo: "Criar uma meta (ex.: reserva de emergência)", rota: "/metas", feito: d.metas > 0 },
    { id: "backup", titulo: "Ligar o backup automático", rota: "/backup", feito: d.backupAuto },
    { id: "ia", titulo: "Conectar a IA (opcional, chave grátis do Google)", rota: "/ia", feito: d.chaveIA },
  ];
}
