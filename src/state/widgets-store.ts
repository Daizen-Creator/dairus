import { create } from "zustand";
import { toast } from "sonner";
import { lerPreferencia } from "../services/armazenamento";
import { dashboards } from "../services/dashboards";
import {
  MODELOS,
  OPCOES_PADRAO,
  criarWidget,
  daGrade,
  daLateral,
  lugarLivre,
  migrarFormatoAntigo,
  normalizarOpcoes,
  normalizarWidgets,
  widgetsDoModelo,
  type ConfigWidget,
  type ModeloPainel,
  type OpcoesPainel,
  type Painel,
  type WidgetId,
  type WidgetNoPainel,
} from "../features/dashboard/layoutWidgets";

/**
 * Painéis (layouts) do Início: vários por conta, um ativo. Cada widget tem posição e
 * tamanho livres (x, y, w, h numa grade de 12 colunas) e a sua configuração.
 * Fica no banco da conta (comandos *_dashboard); as mudanças são gravadas com um
 * pequeno atraso para não salvar a cada pixel arrastado.
 */
interface Estado {
  paineis: Painel[];
  ativoId: string | null;
  carregado: boolean;
  /** Modo "Editar layout" do Início (não é salvo). */
  editando: boolean;
  /** Widget com a janela de configuração aberta (não é salvo). */
  configurando: string | null;
  setConfigurando: (i: string | null) => void;
  /** Leva o widget para a coluna lateral do Início (no fim da lista). */
  paraLateral: (i: string) => void;
  /** Devolve o widget da lateral para a grade, no primeiro lugar livre. */
  paraGrade: (i: string) => void;
  /** Sobe (-1) ou desce (+1) um widget dentro da coluna lateral. */
  moverNaLateral: (i: string, direcao: -1 | 1) => void;
  carregar: () => Promise<void>;
  setEditando: (v: boolean) => void;
  ativar: (id: string) => Promise<void>;
  criar: (nome: string, origem?: { modelo?: ModeloPainel; copiarDe?: Painel }) => Promise<void>;
  renomear: (id: string, nome: string) => void;
  excluir: (id: string) => Promise<void>;
  aplicarModelo: (m: ModeloPainel) => void;
  adicionar: (tipo: WidgetId, config?: ConfigWidget) => void;
  remover: (i: string) => void;
  duplicarWidget: (i: string) => void;
  atualizarPosicoes: (posicoes: ReadonlyArray<{ i: string; x: number; y: number; w: number; h: number }>) => void;
  configurar: (i: string, config: ConfigWidget) => void;
  alterarOpcoes: (parte: Partial<OpcoesPainel>) => void;
}

const ATRASO_SALVAR = 500;
const timers = new Map<string, number>();
/** Uma carga por vez: duas telas (ou o modo estrito do React) pedindo juntas não criam dois painéis. */
let cargaEmAndamento: Promise<void> | null = null;
const novoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `p${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

function normalizarPainel(p: Painel): Painel {
  return { ...p, opcoes: normalizarOpcoes(p.opcoes), widgets: normalizarWidgets(p.widgets) };
}

/** Painel inicial de quem ainda não tem nenhum: converte o formato antigo das preferências. */
async function painelInicial(): Promise<Painel> {
  const [ativos, tamanhos, largos, layout] = await Promise.all([
    lerPreferencia<unknown>("widgets_inicio"),
    lerPreferencia<unknown>("widgets_tamanhos"),
    lerPreferencia<unknown>("widgets_largos"),
    lerPreferencia<unknown>("widgets_layout"),
  ]);
  const { widgets, opcoes } = migrarFormatoAntigo(ativos ?? undefined, tamanhos, largos, layout);
  return { id: novoId(), nome: "Visão geral", ordem: 0, ativo: true, opcoes, widgets };
}

export const useWidgetsStore = create<Estado>((set, get) => {
  const ativo = () => get().paineis.find((p) => p.id === get().ativoId) ?? null;

  async function gravarAgora(id: string) {
    const p = get().paineis.find((x) => x.id === id);
    if (!p) return;
    try {
      await dashboards.salvar(p);
    } catch (e) {
      toast.error(`Não foi possível salvar o layout: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function gravar(id: string) {
    window.clearTimeout(timers.get(id));
    timers.set(id, window.setTimeout(() => {
      timers.delete(id);
      gravarAgora(id);
    }, ATRASO_SALVAR));
  }

  /** Altera o painel ativo e agenda a gravação. */
  function alterarAtivo(f: (p: Painel) => Painel) {
    const atual = ativo();
    if (!atual) return;
    const novo = f(atual);
    if (novo === atual) return;
    set({ paineis: get().paineis.map((p) => (p.id === atual.id ? novo : p)) });
    gravar(atual.id);
  }


  async function carregarDoBanco() {
    let lista: Painel[];
    try {
      lista = (await dashboards.listar()).map(normalizarPainel);
      if (lista.length === 0) {
        const inicial = await painelInicial();
        lista = [normalizarPainel(await dashboards.salvar(inicial).catch(() => inicial))];
      }
    } catch {
      // Fora do app (navegador sem o backend): um painel só na memória.
      lista = [await painelInicial()];
    }
    const ativoId = (lista.find((p) => p.ativo) ?? lista[0]).id;
    set({ paineis: lista, ativoId, carregado: true });
  }

  return {
    paineis: [],
    ativoId: null,
    carregado: false,
    editando: false,
    configurando: null,
    setConfigurando: (i) => set({ configurando: i }),

    paraLateral: (i) =>
      alterarAtivo((p) => {
        const ordem = daLateral(p.widgets).length;
        return { ...p, widgets: p.widgets.map((w) => (w.i === i ? { ...w, y: ordem, config: { ...w.config, lateral: true } } : w)) };
      }),

    paraGrade: (i) =>
      alterarAtivo((p) => {
        const w = p.widgets.find((x) => x.i === i);
        if (!w) return p;
        const lugar = lugarLivre(daGrade(p.widgets), w.w, w.h);
        const config = { ...w.config };
        delete config.lateral;
        return { ...p, widgets: p.widgets.map((x) => (x.i === i ? { ...x, ...lugar, config } : x)) };
      }),

    moverNaLateral: (i, direcao) =>
      alterarAtivo((p) => {
        const lista = daLateral(p.widgets);
        const de = lista.findIndex((w) => w.i === i);
        const para = de + direcao;
        if (de < 0 || para < 0 || para >= lista.length) return p;
        [lista[de], lista[para]] = [lista[para], lista[de]];
        const ordem = new Map(lista.map((w, n) => [w.i, n]));
        return { ...p, widgets: p.widgets.map((w) => (ordem.has(w.i) ? { ...w, y: ordem.get(w.i)! } : w)) };
      }),

    carregar: () => {
      cargaEmAndamento ??= carregarDoBanco().finally(() => {
        cargaEmAndamento = null;
      });
      return cargaEmAndamento;
    },

    setEditando: (v) => {
      set({ editando: v });
      // Ao concluir, grava na hora o que estiver pendente.
      if (!v) for (const [id, t] of [...timers]) { window.clearTimeout(t); timers.delete(id); gravarAgora(id); }
    },

    ativar: async (id) => {
      if (!get().paineis.some((p) => p.id === id)) return;
      set({ ativoId: id, paineis: get().paineis.map((p) => ({ ...p, ativo: p.id === id })) });
      await dashboards.ativar(id).catch(() => {});
    },

    criar: async (nome, origem) => {
      const base = origem?.copiarDe;
      const novo: Painel = {
        id: novoId(),
        nome: nome.trim().slice(0, 60) || "Novo layout",
        ordem: get().paineis.reduce((m, p) => Math.max(m, p.ordem), 0) + 1,
        ativo: false,
        opcoes: base ? { ...base.opcoes } : normalizarOpcoes({ ...OPCOES_PADRAO, ...origem?.modelo?.opcoes }),
        widgets: base ? base.widgets.map((w) => ({ ...w, config: w.config ? structuredClone(w.config) : undefined })) : origem?.modelo ? widgetsDoModelo(origem.modelo) : [],
      };
      try {
        const salvo = normalizarPainel(await dashboards.salvar(novo));
        set({ paineis: [...get().paineis, salvo] });
        await get().ativar(salvo.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    },

    renomear: (id, nome) => {
      const limpo = nome.trim().slice(0, 60);
      if (!limpo) return;
      set({ paineis: get().paineis.map((p) => (p.id === id ? { ...p, nome: limpo } : p)) });
      gravar(id);
    },

    excluir: async (id) => {
      try {
        await dashboards.excluir(id);
        const resto = get().paineis.filter((p) => p.id !== id);
        const ativoId = get().ativoId === id ? resto[0]?.id ?? null : get().ativoId;
        set({ paineis: resto.map((p) => ({ ...p, ativo: p.id === ativoId })), ativoId });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    },

    aplicarModelo: (m) => alterarAtivo((p) => ({ ...p, widgets: widgetsDoModelo(m), opcoes: normalizarOpcoes({ ...p.opcoes, ...m.opcoes }) })),

    adicionar: (tipo, config) => alterarAtivo((p) => ({ ...p, widgets: [...p.widgets, criarWidget(daGrade(p.widgets), tipo, config)] })),

    remover: (i) => alterarAtivo((p) => ({ ...p, widgets: p.widgets.filter((w) => w.i !== i) })),

    duplicarWidget: (i) =>
      alterarAtivo((p) => {
        const w = p.widgets.find((x) => x.i === i);
        if (!w) return p;
        const config = w.config ? structuredClone(w.config) : undefined;
        if (config) delete config.lateral;
        return { ...p, widgets: [...p.widgets, criarWidget(daGrade(p.widgets), w.tipo, config, { w: w.w, h: w.h })] };
      }),

    atualizarPosicoes: (posicoes) =>
      alterarAtivo((p) => {
        const mapa = new Map(posicoes.map((x) => [x.i, x]));
        let mudou = false;
        const widgets: WidgetNoPainel[] = p.widgets.map((w) => {
          const n = mapa.get(w.i);
          if (!n || (n.x === w.x && n.y === w.y && n.w === w.w && n.h === w.h)) return w;
          mudou = true;
          return { ...w, x: n.x, y: n.y, w: n.w, h: n.h };
        });
        return mudou ? { ...p, widgets } : p;
      }),

    configurar: (i, config) => alterarAtivo((p) => ({ ...p, widgets: p.widgets.map((w) => (w.i === i ? { ...w, config } : w)) })),

    alterarOpcoes: (parte) => alterarAtivo((p) => ({ ...p, opcoes: normalizarOpcoes({ ...p.opcoes, ...parte }) })),
  };
});

/** O painel ativo (ou null enquanto carrega). */
export const usePainelAtivo = () => useWidgetsStore((s) => s.paineis.find((p) => p.id === s.ativoId) ?? null);

export { MODELOS };
