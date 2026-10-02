import { useEffect, useState } from "react";
import { Cloud, CloudDownload, CloudUpload, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Secao } from "../../components/ui/Campos";
import { extras } from "../../services/extras";
import { apagarBackupDaNuvem, baixarBackupDaNuvem, enviarBackupParaNuvem, listarBackupsNaNuvem, type ArquivoNuvem } from "../../services/nuvem";
import { usePreferencia } from "../../state/usePreferencia";
import { lerEstadoLocal, pendenteDeEnvio, type EstadoLocal } from "../../services/sincronizacao";
import { sincronizarEmSegundoPlano } from "../../components/layout/IntegracaoSistema";

const tamanho = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

/** Backups na nuvem da conta (Supabase). */
export function SecaoNuvem({ onBaixado }: { onBaixado: () => void }) {
  const [arquivos, setArquivos] = useState<ArquivoNuvem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarApagar, setConfirmarApagar] = useState<string | null>(null);
  const [enviarAuto, setEnviarAuto] = usePreferencia<boolean>("backup_nuvem_auto", false);
  const [syncAuto, setSyncAuto] = usePreferencia<boolean>("sync_auto", true);
  const [estadoSync, setEstadoSync] = useState<EstadoLocal | null>(null);
  const [pendente, setPendente] = useState(false);

  async function atualizarStatusSync() {
    setEstadoSync(await lerEstadoLocal());
    setPendente(await pendenteDeEnvio().catch(() => false));
  }

  useEffect(() => {
    atualizarStatusSync();
  }, []);

  async function carregar() {
    try {
      setCarregando(true);
      setErro(null);
      setArquivos(await listarBackupsNaNuvem());
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function executar(chave: string, acao: () => Promise<unknown>, ok: string) {
    try {
      setOcupado(chave);
      await acao();
      toast.success(ok);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  const fazerEEnviar = () =>
    executar(
      "novo",
      async () => {
        const info = await extras.criarBackup();
        await enviarBackupParaNuvem(info.nome);
        onBaixado();
      },
      "Backup feito e enviado para a nuvem.",
    );

  const total = arquivos.reduce((s, a) => s + a.tamanho, 0);

  return (
    <Secao
      titulo={<><Cloud size={16} className="text-secundaria" /> Backups na nuvem</>}
      acao={
        <div className="flex gap-2">
          <Button tamanho="pequeno" variante="fantasma" onClick={carregar} disabled={carregando}><RefreshCw size={13} /> Atualizar</Button>
          <Button tamanho="pequeno" onClick={fazerEEnviar} disabled={!!ocupado}>
            {ocupado === "novo" ? <Loader2 size={13} className="animate-spin" /> : <CloudUpload size={13} />} Fazer backup e enviar
          </Button>
        </div>
      }
    >
      <div className="mb-4 rounded-lg border border-borda bg-fundo/50 p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-texto-primario">
          <input type="checkbox" checked={syncAuto} onChange={() => setSyncAuto(!syncAuto)} className="h-4 w-4 accent-[var(--cor-primaria)]" />
          Sincronizar automaticamente entre computadores
        </label>
        <p className="mt-1 text-xs text-texto-secundario">
          A cada 5 minutos (e ao abrir o app) as alterações deste computador vão para a nuvem e as feitas em outro computador entram aqui. Se os dois mudarem ao mesmo tempo, o Dairus pergunta qual vale e guarda a outra como backup.
        </p>
        <p className="mt-2 text-xs text-texto-secundario">
          {estadoSync ? `Última sincronização: ${quando(estadoSync.sincronizado_em)} (versão ${estadoSync.versao_vista}).` : "Ainda não sincronizado neste computador."}{" "}
          {pendente ? <strong className="text-alerta">Há alterações deste computador ainda não enviadas.</strong> : estadoSync ? <span className="text-sucesso">Nuvem em dia.</span> : null}
        </p>
        <Button
          tamanho="pequeno"
          variante="secundaria"
          className="mt-2"
          disabled={!!ocupado}
          onClick={() => executar("sync", async () => { await sincronizarEmSegundoPlano(true); await atualizarStatusSync(); }, "Sincronização concluída.")}
        >
          {ocupado === "sync" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sincronizar agora
        </Button>
      </div>
      <p className="text-sm text-texto-secundario">
        Cópias guardadas no Supabase, numa pasta só da sua conta Google — ninguém mais (nem a outra conta) consegue ver. Servem para levar seus dados para outro computador ou se este der problema.
      </p>
      <label className="mt-3 flex items-center gap-2 text-sm text-texto-primario">
        <input type="checkbox" checked={enviarAuto} onChange={() => setEnviarAuto(!enviarAuto)} className="h-4 w-4 accent-[var(--cor-primaria)]" />
        Enviar para a nuvem também os backups automáticos (e apagar da nuvem os antigos, com a mesma retenção)
      </label>

      {erro && <p className="mt-3 rounded-lg border border-erro/50 bg-erro/10 px-3 py-2 text-xs text-erro">{erro}</p>}

      {carregando ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-texto-secundario"><Loader2 size={14} className="animate-spin" /> Consultando a nuvem…</p>
      ) : arquivos.length === 0 ? (
        !erro && <p className="mt-4 text-sm text-texto-secundario">Nenhum backup na nuvem ainda.</p>
      ) : (
        <>
          <p className="mt-4 text-xs text-texto-secundario">{arquivos.length} arquivo(s) · {tamanho(total)} usados (o plano gratuito do Supabase tem 1 GB).</p>
          <ul className="mt-2 space-y-2">
            {arquivos.map((a) => (
              <li key={a.nome} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-borda px-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-texto-primario">
                  <Cloud size={14} className="text-secundaria" /> {quando(a.criadoEm)}
                  <span className="text-xs text-texto-secundario">· {tamanho(a.tamanho)} · {a.nome}</span>
                </span>
                {confirmarApagar === a.nome ? (
                  <span className="flex items-center gap-2 text-xs">
                    <span className="text-alerta">Apagar da nuvem?</span>
                    <Button tamanho="pequeno" variante="perigo" onClick={() => executar(a.nome, () => apagarBackupDaNuvem(a.nome).then(() => setConfirmarApagar(null)), "Apagado da nuvem.")}>Apagar</Button>
                    <Button tamanho="pequeno" variante="fantasma" onClick={() => setConfirmarApagar(null)}>Cancelar</Button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Button
                      tamanho="pequeno"
                      variante="secundaria"
                      disabled={!!ocupado}
                      onClick={() => executar(a.nome, async () => { await baixarBackupDaNuvem(a.nome); onBaixado(); }, "Baixado. Ele aparece na aba Backups para restaurar.")}
                    >
                      {ocupado === a.nome ? <Loader2 size={13} className="animate-spin" /> : <CloudDownload size={13} />} Baixar
                    </Button>
                    <button onClick={() => setConfirmarApagar(a.nome)} aria-label={`Apagar ${a.nome} da nuvem`} className="rounded-md p-1.5 text-texto-secundario hover:bg-erro/15 hover:text-erro"><Trash2 size={14} /></button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 text-xs text-texto-secundario">Para restaurar: baixe o arquivo aqui e depois use “Restaurar” na aba Backups. Com a criptografia ligada, os arquivos já vão cifrados para a nuvem; sem ela, o acesso é protegido só pelo login.</p>
    </Secao>
  );
}
