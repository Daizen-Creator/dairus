import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Session } from "@supabase/supabase-js";
import { definirContaDasPreferencias, importarPreferenciasLegadas } from "../services/armazenamento";
import { googleAtivado, supabase, URL_RETORNO_LOGIN } from "../services/supabase";

export interface SituacaoConta {
  primeiro_acesso: boolean;
  lancamentos_legado: number;
  criptografado: boolean;
}

interface EstadoAuth {
  carregando: boolean;
  sessao: Session | null;
  /** Entrou sem internet, com a sessão guardada neste computador. */
  offline: boolean;
  contaAberta: boolean;
  entrando: boolean;
  erro: string | null;
  inicializar: () => Promise<void>;
  entrarComGoogle: (emailSugerido?: string) => Promise<void>;
  cancelarLogin: () => Promise<void>;
  situacaoDaConta: () => Promise<SituacaoConta>;
  abrirConta: (importarDadosLocais: boolean) => Promise<void>;
  abrirContaComSenha: (senha: string) => Promise<void>;
  recuperarConta: (codigo: string, novaSenha: string) => Promise<void>;
  sair: () => Promise<void>;
}

export const useAuthStore = create<EstadoAuth>((set, get) => ({
  carregando: true,
  sessao: null,
  offline: false,
  contaAberta: false,
  entrando: false,
  erro: null,

  async inicializar() {
    const { data, error } = await supabase.auth.getSession();
    if (!data.session && (error || !navigator.onLine)) {
      // Sem internet o token não renova; os dados estão neste computador, então
      // entra com a sessão guardada (a nuvem volta a funcionar quando a internet voltar).
      const guardada = sessaoGuardada();
      if (guardada) {
        set({ sessao: guardada, offline: true, carregando: false });
        const voltar = async () => {
          const r = await supabase.auth.getSession().catch(() => null);
          if (r?.data.session) {
            set({ sessao: r.data.session, offline: false });
            window.removeEventListener("online", voltar);
          }
        };
        window.addEventListener("online", voltar);
        setInterval(() => get().offline && navigator.onLine && voltar(), 60_000);
        return;
      }
    }
    set({ sessao: data.session, carregando: false });
    lembrarConta(data.session);
    supabase.auth.onAuthStateChange((_evento, sessao) => {
      // Renovações de token mantêm a mesma conta; só zera tudo se a sessão sumir.
      if (!sessao && get().sessao && !get().offline) window.location.reload();
      if (sessao) set({ sessao, offline: false });
      else if (!get().offline) set({ sessao });
    });
  },

  async entrarComGoogle(emailSugerido) {
    set({ entrando: true, erro: null });
    try {
      const ativo = await googleAtivado();
      if (ativo === false) {
        throw new Error("O login com Google ainda não foi ativado no Supabase. Veja o passo a passo em docs/CONFIGURAR_LOGIN_GOOGLE.md.");
      }
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: URL_RETORNO_LOGIN,
          skipBrowserRedirect: true,
          // Conta recente: já sugere o e-mail; senão, sempre deixa escolher a conta.
          queryParams: emailSugerido ? { login_hint: emailSugerido } : { prompt: "select_account" },
        },
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
      lembrarConta(troca.data.session);
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

  async abrirContaComSenha(senha) {
    const id = get().sessao?.user.id;
    if (!id) throw new Error("Sem sessão.");
    await invoke("abrir_conta_com_senha", { usuarioId: id, senha });
    definirContaDasPreferencias(id);
    set({ contaAberta: true });
  },

  async recuperarConta(codigo, novaSenha) {
    const id = get().sessao?.user.id;
    if (!id) throw new Error("Sem sessão.");
    await invoke("recuperar_conta_com_codigo", { usuarioId: id, codigo, novaSenha });
    definirContaDasPreferencias(id);
    set({ contaAberta: true });
  },

  async sair() {
    await invoke("fechar_conta").catch(() => {});
    definirContaDasPreferencias(null);
    await supabase.auth.signOut().catch(() => {});
    window.location.reload();
  },
}));

/** Sessão salva pelo Supabase neste computador (para entrar sem internet). */
export function sessaoGuardada(): Session | null {
  try {
    const bruto = JSON.parse(localStorage.getItem("dairus-sessao") ?? "null") as Session | { currentSession?: Session } | null;
    const s = (bruto && "currentSession" in bruto ? bruto.currentSession : bruto) as Session | null;
    return s?.user?.id && s.refresh_token ? s : null;
  } catch {
    return null;
  }
}

/** Nome e foto da conta Google (para a barra de título). */
export function dadosDoUsuario(sessao: Session | null) {
  const meta = (sessao?.user.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_url?: string; picture?: string };
  return {
    nome: meta.full_name ?? meta.name ?? sessao?.user.email ?? "",
    email: sessao?.user.email ?? "",
    foto: meta.avatar_url ?? meta.picture ?? null,
  };
}

// ---------- Contas usadas recentemente neste computador (só nome, e-mail e foto; nada sigiloso)

export interface ContaRecente {
  id: string;
  nome: string;
  email: string;
  foto: string | null;
  ultimoAcesso: string;
}

const CHAVE_RECENTES = "dairus-contas-recentes";

export function contasRecentes(): ContaRecente[] {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? "[]") as ContaRecente[];
    return Array.isArray(lista) ? lista.slice(0, 4) : [];
  } catch {
    return [];
  }
}

function lembrarConta(sessao: Session | null) {
  if (!sessao) return;
  const { nome, email, foto } = dadosDoUsuario(sessao);
  const nova: ContaRecente = { id: sessao.user.id, nome, email, foto, ultimoAcesso: new Date().toISOString() };
  try {
    const lista = [nova, ...contasRecentes().filter((c) => c.id !== nova.id)].slice(0, 4);
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify(lista));
  } catch {
    // sem armazenamento local: só não lembra
  }
}

export function esquecerConta(id: string): ContaRecente[] {
  const lista = contasRecentes().filter((c) => c.id !== id);
  try {
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify(lista));
  } catch {
    // ignora
  }
  return lista;
}
