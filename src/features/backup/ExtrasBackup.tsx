import { useRef, useState } from "react";
import { BadgeCheck, BellRing, Copy, FileUp, Scissors } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { extras } from "../../services/extras";
import { usePreferencia } from "../../state/usePreferencia";
import type { InfoBackup } from "../../types/extras";

/** Notas nos backups, importar arquivo, copiar para levar, verificar todos, limpar e lembrete. */
export function ExtrasBackup({ backups, onAlterado }: { backups: InfoBackup[]; onAlterado: () => void }) {
  const [notas, setNotas] = usePreferencia<Record<string, string>>("notas_backups", {});
  const [lembrete, setLembrete] = usePreferencia<number>("lembrete_backup_dias", 14);
  const [manter, setManter] = useState("5");
  const [escolhido, setEscolhido] = useState("");
  const [nota, setNota] = useState("");
  const [verificando, setVerificando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const alvo = escolhido || backups[0]?.nome || "";

  async function importar(arquivo: File) {
    if (!/\.(db|cripto|bak|sqlite)$/i.test(arquivo.name)) return toast.error("Escolha um arquivo de backup do Dairus (.db).");
    try {
      const nome = `importado-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.db`;
      await extras.gravarBackupBaixado(nome, new Uint8Array(await arquivo.arrayBuffer()));
      await extras.verificarBackup(nome);
      toast.success("Backup importado e conferido. Use “Restaurar” na lista para usá-lo.");
      onAlterado();
    } catch (e) {
      toast.error(`Arquivo inválido: ${String(e)}`);
    }
  }

  async function copiarParaExportacoes() {
    try {
      const caminho = await extras.salvarExportacaoBinaria(alvo, await extras.lerBackup(alvo));
      toast.success(`Cópia salva em ${caminho}. Leve para um pendrive ou outro computador.`, { duration: 10000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function verificarTodos() {
    setVerificando(true);
    const ruins: string[] = [];
    for (const b of backups) await extras.verificarBackup(b.nome).catch(() => ruins.push(b.nome));
    setVerificando(false);
    if (ruins.length) toast.error(`Com problema: ${ruins.join(", ")}. Exclua esses arquivos.`, { duration: 12000 });
    else toast.success(`Os ${backups.length} backups estão íntegros.`);
  }

  async function limpar() {
    try {
      await extras.aplicarRetencao(Number(manter));
      toast.success(`Mantidos só os ${manter} backups mais recentes (os “antes-de…” ficam).`);
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <Secao titulo="Mais ferramentas de backup">
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Backup escolhido" value={alvo} onValueChange={(v) => { setEscolhido(v); setNota(notas[v] ?? ""); }} options={backups.map((b) => ({ value: b.nome, label: `${b.nome}${notas[b.nome] ? ` — ${notas[b.nome]}` : ""}` }))} className="w-80" />
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Anotação (ex.: antes de importar extrato)" aria-label="Anotação do backup" className={`${CLASSE_INPUT} w-64`} />
          <Button tamanho="pequeno" variante="secundaria" disabled={!alvo} onClick={() => { setNotas({ ...notas, [alvo]: nota }); toast.success("Anotação salva."); }}>Anotar</Button>
          <Button tamanho="pequeno" variante="secundaria" disabled={!alvo} onClick={copiarParaExportacoes}><Copy size={13} /> Copiar para levar</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={entrada} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = ""; }} />
          <Button tamanho="pequeno" variante="secundaria" onClick={() => entrada.current?.click()}><FileUp size={13} /> Importar arquivo de backup</Button>
          <Button tamanho="pequeno" variante="secundaria" disabled={!backups.length || verificando} onClick={verificarTodos}><BadgeCheck size={13} /> {verificando ? "Verificando…" : "Verificar todos"}</Button>
          <span className="flex items-center gap-1.5"><Scissors size={13} className="text-texto-secundario" /> Manter só os
            <Select aria-label="Quantos manter" value={manter} onValueChange={setManter} options={["3", "5", "10", "20"].map((n) => ({ value: n, label: n }))} className="w-20" />
            <Button tamanho="pequeno" variante="fantasma" onClick={limpar}>Limpar agora</Button>
          </span>
        </div>
        <label className="flex flex-wrap items-center gap-2 text-texto-primario">
          <BellRing size={13} className="text-texto-secundario" /> Avisar no Windows se ficar sem backup por
          <Select aria-label="Dias sem backup" value={String(lembrete)} onValueChange={(v) => setLembrete(Number(v))} options={[{ value: "0", label: "nunca avisar" }, { value: "7", label: "7 dias" }, { value: "14", label: "14 dias" }, { value: "30", label: "30 dias" }]} className="w-36" />
        </label>
      </div>
    </Secao>
  );
}
