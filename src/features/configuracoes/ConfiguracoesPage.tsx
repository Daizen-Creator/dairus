import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Download, FolderOpen, Keyboard, MonitorCog, RotateCcw, Settings2, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Abas, useAbaDaPagina } from "../../components/ui/Abas";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { extras } from "../../services/extras";
import { lerPreferencia, salvarPreferencia } from "../../services/armazenamento";
import { useAparenciaStore } from "../../state/aparencia-store";
import { usePreferencia } from "../../state/usePreferencia";
import { verificarAvisosAgora } from "../../components/layout/IntegracaoSistema";
import { abrirComWindows, lerLog, notificar, pastaDeLogs } from "../../services/sistema";
import { EVENTO_VERIFICAR } from "../../components/layout/AvisoAtualizacao";
import type { Conta } from "../../types/accounting";
import { ExcluirConta } from "./ExcluirConta";
import { MaisOpcoes } from "./MaisOpcoes";
import { ModoViagemConfig } from "./ModoViagemConfig";
import type { InfoBanco } from "../../types/extras";

const PAGINAS_INICIAIS = [
  { value: "/", label: "Dashboard" },
  { value: "/lancamentos", label: "Despesas e Receitas" },
  { value: "/contas-bancarias", label: "Contas Bancárias" },
  { value: "/orcamento", label: "Orçamento" },
  { value: "/metas", label: "Metas Financeiras" },
  { value: "/relatorios", label: "Relatórios" },
];

const ATALHOS: Array<[string, string]> = [
  ["Ctrl + K", "Abrir a busca global"],
  ["/", "Focar a busca no histórico de lançamentos"],
  ["Esc", "Fechar a busca / limpar o texto da busca"],
  ["Ctrl + L", "Bloquear o app (com PIN ativo)"],
  ["Ctrl + Shift + N", "Lançamento rápido (de qualquer tela)"],
  ["Ctrl + Alt + D", "Lançamento rápido mesmo com o app minimizado"],
  ["Enter", "Salvar um limite no Orçamento; enviar pergunta à IA"],
  ["Shift + Enter", "Quebrar linha na pergunta à IA"],
];

const PENDENTES = [
  "Botão “Paguei” dentro da notificação do Windows (o Windows só permite isso para apps com instalador assinado; hoje o aviso só informa e você marca como paga no app)",
  "Metas em dupla e comparação anônima com outros usuários (precisam de um servidor compartilhado)",
  "Leitura do QR Code da NFC-e direto da SEFAZ (hoje: foto da nota lida pela IA)",
  "Conexão direta com bancos (Open Finance): hoje é por extrato OFX/CSV, pasta vigiada ou notificação colada",
];

/** Chaves de preferências que podem ser exportadas/importadas (nunca a chave do Gemini nem o PIN). */
const CHAVES_EXPORTAVEIS = [
  "nome_usuario", "ocultar_saldos", "conta_principal", "conta_padrao", "categoria_padrao", "pagina_inicial",
  "ui_fonte", "ui_sem_animacoes", "dashboard_secoes_ocultas", "orcamento_renda_base", "perfil_renda",
  "backup_auto", "backup_frequencia", "backup_retencao", "gemini_modelo", "gemini_tom", "gemini_temperatura",
  "gemini_blocos", "gemini_anonimo", "tema_ativo", "marcas_usuario", "avisos_windows", "fechar_para_bandeja",
  "bloquear_ao_minimizar", "sync_auto", "atualizacao_auto", "invest_alvo", "invest_dia_aporte", "invest_valor_aporte",
  "invest_cotacoes_auto", "pasta_vigiada", "assinaturas_ignoradas", "chave_pix", "orcamento_auto", "meta_envelopes",
  "meta_sobra", "meta_arredondar", "meta_lembrete", "desafios", "categorias_superfluas",
  "resumo_semanal", "resumo_semanal_ia", "pdf_mensal_auto", "pdf_mensal_nuvem", "pdf_secoes", "diagnostico_ia_auto",
  "tema_auto_horario", "verificacao_semanal", "dashboard_coluna_recolhida", "avisos_grupos_desligados", "dias_aviso_contas",
  "avisos_silencio", "menu_oculto", "ui_compacto", "widgets_inicio", "atalhos_inicio", "necessidades", "teto_cartoes", "cores_contas",
];

export function ConfiguracoesPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [banco, setBanco] = useState<InfoBanco | null>(null);
  const [nome, setNome] = usePreferencia<string>("nome_usuario", "");
  const [rascunhoNome, setRascunhoNome] = useState("");
  const [contaPadrao, setContaPadrao] = usePreferencia<string>("conta_padrao", "");
  const [categoriaPadrao, setCategoriaPadrao] = usePreferencia<string>("categoria_padrao", "");
  const [paginaInicial, setPaginaInicial] = usePreferencia<string>("pagina_inicial", "/");
  // Tamanho do texto agora é parte da Aparência (salvo na nuvem junto com o resto).
  const fonte = useAparenciaStore((x) => x.aparencia.tipografia.tamanho);
  const setFonte = (v: number) => useAparenciaStore.getState().alterar({ tipografia: { tamanho: v } });
  const [semAnimacoes, setSemAnimacoes] = usePreferencia<boolean>("ui_sem_animacoes", false);
  const [ocultar, setOcultar] = usePreferencia<boolean>("ocultar_saldos", false);
  const [importando, setImportando] = useState("");
  const [secao, setSecao] = useAbaDaPagina<"preferencias" | "windows" | "mais" | "atalhos" | "sobre">("configuracoes", "preferencias");
  const [avisosWindows, setAvisosWindows] = usePreferencia<boolean>("avisos_windows", true);
  const [fecharParaBandeja, setFecharParaBandeja] = usePreferencia<boolean>("fechar_para_bandeja", false);
  const [bloquearAoMinimizar, setBloquearAoMinimizar] = usePreferencia<boolean>("bloquear_ao_minimizar", true);
  const [iniciarComWindows, setIniciarComWindows] = useState(false);
  const [log, setLog] = useState<string | null>(null);
  const [verificacaoSemanal, setVerificacaoSemanal] = usePreferencia<boolean>("verificacao_semanal", true);
  const [ultimaVerificacao] = usePreferencia<string | null>("verificacao_semanal_ultima", null);
  const [atualizacaoAuto, setAtualizacaoAuto] = usePreferencia<boolean>("atualizacao_auto", true);
  const [baixarAuto, setBaixarAuto] = usePreferencia<boolean>("atualizacao_baixar_auto", true);
  const [instalarAoSair, setInstalarAoSair] = usePreferencia<boolean>("atualizacao_instalar_ao_sair", true);
  const [beta, setBeta] = usePreferencia<boolean>("atualizacao_beta", false);
  const [versaoApp, setVersaoApp] = useState("");

  useEffect(() => {
    import("@tauri-apps/api/app").then(({ getVersion }) => getVersion()).then(setVersaoApp).catch(() => setVersaoApp("0.1.0"));
  }, []);

  useEffect(() => {
    abrirComWindows.ativo().then(setIniciarComWindows).catch(() => {});
  }, []);

  async function alternarInicio() {
    try {
      await abrirComWindows.definir(!iniciarComWindows);
      setIniciarComWindows(!iniciarComWindows);
      toast.success(!iniciarComWindows ? "O Dairus vai abrir junto com o Windows (na bandeja)." : "O Dairus não abre mais com o Windows.");
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function abrirLogs() {
    try {
      const pasta = await pastaDeLogs();
      const { openPath } = await import("@tauri-apps/plugin-opener");
      await openPath(pasta);
    } catch (e) {
      toast.error(String(e));
    }
  }

  useEffect(() => {
    contabilidade.listarContas().then(setContas).catch(() => {});
    extras.infoBanco().then(setBanco).catch(() => {});
  }, []);

  useEffect(() => setRascunhoNome(nome), [nome]);

  // Aplica na hora (sem precisar reiniciar) o tamanho do texto e a redução de animações.
  useEffect(() => {
    document.documentElement.classList.toggle("sem-animacoes", semAnimacoes);
  }, [semAnimacoes]);

  const contasPagaveis = contas.filter((c) => (c.tipo === "ATIVO" || c.tipo === "PASSIVO") && c.subtipo !== "CATEGORIA" && c.ativa);
  const categorias = contas.filter((c) => c.tipo === "DESPESA" && c.subtipo !== "CATEGORIA" && c.ativa);

  async function exportarConfig() {
    const dados: Record<string, unknown> = {};
    for (const k of CHAVES_EXPORTAVEIS) {
      const v = await lerPreferencia<unknown>(k);
      if (v !== null) dados[k] = v;
    }
    try {
      const caminho = await extras.salvarExportacao(`dairus-configuracoes-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(dados, null, 2));
      toast.success(`Configurações salvas em ${caminho}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function importarConfig() {
    try {
      const dados = JSON.parse(importando) as Record<string, unknown>;
      let n = 0;
      for (const k of CHAVES_EXPORTAVEIS) {
        if (k in dados) {
          await salvarPreferencia(k, dados[k]);
          n++;
        }
      }
      toast.success(`${n} configuração(ões) importada(s). Recarregando…`);
      setTimeout(() => window.location.reload(), 1000);
    } catch {
      toast.error("Texto inválido: cole o conteúdo do arquivo de configurações (JSON).");
    }
  }

  async function restaurarPadroes() {
    for (const k of CHAVES_EXPORTAVEIS) await salvarPreferencia(k, null);
    toast.success("Preferências restauradas. Recarregando…");
    setTimeout(() => window.location.reload(), 1000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-texto-primario"><Settings2 size={20} className="text-primaria" /> Configurações</h1>
        <p className="text-sm text-texto-secundario">Preferências de uso do Dairus. Tudo é salvo neste computador.</p>
      </div>

      <Abas ativa={secao} onChange={setSecao} abas={[{ id: "preferencias", rotulo: "Preferências", icone: UserRound }, { id: "windows", rotulo: "Windows e avisos", icone: MonitorCog }, { id: "mais", rotulo: "Mais opções", icone: Settings2 }, { id: "atalhos", rotulo: "Atalhos e backup das configurações", icone: Keyboard }, { id: "sobre", rotulo: "Sobre", icone: Sparkles }]} />

      {(secao === "preferencias") && (<>
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo={<><UserRound size={16} className="text-primaria" /> Perfil e padrões</>}>
          <div className="space-y-3 text-sm">
            <form onSubmit={(e) => { e.preventDefault(); setNome(rascunhoNome.trim()); toast.success("Nome salvo."); }} className="flex items-center gap-2">
              <input value={rascunhoNome} onChange={(e) => setRascunhoNome(e.target.value)} placeholder="Seu nome (aparece na saudação)" aria-label="Seu nome" className={`${CLASSE_INPUT} flex-1`} />
              <Button type="submit" variante="secundaria" tamanho="pequeno">Salvar</Button>
            </form>
            <label className="block text-xs text-texto-secundario">Conta usada por padrão nas despesas
              <Select aria-label="Conta padrão" value={contaPadrao || ""} onValueChange={setContaPadrao} options={[{ value: "", label: "Primeira da lista" }, ...contasPagaveis.map((c) => ({ value: c.id, label: c.nome }))]} className="mt-1 w-full" />
            </label>
            <label className="block text-xs text-texto-secundario">Categoria padrão das despesas
              <Select aria-label="Categoria padrão" value={categoriaPadrao || ""} onValueChange={setCategoriaPadrao} options={[{ value: "", label: "Primeira da lista" }, ...categorias.map((c) => ({ value: c.id, label: c.nome }))]} className="mt-1 w-full" />
            </label>
            <label className="block text-xs text-texto-secundario">Tela inicial ao abrir o app
              <Select aria-label="Tela inicial" value={paginaInicial} onValueChange={setPaginaInicial} options={PAGINAS_INICIAIS} className="mt-1 w-full" />
            </label>
          </div>
        </Secao>

        <Secao titulo="Aparência e acessibilidade">
          <div className="space-y-4 text-sm">
            <label className="block text-xs text-texto-secundario">Tamanho do texto: <strong className="text-texto-primario">{fonte}%</strong>
              <input type="range" min={85} max={125} step={5} value={fonte} onChange={(e) => setFonte(Number(e.target.value))} aria-label="Tamanho do texto" className="mt-1 w-full accent-[var(--cor-primaria)]" />
            </label>
            <label className="flex items-center gap-2 text-texto-primario"><input type="checkbox" checked={semAnimacoes} onChange={() => setSemAnimacoes(!semAnimacoes)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Reduzir animações e transições</label>
            <label className="flex items-center gap-2 text-texto-primario"><input type="checkbox" checked={ocultar} onChange={() => setOcultar(!ocultar)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Modo privacidade (ocultar saldos e valores)</label>
            <Link to="/temas" className="inline-block text-primaria hover:underline">Escolher tema ({"102"} disponíveis) →</Link>
          </div>
        </Secao>
      </div>
      </>)}

      {(secao === "preferencias") && (<>
      <Secao titulo="Preferências regionais">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-texto-secundario">Moeda</dt><dd className="text-texto-primario">Real (R$)</dd></div>
          <div><dt className="text-texto-secundario">Formato de data</dt><dd className="text-texto-primario">DD/MM/AAAA</dd></div>
          <div><dt className="text-texto-secundario">Fuso horário</dt><dd className="text-texto-primario">America/Sao_Paulo</dd></div>
          <div><dt className="text-texto-secundario">Idioma</dt><dd className="text-texto-primario">Português (Brasil)</dd></div>
        </dl>
        <p className="mt-2 text-xs text-texto-secundario">Estes valores são fixos nesta versão.</p>
      </Secao>
      <ModoViagemConfig />
      </>)}

      {(secao === "windows") && (<>
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo={<><Bell size={16} className="text-primaria" /> Avisos no Windows</>}>
          <div className="space-y-3 text-sm">
            <label className="flex items-center gap-2 text-texto-primario"><input type="checkbox" checked={avisosWindows} onChange={() => setAvisosWindows(!avisosWindows)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Mostrar notificações do Windows</label>
            <p className="text-xs text-texto-secundario">Contas a pagar 3 dias, 1 dia e no dia do vencimento; contas atrasadas; fatura que fecha amanhã ou vence; limite do cartão acima de 90% ou estourado; orçamento estourado e saldo negativo. Cada aviso aparece no máximo uma vez por dia, verificado a cada 30 minutos com o app aberto (ou na bandeja).</p>
            <div className="flex flex-wrap gap-2">
              <Button tamanho="pequeno" variante="secundaria" onClick={() => notificar("Dairus", "As notificações estão funcionando.").then((ok) => (ok ? toast.success("Notificação enviada.") : toast.error("O Windows não permitiu notificações para o Dairus.")))}>Testar notificação</Button>
              <Button tamanho="pequeno" variante="secundaria" onClick={() => verificarAvisosAgora().then((n) => toast.success(n ? `${n} aviso(s) enviado(s).` : "Nenhum aviso novo hoje.")).catch((e) => toast.error(String(e)))}>Verificar agora</Button>
            </div>
          </div>
        </Secao>
        <Secao titulo={<><MonitorCog size={16} className="text-secundaria" /> Janela e inicialização</>}>
          <div className="space-y-3 text-sm">
            <label className="flex items-center gap-2 text-texto-primario"><input type="checkbox" checked={iniciarComWindows} onChange={alternarInicio} className="h-4 w-4 accent-[var(--cor-primaria)]" />Abrir junto com o Windows (começa na bandeja, perto do relógio)</label>
            <label className="flex items-center gap-2 text-texto-primario"><input type="checkbox" checked={fecharParaBandeja} onChange={() => setFecharParaBandeja(!fecharParaBandeja)} className="h-4 w-4 accent-[var(--cor-primaria)]" />O botão fechar só esconde na bandeja (os avisos continuam)</label>
            <label className="flex items-center gap-2 text-texto-primario"><input type="checkbox" checked={bloquearAoMinimizar} onChange={() => setBloquearAoMinimizar(!bloquearAoMinimizar)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Com PIN ativo, bloquear ao minimizar ou quando o Windows bloquear</label>
            <label className="flex items-center gap-2 text-texto-primario"><input type="checkbox" checked={verificacaoSemanal} onChange={() => setVerificacaoSemanal(!verificacaoSemanal)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Verificar o banco de dados uma vez por semana e avisar se houver problema{ultimaVerificacao ? ` (última: ${ultimaVerificacao.split("-").reverse().join("/")})` : ""}</label>
            <p className="text-xs text-texto-secundario">O ícone da bandeja mostra o saldo e a próxima conta ao passar o mouse; clique para abrir, botão direito para o menu (Abrir, Lançamento rápido, Sair).</p>
          </div>
        </Secao>
        <Secao titulo="Registro de erros (log)">
          <p className="text-xs text-texto-secundario">O Dairus grava o que acontece num arquivo de log (até 5 arquivos de 2 MB). Se algo der errado, mande esse arquivo para quem estiver te ajudando. O app não grava seus lançamentos nele de propósito.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button tamanho="pequeno" variante="secundaria" onClick={abrirLogs}><FolderOpen size={13} /> Abrir pasta do log</Button>
            <Button tamanho="pequeno" variante="fantasma" onClick={() => lerLog(200).then((t) => setLog(t || "(log vazio)")).catch((e) => toast.error(String(e)))}>Ver últimas linhas</Button>
          </div>
          {log !== null && <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-borda bg-fundo p-2 text-[11px] text-texto-secundario">{log}</pre>}
        </Secao>
      </div>
      </>)}

      {secao === "mais" && <MaisOpcoes versao={versaoApp} />}

      {(secao === "atalhos") && (<>
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo={<><Keyboard size={16} className="text-secundaria" /> Atalhos de teclado</>}>
          <ul className="space-y-1.5 text-sm">{ATALHOS.map(([tecla, desc]) => <li key={tecla} className="flex items-center justify-between gap-3"><span className="text-texto-secundario">{desc}</span><kbd className="shrink-0 rounded border border-borda bg-fundo px-1.5 py-0.5 text-[11px] text-texto-primario">{tecla}</kbd></li>)}</ul>
        </Secao>
        <Secao titulo="Backup das configurações">
          <p className="text-xs text-texto-secundario">Exporta suas preferências (nunca a chave do Gemini nem o PIN) para levar a outro computador.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button tamanho="pequeno" variante="secundaria" onClick={exportarConfig}><Download size={13} /> Exportar configurações</Button>
            <Button tamanho="pequeno" variante="fantasma" onClick={restaurarPadroes}><RotateCcw size={13} /> Restaurar padrões</Button>
          </div>
          <textarea value={importando} onChange={(e) => setImportando(e.target.value)} rows={3} placeholder="Para importar, cole aqui o conteúdo do arquivo de configurações (JSON)…" aria-label="Importar configurações" className={`${CLASSE_INPUT} mt-3 w-full resize-none text-xs`} />
          <Button tamanho="pequeno" className="mt-2" onClick={importarConfig} disabled={!importando.trim()}>Importar</Button>
        </Secao>
      </div>
      </>)}

      {(secao === "sobre") && (<>
      <Secao titulo={<><Sparkles size={16} className="text-destaque" /> Sobre o Dairus</>}>
        <p className="text-sm text-texto-secundario">
          Versão {versaoApp || "…"}. Motor contábil de partidas dobradas rodando localmente em SQLite, sem necessidade de internet (só o assistente de IA usa a internet, e apenas quando você pergunta).
        </p>
        {banco && <p className="mt-2 break-all text-xs text-texto-secundario">Dados em {banco.caminho} · SQLite {banco.versao_sqlite} · {banco.lancamentos} lançamento(s) · {banco.migracoes} migrações aplicadas.</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <Button tamanho="pequeno" variante="secundaria" onClick={() => window.dispatchEvent(new CustomEvent(EVENTO_VERIFICAR))}>Verificar atualizações</Button>
          <label className="flex items-center gap-2 text-xs text-texto-primario"><input type="checkbox" checked={atualizacaoAuto} onChange={() => setAtualizacaoAuto(!atualizacaoAuto)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Procurar versões novas sozinho (a cada 6 horas)</label>
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-texto-primario">
          <label className="flex items-center gap-2"><input type="checkbox" checked={baixarAuto} onChange={() => setBaixarAuto(!baixarAuto)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Baixar a atualização em segundo plano</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={instalarAoSair} onChange={() => setInstalarAoSair(!instalarAoSair)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Instalar sozinho quando eu fechar o Dairus</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={beta} onChange={() => setBeta(!beta)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Receber versões de teste (beta)</label>
        </div>
        <p className="mt-1 text-[11px] text-texto-secundario">As versões vêm do GitHub (Daizen-Creator/dairus) e, se ele estiver fora do ar, do Supabase. O instalador é conferido (tamanho, formato e SHA-256 quando publicado) antes de instalar, e um backup é feito antes de atualizar na hora.</p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm"><Link to="/backup" className="text-primaria hover:underline">Backup e PIN</Link><Link to="/ia" className="text-primaria hover:underline">Chave do Gemini</Link><Link to="/contabilidade" className="text-primaria hover:underline">Auditoria</Link><Link to="/ajuda" className="text-primaria hover:underline">Ajuda e tutorial</Link></div>
      </Secao>
      </>)}

      {(secao === "sobre") && <ExcluirConta />}

      {(secao === "sobre") && (<>
      <section className="rounded-xl border border-dashed border-borda bg-superficie p-4">
        <h2 className="text-sm font-semibold text-texto-primario">Ainda não implementado</h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-texto-secundario">{PENDENTES.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      </>)}
    </div>
  );
}
