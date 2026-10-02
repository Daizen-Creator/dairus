import { useEffect, useState } from "react";
import { BellRing, ExternalLink, Radar, Trash2, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { EmptyState } from "../../components/ui/EmptyState";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { Skeleton } from "../../components/ui/Skeleton";
import { extras } from "../../services/extras";
import { dataAtualISO, formatarCentavos, formatarDataISOParaBR, valorInputParaCentavos } from "../../services/formato";
import type { ItemRadar } from "../../types/extras";

export function RadarPage() {
  const [itens, setItens] = useState<ItemRadar[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState("");
  const [alvo, setAlvo] = useState("");
  const [form, setForm] = useState<Record<string, { loja: string; preco: string; url: string }>>({});

  async function carregar() {
    try {
      setItens(await extras.listarRadar());
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function criar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!nome.trim()) {
      toast.error("Informe o produto.");
      return;
    }
    const alvoCentavos = valorInputParaCentavos(alvo);
    try {
      await extras.criarItemRadar(nome.trim(), alvoCentavos > 0 ? alvoCentavos : null);
      setNome("");
      setAlvo("");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function registrar(item: ItemRadar) {
    const f = form[item.id] ?? { loja: "", preco: "", url: "" };
    const preco = valorInputParaCentavos(f.preco);
    if (!f.loja.trim() || preco <= 0) {
      toast.error("Informe a loja e o preço.");
      return;
    }
    try {
      await extras.registrarPrecoRadar(item.id, f.loja.trim(), preco, f.url.trim() || null, dataAtualISO());
      setForm((s) => ({ ...s, [item.id]: { loja: f.loja, preco: "", url: "" } }));
      toast.success("Preço registrado.");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function excluir(item: ItemRadar) {
    try {
      await extras.excluirItemRadar(item.id);
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  if (carregando) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-texto-primario">
          <Radar size={20} className="text-secundaria" /> Radar de Compras
        </h1>
        <p className="text-sm text-texto-secundario">
          Acompanhe o preço dos produtos que quer comprar. Os preços são os que você registra — o Dairus não faz buscas
          automáticas na internet, e a decisão de compra é sempre sua.
        </p>
      </div>

      <Secao titulo="Novo produto">
        <form onSubmit={criar} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Notebook 16GB" className={CLASSE_INPUT} />
          <input value={alvo} onChange={(e) => setAlvo(e.target.value)} inputMode="decimal" placeholder="Preço-alvo (R$, opcional)" className={CLASSE_INPUT} />
          <Button type="submit">Acompanhar produto</Button>
        </form>
      </Secao>

      {itens.length === 0 ? (
        <EmptyState titulo="Nenhum produto no radar" descricao="Adicione um produto e registre os preços que for encontrando nas lojas." />
      ) : (
        <ul className="space-y-4">
          {itens.map((item) => {
            const menor = item.precos.length ? item.precos.reduce((a, b) => (b.preco_centavos < a.preco_centavos ? b : a)) : null;
            const ultimo = item.precos[0] ?? null;
            const noAlvo = !!item.preco_alvo_centavos && !!menor && menor.preco_centavos <= item.preco_alvo_centavos;
            const cor = noAlvo ? "var(--cor-sucesso)" : "var(--cor-secundaria)";
            const serie = [...item.precos].reverse().map((p) => ({ data: formatarDataISOParaBR(p.data).slice(0, 5), preco: p.preco_centavos / 100 }));
            const f = form[item.id] ?? { loja: "", preco: "", url: "" };
            return (
              <li
                key={item.id}
                className="rounded-xl border bg-cartao p-4"
                style={{
                  borderColor: `color-mix(in srgb, ${cor} 40%, transparent)`,
                  backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${cor} 12%, transparent), transparent 60%)`,
                  boxShadow: `0 8px 24px -16px ${cor}`,
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <IconeCoisa nome={item.nome} tamanho={40} redondo padrao={{ icone: Radar, cor: "#00d9ff" }} />
                    <div>
                      <p className="text-sm font-semibold text-texto-primario">{item.nome}</p>
                      <p className="text-xs text-texto-secundario">
                        {item.preco_alvo_centavos ? `Preço-alvo ${formatarCentavos(item.preco_alvo_centavos)}` : "Sem preço-alvo"} · {item.precos.length} registro(s)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {noAlvo && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-sucesso/70 bg-sucesso/10 px-2 py-0.5 text-[11px] font-semibold text-sucesso shadow-[0_0_10px_-4px_var(--cor-sucesso)]">
                        <BellRing size={11} /> No preço-alvo
                      </span>
                    )}
                    <button onClick={() => excluir(item)} aria-label={`Remover ${item.nome}`} className="rounded-md p-1.5 text-texto-secundario transition-colors hover:bg-erro/15 hover:text-erro">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {menor && ultimo && (
                  <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
                    <div className="space-y-2 text-sm">
                      <p className="flex items-center gap-2 text-texto-primario">
                        <TrendingDown size={14} className="text-sucesso" />
                        Menor preço: <strong className="tabular-nums">{formatarCentavos(menor.preco_centavos)}</strong>
                        <span className="text-xs text-texto-secundario">({menor.loja}, {formatarDataISOParaBR(menor.data)})</span>
                      </p>
                      <p className="text-texto-secundario">
                        Último: <span className="tabular-nums text-texto-primario">{formatarCentavos(ultimo.preco_centavos)}</span> em {ultimo.loja}
                      </p>
                      <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-texto-secundario">
                        {item.precos.slice(0, 8).map((p) => (
                          <li key={p.id} className="flex items-center justify-between gap-2">
                            <span>{formatarDataISOParaBR(p.data)} · {p.loja}</span>
                            <span className="flex items-center gap-2 tabular-nums">
                              {formatarCentavos(p.preco_centavos)}
                              {p.url && /^https?:\/\//.test(p.url) && (
                                <a href={p.url} target="_blank" rel="noreferrer noopener" aria-label="Abrir link" className="text-primaria">
                                  <ExternalLink size={12} />
                                </a>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {serie.length > 1 && (
                      <div className="h-32">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={serie}>
                            <defs>
                              <linearGradient id={`g-${item.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#00d9ff" stopOpacity={0.5} />
                                <stop offset="100%" stopColor="#00d9ff" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="data" tick={{ fontSize: 10, fill: "var(--cor-texto-secundario)" }} axisLine={false} tickLine={false} />
                            <YAxis hide domain={["auto", "auto"]} />
                            <Tooltip
                              formatter={(v) => formatarCentavos(Math.round(Number(v) * 100))}
                              contentStyle={{ background: "var(--cor-superficie)", border: "1px solid var(--cor-borda)", borderRadius: 8, fontSize: 12 }}
                            />
                            <Area type="monotone" dataKey="preco" stroke="#00d9ff" strokeWidth={2.5} fill={`url(#g-${item.id})`} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_8rem_1.2fr_auto]">
                  <input value={f.loja} onChange={(e) => setForm((s) => ({ ...s, [item.id]: { ...f, loja: e.target.value } }))} placeholder="Loja" aria-label="Loja" className={CLASSE_INPUT} />
                  <input value={f.preco} onChange={(e) => setForm((s) => ({ ...s, [item.id]: { ...f, preco: e.target.value } }))} inputMode="decimal" placeholder="Preço (R$)" aria-label="Preço" className={CLASSE_INPUT} />
                  <input value={f.url} onChange={(e) => setForm((s) => ({ ...s, [item.id]: { ...f, url: e.target.value } }))} placeholder="Link (opcional)" aria-label="Link" className={CLASSE_INPUT} />
                  <Button tamanho="pequeno" className="h-9" onClick={() => registrar(item)}>
                    Registrar preço
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
