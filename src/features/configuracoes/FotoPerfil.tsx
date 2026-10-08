import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { AvatarUsuario, sincronizarFotoGoogle } from "../../components/ui/AvatarUsuario";
import { dadosDoUsuario, useAuthStore } from "../../state/auth-store";

/** Foto do perfil vinda da conta Google, com botão para buscar de novo. */
export function FotoPerfil() {
  const sessao = useAuthStore((s) => s.sessao);
  const { nome, email } = dadosDoUsuario(sessao);
  const [sincronizando, setSincronizando] = useState(false);

  async function sincronizar() {
    setSincronizando(true);
    const r = await sincronizarFotoGoogle().catch(() => "falhou" as const);
    setSincronizando(false);
    if (r === "ok") toast.success("Foto atualizada com a da sua conta Google.");
    else if (r === "sem-foto") toast.info("Sua conta Google não tem foto. Mostrando as iniciais do nome.");
    else toast.error("Não foi possível buscar a foto agora (sem internet?). A foto guardada continua.");
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-borda bg-fundo/60 p-3">
      <AvatarUsuario tamanho={52} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-texto-primario">{nome || "Conta Google"}</p>
        <p className="truncate text-xs text-texto-secundario">{email}</p>
        <p className="mt-0.5 text-[11px] text-texto-secundario">A foto vem da sua conta Google e fica guardada neste computador. Trocou a foto no Google? Sincronize; se ela não mudar, saia e entre de novo.</p>
      </div>
      <Button tamanho="pequeno" variante="secundaria" onClick={sincronizar} disabled={sincronizando || !sessao}>
        {sincronizando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sincronizar com o Google
      </Button>
    </div>
  );
}
