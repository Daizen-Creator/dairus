import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Landmark } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { dataAtualISO, formatarCentavos, formatarDataISOParaBR, valorInputParaCentavos } from "../../services/formato";
import { planejamento, type Emprestimo } from "../../services/planejamento";
import type { Conta } from "../../types/accounting";

/** Empréstimos e financiamentos com tabela Price ou SAC e saldo devedor. */
export function AbaEmprestimos({ onAlterado }: { onAlterado?: () => void }) {
  const [lista, setLista] = useState<Emprestimo[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [contaPagto, setContaPagto] = useState("");
  const [f, setF] = useState({ nome: "", sistema: "PRICE" as "PRICE" | "SAC", valor: "", taxa: "", parcelas: "12", primeiro: dataAtualISO(), destino: "" });
  const origens = contas.filter((c) => c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA" && c.ativa);

  async function carregar() {
    try {
      const [l, c] = await Promise.all([planejamento.listarEmprestimos(), contabilidade.listarContas()]);
      setLista(l);
      setContas(c);
    } catch (e) {
      toast.error(String(e));
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  async function criar(ev: React.FormEvent) {
    ev.preventDefault();
    try {
      await planejamento.criarEmprestimo({
        nome: f.nome,
        sistema: f.sistema,
        principal_centavos: valorInputParaCentavos(f.valor),
        taxa_mensal: (Number(f.taxa.replace(",", ".")) || 0) / 100,
        parcelas: Math.floor(Number(f.parcelas) || 0),
        primeiro_vencimento: f.primeiro,
        conta_destino_id: f.destino || null,
      });
      toast.success("Empréstimo cadastrado. A dívida entrou no patrimônio.");
      setF({ ...f, nome: "", valor: "", taxa: "" });
      await carregar();
      onAlterado?.();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function pagar(e: Emprestimo) {
    const conta = contaPagto || origens[0]?.id;
    if (!conta) return toast.error("Cadastre uma conta para pagar.");
    try {
      await planejamento.pagarParcela(e.id, conta, dataAtualISO());
      toast.success("Parcela paga: amortização reduziu a dívida e os juros viraram despesa.");
      await carregar();
      onAlterado?.();
    } catch (er) {
      toast.error(String(er));
    }
  }

  return (
    <div className="space-y-4">
      <Secao titulo={<><Landmark size={16} className="text-primaria" /> Novo empréstimo ou financiamento</>}>
        <form onSubmit={criar} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Nome (ex.: Financiamento do carro)" aria-label="Nome do empréstimo" className={`${CLASSE_INPUT} lg:col-span-2`} />
          <Select aria-label="Sistema" value={f.sistema} onValueChange={(v) => setF({ ...f, sistema: v as "PRICE" | "SAC" })} options={[{ value: "PRICE", label: "Price (parcelas iguais)" }, { value: "SAC", label: "SAC (parcelas decrescentes)" }]} />
          <input value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} inputMode="decimal" placeholder="Valor financiado (R$)" aria-label="Valor financiado" className={CLASSE_INPUT} />
          <input value={f.taxa} onChange={(e) => setF({ ...f, taxa: e.target.value })} inputMode="decimal" placeholder="Juros % ao mês (ex.: 1,8)" aria-label="Juros ao mês" className={CLASSE_INPUT} />
          <input type="number" min={1} max={600} value={f.parcelas} onChange={(e) => setF({ ...f, parcelas: e.target.value })} aria-label="Número de parcelas" className={CLASSE_INPUT} />
          <label className="text-xs text-texto-secundario">1ª parcela<input type="date" value={f.primeiro} onChange={(e) => setF({ ...f, primeiro: e.target.value })} aria-label="Primeira parcela" className={`${CLASSE_INPUT} mt-1 block w-full`} /></label>
          <Select aria-label="Dinheiro recebido em" value={f.destino} onValueChange={(v) => setF({ ...f, destino: v })} options={[{ value: "", label: "Dívida que já existia (não entra dinheiro)" }, ...origens.map((c) => ({ value: c.id, label: `Dinheiro entrou em ${c.nome}` }))]} />
          <Button type="submit" className="lg:col-start-4">Cadastrar</Button>
        </form>
      </Secao>

      {lista.length === 0 ? <p className="text-sm text-texto-secundario">Nenhum empréstimo cadastrado.</p> : (
        <>
          <label className="flex items-center gap-2 text-xs text-texto-secundario">Pagar parcelas com
            <Select aria-label="Conta de pagamento das parcelas" value={contaPagto || origens[0]?.id || ""} onValueChange={setContaPagto} options={origens.map((c) => ({ value: c.id, label: c.nome }))} className="w-48" />
          </label>
          {lista.map((e) => {
            const proxima = e.tabela.find((p) => !e.pagas.includes(p.numero));
            const jurosRestantes = e.tabela.filter((p) => !e.pagas.includes(p.numero)).reduce((s, p) => s + p.juros, 0);
            return (
              <Secao key={e.id} titulo={`${e.nome} · ${e.sistema === "PRICE" ? "Price" : "SAC"} · ${(e.taxa_mensal * 100).toFixed(2).replace(".", ",")}% a.m.`}>
                <div className="grid gap-3 text-sm sm:grid-cols-4">
                  <div><p className="text-xs text-texto-secundario">Saldo devedor</p><p className="text-lg font-semibold text-erro">{formatarCentavos(e.saldo_devedor_centavos)}</p></div>
                  <div><p className="text-xs text-texto-secundario">Parcelas pagas</p><p className="text-lg font-semibold">{e.pagas.length} de {e.parcelas}</p></div>
                  <div><p className="text-xs text-texto-secundario">Próxima</p><p className="text-lg font-semibold">{proxima ? `${formatarCentavos(proxima.parcela)} em ${formatarDataISOParaBR(proxima.vencimento)}` : "Quitado"}</p></div>
                  <div><p className="text-xs text-texto-secundario">Juros que ainda vai pagar</p><p className="text-lg font-semibold">{formatarCentavos(jurosRestantes)}</p></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {proxima && <Button tamanho="pequeno" onClick={() => pagar(e)}>Pagar parcela {proxima.numero}</Button>}
                  <Button tamanho="pequeno" variante="fantasma" onClick={() => setAberto(aberto === e.id ? null : e.id)}>{aberto === e.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Tabela de parcelas</Button>
                </div>
                {aberto === e.id && (
                  <div className="mt-3 max-h-80 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="text-left text-texto-secundario"><tr><th className="py-1">Nº</th><th>Vencimento</th><th className="text-right">Parcela</th><th className="text-right">Juros</th><th className="text-right">Amortização</th><th className="text-right">Saldo</th><th /></tr></thead>
                      <tbody>{e.tabela.map((p) => (
                        <tr key={p.numero} className={`border-t border-borda ${e.pagas.includes(p.numero) ? "opacity-50" : ""}`}>
                          <td className="py-1">{p.numero}</td><td>{formatarDataISOParaBR(p.vencimento)}</td><td className="text-right tabular-nums">{formatarCentavos(p.parcela)}</td><td className="text-right tabular-nums">{formatarCentavos(p.juros)}</td><td className="text-right tabular-nums">{formatarCentavos(p.amortizacao)}</td><td className="text-right tabular-nums">{formatarCentavos(p.saldo_depois)}</td><td className="pl-2 text-sucesso">{e.pagas.includes(p.numero) ? "paga" : ""}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </Secao>
            );
          })}
        </>
      )}
    </div>
  );
}
