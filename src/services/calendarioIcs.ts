// Calendário .ics com os vencimentos (contas a pagar, receitas, faturas de
// cartão e parcelas de empréstimo), para importar no Google Agenda ou no celular.

export interface EventoCalendario {
  id: string;
  data: string;
  titulo: string;
  descricao?: string;
}

const escapar = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Linhas de mais de 75 caracteres são dobradas, como pede o padrão iCalendar. */
function dobrar(linha: string): string {
  const partes: string[] = [];
  let resto = linha;
  while (resto.length > 75) {
    partes.push(resto.slice(0, 75));
    resto = " " + resto.slice(75);
  }
  partes.push(resto);
  return partes.join("\r\n");
}

export function gerarIcs(eventos: EventoCalendario[], agora = new Date()): string {
  const carimbo = agora.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const linhas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dairus//Vencimentos//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Dairus - vencimentos"];
  for (const e of eventos) {
    const dia = e.data.replace(/-/g, "");
    const seguinte = new Date(Date.UTC(+e.data.slice(0, 4), +e.data.slice(5, 7) - 1, +e.data.slice(8, 10) + 1)).toISOString().slice(0, 10).replace(/-/g, "");
    linhas.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@dairus`,
      `DTSTAMP:${carimbo}`,
      `DTSTART;VALUE=DATE:${dia}`,
      `DTEND;VALUE=DATE:${seguinte}`,
      dobrar(`SUMMARY:${escapar(e.titulo)}`),
      ...(e.descricao ? [dobrar(`DESCRIPTION:${escapar(e.descricao)}`)] : []),
      "BEGIN:VALARM",
      "TRIGGER:-P1D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapar(e.titulo)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  linhas.push("END:VCALENDAR");
  return linhas.join("\r\n") + "\r\n";
}
