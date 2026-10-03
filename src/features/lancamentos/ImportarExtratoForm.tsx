import { useEffect, useState } from "react";
import { FileUp, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { marcaDaDescricao, opcoesCategoria, padronizarDescricao, sugerirCategoria } from "../../services/categorias";
import { formatarCentavos, formatarDataISOParaBR } from "../../services/formato";
import { perguntarIAJson } from "../../services/gemini";
import { chaveDeDuplicidade, lerArquivoTexto, lerExtrato, type LinhaExtrato } from "../../services/importacao";
import { lancExtras, type RegraCategoria } from "../../services/lancamentosExtras";
import { CONTAS_SISTEMA, type Conta, type Lancamento } from "../../types/accounting";

interface ImportarExtratoFormProps {
  contasAtivas: Conta[];
  categoriasDespesa: Conta[];
  categoriasReceita?: Conta[];
  lancamentos: Lancamento[];
  onImportado: () => void;
}

interface LinhaPreview extends LinhaExtrato {
  duplicada: boolean;
  marcada: boolean;
  categoriaId: string;
  origemCategoria: "REGRA" | "HISTORICO" | "IA" | "MANUAL" | "PADRAO";
}

/** Classifica descrições com a IA: devolve índice → id da categoria. */
export async function classificarComIA(descricoes: string[], categorias: Conta[]): Promise<Record<number, string>> {
  const lista = categorias.map((c) => `${c.id}: ${c.nome}`).join("\n");
  const r = await perguntarIAJson<{ classificacoes: Array<{ indice: number; categoria_id: string }> }>({
    instrucao: "Você classifica lançamentos de extrato bancário brasileiro em categorias. Responda só JSON válido.",
    contexto: `Categorias disponíveis (id: nome):\n${lista}`,
    pergunta: `Classifique cada descrição numa das categorias (use exatamente um id da lista; se não souber, use a mais genérica, como "Outras").\nDevolva {"classificacoes":[{"indice":0,"categoria_id":"..."}]}.\n${descricoes.map((d, i) => `${i}: ${d}`).join("\n")}`,
  });
  const validos = new Set(categorias.map((c) => c.id));
  const saida: Record<number, string> = {};
  for (const c of r.classificacoes ?? []) if (validos.has(c.categoria_id)) saida[c.indice] = c.categoria_id;
  return saida;
}

export function ImportarExtratoForm({ contasAtivas, categoriasDespesa, categoriasReceita = [], lancamentos, onImportado }: ImportarExtratoFormProps) {
  const [contaId, setContaId] = useState(contasAtivas[0]?.id ?? "");
  const [categoriaId, setCategoriaId] = useState(
    categoriasDespesa.find((c) => c.id === CONTAS_SISTEMA.despesaOutras)?.id ?? categoriasDespesa[0]?.id ?? "",
  );
  const [inverter, setInverter] = useState(false);
  const [padronizar, setPadronizar] = useState(true);
  const [aprender, setAprender] = useState(true);
  const [bruto, setBruto] = useState<LinhaExtrato[] | null>(null);
  const [marcadas, setMarcadas] = useState<Record<number, boolean>>({});
  const [escolhas, setEscolhas] = useState<Record<number, { id: string; origem: LinhaPreview["origemCategoria"] }>>({});
  const [regras, setRegras] = useState<RegraCategoria[]>([]);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [importando, setImportando] = useState(false);
  const [classificando, setClassificando] = useState(false);
  const todas = [...contasAtivas, ...categoriasDespesa, ...categoriasReceita];
  const receitaPadrao = categoriasReceita.find((c) => c.id === CONTAS_SISTEMA.receitaRendaExtra)?.id ?? CONTAS_SISTEMA.receitaRendaExtra;

  useEffect(() => {
    lancExtras.listarRegras().then(setRegras).catch(() => {});
  }, []);

  // Chaves (data|valor) já lançadas na conta escolhida, para sinalizar prováveis duplicatas.
  const existentes = new Set<string>();
  for (const l of lancamentos) {
    for (const p of l.partidas) {
      if (p.conta_id === contaId) existentes.add(chaveDeDuplicidade(l.data, p.valor_centavos));
    }
  }

  const linhas: LinhaPreview[] = (bruto ?? []).map((l, i) => {
    const valorCentavos = inverter ? -l.valorCentavos : l.valorCentavos;
    const duplicada = existentes.has(chaveDeDuplicidade(l.data, valorCentavos));
    const tipo = valorCentavos < 0 ? "DESPESA" : "RECEITA";
    const escolha = escolhas[i];
    const tipoDaEscolha = escolha ? todas.find((c) => c.id === escolha.id)?.tipo : null;
    let cat = escolha && tipoDaEscolha === tipo ? escolha : null;
    if (!cat) {
      const s = sugerirCategoria(l.descricao, tipo, regras, lancamentos, todas);
      cat = s ? { id: s.categoriaId, origem: s.motivo } : { id: tipo === "DESPESA" ? categoriaId : receitaPadrao, origem: "PADRAO" };
    }
    return { ...l, descricao: padronizar ? padronizarDescricao(l.descricao) : l.descricao, valorCentavos, duplicada, marcada: marcadas[i] ?? !duplicada, categoriaId: cat.id, origemCategoria: cat.origem };
  });
  const selecionadas = linhas.filter((l) => l.marcada);

  async function aoEscolher(ev: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = ev.target.files?.[0];
    if (!arquivo) return;
    try {
      const lidas = lerExtrato(arquivo.name, await lerArquivoTexto(arquivo));
      if (lidas.length === 0) {
        toast.error("Nenhum lançamento encontrado no arquivo.");
        return;
      }
      setBruto(lidas);
      setMarcadas({});
      setEscolhas({});
      setNomeArquivo(arquivo.name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      ev.target.value = "";
    }
  }

  async function classificar() {
    const pendentes = linhas.map((l, i) => ({ l, i })).filter(({ l }) => l.origemCategoria === "PADRAO");
    if (!pendentes.length) return toast.info("Todas as linhas já têm categoria por regra ou histórico.");
    try {
      setClassificando(true);
      const novas: typeof escolhas = { ...escolhas };
      for (const tipo of ["DESPESA", "RECEITA"] as const) {
        const grupo = pendentes.filter(({ l }) => (tipo === "DESPESA" ? l.valorCentavos < 0 : l.valorCentavos > 0));
        if (!grupo.length) continue;
        const r = await classificarComIA(grupo.map(({ l }) => l.descricao), tipo === "DESPESA" ? categoriasDespesa : categoriasReceita);
        grupo.forEach(({ i }, k) => {
          if (r[k]) novas[i] = { id: r[k], origem: "IA" };
        });
      }
      setEscolhas(novas);
      toast.success("Categorias sugeridas pela IA. Confira antes de importar.");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setClassificando(false);
    }
  }

  async function importar() {
    if (!contaId) {
      toast.error("Escolha a conta do extrato.");
      return;
    }
    let ok = 0;
    try {
      setImportando(true);
      for (const l of selecionadas) {
        const valor = Math.abs(l.valorCentavos);
        if (l.valorCentavos < 0) {
          await contabilidade.registrarDespesa({ conta_origem_id: contaId, categoria_despesa_id: l.categoriaId, valor_centavos: valor, data: l.data, descricao: l.descricao });
        } else {
          await contabilidade.registrarRecebimento({ conta_destino_id: contaId, conta_receita_id: l.categoriaId, valor_centavos: valor, data: l.data, descricao: l.descricao });
        }
        ok++;
      }
      // Aprende: o que você escolheu à mão vira regra para os próximos extratos.
      if (aprender) {
        const aprendidas = new Map<string, string>();
        for (const l of selecionadas) if (l.origemCategoria === "MANUAL" || l.origemCategoria === "IA") {
          const marca = marcaDaDescricao(l.descricao);
          if (marca) aprendidas.set(marca, l.categoriaId);
        }
        for (const [padrao, cat] of aprendidas) await lancExtras.salvarRegra(padrao, cat).catch(() => {});
        if (aprendidas.size) toast.info(`${aprendidas.size} regra(s) aprendida(s) para os próximos extratos.`);
      }
      toast.success(`${ok} lançamento(s) importado(s).`);
      setBruto(null);
      onImportado();
    } catch (e) {
      toast.error(`${String(e)} — ${ok} lançamento(s) já tinham sido importados antes do erro.`);
      if (ok > 0) onImportado();
    } finally {
      setImportando(false);
    }
  }

  const ROTULO: Record<LinhaPreview["origemCategoria"], string> = { REGRA: "regra", HISTORICO: "histórico", IA: "IA", MANUAL: "você", PADRAO: "padrão" };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select aria-label="Conta do extrato" value={contaId} onValueChange={setContaId} options={contasAtivas.map((c) => ({ value: c.id, label: c.nome }))} />
        <Select aria-label="Categoria padrão das despesas" value={categoriaId} onValueChange={setCategoriaId} options={opcoesCategoria(categoriasDespesa, todas).map((o) => ({ ...o, label: `Sem regra: ${o.label}` }))} />
        <label className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-primaria/60 text-sm text-primaria transition-colors hover:bg-primaria/10">
          <FileUp size={15} /> Escolher arquivo (.ofx / .csv)
          <input type="file" accept=".ofx,.csv,.txt" onChange={aoEscolher} className="sr-only" aria-label="Arquivo de extrato" />
        </label>
        <label className="flex items-center gap-2 text-xs text-texto-secundario">
          <input type="checkbox" checked={inverter} onChange={(e) => setInverter(e.target.checked)} className="h-4 w-4 accent-[var(--cor-primaria)]" />
          Inverter sinal (use se as despesas vierem positivas, como em faturas de cartão)
        </label>
      </div>

      {bruto && (
        <>
          <div className="flex flex-wrap items-center gap-4 text-xs text-texto-secundario">
            <span>{nomeArquivo}: {linhas.length} linha(s). Duplicatas prováveis vêm desmarcadas.</span>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={padronizar} onChange={() => setPadronizar(!padronizar)} className="h-3.5 w-3.5 accent-[var(--cor-primaria)]" />Padronizar descrições</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={aprender} onChange={() => setAprender(!aprender)} className="h-3.5 w-3.5 accent-[var(--cor-primaria)]" />Aprender as categorias que eu escolher</label>
            <Button tamanho="pequeno" variante="secundaria" onClick={classificar} disabled={classificando}><Sparkles size={13} /> {classificando ? "Classificando…" : "Classificar o resto com IA"}</Button>
          </div>
          <div className="max-h-96 overflow-y-auto rounded-lg border border-borda">
            <table className="w-full text-sm">
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={i} className="border-b border-borda/60 last:border-0">
                    <td className="w-8 px-3 py-1.5">
                      <input type="checkbox" checked={l.marcada} aria-label={`Importar ${l.descricao}`} onChange={(e) => setMarcadas((m) => ({ ...m, [i]: e.target.checked }))} className="h-4 w-4 accent-[var(--cor-primaria)]" />
                    </td>
                    <td className="py-1.5 pr-3 text-xs text-texto-secundario">{formatarDataISOParaBR(l.data)}</td>
                    <td className="py-1.5 pr-3 text-texto-primario">
                      {l.descricao}
                      {l.duplicada && <span className="ml-2 rounded-full border border-alerta/70 px-1.5 py-0.5 text-[10px] text-alerta">possível duplicata</span>}
                    </td>
                    <td className="py-1 pr-3">
                      <div className="flex items-center gap-1.5">
                        <Select
                          aria-label={`Categoria de ${l.descricao}`}
                          value={l.categoriaId}
                          onValueChange={(v) => setEscolhas((s) => ({ ...s, [i]: { id: v, origem: "MANUAL" } }))}
                          options={opcoesCategoria(l.valorCentavos < 0 ? categoriasDespesa : categoriasReceita, todas)}
                          className="w-48"
                        />
                        <span className="text-[10px] text-texto-secundario">{ROTULO[l.origemCategoria]}</span>
                      </div>
                    </td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums ${l.valorCentavos < 0 ? "text-erro" : "text-sucesso"}`}>{formatarCentavos(l.valorCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button onClick={importar} disabled={importando || selecionadas.length === 0}>
              {importando ? "Importando…" : `Importar ${selecionadas.length} lançamento(s)`}
            </Button>
            <Button variante="fantasma" onClick={() => setBruto(null)}>Cancelar</Button>
          </div>
        </>
      )}
    </div>
  );
}
