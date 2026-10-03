import { useState } from "react";
import { Merge, Pencil, Trash2, FolderTree } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { extras } from "../../services/extras";
import { formatarCentavos, formatarDataISOParaBR } from "../../services/formato";
import { gestao, gestaoCategorias, type UsoDaConta } from "../../services/gestao";
import { opcoesCategoria } from "../../services/categorias";
import { avisarDadosAlterados } from "../../state/useAoAlterarDados";
import type { Conta, Lancamento } from "../../types/accounting";

interface Props {
  categoria: Conta;
  contas: Conta[];
  lancamentos: Lancamento[];
  inicio: string;
  fim: string;
  necessidade: boolean;
  onNecessidade: (v: boolean) => void;
  onAlterado: () => void;
}

/** Renomear, mover para dentro de outra, juntar, excluir e ver os lançamentos do mês da categoria. */
export function GerenciarCategoria({ categoria, contas, lancamentos, inicio, fim, necessidade, onNecessidade, onAlterado }: Props) {
  const [nome, setNome] = useState(categoria.nome);
  const [pai, setPai] = useState(categoria.categoria_pai_id ?? "");
  const [destino, setDestino] = useState("");
  const [uso, setUso] = useState<UsoDaConta | null>(null);
  const [confirmar, setConfirmar] = useState("");
  const irmas = contas.filter((c) => c.tipo === categoria.tipo && c.ativa && c.subtipo !== "CATEGORIA" && c.id !== categoria.id);
  const doMes = lancamentos
    .filter((l) => l.data >= inicio && l.data <= fim && l.origem !== "ESTORNO" && l.partidas.some((p) => p.conta_id === categoria.id))
    .sort((a, b) => b.data.localeCompare(a.data));

  async function executar(acao: () => Promise<unknown>, ok: string) {
    try {
      await acao();
      toast.success(ok);
      avisarDadosAlterados();
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-borda pt-3 text-xs">
      <div>
        <p className="mb-1 font-semibold text-texto-primario">Lançamentos deste mês ({doMes.length})</p>
        {doMes.length === 0 ? <p className="text-texto-secundario">Nenhum.</p> : (
          <ul className="max-h-40 space-y-0.5 overflow-y-auto pr-1">
            {doMes.map((l) => (
              <li key={l.id} className="flex justify-between gap-2">
                <span className="truncate text-texto-secundario">{formatarDataISOParaBR(l.data).slice(0, 5)} · <span className="text-texto-primario">{l.descricao}</span></span>
                <span className="shrink-0 tabular-nums">{formatarCentavos(l.partidas.filter((p) => p.conta_id === categoria.id).reduce((s, p) => s + (p.tipo === "DEBITO" ? p.valor_centavos : -p.valor_centavos), 0))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <label className="flex items-center gap-2 text-texto-primario">
        <input type="checkbox" checked={necessidade} onChange={() => onNecessidade(!necessidade)} className="h-3.5 w-3.5 accent-[var(--cor-primaria)]" />
        É uma necessidade (conta nos 50% da regra 50/30/20)
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        <Pencil size={12} className="text-texto-secundario" />
        <input value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Novo nome da categoria" className={`${CLASSE_INPUT} w-40 py-1`} />
        <Button tamanho="pequeno" variante="secundaria" disabled={!nome.trim() || nome === categoria.nome} onClick={() => executar(() => gestaoCategorias.renomear(categoria.id, nome), "Categoria renomeada.")}>Renomear</Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <FolderTree size={12} className="text-texto-secundario" />
        <Select aria-label="Colocar dentro de" value={pai} onValueChange={setPai} options={[{ value: "", label: "É uma categoria principal" }, ...opcoesCategoria(irmas, contas).map((o) => ({ ...o, label: `Dentro de ${o.label}` }))]} className="w-52" />
        <Button tamanho="pequeno" variante="secundaria" disabled={pai === (categoria.categoria_pai_id ?? "")} onClick={() => executar(() => gestaoCategorias.definirPai(categoria.id, pai || null), pai ? "Agora é uma subcategoria." : "Agora é uma categoria principal.")}>Mover</Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Merge size={12} className="text-texto-secundario" />
        <Select aria-label="Juntar com a categoria" value={destino} onValueChange={setDestino} options={[{ value: "", label: "Juntar com…" }, ...opcoesCategoria(irmas, contas)]} className="w-52" />
        <Button tamanho="pequeno" variante="secundaria" disabled={!destino || categoria.sistema} onClick={() => executar(async () => { await extras.criarBackup(); await gestao.mesclarContas(categoria.id, destino); }, "Categorias juntadas (histórico, limites e regras foram para a escolhida).")}>Juntar</Button>
        {categoria.sistema && <span className="text-texto-secundario">Categorias do app não podem ser apagadas; junte outra nesta.</span>}
      </div>
      {!categoria.sistema && (
        <div className="rounded-lg border border-erro/40 p-2">
          {!uso ? (
            <button onClick={() => gestao.usoDaConta(categoria.id).then(setUso).catch((e) => toast.error(String(e)))} className="inline-flex items-center gap-1 text-erro hover:underline"><Trash2 size={12} /> Excluir categoria</button>
          ) : uso.lancamentos === 0 ? (
            <span className="flex flex-wrap items-center gap-2">
              Excluir “{categoria.nome}”?{uso.agendamentos ? ` ${uso.agendamentos} conta(s) agendada(s) também saem.` : ""}
              <Button tamanho="pequeno" variante="perigo" onClick={() => executar(() => gestao.excluirConta(categoria.id, false), "Categoria excluída.")}>Excluir</Button>
              <Button tamanho="pequeno" variante="fantasma" onClick={() => setUso(null)}>Cancelar</Button>
            </span>
          ) : (
            <div className="space-y-1.5">
              <p>Tem {uso.lancamentos} lançamento(s). Melhor juntar com outra categoria (não perde nada). Para apagar junto, digite EXCLUIR:</p>
              <span className="flex flex-wrap items-center gap-2">
                <input value={confirmar} onChange={(e) => setConfirmar(e.target.value)} aria-label="Confirmar exclusão da categoria" className={`${CLASSE_INPUT} w-28 py-1`} />
                <Button tamanho="pequeno" variante="perigo" disabled={confirmar.trim() !== "EXCLUIR"} onClick={() => executar(async () => { await extras.criarBackup(); await gestao.excluirConta(categoria.id, true); }, "Categoria e lançamentos excluídos (backup feito antes).")}>Excluir com lançamentos</Button>
                <Button tamanho="pequeno" variante="fantasma" onClick={() => setUso(null)}>Cancelar</Button>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
