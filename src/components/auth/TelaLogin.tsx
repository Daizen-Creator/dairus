import { useEffect, useState } from "react";
import {
  BarChart3,
  Bell,
  ChevronDown,
  ChevronRight,
  Cloud,
  CreditCard,
  ExternalLink,
  FileText,
  HardDrive,
  Loader2,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { BarraJanela } from "../layout/BarraJanela";
import { contasRecentes, esquecerConta, useAuthStore, type ContaRecente } from "../../state/auth-store";
import { googleAtivado } from "../../services/supabase";
import changelog from "../../../CHANGELOG.md?raw";

const DESTAQUES = [
  { icone: BarChart3, titulo: "Tudo num painel", texto: "Saldos, cartões, contas a pagar e previsão do mês.", cor: "#1677ff" },
  { icone: CreditCard, titulo: "Cartões sem surpresa", texto: "Faturas, parcelas, limite e assinaturas com logo.", cor: "#f43f5e" },
  { icone: Target, titulo: "Metas e orçamento", texto: "Limites por categoria, metas e desafios.", cor: "#a855f7" },
  { icone: TrendingUp, titulo: "Investimentos", texto: "Carteira, proventos, simuladores e IR.", cor: "#00d395" },
  { icone: Sparkles, titulo: "Assistente com IA", texto: "Lance por texto, foto ou voz e peça análises.", cor: "#f59e0b" },
  { icone: Bell, titulo: "Avisos no Windows", texto: "Contas vencendo, fatura fechando, orçamento.", cor: "#00d9ff" },
  { icone: FileText, titulo: "Relatórios e PDF", texto: "Mês fechado, Imposto de Renda e Excel.", cor: "#38bdf8" },
  { icone: Cloud, titulo: "Backup e sincronização", texto: "Cópias na nuvem e uso em dois computadores.", cor: "#22c55e" },
];

const SELOS = [
  { icone: HardDrive, texto: "Dados no seu computador" },
  { icone: ShieldCheck, texto: "Criptografia opcional" },
  { icone: LockKeyhole, texto: "Sem anúncios, sem venda de dados" },
];

const PASSOS = ["O navegador abre a página segura do Google.", "Você escolhe a sua conta.", "O Dairus recebe o acesso e volta sozinho para a frente."];

const DUVIDAS: Array<[string, string]> = [
  ["O navegador não abriu", "Clique em “Abrir a página de novo” enquanto espera o login. Se continuar, defina um navegador padrão no Windows."],
  ["A porta 47821 está ocupada", "Feche outras janelas do Dairus ou do login que estejam abertas e tente de novo."],
  ["Que dados o Google me passa?", "Só nome, e-mail e foto, para identificar a conta. Seus lançamentos nunca vão para o Google."],
  ["Posso usar sem internet?", "Sim. Depois de entrar uma vez, o Dairus abre sem internet com os dados deste computador."],
  ["Mais de uma pessoa no mesmo PC", "Cada conta Google tem os próprios dados, separados. Use “Adicionar conta”."],
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
      className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-white text-[15px] font-semibold text-[#1f1f1f] shadow-[0_8px_24px_-10px_rgba(255,255,255,.55)] transition-[transform,filter] duration-150 hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <img src="/marcas/google.png" alt="" width={20} height={20} className="h-5 w-5" draggable={false} />
      {children}
    </button>
  );
}

function quando(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return dias <= 0 ? "hoje" : dias === 1 ? "ontem" : dias < 30 ? `há ${dias} dias` : new Date(iso).toLocaleDateString("pt-BR");
}

/** Tela de login: marca e recursos à esquerda, acesso à direita, com status, passos e dúvidas. */
export function TelaLogin() {
  const { entrarComGoogle, cancelarLogin, entrando, erro, urlLogin } = useAuthStore();
  const [recentes, setRecentes] = useState<ContaRecente[]>(() => contasRecentes());
  const [online, setOnline] = useState(() => navigator.onLine);
  const [googleOk, setGoogleOk] = useState<boolean | null>(null);
  const [versao, setVersao] = useState("");
  const [segundos, setSegundos] = useState(0);
  const [duvida, setDuvida] = useState<number | null>(null);
  const novidades = changelog.split(/\n## /)[1]?.split("\n").filter((l) => l.startsWith("- ")).slice(0, 4).map((l) => l.slice(2)) ?? [];

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    import("@tauri-apps/api/app").then(({ getVersion }) => getVersion()).then(setVersao).catch(() => setVersao(""));
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (online) googleAtivado().then(setGoogleOk);
  }, [online]);

  useEffect(() => {
    if (!entrando) return;
    setSegundos(0);
    const t = window.setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [entrando]);

  const bloqueado = !online || googleOk === false;
  const abrirDeNovo = () => urlLogin && import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(urlLogin)).catch(() => window.open(urlLogin, "_blank"));

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-fundo">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-primaria/20 blur-[120px]" />
        <div className="absolute -bottom-48 right-0 h-[480px] w-[480px] rounded-full bg-destaque/15 blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.04] [background-image:linear-gradient(var(--cor-texto-primario)_1px,transparent_1px),linear-gradient(90deg,var(--cor-texto-primario)_1px,transparent_1px)] [background-size:44px_44px]" />
      </div>
      <BarraJanela />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        <main className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-6 py-8 lg:grid-cols-[1.2fr_1fr] lg:px-8">
          {/* Marca e recursos */}
          <section className="text-center lg:text-left">
            <div className="flex items-center justify-center gap-4 lg:justify-start">
              <img src="/dairus.svg" alt="" width={84} height={84} className="h-20 w-20 drop-shadow-[0_10px_30px_rgba(22,119,255,.55)]" draggable={false} />
              <div>
                <span className="block bg-gradient-to-r from-secundaria via-primaria to-destaque bg-clip-text text-6xl font-extrabold tracking-tight text-transparent">dairus</span>
                <span className="text-sm text-texto-secundario">Seu futuro financeiro, no seu controle.</span>
              </div>
            </div>
            <h1 className="mt-6 text-[26px] font-semibold leading-snug text-texto-primario">
              Organize seu dinheiro com clareza, <span className="bg-gradient-to-r from-primaria to-destaque bg-clip-text text-transparent">sem planilha e sem complicação</span>.
            </h1>
            <div className="mt-4 flex flex-wrap justify-center gap-2 lg:justify-start">
              {SELOS.map((s) => (
                <span key={s.texto} className="inline-flex items-center gap-1.5 rounded-full border border-borda bg-cartao/60 px-3 py-1 text-xs text-texto-secundario backdrop-blur">
                  <s.icone size={12} className="text-sucesso" /> {s.texto}
                </span>
              ))}
            </div>
            <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
              {DESTAQUES.map((d) => (
                <li key={d.titulo} className="flex items-start gap-3 rounded-xl border border-borda bg-cartao/60 p-3 text-left backdrop-blur transition-colors hover:border-primaria/40">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${d.cor} 80%, white), ${d.cor})`, boxShadow: `0 0 16px -4px ${d.cor}` }}>
                    <d.icone size={17} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-texto-primario">{d.titulo}</span>
                    <span className="block text-xs text-texto-secundario">{d.texto}</span>
                  </span>
                </li>
              ))}
            </ul>
            {novidades.length > 0 && (
              <div className="mt-5 rounded-xl border border-primaria/30 bg-primaria/5 p-3 text-left">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-primaria"><Sparkles size={12} /> Novidades{versao ? ` da versão ${versao}` : ""}</p>
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-texto-secundario">{novidades.map((n) => <li key={n}>{n}</li>)}</ul>
              </div>
            )}
          </section>

          {/* Acesso */}
          <section className="mx-auto w-full max-w-[420px]">
            <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-xs lg:justify-end">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${online ? "border-sucesso/40 text-sucesso" : "border-alerta/50 text-alerta"}`}>
                {online ? <Wifi size={12} /> : <WifiOff size={12} />} {online ? "Conectado" : "Sem internet"}
              </span>
              {online && (
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${googleOk === false ? "border-erro/50 text-erro" : googleOk ? "border-sucesso/40 text-sucesso" : "border-borda text-texto-secundario"}`}>
                  <img src="/marcas/google.png" alt="" className="h-3 w-3" /> {googleOk === null ? "Verificando login…" : googleOk ? "Login Google pronto" : "Login Google desativado"}
                </span>
              )}
            </div>

            {recentes.length > 0 && !entrando && (
              <div className="mb-4">
                <p className="mb-2 text-sm font-semibold text-texto-primario">Continuar como</p>
                <ul className="grid grid-cols-2 gap-3">
                  {recentes.map((c) => (
                    <li key={c.id} className="group relative">
                      <button
                        onClick={() => entrarComGoogle(c.email)}
                        disabled={bloqueado}
                        className="flex w-full flex-col items-center gap-1.5 rounded-2xl border border-borda bg-cartao p-4 transition-[transform,border-color,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-primaria/60 hover:shadow-[0_10px_30px_-14px_var(--cor-primaria)] disabled:opacity-50"
                      >
                        <Avatar conta={c} tamanho={56} />
                        <span className="w-full truncate text-sm font-medium text-texto-primario">{c.nome.split(" ")[0] || c.email}</span>
                        <span className="w-full truncate text-[11px] text-texto-secundario">{c.email}</span>
                        <span className="text-[10px] text-texto-secundario/80">último acesso {quando(c.ultimoAcesso)}</span>
                      </button>
                      <button onClick={() => setRecentes(esquecerConta(c.id))} aria-label={`Remover ${c.email} das entradas recentes`} title="Remover desta lista" className="absolute right-2 top-2 rounded-full bg-fundo/80 p-1 text-texto-secundario opacity-0 transition-opacity hover:text-erro group-hover:opacity-100">
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                  {recentes.length < 4 && (
                    <li>
                      <button onClick={() => entrarComGoogle()} disabled={bloqueado} className="flex h-full min-h-[136px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-borda bg-cartao/40 p-4 text-texto-secundario transition-colors hover:border-primaria/60 hover:text-primaria disabled:opacity-50">
                        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-borda/40"><Plus size={24} /></span>
                        <span className="text-sm">Adicionar conta</span>
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="rounded-2xl border border-borda bg-cartao p-6 shadow-[0_30px_80px_-30px_var(--cor-primaria)] backdrop-blur">
              {entrando ? (
                <div className="text-center">
                  <Loader2 size={30} className="mx-auto animate-spin text-primaria" />
                  <p className="mt-4 text-base font-semibold text-texto-primario">Continue no navegador</p>
                  <p className="mt-1 text-sm text-texto-secundario">Escolha sua conta Google na página que abriu. Aguardando há {segundos}s…</p>
                  <ol className="mt-4 space-y-2 text-left text-sm">
                    {PASSOS.map((p, i) => (
                      <li key={p} className="flex items-start gap-2.5">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i === 0 || (i === 1 && segundos > 3) ? "bg-primaria text-primaria-texto" : "bg-borda/60 text-texto-secundario"}`}>{i + 1}</span>
                        <span className="text-texto-secundario">{p}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-5 flex flex-wrap justify-center gap-3 text-sm">
                    {urlLogin && <button onClick={abrirDeNovo} className="inline-flex items-center gap-1 text-primaria hover:underline"><ExternalLink size={13} /> Abrir a página de novo</button>}
                    <button onClick={cancelarLogin} className="text-texto-secundario underline hover:text-erro">Cancelar</button>
                  </div>
                  {segundos > 120 && <p className="mt-3 text-xs text-alerta">Está demorando. Se você já entrou no navegador, feche a aba e tente de novo. O login expira em 5 minutos.</p>}
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-semibold text-texto-primario">{recentes.length ? "Entrar com outra conta" : "Entrar no Dairus"}</h2>
                  <p className="mt-1 text-sm text-texto-secundario">Use sua conta Google: rápido, seguro e sem senha nova.</p>
                  <div className="mt-5">
                    <BotaoGoogle onClick={() => entrarComGoogle()} desabilitado={bloqueado}>Entrar com Google</BotaoGoogle>
                  </div>
                  {!online && <p className="mt-3 text-xs text-alerta">Sem internet não dá para fazer o primeiro login. Se já entrou antes neste computador, o Dairus abre sozinho com os dados guardados quando você abrir de novo.</p>}
                  {googleOk === false && <p className="mt-3 text-xs text-erro">O login com Google ainda não foi ativado no Supabase. Veja docs/CONFIGURAR_LOGIN_GOOGLE.md.</p>}
                  <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[11px] text-texto-secundario">
                    {PASSOS.map((p, i) => (
                      <div key={p} className="rounded-lg border border-borda/70 bg-fundo/40 p-2">
                        <span className="mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full bg-primaria/20 text-[10px] font-bold text-primaria">{i + 1}</span>
                        {p.replace("O navegador abre a página segura do Google.", "Abre o Google").replace("Você escolhe a sua conta.", "Escolha a conta").replace("O Dairus recebe o acesso e volta sozinho para a frente.", "Volta sozinho")}
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-center text-xs text-texto-secundario">Primeira vez? A conta é criada no primeiro acesso, sem cadastro.</p>
                </>
              )}
              {erro && <p className="mt-4 rounded-lg border border-erro/50 bg-erro/10 px-3 py-2 text-left text-xs text-erro">{erro}</p>}
            </div>

            <div className="mt-4 rounded-xl border border-borda/70 bg-cartao/50 p-3 backdrop-blur">
              <p className="mb-1 text-xs font-semibold text-texto-primario">Problemas para entrar?</p>
              <ul className="divide-y divide-borda/60">
                {DUVIDAS.map(([q, r], i) => (
                  <li key={q}>
                    <button onClick={() => setDuvida(duvida === i ? null : i)} className="flex w-full items-center gap-1.5 py-1.5 text-left text-xs text-texto-secundario hover:text-texto-primario">
                      {duvida === i ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {q}
                    </button>
                    {duvida === i && <p className="pb-2 pl-5 text-xs text-texto-secundario">{r}</p>}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </main>

        <footer className="relative flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-borda/60 px-6 py-3 text-center text-[11px] text-texto-secundario">
          <span>Dairus{versao ? ` v${versao}` : ""}</span>
          <span>Português (Brasil)</span>
          <span className="inline-flex items-center gap-1"><LockKeyhole size={11} /> Login pelo Google · dados guardados neste computador</span>
        </footer>
      </div>
    </div>
  );
}
