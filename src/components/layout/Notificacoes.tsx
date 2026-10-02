import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertTriangle, ArrowRight, Bell, Info, ShieldAlert } from "lucide-react";
import { contabilidade } from "../../services/contabilidade";
import { extras } from "../../services/extras";
import { dataAtualISO } from "../../services/formato";
import { gerarAlertas, type Alerta, type Gravidade } from "../../features/dashboard/inteligencia";
import type { InfoBackup } from "../../types/extras";

const COR: Record<Gravidade, string> = { critico: "#ff2d55", atencao: "#f59e0b", info: "#00d9ff" };
const ICONE = { critico: ShieldAlert, atencao: AlertTriangle, info: Info };

/** Sino da barra de título: mostra os alertas reais (contas atrasadas, limites, cartões, backup…). */
export function Notificacoes() {
  const [aberto, setAberto] = useState(false);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [carregando, setCarregando] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const local = useLocation();

  const atualizar = useCallback(async () => {
    try {
      setCarregando(true);
      const [contas, lancamentos, agendamentos, metas, orcamentos, backups] = await Promise.all([
        contabilidade.listarContas(),
        contabilidade.listarLancamentos(3000),
        contabilidade.listarAgendamentos(),
        extras.listarMetas(),
        extras.listarOrcamentos(),
        extras.listarBackups().catch(() => [] as InfoBackup[]),
      ]);
      const ultimoBackup = backups.find((b) => b.nome.startsWith("dairus-")) ?? null;
      setAlertas(gerarAlertas({ hoje: dataAtualISO(), contas, lancamentos, agendamentos, metas, orcamentos, ultimoBackup }));
    } catch {
      // sem dados: o sino só fica sem contador
    } finally {
      setCarregando(false);
    }
  }, []);

  // Atualiza ao abrir o app, a cada troca de tela e a cada 5 minutos.
  useEffect(() => {
    atualizar();
  }, [atualizar, local.pathname]);
  useEffect(() => {
    const id = window.setInterval(atualizar, 5 * 60_000);
    return () => window.clearInterval(id);
  }, [atualizar]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const importantes = alertas.filter((a) => a.gravidade !== "info").length;

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        aria-label={`Notificações${alertas.length ? ` (${alertas.length})` : ""}`}
        aria-expanded={aberto}
        onClick={() => {
          setAberto((v) => !v);
          if (!aberto) atualizar();
        }}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-texto-secundario transition-colors hover:bg-borda/50"
      >
        <Bell size={16} />
        {alertas.length > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ backgroundColor: importantes ? "#ff2d55" : "#1677ff", boxShadow: `0 0 8px ${importantes ? "#ff2d55" : "#1677ff"}` }}
          >
            {alertas.length}
          </span>
        )}
      </button>
      {aberto && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-borda bg-superficie p-2 shadow-[0_16px_40px_-12px_rgba(0,0,0,.7)]">
          <p className="px-2 py-1.5 text-xs font-semibold text-texto-secundario">Notificações</p>
          {alertas.length === 0 ? (
            <p className="px-2 pb-2 text-sm text-sucesso">{carregando ? "Verificando…" : "Tudo certo: nenhum alerta no momento."}</p>
          ) : (
            <ul className="max-h-96 space-y-1.5 overflow-y-auto">
              {alertas.map((a) => {
                const Icone = ICONE[a.gravidade];
                return (
                  <li key={a.id}>
                    <Link
                      to={a.rota}
                      onClick={() => setAberto(false)}
                      className="flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-xs transition-colors hover:bg-borda/30"
                      style={{ borderColor: `color-mix(in srgb, ${COR[a.gravidade]} 40%, transparent)` }}
                    >
                      <Icone size={15} style={{ color: COR[a.gravidade] }} className="mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-texto-primario">{a.titulo}</span>
                        <span className="block truncate text-texto-secundario">{a.detalhe}</span>
                      </span>
                      <ArrowRight size={13} className="mt-0.5 shrink-0 text-texto-secundario" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
