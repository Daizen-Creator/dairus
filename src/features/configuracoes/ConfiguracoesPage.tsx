import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Keyboard, RotateCcw, Settings2, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { extras } from "../../services/extras";
import { lerPreferencia, salvarPreferencia } from "../../services/armazenamento";
import { usePreferencia } from "../../state/usePreferencia";
import type { Conta } from "../../types/accounting";
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
  ["Enter", "Salvar um limite no Orçamento; enviar pergunta à IA"],
  ["Shift + Enter", "Quebrar linha na pergunta à IA"],
];

const PENDENTES = [
  "Exportação de relatórios em Excel (.xlsx) (hoje: CSV e impressão/PDF pelo sistema)",
  "Criptografia do banco de dados e dos backups",
  "Login com Google e sincronização em nuvem",
  "Busca automática de preços no Radar de Compras (hoje: preços informados por você)",
  "Conciliação bancária automática (hoje: importação manual de OFX/CSV com aviso de duplicatas)",
  "Parcelamento de compras no cartão com liberação gradual do limite",
];

/** Chaves de preferências que podem ser exportadas/importadas (nunca a chave do Gemini nem o PIN). */
const CHAVES_EXPORTAVEIS = [
  "nome_usuario", "ocultar_saldos", "conta_principal", "conta_padrao", "categoria_padrao", "pagina_inicial",
  "ui_fonte", "ui_sem_animacoes", "dashboard_secoes_ocultas", "orcamento_renda_base", "perfil_renda",
  "backup_auto", "backup_frequencia", "backup_retencao", "gemini_modelo", "gemini_tom", "gemini_temperatura",
  "gemini_blocos", "gemini_anonimo", "tema_ativo",
];

export function ConfiguracoesPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [banco, setBanco] = useState<InfoBanco | null>(null);
  const [nome, setNome] = usePreferencia<string>("nome_usuario", "");
  const [rascunhoNome, setRascunhoNome] = useState("");
  const [contaPadrao, setContaPadrao] = usePreferencia<string>("conta_padrao", "");
  const [categoriaPadrao, setCategoriaPadrao] = usePreferencia<string>("categoria_padrao", "");
  const [paginaInicial, setPaginaInicial] = usePreferencia<string>("pagina_inicial", "/");
  const [fonte, setFonte] = usePreferencia<number>("ui_fonte", 100);
  const [semAnimacoes, setSemAnimacoes] = usePreferencia<boolean>("ui_sem_animacoes", false);
  const [ocultar, setOcultar] = usePreferencia<boolean>("ocultar_saldos", false);
  const [importando, setImportando] = useState("");

  useEffect(() => {
    contabilidade.listarContas().then(setContas).catch(() => {});
    extras.infoBanco().then(setBanco).catch(() => {});
  }, []);

  useEffect(() => setRascunhoNome(nome), [nome]);

  // Aplica na hora (sem precisar reiniciar) o tamanho do texto e a redução de animações.
  useEffect(() => {
    document.documentElement.style.fontSize = `${fonte}%`;
  }, [fonte]);
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

      <Secao titulo="Preferências regionais">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-texto-secundario">Moeda</dt><dd className="text-texto-primario">Real (R$)</dd></div>
          <div><dt className="text-texto-secundario">Formato de data</dt><dd className="text-texto-primario">DD/MM/AAAA</dd></div>
          <div><dt className="text-texto-secundario">Fuso horário</dt><dd className="text-texto-primario">America/Sao_Paulo</dd></div>
          <div><dt className="text-texto-secundario">Idioma</dt><dd className="text-texto-primario">Português (Brasil)</dd></div>
        </dl>
        <p className="mt-2 text-xs text-texto-secundario">Estes valores são fixos nesta versão.</p>
      </Secao>

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

      <Secao titulo={<><Sparkles size={16} className="text-destaque" /> Sobre o Dairus</>}>
        <p className="text-sm text-texto-secundario">
          Versão 0.1.0. Motor contábil de partidas dobradas rodando localmente em SQLite, sem necessidade de internet (só o assistente de IA usa a internet, e apenas quando você pergunta).
        </p>
        {banco && <p className="mt-2 break-all text-xs text-texto-secundario">Dados em {banco.caminho} · SQLite {banco.versao_sqlite} · {banco.lancamentos} lançamento(s) · {banco.migracoes} migrações aplicadas.</p>}
        <div className="mt-3 flex flex-wrap gap-4 text-sm"><Link to="/backup" className="text-primaria hover:underline">Backup e PIN</Link><Link to="/ia" className="text-primaria hover:underline">Chave do Gemini</Link><Link to="/contabilidade" className="text-primaria hover:underline">Auditoria</Link></div>
      </Secao>

      <section className="rounded-xl border border-dashed border-borda bg-superficie p-4">
        <h2 className="text-sm font-semibold text-texto-primario">Ainda não implementado</h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-texto-secundario">{PENDENTES.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
    </div>
  );
}
