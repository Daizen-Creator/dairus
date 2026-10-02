import { useEffect, useState } from "react";
import { DatabaseBackup, History, Lock, LockOpen, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { extras } from "../../services/extras";
import { lerPreferencia, salvarPreferencia } from "../../services/armazenamento";
import { useSegurancaStore } from "../../state/seguranca-store";
import type { InfoBackup } from "../../types/extras";

const tamanho = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const dataHora = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`;

export function BackupPage() {
  const [backups, setBackups] = useState<InfoBackup[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [trabalhando, setTrabalhando] = useState(false);
  const [auto, setAuto] = useState(false);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [pinAtual, setPinAtual] = useState("");
  const seg = useSegurancaStore();

  async function carregar() {
    try {
      setBackups(await extras.listarBackups());
      setAuto((await lerPreferencia<boolean>("backup_auto")) ?? false);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function criar() {
    try {
      setTrabalhando(true);
      const info = await extras.criarBackup();
      toast.success(`Backup criado: ${info.nome}`);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setTrabalhando(false);
    }
  }

  async function restaurar(nome: string) {
    try {
      setTrabalhando(true);
      const seguranca = await extras.restaurarBackup(nome);
      toast.success(`Backup restaurado. Estado anterior guardado em ${seguranca.nome}. Recarregando…`, { duration: 6000 });
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      toast.error(String(e));
      setTrabalhando(false);
    } finally {
      setConfirmar(null);
    }
  }

  async function alternarAuto() {
    const novo = !auto;
    await salvarPreferencia("backup_auto", novo);
    setAuto(novo);
  }

  async function ativarPin(ev: React.FormEvent) {
    ev.preventDefault();
    if (!/^\d{4,8}$/.test(pin)) return toast.error("Use de 4 a 8 dígitos.");
    if (pin !== pin2) return toast.error("Os PINs não conferem.");
    await seg.definirPin(pin);
    setPin("");
    setPin2("");
    toast.success("PIN ativado.");
  }

  async function desativarPin(ev: React.FormEvent) {
    ev.preventDefault();
    if (await seg.removerPin(pinAtual)) {
      setPinAtual("");
      toast.success("PIN removido.");
    } else toast.error("PIN incorreto.");
  }

  if (carregando) return <Skeleton className="h-72 w-full" />;

  const ultimo = backups[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-texto-primario">
          <ShieldCheck size={20} className="text-sucesso" /> Backup e Segurança
        </h1>
        <p className="text-sm text-texto-secundario">Seus dados ficam só neste computador. Faça cópias com frequência.</p>
      </div>

      <Secao
        titulo={<><DatabaseBackup size={16} className="text-primaria" /> Backups</>}
        acao={<Button onClick={criar} disabled={trabalhando}>{trabalhando ? "Aguarde…" : "Fazer backup agora"}</Button>}
      >
        <p className="text-sm text-texto-secundario">
          {ultimo ? `Último backup: ${dataHora(ultimo.criado_em)}.` : "Nenhum backup feito ainda."} Os arquivos ficam em
          Documentos\Dairus\Backups.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm text-texto-primario">
          <input type="checkbox" checked={auto} onChange={alternarAuto} className="h-4 w-4 accent-[var(--cor-primaria)]" />
          Backup automático ao abrir o app (se o último tiver mais de 7 dias)
        </label>

        {backups.length > 0 && (
          <ul className="mt-4 space-y-2">
            {backups.map((b) => (
              <li key={b.nome} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-borda px-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-texto-primario">
                  <History size={14} className="text-texto-secundario" />
                  {dataHora(b.criado_em)} <span className="text-xs text-texto-secundario">· {tamanho(b.tamanho_bytes)} · {b.nome}</span>
                </span>
                {confirmar === b.nome ? (
                  <span className="flex items-center gap-2 text-xs">
                    <span className="text-alerta">Substituir os dados atuais por este backup?</span>
                    <Button tamanho="pequeno" variante="perigo" disabled={trabalhando} onClick={() => restaurar(b.nome)}>Restaurar</Button>
                    <Button tamanho="pequeno" variante="fantasma" onClick={() => setConfirmar(null)}>Cancelar</Button>
                  </span>
                ) : (
                  <Button tamanho="pequeno" variante="secundaria" onClick={() => setConfirmar(b.nome)}>Restaurar</Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-texto-secundario">
          A restauração confere a integridade do arquivo e guarda uma cópia do estado atual antes de substituir. Os backups
          não são criptografados — guarde-os em local seguro.
        </p>
      </Secao>

      <Secao titulo={<>{seg.pinAtivo ? <Lock size={16} className="text-destaque" /> : <LockOpen size={16} className="text-texto-secundario" />} Bloqueio por PIN</>}>
        {seg.pinAtivo ? (
          <div className="space-y-4">
            <p className="text-sm text-sucesso">PIN ativo. O app pede o PIN ao abrir e após inatividade.</p>
            <label className="flex items-center gap-2 text-sm text-texto-secundario">
              Bloquear após
              <Select
                aria-label="Minutos de inatividade"
                value={String(seg.minutosInatividade)}
                onValueChange={(v) => seg.definirMinutos(Number(v))}
                options={[
                  { value: "1", label: "1 minuto" },
                  { value: "5", label: "5 minutos" },
                  { value: "15", label: "15 minutos" },
                  { value: "30", label: "30 minutos" },
                  { value: "0", label: "Nunca (só ao abrir)" },
                ]}
                className="w-48"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button variante="secundaria" onClick={seg.bloquear}>Bloquear agora</Button>
            </div>
            <form onSubmit={desativarPin} className="flex flex-wrap items-center gap-2">
              <input type="password" inputMode="numeric" value={pinAtual} onChange={(e) => setPinAtual(e.target.value)} placeholder="PIN atual" aria-label="PIN atual" className={`${CLASSE_INPUT} w-36`} />
              <Button type="submit" variante="perigo" tamanho="pequeno">Remover PIN</Button>
            </form>
          </div>
        ) : (
          <form onSubmit={ativarPin} className="flex flex-wrap items-center gap-2">
            <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Novo PIN (4–8 dígitos)" aria-label="Novo PIN" className={`${CLASSE_INPUT} w-48`} />
            <input type="password" inputMode="numeric" value={pin2} onChange={(e) => setPin2(e.target.value)} placeholder="Repita o PIN" aria-label="Repita o PIN" className={`${CLASSE_INPUT} w-40`} />
            <Button type="submit">Ativar PIN</Button>
          </form>
        )}
        <p className="mt-3 text-xs text-texto-secundario">
          O PIN é um bloqueio de tela do aplicativo; ele não criptografa o arquivo do banco de dados nem os backups. Se
          esquecer o PIN, o acesso só volta removendo a configuração manualmente (preferencias.json em %APPDATA%\com.danielsantos.dairus).
        </p>
      </Secao>
    </div>
  );
}
