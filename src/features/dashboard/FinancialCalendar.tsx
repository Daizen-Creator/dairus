import { useState } from "react";
import { ChevronLeft, ChevronRight, CreditCard } from "lucide-react";
import { dataAtualISO, formatarCentavos } from "../../services/formato";
import { brilhoDeCor, degradeDeCor } from "../../services/gradientes";
import { IconeCoisa } from "../../components/ui/IconeCoisa";

interface EventoCalendario {
  nome: string;
  data: string;
  valorCentavos: number;
}

interface FinancialCalendarProps {
  eventos: EventoCalendario[];
}

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function somarDias(dataISO: string, dias: number): string {
  const [a, m, d] = dataISO.split("-").map(Number);
  const dt = new Date(a, m - 1, d + dias);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function FinancialCalendar({ eventos }: FinancialCalendarProps) {
  const hojeISO = dataAtualISO();
  const amanhaISO = somarDias(hojeISO, 1);
  const [ano, mesHoje, diaHoje] = hojeISO.split("-").map(Number);
  const [cursor, setCursor] = useState({ ano, mes: mesHoje - 1 });

  const primeiroDiaSemana = new Date(cursor.ano, cursor.mes, 1).getDay();
  const totalDias = new Date(cursor.ano, cursor.mes + 1, 0).getDate();
  const celulas = [
    ...Array.from({ length: primeiroDiaSemana }, () => null),
    ...Array.from({ length: totalDias }, (_, i) => i + 1),
  ];

  const diasComEvento = new Set<number>();
  for (const ev of eventos) {
    const [evAno, evMes, evDia] = ev.data.split("-").map(Number);
    if (evAno === cursor.ano && evMes === cursor.mes + 1) diasComEvento.add(evDia);
  }

  const ehMesAtual = cursor.ano === ano && cursor.mes === mesHoje - 1;

  // Próximos eventos agrupados por dia, no formato "Hoje (05/04)", "Amanhã (06/04)", "08/04".
  const proximos = eventos.filter((e) => e.data >= hojeISO).sort((a, b) => a.data.localeCompare(b.data)).slice(0, 5);
  const grupos = new Map<string, EventoCalendario[]>();
  for (const ev of proximos) grupos.set(ev.data, [...(grupos.get(ev.data) ?? []), ev]);
  const rotulo = (iso: string) =>
    iso === hojeISO ? `Hoje (${ddmm(iso)})` : iso === amanhaISO ? `Amanhã (${ddmm(iso)})` : ddmm(iso);

  return (
    <div className="rounded-xl border border-borda bg-cartao p-4">
      <h2 className="text-sm font-semibold text-texto-primario">Calendário Financeiro</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() => setCursor((c) => (c.mes === 0 ? { ano: c.ano - 1, mes: 11 } : { ano: c.ano, mes: c.mes - 1 }))}
              className="rounded p-1 text-texto-secundario hover:bg-borda/50"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="min-w-28 text-center text-xs font-semibold text-texto-primario">
              {NOMES_MES[cursor.mes]} {cursor.ano}
            </span>
            <button
              type="button"
              aria-label="Próximo mês"
              onClick={() => setCursor((c) => (c.mes === 11 ? { ano: c.ano + 1, mes: 0 } : { ano: c.ano, mes: c.mes + 1 }))}
              className="rounded p-1 text-texto-secundario hover:bg-borda/50"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-y-1 text-center text-[11px] text-texto-secundario">
            {DIAS_SEMANA.map((d, i) => (
              <span key={i} className="py-1 font-medium">{d}</span>
            ))}
            {celulas.map((dia, i) => {
              const ehHoje = ehMesAtual && dia === diaHoje;
              return (
                <span key={i} className="flex h-8 items-center justify-center">
                  {dia !== null && (
                    <span
                      className={`relative flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                        ehHoje ? "font-bold text-white" : "text-texto-primario"
                      }`}
                      style={
                        ehHoje
                          ? { backgroundImage: degradeDeCor("var(--cor-primaria)"), boxShadow: brilhoDeCor("var(--cor-primaria)", 0.8) }
                          : undefined
                      }
                    >
                      {dia}
                      {diasComEvento.has(dia) && !ehHoje && (
                        <span className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-destaque" />
                      )}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>

        <div className="border-borda sm:border-l sm:pl-4">
          {grupos.size === 0 ? (
            <p className="text-xs text-texto-secundario">Nenhum vencimento cadastrado.</p>
          ) : (
            <div className="space-y-3">
              {[...grupos.entries()].map(([iso, lista]) => (
                <div key={iso}>
                  <p className="mb-1.5 text-[11px] font-semibold text-texto-secundario">{rotulo(iso)}</p>
                  <ul className="space-y-1.5">
                    {lista.map((ev) => (
                      <li key={ev.nome + ev.data} className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex min-w-0 items-center gap-2 text-texto-primario">
                          <IconeCoisa nome={ev.nome} tamanho={24} padrao={{ icone: CreditCard, cor: "#a855f7" }} />
                          <span className="truncate">{ev.nome}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-texto-secundario">
                          {formatarCentavos(ev.valorCentavos)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
