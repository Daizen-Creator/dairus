import { create } from "zustand";
import temasCatalogo from "../styles/themes.json";
import { lerPreferencia, salvarPreferencia } from "../services/armazenamento";
import type { Tema } from "../types/theme";

const CATALOGO = temasCatalogo as Tema[];

const CHAVE_TEMA_ID = "tema_selecionado_id";
const CHAVE_MODO_AUTO = "tema_modo_automatico";
const CHAVE_PREFERIDO_CLARO = "tema_preferido_claro_id";
const CHAVE_PREFERIDO_ESCURO = "tema_preferido_escuro_id";
const CHAVE_FAVORITOS = "temas_favoritos";
const CHAVE_PERSONALIZADOS = "temas_personalizados";

const TEMA_CLARO_PADRAO = "papel";
const TEMA_ESCURO_PADRAO = "noite-urbana";
// Tema que a aplicação abre pela primeira vez, antes de o usuário escolher
// qualquer coisa na tela de Temas — escuro/neon, como o design de referência.
const TEMA_PADRAO_INICIAL = TEMA_ESCURO_PADRAO;

function aplicarVariaveisCss(tema: Tema) {
  const raiz = document.documentElement;
  const c = tema.cores;
  raiz.style.setProperty("--cor-fundo", c.fundo);
  raiz.style.setProperty("--cor-superficie", c.superficie);
  raiz.style.setProperty("--cor-cartao", c.cartao);
  raiz.style.setProperty("--cor-primaria", c.primaria);
  raiz.style.setProperty("--cor-primaria-texto", c.primariaTexto);
  raiz.style.setProperty("--cor-secundaria", c.secundaria);
  raiz.style.setProperty("--cor-secundaria-texto", c.secundariaTexto);
  raiz.style.setProperty("--cor-texto-primario", c.textoPrimario);
  raiz.style.setProperty("--cor-texto-secundario", c.textoSecundario);
  raiz.style.setProperty("--cor-borda", c.borda);
  raiz.style.setProperty("--cor-sucesso", c.sucesso);
  raiz.style.setProperty("--cor-alerta", c.alerta);
  raiz.style.setProperty("--cor-erro", c.erro);
  raiz.style.setProperty("--cor-destaque", c.destaque);
  raiz.style.setProperty("--cor-sombra", c.sombra);
  c.grafico.forEach((cor, i) => raiz.style.setProperty(`--cor-grafico-${i + 1}`, cor));
  raiz.setAttribute("data-modo-base", tema.modoBase);
  raiz.setAttribute("data-tema-id", tema.id);
}

interface EstadoTema {
  catalogo: Tema[];
  personalizados: Tema[];
  favoritos: string[];
  temaSelecionadoId: string;
  modoAutomatico: boolean;
  temaPreferidoClaroId: string;
  temaPreferidoEscuroId: string;
  carregado: boolean;

  todosOsTemas: () => Tema[];
  temaAtivo: () => Tema;
  inicializar: () => Promise<void>;
  selecionarTema: (id: string) => Promise<void>;
  alternarModoAutomatico: (ativo: boolean) => Promise<void>;
  alternarFavorito: (id: string) => Promise<void>;
  salvarTemaPersonalizado: (tema: Tema) => Promise<void>;
  removerTemaPersonalizado: (id: string) => Promise<void>;
}

function resolverPorPreferenciaDoSistema(claroId: string, escuroId: string): string {
  const prefereDark =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return prefereDark ? escuroId : claroId;
}

export const useThemeStore = create<EstadoTema>((set, get) => ({
  catalogo: CATALOGO,
  personalizados: [],
  favoritos: [],
  temaSelecionadoId: TEMA_PADRAO_INICIAL,
  modoAutomatico: false,
  temaPreferidoClaroId: TEMA_CLARO_PADRAO,
  temaPreferidoEscuroId: TEMA_ESCURO_PADRAO,
  carregado: false,

  todosOsTemas: () => [...get().catalogo, ...get().personalizados],

  temaAtivo: () => {
    const estado = get();
    const todos = estado.todosOsTemas();
    const idAtivo = estado.modoAutomatico
      ? resolverPorPreferenciaDoSistema(estado.temaPreferidoClaroId, estado.temaPreferidoEscuroId)
      : estado.temaSelecionadoId;
    return todos.find((t) => t.id === idAtivo) ?? todos[0];
  },

  inicializar: async () => {
    const [temaId, modoAuto, preferidoClaro, preferidoEscuro, favoritos, personalizados] =
      await Promise.all([
        lerPreferencia<string>(CHAVE_TEMA_ID),
        lerPreferencia<boolean>(CHAVE_MODO_AUTO),
        lerPreferencia<string>(CHAVE_PREFERIDO_CLARO),
        lerPreferencia<string>(CHAVE_PREFERIDO_ESCURO),
        lerPreferencia<string[]>(CHAVE_FAVORITOS),
        lerPreferencia<Tema[]>(CHAVE_PERSONALIZADOS),
      ]);

    set({
      temaSelecionadoId: temaId ?? TEMA_PADRAO_INICIAL,
      modoAutomatico: modoAuto ?? false,
      temaPreferidoClaroId: preferidoClaro ?? TEMA_CLARO_PADRAO,
      temaPreferidoEscuroId: preferidoEscuro ?? TEMA_ESCURO_PADRAO,
      favoritos: favoritos ?? [],
      personalizados: personalizados ?? [],
      carregado: true,
    });

    aplicarVariaveisCss(get().temaAtivo());

    if (typeof window !== "undefined" && window.matchMedia) {
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", () => {
          if (get().modoAutomatico) aplicarVariaveisCss(get().temaAtivo());
        });
    }
  },

  selecionarTema: async (id) => {
    set({ temaSelecionadoId: id, modoAutomatico: false });
    aplicarVariaveisCss(get().temaAtivo());
    await salvarPreferencia(CHAVE_TEMA_ID, id);
    await salvarPreferencia(CHAVE_MODO_AUTO, false);
  },

  alternarModoAutomatico: async (ativo) => {
    set({ modoAutomatico: ativo });
    aplicarVariaveisCss(get().temaAtivo());
    await salvarPreferencia(CHAVE_MODO_AUTO, ativo);
  },

  alternarFavorito: async (id) => {
    const favoritosAtuais = get().favoritos;
    const novos = favoritosAtuais.includes(id)
      ? favoritosAtuais.filter((f) => f !== id)
      : [...favoritosAtuais, id];
    set({ favoritos: novos });
    await salvarPreferencia(CHAVE_FAVORITOS, novos);
  },

  salvarTemaPersonalizado: async (tema) => {
    const outros = get().personalizados.filter((t) => t.id !== tema.id);
    const novos = [...outros, { ...tema, categoria: "Personalizado" as const, personalizado: true }];
    set({ personalizados: novos });
    await salvarPreferencia(CHAVE_PERSONALIZADOS, novos);
  },

  removerTemaPersonalizado: async (id) => {
    const novos = get().personalizados.filter((t) => t.id !== id);
    set({ personalizados: novos });
    await salvarPreferencia(CHAVE_PERSONALIZADOS, novos);
    if (get().temaSelecionadoId === id) {
      await get().selecionarTema(TEMA_CLARO_PADRAO);
    }
  },
}));

/** Aplica o tema padrão (Neon Dark) antes do login, quando ainda não há preferências de conta. */
export function aplicarTemaPadrao(): void {
  const tema = CATALOGO.find((t) => t.id === TEMA_PADRAO_INICIAL) ?? CATALOGO[0];
  aplicarVariaveisCss(tema);
}
