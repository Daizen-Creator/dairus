import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BellRing, Copy, Download, ExternalLink, Minus, Pencil, Radar, Search, ShoppingCart, Store, Target, Trash2, TrendingDown, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import { Abas, useAbaDaPagina } from "../../components/ui/Abas";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { EmptyState } from "../../components/ui/EmptyState";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatCard } from "../../components/ui/StatCard";
import { contabilidade } from "../../services/contabilidade";
import { planejamento } from "../../services/planejamento";
import { usePreferencia } from "../../state/usePreferencia";
import { buscarERegistrar, lojaDaOferta, registrarOferta, type Oferta } from "./radarAuto";
import type { Meta } from "../../types/extras";
import { exportarCsv, reais } from "../../services/exportacao";
import { extras } from "../../services/extras";
import { TextoIA } from "../ia/TextoIA";
import { MaisDoItemRadar, ResumoRadar } from "./ExtrasRadar";
import { BuscaTodasLojas } from "./BuscaTodasLojas";
import { centavosParaValorInput, dataAtualISO, formatarCentavos, formatarDataISOParaBR, valorInputParaCentavos } from "../../services/formato";
import type { Conta } from "../../types/accounting";
import type { ItemRadar } from "../../types/extras";

type Filtro = "TODOS" | "NO_ALVO" | "ACIMA" | "SEM_PRECO";
type Ordem = "NOME" | "PERTO_ALVO" | "ECONOMIA";

function dias(deISO: string, ateISO: string): number {
  const [a1, m1, d1] = deISO.split("-").map(Number);
  const [a2, m2, d2] = ateISO.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/** Resumo de um item a partir dos preços que o usuário registrou. */
function resumir(item: ItemRadar, hoje: string) {
  const precos = item.precos;
  const menor = precos.length ? precos.reduce((a, b) => (b.preco_centavos < a.preco_centavos ? b : a)) : null;
  const maior = precos.length ? precos.reduce((a, b) => (b.preco_centavos > a.preco_centavos ? b : a)) : null;
  const ultimo = precos[0] ?? null;
  const primeiro = precos[precos.length - 1] ?? null;
  const media = precos.length ? Math.round(precos.reduce((s, p) => s + p.preco_centavos, 0) / precos.length) : 0;
  const alvo = item.preco_alvo_centavos;
  const noAlvo = !!alvo && !!menor && menor.preco_centavos <= alvo;
  const distAlvo = alvo && menor ? ((menor.preco_centavos - alvo) / alvo) * 100 : null;
  // Tendência: média dos últimos 30 dias vs média anterior (precisa de ao menos 2 registros recentes).
  const recentes = precos.filter((p) => dias(p.data, hoje) <= 30);
  const antigos = precos.filter((p) => dias(p.data, hoje) > 30);
  let tendencia: "CAINDO" | "SUBINDO" | "ESTAVEL" | null = null;
  if (recentes.length >= 1 && antigos.length >= 1) {
    const mr = recentes.reduce((s, p) => s + p.preco_centavos, 0) / recentes.length;
    const ma = antigos.reduce((s, p) => s + p.preco_centavos, 0) / antigos.length;
    tendencia = mr < ma * 0.97 ? "CAINDO" : mr > ma * 1.03 ? "SUBINDO" : "ESTAVEL";
  } else if (precos.length >= 2) {
    const v = ((precos[0].preco_centavos - precos[1].preco_centavos) / precos[1].preco_centavos) * 100;
    tendencia = v < -3 ? "CAINDO" : v > 3 ? "SUBINDO" : "ESTAVEL";
  }
  const porLoja = new Map<string, number>();
  for (const p of precos) porLoja.set(p.loja, Math.min(porLoja.get(p.loja) ?? Infinity, p.preco_centavos));
  const lojasOrdenadas = [...porLoja.entries()].sort((a, b) => a[1] - b[1]);
  const desatualizado = ultimo ? dias(ultimo.data, hoje) > 30 : false;
  const economia = maior && menor ? maior.preco_centavos - menor.preco_centavos : 0;
  const variacaoTotal = primeiro && ultimo && primeiro.id !== ultimo.id ? ((ultimo.preco_centavos - primeiro.preco_centavos) / primeiro.preco_centavos) * 100 : null;
  return { menor, maior, ultimo, media, alvo, noAlvo, distAlvo, tendencia, lojasOrdenadas, desatualizado, economia, variacaoTotal };
}

const urlBusca = (nome: string) => `https://www.zoom.com.br/search?q=${encodeURIComponent(nome)}`;

export function RadarPage() {
  const [itens, setItens] = useState<ItemRadar[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState("");
  const [alvo, setAlvo] = useState("");
  const [form, setForm] = useState<Record<string, { loja: string; preco: string; url: string; data: string }>>({});
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const [ordem, setOrdem] = useState<Ordem>("NOME");
  const [editando, setEditando] = useState<string | null>(null);
  const [ed, setEd] = useState({ nome: "", alvo: "" });
  const [comprando, setComprando] = useState<string | null>(null);
  const [cp, setCp] = useState({ conta: "", categoria: "despesa-outras", valor: "" });
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null);
  const [secao, setSecao] = useAbaDaPagina<"produtos" | "novo">("radar", "produtos");
  const hoje = dataAtualISO();
  const [metas, setMetas] = useState<Meta[]>([]);
  const [buscando, setBuscando] = useState<string | null>(null);
  const [ofertas, setOfertas] = useState<{ id: string; lista: Oferta[] } | null>(null);
  const [analise, setAnalise] = useState<{ id: string; texto: string | null } | null>(null);

  async function analisarComIA(item: ItemRadar) {
    setAnalise({ id: item.id, texto: null });
    try {
      const { perguntarIA, INSTRUCAO_BASE } = await import("../../services/gemini");
      const { carregarFatos } = await import("../../services/fatosFinanceiros");
      const f = await carregarFatos(dataAtualISO());
      const historico = [...item.precos].sort((a, b) => a.data.localeCompare(b.data)).map((p) => `${p.data} ${p.loja} ${formatarCentavos(p.preco_centavos)}`).join("; ");
      const meta = metas.find((m) => m.id === item.meta_id);
      const texto = await perguntarIA({
        instrucao: INSTRUCAO_BASE,
        contexto: `Produto: ${item.nome}. Preço-alvo: ${item.preco_alvo_centavos ? formatarCentavos(item.preco_alvo_centavos) : "não definido"}. Histórico de preços: ${historico || "nenhum"}.${meta ? ` Meta ligada: ${formatarCentavos(meta.guardado_centavos)} guardados de ${formatarCentavos(meta.valor_alvo_centavos)}.` : ""} Saldo em contas: ${formatarCentavos(f.saldoLiquido)}. Gasto médio mensal: ${formatarCentavos(f.gastoMedioMensal)}. Reserva cobre ${f.mesesDeReserva ?? "?"} meses.`,
        pergunta: "Em até 8 linhas: o preço atual está bom comparado ao histórico? Tendência (subindo, caindo, estável)? Vale comprar agora ou esperar (ex.: datas de promoção como Black Friday)? Cabe no meu orçamento sem prejudicar a reserva? Diga o que é estimativa.",
      });
      setAnalise({ id: item.id, texto });
    } catch (e) {
      setAnalise(null);
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }
  const [radarAuto, setRadarAuto] = usePreferencia<boolean>("radar_auto", false);
  const [radarAutoIA, setRadarAutoIA] = usePreferencia<boolean>("radar_auto_ia", false);

  async function buscarAgora(item: ItemRadar) {
    try {
      setBuscando(item.id);
      const r = await buscarERegistrar(item, hoje);
      setOfertas(r.ofertas.length ? { id: item.id, lista: r.ofertas } : null);
      if (!r.oferta) toast.info("Nenhuma oferta encontrada nas lojas para esse nome. Tente um nome mais específico (marca e modelo).");
      else toast.success(`Menor preço: ${formatarCentavos(r.oferta.precoCentavos)} na ${r.oferta.loja} (${r.oferta.titulo.slice(0, 50)}). Registrado no histórico.${r.noAlvo ? " Chegou ao preço-alvo!" : ""}`, { duration: 8000 });
      await carregar();
    } catch (e) {
      toast.error(`Não foi possível buscar agora: ${String(e)}`);
    } finally {
      setBuscando(null);
    }
  }

  async function ligarMeta(item: ItemRadar, metaId: string) {
    try {
      await planejamento.vincularRadarMeta(item.id, metaId || null);
      toast.success(metaId ? "Produto ligado à meta: o Dairus avisa quando chegar ao preço-alvo." : "Desligado da meta.");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function carregar() {
    try {
      const [r, c, m] = await Promise.all([extras.listarRadar(), contabilidade.listarContas(), extras.listarMetas()]);
      setItens(r);
      setContas(c);
      setMetas(m);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const resumos = useMemo(() => new Map(itens.map((i) => [i.id, resumir(i, hoje)])), [itens, hoje]);
  const lojasConhecidas = useMemo(() => [...new Set(itens.flatMap((i) => i.precos.map((p) => p.loja)))].sort(), [itens]);

  if (carregando) return <Skeleton className="h-64 w-full" />;

  const contasPagaveis = contas.filter((c) => (c.tipo === "ATIVO" || c.tipo === "PASSIVO") && c.subtipo !== "CATEGORIA" && c.ativa);
  const categoriasDespesa = contas.filter((c) => c.tipo === "DESPESA" && c.subtipo !== "CATEGORIA" && c.ativa);

  const noAlvoN = itens.filter((i) => resumos.get(i.id)!.noAlvo).length;
  const somaMenores = itens.reduce((s, i) => s + (resumos.get(i.id)!.menor?.preco_centavos ?? 0), 0);
  const economiaPotencial = itens.reduce((s, i) => s + resumos.get(i.id)!.economia, 0);

  const termo = busca.trim().toLowerCase();
  const lista = itens
    .filter((i) => !termo || i.nome.toLowerCase().includes(termo))
    .filter((i) => {
      const r = resumos.get(i.id)!;
      if (filtro === "NO_ALVO") return r.noAlvo;
      if (filtro === "ACIMA") return !!i.preco_alvo_centavos && !!r.menor && !r.noAlvo;
      if (filtro === "SEM_PRECO") return i.precos.length === 0;
      return true;
    })
    .sort((a, b) => {
      const ra = resumos.get(a.id)!;
      const rb = resumos.get(b.id)!;
      if (ordem === "PERTO_ALVO") return (ra.distAlvo ?? 9999) - (rb.distAlvo ?? 9999);
      if (ordem === "ECONOMIA") return rb.economia - ra.economia;
      return a.nome.localeCompare(b.nome);
    });

  async function criar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!nome.trim()) return toast.error("Informe o produto.");
    const alvoCentavos = valorInputParaCentavos(alvo);
    try {
      await extras.criarItemRadar(nome.trim(), alvoCentavos > 0 ? alvoCentavos : null);
      setNome("");
      setAlvo("");
      setSecao("produtos");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function registrar(item: ItemRadar) {
    const f = form[item.id] ?? { loja: "", preco: "", url: "", data: hoje };
    const preco = valorInputParaCentavos(f.preco);
    if (!f.loja.trim() || preco <= 0) return toast.error("Informe a loja e o preço.");
    if (f.url.trim() && !/^https?:\/\//i.test(f.url.trim())) return toast.error("O link precisa começar com http:// ou https://");
    try {
      await extras.registrarPrecoRadar(item.id, f.loja.trim(), preco, f.url.trim() || null, f.data || hoje);
      setForm((s) => ({ ...s, [item.id]: { loja: f.loja, preco: "", url: "", data: hoje } }));
      const anterior = resumos.get(item.id)!.menor;
      if (anterior && preco < anterior.preco_centavos) toast.success("Novo menor preço registrado!");
      else toast.success("Preço registrado.");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function salvarEdicao(item: ItemRadar) {
    const a = valorInputParaCentavos(ed.alvo);
    try {
      await extras.atualizarItemRadar(item.id, ed.nome, a > 0 ? a : null);
      toast.success("Item atualizado.");
      setEditando(null);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function excluir(item: ItemRadar) {
    try {
      await extras.excluirItemRadar(item.id);
      setConfirmarExcluir(null);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function criarMeta(item: ItemRadar) {
    const r = resumos.get(item.id)!;
    const valor = item.preco_alvo_centavos ?? r.menor?.preco_centavos;
    if (!valor) return toast.error("Registre um preço ou defina o preço-alvo primeiro.");
    try {
      await extras.criarMeta(`Comprar: ${item.nome}`, valor, null, "COMPRA", "MEDIA", "Criada a partir do Radar de Compras");
      toast.success("Meta de compra criada em Metas Financeiras.");
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function registrarCompra(item: ItemRadar) {
    const valor = valorInputParaCentavos(cp.valor);
    const conta = cp.conta || contasPagaveis[0]?.id;
    if (valor <= 0 || !conta) return toast.error("Informe o valor e a conta.");
    try {
      await contabilidade.registrarDespesa({ conta_origem_id: conta, categoria_despesa_id: cp.categoria, valor_centavos: valor, data: hoje, descricao: item.nome });
      toast.success("Compra registrada como despesa. Remova o item do radar quando quiser.");
      setComprando(null);
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  async function exportar() {
    try {
      const caminho = await exportarCsv("radar-de-compras", ["Produto", "Preço-alvo (R$)", "Loja", "Preço (R$)", "Data", "Link"], itens.flatMap((i) => (i.precos.length ? i.precos.map((p) => [i.nome, i.preco_alvo_centavos ? reais(i.preco_alvo_centavos) : "", p.loja, reais(p.preco_centavos), formatarDataISOParaBR(p.data), p.url ?? ""]) : [[i.nome, i.preco_alvo_centavos ? reais(i.preco_alvo_centavos) : "", "", "", "", ""]])));
      toast.success(`Arquivo salvo em ${caminho}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  const rotuloTendencia = { CAINDO: { t: "Caindo", cor: "var(--cor-sucesso)", I: TrendingDown }, SUBINDO: { t: "Subindo", cor: "#ff2d55", I: TrendingUp }, ESTAVEL: { t: "Estável", cor: "var(--cor-texto-secundario)", I: Minus } } as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-texto-primario"><Radar size={20} className="text-secundaria" /> Radar de Compras</h1>
          <p className="text-sm text-texto-secundario">Acompanhe o preço dos produtos que quer comprar. Os preços são os que você registra — o Dairus não faz buscas automáticas na internet, e a decisão de compra é sempre sua.</p>
        </div>
        <Button tamanho="pequeno" variante="secundaria" onClick={exportar} disabled={itens.length === 0}><Download size={13} /> CSV</Button>
      </div>

      {itens.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard titulo="Produtos no radar" valor={String(itens.length)} icone={Radar} corIcone="secundaria" subtitulo={`${itens.filter((i) => i.precos.length === 0).length} sem preço registrado`} />
          <StatCard titulo="No preço-alvo" valor={String(noAlvoN)} corValor={noAlvoN ? "sucesso" : "normal"} icone={BellRing} corIcone="sucesso" subtitulo={noAlvoN ? "Boa hora de avaliar a compra" : "Nenhum chegou ao alvo"} />
          <StatCard titulo="Lista de desejos (menores preços)" valor={formatarCentavos(somaMenores)} icone={ShoppingCart} corIcone="primaria" subtitulo="Soma do menor preço de cada item" />
          <StatCard titulo="Diferença entre lojas" valor={formatarCentavos(economiaPotencial)} icone={Store} corIcone="alerta" subtitulo="Quanto se economiza comprando no menor preço registrado" />
        </div>
      )}

      <Abas ativa={secao} onChange={setSecao} abas={[{ id: "produtos", rotulo: `Acompanhando (${itens.length})`, icone: Radar, contador: noAlvoN }, { id: "novo", rotulo: "Adicionar produto", icone: ShoppingCart }]} />

      {(secao === "novo") && (<>
      <label className="flex items-center gap-2 text-sm text-texto-primario">
        <input type="checkbox" checked={radarAuto} onChange={() => setRadarAuto(!radarAuto)} className="h-4 w-4 accent-[var(--cor-primaria)]" />
        Buscar preços sozinho todo dia nas lojas (Magazine Luiza, Amazon, Fast Shop e outras, pelo Zoom) e avisar quando baixar ou chegar ao alvo
      </label>
      {radarAuto && (
        <label className="ml-6 flex items-center gap-2 text-xs text-texto-secundario">
          <input type="checkbox" checked={radarAutoIA} onChange={() => setRadarAutoIA(!radarAutoIA)} className="h-3.5 w-3.5 accent-[var(--cor-primaria)]" />
          Também procurar com a IA na busca do Google (usa sua chave do Gemini; sem marcar, só o comparador Zoom)
        </label>
      )}
      <Secao titulo="Novo produto">
        <form onSubmit={criar} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Notebook 16GB" aria-label="Produto" className={CLASSE_INPUT} />
          <input value={alvo} onChange={(e) => setAlvo(e.target.value)} inputMode="decimal" placeholder="Preço-alvo (R$, opcional)" aria-label="Preço-alvo" className={CLASSE_INPUT} />
          <Button type="submit">Acompanhar produto</Button>
        </form>
      </Secao>
      </>)}

      {(secao === "produtos") && (<>
      <ResumoRadar itens={itens} hoje={hoje} saldoLivre={contas.filter((c) => c.ativa && c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA" && c.subtipo !== "INVESTIMENTO" && c.id !== "ativo-a-receber").reduce((s2, c) => s2 + c.saldo_atual_centavos, 0) - metas.filter((m) => !m.conta_id).reduce((s2, m) => s2 + m.guardado_centavos, 0)} />
      {itens.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-secundario" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto…" aria-label="Buscar produto" className={`${CLASSE_INPUT} w-52 pl-8`} /></div>
          <Select aria-label="Filtrar" value={filtro} onValueChange={(v) => setFiltro(v as Filtro)} options={[{ value: "TODOS", label: "Todos" }, { value: "NO_ALVO", label: "No preço-alvo" }, { value: "ACIMA", label: "Acima do alvo" }, { value: "SEM_PRECO", label: "Sem preço registrado" }]} className="w-48" />
          <Select aria-label="Ordenar" value={ordem} onValueChange={(v) => setOrdem(v as Ordem)} options={[{ value: "NOME", label: "Ordem alfabética" }, { value: "PERTO_ALVO", label: "Mais perto do alvo" }, { value: "ECONOMIA", label: "Maior diferença entre lojas" }]} className="w-56" />
        </div>
      )}
      </>)}

      {(secao === "produtos") && (<>
      {lista.length === 0 ? (
        <EmptyState titulo={itens.length === 0 ? "Nenhum produto no radar" : "Nenhum produto neste filtro"} descricao="Adicione um produto e registre os preços que for encontrando nas lojas." />
      ) : (
        <ul className="space-y-4">
          {lista.map((item) => {
            const r = resumos.get(item.id)!;
            const cor = r.noAlvo ? "var(--cor-sucesso)" : "var(--cor-secundaria)";
            const serie = [...item.precos].reverse().map((p) => ({ data: formatarDataISOParaBR(p.data).slice(0, 5), preco: p.preco_centavos / 100 }));
            const f = form[item.id] ?? { loja: "", preco: "", url: "", data: hoje };
            const T = r.tendencia ? rotuloTendencia[r.tendencia] : null;
            return (
              <li key={item.id} className="rounded-xl border bg-cartao p-4" style={{ borderColor: `color-mix(in srgb, ${cor} 40%, transparent)`, backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${cor} 12%, transparent), transparent 60%)`, boxShadow: `0 8px 24px -16px ${cor}` }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <IconeCoisa nome={item.nome} tamanho={40} redondo padrao={{ icone: Radar, cor: "#00d9ff" }} />
                    <div>
                      {editando === item.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} aria-label="Nome" className={`${CLASSE_INPUT} py-1`} />
                          <input value={ed.alvo} onChange={(e) => setEd({ ...ed, alvo: e.target.value })} inputMode="decimal" placeholder="Preço-alvo" aria-label="Preço-alvo" className={`${CLASSE_INPUT} w-28 py-1`} />
                          <Button tamanho="pequeno" onClick={() => salvarEdicao(item)}>Salvar</Button>
                          <Button tamanho="pequeno" variante="fantasma" onClick={() => setEditando(null)}>Cancelar</Button>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-texto-primario">{item.nome}</p>
                          <p className="text-xs text-texto-secundario">
                            {r.alvo ? `Preço-alvo ${formatarCentavos(r.alvo)}` : "Sem preço-alvo"} · {item.precos.length} registro(s)
                            {r.ultimo && ` · último em ${formatarDataISOParaBR(r.ultimo.data)}`}
                            {r.desatualizado && <span className="ml-1 text-alerta">· preços com mais de 30 dias</span>}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {r.noAlvo && <span className="inline-flex items-center gap-1 rounded-full border border-sucesso/70 bg-sucesso/10 px-2 py-0.5 text-[11px] font-semibold text-sucesso shadow-[0_0_10px_-4px_var(--cor-sucesso)]"><BellRing size={11} /> No preço-alvo</span>}
                    {!r.noAlvo && r.distAlvo !== null && <span className="rounded-full border border-borda px-2 py-0.5 text-[11px] text-texto-secundario">{r.distAlvo.toFixed(0)}% acima do alvo</span>}
                    {T && <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: T.cor }}><T.I size={12} /> {T.t}</span>}
                    <button onClick={() => analisarComIA(item)} disabled={analise?.id === item.id && analise.texto === null} className="inline-flex items-center gap-1 rounded-md border border-borda px-2 py-1 text-[11px] text-texto-secundario hover:border-primaria hover:text-primaria disabled:opacity-50" title="A IA avalia o histórico de preços e o seu orçamento">{analise?.id === item.id && analise.texto === null ? "Analisando…" : "Analisar com IA"}</button>
                    <button onClick={() => buscarAgora(item)} disabled={buscando === item.id} className="inline-flex items-center gap-1 rounded-md border border-primaria/60 px-2 py-1 text-[11px] text-primaria hover:bg-primaria/10 disabled:opacity-50" title="Busca o produto em várias lojas (pelo comparador Zoom) e registra o menor preço">{buscando === item.id ? "Buscando…" : "Buscar preço agora"}</button>
                    <Select aria-label={`Meta ligada a ${item.nome}`} value={item.meta_id ?? ""} onValueChange={(v) => ligarMeta(item, v)} options={[{ value: "", label: "Sem meta" }, ...metas.map((m) => ({ value: m.id, label: `Meta: ${m.nome}` }))]} className="w-40" />
                    <a href={urlBusca(item.nome)} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 rounded-md border border-borda px-2 py-1 text-[11px] text-texto-secundario hover:border-primaria hover:text-primaria" title="Abre a comparação de preços no seu navegador"><ExternalLink size={11} /> Ver no comparador</a>
                    <button onClick={() => { setEditando(item.id); setEd({ nome: item.nome, alvo: item.preco_alvo_centavos ? centavosParaValorInput(item.preco_alvo_centavos) : "" }); }} aria-label={`Editar ${item.nome}`} className="rounded-md p-1.5 text-texto-secundario hover:bg-borda/50 hover:text-primaria"><Pencil size={14} /></button>
                    <button onClick={() => (confirmarExcluir === item.id ? excluir(item) : setConfirmarExcluir(item.id))} aria-label={`Remover ${item.nome}`} title={confirmarExcluir === item.id ? "Clique de novo para confirmar" : "Remover"} className={`rounded-md p-1.5 hover:bg-erro/15 ${confirmarExcluir === item.id ? "text-erro" : "text-texto-secundario hover:text-erro"}`}><Trash2 size={15} /></button>
                  </div>
                </div>
                {ofertas?.id === item.id && (
                  <div className="mt-3 rounded-lg border border-primaria/40 bg-primaria/5 p-3">
                    <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-primaria">Ofertas encontradas ({ofertas.lista.length})</span><button onClick={() => setOfertas(null)} aria-label="Fechar ofertas" className="text-texto-secundario hover:text-texto-primario"><X size={12} /></button></div>
                    <ul className="max-h-56 space-y-1.5 overflow-y-auto text-xs">
                      {ofertas.lista.slice(0, 12).map((o) => {
                        const jaTem = item.precos.some((p) => p.data === hoje && p.loja === lojaDaOferta(o) && p.preco_centavos === o.precoCentavos);
                        return (
                          <li key={o.url || o.titulo} className="flex items-center justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block truncate text-texto-primario" title={o.titulo}>{o.titulo}</span>
                              <span className="text-texto-secundario">{o.loja}{o.lojas.length > 1 ? ` · ${o.lojas.length} lojas: ${o.lojas.join(", ")}` : ""}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="font-semibold tabular-nums text-texto-primario">{formatarCentavos(o.precoCentavos)}</span>
                              {o.url && <a href={o.url} target="_blank" rel="noreferrer noopener" aria-label="Abrir oferta" className="text-primaria"><ExternalLink size={12} /></a>}
                              <button disabled={jaTem} onClick={() => registrarOferta(item, o, hoje).then(() => { toast.success("Preço registrado."); return carregar(); }).catch((e) => toast.error(String(e)))} className="rounded border border-borda px-1.5 py-0.5 text-[11px] text-texto-secundario hover:border-primaria hover:text-primaria disabled:opacity-50">{jaTem ? "Registrado" : "Registrar"}</button>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {analise?.id === item.id && analise.texto && (
                  <div className="mt-3 rounded-lg border border-primaria/40 bg-primaria/5 p-3 text-sm text-texto-primario">
                    <div className="mb-1 flex items-center justify-between"><span className="text-xs font-semibold text-primaria">Análise da IA (pode conter erros)</span><button onClick={() => setAnalise(null)} aria-label="Fechar análise" className="text-texto-secundario hover:text-texto-primario"><X size={12} /></button></div>
                    <TextoIA texto={analise.texto} />
                  </div>
                )}

                {r.menor && r.ultimo && (
                  <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
                    <div className="space-y-2 text-sm">
                      <dl className="grid grid-cols-3 gap-2 text-xs">
                        <div><dt className="text-texto-secundario">Menor</dt><dd className="font-semibold tabular-nums text-sucesso">{formatarCentavos(r.menor.preco_centavos)}</dd></div>
                        <div><dt className="text-texto-secundario">Média</dt><dd className="font-semibold tabular-nums text-texto-primario">{formatarCentavos(r.media)}</dd></div>
                        <div><dt className="text-texto-secundario">Maior</dt><dd className="font-semibold tabular-nums text-erro">{formatarCentavos(r.maior!.preco_centavos)}</dd></div>
                      </dl>
                      <p className="text-xs text-texto-secundario">Menor preço em <strong className="text-texto-primario">{r.menor.loja}</strong> ({formatarDataISOParaBR(r.menor.data)}). Último: <span className="tabular-nums text-texto-primario">{formatarCentavos(r.ultimo.preco_centavos)}</span> em {r.ultimo.loja}.{r.variacaoTotal !== null && ` Variação desde o primeiro registro: ${r.variacaoTotal >= 0 ? "+" : ""}${r.variacaoTotal.toFixed(0)}%.`}</p>
                      {r.lojasOrdenadas.length > 1 && (
                        <ul className="space-y-0.5 text-xs">
                          {r.lojasOrdenadas.slice(0, 4).map(([loja, v], i) => <li key={loja} className="flex justify-between"><span className={i === 0 ? "font-medium text-sucesso" : "text-texto-secundario"}>{i === 0 ? "★ " : ""}{loja}</span><span className="tabular-nums text-texto-primario">{formatarCentavos(v)}</span></li>)}
                        </ul>
                      )}
                      <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-texto-secundario">
                        {item.precos.slice(0, 10).map((p) => (
                          <li key={p.id} className="flex items-center justify-between gap-2">
                            <span>{formatarDataISOParaBR(p.data)} · {p.loja}</span>
                            <span className="flex items-center gap-1.5 tabular-nums">
                              {formatarCentavos(p.preco_centavos)}
                              {p.url && /^https?:\/\//.test(p.url) && (<><a href={p.url} target="_blank" rel="noreferrer noopener" aria-label="Abrir link" className="text-primaria"><ExternalLink size={12} /></a><button onClick={() => copiar(p.url!)} aria-label="Copiar link" className="hover:text-primaria"><Copy size={12} /></button></>)}
                              <button onClick={() => extras.excluirPrecoRadar(p.id).then(carregar).catch((e) => toast.error(String(e)))} aria-label="Remover registro" className="hover:text-erro"><X size={12} /></button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {serie.length > 1 && (
                      <div className="h-36">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={serie}>
                            <defs><linearGradient id={`g-${item.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00d9ff" stopOpacity={0.5} /><stop offset="100%" stopColor="#00d9ff" stopOpacity={0} /></linearGradient></defs>
                            <XAxis dataKey="data" tick={{ fontSize: 10, fill: "var(--cor-texto-secundario)" }} axisLine={false} tickLine={false} />
                            <YAxis hide domain={["auto", "auto"]} />
                            <Tooltip formatter={(v) => formatarCentavos(Math.round(Number(v) * 100))} contentStyle={{ background: "var(--cor-superficie)", border: "1px solid var(--cor-borda)", borderRadius: 8, fontSize: 12 }} />
                            {r.alvo && <ReferenceLine y={r.alvo / 100} stroke="#00d395" strokeDasharray="4 4" label={{ value: "alvo", fill: "#00d395", fontSize: 10, position: "right" }} />}
                            <Area type="monotone" dataKey="preco" stroke="#00d9ff" strokeWidth={2.5} fill={`url(#g-${item.id})`} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )}

                {r.menor && (
                  <p className="mt-3 rounded-lg border border-borda bg-fundo/40 px-3 py-2 text-xs text-texto-secundario">
                    <strong className="text-texto-primario">Leitura (regra simples, não é recomendação):</strong>{" "}
                    {r.noAlvo ? "o menor preço registrado já está dentro do seu alvo." : r.alvo ? `o menor preço está ${r.distAlvo!.toFixed(0)}% acima do alvo; ${r.tendencia === "CAINDO" ? "a tendência é de queda — vale acompanhar" : r.tendencia === "SUBINDO" ? "a tendência é de alta" : "sem tendência clara ainda"}.` : "defina um preço-alvo para receber esse tipo de leitura."}
                  </p>
                )}

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_7rem_8rem_1.2fr_auto]">
                  <input value={f.loja} list="lojas-radar" onChange={(e) => setForm((s) => ({ ...s, [item.id]: { ...f, loja: e.target.value } }))} placeholder="Loja" aria-label="Loja" className={CLASSE_INPUT} />
                  <input value={f.preco} onChange={(e) => setForm((s) => ({ ...s, [item.id]: { ...f, preco: e.target.value } }))} inputMode="decimal" placeholder="Preço (R$)" aria-label="Preço" className={CLASSE_INPUT} />
                  <input type="date" value={f.data} onChange={(e) => setForm((s) => ({ ...s, [item.id]: { ...f, data: e.target.value } }))} aria-label="Data" className={CLASSE_INPUT} />
                  <input value={f.url} onChange={(e) => setForm((s) => ({ ...s, [item.id]: { ...f, url: e.target.value } }))} placeholder="Link (opcional)" aria-label="Link" className={CLASSE_INPUT} />
                  <Button tamanho="pequeno" className="h-9" onClick={() => registrar(item)}>Registrar preço</Button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button tamanho="pequeno" variante="secundaria" onClick={() => criarMeta(item)}><Target size={13} /> Criar meta de compra</Button>
                  <Button tamanho="pequeno" variante="secundaria" onClick={() => { setComprando(comprando === item.id ? null : item.id); setCp({ conta: "", categoria: "despesa-outras", valor: r.ultimo ? centavosParaValorInput(r.menor?.preco_centavos ?? r.ultimo.preco_centavos) : "" }); }}><ShoppingCart size={13} /> Comprei</Button>
                </div>
                <BuscaTodasLojas item={item} onAlterado={carregar} />
                <MaisDoItemRadar item={item} onAlterado={carregar} />
                {comprando === item.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input value={cp.valor} onChange={(e) => setCp({ ...cp, valor: e.target.value })} inputMode="decimal" placeholder="Valor pago" aria-label="Valor pago" className={`${CLASSE_INPUT} w-28`} />
                    <Select aria-label="Conta" value={cp.conta || contasPagaveis[0]?.id || ""} onValueChange={(v) => setCp({ ...cp, conta: v })} options={contasPagaveis.map((c) => ({ value: c.id, label: c.nome }))} className="w-44" />
                    <Select aria-label="Categoria" value={cp.categoria} onValueChange={(v) => setCp({ ...cp, categoria: v })} options={categoriasDespesa.map((c) => ({ value: c.id, label: c.nome }))} className="w-40" />
                    <Button tamanho="pequeno" onClick={() => registrarCompra(item)}>Registrar despesa</Button>
                  </div>
                )}
                {confirmarExcluir === item.id && <p className="mt-2 text-xs text-erro">Clique na lixeira de novo para remover o produto e todo o histórico de preços.</p>}
              </li>
            );
          })}
        </ul>
      )}
      </>)}
      <datalist id="lojas-radar">{lojasConhecidas.map((l) => <option key={l} value={l} />)}</datalist>
    </div>
  );
}
