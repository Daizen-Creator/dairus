import { useState } from "react";
import { FileUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { investimentos } from "../../services/investimentos";
import { formatarCentavos, formatarDataISOParaBR } from "../../services/formato";
import { CONTA_JA_TINHA, ROTULO_CLASSE, type ClasseAtivo, type OperacaoInvest } from "../../types/investimentos";
import { FormAtivo, FormOperacao } from "./Formularios";
import { classePeloTicker, lerExtratoB3, type LinhaB3 } from "./importacaoB3";
import type { Carteira } from "./useCarteira";

const TIPO_LEGIVEL: Record<OperacaoInvest["tipo"], string> = {
  COMPRA: "Compra",
  VENDA: "Venda",
  DIVIDENDO: "Dividendo",
  JCP: "JCP",
  RENDIMENTO: "Rendimento",
  AMORTIZACAO: "Amortização",
};

export function AbaLancar({ carteira }: { carteira: Carteira }) {
  const { ativos, ops, contas, recarregar } = carteira;
  const [novoAtivo, setNovoAtivo] = useState(ativos.length === 0);
  const [ativoRecente, setAtivoRecente] = useState<string | undefined>();
  const [chaveForm, setChaveForm] = useState(0);
  const codigoDe = new Map(ativos.map((a) => [a.id, a.codigo]));

  async function excluir(op: OperacaoInvest) {
    try {
      await investimentos.excluirOperacao(op.id);
      toast.success(op.lancamento_id ? "Operação excluída e lançamento estornado." : "Operação excluída.");
      recarregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="space-y-4">
      <Secao titulo="Novo ativo" acao={!novoAtivo && <Button tamanho="pequeno" variante="secundaria" onClick={() => setNovoAtivo(true)}><Plus size={13} /> Cadastrar ativo</Button>}>
        {novoAtivo ? (
          <FormAtivo
            onSalvo={async (id) => {
              setNovoAtivo(false);
              setAtivoRecente(id);
              await recarregar();
              setChaveForm((k) => k + 1);
            }}
            onCancelar={() => setNovoAtivo(false)}
          />
        ) : (
          <p className="text-sm text-texto-secundario">Ações, FIIs, ETFs, BDRs, Tesouro Direto, CDB, LCI/LCA, poupança, cripto e previdência. Para renda fixa, informe o indexador e a taxa: o valor de hoje é estimado sozinho.</p>
        )}
      </Secao>

      <Secao titulo="Registrar operação">
        <FormOperacao key={`${chaveForm}-${ativos.length}`} ativos={ativos} contas={contas} ativoInicial={ativoRecente} onRegistrada={recarregar} />
        <p className="mt-3 text-[11px] text-texto-secundario">
          Com uma conta escolhida, o Dairus lança o dinheiro saindo (compra) ou entrando (venda e proventos) e o lucro, o prejuízo, as taxas e o IR vão para as categorias de investimentos. “Já tinha” registra algo comprado antes de usar o Dairus, sem tirar dinheiro das contas.
        </p>
      </Secao>

      <ImportarB3 carteira={carteira} />

      <Secao titulo={`Operações (${ops.length})`}>
        {ops.length === 0 ? (
          <p className="text-sm text-texto-secundario">Nenhuma operação ainda.</p>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-texto-secundario">
                <tr><th className="py-1.5 pr-3">Data</th><th className="pr-3">Ativo</th><th className="pr-3">Tipo</th><th className="pr-3 text-right">Qtd.</th><th className="pr-3 text-right">Valor</th><th className="pr-3 text-right">Resultado</th><th /></tr>
              </thead>
              <tbody>
                {[...ops].reverse().map((o) => (
                  <tr key={o.id} className="border-t border-borda">
                    <td className="py-1.5 pr-3 tabular-nums">{formatarDataISOParaBR(o.data)}</td>
                    <td className="pr-3">{codigoDe.get(o.ativo_id)}</td>
                    <td className="pr-3">{TIPO_LEGIVEL[o.tipo]}{o.day_trade ? " (day trade)" : ""}{o.conta_id === CONTA_JA_TINHA ? " · já tinha" : ""}</td>
                    <td className="pr-3 text-right tabular-nums">{o.quantidade ? o.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 8 }) : "—"}</td>
                    <td className="pr-3 text-right tabular-nums">{formatarCentavos(o.valor_centavos)}</td>
                    <td className={`pr-3 text-right tabular-nums ${o.tipo === "VENDA" ? (o.valor_centavos - o.taxas_centavos - (o.custo_centavos ?? 0) >= 0 ? "text-sucesso" : "text-erro") : ""}`}>
                      {o.tipo === "VENDA" ? formatarCentavos(o.valor_centavos - o.taxas_centavos - (o.custo_centavos ?? 0)) : ""}
                    </td>
                    <td className="text-right"><button onClick={() => excluir(o)} aria-label="Excluir operação" title="Só a última operação de cada ativo pode ser excluída" className="rounded p-1 text-texto-secundario hover:text-erro"><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </div>
  );
}

/** Importa o extrato de negociação ou de movimentação da B3 (salvo como CSV). */
function ImportarB3({ carteira }: { carteira: Carteira }) {
  const { ativos, contas, recarregar } = carteira;
  const [linhas, setLinhas] = useState<LinhaB3[]>([]);
  const [classes, setClasses] = useState<Record<string, ClasseAtivo>>({});
  const [contaId, setContaId] = useState<string>(CONTA_JA_TINHA);
  const [importando, setImportando] = useState(false);
  const origens = contas.filter((c) => c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA" && c.subtipo !== "INVESTIMENTO" && c.ativa);
  const existentes = new Map(ativos.map((a) => [a.codigo, a]));
  const novos = [...new Set(linhas.map((l) => l.codigo))].filter((c) => !existentes.has(c));

  async function lerArquivo(arquivo: File) {
    const bruto = new Uint8Array(await arquivo.arrayBuffer());
    let texto = new TextDecoder("utf-8").decode(bruto);
    if (texto.includes("�")) texto = new TextDecoder("windows-1252").decode(bruto);
    const r = lerExtratoB3(texto);
    if (!r.formato) return toast.error("Não reconheci o arquivo. Na B3, baixe Extratos → Negociação ou Movimentação e salve como CSV no Excel.");
    setLinhas(r.linhas.sort((a, b) => a.data.localeCompare(b.data)));
    setClasses(Object.fromEntries([...new Set(r.linhas.map((l) => l.codigo))].map((c) => [c, existentes.get(c)?.classe ?? classePeloTicker(c)])));
    toast.success(`${r.linhas.length} operação(ões) encontradas${r.ignoradas ? `; ${r.ignoradas} linha(s) ignorada(s) (transferências e outras)` : ""}.`);
  }

  async function importar() {
    setImportando(true);
    let feitas = 0;
    const erros: string[] = [];
    try {
      const ids = new Map([...existentes.entries()].map(([c, a]) => [c, a.id]));
      for (const codigo of novos) ids.set(codigo, await investimentos.salvarAtivo({ codigo, classe: classes[codigo] ?? "ACAO" }));
      for (const l of linhas) {
        try {
          await investimentos.registrarOperacao({
            ativo_id: ids.get(l.codigo)!,
            tipo: l.tipo,
            data: l.data,
            quantidade: l.quantidade,
            preco_unitario: l.preco,
            valor_centavos: l.valorCentavos,
            conta_id: l.tipo === "COMPRA" ? contaId || null : contaId === CONTA_JA_TINHA ? null : contaId || null,
            notas: "Importado da B3",
          });
          feitas++;
        } catch (e) {
          erros.push(`${l.data} ${l.codigo}: ${String(e)}`);
        }
      }
      toast[erros.length ? "warning" : "success"](`${feitas} operação(ões) importada(s).${erros.length ? ` ${erros.length} com erro: ${erros.slice(0, 2).join("; ")}` : ""}`, { duration: 10000 });
      setLinhas([]);
      recarregar();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setImportando(false);
    }
  }

  return (
    <Secao titulo={<><FileUp size={16} className="text-secundaria" /> Importar extrato da B3</>}>
      <p className="text-sm text-texto-secundario">Na Área do Investidor da B3, baixe <strong>Extratos → Negociação</strong> (compras e vendas) e/ou <strong>Movimentação</strong> (dividendos, JCP, rendimentos), abra no Excel e salve como CSV.</p>
      <input type="file" accept=".csv,text/csv" aria-label="Arquivo CSV da B3" onChange={(e) => e.target.files?.[0] && lerArquivo(e.target.files[0])} className={`${CLASSE_INPUT} mt-3 w-full`} />
      {linhas.length > 0 && (
        <div className="mt-3 space-y-3">
          {novos.length > 0 && (
            <div>
              <p className="text-xs text-texto-secundario">Ativos novos — confira o tipo:</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {novos.map((c) => (
                  <label key={c} className="flex items-center gap-1.5 text-xs text-texto-primario">{c}
                    <Select aria-label={`Tipo de ${c}`} value={classes[c] ?? "ACAO"} onValueChange={(v) => setClasses((s) => ({ ...s, [c]: v as ClasseAtivo }))} options={["ACAO", "FII", "ETF", "BDR"].map((k) => ({ value: k, label: ROTULO_CLASSE[k as ClasseAtivo] }))} className="w-32" />
                  </label>
                ))}
              </div>
            </div>
          )}
          <label className="block text-xs text-texto-secundario">Dinheiro das operações
            <Select aria-label="Conta da importação" value={contaId} onValueChange={setContaId} options={[{ value: CONTA_JA_TINHA, label: "Histórico antigo: não mexer nas contas" }, ...origens.map((c) => ({ value: c.id, label: `Lançar na conta ${c.nome}` }))]} className="mt-1 w-full" />
          </label>
          <p className="text-xs text-texto-secundario">{linhas.length} operação(ões) de {linhas[0].data.split("-").reverse().join("/")} a {linhas[linhas.length - 1].data.split("-").reverse().join("/")}. Importar o mesmo arquivo duas vezes duplica as operações.</p>
          <div className="flex gap-2">
            <Button tamanho="pequeno" onClick={importar} disabled={importando}>{importando ? "Importando…" : `Importar ${linhas.length}`}</Button>
            <Button tamanho="pequeno" variante="fantasma" onClick={() => setLinhas([])}>Cancelar</Button>
          </div>
        </div>
      )}
    </Secao>
  );
}
