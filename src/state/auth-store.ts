import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Session } from "@supabase/supabase-js";
import { definirContaDasPreferencias, importarPreferenciasLegadas } from "../services/armazenamento";
import { googleAtivado, supabase, URL_RETORNO_LOGIN } from "../services/supabase";

export interface SituacaoConta {
  primeiro_acesso: boolean;
  lancamentos_legado: number;
}

interface EstadoAuth {
  carregando: boolean;
  sessao: Session | null;
  contaAberta: boolean;
  entrando: boolean;
  erro: string | null;
  inicializar: () => Promise<void>;
  entrarComGoogle: () => Promise<void>;
  cancelarLogin: () => Promise<void>;
  situacaoDaConta: () => Promise<SituacaoConta>;
  abrirConta: (importarDadosLocais: boolean) => Promise<void>;
  sair: () => Promise<void>;
}

export const useAuthStore = create<EstadoAuth>((set, get) => ({
  carregando: true,
  sessao: null,
  contaAberta: false,
  entrando: false,
  erro: null,

  async inicializar() {
    const { data } = await supabase.auth.getSession();
    set({ sessao: data.session, carregando: false });
    supabase.auth.onAuthStateChange((_evento, sessao) => {
      // Renovações de token mantêm a mesma conta; só zera tudo se a sessão sumir.
      if (!sessao && get().sessao) window.location.reload();
      set({ sessao });
    });
  },

  async entrarComGoogle() {
    set({ entrando: true, erro: null });
    try {
      const ativo = await googleAtivado();
      if (ativo === false) {
        throw new Error("O login com Google ainda não foi ativado no Supabase. Veja o passo a passo em docs/CONFIGURAR_LOGIN_GOOGLE.md.");
      }
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: URL_RETORNO_LOGIN, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } },
      });
      if (error || !data.url) throw new Error(error?.message ?? "Não foi possível iniciar o login.");
      // Liga o "ouvido" local antes de abrir o navegador, para não perder o retorno.
      const retorno = invoke<string>("aguardar_retorno_login");
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(data.url);
      const codigo = await retorno;
      const troca = await supabase.auth.exchangeCodeForSession(codigo);
      if (troca.error) throw new Error(troca.error.message);
      set({ sessao: troca.data.session });
    } catch (e) {
      set({ erro: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ entrando: false });
    }
  },

  async cancelarLogin() {
    await invoke("cancelar_login").catch(() => {});
    set({ entrando: false });
  },

  async situacaoDaConta() {
    const id = get().sessao?.user.id;
    if (!id) throw new Error("Sem sessão.");
    return invoke<SituacaoConta>("situacao_conta", { usuarioId: id });
  },

  async abrirConta(importarDadosLocais) {
    const id = get().sessao?.user.id;
    if (!id) throw new Error("Sem sessão.");
    await invoke("abrir_conta", { usuarioId: id, importarLegado: importarDadosLocais });
    definirContaDasPreferencias(id);
    if (importarDadosLocais) await importarPreferenciasLegadas();
    set({ contaAberta: true });
  },

  async sair() {
    await invoke("fechar_conta").catch(() => {});
    definirContaDasPreferencias(null);
    await supabase.auth.signOut().catch(() => {});
    window.location.reload();
  },
}));

/** Nome e foto da conta Google (para a barra de título). */
export function dadosDoUsuario(sessao: Session | null) {
  const meta = (sessao?.user.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_url?: string; picture?: string };
  return {
    nome: meta.full_name ?? meta.name ?? sessao?.user.email ?? "",
    email: sessao?.user.email ?? "",
    foto: meta.avatar_url ?? meta.picture ?? null,
  };
}
