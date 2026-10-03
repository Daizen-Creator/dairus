import { create } from "zustand";
import { lerPreferencia, salvarPreferencia } from "../services/armazenamento";
import {
  LAYOUT_PADRAO,
  TAMANHOS_PADRAO,
  WIDGETS_PADRAO,
  mover,
  normalizarAtivos,
  normalizarLayout,
  normalizarTamanhos,
  type LayoutWidgets,
  type ModeloLayout,
  type Tamanho,
  type WidgetId,
} from "../features/dashboard/layoutWidgets";

/**
 * Widgets do Início: quais aparecem (na ordem), o tamanho de cada um e o layout da grade.
 * Compartilhado entre o Início, os próprios widgets e a aba "Widgets e layout" de Temas.
 * Preferências: widgets_inicio, widgets_tamanhos, widgets_layout (por conta).
 */
interface Estado {
  ativos: WidgetId[];
  tamanhos: Partial<Record<WidgetId, Tamanho>>;
  layout: LayoutWidgets;
  /** Modo "Editar layout" do Início (não é salvo). */
  editando: boolean;
  carregar: () => Promise<void>;
  setEditando: (v: boolean) => void;
  alternar: (id: WidgetId) => void;
  adicionar: (id: WidgetId) => void;
  remover: (id: WidgetId) => void;
  reordenar: (de: number, para: number) => void;
  tamanhoDe: (id: WidgetId) => Tamanho;
  definirTamanho: (id: WidgetId, t: Tamanho) => void;
  alterarLayout: (parte: Partial<LayoutWidgets>) => void;
  aplicarModelo: (m: ModeloLayout) => void;
  restaurar: () => void;
}

function salvar(chave: string, valor: unknown) {
  salvarPreferencia(chave, valor).catch(() => {
    // fica só na memória até a próxima mudança
  });
}

export const useWidgetsStore = create<Estado>((set, get) => ({
  ativos: WIDGETS_PADRAO,
  tamanhos: {},
  layout: LAYOUT_PADRAO,
  editando: false,

  carregar: async () => {
    const [ativos, tamanhos, largos, layout] = await Promise.all([
      lerPreferencia<unknown>("widgets_inicio"),
      lerPreferencia<unknown>("widgets_tamanhos"),
      lerPreferencia<unknown>("widgets_largos"),
      lerPreferencia<unknown>("widgets_layout"),
    ]);
    set({
      ativos: ativos === null ? [...WIDGETS_PADRAO] : normalizarAtivos(ativos),
      tamanhos: normalizarTamanhos(tamanhos, tamanhos === null ? largos : undefined),
      layout: normalizarLayout(layout),
    });
  },

  setEditando: (v) => set({ editando: v }),

  alternar: (id) => (get().ativos.includes(id) ? get().remover(id) : get().adicionar(id)),
  adicionar: (id) => {
    if (get().ativos.includes(id)) return;
    const ativos = [...get().ativos, id];
    set({ ativos });
    salvar("widgets_inicio", ativos);
  },
  remover: (id) => {
    const ativos = get().ativos.filter((x) => x !== id);
    set({ ativos });
    salvar("widgets_inicio", ativos);
  },
  reordenar: (de, para) => {
    const ativos = mover(get().ativos, de, para);
    set({ ativos });
    salvar("widgets_inicio", ativos);
  },

  tamanhoDe: (id) => get().tamanhos[id] ?? TAMANHOS_PADRAO[id] ?? 1,
  definirTamanho: (id, t) => {
    const tamanhos = { ...get().tamanhos, [id]: t };
    set({ tamanhos });
    salvar("widgets_tamanhos", tamanhos);
  },

  alterarLayout: (parte) => {
    const layout = normalizarLayout({ ...get().layout, ...parte });
    set({ layout });
    salvar("widgets_layout", layout);
  },

  aplicarModelo: (m) => {
    set({ ativos: [...m.widgets], tamanhos: { ...m.tamanhos }, layout: { ...m.layout } });
    salvar("widgets_inicio", m.widgets);
    salvar("widgets_tamanhos", m.tamanhos);
    salvar("widgets_layout", m.layout);
  },

  restaurar: () => {
    set({ ativos: [...WIDGETS_PADRAO], tamanhos: {}, layout: { ...LAYOUT_PADRAO } });
    salvar("widgets_inicio", WIDGETS_PADRAO);
    salvar("widgets_tamanhos", {});
    salvar("widgets_layout", LAYOUT_PADRAO);
  },
}));
