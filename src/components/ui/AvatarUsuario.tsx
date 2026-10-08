import { useEffect, useState } from "react";
import { dadosDoUsuario, useAuthStore } from "../../state/auth-store";

// Foto do perfil da conta Google (campo `picture`/`avatar_url` que o Google manda no login).
// Fica guardada neste computador (data URL, por conta) para aparecer mesmo sem internet;
// se não houver foto ou ela não carregar, mostra as iniciais do nome.

const EVENTO = "dairus:foto-perfil";
const chave = (uid: string) => `dairus-foto-${uid}`;

/** O Google entrega a foto em 96 px ("=s96-c"); pede uma maior para ficar nítida. */
export function fotoEmAltaResolucao(url: string): string {
  return /=s\d+-c$/.test(url) ? url.replace(/=s\d+-c$/, "=s256-c") : url;
}

/** "Daniel Santos" → "DS"; "ana" → "A"; e-mail → primeira letra. */
export function iniciais(nome: string): string {
  const partes = nome.replace(/@.*/, "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

/** Cor estável a partir do nome (a mesma pessoa sempre com a mesma cor). */
export function corDoNome(nome: string): string {
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 42%)`;
}

function lerCache(uid: string | undefined): string | null {
  if (!uid) return null;
  try {
    return localStorage.getItem(chave(uid));
  } catch {
    return null;
  }
}

async function paraDataUrl(blob: Blob): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => falha(r.error);
    r.readAsDataURL(blob);
  });
}

/** Baixa a foto do Google e guarda neste computador. Devolve a data URL (ou null se não deu). */
async function guardarFoto(uid: string, url: string): Promise<string | null> {
  try {
    const resp = await fetch(fotoEmAltaResolucao(url), { referrerPolicy: "no-referrer" });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    if (!blob.type.startsWith("image/") || blob.size > 2_000_000) return null;
    const dados = await paraDataUrl(blob);
    localStorage.setItem(chave(uid), dados);
    window.dispatchEvent(new CustomEvent(EVENTO));
    return dados;
  } catch {
    return null;
  }
}

/**
 * Busca de novo a foto da conta Google (Configurações → "Sincronizar com o Google").
 * Atualiza a sessão para pegar o endereço mais recente da foto e baixa de novo.
 */
export async function sincronizarFotoGoogle(): Promise<"ok" | "sem-foto" | "falhou"> {
  const { supabase } = await import("../../services/supabase");
  const { data } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
  const sessao = data.session ?? useAuthStore.getState().sessao;
  if (!sessao) return "falhou";
  if (data.session) useAuthStore.setState({ sessao: data.session });
  const { foto } = dadosDoUsuario(sessao);
  if (!foto) {
    try {
      localStorage.removeItem(chave(sessao.user.id));
    } catch {
      // sem armazenamento local
    }
    window.dispatchEvent(new CustomEvent(EVENTO));
    return "sem-foto";
  }
  return (await guardarFoto(sessao.user.id, foto)) ? "ok" : "falhou";
}

/** Avatar da conta: foto do Google (guardada), ou as iniciais do nome numa cor própria. */
export function AvatarUsuario({ tamanho = 28, className = "", nomeAlternativo }: { tamanho?: number; className?: string; nomeAlternativo?: string }) {
  const sessao = useAuthStore((s) => s.sessao);
  const { nome, email, foto } = dadosDoUsuario(sessao);
  const uid = sessao?.user.id;
  const [cache, setCache] = useState<string | null>(() => lerCache(uid));
  const [falhou, setFalhou] = useState(false);
  const exibido = nomeAlternativo || nome || email;

  useEffect(() => {
    setCache(lerCache(uid));
    setFalhou(false);
    const atualizar = () => {
      setCache(lerCache(uid));
      setFalhou(false);
    };
    window.addEventListener(EVENTO, atualizar);
    return () => window.removeEventListener(EVENTO, atualizar);
  }, [uid]);

  // Primeira vez com esta conta: guarda a foto para as próximas (e para usar sem internet).
  useEffect(() => {
    if (uid && foto && !lerCache(uid)) guardarFoto(uid, foto);
  }, [uid, foto]);

  const src = cache ?? (foto ? fotoEmAltaResolucao(foto) : null);
  const estilo = { width: tamanho, height: tamanho };

  if (src && !falhou) {
    return <img src={src} alt="" width={tamanho} height={tamanho} referrerPolicy="no-referrer" onError={() => (cache ? setCache(null) : setFalhou(true))} className={`shrink-0 rounded-full object-cover ${className}`} style={estilo} draggable={false} />;
  }
  return (
    <span aria-hidden className={`flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ${className}`} style={{ ...estilo, background: corDoNome(exibido || "?"), fontSize: Math.max(10, tamanho * 0.38) }}>
      {iniciais(exibido || "?")}
    </span>
  );
}
