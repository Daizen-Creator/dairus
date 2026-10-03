import { WifiOff } from "lucide-react";
import { useAuthStore } from "../../state/auth-store";

export function FaixaOffline() {
  const offline = useAuthStore((s) => s.offline);
  if (!offline) return null;
  return (
    <div className="flex items-center justify-center gap-2 border-b border-borda bg-alerta/10 px-4 py-1 text-xs text-texto-primario">
      <WifiOff size={12} className="text-alerta" /> Sem internet: usando os dados deste computador. A nuvem e a IA voltam quando a conexão voltar.
    </div>
  );
}
