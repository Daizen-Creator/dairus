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
import { dividirEmParcelas, parcelamentoDe } from "./parcelas";
import { DetalhesCartao } from "./DetalhesCartao";
import { FerramentasCartao } from "./FerramentasCartao";
import { PainelConta } from "./PainelConta";
import { ciclosFechados } from "./faturas";
import { cartoes as servicoCartoes, type Adicional, type Fatura } from "../../services/cartoes";
import type { Conta, Lancamento } from "../../types/accounting";
import { useAoAlterarDados } from "../../state/useAoAlterarDados";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type Ordem = "NOME" | "FATURA" | "USO";

export interface CompraCartao {
  l: Lancamento;
  /** Data em que o valor entra na fatura (para parcelas, o mês de cada uma). */
  data: string;
  valor: number; // positivo = compra, negativo = estorno/reembolso
  categoria: Conta | null;
  parcela: { numero: number; total: number } | null;
}

export function comprasDoCartao(cartao: Conta, lancamentos: Lancamento[], contaPorId: Map<string, Conta>): CompraCartao[] {
  const saida: CompraCartao[] = [];
  const porId = new Map(lancamentos.map((l) => [l.id, l]));
  for (const l of lancamentos) {
    if (l.origem === "FATURA" || l.origem === "SALDO_INICIAL") continue;
    const p = l.partidas.find((x) => x.conta_id === cartao.id);
    if (!p) continue;
    const categoria = l.partidas.map((x) => contaPorId.get(x.conta_id)).find((c) => c?.tipo === "DESPESA") ?? null;
    const valor = p.tipo === "CREDITO" ? p.valor_centavos : -p.valor_centavos;
    const parc = parcelamentoDe(l, porId);
    if (parc) {
      const sinal = valor < 0 ? -1 : 1;
      for (const x of dividirEmParcelas(Math.abs(valor), parc.dataBase, parc.parcelas)) {
        saida.push({ l, data: x.data, valor: sinal * x.valor, categoria, parcela: { numero: x.numero, total: x.total } });
      }
    } else {
      saida.push({ l, data: l.data, valor, categoria, parcela: null });
    }
  }
  return saida.sort((a, b) => b.data.localeCompare(a.data));
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
  const [ed, setEd] = useState({ nome: "", limite: "", fecha: "1", vence: "10", juros: "" });
  const [comprando, setComprando] = useState<string | null>(null);
  const [cp, setCp] = useState({ descricao: "", valor: "", categoriaId: "despesa-outras", parcelas: "1", portador: "" });
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [coresCartoes] = usePreferencia<Record<string, string>>("cores_contas", {});
  const [tetos] = usePreferencia<Record<string, number>>("teto_cartoes", {});

  useAoAlterarDados(() => {
    carregar().catch(() => {});
  });

  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [adicionais, setAdicionais] = useState<Adicional[]>([]);
  const [portadores, setPortadores] = useState<Map<string, string>>(new Map());
  const [reembolsados, setReembolsados] = useState<Set<string>>(new Set());
  const [juros, setJuros] = useState<Map<string, number | null>>(new Map());
  const [reembolsando, setReembolsando] = useState<string | null>(null);
  const [rb, setRb] = useState({ valor: "", motivo: "" });

  async function carregar() {
    const [c, l] = await Promise.all([contabilidade.listarContas(), contabilidade.listarLancamentos(5000)]);
    setContas(c);
    setLancamentos(l);
    setCarregando(false);
    try {
      const [f, ad, por, re, cfg] = await Promise.all([servicoCartoes.listarFaturas(), servicoCartoes.listarAdicionais(), servicoCartoes.listarPortadores(), servicoCartoes.listarReembolsos(), servicoCartoes.listarConfig()]);
      if (!Array.isArray(f)) return;
      setAdicionais(ad);
      setPortadores(new Map(por.map((p) => [p.lancamento_id, p.outro_id])));
      setReembolsados(new Set(re.map((r) => r.lancamento_id)));
      setJuros(new Map(cfg.map((x) => [x.cartao_id, x.juros_rotativo])));
      setFaturas(await congelarFaturasFechadas(c, l, f));
    } catch {
      // sem histórico de faturas (ex.: fora do app): a tela segue com o resto
    }
  }

  /** No fechamento, a fatura fica guardada com o valor daquele dia (congelada). */
  async function congelarFaturasFechadas(contasAtuais: Conta[], lancs: Lancamento[], existentes: Fatura[]): Promise<Fatura[]> {
    const hojeISO = dataAtualISO();
    const porId = new Map(contasAtuais.map((x) => [x.id, x]));
    const chaves = new Set(existentes.map((f) => `${f.cartao_id}|${f.fechamento}`));
    let criou = false;
    for (const cartao of contasAtuais.filter((x) => x.tipo === "PASSIVO" && x.subtipo === "CARTAO_CREDITO" && x.dia_fechamento_fatura && x.dia_vencimento_fatura)) {
      const compras = comprasDoCartao(cartao, lancs, porId);
      const primeira = compras.map((x) => x.data).sort()[0];
      if (!primeira) continue;
      for (const ciclo of ciclosFechados(cartao.dia_fechamento_fatura!, cartao.dia_vencimento_fatura!, hojeISO, 12)) {
        if (ciclo.fechamento < primeira) break;
        if (chaves.has(`${cartao.id}|${ciclo.fechamento}`)) continue;
        const valor = compras.filter((x) => x.data >= ciclo.inicio && x.data <= ciclo.fechamento).reduce((acc, x) => acc + x.valor, 0);
        if (await servicoCartoes.congelarFatura(cartao.id, ciclo.inicio, ciclo.fechamento, ciclo.vencimento, Math.max(0, valor))) criou = true;
      }
    }
    return criou ? servicoCartoes.listarFaturas() : existentes;
  }

  async function reembolsar(compra: Lancamento) {
    const centavos = valorInputParaCentavos(rb.valor);
    if (centavos <= 0) return toast.error("Informe o valor do reembolso.");
    try {
      await servicoCartoes.registrarReembolso(compra.id, centavos, dataAtualISO(), rb.motivo.trim() || null);
      toast.success("Reembolso registrado: aparece como crédito na fatura.");
      setReembolsando(null);
      setRb({ valor: "", motivo: "" });
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
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
      const soma = (de: string, ate: string) => compras.filter((x) => x.data >= de && x.data <= ate).reduce((s, x) => s + x.valor, 0);
      const diaAnt = (() => {
        const [a, m, d] = ciclo.fechamentoAnterior.split("-").map(Number);
        const dt = new Date(a, m - 1, d + 1);
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      })();
      const atual = soma(ciclo.inicioAtual, ciclo.proximoFechamento);
      const anterior = soma(diaAnt, ciclo.ultimoFechamento);
      // Parcelas que ainda vão cair nas próximas faturas (já ocupam o limite).
      const futuras = compras.filter((x) => x.data > ciclo.proximoFechamento).reduce((s, x) => s + x.valor, 0);
      return [c.id, { ciclo, compras, atual, anterior, futuras }] as const;
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
    const parcelas = Math.floor(Number(cp.parcelas) || 1);
    if (parcelas < 1 || parcelas > 72) return toast.error("O parcelamento vai de 1 a 72 vezes.");
    const limite = cartao.limite_centavos ?? 0;
    if (limite > 0 && cartao.saldo_atual_centavos + centavos > limite) {
      toast.warning("Essa compra ultrapassa o limite do cartão — registrada mesmo assim.");
    }
    try {
      const compra = await contabilidade.registrarDespesa({
        conta_origem_id: cartao.id,
        categoria_despesa_id: cp.categoriaId,
        valor_centavos: centavos,
        data: dataAtualISO(),
        descricao: cp.descricao.trim(),
        parcelas: parcelas > 1 ? parcelas : null,
      });
      if (cp.portador) await servicoCartoes.definirPortador(compra.id, cp.portador).catch(() => {});
      toast.success(parcelas > 1 ? `Compra registrada em ${parcelas}x de ${formatarCentavos(Math.trunc(centavos / parcelas))}.` : "Compra registrada no cartão.");
      setCp({ ...cp, descricao: "", valor: "", parcelas: "1" });
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function salvarEdicao(cartao: Conta) {
    try {
      await extras.atualizarConta(cartao.id, ed.nome, cartao.instituicao, valorInputParaCentavos(ed.limite), Number(ed.fecha), Number(ed.vence));
      const j = ed.juros.trim() ? Number(ed.juros.replace(",", ".")) / 100 : null;
      await servicoCartoes.definirJuros(cartao.id, j !== null && Number.isFinite(j) ? j : null);
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
      if (x.data < d.ciclo.inicioAtual || x.data > d.ciclo.proximoFechamento) continue;
      const nome = x.categoria?.nome ?? "Outros";
      porCategoria.set(nome, (porCategoria.get(nome) ?? 0) + x.valor);
    }
    // Gasto da fatura atual por quem usou (titular = "").
    const gastoPorPortador = new Map<string, number>();
    for (const x of d.compras) {
      if (x.data < d.ciclo.inicioAtual || x.data > d.ciclo.proximoFechamento) continue;
      const quem = portadores.get(x.l.id) ?? "";
      gastoPorPortador.set(quem, (gastoPorPortador.get(quem) ?? 0) + x.valor);
    }
    const cats = [...porCategoria.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);

    // Compras dos últimos 6 meses.
    const [ah, mh] = hoje.split("-").map(Number);
    const meses = Array.from({ length: 6 }, (_, i) => {
      const dt = new Date(ah, mh - 1 - (5 - i), 1);
      const chave = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      return { chave, rotulo: MESES[dt.getMonth()], total: d.compras.filter((x) => x.data.startsWith(chave)).reduce((s, x) => s + x.valor, 0) };
    });
    const maxMes = Math.max(1, ...meses.map((m) => m.total));
    const media = meses.reduce((s, m) => s + Math.max(0, m.total), 0) / 6;

    return (
      <li
        key={cartao.id}
        className="rounded-xl border bg-cartao p-4"
        style={{
          borderColor: `color-mix(in srgb, ${coresCartoes[cartao.id] ?? "#f43f5e"} 40%, transparent)`,
          backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${coresCartoes[cartao.id] ?? "#f43f5e"} 14%, transparent), transparent 60%)`,
          boxShadow: `0 8px 24px -16px ${coresCartoes[cartao.id] ?? "#f43f5e"}`,
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
                  setEd({ nome: cartao.nome, limite: centavosParaValorInput(limite), fecha: String(cartao.dia_fechamento_fatura ?? 1), vence: String(cartao.dia_vencimento_fatura ?? 10), juros: juros.get(cartao.id) ? String(((juros.get(cartao.id) ?? 0) * 100).toFixed(2)).replace(".", ",") : "" });
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
            <label className="col-span-3 text-[11px] text-texto-secundario">Juros do rotativo (% ao mês, veja na fatura do banco)<input value={ed.juros} onChange={(e) => setEd({ ...ed, juros: e.target.value })} inputMode="decimal" placeholder="12" className={`${CLASSE_INPUT} mt-1 w-full py-1`} /></label>
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
        {tetos[cartao.id] !== undefined && d.atual > tetos[cartao.id] * 0.8 && (
          <p className={`mt-2 flex items-center gap-1 text-xs font-medium ${d.atual > tetos[cartao.id] ? "text-erro" : "text-alerta"}`}>
            <TriangleAlert size={12} /> {d.atual > tetos[cartao.id] ? "Passou do teto" : "Perto do teto"} de {dinheiro(tetos[cartao.id])} nesta fatura
          </p>
        )}
        {d.futuras > 0 && (
          <p className="mt-2 text-[11px] text-texto-secundario">
            Parcelas das próximas faturas: <strong className="text-texto-primario">{dinheiro(d.futuras)}</strong> (já ocupam o limite)
          </p>
        )}
        <p className="mt-2 text-[11px] text-texto-secundario">
          Melhor dia de compra: <strong className="text-texto-primario">{formatarDataISOParaBR(d.ciclo.inicioAtual).slice(0, 5)}</strong> (logo após o fechamento)
        </p>

        {(() => {
          const limite40 = new Date(Date.parse(`${hoje}T12:00:00Z`) - 40 * 86_400_000).toISOString().slice(0, 10);
          const vistos = new Set<string>();
          const assinaturas = d.compras.filter((x) => x.l.etiqueta === "ASSINATURA" && x.data >= limite40 && x.valor > 0).filter((x) => {
            const k = x.l.descricao.toLowerCase();
            if (vistos.has(k)) return false;
            vistos.add(k);
            return true;
          });
          if (!assinaturas.length) return null;
          return (
            <div className="mt-3">
              <p className="mb-1 text-[11px] text-texto-secundario">Assinaturas neste cartão · {dinheiro(assinaturas.reduce((s2, x) => s2 + x.valor, 0))}/mês</p>
              <div className="flex flex-wrap gap-1.5">
                {assinaturas.map((x) => (
                  <span key={x.l.id} title={`${x.l.descricao} · ${formatarCentavos(x.valor)}`} className="flex items-center gap-1 rounded-full border border-borda bg-fundo/40 py-0.5 pl-0.5 pr-2 text-[11px] text-texto-primario">
                    <IconeCoisa nome={x.l.descricao} tamanho={18} redondo /> {x.l.descricao.split(" ")[0]}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

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
              {adicionais.some((a) => a.cartao_id === cartao.id) && (
                <Select aria-label="Quem usou" value={cp.portador} onValueChange={(v) => setCp({ ...cp, portador: v })} options={[{ value: "", label: "Titular" }, ...adicionais.filter((a) => a.cartao_id === cartao.id).map((a) => ({ value: a.id, label: `Adicional: ${a.nome}` }))]} className="w-full" />
              )}
              <label className="flex items-center gap-2 text-xs text-texto-secundario">
                Parcelas
                <input type="number" min={1} max={72} value={cp.parcelas} onChange={(e) => setCp({ ...cp, parcelas: e.target.value })} aria-label="Número de parcelas" className={`${CLASSE_INPUT} w-20 py-1`} />
                {Number(cp.parcelas) > 1 && valorInputParaCentavos(cp.valor) > 0 && (
                  <span>{cp.parcelas}x de {formatarCentavos(Math.trunc(valorInputParaCentavos(cp.valor) / Number(cp.parcelas)))} · ocupa o limite inteiro</span>
                )}
              </label>
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
            <DetalhesCartao
              cartao={cartao}
              faturas={faturas}
              lancamentos={lancamentos}
              adicionais={adicionais}
              jurosMensal={juros.get(cartao.id) ?? null}
              gastoPorPortador={gastoPorPortador}
              dinheiro={dinheiro}
              onAlterado={carregar}
            />
            <FerramentasCartao cartao={cartao} compras={d.compras} atual={Math.max(0, d.atual)} dinheiro={dinheiro} onAlterado={carregar} />
            <PainelConta conta={cartao} outras={todos.filter((x) => x.id !== cartao.id)} lancamentos={lancamentos} dinheiro={dinheiro} rotulo="cartão" onAlterado={() => { setDetalhe(null); carregar(); }} />
            {d.compras.length === 0 ? (
              <p className="text-xs text-texto-secundario">Nenhuma compra neste cartão ainda.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {d.compras.filter((x) => x.data <= d.ciclo.proximoFechamento).slice(0, 12).map((x) => (
                  <li key={`${x.l.id}-${x.parcela?.numero ?? 0}`} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 truncate text-texto-secundario">
                      <IconeCoisa nome={x.l.descricao} tamanho={20} redondo />
                      {formatarDataISOParaBR(x.data).slice(0, 5)} · <span className="text-texto-primario">{x.l.descricao}</span>
                      {x.parcela && <span> ({x.parcela.numero}/{x.parcela.total})</span>}
                      {portadores.has(x.l.id) && <span> · {adicionais.find((a) => a.id === portadores.get(x.l.id))?.nome}</span>}
                      {reembolsados.has(x.l.id) && <span className="ml-1 rounded bg-sucesso/15 px-1 text-[10px] text-sucesso">reembolso</span>}
                      {x.valor > 0 && x.l.origem !== "ESTORNO" && !reembolsados.has(x.l.id) && (x.parcela?.numero ?? 1) === 1 && (
                        <button onClick={() => { setReembolsando(reembolsando === x.l.id ? null : x.l.id); setRb({ valor: "", motivo: "" }); }} className="ml-1 text-[10px] text-primaria hover:underline">reembolso</button>
                      )}
                      {reembolsando === x.l.id && (
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          <input value={rb.valor} onChange={(e) => setRb({ ...rb, valor: e.target.value })} placeholder="Valor" inputMode="decimal" aria-label="Valor do reembolso" className={`${CLASSE_INPUT} w-20 py-0.5 text-xs`} />
                          <input value={rb.motivo} onChange={(e) => setRb({ ...rb, motivo: e.target.value })} placeholder="Motivo (opcional)" aria-label="Motivo do reembolso" className={`${CLASSE_INPUT} w-32 py-0.5 text-xs`} />
                          <Button tamanho="pequeno" onClick={() => reembolsar(x.l)}>OK</Button>
                        </span>
                      )}
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
        Compra parcelada ocupa o limite inteiro na hora; cada parcela entra na fatura do seu mês e o limite volta conforme você paga as faturas.
      </p>
    </div>
  );
}
