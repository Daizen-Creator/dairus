// Catálogo de análises com IA. Cada uma junta os fatos calculados pelo Dairus
// com uma pergunta pronta; algumas pedem um dado do usuário (ex.: a compra a avaliar).

export interface Analise {
  id: string;
  grupo: "Diagnóstico" | "Economizar" | "Planejar" | "Decidir" | "Entender";
  rotulo: string;
  pergunta: string;
  /** Campo pedido ao usuário antes de enviar; o texto entra no lugar de {entrada}. */
  entrada?: string;
  /** Inclui o manual do Dairus no contexto. */
  manual?: boolean;
  /** Inclui a previsão de saldo de 90 dias. */
  previsao?: boolean;
}

export const ANALISES: Analise[] = [
  { id: "diagnostico", grupo: "Diagnóstico", rotulo: "Diagnóstico do mês", previsao: true, pergunta: "Faça o diagnóstico do meu mês: nota de 0 a 10 com justificativa, o que está bem, 3 pontos de atenção e 3 ações práticas para os próximos dias." },
  { id: "variacao", grupo: "Diagnóstico", rotulo: "Por que gastei mais (ou menos)?", pergunta: "Compare o mês atual com o anterior até o mesmo dia e com a média de 3 meses. Explique quais categorias explicam a diferença, com os valores." },
  { id: "dias", grupo: "Diagnóstico", rotulo: "Em que dias eu gasto mais?", pergunta: "Analise meus gastos por dia da semana e diga em quais dias gasto mais, o padrão provável e uma sugestão simples para esses dias." },
  { id: "habitos", grupo: "Diagnóstico", rotulo: "Nota dos meus hábitos", pergunta: "Dê uma nota de 0 a 10 para meus hábitos financeiros em: controle de gastos, reserva, dívidas, metas e regularidade. Explique cada nota em uma linha e diga o hábito que mais faria diferença mudar." },
  { id: "carta", grupo: "Diagnóstico", rotulo: "Carta do mês", pergunta: "Escreva uma carta curta e motivadora (até 12 linhas) sobre meu mês, reconhecendo o que fiz bem e apontando com carinho um ponto a melhorar, citando números reais." },
  { id: "vazamentos", grupo: "Economizar", rotulo: "Vazamentos de dinheiro", pergunta: "Encontre vazamentos: gastos pequenos e frequentes que somam muito, categorias acima da média e do limite. Liste do maior para o menor com o valor por mês e quanto daria para economizar por ano." },
  { id: "assinaturas", grupo: "Economizar", rotulo: "Assinaturas esquecidas", pergunta: "Revise minhas assinaturas e gastos recorrentes. Aponte as que podem estar esquecidas ou duplicadas (ex.: dois streamings), o total por mês e por ano, e quais valeria cancelar ou renegociar." },
  { id: "essencial", grupo: "Economizar", rotulo: "Essencial x supérfluo", pergunta: "Classifique meus gastos por categoria em essencial, importante e supérfluo. Mostre o total e a porcentagem de cada grupo e compare com a regra 50/30/20." },
  { id: "negociar", grupo: "Economizar", rotulo: "Contas para negociar", pergunta: "Liste minhas contas fixas e assinaturas que costumam ser negociáveis (internet, celular, seguro, plano, banco). Para cada uma, dê um roteiro curto do que falar para pedir desconto." },
  { id: "compras", grupo: "Economizar", rotulo: "Lista de compras inteligente", pergunta: "Com base no meu gasto com mercado e alimentação, monte uma lista de compras para a próxima semana que caiba em {entrada}, com dicas para economizar.", entrada: "Quanto quer gastar? (ex.: R$ 300)" },
  { id: "plano-orcamento", grupo: "Planejar", rotulo: "Plano de orçamento", pergunta: "Monte um orçamento mensal por categoria com base na minha renda média e nos meus gastos reais, mantendo pelo menos 10% para guardar. Mostre em tabela: categoria, gasto médio, limite sugerido." },
  { id: "plano-divida", grupo: "Planejar", rotulo: "Sair das dívidas", pergunta: "Monte um plano para quitar minhas dívidas (cartão e outras) com o que sobra por mês: ordem de pagamento (avalanche x bola de neve), quanto pagar por mês e em quantos meses termina." },
  { id: "plano-reserva", grupo: "Planejar", rotulo: "Reserva de emergência", pergunta: "Calcule a reserva de emergência ideal (6 meses dos meus gastos) e um plano mensal para chegar lá, considerando quanto tenho hoje e quanto sobra por mês." },
  { id: "plano-meta", grupo: "Planejar", rotulo: "Plano para uma meta", pergunta: "Monte um plano para a meta: {entrada}. Quanto guardar por mês, onde cortar gastos para isso e se o prazo é realista.", entrada: "Qual meta? (ex.: viagem de R$ 6.000 em dezembro)" },
  { id: "decimo", grupo: "Planejar", rotulo: "O que fazer com o 13º", pergunta: "Sugira como dividir um 13º salário de {entrada} entre dívidas, reserva, metas e lazer, explicando a ordem de prioridade com base nos meus dados.", entrada: "Valor do 13º (ex.: R$ 3.200)" },
  { id: "lembretes", grupo: "Planejar", rotulo: "Lembretes inteligentes", pergunta: "Com base nas minhas contas fixas, próximas contas e metas, liste os lembretes que eu deveria ter no próximo mês (data e motivo), incluindo contas que costumam aparecer e ainda não estão agendadas." },
  { id: "avaliar-compra", grupo: "Decidir", rotulo: "Posso comprar isso?", previsao: true, pergunta: "Avalie se posso fazer esta compra agora: {entrada}. Considere saldo, contas próximas, previsão de saldo, reserva e metas. Responda Sim / Esperar / Não, com motivo e, se for esperar, quando seria melhor.", entrada: "O que e quanto? (ex.: celular de R$ 2.500 em 10x)" },
  { id: "parcelar", grupo: "Decidir", rotulo: "À vista ou parcelado?", pergunta: "Compare: {entrada}. Calcule o custo efetivo do parcelamento (juros embutidos ao mês), compare com deixar o dinheiro rendendo ~100% do CDI e diga qual compensa, mostrando a conta.", entrada: "Ex.: R$ 1.000 à vista ou 10x de R$ 115" },
  { id: "cenario", grupo: "Decidir", rotulo: "E se…? (cenário)", previsao: true, pergunta: "Simule o cenário: {entrada}. Mostre o efeito no saldo mensal, na reserva e nas metas nos próximos 6 meses (é estimativa).", entrada: "Ex.: e se eu perder o emprego? / e se o aluguel subir R$ 300?" },
  { id: "custo-uso", grupo: "Decidir", rotulo: "Custo por uso", pergunta: "Calcule o custo por uso de: {entrada}. Use meus gastos reais quando houver e diga se compensa ou se há alternativa mais barata.", entrada: "Ex.: academia R$ 120/mês, vou 6 vezes" },
  { id: "explicar-relatorios", grupo: "Entender", rotulo: "Explique meus números", pergunta: "Explique de forma simples, para quem não é contador, o que meus números mostram: saldo x patrimônio, dívidas de cartão, reserva, receitas x despesas. Use analogias do dia a dia." },
  { id: "previsao", grupo: "Entender", rotulo: "Explique a previsão de saldo", previsao: true, pergunta: "Explique a previsão de saldo dos próximos 90 dias: quando fico mais apertado, por quê (quais contas) e o que posso fazer antes disso." },
  { id: "termo", grupo: "Entender", rotulo: "O que significa…?", pergunta: "Explique em linguagem simples, com exemplo usando meus números se fizer sentido: {entrada}", entrada: "Ex.: CDI, rotativo do cartão, DRE, juros compostos" },
  { id: "duvida", grupo: "Entender", rotulo: "Como faço no Dairus?", manual: true, pergunta: "Responda como usar o app Dairus, passo a passo, indicando o menu: {entrada}. Se o Dairus não tiver a função, diga isso claramente.", entrada: "Sua dúvida (ex.: como lanço uma compra parcelada?)" },
];

export function montarPergunta(a: Analise, entrada: string): string {
  return a.pergunta.replace("{entrada}", entrada.trim() || "(não informado)");
}
