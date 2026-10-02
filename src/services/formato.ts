// Toda formatação de moeda e data do app passa por aqui — BRL, pt-BR,
// America/Sao_Paulo, sempre em centavos inteiros (nunca float) por baixo.

const formatadorMoeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const formatadorData = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

export function formatarCentavos(centavos: number): string {
  return formatadorMoeda.format(centavos / 100);
}

export function centavosParaValorInput(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}

/** Converte "1.234,56" (como o usuário digita) para 123456 centavos. */
export function valorInputParaCentavos(valor: string): number {
  const normalizado = valor.trim().replace(/\./g, "").replace(",", ".");
  const numero = Number.parseFloat(normalizado);
  if (Number.isNaN(numero)) return 0;
  return Math.round(numero * 100);
}

export function formatarDataISOParaBR(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  return formatadorData.format(new Date(ano, mes - 1, dia));
}

export function dataAtualISO(): string {
  const agora = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  );
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function primeiroDiaDoMesISO(dataISO: string): string {
  return `${dataISO.slice(0, 7)}-01`;
}

export function ultimoDiaDoMesISO(dataISO: string): string {
  const [ano, mes] = dataISO.split("-").map(Number);
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return `${dataISO.slice(0, 7)}-${String(ultimoDia).padStart(2, "0")}`;
}

/** Próxima data (a partir de hoje) em que o dia do mês bate com `dia` —
 * usado para "próximo vencimento" de fatura de cartão. */
export function proximaDataComDia(dia: number): string {
  const hojeISO = dataAtualISO();
  const [ano, mes, diaAtual] = hojeISO.split("-").map(Number);
  const candidata = diaAtual <= dia ? new Date(ano, mes - 1, dia) : new Date(ano, mes, dia);
  const anoC = candidata.getFullYear();
  const mesC = String(candidata.getMonth() + 1).padStart(2, "0");
  const diaC = String(candidata.getDate()).padStart(2, "0");
  return `${anoC}-${mesC}-${diaC}`;
}

export function nomeMesAno(dataISO: string): string {
  const [ano, mes] = dataISO.split("-").map(Number);
  const nome = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(ano, mes - 1, 1));
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}
