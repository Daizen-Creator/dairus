import { useState } from "react";
import { BarChart3, Cloud, FileText, Loader2, LockKeyhole, Plus, Target, X } from "lucide-react";
import { BarraJanela } from "../layout/BarraJanela";
import { contasRecentes, esquecerConta, useAuthStore, type ContaRecente } from "../../state/auth-store";

const DESTAQUES = [
  { icone: BarChart3, titulo: "Tudo num painel", texto: "Saldos, cartões, contas a pagar e gráficos do mês.", cor: "#1677ff" },
  { icone: Target, titulo: "Metas e orçamento", texto: "Limites por categoria e metas com progresso.", cor: "#a855f7" },
  { icone: FileText, titulo: "Relatórios em PDF", texto: "Seu mês organizado, pronto para guardar.", cor: "#00d9ff" },
  { icone: Cloud, titulo: "Backup na nuvem", texto: "Cópias protegidas pela sua conta Google.", cor: "#00d395" },
];

function Avatar({ conta, tamanho }: { conta: ContaRecente; tamanho: number }) {
  const [falhou, setFalhou] = useState(false);
  const iniciais = (conta.nome || conta.email).split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return conta.foto && !falhou ? (
    <img src={conta.foto} alt="" width={tamanho} height={tamanho} referrerPolicy="no-referrer" onError={() => setFalhou(true)} className="rounded-xl object-cover" style={{ width: tamanho, height: tamanho }} />
  ) : (
    <span className="flex items-center justify-center rounded-xl bg-gradient-to-br from-primaria to-destaque text-lg font-bold text-white" style={{ width: tamanho, height: tamanho }}>
      {iniciais}
    </span>
  );
}

function BotaoGoogle({ onClick, desabilitado, children }: { onClick: () => void; desabilitado?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={desabilitado}
      className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-white text-[15px] font-semibold text-[#1f1f1f] shadow-[0_8px_24px_-10px_rgba(255,255,255,.55)] transition-[transform,filter] duration-150 hover:brightness-95 active:scale-[0.98] disabled:opacity-60"
    >
      <img src="/marcas/google.png" alt="" width={20} height={20} className="h-5 w-5" draggable={false} />
      {children}
    </button>
  );
}

/** Tela de login: marca à esquerda, cartão de acesso à direita e contas usadas recentemente. */
export function TelaLogin() {
  const { entrarComGoogle, cancelarLogin, entrando, erro } = useAuthStore();
  const [recentes, setRecentes] = useState<ContaRecente[]>(() => contasRecentes());

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-fundo">
      {/* Brilhos de fundo (recortados para não criar barra de rolagem) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-primaria/20 blur-[120px]" />
        <div className="absolute -bottom-48 right-0 h-[480px] w-[480px] rounded-full bg-destaque/15 blur-[120px]" />
      </div>
      <BarraJanela />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">

      <main className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-8 py-10 lg:grid-cols-[1.15fr_1fr]">
        {/* Lado da marca */}
        <section className="text-center lg:text-left">
          <div className="flex items-center justify-center gap-4 lg:justify-start">
            <img src="/dairus.svg" alt="" width={84} height={84} className="h-20 w-20 drop-shadow-[0_10px_30px_rgba(22,119,255,.55)]" draggable={false} />
            <span className="bg-gradient-to-r from-secundaria via-primaria to-destaque bg-clip-text text-6xl font-extrabold tracking-tight text-transparent">dairus</span>
          </div>
          <h1 className="mt-6 text-[28px] font-semibold leading-snug text-texto-primario">
            Organize seu dinheiro e acompanhe o seu futuro financeiro com clareza.
          </h1>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {DESTAQUES.map((d) => (
              <li key={d.titulo} className="flex items-start gap-3 rounded-xl border border-borda bg-cartao/60 p-3 text-left backdrop-blur">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${d.cor} 80%, white), ${d.cor})`, boxShadow: `0 0 16px -4px ${d.cor}` }}>
                  <d.icone size={19} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-texto-primario">{d.titulo}</span>
                  <span className="block text-xs text-texto-secundario">{d.texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Lado do acesso */}
        <section className="mx-auto w-full max-w-[400px]">
          {recentes.length > 0 && !entrando && (
            <div className="mb-5">
              <p className="mb-2 text-sm font-semibold text-texto-primario">Entradas recentes</p>
              <p className="mb-3 text-xs text-texto-secundario">Clique na sua foto para entrar de novo.</p>
              <ul className="grid grid-cols-2 gap-3">
                {recentes.map((c) => (
                  <li key={c.id} className="group relative">
                    <button
                      onClick={() => entrarComGoogle(c.email)}
                      className="flex w-full flex-col items-center gap-2 rounded-2xl border border-borda bg-cartao p-4 transition-[transform,border-color,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-primaria/60 hover:shadow-[0_10px_30px_-14px_var(--cor-primaria)]"
                    >
                      <Avatar conta={c} tamanho={64} />
                      <span className="w-full truncate text-sm font-medium text-texto-primario">{c.nome.split(" ")[0] || c.email}</span>
                      <span className="w-full truncate text-[11px] text-texto-secundario">{c.email}</span>
                    </button>
                    <button
                      onClick={() => setRecentes(esquecerConta(c.id))}
                      aria-label={`Remover ${c.email} das entradas recentes`}
                      title="Remover desta lista"
                      className="absolute right-2 top-2 rounded-full bg-fundo/80 p-1 text-texto-secundario opacity-0 transition-opacity hover:text-erro group-hover:opacity-100"
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
                {recentes.length < 4 && (
                  <li>
                    <button onClick={() => entrarComGoogle()} className="flex h-full min-h-[148px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-borda bg-cartao/40 p-4 text-texto-secundario transition-colors hover:border-primaria/60 hover:text-primaria">
                      <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-borda/40"><Plus size={26} /></span>
                      <span className="text-sm">Adicionar conta</span>
                    </button>
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="rounded-2xl border border-borda bg-cartao p-6 shadow-[0_30px_80px_-30px_var(--cor-primaria)] backdrop-blur">
            {entrando ? (
              <div className="py-6 text-center">
                <Loader2 size={30} className="mx-auto animate-spin text-primaria" />
                <p className="mt-4 text-base font-semibold text-texto-primario">Continue no navegador</p>
                <p className="mt-1 text-sm text-texto-secundario">Escolha sua conta Google na janela que abriu e depois volte para cá.</p>
                <button onClick={cancelarLogin} className="mt-5 text-sm text-texto-secundario underline hover:text-erro">Cancelar</button>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-texto-primario">Entrar no Dairus</h2>
                <p className="mt-1 text-sm text-texto-secundario">Use sua conta Google. Rápido e sem senha nova.</p>
                <div className="mt-5">
                  <BotaoGoogle onClick={() => entrarComGoogle()}>Entrar com Google</BotaoGoogle>
                </div>
                <div className="my-5 flex items-center gap-3 text-xs text-texto-secundario">
                  <span className="h-px flex-1 bg-borda" /> primeira vez aqui? <span className="h-px flex-1 bg-borda" />
                </div>
                <button
                  onClick={() => entrarComGoogle()}
                  className="mx-auto flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00b386] to-[#00d395] px-6 text-sm font-semibold text-[#00140d] shadow-[0_8px_24px_-10px_#00d395] transition-[transform,filter] duration-150 hover:brightness-105 active:scale-[0.98]"
                >
                  Criar conta com Google
                </button>
                <p className="mt-3 text-center text-xs text-texto-secundario">Sua conta é criada no primeiro acesso.</p>
              </>
            )}
            {erro && <p className="mt-4 rounded-lg border border-erro/50 bg-erro/10 px-3 py-2 text-left text-xs text-erro">{erro}</p>}
          </div>

          <p className="mt-5 flex items-start justify-center gap-2 text-center text-xs text-texto-secundario">
            <LockKeyhole size={13} className="mt-0.5 shrink-0" />
            Cada conta tem os próprios dados, guardados neste computador.
          </p>
        </section>
      </main>

      <footer className="relative border-t border-borda/60 px-8 py-3 text-center text-[11px] text-texto-secundario">
        Dairus v0.1.0 · Português (Brasil) · Seu futuro financeiro, no seu controle.
      </footer>
      </div>
    </div>
  );
}
