import { useEffect, useState } from "react";
import { DatabaseBackup, Loader2, Sparkles } from "lucide-react";
import { BarraJanela } from "../layout/BarraJanela";
import { useAuthStore, type SituacaoConta } from "../../state/auth-store";

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-fundo">
      <BarraJanela />
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-sm rounded-2xl border border-borda bg-cartao p-7 text-center shadow-[0_24px_70px_-24px_var(--cor-primaria)]">
        <img src="/dairus.svg" alt="" width={64} height={64} className="mx-auto h-16 w-16" draggable={false} />
        {children}
      </div>
      </div>
    </div>
  );
}

export { TelaLogin } from "./TelaLogin";

/** Depois do login: abre o banco da conta (e oferece importar os dados antigos deste computador). */
export function PreparandoConta() {
  const { situacaoDaConta, abrirConta, sair, sessao } = useAuthStore();
  const [situacao, setSituacao] = useState<SituacaoConta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);

  async function abrir(importar: boolean) {
    try {
      setAbrindo(true);
      await abrirConta(importar);
    } catch (e) {
      setErro(String(e));
      setAbrindo(false);
    }
  }

  useEffect(() => {
    situacaoDaConta()
      .then((s) => {
        // Só pergunta quando é o primeiro acesso desta conta aqui e há dados antigos para levar.
        if (s.primeiro_acesso && s.lancamentos_legado > 0) setSituacao(s);
        else abrir(false);
      })
      .catch((e) => setErro(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!situacao || abrindo) {
    return (
      <Moldura>
        <p className="mt-5 flex items-center justify-center gap-2 text-sm text-texto-primario">
          <Loader2 size={16} className="animate-spin text-primaria" /> Abrindo sua conta…
        </p>
        {erro && (
          <>
            <p className="mt-3 text-xs text-erro">{erro}</p>
            <button onClick={sair} className="mt-3 text-xs text-texto-secundario underline">Sair</button>
          </>
        )}
      </Moldura>
    );
  }

  return (
    <Moldura>
      <h1 className="mt-4 text-lg font-semibold text-texto-primario">Primeiro acesso desta conta</h1>
      <p className="mt-1 text-sm text-texto-secundario">{sessao?.user.email}</p>
      <p className="mt-4 text-sm text-texto-primario">
        Encontramos dados de antes do login neste computador ({situacao.lancamentos_legado} lançamento(s)). Eles são seus?
      </p>
      <div className="mt-5 space-y-2">
        <button onClick={() => abrir(true)} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primaria to-destaque text-sm font-semibold text-primaria-texto">
          <DatabaseBackup size={15} /> Sim, levar para esta conta
        </button>
        <button onClick={() => abrir(false)} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-borda text-sm text-texto-primario hover:bg-borda/40">
          <Sparkles size={15} /> Não, começar do zero
        </button>
      </div>
      <p className="mt-4 text-xs text-texto-secundario">Os dados antigos continuam guardados; a outra pessoa que usar este computador pode escolher “começar do zero”.</p>
    </Moldura>
  );
}
