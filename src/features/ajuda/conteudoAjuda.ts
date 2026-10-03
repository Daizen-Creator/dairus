// Conteúdo extra da Ajuda: perguntas frequentes, glossário, dicas e o quiz de saúde financeira.

export const FAQ: Array<[string, string]> = [
  ["Meus dados vão para a internet?", "Não, ficam no seu computador. Só vão para a nuvem se você ligar a sincronização/backup na nuvem, e para o Google só o que você mandar para a IA (e você escolhe o que é enviado)."],
  ["Como lanço uma compra parcelada?", "Em Despesas e Receitas → Nova despesa, escolha o cartão e informe as parcelas. O limite é ocupado inteiro e cada parcela cai na fatura certa."],
  ["Lancei errado. Como corrijo?", "No Histórico: “Corrigir” muda valor e data; abra os detalhes (seta) para trocar a categoria ou a conta; a lixeira exclui de vez; “Estornar” desfaz deixando registro."],
  ["Como apago uma conta bancária ou um cartão?", "Abra a conta/cartão → “Extrato e mais” → “Mais ações” → Excluir. Se tiver histórico, dá para juntar com outra conta sem perder nada."],
  ["O saldo do Dairus está diferente do banco.", "Na conta, use “Ajustar saldo” e informe o saldo real; ou “Conferir” para marcar o que já bateu com o extrato."],
  ["Como uso em dois computadores?", "Entre com a mesma conta Google e ligue a sincronização em Backup e Segurança → Nuvem."],
  ["Esqueci a senha do banco criptografado.", "Use o código de recuperação que apareceu quando você ligou a criptografia (tela de desbloqueio → “Usar código de recuperação”)."],
  ["A IA não responde.", "Confira a chave em Assistente IA → Conexão e privacidade → Testar conexão. Sem internet, a IA não funciona; o resto do app sim."],
  ["Como recebo avisos de contas?", "Ligue em Configurações → Windows e avisos. Em “Mais opções” você escolhe quais avisos e com quantos dias de antecedência."],
  ["Posso importar o extrato do banco?", "Sim: Despesas e Receitas → Importar extrato (OFX ou CSV), ou deixe os arquivos numa pasta vigiada para importar sozinho."],
];

export const GLOSSARIO: Array<[string, string]> = [
  ["CDI", "Taxa que os bancos usam entre si; quase igual à Selic. Investimentos de renda fixa costumam render “X% do CDI”."],
  ["Selic", "Taxa básica de juros do Brasil, definida pelo Banco Central (Copom)."],
  ["IPCA", "Índice oficial da inflação. Se seu dinheiro rende menos que o IPCA, você perde poder de compra."],
  ["Rotativo do cartão", "Juros cobrados quando você paga só parte da fatura. Um dos mais caros do país: evite."],
  ["Reserva de emergência", "Dinheiro guardado para imprevistos, de fácil resgate. O ideal é de 3 a 6 meses dos seus gastos."],
  ["Partidas dobradas", "Todo valor sai de um lugar e entra em outro (débito e crédito iguais). É o que deixa o Dairus sempre conferido."],
  ["Balanço patrimonial", "Foto do que você tem (ativos), deve (passivos) e o que sobra (patrimônio líquido) numa data."],
  ["DRE", "Demonstração do resultado: receitas menos despesas de um período."],
  ["Juros compostos", "Juros sobre juros: o rendimento de cada mês também passa a render."],
  ["Liquidez", "Facilidade de transformar um bem em dinheiro sem perder valor."],
  ["Preço médio", "Quanto custou, em média, cada cota/ação que você tem (compras ÷ quantidade)."],
  ["DARF", "Guia para pagar imposto (ex.: lucro com ações acima da isenção)."],
  ["Tabela Price", "Financiamento com parcelas iguais; no começo paga mais juros que amortização."],
  ["SAC", "Financiamento com amortização constante; parcelas começam maiores e diminuem."],
  ["Taxa de poupança", "Quanto da sua renda sobra: (receitas − despesas) ÷ receitas."],
];

export const DICAS: string[] = [
  "Agende as contas fixas: o Dairus avisa antes de vencer e calcula a previsão de saldo.",
  "Compras logo depois do fechamento do cartão só são pagas na fatura do mês seguinte.",
  "Use #tags (ex.: #viagem) nos lançamentos e veja o total em Relatórios → Mais relatórios.",
  "Ctrl+Alt+D abre o lançamento rápido mesmo com o Dairus minimizado.",
  "Crie modelos em Lançar → Modelos para o café, a gasolina ou o Uber: um clique e pronto.",
  "Ligue o arredondamento em Metas → Automação: cada compra guarda o troco para uma meta.",
  "O Radar busca o produto em várias lojas e avisa quando o preço baixa.",
  "Em Orçamento, a sobra de um mês pode passar para o seguinte.",
  "Faça backup e ligue a criptografia em Backup e Segurança.",
  "Peça à IA “Posso comprar isso?” antes de uma compra grande.",
];

export function dicaDoDia(hoje: string): string {
  const dia = Math.floor(Date.parse(`${hoje}T12:00:00Z`) / 86_400_000);
  return DICAS[dia % DICAS.length];
}

export const QUIZ: Array<{ pergunta: string; pontos: number }> = [
  { pergunta: "Sei quanto gastei no mês passado (mais ou menos R$ 100)", pontos: 1 },
  { pergunta: "Tenho reserva de emergência de pelo menos 3 meses", pontos: 2 },
  { pergunta: "Pago a fatura do cartão inteira todo mês", pontos: 2 },
  { pergunta: "Guardo ou invisto todo mês, mesmo que pouco", pontos: 2 },
  { pergunta: "Não tenho dívidas com juros altos (rotativo, cheque especial)", pontos: 2 },
  { pergunta: "Tenho pelo menos uma meta com valor e prazo", pontos: 1 },
  { pergunta: "Reviso minhas assinaturas pelo menos a cada 6 meses", pontos: 1 },
  { pergunta: "Sei quanto preciso para me aposentar ou viver de renda", pontos: 1 },
];

export function notaQuiz(marcadas: boolean[]): { pontos: number; maximo: number; texto: string } {
  const maximo = QUIZ.reduce((s, q) => s + q.pontos, 0);
  const pontos = QUIZ.reduce((s, q, i) => s + (marcadas[i] ? q.pontos : 0), 0);
  const pct = pontos / maximo;
  const texto = pct >= 0.85 ? "Excelente! Suas finanças estão bem cuidadas." : pct >= 0.6 ? "Bom caminho. Escolha um item desmarcado para atacar este mês." : pct >= 0.3 ? "Dá para melhorar: comece pela reserva e pelo cartão." : "Hora de organizar: siga os Primeiros passos acima.";
  return { pontos, maximo, texto };
}

export function porcentagem(valor: number, pct: number) {
  return { parte: (valor * pct) / 100, comAumento: valor * (1 + pct / 100), comDesconto: valor * (1 - pct / 100) };
}

export function jurosCompostosSimples(inicial: number, mensal: number, taxaMensalPct: number, meses: number): number {
  const i = taxaMensalPct / 100;
  let v = inicial;
  for (let m = 0; m < meses; m++) v = v * (1 + i) + mensal;
  return v;
}
