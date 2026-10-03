import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Copy, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";

/** Liga/desliga a criptografia do banco e dos backups, e troca a senha. */
export function SecaoCriptografia() {
  const [ativa, setAtiva] = useState<boolean | null>(null);
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [codigo, setCodigo] = useState<string | null>(null);
  const [anotou, setAnotou] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    invoke<boolean>("criptografia_ativa").then(setAtiva).catch(() => setAtiva(false));
  }, []);

  async function rodar(acao: () => Promise<void>) {
    try {
      setOcupado(true);
      await acao();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setOcupado(false);
    }
  }

  const ligar = () =>
    rodar(async () => {
      if (senha.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
      if (senha !== confirma) throw new Error("As senhas não conferem.");
      const c = await invoke<string>("ativar_criptografia", { senha });
      setCodigo(c);
      setAnotou(false);
      setAtiva(true);
      setSenha("");
      setConfirma("");
    });

  const desligar = () =>
    rodar(async () => {
      await invoke("desativar_criptografia", { senha: atual });
      setAtiva(false);
      setAtual("");
      toast.success("Criptografia desligada. O banco e os backups voltaram a ficar abertos no disco.");
    });

  const trocar = () =>
    rodar(async () => {
      await invoke("trocar_senha_banco", { atual, nova });
      setAtual("");
      setNova("");
      toast.success("Senha trocada. O código de recuperação continua o mesmo.");
    });

  return (
    <Secao titulo={<>{ativa ? <ShieldCheck size={16} className="text-sucesso" /> : <ShieldOff size={16} className="text-texto-secundario" />} Criptografia do banco e dos backups</>}>
      {codigo && (
        <div className="mb-4 rounded-lg border border-alerta/60 bg-alerta/10 p-3 text-sm">
          <p className="font-semibold text-texto-primario">Anote o código de recuperação agora. Ele não será mostrado de novo.</p>
          <p className="mt-2 select-all font-mono text-lg tracking-wider text-texto-primario">{codigo}</p>
          <p className="mt-1 text-xs text-texto-secundario">Se esquecer a senha, só este código abre seus dados. Guarde-o fora do computador (papel, gerenciador de senhas).</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button tamanho="pequeno" variante="secundaria" onClick={() => navigator.clipboard.writeText(codigo).then(() => toast.success("Código copiado."))}><Copy size={13} /> Copiar</Button>
            <label className="flex items-center gap-2 text-xs text-texto-primario"><input type="checkbox" checked={anotou} onChange={() => setAnotou(!anotou)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Já anotei</label>
            <Button tamanho="pequeno" disabled={!anotou} onClick={() => setCodigo(null)}>Fechar</Button>
          </div>
        </div>
      )}

      {ativa === null ? null : ativa ? (
        <div className="space-y-4 text-sm">
          <p className="text-texto-secundario">
            <strong className="text-sucesso">Ligada.</strong> O banco fica no disco só cifrado (AES-256-GCM) e é aberto apenas na memória; os backups e a cópia da sincronização também saem cifrados. Para abrir o Dairus é preciso a senha.
          </p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input type="password" value={atual} onChange={(e) => setAtual(e.target.value)} placeholder="Senha atual" aria-label="Senha atual" className={CLASSE_INPUT} />
            <input type="password" value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Nova senha" aria-label="Nova senha" className={CLASSE_INPUT} />
            <Button tamanho="pequeno" variante="secundaria" disabled={ocupado || !atual || nova.length < 8} onClick={trocar}><KeyRound size={13} /> Trocar senha</Button>
          </div>
          <Button tamanho="pequeno" variante="fantasma" disabled={ocupado || !atual} onClick={desligar}>Desligar criptografia (usa a senha atual acima)</Button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-texto-secundario">
            Desligada: o arquivo do banco e os backups abrem em qualquer leitor de SQLite. Ligando, eles só abrem com a sua senha (os backups já existentes são convertidos). Exportações em CSV, Excel e PDF continuam abertas, porque são feitas para você ler.
          </p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Senha (mín. 8 caracteres)" aria-label="Senha do banco" className={CLASSE_INPUT} />
            <input type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} placeholder="Repita a senha" aria-label="Repita a senha" className={CLASSE_INPUT} />
            <Button tamanho="pequeno" disabled={ocupado || !senha} onClick={ligar}><ShieldCheck size={13} /> Ligar criptografia</Button>
          </div>
          <p className="text-xs text-texto-secundario">Em outro computador sincronizado, use a mesma senha para abrir a cópia que vem da nuvem.</p>
        </div>
      )}
    </Secao>
  );
}
