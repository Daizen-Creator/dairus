import { useEffect } from "react";
import { Link } from "react-router-dom";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ExternalLink, GripVertical, LayoutGrid, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { useWidgetsStore } from "../../state/widgets-store";
import { CatalogoWidgets } from "../dashboard/WidgetsInicio";
import { MODELOS, colunasDoTamanho, infoDoWidget, type LayoutWidgets, type ModeloLayout, type Tamanho, type WidgetId } from "../dashboard/layoutWidgets";

function Bloco({ titulo, descricao, children, acao }: { titulo: string; descricao?: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-borda bg-cartao p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-texto-primario">{titulo}</h2>
          {descricao && <p className="text-xs text-texto-secundario">{descricao}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Opcoes<T extends string | number>({ valor, opcoes, onChange, rotulo }: { valor: T; opcoes: Array<{ v: T; r: string }>; onChange: (v: T) => void; rotulo: string }) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="inline-flex rounded-lg border border-borda p-0.5">
      {opcoes.map((o) => (
        <button key={String(o.v)} role="radio" aria-checked={valor === o.v} onClick={() => onChange(o.v)} className={`rounded-md px-3 py-1 text-xs ${valor === o.v ? "bg-primaria text-white" : "text-texto-secundario hover:text-texto-primario"}`}>{o.r}</button>
      ))}
    </div>
  );
}

/** Desenho do layout: cada widget vira um bloco com a largura que ocupa. */
function Previa({ widgets, tamanho, layout, mini = false }: { widgets: WidgetId[]; tamanho: (id: WidgetId) => Tamanho; layout: LayoutWidgets; mini?: boolean }) {
  const gap = { compacto: 3, normal: 5, amplo: 9 }[layout.espaco] * (mini ? 0.6 : 1);
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${layout.colunas}, minmax(0, 1fr))`, gap }} aria-hidden>
      {widgets.map((id) => (
        <div key={id} title={infoDoWidget(id).rotulo} className={`truncate rounded border border-primaria/40 bg-primaria/15 text-texto-secundario ${mini ? "h-4 px-1 text-[8px] leading-4" : "h-11 px-1.5 py-1 text-[10px]"}`} style={{ gridColumn: `span ${colunasDoTamanho(tamanho(id), layout.colunas)}` }}>
          {mini ? "" : infoDoWidget(id).rotulo}
        </div>
      ))}
    </div>
  );
}

function LinhaOrdenavel({ id, indice, total }: { id: WidgetId; indice: number; total: number }) {
  const { tamanhoDe, definirTamanho, reordenar, remover, layout } = useWidgetsStore();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const tamanho = tamanhoDe(id);
  const info = infoDoWidget(id);
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={`flex items-center gap-2 rounded-lg border bg-fundo px-2 py-1.5 text-sm ${isDragging ? "z-10 border-primaria shadow-lg" : "border-borda"}`}>
      <button ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Arrastar ${info.rotulo}`} className="cursor-grab text-texto-secundario hover:text-primaria active:cursor-grabbing"><GripVertical size={14} /></button>
      <span className="w-5 text-right text-[11px] tabular-nums text-texto-secundario">{indice + 1}</span>
      <span className="min-w-0 flex-1 truncate text-texto-primario">{info.rotulo}</span>
      <Opcoes rotulo={`Tamanho de ${info.rotulo}`} valor={tamanho} onChange={(t) => definirTamanho(id, t)} opcoes={([1, 2, 3] as Tamanho[]).filter((t) => t <= layout.colunas).map((t) => ({ v: t, r: ["P", "M", "G"][t - 1] }))} />
      <button onClick={() => reordenar(indice, indice - 1)} disabled={indice === 0} aria-label={`Subir ${info.rotulo}`} className="rounded p-1 text-texto-secundario hover:text-texto-primario disabled:opacity-30"><ArrowUp size={13} /></button>
      <button onClick={() => reordenar(indice, indice + 1)} disabled={indice === total - 1} aria-label={`Descer ${info.rotulo}`} className="rounded p-1 text-texto-secundario hover:text-texto-primario disabled:opacity-30"><ArrowDown size={13} /></button>
      <button onClick={() => remover(id)} aria-label={`Remover ${info.rotulo}`} className="rounded p-1 text-texto-secundario hover:text-erro"><X size={13} /></button>
    </li>
  );
}

/** Aba "Widgets e layout" de Temas e aparência: o Início do seu jeito. */
export function PainelWidgets() {
  const { ativos, layout, carregar, alterarLayout, reordenar, aplicarModelo, restaurar, tamanhoDe } = useWidgetsStore();
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => {
    carregar();
  }, [carregar]);

  const aoSoltar = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    reordenar(ativos.indexOf(e.active.id as WidgetId), ativos.indexOf(e.over.id as WidgetId));
  };

  const aplicar = (m: ModeloLayout) => {
    aplicarModelo(m);
    toast.success(`Layout “${m.nome}” aplicado no Início.`);
  };

  return (
    <div className="space-y-4">
      <Bloco
        titulo="Modelos prontos"
        descricao="Um clique troca os widgets, a ordem e a grade. Depois dá para ajustar à vontade."
        acao={<Link to="/" className="inline-flex items-center gap-1 text-xs text-primaria hover:underline"><ExternalLink size={12} /> Ver no Início</Link>}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {MODELOS.map((m) => (
            <button key={m.id} onClick={() => aplicar(m)} className="rounded-xl border border-borda bg-fundo p-3 text-left transition-colors hover:border-primaria">
              <Previa widgets={m.widgets} tamanho={(id) => m.tamanhos[id] ?? 1} layout={m.layout} mini />
              <p className="mt-2 text-sm font-semibold text-texto-primario">{m.nome}</p>
              <p className="text-[11px] text-texto-secundario">{m.descricao}</p>
            </button>
          ))}
        </div>
      </Bloco>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Bloco
          titulo="Ordem e tamanho"
          descricao="Arraste pela alça (ou use as setas). P = 1 coluna, M = 2, G = a linha inteira."
          acao={<Button tamanho="pequeno" variante="fantasma" onClick={() => { restaurar(); toast.success("Layout do Início restaurado."); }}><RotateCcw size={13} /> Restaurar padrão</Button>}
        >
          {ativos.length === 0 ? (
            <p className="text-sm text-texto-secundario">Nenhum widget no Início. Escolha alguns abaixo.</p>
          ) : (
            <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
              <SortableContext items={ativos} strategy={verticalListSortingStrategy}>
                <ul className="space-y-1.5">{ativos.map((id, i) => <LinhaOrdenavel key={id} id={id} indice={i} total={ativos.length} />)}</ul>
              </SortableContext>
            </DndContext>
          )}
        </Bloco>

        <Bloco titulo="Grade" descricao="Como os widgets se arrumam na tela.">
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-texto-primario">Colunas (tela larga)</span><Opcoes rotulo="Colunas" valor={layout.colunas} onChange={(v) => alterarLayout({ colunas: v })} opcoes={[{ v: 2, r: "2" }, { v: 3, r: "3" }, { v: 4, r: "4" }]} /></div>
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-texto-primario">Espaço entre widgets</span><Opcoes rotulo="Espaço entre widgets" valor={layout.espaco} onChange={(v) => alterarLayout({ espaco: v })} opcoes={[{ v: "compacto", r: "Compacto" }, { v: "normal", r: "Normal" }, { v: "amplo", r: "Amplo" }]} /></div>
            <label className="flex items-center justify-between gap-2 text-texto-primario">Mostrar o título “Meus widgets”<input type="checkbox" checked={layout.titulo} onChange={() => alterarLayout({ titulo: !layout.titulo })} className="h-4 w-4 accent-[var(--cor-primaria)]" /></label>
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-xs text-texto-secundario"><LayoutGrid size={12} /> Prévia</p>
              <div className="rounded-lg border border-borda bg-fundo p-2">{ativos.length ? <Previa widgets={ativos} tamanho={tamanhoDe} layout={layout} /> : <p className="text-xs text-texto-secundario">Vazio</p>}</div>
            </div>
          </div>
        </Bloco>
      </div>

      <Bloco titulo={`Widgets (${ativos.length} no Início)`} descricao="Clique para mostrar ou esconder. Os novos aparecem no fim da lista.">
        <CatalogoWidgets />
      </Bloco>
    </div>
  );
}
