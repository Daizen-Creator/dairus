import { useEffect, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  Gauge,
  Pencil,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { Button } from "../../components/ui/Button";
import { BarraProgresso, CLASSE_INPUT } from "../../components/ui/Campos";
import { EmptyState } from "../../components/ui/EmptyState";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatCard } from "../../components/ui/StatCard";
import { contabilidade } from "../../services/contabilidade";
import { exportarCsv, reais } from "../../services/exportacao";
import { extras } from "../../services/extras";
import {
  centavosParaValorInput,
  dataAtualISO,
  formatarCentavos,
  formatarDataISOParaBR,
  valorInputParaCentavos,
} from "../../services/formato";
import { usePreferencia } from "../../state/usePreferencia";
import { iconeDaCategoria } from "../dashboard/categoriaIcone";
import { calcularCiclo } from "./ciclo";
import { NovaContaForm } from "./NovaContaForm";
import type { Conta, Lancamento } from "../../types/accounting";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type Ordem = "NOME" | "FATURA" | "USO";

interface CompraCartao {
  l: Lancamento;
  valor: number; // positivo = compra, negativo = estorno/reembolso
  categoria: Conta | null;
}

function comprasDoCartao(cartao: Conta, lancamentos: Lancamento[], contaPorId: Map<string, Conta>): CompraCartao[] {
  const saida: CompraCartao[] = [];
  for (const l of lancamentos) {
    if (l.origem === "FATURA" || l.origem === "SALDO_INICIAL") continue;
    const p = l.partidas.find((x) => x.conta_id === cartao.id);
    if (!p) continue;
    const categoria = l.partidas.map((x) => contaPorId.get(x.conta_id)).find((c) => c?.tipo === "DESPESA") ?? null;
    saida.push({ l, valor: p.tipo === "CREDITO" ? p.valor_centavos : -p.valor_centavos, categoria });
  }
  return saida.sort((a, b) => b.l.data.localeCompare(a.l.data));
}

export function CartoesPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("NOME");
  const [verArquivados, setVerArquivados] = useState(false);
  const [ocultar, setOcultar] = usePreferencia<boolean>("ocultar_saldos", false);
  const [pagando, setPagando] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [origemId, setOrigemId] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [ed, setEd] = useState({ nome: "", limite: "", fecha: "1", vence: "10" });
  const [comprando, setComprando] = useState<string | null>(null);
  const [cp, setCp] = useState({ descricao: "", valor: "", categoriaId: "despesa-outras" });
  const [detalhe, setDetalhe] = useState<string | null>(null);

  async function carregar() {
    const [c, l] = await Promise.all([contabilidade.listarContas(), contabilidade.listarLancamentos(3000)]);
    setContas(c);
    setLancamentos(l);
    setCarregando(false);
  }

  useEffect(() => {
    carregar().catch((e) => {
      toast.error(String(e));
      setCarregando(false);
    });
  }, []);

  if (carregando) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-borda bg-cartao p-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-3 h-6 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const hoje = dataAtualISO();
  const contaPorId = new Map(contas.map((c) => [c.id, c]));
  const todos = contas.filter((c) => c.tipo === "PASSIVO" && c.subtipo === "CARTAO_CREDITO");
  const ativos = todos.filter((c) => c.ativa);
  const arquivados = todos.filter((c) => !c.ativa);
  const origens = contas.filter((c) => c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA" && c.ativa);
  const categoriasDespesa = contas.filter((c) => c.tipo === "DESPESA" && c.subtipo !== "CATEGORIA" && c.ativa);
  const dinheiro = (v: number) => (ocultar ? "R$ ••••" : formatarCentavos(v));

  const dados = new Map(
    todos.map((c) => {
      const ciclo = calcularCiclo(c.dia_fechamento_fatura ?? 1, c.dia_vencimento_fatura ?? 10, hoje);
      const compras = comprasDoCartao(c, lancamentos, contaPorId);
      const soma = (de: string, ate: string) => compras.filter((x) => x.l.data >= de && x.l.data <= ate).reduce((s, x) => s + x.valor, 0);
      const diaAnt = (() => {
        const [a, m, d] = ciclo.fechamentoAnterior.split("-").map(Number);
        const dt = new Date(a, m - 1, d + 1);
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      })();
      const atual = soma(ciclo.inicioAtual, "9999-12-31");
      const anterior = soma(diaAnt, ciclo.ultimoFechamento);
      return [c.id, { ciclo, compras, atual, anterior }] as const;
    }),
  );

  const limiteTotal = ativos.reduce((s, c) => s + (c.limite_centavos ?? 0), 0);
  const devidoTotal = ativos.reduce((s, c) => s + Math.max(0, c.saldo_atual_centavos), 0);
  const usoGlobal = limiteTotal > 0 ? (devidoTotal / limiteTotal) * 100 : 0;
  const proximo = [...ativos]
    .filter((c) => c.saldo_atual_centavos > 0)
    .sort((a, b) => dados.get(a.id)!.ciclo.proximoVencimento.localeCompare(dados.get(b.id)!.ciclo.proximoVencimento))[0];

  const termo = busca.trim().toLowerCase();
  const lista = (verArquivados ? arquivados : ativos)
    .filter((c) => !termo || `${c.nome} ${c.instituicao ?? ""}`.toLowerCase().includes(termo))
    .sort((a, b) => {
      if (ordem === "FATURA") return b.saldo_atual_centavos - a.saldo_atual_centavos;
      if (ordem === "USO") {
        const u = (c: Conta) => ((c.limite_centavos ?? 0) > 0 ? c.saldo_atual_centavos / (c.limite_centavos ?? 1) : 0);
        return u(b) - u(a);
      }
      return a.nome.localeCompare(b.nome);
    });

  function iniciarPagamento(cartao: Conta) {
    setPagando(cartao.id);
    setComprando(null);
    setValor(centavosParaValorInput(Math.max(0, cartao.saldo_atual_centavos)));
    setOrigemId(origens[0]?.id ?? "");
  }

  async function pagarFatura(cartao: Conta) {
    const centavos = valorInputParaCentavos(valor);
    if (centavos <= 0 || !origemId) return toast.error("Informe o valor e a conta de onde sai o pagamento.");
    if (centavos > cartao.saldo_atual_centavos) return toast.error("O pagamento é maior que a fatura em aberto.");
    try {
      // Pagar a fatura move dinheiro da conta para quitar a dívida do cartão: não é uma nova despesa
      // (a despesa já foi contabilizada na compra), por isso débito no passivo e crédito no ativo.
      await contabilidade.criarLancamento({
        data: dataAtualISO(),
        descricao: `Pagamento da fatura ${cartao.nome}`,
        origem: "FATURA",
        partidas: [
          { conta_id: cartao.id, tipo: "DEBITO", valor_centavos: centavos },
          { conta_id: origemId, tipo: "CREDITO", valor_centavos: centavos },
        ],
      });
      toast.success(centavos === cartao.saldo_atual_centavos ? "Fatura paga." : "Pagamento parcial registrado.");
      setPagando(null);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function registrarCompra(cartao: Conta) {
    const centavos = valorInputParaCentavos(cp.valor);
    if (!cp.descricao.trim() || centavos <= 0) return toast.error("Informe a descrição e o valor da compra.");
    const limite = cartao.limite_centavos ?? 0;
    if (limite > 0 && cartao.saldo_atual_centavos + centavos > limite) {
      toast.warning("Essa compra ultrapassa o limite do cartão — registrada mesmo assim.");
    }
    try {
      await contabilidade.registrarDespesa({
        conta_origem_id: cartao.id,
        categoria_despesa_id: cp.categoriaId,
        valor_centavos: centavos,
        data: dataAtualISO(),
        descricao: cp.descricao.trim(),
      });
      toast.success("Compra registrada no cartão.");
      setCp({ ...cp, descricao: "", valor: "" });
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function salvarEdicao(cartao: Conta) {
    try {
      await extras.atualizarConta(cartao.id, ed.nome, cartao.instituicao, valorInputParaCentavos(ed.limite), Number(ed.fecha), Number(ed.vence));
      toast.success("Cartão atualizado.");
      setEditando(null);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function arquivar(cartao: Conta, arquivar: boolean) {
    try {
      await extras.arquivarConta(cartao.id, arquivar);
      toast.success(arquivar ? `"${cartao.nome}" arquivado.` : `"${cartao.nome}" reativado.`);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function exportar() {
    try {
      const caminho = await exportarCsv(
        "cartoes",
        ["Cartão", "Limite (R$)", "Fatura em aberto (R$)", "Disponível (R$)", "Fecha dia", "Vence dia"],
        ativos.map((c) => [
          c.nome,
          reais(c.limite_centavos ?? 0),
          reais(c.saldo_atual_centavos),
          reais((c.limite_centavos ?? 0) - c.saldo_atual_centavos),
          c.dia_fechamento_fatura ?? "",
          c.dia_vencimento_fatura ?? "",
        ]),
      );
      toast.success(`Arquivo salvo em ${caminho}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  function renderCartao(cartao: Conta) {
    const d = dados.get(cartao.id)!;
    const limite = cartao.limite_centavos ?? 0;
    const disponivel = limite - cartao.saldo_atual_centavos;
    const uso = limite > 0 ? (cartao.saldo_atual_centavos / limite) * 100 : 0;
    const cor = uso >= 90 ? "#ff2d55" : uso >= 70 ? "var(--cor-alerta)" : "var(--cor-primaria)";
    const emAberto = detalhe === cartao.id;

    // Gastos por categoria na fatura atual.
    const porCategoria = new Map<string, number>();
    for (const x of d.compras) {
      if (x.l.data < d.ciclo.inicioAtual) continue;
      const nome = x.categoria?.nome ?? "Outros";
      porCategoria.set(nome, (porCategoria.get(nome) ?? 0) + x.valor);
    }
    const cats = [...porCategoria.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);

    // Compras dos últimos 6 meses.
    const [ah, mh] = hoje.split("-").map(Number);
    const meses = Array.from({ length: 6 }, (_, i) => {
      const dt = new Date(ah, mh - 1 - (5 - i), 1);
      const chave = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      return { chave, rotulo: MESES[dt.getMonth()], total: d.compras.filter((x) => x.l.data.startsWith(chave)).reduce((s, x) => s + x.valor, 0) };
    });
    const maxMes = Math.max(1, ...meses.map((m) => m.total));
    const media = meses.reduce((s, m) => s + Math.max(0, m.total), 0) / 6;

    return (
      <li
        key={cartao.id}
        className="rounded-xl border bg-cartao p-4"
        style={{
          borderColor: "color-mix(in srgb, #f43f5e 40%, transparent)",
          backgroundImage: "linear-gradient(135deg, color-mix(in srgb, #f43f5e 14%, transparent), transparent 60%)",
          boxShadow: "0 8px 24px -16px #f43f5e",
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <IconeCoisa nome={cartao.nome} tamanho={40} redondo padrao={{ icone: CreditCard, cor: "#f43f5e" }} />
            <div className="min-w-0">
              {editando === cartao.id ? (
                <input value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} aria-label="Nome" className={`${CLASSE_INPUT} w-full py-1`} />
              ) : (
                <p className="truncate text-sm font-semibold text-texto-primario">{cartao.nome}</p>
              )}
              <p className="text-xs text-texto-secundario">
                Fecha dia {cartao.dia_fechamento_fatura} · Vence dia {cartao.dia_vencimento_fatura}
              </p>
            </div>
          </div>
          {!cartao.sistema && (
            <div className="flex shrink-0">
              <button
                onClick={() => {
                  setEditando(cartao.id);
                  setEd({ nome: cartao.nome, limite: centavosParaValorInput(limite), fecha: String(cartao.dia_fechamento_fatura ?? 1), vence: String(cartao.dia_vencimento_fatura ?? 10) });
                }}
                title="Editar cartão"
                aria-label={`Editar ${cartao.nome}`}
                className="rounded-md p-1.5 text-texto-secundario hover:bg-borda/50 hover:text-primaria"
              >
                <Pencil size={14} />
              </button>
              <button onClick={() => arquivar(cartao, cartao.ativa)} title={cartao.ativa ? "Arquivar (exige fatura zerada)" : "Reativar"} aria-label={cartao.ativa ? "Arquivar" : "Reativar"} className="rounded-md p-1.5 text-texto-secundario hover:bg-borda/50 hover:text-alerta">
                {cartao.ativa ? <Archive size={14} /> : <ArchiveRestore size={14} />}
              </button>
            </div>
          )}
        </div>

        {editando === cartao.id && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <label className="text-[11px] text-texto-secundario">Limite<input value={ed.limite} onChange={(e) => setEd({ ...ed, limite: e.target.value })} inputMode="decimal" className={`${CLASSE_INPUT} mt-1 w-full py-1`} /></label>
            <label className="text-[11px] text-texto-secundario">Fecha dia<input type="number" min={1} max={31} value={ed.fecha} onChange={(e) => setEd({ ...ed, fecha: e.target.value })} className={`${CLASSE_INPUT} mt-1 w-full py-1`} /></label>
            <label className="text-[11px] text-texto-secundario">Vence dia<input type="number" min={1} max={31} value={ed.vence} onChange={(e) => setEd({ ...ed, vence: e.target.value })} className={`${CLASSE_INPUT} mt-1 w-full py-1`} /></label>
            <div className="col-span-3 flex gap-2">
              <Button tamanho="pequeno" onClick={() => salvarEdicao(cartao)}>Salvar</Button>
              <Button tamanho="pequeno" variante="fantasma" onClick={() => setEditando(null)}>Cancelar</Button>
            </div>
          </div>
        )}

        <p className="mt-3 text-xs text-texto-secundario">Saldo devedor</p>
        <p className="text-xl font-bold tabular-nums text-erro">{dinheiro(cartao.saldo_atual_centavos)}</p>
        {limite > 0 && (
          <div className="mt-2">
            <BarraProgresso percentual={uso} cor={cor} altura={6} />
            <p className="mt-1.5 flex justify-between text-xs text-texto-secundario">
              <span>Disponível: {dinheiro(disponivel)} de {dinheiro(limite)}</span>
              <span style={{ color: uso >= 80 ? cor : undefined }}>{uso.toFixed(0)}%</span>
            </p>
            {uso >= 80 && (
              <p className="mt-1 flex items-center gap-1 text-xs font-medium" style={{ color: cor }}>
                <TriangleAlert size={12} /> {uso >= 100 ? "Limite estourado" : "Uso do limite acima de 80%"}
              </p>
            )}
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-borda bg-fundo/50 p-2">
            <p className="text-texto-secundario">Fatura atual (aberta)</p>
            <p className="font-semibold tabular-nums text-texto-primario">{dinheiro(Math.max(0, d.atual))}</p>
            <p className="text-[11px] text-texto-secundario">fecha em {d.ciclo.diasParaFechar === 0 ? "hoje" : `${d.ciclo.diasParaFechar} dia(s)`}</p>
          </div>
          <div className="rounded-lg border border-borda bg-fundo/50 p-2">
            <p className="text-texto-secundario">Fatura anterior</p>
            <p className="font-semibold tabular-nums text-texto-primario">{dinheiro(Math.max(0, d.anterior))}</p>
            <p className="text-[11px] text-texto-secundario">
              {d.ciclo.vencimentoAnterior >= hoje ? `vence ${formatarDataISOParaBR(d.ciclo.vencimentoAnterior).slice(0, 5)}` : `venceu ${formatarDataISOParaBR(d.ciclo.vencimentoAnterior).slice(0, 5)}`}
            </p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-texto-secundario">
          Melhor dia de compra: <strong className="text-texto-primario">{formatarDataISOParaBR(d.ciclo.inicioAtual).slice(0, 5)}</strong> (logo após o fechamento)
        </p>

        {cats.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {cats.map(([nome, v]) => {
              const ic = iconeDaCategoria(nome);
              const total = cats.reduce((s, [, x]) => s + x, 0);
              return (
                <li key={nome} className="flex items-center gap-2 text-xs">
                  <span className="w-20 truncate text-texto-secundario">{nome}</span>
                  <span className="flex-1"><BarraProgresso percentual={(v / total) * 100} cor={ic.cor} altura={5} /></span>
                  <span className="w-16 text-right tabular-nums text-texto-primario">{dinheiro(v)}</span>
                </li>
              );
            })}
          </ul>
        )}

        {cartao.ativa && (
          pagando === cartao.id ? (
            <div className="mt-3 space-y-2">
              <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" aria-label="Valor a pagar" className={`${CLASSE_INPUT} w-full`} />
              <Select aria-label="Pagar com a conta" value={origemId} onValueChange={setOrigemId} options={origens.map((c) => ({ value: c.id, label: c.nome }))} className="w-full" />
              <div className="flex gap-2">
                <Button tamanho="pequeno" onClick={() => pagarFatura(cartao)}>Confirmar pagamento</Button>
                <Button tamanho="pequeno" variante="fantasma" onClick={() => setPagando(null)}>Cancelar</Button>
              </div>
              <p className="text-[11px] text-texto-secundario">Dá para pagar só uma parte (pagamento parcial).</p>
            </div>
          ) : comprando === cartao.id ? (
            <div className="mt-3 space-y-2">
              <input value={cp.descricao} onChange={(e) => setCp({ ...cp, descricao: e.target.value })} placeholder="O que comprou?" aria-label="Descrição da compra" className={`${CLASSE_INPUT} w-full`} />
              <div className="flex gap-2">
                <input value={cp.valor} onChange={(e) => setCp({ ...cp, valor: e.target.value })} inputMode="decimal" placeholder="Valor (R$)" aria-label="Valor da compra" className={`${CLASSE_INPUT} w-28`} />
                <Select aria-label="Categoria" value={cp.categoriaId} onValueChange={(v) => setCp({ ...cp, categoriaId: v })} options={categoriasDespesa.map((c) => ({ value: c.id, label: c.nome }))} className="flex-1" />
              </div>
              <div className="flex gap-2">
                <Button tamanho="pequeno" onClick={() => registrarCompra(cartao)}>Registrar compra</Button>
                <Button tamanho="pequeno" variante="fantasma" onClick={() => setComprando(null)}>Fechar</Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button tamanho="pequeno" variante="secundaria" onClick={() => { setComprando(cartao.id); setPagando(null); }}>
                <ShoppingBag size={13} /> Nova compra
              </Button>
              <Button tamanho="pequeno" variante="secundaria" disabled={cartao.saldo_atual_centavos <= 0} onClick={() => iniciarPagamento(cartao)}>
                Pagar fatura
              </Button>
              <button onClick={() => setDetalhe(emAberto ? null : cartao.id)} className="ml-auto text-xs text-primaria hover:underline">
                {emAberto ? "Ocultar compras" : "Ver compras"}
              </button>
            </div>
          )
        )}

        {emAberto && (
          <div className="mt-3 border-t border-borda pt-3">
            <div className="mb-3 flex items-end gap-1.5" aria-label="Compras dos últimos 6 meses">
              {meses.map((m) => (
                <div key={m.chave} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-12 w-full items-end">
                    <div className="w-full rounded-t bg-gradient-to-t from-erro/60 to-erro" style={{ height: `${Math.max(4, (Math.max(0, m.total) / maxMes) * 100)}%` }} title={formatarCentavos(m.total)} />
                  </div>
                  <span className="text-[10px] text-texto-secundario">{m.rotulo}</span>
                </div>
              ))}
            </div>
            <p className="mb-2 text-[11px] text-texto-secundario">Média mensal de compras (6 meses): {dinheiro(Math.round(media))}</p>
            {d.compras.length === 0 ? (
              <p className="text-xs text-texto-secundario">Nenhuma compra neste cartão ainda.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {d.compras.slice(0, 12).map((x) => (
                  <li key={x.l.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-texto-secundario">
                      {formatarDataISOParaBR(x.l.data).slice(0, 5)} · <span className="text-texto-primario">{x.l.descricao}</span>
                    </span>
                    <span className={`shrink-0 tabular-nums ${x.valor < 0 ? "text-sucesso" : "text-texto-primario"}`}>{dinheiro(x.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-texto-primario">
          <CreditCard size={22} className="text-primaria" /> Cartões de Crédito
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button variante="secundaria" tamanho="pequeno" onClick={() => setOcultar(!ocultar)}>
            {ocultar ? <EyeOff size={14} /> : <Eye size={14} />} {ocultar ? "Mostrar valores" : "Ocultar valores"}
          </Button>
          <Button variante="secundaria" tamanho="pequeno" onClick={exportar} disabled={ativos.length === 0}>
            <Download size={14} /> CSV
          </Button>
          {!mostrarFormulario && (
            <Button onClick={() => setMostrarFormulario(true)}>
              <Plus size={16} /> Novo cartão
            </Button>
          )}
        </div>
      </div>

      {mostrarFormulario && (
        <NovaContaForm
          categoriaFixa="cartao"
          onCriada={() => {
            setMostrarFormulario(false);
            carregar();
          }}
          onCancelar={() => setMostrarFormulario(false)}
        />
      )}

      {ativos.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard titulo="Faturas em aberto" valor={dinheiro(devidoTotal)} corValor="erro" icone={Receipt} corIcone="erro" subtitulo={`${ativos.length} cartão(ões)`} />
          <StatCard titulo="Limite total" valor={dinheiro(limiteTotal)} icone={CreditCard} corIcone="primaria" subtitulo={`Disponível ${dinheiro(limiteTotal - devidoTotal)}`} />
          <StatCard titulo="Uso do limite" valor={`${usoGlobal.toFixed(0)}%`} corValor={usoGlobal >= 80 ? "erro" : "normal"} icone={Gauge} corIcone="alerta" subtitulo={usoGlobal >= 80 ? "Atenção ao limite" : "Dentro do saudável (<80%)"} />
          <StatCard
            titulo="Próximo vencimento"
            valor={proximo ? formatarDataISOParaBR(dados.get(proximo.id)!.ciclo.proximoVencimento).slice(0, 5) : "—"}
            icone={CalendarClock}
            corIcone="secundaria"
            subtitulo={proximo ? `${proximo.nome} · em ${dados.get(proximo.id)!.ciclo.diasParaVencer} dia(s)` : "Nenhuma fatura em aberto"}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-secundario" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cartão…" aria-label="Buscar cartão" className={`${CLASSE_INPUT} w-56 pl-8`} />
        </div>
        <Select aria-label="Ordenar" value={ordem} onValueChange={(v) => setOrdem(v as Ordem)} options={[{ value: "NOME", label: "Ordem alfabética" }, { value: "FATURA", label: "Maior fatura" }, { value: "USO", label: "Maior uso do limite" }]} className="w-48" />
        {arquivados.length > 0 && (
          <button onClick={() => setVerArquivados((v) => !v)} className="text-xs text-primaria hover:underline">
            {verArquivados ? "Ver cartões ativos" : `Ver arquivados (${arquivados.length})`}
          </button>
        )}
      </div>

      {lista.length === 0 ? (
        <EmptyState titulo="Nenhum cartão encontrado" descricao="Cadastre um cartão de crédito para acompanhar limite, fechamento e vencimento da fatura." />
      ) : (
        <ul className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">{lista.map((c) => renderCartao(c))}</ul>
      )}
      <p className="text-xs text-texto-secundario">
        Compras no cartão também aparecem em “Despesas e Receitas” (conta de origem = o cartão). O estorno de uma compra reduz a fatura.
      </p>
    </div>
  );
}
