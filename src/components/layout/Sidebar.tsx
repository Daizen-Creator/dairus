import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { ChevronDown, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { brilhoDeCor, degradeDeCor } from "../../services/gradientes";
import { useThemeStore } from "../../state/theme-store";
import { NAVEGACAO, type ItemNavegacao } from "../../app/navegacao";
import { usePreferencia } from "../../state/usePreferencia";
import { useAparenciaStore } from "../../state/aparencia-store";
import { ordenarPorPreferencia } from "../../features/aparencia/aparencia";

/** Itens do menu na ordem escolhida, sem os que o usuário escondeu. */
export function useItensMenu(): ItemNavegacao[] {
  const [menuOculto] = usePreferencia<string[]>("menu_oculto", []);
  const ordem = useAparenciaStore((s) => s.aparencia.menu.ordem);
  return ordenarPorPreferencia(NAVEGACAO, ordem).filter((item) => !menuOculto.includes(item.rota));
}

function ItemMenu({ item, mostrarIcone, mostrarTexto, onNavegar, horizontal = false }: { item: ItemNavegacao; mostrarIcone: boolean; mostrarTexto: boolean; onNavegar?: () => void; horizontal?: boolean }) {
  const Icone = item.icone;
  return (
    <NavLink
      to={item.rota}
      end={item.rota === "/"}
      title={item.rotulo}
      aria-label={item.rotulo}
      onClick={onNavegar}
      className={({ isActive }) =>
        `menu-item relative flex items-center gap-3 rounded-lg text-sm font-medium transition-[background-color,color,transform,box-shadow] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97] ${
          horizontal ? "shrink-0 px-3 py-1.5" : "px-3 py-2"
        } ${!mostrarTexto ? "justify-center" : ""} ${isActive ? "menu-item-ativo" : "text-texto-secundario hover:text-texto-primario"}`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !horizontal && (
            <span aria-hidden className="absolute left-0 top-1/2 h-[22px] w-[3px] -translate-y-1/2 rounded-r" style={{ background: "var(--menu-selecionado)", boxShadow: "0 0 12px var(--menu-selecionado)" }} />
          )}
          {mostrarIcone && <Icone size={horizontal ? 17 : 19} strokeWidth={1.8} className="shrink-0" style={{ color: isActive ? "#ffffff" : undefined }} />}
          {mostrarTexto && (
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span className={horizontal ? "whitespace-nowrap" : "truncate"}>{item.rotulo}</span>
              {item.tag && !horizontal && <span className="shrink-0 rounded-full bg-destaque/20 px-1.5 py-0.5 text-[10px] font-semibold text-destaque">{item.tag}</span>}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function CartaoTema({ fechada }: { fechada: boolean }) {
  const temaAtivo = useThemeStore((s) => s.temaAtivo());
  const todosOsTemas = useThemeStore((s) => s.todosOsTemas);
  const selecionarTema = useThemeStore((s) => s.selecionarTema);
  const amostras = todosOsTemas().slice(0, 16);
  return (
    <div
      className="rounded-xl border p-2.5"
      style={{
        borderColor: "color-mix(in srgb, var(--cor-primaria) 35%, transparent)",
        backgroundImage: "linear-gradient(135deg, color-mix(in srgb, var(--cor-primaria) 14%, transparent), color-mix(in srgb, var(--cor-destaque) 10%, transparent))",
      }}
    >
      <NavLink to="/temas" title="Temas e aparência" className="flex items-center gap-2.5">
        <span
          className="h-8 w-8 shrink-0 rounded-full"
          style={{ backgroundImage: `radial-gradient(circle at 30% 25%, white 0%, transparent 35%), ${degradeDeCor(temaAtivo.cores.primaria)}`, boxShadow: brilhoDeCor(temaAtivo.cores.primaria, 0.8) }}
        />
        {!fechada && (
          <>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[11px] text-texto-secundario">Tema e aparência</span>
              <span className="block truncate text-sm font-semibold text-texto-primario">{temaAtivo.nome}</span>
            </span>
            <ChevronDown size={14} className="shrink-0 text-texto-secundario" />
          </>
        )}
      </NavLink>
      {!fechada && (
        <div className="mt-2.5 grid grid-cols-8 gap-1.5">
          {amostras.map((tema) => {
            const ativo = tema.id === temaAtivo.id;
            return (
              <button
                key={tema.id}
                type="button"
                title={tema.nome}
                aria-label={`Aplicar tema ${tema.nome}`}
                aria-pressed={ativo}
                onClick={() => selecionarTema(tema.id)}
                className="h-3.5 w-3.5 rounded-full transition-transform duration-150 [transition-timing-function:var(--ease-out)] hover:scale-125 active:scale-95"
                style={{ backgroundImage: degradeDeCor(tema.cores.primaria), boxShadow: ativo ? `0 0 0 2px var(--cor-superficie), 0 0 0 3.5px ${tema.cores.primaria}` : undefined }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Menu lateral (fixo, só ícones ou gaveta) ou superior, conforme Temas → Menu. */
export function Sidebar() {
  const menu = useAparenciaStore((s) => s.aparencia.menu);
  const alterar = useAparenciaStore((s) => s.alterar);
  const gavetaAberta = useAparenciaStore((s) => s.gavetaAberta);
  const alternarGaveta = useAparenciaStore((s) => s.alternarGaveta);
  const itens = useItensMenu();
  const [versao, setVersao] = useState("");

  // Janela estreita (notebook pequeno, tela dividida): recolhe sozinha; o botão abre temporariamente.
  const [estreita, setEstreita] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 1023px)").matches);
  const [abertaNaEstreita, setAbertaNaEstreita] = useState(false);
  useEffect(() => {
    import("@tauri-apps/api/app").then(({ getVersion }) => getVersion()).then(setVersao).catch(() => setVersao(""));
  }, []);
  useEffect(() => {
    const mq = window.matchMedia?.("(max-width: 1023px)");
    if (!mq) return;
    const f = () => { setEstreita(mq.matches); setAbertaNaEstreita(false); };
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  useEffect(() => {
    if (!gavetaAberta) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && alternarGaveta(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [gavetaAberta, alternarGaveta]);

  if (menu.layout === "superior" && menu.modo !== "gaveta") return null;

  const conteudo = (fechada: boolean, aoNavegar?: () => void) => {
    const mostrarIcone = menu.itens !== "texto" || fechada;
    const mostrarTexto = !fechada && menu.itens !== "icones";
    return (
      <>
        <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {itens.map((item) => (
            <li key={item.rota}>
              <ItemMenu item={item} mostrarIcone={mostrarIcone} mostrarTexto={mostrarTexto} onNavegar={aoNavegar} />
            </li>
          ))}
        </ul>
        <div className="border-t border-borda p-2">
          <CartaoTema fechada={fechada} />
          {!aoNavegar && (
            <div className="mt-1.5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => (estreita ? setAbertaNaEstreita((v) => !v) : alterar({ menu: { modo: menu.modo === "recolhido" ? "fixo" : "recolhido" } }))}
                aria-label={fechada ? "Expandir menu" : "Recolher menu"}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-texto-secundario hover:bg-borda/50"
              >
                {fechada ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
                {!fechada && "Recolher"}
              </button>
              {!fechada && <span className="px-2 text-[10px] text-texto-secundario">v{versao}</span>}
            </div>
          )}
        </div>
      </>
    );
  };

  if (menu.modo === "gaveta") {
    if (!gavetaAberta) return null;
    return (
      <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="Menu" onMouseDown={(e) => e.target === e.currentTarget && alternarGaveta(false)} style={{ top: "var(--altura-barra-titulo)", background: "rgba(0,0,0,0.35)" }}>
        <nav className="menu-app sem-impressao flex h-full flex-col border-r border-borda shadow-2xl" style={{ width: "var(--menu-largura)", animation: "gaveta-entra 180ms var(--ease-out)" }}>
          <div className="flex justify-end p-1">
            <button type="button" onClick={() => alternarGaveta(false)} aria-label="Fechar menu" className="rounded-lg p-1.5 text-texto-secundario hover:bg-borda/50"><X size={16} /></button>
          </div>
          {conteudo(false, () => alternarGaveta(false))}
        </nav>
      </div>
    );
  }

  const fechada = estreita ? !abertaNaEstreita : menu.modo === "recolhido";
  return (
    <nav className="menu-app sem-impressao flex shrink-0 flex-col border-r border-borda transition-[width] duration-150 [transition-timing-function:var(--ease-out)]" style={{ width: fechada ? 64 : "var(--menu-largura)" }}>
      {conteudo(fechada)}
    </nav>
  );
}

/** Menu superior (abaixo da barra de título), quando escolhido em Temas → Menu. */
export function MenuSuperior() {
  const menu = useAparenciaStore((s) => s.aparencia.menu);
  const itens = useItensMenu();
  if (menu.layout !== "superior" || menu.modo === "gaveta") return null;
  const soIcones = menu.itens === "icones" || menu.modo === "recolhido";
  return (
    <nav className="menu-app sem-impressao relative z-20 flex shrink-0 items-center gap-1 overflow-x-auto border-b border-borda px-3 py-1.5" aria-label="Menu principal">
      {itens.map((item) => (
        <ItemMenu key={item.rota} item={item} mostrarIcone={menu.itens !== "texto" || soIcones} mostrarTexto={!soIcones} horizontal />
      ))}
    </nav>
  );
}
