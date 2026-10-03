import { useEffect, useState } from "react";
import { BellRing, Download, MessageCircle, Pencil, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { exportarCsv, reais } from "../../services/exportacao";
import { dataAtualISO, formatarCentavos, formatarDataISOParaBR, valorInputParaCentavos } from "../../services/formato";
import { planejamento, type AReceber } from "../../services/planejamento";
import { usePreferencia } from "../../state/usePreferencia";
import { avisarDadosAlterados } from "../../state/useAoAlterarDados";
import type { Agendamento, Conta } from "../../types/accounting";
import { historicoPorPessoa, linkWhatsApp } from "./pessoasExtras";

export interface Contato {
  telefone?: string;
  lembrete?: string;
}

/** Ações por pessoa: renomear, telefone/WhatsApp e lembrete de cobrança. */
export function AcoesPessoa({ pessoa, mensagem, onAlterado }: { pessoa: string; mensagem: string; onAlterado: () => void }) {
  const [contatos, setContatos] = usePreferencia<Record<string, Contato>>("contatos_pessoas", {});
  const c = contatos[pessoa] ?? {};
  const [nome, setNome] = useState(pessoa);
  const [editando, setEditando] = useState(false);
  const link = c.telefone ? linkWhatsApp(c.telefone, mensagem) : null;

  async function renomear() {
    try {
      await planejamento.renomearPessoa(pessoa, nome);
      if (contatos[pessoa]) {
        const { [pessoa]: dados, ...resto } = contatos;
        setContatos({ ...resto, [nome.trim()]: dados });
      }
      toast.success("Nome corrigido.");
      setEditando(false);
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
      {editando ? (
        <>
          <input value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Novo nome" className={`${CLASSE_INPUT} w-32 py-1`} />
          <Button tamanho="pequeno" onClick={renomear}>Salvar</Button>
          <Button tamanho="pequeno" variante="fantasma" onClick={() => setEditando(false)}>Cancelar</Button>
        </>
      ) : (
        <button onClick={() => setEditando(true)} className="inline-flex items-center gap-1 text-texto-secundario hover:text-primaria"><Pencil size={11} /> Renomear</button>
      )}
      <input value={c.telefone ?? ""} onChange={(e) => setContatos({ ...contatos, [pessoa]: { ...c, telefone: e.target.value } })} placeholder="WhatsApp (DDD + número)" aria-label={`Telefone de ${pessoa}`} className={`${CLASSE_INPUT} w-40 py-1`} />
      {link && (
        <Button tamanho="pequeno" variante="secundaria" onClick={() => import("@tauri-apps/plugin-opener").then((m) => m.openUrl(link)).catch(() => window.open(link, "_blank"))}><MessageCircle size={12} /> Enviar no WhatsApp</Button>
      )}
      <span className="inline-flex items-center gap-1 text-texto-secundario"><BellRing size={11} /> Lembrar em</span>
      <input type="date" value={c.lembrete ?? ""} onChange={(e) => setContatos({ ...contatos, [pessoa]: { ...c, lembrete: e.target.value || undefined } })} aria-label={`Lembrete de cobrança de ${pessoa}`} className={`${CLASSE_INPUT} w-36 py-1`} />
    </div>
  );
}

/** Ações por item: receber só uma parte ou desfazer a divisão lançada errado. */
export function AcoesItem({ item, contaId, onAlterado }: { item: AReceber; contaId: string; onAlterado: () => void }) {
  const [parte, setParte] = useState("");
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
    <span className="flex items-center gap-1">
      <input value={parte} onChange={(e) => setParte(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && valorInputParaCentavos(parte) > 0) executar(() => planejamento.receberParte(item.id, valorInputParaCentavos(parte), contaId, dataAtualISO()), "Parte recebida."); }} placeholder="parte" inputMode="decimal" title="Recebeu só uma parte? Digite e Enter" aria-label={`Receber parte de ${item.descricao}`} className={`${CLASSE_INPUT} w-16 py-0.5 text-xs`} />
      <button onClick={() => executar(() => planejamento.excluirDivisao(item.id), "Divisão desfeita (o lançamento saiu do histórico).")} title="Lançado errado? Desfazer a divisão inteira" aria-label={`Desfazer ${item.descricao}`} className="text-texto-secundario hover:text-alerta"><Undo2 size={12} /></button>
    </span>
  );
}

/** Aba “Eu devo”: o que você deve a outras pessoas (contas agendadas com nome). */
export function AbaEuDevo({ contas }: { contas: Conta[] }) {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [form, setForm] = useState({ pessoa: "", descricao: "", valor: "", vencimento: dataAtualISO(), categoria: "despesa-outras" });
  const categorias = contas.filter((c) => c.tipo === "DESPESA" && c.ativa && c.subtipo !== "CATEGORIA");
  const carregar = () => contabilidade.listarAgendamentos().then(setAgendamentos).catch((e) => toast.error(String(e)));
  useEffect(() => {
    carregar();
  }, []);
  const devo = agendamentos.filter((a) => !a.pago_em && a.tipo !== "RECEBER" && a.pessoa);
  const porPessoa = new Map<string, Agendamento[]>();
  for (const a of devo) porPessoa.set(a.pessoa!, [...(porPessoa.get(a.pessoa!) ?? []), a]);

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    const v = valorInputParaCentavos(form.valor);
    if (!form.pessoa.trim() || v <= 0) return toast.error("Informe a pessoa e o valor.");
    try {
      await contabilidade.criarAgendamento({ descricao: form.descricao.trim() || `Devolver para ${form.pessoa.trim()}`, valor_centavos: v, vencimento: form.vencimento, categoria_despesa_id: form.categoria, tipo: "PAGAR", pessoa: form.pessoa.trim() });
      toast.success("Anotado: aparece também na agenda de contas a pagar.");
      setForm({ ...form, pessoa: "", descricao: "", valor: "" });
      carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={salvar} className="flex flex-wrap items-end gap-2 rounded-xl border border-borda bg-cartao p-3">
        <input value={form.pessoa} onChange={(e) => setForm({ ...form, pessoa: e.target.value })} placeholder="Para quem" aria-label="Para quem devo" className={`${CLASSE_INPUT} w-36`} />
        <input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="O quê (opcional)" aria-label="Descrição da dívida" className={`${CLASSE_INPUT} w-40`} />
        <input value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="Valor" inputMode="decimal" aria-label="Valor que devo" className={`${CLASSE_INPUT} w-24`} />
        <input type="date" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} aria-label="Até quando" className={`${CLASSE_INPUT} w-36`} />
        <Select aria-label="Categoria" value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })} options={categorias.map((c) => ({ value: c.id, label: c.nome }))} className="w-40" />
        <Button type="submit" variante="secundaria">Anotar</Button>
      </form>
      {porPessoa.size === 0 ? <p className="text-sm text-texto-secundario">Você não deve nada a ninguém. 🎉</p> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {[...porPessoa.entries()].map(([pessoa, lista]) => (
            <Secao key={pessoa} titulo={`${pessoa} · ${formatarCentavos(lista.reduce((s, a) => s + a.valor_centavos, 0))}`}>
              <ul className="space-y-1 text-sm">{lista.map((a) => <li key={a.id} className="flex justify-between"><span>{a.descricao} <span className="text-xs text-texto-secundario">até {formatarDataISOParaBR(a.vencimento)}</span></span><span className="tabular-nums">{formatarCentavos(a.valor_centavos)}</span></li>)}</ul>
              <p className="mt-2 text-xs text-texto-secundario">Para pagar, use “Marcar como pago” em Despesas e Receitas → Agenda.</p>
            </Secao>
          ))}
        </div>
      )}
    </div>
  );
}

/** Aba “Histórico”: quanto cada pessoa já pegou, devolveu e o tempo médio para pagar. */
export function AbaHistoricoPessoas({ itens }: { itens: AReceber[] }) {
  const linhas = historicoPorPessoa(itens);
  async function exportar() {
    try {
      const caminho = await exportarCsv("pessoas", ["Pessoa", "Descrição", "Data", "Valor (R$)", "Situação"], itens.map((i) => [i.pessoa, i.descricao, formatarDataISOParaBR(i.data), reais(i.valor_centavos), i.perdoado ? "perdoado" : i.recebido_em ? `recebido ${formatarDataISOParaBR(i.recebido_em)}` : "em aberto"]));
      toast.success(`Arquivo salvo em ${caminho}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }
  return (
    <Secao titulo="Por pessoa" acao={<Button tamanho="pequeno" variante="secundaria" onClick={exportar} disabled={!itens.length}><Download size={13} /> CSV</Button>}>
      {linhas.length === 0 ? <p className="text-sm text-texto-secundario">Nada ainda.</p> : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-texto-secundario"><tr><th className="py-1">Pessoa</th><th className="text-right">Em aberto</th><th className="text-right">Devolvido</th><th className="text-right">Perdoado</th><th className="text-right">Paga em</th></tr></thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.pessoa} className="border-t border-borda">
                <td className="py-1.5">{l.pessoa}</td>
                <td className="text-right tabular-nums text-sucesso">{formatarCentavos(l.emAberto)}</td>
                <td className="text-right tabular-nums">{formatarCentavos(l.recebido)}</td>
                <td className="text-right tabular-nums text-texto-secundario">{formatarCentavos(l.perdoado)}</td>
                <td className="text-right text-texto-secundario">{l.diasMedios === null ? "—" : `${l.diasMedios} dia(s)`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Secao>
  );
}
