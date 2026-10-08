import { useMemo, useState } from "react";
import { Check, Copy, LayoutDashboard, LayoutGrid, Pencil, Plus, Trash2 } from "lucide-react";
import { useWidgetsStore } from "../../../state/widgets-store";
import { CATALOGO, GRUPOS, MODELOS, montar, type Painel } from "../layoutWidgets";

/** Desenho em miniatura de um layout (posição e tamanho reais dos widgets). */
export function Miniatura({ widgets, className = "" }: { widgets: Array<{ i?: string; x: number; y: number; w: number; h: number }>; className?: string }) {
  const altura = Math.max(8, ...widgets.map((w) => w.y + w.h));
  return (
    <div className={`relative w-full overflow-hidden rounded border border-borda bg-fundo ${className}`} style={{ aspectRatio: `12 / ${Math.min(altura, 24) * 0.9}` }} aria-hidden>
      {widgets.map((w, n) => (
        <span key={w.i ?? n} className="absolute rounded-[2px] border border-primaria/50 bg-primaria/20" style={{ left: `${(w.x / 12) * 100}%`, width: `calc(${(w.w / 12) * 100}% - 2px)`, top: `${(w.y / altura) * 100}%`, height: `calc(${(w.h / altura) * 100}% - 2px)` }} />
      ))}
    </div>
  );
}

/** Abas dos layouts salvos + botão de editar. No modo de edição, mostra as ações do layout. */
export function BarraPaineis({ ativo }: { ativo: Painel }) {
  const { paineis, editando, setEditando, ativar, criar, renomear, excluir, alterarOpcoes } = useWidgetsStore();
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const botao = "flex items-center gap-1 rounded-lg border border-borda px-2 py-1 text-xs text-texto-secundario hover:border-primaria hover:text-primaria";

  return (
    <div className="mb-2 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Layouts do painel" className="flex min-w-0 flex-wrap items-center gap-1">
          <LayoutDashboard size={13} className="mr-1 text-texto-secundario" />
          {paineis.map((p) =>
            renomeando === p.id ? (
              <form key={p.id} onSubmit={(e) => { e.preventDefault(); renomear(p.id, String(new FormData(e.currentTarget).get("nome") ?? "")); setRenomeando(null); }}>
                <input name="nome" defaultValue={p.nome} autoFocus maxLength={60} onBlur={(e) => { renomear(p.id, e.target.value); setRenomeando(null); }} aria-label="Nome do layout" className="w-36 rounded-full border border-primaria bg-fundo px-2.5 py-0.5 text-xs text-texto-primario outline-none" />
              </form>
            ) : (
              <button key={p.id} role="tab" aria-selected={p.id === ativo.id} onClick={() => ativar(p.id)} onDoubleClick={() => setRenomeando(p.id)} title="Clique para usar; dois cliques para renomear" className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${p.id === ativo.id ? "bg-primaria font-semibold text-white" : "text-texto-secundario hover:bg-borda/50 hover:text-texto-primario"}`}>
                {p.nome}
              </button>
            ),
          )}
          <button onClick={() => { setNovoAberto(!novoAberto); if (!editando) setEditando(true); }} aria-label="Novo layout" title="Novo layout" className="rounded-full p-1 text-texto-secundario hover:bg-borda/50 hover:text-primaria"><Plus size={13} /></button>
        </div>
        <button onClick={() => { setEditando(!editando); setNovoAberto(false); setConfirmarExcluir(false); }} className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium ${editando ? "bg-primaria text-white" : "text-primaria hover:bg-primaria/10"}`}>
          {editando ? <><Check size={12} /> Concluir</> : <><LayoutGrid size={12} /> Editar layout</>}
        </button>
      </div>

      {editando && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-primaria/50 bg-superficie/80 p-2">
          <button onClick={() => setRenomeando(ativo.id)} className={botao}><Pencil size={12} /> Renomear</button>
          <button onClick={() => criar(`${ativo.nome} (cópia)`, { copiarDe: ativo })} className={botao}><Copy size={12} /> Duplicar</button>
          {paineis.length > 1 && (
            confirmarExcluir
              ? <button onClick={() => { excluir(ativo.id); setConfirmarExcluir(false); }} className={`${botao} border-erro text-erro`}><Trash2 size={12} /> Confirmar exclusão de “{ativo.nome}”</button>
              : <button onClick={() => setConfirmarExcluir(true)} className={`${botao} hover:border-erro hover:text-erro`}><Trash2 size={12} /> Excluir layout</button>
          )}
          <span className="mx-1 h-4 w-px bg-borda" />
          <label className="flex items-center gap-1.5 text-xs text-texto-primario" title="Ligado: os widgets sobem sozinhos para fechar os buracos. Desligado: cada widget fica exatamente onde você soltar.">
            <input type="checkbox" checked={ativo.opcoes.compactar} onChange={() => alterarOpcoes({ compactar: !ativo.opcoes.compactar })} className="h-3.5 w-3.5 accent-[var(--cor-primaria)]" /> Encaixar automaticamente
          </label>
          <label className="flex items-center gap-1.5 text-xs text-texto-primario">
            Espaço
            <select value={ativo.opcoes.espaco} onChange={(e) => alterarOpcoes({ espaco: e.target.value as Painel["opcoes"]["espaco"] })} className="rounded border border-borda bg-fundo px-1 py-0.5 text-xs">
              <option value="compacto">Compacto</option>
              <option value="normal">Normal</option>
              <option value="amplo">Amplo</option>
            </select>
          </label>
          <span className="ml-auto text-[11px] text-texto-secundario">Arraste os cards; puxe as bordas para mudar o tamanho.</span>
        </div>
      )}

      {novoAberto && (
        <div className="rounded-xl border border-borda bg-superficie p-3">
          <p className="mb-2 text-xs font-semibold text-texto-primario">Novo layout a partir de um modelo</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {MODELOS.map((m) => (
              <button key={m.id} onClick={() => { criar(m.nome, { modelo: m }); setNovoAberto(false); }} className="rounded-lg border border-borda bg-fundo p-2 text-left hover:border-primaria">
                <MiniaturaModelo itens={m.itens} />
                <p className="mt-1.5 text-xs font-semibold text-texto-primario">{m.nome}</p>
                <p className="text-[10px] leading-tight text-texto-secundario">{m.descricao}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniaturaModelo({ itens }: { itens: (typeof MODELOS)[number]["itens"] }) {
  // Monta só para desenhar (não salva nada).
  const widgets = useWidgetsMontados(itens);
  return <Miniatura widgets={widgets} />;
}

function useWidgetsMontados(itens: (typeof MODELOS)[number]["itens"]) {
  return useMemo(() => montar(itens), [itens]);
}

/** Catálogo para adicionar widgets ao layout ativo. */
export function CatalogoWidgets({ compacto = false }: { compacto?: boolean }) {
  const ativos = useWidgetsStore((s) => s.paineis.find((p) => p.id === s.ativoId)?.widgets ?? []);
  const adicionar = useWidgetsStore((s) => s.adicionar);
  const remover = useWidgetsStore((s) => s.remover);
  return (
    <div className={`grid gap-3 ${compacto ? "sm:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-3"}`}>
      {GRUPOS.map((g) => (
        <div key={g}>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-texto-secundario">{g}</p>
          <ul className="space-y-1">
            {CATALOGO.filter((w) => w.grupo === g).map((w) => {
              const instancias = ativos.filter((x) => x.tipo === w.id);
              const presente = instancias.length > 0;
              return (
                <li key={w.id}>
                  <button
                    onClick={() => (w.multiplo || !presente ? adicionar(w.id) : remover(instancias[0].i))}
                    aria-pressed={presente}
                    title={w.multiplo ? "Clique para adicionar (pode ter vários)" : presente ? "Clique para tirar do painel" : "Clique para adicionar"}
                    className={`flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${presente ? "border-primaria/60 bg-primaria/10" : "border-borda hover:border-primaria/50"}`}
                  >
                    <span className={`mt-0.5 flex h-4 min-w-4 shrink-0 items-center justify-center rounded border px-0.5 text-[9px] font-bold ${presente ? "border-primaria bg-primaria text-white" : "border-borda"}`}>{presente ? (w.multiplo ? instancias.length : <Check size={11} />) : <Plus size={10} className="text-texto-secundario" />}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm text-texto-primario">{w.rotulo}{w.novo && <span className="rounded bg-primaria/20 px-1 text-[9px] font-semibold uppercase text-primaria">novo</span>}</span>
                      {!compacto && <span className="block text-[11px] text-texto-secundario">{w.descricao}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
