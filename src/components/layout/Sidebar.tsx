import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { ChevronDown, ChevronsLeft, ChevronsRight } from "lucide-react";
import { brilhoDeCor, degradeDeCor } from "../../services/gradientes";
import { lerPreferencia, salvarPreferencia } from "../../services/armazenamento";
import { useThemeStore } from "../../state/theme-store";
import { NAVEGACAO } from "../../app/navegacao";

const CHAVE_RECOLHIDO = "sidebar_recolhido";

export function Sidebar() {
  const [recolhido, setRecolhido] = useState(false);
  const temaAtivo = useThemeStore((s) => s.temaAtivo());
  const todosOsTemas = useThemeStore((s) => s.todosOsTemas);
  const selecionarTema = useThemeStore((s) => s.selecionarTema);
  const amostras = todosOsTemas().slice(0, 16);

  useEffect(() => {
    lerPreferencia<boolean>(CHAVE_RECOLHIDO).then((valor) => {
      if (valor !== null) setRecolhido(valor);
    });
  }, []);

  function alternar() {
    const novo = !recolhido;
    setRecolhido(novo);
    salvarPreferencia(CHAVE_RECOLHIDO, novo);
  }

  return (
    <nav
      className="sem-impressao flex shrink-0 flex-col border-r border-borda bg-superficie transition-[width] duration-150 [transition-timing-function:var(--ease-out)]"
      style={{ width: recolhido ? 64 : 232 }}
    >
      <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAVEGACAO.map((item) => {
          const Icone = item.icone;
          return (
            <li key={item.rota}>
              <NavLink
                to={item.rota}
                end={item.rota === "/"}
                title={item.rotulo}
                aria-label={item.rotulo}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-[background-color,color,transform,box-shadow] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97] ${
                    isActive
                      ? "bg-gradient-to-r from-primaria to-[color-mix(in_srgb,var(--cor-primaria)_72%,var(--cor-destaque))] text-primaria-texto shadow-[0_2px_16px_-2px_var(--cor-primaria)]"
                      : "text-texto-secundario hover:bg-primaria/10 hover:text-texto-primario"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 h-[22px] w-[3px] -translate-y-1/2 rounded-r"
                        style={{ background: "var(--cor-primaria)", boxShadow: "0 0 12px var(--cor-primaria)" }}
                      />
                    )}
                    <Icone
                      size={19}
                      strokeWidth={1.8}
                      className="shrink-0"
                      style={{ color: isActive ? "#ffffff" : undefined }}
                    />
                    {!recolhido && (
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span className="truncate">{item.rotulo}</span>
                        {item.tag && (
                          <span className="shrink-0 rounded-full bg-destaque/20 px-1.5 py-0.5 text-[10px] font-semibold text-destaque">
                            {item.tag}
                          </span>
                        )}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-borda p-2">
        <div
          className="rounded-xl border p-2.5"
          style={{
            borderColor: "color-mix(in srgb, var(--cor-primaria) 35%, transparent)",
            backgroundImage:
              "linear-gradient(135deg, color-mix(in srgb, var(--cor-primaria) 14%, transparent), color-mix(in srgb, var(--cor-destaque) 10%, transparent))",
          }}
        >
          <NavLink to="/temas" title="Todos os temas" className="flex items-center gap-2.5">
            <span
              className="h-8 w-8 shrink-0 rounded-full"
              style={{
                backgroundImage: `radial-gradient(circle at 30% 25%, white 0%, transparent 35%), ${degradeDeCor(temaAtivo.cores.primaria)}`,
                boxShadow: brilhoDeCor(temaAtivo.cores.primaria, 0.8),
              }}
            />
            {!recolhido && (
              <>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-[11px] text-texto-secundario">Tema Atual</span>
                  <span className="block truncate text-sm font-semibold text-texto-primario">{temaAtivo.nome}</span>
                </span>
                <ChevronDown size={14} className="shrink-0 text-texto-secundario" />
              </>
            )}
          </NavLink>
          {!recolhido && (
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
                    style={{
                      backgroundImage: degradeDeCor(tema.cores.primaria),
                      boxShadow: ativo ? `0 0 0 2px var(--cor-superficie), 0 0 0 3.5px ${tema.cores.primaria}` : undefined,
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <button
            type="button"
            onClick={alternar}
            aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-texto-secundario hover:bg-borda/50"
          >
            {recolhido ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
            {!recolhido && "Recolher"}
          </button>
          {!recolhido && <span className="px-2 text-[10px] text-texto-secundario">v0.1.0</span>}
        </div>
      </div>
    </nav>
  );
}
