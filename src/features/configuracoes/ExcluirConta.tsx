import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { limparPreferenciasDaConta } from "../../services/armazenamento";
import { esquecerConta, useAuthStore } from "../../state/auth-store";

/** Exclui todos os dados da conta: nuvem (se marcado) e este computador. */
export function ExcluirConta() {
  const sessao = useAuthStore((s) => s.sessao);
  const sair = useAuthStore((s) => s.sair);
  const [aberto, setAberto] = useState(false);
  const [nuvem, setNuvem] = useState(true);
  const [texto, setTexto] = useState("");
  const [excluindo, setExcluindo] = useState(false);

  async function excluir() {
    const id = sessao?.user.id;
    if (!id) return toast.error("Entre na sua conta primeiro.");
    try {
      setExcluindo(true);
      if (nuvem) {
        const { apagarTudoDaNuvem } = await import("../../services/nuvem");
        const n = await apagarTudoDaNuvem().catch((e) => {
          throw new Error(`Não consegui apagar a nuvem (verifique a internet): ${e instanceof Error ? e.message : String(e)}. Nada foi apagado deste computador.`);
        });
        toast.success(`${n} arquivo(s) apagado(s) da nuvem.`);
      }
      await import("../aparencia/midia").then((m) => m.apagarMidiasDaConta()).catch(() => 0);
      await limparPreferenciasDaConta();
      await invoke("excluir_dados_conta", { usuarioId: id, confirmacao: texto.trim() });
      esquecerConta(id);
      toast.success("Dados excluídos. Saindo…");
      await sair();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e), { duration: 10000 });
      setExcluindo(false);
    }
  }

  return (
    <Secao titulo={<><Trash2 size={16} className="text-erro" /> Excluir conta e dados</>}>
      <p className="text-xs text-texto-secundario">Apaga deste computador o banco de dados da conta, as preferências, as fotos e vídeos da aparência, os backups e as exportações (pasta Documentos\Dairus\…). Opcionalmente apaga também os backups, a sincronização, os relatórios e a aparência na nuvem. Não dá para desfazer: faça um backup antes se quiser guardar algo. O login Google continua existindo (é do Google).</p>
      {!aberto ? (
        <Button className="mt-3" tamanho="pequeno" variante="perigo" onClick={() => setAberto(true)}>Quero excluir meus dados</Button>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          <label className="flex items-center gap-2 text-texto-primario"><input type="checkbox" checked={nuvem} onChange={() => setNuvem(!nuvem)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Apagar também tudo o que está na nuvem</label>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite EXCLUIR para confirmar" aria-label="Confirmação" className={`${CLASSE_INPUT} w-64`} />
          <div className="flex gap-2">
            <Button tamanho="pequeno" variante="perigo" onClick={excluir} disabled={texto.trim() !== "EXCLUIR" || excluindo}>{excluindo ? "Excluindo…" : "Excluir definitivamente"}</Button>
            <Button tamanho="pequeno" variante="fantasma" onClick={() => { setAberto(false); setTexto(""); }}>Cancelar</Button>
          </div>
        </div>
      )}
    </Secao>
  );
}
