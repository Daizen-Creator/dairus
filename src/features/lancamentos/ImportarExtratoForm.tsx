import { useState } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { formatarCentavos, formatarDataISOParaBR } from "../../services/formato";
import { chaveDeDuplicidade, lerArquivoTexto, lerExtrato, type LinhaExtrato } from "../../services/importacao";
import { CONTAS_SISTEMA, type Conta, type Lancamento } from "../../types/accounting";

interface ImportarExtratoFormProps {
  contasAtivas: Conta[];
  categoriasDespesa: Conta[];
  lancamentos: Lancamento[];
  onImportado: () => void;
}

interface LinhaPreview extends LinhaExtrato {
  duplicada: boolean;
  marcada: boolean;
}

export function ImportarExtratoForm({ contasAtivas, categoriasDespesa, lancamentos, onImportado }: ImportarExtratoFormProps) {
  const [contaId, setContaId] = useState(contasAtivas[0]?.id ?? "");
  const [categoriaId, setCategoriaId] = useState(
    categoriasDespesa.find((c) => c.id === CONTAS_SISTEMA.despesaOutras)?.id ?? categoriasDespesa[0]?.id ?? "",
  );
  const [inverter, setInverter] = useState(false);
  const [bruto, setBruto] = useState<LinhaExtrato[] | null>(null);
  const [marcadas, setMarcadas] = useState<Record<number, boolean>>({});
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [importando, setImportando] = useState(false);

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
    return { ...l, valorCentavos, duplicada, marcada: marcadas[i] ?? !duplicada };
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
      setNomeArquivo(arquivo.name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      ev.target.value = "";
    }
  }

  async function importar() {
    if (!contaId || !categoriaId) {
      toast.error("Escolha a conta e a categoria padrão das despesas.");
      return;
    }
    let ok = 0;
    try {
      setImportando(true);
      for (const l of selecionadas) {
        const valor = Math.abs(l.valorCentavos);
        if (l.valorCentavos < 0) {
          await contabilidade.registrarDespesa({
            conta_origem_id: contaId,
            categoria_despesa_id: categoriaId,
            valor_centavos: valor,
            data: l.data,
            descricao: l.descricao,
          });
        } else {
          await contabilidade.registrarRecebimento({
            conta_destino_id: contaId,
            conta_receita_id: CONTAS_SISTEMA.receitaRendaExtra,
            valor_centavos: valor,
            data: l.data,
            descricao: l.descricao,
          });
        }
        ok++;
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

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select aria-label="Conta do extrato" value={contaId} onValueChange={setContaId} options={contasAtivas.map((c) => ({ value: c.id, label: c.nome }))} />
        <Select aria-label="Categoria padrão das despesas" value={categoriaId} onValueChange={setCategoriaId} options={categoriasDespesa.map((c) => ({ value: c.id, label: `Despesas em: ${c.nome}` }))} />
        <label className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-primaria/60 text-sm text-primaria transition-colors hover:bg-primaria/10">
          <FileUp size={15} /> Escolher arquivo (.ofx / .csv)
          <input type="file" accept=".ofx,.csv,.txt" onChange={aoEscolher} className="sr-only" />
        </label>
        <label className="flex items-center gap-2 text-xs text-texto-secundario">
          <input type="checkbox" checked={inverter} onChange={(e) => setInverter(e.target.checked)} className="h-4 w-4 accent-[var(--cor-primaria)]" />
          Inverter sinal (use se as despesas vierem positivas, como em faturas de cartão)
        </label>
      </div>

      {bruto && (
        <>
          <p className="text-xs text-texto-secundario">
            {nomeArquivo}: {linhas.length} linha(s). Receitas importadas vão para “Renda Extra”; linhas com mesma data e valor já lançados na conta vêm desmarcadas como prováveis duplicatas.
          </p>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-borda">
            <table className="w-full text-sm">
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={i} className="border-b border-borda/60 last:border-0">
                    <td className="w-8 px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={l.marcada}
                        aria-label={`Importar ${l.descricao}`}
                        onChange={(e) => setMarcadas((m) => ({ ...m, [i]: e.target.checked }))}
                        className="h-4 w-4 accent-[var(--cor-primaria)]"
                      />
                    </td>
                    <td className="py-1.5 pr-3 text-xs text-texto-secundario">{formatarDataISOParaBR(l.data)}</td>
                    <td className="py-1.5 pr-3 text-texto-primario">
                      {l.descricao}
                      {l.duplicada && <span className="ml-2 rounded-full border border-alerta/70 px-1.5 py-0.5 text-[10px] text-alerta">possível duplicata</span>}
                    </td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums ${l.valorCentavos < 0 ? "text-erro" : "text-sucesso"}`}>
                      {formatarCentavos(l.valorCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button onClick={importar} disabled={importando || selecionadas.length === 0}>
              {importando ? "Importando…" : `Importar ${selecionadas.length} lançamento(s)`}
            </Button>
            <Button variante="fantasma" onClick={() => setBruto(null)}>
              Cancelar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
