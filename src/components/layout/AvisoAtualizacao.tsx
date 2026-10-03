import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, Download, RefreshCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/Button";
import { lerPreferencia, salvarPreferencia } from "../../services/armazenamento";
import { estaNoTauri, notificar } from "../../services/sistema";
import { TelaAtualizacao, type EtapaTela } from "./TelaAtualizacao";
import { versaoMaiorOuIgual } from "./atualizacaoUtil";

export interface Novidade {
  versao: string;
  versao_atual: string;
  titulo: string;
  notas: string;
  publicada_em: string | null;
  pagina: string | null;
  instalador: string | null;
  tamanho_bytes: number;
  sha256: string | null;
  fonte: string;
  beta: boolean;
}

interface Progresso {
  fase: "baixando" | "conferindo" | "pronto";
  baixados: number;
  total: number;
}

/** Gravado antes de instalar; na abertura seguinte diz se a instalação deu certo. */
interface InstalacaoEmAndamento {
  versao: string;
  de: string;
  pagina: string | null;
}

export const verificarAtualizacao = async () => invoke<Novidade | null>("verificar_atualizacao", { beta: (await lerPreferencia<boolean>("atualizacao_beta")) ?? false });
export const EVENTO_VERIFICAR = "dairus:verificar-atualizacao";
const PAGINA_RELEASES = "https://github.com/Daizen-Creator/dairus/releases/latest";

type Faixa = { tipo: "disponivel" } | { tipo: "baixando"; pct: number } | { tipo: "pronta"; caminho: string; aoSair: boolean } | { tipo: "erro"; msg: string };

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Atualização automática.
 * - Ao abrir o Dairus: se há versão nova, mostra a tela de atualização (baixa, confere, faz
 *   backup, instala e reabre). Pode ser desligado em Configurações.
 * - Durante o uso (a cada 6 horas): baixa em segundo plano e avisa na faixa; instala ao fechar
 *   ou com "Reiniciar e atualizar" (que abre a mesma tela).
 * Qualquer falha mostra a mensagem com "Tentar de novo" e o app continua na versão atual.
 */
export function AvisoAtualizacao() {
  const [novidade, setNovidade] = useState<Novidade | null>(null);
  const [faixa, setFaixa] = useState<Faixa>({ tipo: "disponivel" });
  const [tela, setTela] = useState<EtapaTela | null>(null);
  const [verNotas, setVerNotas] = useState(false);
  const [escondido, setEscondido] = useState(false);
  const ocupado = useRef(false);
  /** true enquanto a tela está acompanhando o download (instala ao terminar). */
  const telaNoDownload = useRef(false);
  const ultimaNovidade = useRef<Novidade | null>(null);

  const abrirPagina = useCallback((url?: string | null) => {
    import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(url || PAGINA_RELEASES)).catch(() => {});
  }, []);

  /** Backup → grava "em andamento" → instalador (/P /UPDATE /R) → o Dairus fecha e reabre. */
  const instalar = useCallback(async (n: Novidade, caminho: string) => {
    setTela({ tipo: "backup" });
    try {
      const { extras } = await import("../../services/extras");
      await extras.criarBackup().catch(() => {
        // Sem backup não é motivo para travar a atualização: o instalador não mexe no banco.
      });
      await salvarPreferencia("atualizacao_em_andamento", { versao: n.versao, de: n.versao_atual, pagina: n.pagina } satisfies InstalacaoEmAndamento);
      setTela({ tipo: "instalando" });
      await invoke("instalar_baixada", { caminho });
      setTela({ tipo: "reiniciando" });
    } catch (e) {
      await salvarPreferencia("atualizacao_em_andamento", null);
      setTela({ tipo: "erro", msg: `Não foi possível iniciar a instalação: ${mensagem(e)}` });
    }
  }, []);

  /** Baixa e confere. Com a tela aberta, instala em seguida; senão, deixa pronto na faixa. */
  const baixar = useCallback(async (n: Novidade, opcoes: { tela: boolean; automatico: boolean }) => {
    if (!n.instalador) {
      if (opcoes.tela) setTela({ tipo: "erro", msg: "Esta versão não tem instalador para Windows publicado." });
      return;
    }
    if (ocupado.current) {
      // Já está baixando em segundo plano: só passa a mostrar na tela.
      if (opcoes.tela) {
        telaNoDownload.current = true;
        setTela({ tipo: "baixando", baixados: 0, total: n.tamanho_bytes, inicio: Date.now() });
      }
      return;
    }
    ocupado.current = true;
    telaNoDownload.current = opcoes.tela;
    ultimaNovidade.current = n;
    setFaixa({ tipo: "baixando", pct: 0 });
    if (opcoes.tela) setTela({ tipo: "baixando", baixados: 0, total: n.tamanho_bytes, inicio: Date.now() });
    try {
      const caminho = await invoke<string>("baixar_atualizacao", { url: n.instalador, sha256: n.sha256 });
      if (telaNoDownload.current) {
        setFaixa({ tipo: "pronta", caminho, aoSair: false });
        await instalar(n, caminho);
        return;
      }
      const aoSair = opcoes.automatico && (await lerPreferencia<boolean>("atualizacao_instalar_ao_sair")) !== false;
      if (aoSair) await invoke("instalar_ao_sair", { caminho });
      setFaixa({ tipo: "pronta", caminho, aoSair });
      if (opcoes.automatico) await notificar(`Dairus ${n.versao} pronto para instalar`, aoSair ? "Será instalado quando você fechar o Dairus." : "Abra o Dairus e clique em “Reiniciar e atualizar”.");
    } catch (e) {
      setFaixa({ tipo: "erro", msg: mensagem(e) });
      if (telaNoDownload.current) setTela({ tipo: "erro", msg: mensagem(e) });
    } finally {
      ocupado.current = false;
    }
  }, [instalar]);

  /** Fluxo completo com a tela: verificar → baixar → conferir → backup → instalar → reiniciar. */
  const atualizarComTela = useCallback(async (conhecida?: Novidade | null) => {
    setTela({ tipo: "verificando" });
    try {
      const n = conhecida ?? (await verificarAtualizacao());
      if (!n) {
        setTela(null);
        toast.success("Você já está na versão mais nova.");
        return;
      }
      setNovidade(n);
      await baixar(n, { tela: true, automatico: false });
    } catch (e) {
      setTela({ tipo: "erro", msg: `Não foi possível verificar atualizações: ${mensagem(e)}` });
    }
  }, [baixar]);

  const verificar = useCallback(async (modo: "abertura" | "periodica" | "manual") => {
    if (!estaNoTauri()) return;
    if (modo !== "manual" && (await lerPreferencia<boolean>("atualizacao_auto")) === false) return;
    try {
      const n = await verificarAtualizacao();
      setNovidade(n);
      if (modo === "manual") toast.success(n ? `Versão ${n.versao} disponível (${n.fonte}).` : "Você já está na versão mais nova.");
      if (!n) return;
      setEscondido(false);
      if (modo === "abertura" && (await lerPreferencia<boolean>("atualizacao_na_abertura")) !== false) {
        await atualizarComTela(n);
      } else if ((await lerPreferencia<boolean>("atualizacao_baixar_auto")) !== false) {
        baixar(n, { tela: false, automatico: modo !== "manual" });
      } else if (modo !== "manual" && (await lerPreferencia<string>("atualizacao_avisada")) !== n.versao) {
        await notificar(`Dairus ${n.versao} disponível`, "Abra o Dairus para ver o que mudou e atualizar.");
        await salvarPreferencia("atualizacao_avisada", n.versao);
      }
    } catch (e) {
      if (modo === "manual") toast.error(mensagem(e));
    }
  }, [atualizarComTela, baixar]);

  /** Na abertura: a última instalação terminou? */
  const conferirInstalacaoAnterior = useCallback(async (): Promise<boolean> => {
    const pendente = await lerPreferencia<InstalacaoEmAndamento>("atualizacao_em_andamento");
    if (!pendente?.versao) return false;
    await salvarPreferencia("atualizacao_em_andamento", null);
    const { getVersion } = await import("@tauri-apps/api/app");
    const atual = await getVersion();
    if (versaoMaiorOuIgual(atual, pendente.versao)) {
      toast.success(`Dairus atualizado para a versão ${atual}.`, { duration: 8000 });
      return false;
    }
    setNovidade((n) => n ?? { versao: pendente.versao, versao_atual: atual, titulo: `Dairus ${pendente.versao}`, notas: "", publicada_em: null, pagina: pendente.pagina, instalador: null, tamanho_bytes: 0, sha256: null, fonte: "GitHub", beta: false });
    setTela({ tipo: "erro", msg: `A instalação da versão ${pendente.versao} não foi concluída (o instalador foi fechado ou não teve permissão). Você continua na ${atual}.` });
    return true;
  }, []);

  useEffect(() => {
    if (!estaNoTauri()) return;
    let desligar: (() => void) | undefined;
    import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<Progresso>("atualizacao-progresso", ({ payload: p }) => {
          if (p.fase === "baixando") {
            setFaixa((f) => (f.tipo === "baixando" ? { tipo: "baixando", pct: p.total > 0 ? Math.floor((p.baixados / p.total) * 100) : 0 } : f));
            setTela((t) => (t?.tipo === "baixando" ? { ...t, baixados: p.baixados, total: p.total || t.total } : t));
          } else if (p.fase === "conferindo") {
            setTela((t) => (t?.tipo === "baixando" ? { tipo: "conferindo" } : t));
          }
        }),
      )
      .then((f) => { desligar = f; })
      .catch(() => {});
    const primeiro = window.setTimeout(() => {
      conferirInstalacaoAnterior()
        .catch(() => false)
        .then((falhou) => { if (!falhou) verificar("abertura"); });
    }, 3_000);
    const id = window.setInterval(() => verificar("periodica"), 6 * 60 * 60_000);
    const manual = () => verificar("manual");
    window.addEventListener(EVENTO_VERIFICAR, manual);
    return () => {
      desligar?.();
      window.clearTimeout(primeiro);
      window.clearInterval(id);
      window.removeEventListener(EVENTO_VERIFICAR, manual);
    };
  }, [verificar, conferirInstalacaoAnterior]);

  const telaAberta = tela && (
    <TelaAtualizacao
      versao={novidade?.versao ?? null}
      versaoAtual={novidade?.versao_atual ?? null}
      etapa={tela}
      onDepois={() => {
        // O download continua; quando terminar, fica pronto na faixa (e instala ao fechar, se escolhido).
        telaNoDownload.current = false;
        setTela(null);
        toast.info("O download continua em segundo plano. Você será avisado quando estiver pronto.");
      }}
      onTentarDeNovo={() => atualizarComTela(novidade?.instalador ? novidade : null)}
      onFechar={() => setTela(null)}
      onBaixarManual={() => abrirPagina(novidade?.pagina)}
    />
  );

  if (!novidade || escondido) return telaAberta || null;

  return (
    <>
      {telaAberta}
      <div className="border-b border-primaria/40 bg-primaria/10 px-4 py-2 text-sm text-texto-primario">
        <div className="flex flex-wrap items-center gap-3">
          {faixa.tipo === "pronta" ? <CheckCircle2 size={16} className="text-sucesso" /> : <Sparkles size={16} className="text-primaria" />}
          <span className="flex-1">
            <strong>Dairus {novidade.versao}</strong>{novidade.beta ? " (beta)" : ""}{" "}
            {faixa.tipo === "baixando" ? `baixando… ${faixa.pct}%` : faixa.tipo === "pronta" ? (faixa.aoSair ? "baixado: será instalado quando você fechar o Dairus." : "baixado e conferido, pronto para instalar.") : faixa.tipo === "erro" ? "não pôde ser baixado." : `está disponível (você usa a ${novidade.versao_atual}).`}
          </span>
          <Button tamanho="pequeno" variante="fantasma" onClick={() => setVerNotas(!verNotas)}>{verNotas ? "Esconder" : "O que mudou"}</Button>
          {faixa.tipo === "baixando" && <Button tamanho="pequeno" variante="secundaria" onClick={() => { telaNoDownload.current = true; setTela({ tipo: "baixando", baixados: 0, total: novidade.tamanho_bytes, inicio: Date.now() }); }}>Ver progresso</Button>}
          {faixa.tipo === "pronta" && <Button tamanho="pequeno" onClick={() => instalar(novidade, faixa.caminho)}><RefreshCw size={13} /> Reiniciar e atualizar</Button>}
          {faixa.tipo === "pronta" && !faixa.aoSair && <Button tamanho="pequeno" variante="secundaria" onClick={() => invoke("instalar_ao_sair", { caminho: faixa.caminho }).then(() => setFaixa({ ...faixa, aoSair: true })).catch((e) => toast.error(mensagem(e)))}>Instalar ao fechar</Button>}
          {(faixa.tipo === "disponivel" || faixa.tipo === "erro") && novidade.instalador && <Button tamanho="pequeno" onClick={() => atualizarComTela(novidade)}><Download size={13} /> {faixa.tipo === "erro" ? "Tentar de novo" : `Atualizar agora${novidade.tamanho_bytes ? ` (${Math.round(novidade.tamanho_bytes / 1_048_576)} MB)` : ""}`}</Button>}
          {!novidade.instalador && <Button tamanho="pequeno" onClick={() => abrirPagina(novidade.pagina)}>Abrir página da versão</Button>}
          <button onClick={() => setEscondido(true)} aria-label="Fechar aviso de atualização" className="rounded p-1 text-texto-secundario hover:text-texto-primario"><X size={14} /></button>
        </div>
        {faixa.tipo === "baixando" && <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-borda"><div className="h-full bg-primaria transition-[width]" style={{ width: `${faixa.pct}%` }} /></div>}
        {faixa.tipo === "erro" && <p className="mt-1 text-xs text-erro">{faixa.msg}</p>}
        {verNotas && (
          <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-borda bg-cartao p-3 font-sans text-xs text-texto-secundario">{novidade.notas || "Sem notas para esta versão."}</pre>
        )}
      </div>
    </>
  );
}
