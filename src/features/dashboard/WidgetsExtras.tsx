import { useCallback, useEffect, useState } from "react";
import { Calculator, CalendarClock, DollarSign, Lightbulb, RefreshCw, Settings2, TrendingDown, TrendingUp } from "lucide-react";
import { usePreferencia } from "../../state/usePreferencia";
import { formatarDataISOParaBR } from "../../services/formato";
import { dicaDoDia } from "../ajuda/conteudoAjuda";
import { calcular, diasEntre, proximoDiaDoMes } from "./dadosWidgetsInicio";

/** Moldura simples dos widgets (título com ícone e, opcional, um botão de ajustes). */
export function Cartao({ titulo, icone: Icone, ajustes, children }: { titulo: string; icone: typeof Lightbulb; ajustes?: React.ReactNode; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="h-full rounded-xl border border-borda bg-cartao p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-texto-secundario"><Icone size={13} className="text-primaria" /> {titulo}</p>
        {ajustes && <button type="button" onClick={() => setAberto(!aberto)} aria-label={`Ajustes: ${titulo}`} aria-expanded={aberto} className="rounded p-1 text-texto-secundario hover:bg-borda/50 hover:text-texto-primario"><Settings2 size={13} /></button>}
      </div>
      {aberto && ajustes && <div className="mb-2 space-y-2 rounded-lg border border-borda bg-fundo p-2.5 text-xs">{ajustes}</div>}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cotações (dólar e euro)

interface Cotacao {
  dolar: number | null;
  euro: number | null;
  variacaoDolar: number | null;
  variacaoEuro: number | null;
  em: number;
}

let cache: Cotacao | null = null;

export function WidgetCotacoes() {
  const [c, setC] = useState<Cotacao | null>(cache);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const atualizar = useCallback(async (forcar = false) => {
    if (!forcar && cache && Date.now() - cache.em < 15 * 60_000) return setC(cache);
    setCarregando(true);
    try {
      const { cotacaoMoedas } = await import("../investimentos/mercado");
      cache = { ...(await cotacaoMoedas()), em: Date.now() };
      setC(cache);
      setErro(null);
    } catch {
      setErro("Sem conexão com o serviço de cotações.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    atualizar();
    const t = window.setInterval(() => atualizar(true), 15 * 60_000);
    return () => window.clearInterval(t);
  }, [atualizar]);

  const linha = (nome: string, valor: number | null, variacao: number | null) => (
    <p className="flex items-center justify-between text-sm">
      <span className="text-texto-secundario">{nome}</span>
      <span className="flex items-center gap-2">
        <strong className="tabular-nums text-texto-primario">{valor === null ? "—" : valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 })}</strong>
        {variacao !== null && <span className={`flex items-center text-[11px] tabular-nums ${variacao >= 0 ? "text-sucesso" : "text-erro"}`}>{variacao >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{variacao.toFixed(2).replace(".", ",")}%</span>}
      </span>
    </p>
  );

  return (
    <Cartao titulo="Dólar e euro" icone={DollarSign}>
      {c ? (
        <>
          {linha("Dólar", c.dolar, c.variacaoDolar)}
          {linha("Euro", c.euro, c.variacaoEuro)}
        </>
      ) : (
        <p className="text-xs text-texto-secundario">{erro ?? "Carregando…"}</p>
      )}
      <p className="mt-1 flex items-center justify-between text-[11px] text-texto-secundario">
        <span>{erro && c ? erro : c ? `Atualizado às ${new Date(c.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
        <button type="button" onClick={() => atualizar(true)} disabled={carregando} aria-label="Atualizar cotações" className="rounded p-0.5 hover:text-primaria disabled:opacity-50"><RefreshCw size={11} className={carregando ? "animate-spin" : ""} /></button>
      </p>
    </Cartao>
  );
}

// ---------------------------------------------------------------------------
// Contagem regressiva

interface ConfigContagem {
  /** SALARIO usa o dia do pagamento do perfil de renda (ou `dia`); DATA usa `data`. */
  modo: "SALARIO" | "DATA";
  dia: number;
  data: string;
  nome: string;
}

export function WidgetContagem({ hoje }: { hoje: string }) {
  const [perfil] = usePreferencia<{ diaPagamento?: number } | null>("perfil_renda", null);
  const [cfg, setCfg] = usePreferencia<ConfigContagem>("widget_contagem", { modo: "SALARIO", dia: 5, data: "", nome: "" });
  const diaSalario = perfil?.diaPagamento || cfg.dia;
  const alvo = cfg.modo === "DATA" && cfg.data ? { data: cfg.data, dias: diasEntre(hoje, cfg.data) } : proximoDiaDoMes(hoje, diaSalario);
  const nome = cfg.modo === "DATA" ? cfg.nome || "a data escolhida" : "o salário";

  return (
    <Cartao
      titulo="Contagem regressiva"
      icone={CalendarClock}
      ajustes={
        <>
          <label className="flex items-center gap-2"><input type="radio" checked={cfg.modo === "SALARIO"} onChange={() => setCfg({ ...cfg, modo: "SALARIO" })} />Até o salário (dia {diaSalario})</label>
          {cfg.modo === "SALARIO" && !perfil?.diaPagamento && (
            <label className="flex items-center gap-2 pl-5">Dia do pagamento <input type="number" min={1} max={31} value={cfg.dia} onChange={(e) => setCfg({ ...cfg, dia: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} className="w-14 rounded border border-borda bg-cartao px-1 py-0.5" /></label>
          )}
          <label className="flex items-center gap-2"><input type="radio" checked={cfg.modo === "DATA"} onChange={() => setCfg({ ...cfg, modo: "DATA" })} />Até uma data</label>
          {cfg.modo === "DATA" && (
            <div className="flex flex-wrap gap-2 pl-5">
              <input value={cfg.nome} onChange={(e) => setCfg({ ...cfg, nome: e.target.value.slice(0, 40) })} placeholder="Ex.: Viagem" aria-label="Nome da data" className="w-28 rounded border border-borda bg-cartao px-1.5 py-0.5" />
              <input type="date" value={cfg.data} onChange={(e) => setCfg({ ...cfg, data: e.target.value })} aria-label="Data" className="rounded border border-borda bg-cartao px-1.5 py-0.5" />
            </div>
          )}
        </>
      }
    >
      {alvo.dias < 0 ? (
        <p className="text-sm text-texto-secundario">{cfg.nome || "A data"} já passou ({formatarDataISOParaBR(alvo.data)}).</p>
      ) : (
        <>
          <p className="text-lg font-bold tabular-nums text-texto-primario">{alvo.dias === 0 ? "É hoje!" : `${alvo.dias} dia${alvo.dias === 1 ? "" : "s"}`}</p>
          <p className="text-[11px] text-texto-secundario">para {nome} · {formatarDataISOParaBR(alvo.data)}</p>
        </>
      )}
    </Cartao>
  );
}

// ---------------------------------------------------------------------------
// Calculadora

export function WidgetCalculadora() {
  const [expr, setExpr] = useState("");
  const [historico, setHistorico] = useState<string[]>([]);
  const resultado = calcular(expr);
  const formatar = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 6 });

  return (
    <Cartao titulo="Calculadora" icone={Calculator}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (resultado === null) return;
          setHistorico([`${expr} = ${formatar(resultado)}`, ...historico].slice(0, 3));
          setExpr(String(resultado).replace(".", ","));
        }}
      >
        <input value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="Ex.: 1.250,90 * 12" aria-label="Conta" inputMode="decimal" className="w-full rounded-lg border border-borda bg-fundo px-2 py-1.5 font-mono text-sm text-texto-primario outline-none focus:border-primaria" />
      </form>
      <p className="mt-1 text-right text-lg font-bold tabular-nums text-texto-primario" aria-live="polite">{expr ? (resultado === null ? "…" : `= ${formatar(resultado)}`) : " "}</p>
      {historico.length > 0 && <ul className="mt-1 space-y-0.5 text-[11px] text-texto-secundario">{historico.map((h, i) => <li key={i} className="truncate font-mono">{h}</li>)}</ul>}
      <p className="mt-1 text-[10px] text-texto-secundario">Use vírgula nos centavos. Enter guarda o resultado.</p>
    </Cartao>
  );
}

// ---------------------------------------------------------------------------
// Dica do dia

export function WidgetDica({ hoje }: { hoje: string }) {
  return (
    <Cartao titulo="Dica do dia" icone={Lightbulb}>
      <p className="text-sm leading-relaxed text-texto-primario">{dicaDoDia(hoje)}</p>
    </Cartao>
  );
}
