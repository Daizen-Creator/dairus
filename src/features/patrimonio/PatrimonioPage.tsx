import { useEffect, useState } from "react";
import { Building2, CreditCard, Landmark, Scale, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { EmptyState } from "../../components/ui/EmptyState";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatCard } from "../../components/ui/StatCard";
import { contabilidade } from "../../services/contabilidade";
import { extras } from "../../services/extras";
import { dataAtualISO, formatarCentavos, formatarDataISOParaBR, valorInputParaCentavos } from "../../services/formato";
import type { Conta } from "../../types/accounting";
import type { Bem, TipoBem } from "../../types/extras";

export function PatrimonioPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [bens, setBens] = useState<Bem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoBem>("BEM");
  const [valor, setValor] = useState("");
  const [novosValores, setNovosValores] = useState<Record<string, string>>({});
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  async function carregar() {
    try {
      const [c, b] = await Promise.all([contabilidade.listarContas(), extras.listarBens()]);
      setContas(c);
      setBens(b);
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
    const centavos = valorInputParaCentavos(valor);
    if (!nome.trim() || centavos <= 0) {
      toast.error("Informe o nome e o valor.");
      return;
    }
    try {
      await extras.criarBem(nome.trim(), tipo, centavos, dataAtualISO());
      setNome("");
      setValor("");
      toast.success("Item adicionado.");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function reavaliar(bem: Bem) {
    const centavos = valorInputParaCentavos(novosValores[bem.id] ?? "");
    if (centavos < 0 || !(novosValores[bem.id] ?? "").trim()) {
      toast.error("Informe o novo valor.");
      return;
    }
    try {
      await extras.atualizarBem(bem.id, centavos, dataAtualISO());
      setNovosValores((n) => ({ ...n, [bem.id]: "" }));
      toast.success("Valor atualizado.");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function excluir(bem: Bem) {
    try {
      await extras.excluirBem(bem.id);
      toast.success("Item removido.");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  if (carregando) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const ativosContas = contas
    .filter((c) => c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA")
    .reduce((s, c) => s + c.saldo_atual_centavos, 0);
  const passivosContas = contas
    .filter((c) => c.tipo === "PASSIVO" && c.subtipo !== "CATEGORIA")
    .reduce((s, c) => s + c.saldo_atual_centavos, 0);
  const totalBens = bens.filter((b) => b.tipo === "BEM").reduce((s, b) => s + b.valor_centavos, 0);
  const totalDividas = bens.filter((b) => b.tipo === "DIVIDA").reduce((s, b) => s + b.valor_centavos, 0);
  const totalAtivos = ativosContas + totalBens;
  const totalPassivos = passivosContas + totalDividas;
  const liquido = totalAtivos - totalPassivos;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-texto-primario">Patrimônio</h1>
        <p className="text-sm text-texto-secundario">
          Saldos das contas e cartões somados aos bens e dívidas que você cadastra aqui. Os valores dos bens são informados por você.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard titulo="Patrimônio líquido" valor={formatarCentavos(liquido)} corValor={liquido < 0 ? "erro" : "sucesso"} icone={Scale} corIcone="sucesso" subtitulo="Ativos menos passivos" />
        <StatCard titulo="Total de ativos" valor={formatarCentavos(totalAtivos)} icone={Landmark} corIcone="primaria" subtitulo={`${formatarCentavos(ativosContas)} em contas · ${formatarCentavos(totalBens)} em bens`} />
        <StatCard titulo="Total de passivos" valor={formatarCentavos(totalPassivos)} icone={CreditCard} corIcone="erro" subtitulo={`${formatarCentavos(passivosContas)} em cartões · ${formatarCentavos(totalDividas)} em dívidas`} />
        <StatCard titulo="Itens cadastrados" valor={String(bens.length)} icone={Building2} corIcone="destaque" />
      </div>

      <Secao titulo="Adicionar bem ou dívida">
        <form onSubmit={criar} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Notebook, Moto, Financiamento" className={CLASSE_INPUT} />
          <Select
            aria-label="Tipo"
            value={tipo}
            onValueChange={(v) => setTipo(v as TipoBem)}
            options={[
              { value: "BEM", label: "Bem (ativo)" },
              { value: "DIVIDA", label: "Dívida (passivo)" },
            ]}
          />
          <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="Valor atual (R$)" className={CLASSE_INPUT} />
          <Button type="submit">Adicionar</Button>
        </form>
      </Secao>

      {bens.length === 0 ? (
        <EmptyState titulo="Nenhum bem ou dívida cadastrado" descricao="Cadastre bens (eletrônicos, veículo, imóvel) e dívidas para ver seu patrimônio líquido completo." />
      ) : (
        <ul className="space-y-3">
          {bens.map((b) => {
            const divida = b.tipo === "DIVIDA";
            const cor = divida ? "#ff2d55" : "var(--cor-sucesso)";
            const anterior = b.avaliacoes[1];
            const variacao = anterior ? b.valor_centavos - anterior.valor_centavos : null;
            const aberto = abertos.has(b.id);
            return (
              <li
                key={b.id}
                className="rounded-xl border bg-cartao px-4 py-3"
                style={{
                  borderColor: `color-mix(in srgb, ${cor} 32%, transparent)`,
                  backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${cor} 9%, transparent), transparent 55%)`,
                  boxShadow: `0 6px 18px -14px ${cor}`,
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <IconeCoisa nome={b.nome} tamanho={38} redondo padrao={{ icone: divida ? CreditCard : Building2, cor: divida ? "#f43f5e" : "#00d395" }} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-texto-primario">{b.nome}</p>
                      <p className="text-xs text-texto-secundario">
                        {divida ? "Dívida" : "Bem"} · atualizado em {formatarDataISOParaBR(b.avaliacoes[0].data)}
                        {variacao !== null && variacao !== 0 && (
                          <span className={variacao > 0 ? (divida ? " text-erro" : " text-sucesso") : divida ? " text-sucesso" : " text-erro"}>
                            {" "}
                            · {variacao > 0 ? "+" : "−"}
                            {formatarCentavos(Math.abs(variacao))}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-2 text-base font-bold tabular-nums" style={{ color: cor }}>
                      {divida ? "− " : ""}
                      {formatarCentavos(b.valor_centavos)}
                    </span>
                    <input
                      value={novosValores[b.id] ?? ""}
                      onChange={(e) => setNovosValores((n) => ({ ...n, [b.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && reavaliar(b)}
                      inputMode="decimal"
                      placeholder="Novo valor"
                      aria-label={`Novo valor de ${b.nome}`}
                      className={`${CLASSE_INPUT} w-28`}
                    />
                    <Button tamanho="pequeno" variante="secundaria" onClick={() => reavaliar(b)}>
                      Atualizar
                    </Button>
                    {b.avaliacoes.length > 1 && (
                      <button
                        onClick={() =>
                          setAbertos((s) => {
                            const n = new Set(s);
                            n.has(b.id) ? n.delete(b.id) : n.add(b.id);
                            return n;
                          })
                        }
                        className="text-xs text-primaria hover:underline"
                      >
                        {aberto ? "Ocultar histórico" : `Histórico (${b.avaliacoes.length})`}
                      </button>
                    )}
                    <button
                      onClick={() => excluir(b)}
                      aria-label={`Remover ${b.nome}`}
                      className="rounded-md p-1.5 text-texto-secundario transition-colors hover:bg-erro/15 hover:text-erro"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                {aberto && (
                  <ul className="mt-3 space-y-1 border-t border-borda pt-3 text-xs text-texto-secundario">
                    {b.avaliacoes.map((a, i) => (
                      <li key={i} className="flex justify-between">
                        <span>{formatarDataISOParaBR(a.data)}</span>
                        <span className="tabular-nums">{formatarCentavos(a.valor_centavos)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
