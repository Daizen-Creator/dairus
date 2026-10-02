import { useEffect, useState } from "react";
import { DatabaseBackup, Loader2, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { useAuthStore, type SituacaoConta } from "../../state/auth-store";

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-fundo p-6">
      <div className="w-full max-w-sm rounded-2xl border border-borda bg-cartao p-7 text-center shadow-[0_24px_70px_-24px_var(--cor-primaria)]">
        <img src="/dairus.svg" alt="" width={64} height={64} className="mx-auto h-16 w-16" draggable={false} />
        {children}
      </div>
    </div>
  );
}

/** Tela de login com Google (via Supabase). */
export function TelaLogin() {
  const { entrarComGoogle, cancelarLogin, entrando, erro } = useAuthStore();
  return (
    <Moldura>
      <h1 className="mt-4 text-xl font-semibold text-texto-primario">Bem-vindo ao Dairus</h1>
      <p className="mt-1 text-sm text-texto-secundario">Seu futuro financeiro, no seu controle.</p>

      {entrando ? (
        <div className="mt-6 space-y-3">
          <p className="flex items-center justify-center gap-2 text-sm text-texto-primario">
            <Loader2 size={16} className="animate-spin text-primaria" /> Continue o login no navegador…
          </p>
          <p className="text-xs text-texto-secundario">Escolha sua conta Google na janela que abriu. Depois volte para cá.</p>
          <button onClick={cancelarLogin} className="text-xs text-texto-secundario underline hover:text-erro">Cancelar</button>
        </div>
      ) : (
        <button
          onClick={entrarComGoogle}
          className="mt-6 flex h-11 w-full items-center justify-center gap-3 rounded-xl bg-white text-sm font-semibold text-[#1f1f1f] shadow-[0_6px_20px_-8px_rgba(255,255,255,.5)] transition-[transform,filter] duration-150 hover:brightness-95 active:scale-[0.98]"
        >
          <img src="/marcas/google.png" alt="" width={20} height={20} className="h-5 w-5" draggable={false} />
          Entrar com Google
        </button>
      )}

      {erro && <p className="mt-4 rounded-lg border border-erro/50 bg-erro/10 px-3 py-2 text-left text-xs text-erro">{erro}</p>}

      <ul className="mt-6 space-y-2 text-left text-xs text-texto-secundario">
        <li className="flex gap-2"><UserPlus size={14} className="mt-0.5 shrink-0 text-secundaria" />Cada conta Google tem os seus próprios dados, separados.</li>
        <li className="flex gap-2"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-sucesso" />Seus lançamentos ficam guardados neste computador.</li>
      </ul>
    </Moldura>
  );
}

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
