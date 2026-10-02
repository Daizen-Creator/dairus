import { useEffect, useState } from "react";
import { CloudAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/Button";
import { resolverConflito, type EstadoNuvem } from "../../services/sincronizacao";

export const EVENTO_CONFLITO = "dairus:sync-conflito";

/** Faixa no topo quando este computador e a nuvem mudaram ao mesmo tempo: você escolhe qual vale. */
export function AvisoSincronizacao() {
  const [remoto, setRemoto] = useState<EstadoNuvem | null | undefined>(undefined);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const ouvir = (e: Event) => setRemoto((e as CustomEvent<EstadoNuvem | null>).detail ?? null);
    window.addEventListener(EVENTO_CONFLITO, ouvir);
    return () => window.removeEventListener(EVENTO_CONFLITO, ouvir);
  }, []);

  if (remoto === undefined) return null;

  async function escolher(lado: "NUVEM" | "LOCAL") {
    try {
      setOcupado(true);
      const r = await resolverConflito(lado);
      setRemoto(undefined);
      if (r.aplicouRemoto) {
        toast.success("Dados da nuvem aplicados. Os deste computador ficaram num backup.");
        window.setTimeout(() => window.location.reload(), 800);
      } else {
        toast.success("A nuvem agora tem os dados deste computador. A versão antiga da nuvem ficou num backup.");
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setOcupado(false);
    }
  }

  const quando = remoto?.alterado_em ? new Date(remoto.alterado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-alerta/50 bg-alerta/10 px-4 py-2 text-sm text-texto-primario">
      <CloudAlert size={16} className="text-alerta" />
      <span className="flex-1">
        Este computador e a nuvem têm alterações diferentes{quando ? ` (nuvem alterada em ${quando} por ${remoto?.dispositivo_nome})` : ""}. Qual deve valer? A outra fica guardada como backup.
      </span>
      <Button tamanho="pequeno" variante="secundaria" disabled={ocupado} onClick={() => escolher("LOCAL")}>Manter este computador</Button>
      <Button tamanho="pequeno" disabled={ocupado} onClick={() => escolher("NUVEM")}>Usar a da nuvem</Button>
      <Button tamanho="pequeno" variante="fantasma" disabled={ocupado} onClick={() => setRemoto(undefined)}>Depois</Button>
    </div>
  );
}
