import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { contabilidade } from "../../services/contabilidade";
import { extras } from "../../services/extras";
import { SECOES_PDF, type SecaoPdf } from "../../services/relatorioPdfSecoes";
import { dadosDoUsuario, useAuthStore } from "../../state/auth-store";
import { usePreferencia } from "../../state/usePreferencia";

async function abrirArquivo(caminho: string) {
  try {
    const { openPath } = await import("@tauri-apps/plugin-opener");
    await openPath(caminho);
  } catch (e) {
    toast.error(`Não foi possível abrir o PDF: ${String(e)}`);
  }
}

/** Gera o relatório em PDF do período e salva em Documentos\Dairus\<conta>\Exportacoes. */
export async function gerarEAbrirPdf(inicio: string, fim: string, secoes: Set<SecaoPdf>, titular: { nome: string; email: string }) {
  const [contas, lancamentos, agendamentos, orcamentos, metas, bens] = await Promise.all([
    contabilidade.listarContas(),
    contabilidade.listarLancamentos(20000),
    contabilidade.listarAgendamentos(),
    extras.listarOrcamentos(),
    extras.listarMetas(),
    extras.listarBens(),
  ]);
  // A biblioteca de PDF só é carregada quando alguém gera um relatório.
  const { gerarRelatorioPdf } = await import("../../services/relatorioPdf");
  const bytes = await gerarRelatorioPdf({ inicio, fim, titularNome: titular.nome, titularEmail: titular.email, contas, lancamentos, agendamentos, orcamentos, metas, bens, secoes });
  const caminho = await extras.salvarExportacaoBinaria(`relatorio-dairus-${inicio}-a-${fim}.pdf`, bytes);
  toast.success("Relatório em PDF gerado.", { description: caminho, duration: 10000, action: { label: "Abrir", onClick: () => abrirArquivo(caminho) } });
  await abrirArquivo(caminho);
}

export function useTitular() {
  const sessao = useAuthStore((s) => s.sessao);
  const [apelido] = usePreferencia<string>("nome_usuario", "");
  const { nome, email } = dadosDoUsuario(sessao);
  return { nome: apelido || nome, email };
}

export function PainelPdf({ inicio, fim }: { inicio: string; fim: string }) {
  const [secoes, setSecoes] = usePreferencia<SecaoPdf[]>("pdf_secoes", SECOES_PDF.filter((s) => s.padrao).map((s) => s.id));
  const [gerando, setGerando] = useState(false);
  const titular = useTitular();
  const marcadas = new Set(secoes);

  async function gerar() {
    try {
      setGerando(true);
      await gerarEAbrirPdf(inicio, fim, marcadas, titular);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setGerando(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-texto-secundario">
        A primeira página sempre traz os indicadores, o fluxo de caixa de 12 meses e as despesas por categoria. Escolha o que entra nas páginas seguintes:
      </p>
      <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {SECOES_PDF.map((s) => (
          <li key={s.id}>
            <label className="flex items-center gap-2 text-sm text-texto-primario">
              <input type="checkbox" checked={marcadas.has(s.id)} onChange={() => setSecoes(marcadas.has(s.id) ? secoes.filter((x) => x !== s.id) : [...secoes, s.id])} className="h-4 w-4 accent-[var(--cor-primaria)]" />
              {s.rotulo}
            </label>
          </li>
        ))}
      </ul>
      <Button className="mt-4" onClick={gerar} disabled={gerando}>
        {gerando ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} {gerando ? "Gerando…" : "Gerar relatório em PDF"}
      </Button>
      <p className="mt-2 text-xs text-texto-secundario">O PDF é salvo na pasta de exportações da sua conta e abre automaticamente.</p>
    </div>
  );
}
