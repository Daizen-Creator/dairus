import { useMemo } from "react";
import ReactGridLayout, { noCompactor, useContainerWidth, verticalCompactor, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Copy, Move, Settings2, X } from "lucide-react";
import { useWidgetsStore } from "../../../state/widgets-store";
import { ALTURA_LINHA, COLUNAS, MARGEM, emOrdemDeLeitura, infoDoWidget, type Painel, type WidgetNoPainel } from "../layoutWidgets";
import { ContextoInstancia } from "./contexto";

/** Abaixo desta largura os widgets ficam um embaixo do outro (sem grade). */
const LARGURA_EMPILHAR = 640;

interface Props {
  painel: Painel;
  editando: boolean;
  conteudo: (w: WidgetNoPainel) => React.ReactNode;
  onConfigurar: (w: WidgetNoPainel) => void;
}

/** Barra do widget no modo de edição: mover, configurar, duplicar e remover. */
function BarraDeEdicao({ w, onConfigurar }: { w: WidgetNoPainel; onConfigurar: () => void }) {
  const remover = useWidgetsStore((s) => s.remover);
  const duplicar = useWidgetsStore((s) => s.duplicarWidget);
  const info = infoDoWidget(w.tipo);
  const botao = "nao-arrastar rounded-full p-1 text-texto-secundario hover:bg-borda/60 hover:text-texto-primario";
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-3 z-30 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-primaria/50 bg-superficie px-1.5 py-0.5 shadow-lg">
        <span className="flex cursor-grab items-center gap-1 px-1 text-[10px] text-texto-secundario active:cursor-grabbing" title="Arraste o card para mover; puxe a borda ou o canto para mudar o tamanho"><Move size={11} /> {w.w}×{w.h}</span>
        <button type="button" onClick={onConfigurar} aria-label={`Configurar ${info.rotulo}`} title="Configurar" className={botao}><Settings2 size={12} /></button>
        {info.multiplo && <button type="button" onClick={() => duplicar(w.i)} aria-label={`Duplicar ${info.rotulo}`} title="Duplicar" className={botao}><Copy size={12} /></button>}
        <button type="button" onClick={() => remover(w.i)} aria-label={`Remover ${info.rotulo}`} title="Remover" className={`${botao} hover:text-erro`}><X size={12} /></button>
      </div>
    </div>
  );
}

/** Grade livre do Início: arrastar para qualquer lugar e redimensionar pelas bordas (12 colunas). */
export function GradePainel({ painel, editando, conteudo, onConfigurar }: Props) {
  const { width, containerRef, mounted } = useContainerWidth();
  const atualizarPosicoes = useWidgetsStore((s) => s.atualizarPosicoes);
  const configurar = useWidgetsStore((s) => s.configurar);
  const margem = MARGEM[painel.opcoes.espaco];

  const layout: Layout = useMemo(
    () =>
      painel.widgets.map((w) => {
        const info = infoDoWidget(w.tipo);
        return { i: w.i, x: w.x, y: w.y, w: w.w, h: w.h, minW: info.minW ?? 2, minH: info.minH ?? 3, maxW: COLUNAS };
      }),
    [painel.widgets],
  );

  const item = (w: WidgetNoPainel, altura?: number) => (
    <ContextoInstancia.Provider value={{ i: w.i, config: w.config ?? {}, configurar: (c) => configurar(w.i, c) }}>
      <div className={`relative h-full ${editando ? "rounded-xl outline-2 outline-offset-2 outline-dashed outline-primaria/60" : ""}`} style={altura ? { height: altura } : undefined}>
        {editando && <BarraDeEdicao w={w} onConfigurar={() => onConfigurar(w)} />}
        <div className={`h-full ${editando ? "pointer-events-none select-none" : ""}`}>{conteudo(w)}</div>
      </div>
    </ContextoInstancia.Provider>
  );

  return (
    <div ref={containerRef} className={editando ? "painel-editando" : undefined}>
      {mounted && width > 0 && width < LARGURA_EMPILHAR ? (
        // Tela estreita: um embaixo do outro, na ordem de leitura, com a altura escolhida.
        <div className="space-y-3">
          {emOrdemDeLeitura(painel.widgets).map((w) => <div key={w.i}>{item(w, w.h * ALTURA_LINHA + (w.h - 1) * margem)}</div>)}
        </div>
      ) : (
        mounted && (
          <ReactGridLayout
            width={width}
            layout={layout}
            gridConfig={{ cols: COLUNAS, rowHeight: ALTURA_LINHA, margin: [margem, margem], containerPadding: [0, editando ? 14 : 0] }}
            dragConfig={{ enabled: editando, cancel: ".nao-arrastar", threshold: 4 }}
            resizeConfig={{ enabled: editando, handles: ["se", "sw", "e", "w", "s"] }}
            compactor={painel.opcoes.compactar ? verticalCompactor : noCompactor}
            onLayoutChange={(novo) => editando && atualizarPosicoes(novo)}
          >
            {painel.widgets.map((w) => <div key={w.i}>{item(w)}</div>)}
          </ReactGridLayout>
        )
      )}
    </div>
  );
}
