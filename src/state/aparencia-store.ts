import { create } from "zustand";
import { lerPreferencia, salvarPreferencia } from "../services/armazenamento";
import {
  APARENCIA_PADRAO,
  FONTES,
  PREDEFINICOES,
  classesHtml,
  mesclar,
  normalizarAparencia,
  variaveisCss,
  type Aparencia,
  type ParcialProfunda,
} from "../features/aparencia/aparencia";
import { definirCorPrimaria, useThemeStore } from "./theme-store";

const CHAVE = "aparencia";
const MAX_HISTORICO = 40;

export type EstadoNuvem = "so-local" | "salvando" | "salvo" | "erro";

/** Aplica a aparência no documento: só variáveis CSS e classes, sem recarregar nada. */
export function aplicarAparencia(a: Aparencia): void {
  if (typeof document === "undefined") return;
  const raiz = document.documentElement;
  for (const [k, v] of Object.entries(variaveisCss(a))) raiz.style.setProperty(k, v);
  for (const [classe, ligada] of Object.entries(classesHtml(a))) raiz.classList.toggle(classe, ligada);
  raiz.style.setProperty("--tamanho-fonte", `${a.tipografia.tamanho}%`);
  raiz.dataset.menuLayout = a.menu.layout;
  raiz.dataset.menuModo = a.menu.modo;
  const fonte = FONTES.find((f) => f.id === a.tipografia.fonte);
  fonte?.carregar?.().catch(() => {
    // fonte embutida não carregou: o navegador usa a próxima da lista
  });
}

let timerLocal: number | undefined;
let timerNuvem: number | undefined;

interface Estado {
  aparencia: Aparencia;
  carregado: boolean;
  historico: Aparencia[];
  nuvem: EstadoNuvem;
  /** Cor média medida da imagem/vídeo de fundo (para o alerta de contraste). */
  mediaMidia: [number, number, number] | null;
  definirMediaMidia: (rgb: [number, number, number] | null) => void;
  /** Menu em modo gaveta: aberto agora? (não é salvo). */
  gavetaAberta: boolean;
  alternarGaveta: (aberta?: boolean) => void;
  inicializar: () => Promise<void>;
  alterar: (parte: ParcialProfunda<Aparencia>, opcoes?: { semHistorico?: boolean; preset?: string | null }) => void;
  desfazer: () => void;
  aplicarPredefinicao: (id: string) => Promise<void>;
  restaurarPadrao: () => Promise<void>;
  importar: (json: string) => void;
  exportar: () => string;
  sincronizarAgora: () => Promise<void>;
}

async function enviarParaNuvem(a: Aparencia): Promise<boolean> {
  try {
    const { supabase } = await import("../services/supabase");
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return false;
    const { error } = await supabase.from("preferencias_aparencia").upsert({ user_id: uid, dados: a, atualizado_em: a.atualizadoEm });
    return !error;
  } catch {
    return false;
  }
}

async function baixarDaNuvem(): Promise<Aparencia | null> {
  try {
    const { supabase } = await import("../services/supabase");
    const { data: sessao } = await supabase.auth.getSession();
    const uid = sessao.session?.user.id;
    if (!uid) return null;
    const { data, error } = await supabase.from("preferencias_aparencia").select("dados").eq("user_id", uid).maybeSingle();
    if (error || !data) return null;
    return normalizarAparencia((data as { dados: unknown }).dados);
  } catch {
    return null;
  }
}

export const useAparenciaStore = create<Estado>((set, get) => {
  function gravar(a: Aparencia) {
    window.clearTimeout(timerLocal);
    window.clearTimeout(timerNuvem);
    timerLocal = window.setTimeout(() => salvarPreferencia(CHAVE, a), 300);
    set({ nuvem: "salvando" });
    timerNuvem = window.setTimeout(async () => {
      set({ nuvem: (await enviarParaNuvem(get().aparencia)) ? "salvo" : "so-local" });
    }, 2500);
  }

  function trocar(nova: Aparencia, semHistorico = false) {
    const anterior = get().aparencia;
    const final = { ...nova, atualizadoEm: new Date().toISOString() };
    set({ aparencia: final, historico: semHistorico ? get().historico : [...get().historico, anterior].slice(-MAX_HISTORICO) });
    aplicarAparencia(final);
    gravar(final);
  }

  return {
    aparencia: APARENCIA_PADRAO,
    carregado: false,
    historico: [],
    nuvem: "so-local",
    mediaMidia: null,
    definirMediaMidia: (rgb) => set({ mediaMidia: rgb }),
    gavetaAberta: false,
    alternarGaveta: (aberta) => set({ gavetaAberta: aberta ?? !get().gavetaAberta }),

    async inicializar() {
      let salva = await lerPreferencia<unknown>(CHAVE);
      if (!salva) {
        // Migra as preferências antigas (tamanho do texto da tela de Configurações).
        const tamanho = await lerPreferencia<number>("ui_fonte");
        const recolhido = await lerPreferencia<boolean>("sidebar_recolhido");
        salva = { tipografia: { tamanho: tamanho ?? 100 }, menu: { modo: recolhido ? "recolhido" : "fixo" } };
      }
      const local = normalizarAparencia(salva);
      set({ aparencia: local, carregado: true, historico: [] });
      aplicarAparencia(local);
      // A da nuvem vale se for mais nova (mudou em outro computador).
      const remota = await baixarDaNuvem();
      if (remota && Date.parse(remota.atualizadoEm) > Date.parse(local.atualizadoEm)) {
        set({ aparencia: remota, nuvem: "salvo" });
        aplicarAparencia(remota);
        await salvarPreferencia(CHAVE, remota);
      } else if (remota) {
        set({ nuvem: "salvo" });
      }
    },

    alterar(parte, opcoes) {
      const base = get().aparencia;
      trocar({ ...mesclar(base, parte), preset: opcoes?.preset !== undefined ? opcoes.preset : null }, opcoes?.semHistorico);
    },

    desfazer() {
      const h = get().historico;
      const anterior = h[h.length - 1];
      if (!anterior) return;
      set({ historico: h.slice(0, -1) });
      trocar(anterior, true);
    },

    async aplicarPredefinicao(id) {
      const p = PREDEFINICOES.find((x) => x.id === id);
      if (!p) return;
      await useThemeStore.getState().selecionarTema(p.temaId);
      definirCorPrimaria(p.corDestaque);
      await salvarPreferencia("cor_primaria_custom", p.corDestaque ?? "");
      trocar({ ...mesclar(APARENCIA_PADRAO, p.aparencia), menu: { ...mesclar(APARENCIA_PADRAO.menu, p.aparencia.menu ?? {}), ordem: get().aparencia.menu.ordem }, preset: p.id });
    },

    async restaurarPadrao() {
      await useThemeStore.getState().selecionarTema("noite-urbana");
      definirCorPrimaria(null);
      await salvarPreferencia("cor_primaria_custom", "");
      await salvarPreferencia("ui_fonte_familia", "");
      await salvarPreferencia("menu_oculto", []);
      trocar({ ...APARENCIA_PADRAO, preset: "padrao" });
    },

    importar(json) {
      let dados: unknown;
      try {
        dados = JSON.parse(json);
      } catch {
        throw new Error("Arquivo inválido: não é um JSON de aparência do Dairus.");
      }
      trocar(normalizarAparencia(dados));
    },

    exportar() {
      return JSON.stringify(get().aparencia, null, 2);
    },

    async sincronizarAgora() {
      set({ nuvem: "salvando" });
      set({ nuvem: (await enviarParaNuvem(get().aparencia)) ? "salvo" : "erro" });
    },
  };
});
