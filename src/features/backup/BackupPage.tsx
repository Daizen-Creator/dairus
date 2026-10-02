import { useEffect, useState } from "react";
import {
  ActivitySquare,
  Cloud,
  CloudUpload,
  BadgeCheck,
  Database,
  DatabaseBackup,
  FileJson,
  FolderOpen,
  HardDriveDownload,
  History,
  Lock,
  LockOpen,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Abas, useAbaDaPagina } from "../../components/ui/Abas";
import { SecaoNuvem } from "./SecaoNuvem";
import { SecaoCriptografia } from "./SecaoCriptografia";
import { enviarBackupParaNuvem } from "../../services/nuvem";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { contabilidade } from "../../services/contabilidade";
import { extras } from "../../services/extras";
import { formatarDataISOParaBR } from "../../services/formato";
import { usePreferencia } from "../../state/usePreferencia";
import { useSegurancaStore } from "../../state/seguranca-store";
import type { InfoBackup, InfoBanco, RegistroAuditoria } from "../../types/extras";

const tamanho = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const dataHora = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`;
const idade = (s: string) => {
  const dias = Math.floor((Date.now() - new Date(s.replace(" ", "T")).getTime()) / 86_400_000);
  return dias <= 0 ? "hoje" : dias === 1 ? "ontem" : `há ${dias} dias`;
};

export function BackupPage() {
  const [backups, setBackups] = useState<InfoBackup[]>([]);
  const [banco, setBanco] = useState<InfoBanco | null>(null);
  const [auditoria, setAuditoria] = useState<RegistroAuditoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [trabalhando, setTrabalhando] = useState(false);
  const [auto, setAuto] = usePreferencia<boolean>("backup_auto", false);
  const [frequencia, setFrequencia] = usePreferencia<string>("backup_frequencia", "SEMANAL");
  const [retencao, setRetencao] = usePreferencia<number>("backup_retencao", 10);
  const [ocultar, setOcultar] = usePreferencia<boolean>("ocultar_saldos", false);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null);
  const [verificacao, setVerificacao] = useState<string[] | null>(null);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [pinAtual, setPinAtual] = useState("");
  const [novoPin, setNovoPin] = useState("");
  const [frase, setFrase] = useState("");
  const [mostrarReset, setMostrarReset] = useState(false);
  const [secao, setSecao] = useAbaDaPagina<"backups" | "nuvem" | "dados" | "pin" | "atividade" | "perigo">("backup", "backups");
  const seg = useSegurancaStore();

  async function carregar() {
    try {
      const [b, info, aud] = await Promise.all([extras.listarBackups(), extras.infoBanco(), extras.listarAuditoria(15)]);
      setBackups(b);
      setBanco(info);
      setAuditoria(aud);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function executar(acao: () => Promise<void>, sucesso: string) {
    try {
      setTrabalhando(true);
      await acao();
      toast.success(sucesso);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setTrabalhando(false);
    }
  }

  const criar = () =>
    executar(async () => {
      await extras.criarBackup();
      await extras.aplicarRetencao(retencao);
    }, "Backup criado.");

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

  async function verificarBackup(nome: string) {
    try {
      await extras.verificarBackup(nome);
      toast.success(`${nome}: arquivo íntegro e com a estrutura do Dairus.`);
    } catch (e) {
      toast.error(`${nome}: ${String(e)}`);
    }
  }

  async function verificarBanco() {
    try {
      setTrabalhando(true);
      setVerificacao(await extras.verificarIntegridade());
    } catch (e) {
      toast.error(String(e));
    } finally {
      setTrabalhando(false);
    }
  }

  async function exportarTudo() {
    try {
      setTrabalhando(true);
      const [contas, lancamentos, agendamentos, metas, bens, radar, orcamentos] = await Promise.all([
        contabilidade.listarContas(),
        contabilidade.listarLancamentos(100000),
        contabilidade.listarAgendamentos(),
        extras.listarMetas(),
        extras.listarBens(),
        extras.listarRadar(),
        extras.listarOrcamentos(),
      ]);
      const conteudo = JSON.stringify({ exportado_em: new Date().toISOString(), versao_app: "0.1.0", contas, lancamentos, agendamentos, metas, bens, radar, orcamentos }, null, 2);
      const caminho = await extras.salvarExportacao(`dairus-dados-${new Date().toISOString().slice(0, 10)}.json`, conteudo);
      toast.success(`Dados exportados em ${caminho}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    } finally {
      setTrabalhando(false);
    }
  }

  async function apagarTudo() {
    try {
      setTrabalhando(true);
      const seg = await extras.apagarTodosOsDados(frase);
      toast.success(`Dados apagados. Backup de segurança: ${seg.nome}. Recarregando…`, { duration: 6000 });
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      toast.error(String(e));
      setTrabalhando(false);
    }
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

  async function trocarPin(ev: React.FormEvent) {
    ev.preventDefault();
    if (!/^\d{4,8}$/.test(novoPin)) return toast.error("O novo PIN precisa ter de 4 a 8 dígitos.");
    if (!(await seg.removerPin(pinAtual))) return toast.error("PIN atual incorreto.");
    await seg.definirPin(novoPin);
    setPinAtual("");
    setNovoPin("");
    toast.success("PIN alterado.");
  }

  async function desativarPin(ev: React.FormEvent) {
    ev.preventDefault();
    if (await seg.removerPin(pinAtual)) {
      setPinAtual("");
      toast.success("PIN removido.");
    } else toast.error("PIN incorreto.");
  }

  if (carregando) return <Skeleton className="h-72 w-full" />;

  const ultimo = backups.find((b) => b.nome.startsWith("dairus-"));
  const espacoBackups = backups.reduce((s, b) => s + b.tamanho_bytes, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-texto-primario">
          <ShieldCheck size={20} className="text-sucesso" /> Backup e Segurança
        </h1>
        <p className="text-sm text-texto-secundario">Seus dados ficam só neste computador. Faça cópias com frequência.</p>
      </div>

      <Abas ativa={secao} onChange={setSecao} abas={[{ id: "backups", rotulo: "Backups", icone: DatabaseBackup }, { id: "nuvem", rotulo: "Nuvem", icone: Cloud }, { id: "dados", rotulo: "Banco e dados", icone: Database }, { id: "pin", rotulo: "PIN e criptografia", icone: Lock }, { id: "atividade", rotulo: "Atividade", icone: ActivitySquare }, { id: "perigo", rotulo: "Zona de perigo", icone: Trash2 }]} />

      {secao === "nuvem" && <SecaoNuvem onBaixado={carregar} />}

      {(secao === "backups") && (<>
      <Secao
        titulo={<><DatabaseBackup size={16} className="text-primaria" /> Backups</>}
        acao={
          <div className="flex gap-2">
            <Button variante="secundaria" tamanho="pequeno" onClick={() => extras.abrirPasta("Backups").catch((e) => toast.error(String(e)))}><FolderOpen size={13} /> Abrir pasta</Button>
            <Button onClick={criar} disabled={trabalhando}>{trabalhando ? "Aguarde…" : "Fazer backup agora"}</Button>
          </div>
        }
      >
        <p className="text-sm text-texto-secundario">
          {ultimo ? `Último backup: ${dataHora(ultimo.criado_em)} (${idade(ultimo.criado_em)}).` : "Nenhum backup feito ainda."} {backups.length} arquivo(s), {tamanho(espacoBackups)} em Documentos\Dairus\Backups.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-texto-primario">
          <label className="flex items-center gap-2"><input type="checkbox" checked={auto} onChange={() => setAuto(!auto)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Backup automático ao abrir o app</label>
          <label className="flex items-center gap-2 text-texto-secundario">a cada
            <Select aria-label="Frequência" value={frequencia} onValueChange={setFrequencia} disabled={!auto} options={[{ value: "DIARIO", label: "dia" }, { value: "SEMANAL", label: "7 dias" }, { value: "MENSAL", label: "30 dias" }]} className="w-28" />
          </label>
          <label className="flex items-center gap-2 text-texto-secundario">manter os últimos
            <Select aria-label="Retenção" value={String(retencao)} onValueChange={(v) => setRetencao(Number(v))} options={[3, 5, 10, 20, 50].map((n) => ({ value: String(n), label: String(n) }))} className="w-20" />
          </label>
        </div>

        {backups.length > 0 && (
          <ul className="mt-4 space-y-2">
            {backups.map((b) => (
              <li key={b.nome} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-borda px-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-texto-primario">
                  <History size={14} className="text-texto-secundario" />
                  {dataHora(b.criado_em)} <span className="text-xs text-texto-secundario">· {idade(b.criado_em)} · {tamanho(b.tamanho_bytes)} · {b.nome}</span>
                </span>
                {confirmar === b.nome ? (
                  <span className="flex items-center gap-2 text-xs">
                    <span className="text-alerta">Substituir os dados atuais por este backup?</span>
                    <Button tamanho="pequeno" variante="perigo" disabled={trabalhando} onClick={() => restaurar(b.nome)}>Restaurar</Button>
                    <Button tamanho="pequeno" variante="fantasma" onClick={() => setConfirmar(null)}>Cancelar</Button>
                  </span>
                ) : confirmarExcluir === b.nome ? (
                  <span className="flex items-center gap-2 text-xs">
                    <span className="text-alerta">Excluir este arquivo de backup?</span>
                    <Button tamanho="pequeno" variante="perigo" onClick={() => executar(() => extras.excluirBackup(b.nome).then(() => setConfirmarExcluir(null)), "Backup excluído.")}>Excluir</Button>
                    <Button tamanho="pequeno" variante="fantasma" onClick={() => setConfirmarExcluir(null)}>Cancelar</Button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Button tamanho="pequeno" variante="fantasma" onClick={() => verificarBackup(b.nome)}><BadgeCheck size={13} /> Verificar</Button>
                    <Button tamanho="pequeno" variante="fantasma" onClick={() => executar(() => enviarBackupParaNuvem(b.nome), "Enviado para a nuvem.")} disabled={trabalhando} title="Enviar este backup para a nuvem da sua conta"><CloudUpload size={13} /> Nuvem</Button>
                    <Button tamanho="pequeno" variante="secundaria" onClick={() => setConfirmar(b.nome)}>Restaurar</Button>
                    <button onClick={() => setConfirmarExcluir(b.nome)} aria-label={`Excluir ${b.nome}`} className="rounded-md p-1.5 text-texto-secundario hover:bg-erro/15 hover:text-erro"><Trash2 size={14} /></button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-texto-secundario">
          A restauração confere a integridade do arquivo e guarda uma cópia do estado atual antes de substituir. Sem a criptografia ligada (aba PIN e privacidade), os backups ficam abertos; guarde-os em local seguro. Os arquivos “antes-de-…” nunca são apagados pela retenção automática.
        </p>
      </Secao>
      </>)}

      {(secao === "dados") && (<>
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo={<><Database size={16} className="text-secundaria" /> Banco de dados</>}>
          {banco && (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-xs text-texto-secundario">Tamanho</dt><dd className="text-texto-primario">{tamanho(banco.tamanho_bytes)}</dd></div>
              <div><dt className="text-xs text-texto-secundario">Lançamentos</dt><dd className="text-texto-primario">{banco.lancamentos}</dd></div>
              <div><dt className="text-xs text-texto-secundario">Contas e categorias</dt><dd className="text-texto-primario">{banco.contas}</dd></div>
              <div><dt className="text-xs text-texto-secundario">Contas agendadas</dt><dd className="text-texto-primario">{banco.agendamentos}</dd></div>
              <div><dt className="text-xs text-texto-secundario">Metas / bens</dt><dd className="text-texto-primario">{banco.metas} / {banco.bens}</dd></div>
              <div><dt className="text-xs text-texto-secundario">SQLite · migrações</dt><dd className="text-texto-primario">{banco.versao_sqlite} · {banco.migracoes}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-texto-secundario">Arquivo</dt><dd className="break-all text-xs text-texto-primario">{banco.caminho}</dd></div>
            </dl>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button tamanho="pequeno" variante="secundaria" onClick={verificarBanco} disabled={trabalhando}><ActivitySquare size={13} /> Verificar integridade</Button>
            <Button tamanho="pequeno" variante="secundaria" onClick={() => executar(() => extras.otimizarBanco(), "Banco otimizado.")} disabled={trabalhando}><Wrench size={13} /> Otimizar (VACUUM)</Button>
          </div>
          {verificacao && (verificacao.length === 0 ? <p className="mt-2 text-sm text-sucesso">Tudo certo: banco íntegro e todos os lançamentos com débitos = créditos.</p> : <ul className="mt-2 list-inside list-disc text-sm text-erro">{verificacao.map((p) => <li key={p}>{p}</li>)}</ul>)}
        </Secao>

        <Secao titulo={<><HardDriveDownload size={16} className="text-primaria" /> Seus dados</>}>
          <p className="text-sm text-texto-secundario">Leve uma cópia legível dos seus dados para onde quiser.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button tamanho="pequeno" variante="secundaria" onClick={exportarTudo} disabled={trabalhando}><FileJson size={13} /> Exportar tudo (JSON)</Button>
            <Button tamanho="pequeno" variante="fantasma" onClick={() => extras.abrirPasta("Exportacoes").catch((e) => toast.error(String(e)))}><FolderOpen size={13} /> Abrir pasta de exportações</Button>
          </div>
          <div className="mt-4 border-t border-borda pt-3">
            <label className="flex items-center gap-2 text-sm text-texto-primario"><input type="checkbox" checked={ocultar} onChange={() => setOcultar(!ocultar)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Modo privacidade: ocultar saldos e valores nas telas</label>
          </div>
        </Secao>
      </div>
      </>)}

      {(secao === "pin") && (<>
      <SecaoCriptografia />
      <Secao titulo={<>{seg.pinAtivo ? <Lock size={16} className="text-destaque" /> : <LockOpen size={16} className="text-texto-secundario" />} Bloqueio por PIN</>}>
        {seg.pinAtivo ? (
          <div className="space-y-4">
            <p className="text-sm text-sucesso">PIN ativo. O app pede o PIN ao abrir e após inatividade. Atalho para bloquear na hora: Ctrl+L.</p>
            <label className="flex items-center gap-2 text-sm text-texto-secundario">Bloquear após
              <Select aria-label="Minutos de inatividade" value={String(seg.minutosInatividade)} onValueChange={(v) => seg.definirMinutos(Number(v))} options={[{ value: "1", label: "1 minuto" }, { value: "5", label: "5 minutos" }, { value: "15", label: "15 minutos" }, { value: "30", label: "30 minutos" }, { value: "0", label: "Nunca (só ao abrir)" }]} className="w-48" />
            </label>
            <Button variante="secundaria" onClick={seg.bloquear}>Bloquear agora</Button>
            <div className="grid gap-4 md:grid-cols-2">
              <form onSubmit={trocarPin} className="flex flex-wrap items-center gap-2">
                <input type="password" inputMode="numeric" value={pinAtual} onChange={(e) => setPinAtual(e.target.value)} placeholder="PIN atual" aria-label="PIN atual" className={`${CLASSE_INPUT} w-32`} />
                <input type="password" inputMode="numeric" value={novoPin} onChange={(e) => setNovoPin(e.target.value)} placeholder="Novo PIN" aria-label="Novo PIN" className={`${CLASSE_INPUT} w-32`} />
                <Button type="submit" variante="secundaria" tamanho="pequeno">Trocar PIN</Button>
              </form>
              <form onSubmit={desativarPin} className="flex flex-wrap items-center gap-2">
                <input type="password" inputMode="numeric" value={pinAtual} onChange={(e) => setPinAtual(e.target.value)} placeholder="PIN atual" aria-label="PIN atual para remover" className={`${CLASSE_INPUT} w-32`} />
                <Button type="submit" variante="perigo" tamanho="pequeno">Remover PIN</Button>
              </form>
            </div>
          </div>
        ) : (
          <form onSubmit={ativarPin} className="flex flex-wrap items-center gap-2">
            <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Novo PIN (4–8 dígitos)" aria-label="Novo PIN" className={`${CLASSE_INPUT} w-48`} />
            <input type="password" inputMode="numeric" value={pin2} onChange={(e) => setPin2(e.target.value)} placeholder="Repita o PIN" aria-label="Repita o PIN" className={`${CLASSE_INPUT} w-40`} />
            <Button type="submit">Ativar PIN</Button>
          </form>
        )}
        <p className="mt-3 text-xs text-texto-secundario">
          O PIN é um bloqueio de tela do aplicativo; quem protege o arquivo do banco e os backups é a criptografia acima. Após 5 erros seguidos há uma espera crescente. Se esquecer o PIN, o acesso só volta removendo a configuração manualmente (preferencias.json em %APPDATA%\com.danielsantos.dairus).
        </p>
      </Secao>
      </>)}

      {(secao === "atividade") && (<>
      <Secao titulo="Atividade recente">
        {auditoria.length === 0 ? <p className="text-sm text-texto-secundario">Sem registros.</p> : (
          <ul className="space-y-1 text-xs">{auditoria.map((a, i) => <li key={i} className="flex justify-between"><span className="text-texto-primario">{a.acao.replace(/_/g, " ").toLowerCase()} · {a.entidade}</span><span className="text-texto-secundario">{formatarDataISOParaBR(a.criado_em.slice(0, 10))} {a.criado_em.slice(11, 16)}</span></li>)}</ul>
        )}
      </Secao>
      </>)}

      {(secao === "perigo") && (<>
      <Secao titulo={<span className="text-erro">Zona de perigo</span>}>
        {!mostrarReset ? (
          <Button variante="perigo" tamanho="pequeno" onClick={() => setMostrarReset(true)}><Trash2 size={13} /> Apagar todos os meus dados…</Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-texto-primario">Isto apaga lançamentos, contas, cartões, categorias, metas, bens, radar e orçamentos criados por você, voltando o app ao estado inicial. Um backup de segurança é salvo antes.</p>
            <div className="flex flex-wrap items-center gap-2">
              <input value={frase} onChange={(e) => setFrase(e.target.value)} placeholder='Digite "APAGAR TUDO"' aria-label="Confirmação" className={`${CLASSE_INPUT} w-56`} />
              <Button variante="perigo" tamanho="pequeno" disabled={frase !== "APAGAR TUDO" || trabalhando} onClick={apagarTudo}>Apagar definitivamente</Button>
              <Button variante="fantasma" tamanho="pequeno" onClick={() => { setMostrarReset(false); setFrase(""); }}>Cancelar</Button>
            </div>
          </div>
        )}
      </Secao>
      </>)}
    </div>
  );
}
