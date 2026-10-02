import { createClient } from "@supabase/supabase-js";

// Projeto "dairus" no Supabase (região São Paulo). A chave publicável é pública por
// natureza (vai dentro do app); quem protege os dados é o login + as regras do banco.
export const SUPABASE_URL = "https://wcxfjmifikmnydfpepiq.supabase.co";
export const SUPABASE_CHAVE_PUBLICA = "sb_publishable_TyFluaK0ipZACQz_nqDK4w_-G7GEpJI";

/** Endereço para onde o Google/Supabase devolvem o login (servidor local do app). */
export const URL_RETORNO_LOGIN = "http://127.0.0.1:47821/callback";

export const supabase = createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICA, {
  auth: {
    flowType: "pkce",
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "dairus-sessao",
  },
});

/** Confere no Supabase se o login com Google já foi ativado no projeto. */
export async function googleAtivado(): Promise<boolean | null> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_CHAVE_PUBLICA } });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { external?: { google?: boolean } };
    return !!json.external?.google;
  } catch {
    return null; // sem internet ou Supabase fora do ar
  }
}
