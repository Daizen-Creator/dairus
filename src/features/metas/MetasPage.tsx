import { useEffect, useState } from "react";
import { Flag, PiggyBank, Target, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { BarraProgresso, CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { EmptyState } from "../../components/ui/EmptyState";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatCard } from "../../components/ui/StatCard";
import { contabilidade } from "../../services/contabilidade";
import { extras } from "../../services/extras";
import {
  dataAtualISO,
  formatarCentavos,
  formatarDataISOParaBR,
  primeiroDiaDoMesISO,
  ultimoDiaDoMesISO,
  valorInputParaCentavos,
} from "../../services/formato";
import type { Meta } from "../../types/extras";

/** Meses inteiros entre hoje e o prazo (mínimo 1), para sugerir o aporte mensal. */
function mesesAte(prazo: string, hoje: string): number {
  const [a1, m1] = hoje.split("-").map(Number);
  const [a2, m2] = prazo.split("-").map(Number);
  return Math.max(1, (a2 - a1) * 12 + (m2 - m1));
}

export function MetasPage() {
  const [metas, setMetas] = useState<Meta[]>([]);
  const [saldoDisponivel, setSaldoDisponivel] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState("");
  const [alvo, setAlvo] = useState("");
  const [prazo, setPrazo] = useState("");
  const [aportes, setAportes] = useState<Record<string, string>>({});
  const hoje = dataAtualISO();

  async function carregar() {
    try {
      const [m, resumo] = await Promise.all([
        extras.listarMetas(),
        contabilidade.obterResumoDashboard(primeiroDiaDoMesISO(hoje), ultimoDiaDoMesISO(hoje)),
      ]);
      setMetas(m);
      setSaldoDisponivel(resumo.saldo_disponivel_centavos);
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
    const valor = valorInputParaCentavos(alvo);
    if (!nome.trim() || valor <= 0) {
      toast.error("Informe o nome e o valor da meta.");
      return;
    }
    try {
      await extras.criarMeta(nome.trim(), valor, prazo || null);
      setNome("");
      setAlvo("");
      setPrazo("");
      toast.success("Meta criada.");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function aportar(meta: Meta, sinal: 1 | -1) {
    const valor = valorInputParaCentavos(aportes[meta.id] ?? "");
    if (valor <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    try {
      await extras.aportarMeta(meta.id, sinal * valor, dataAtualISO());
      setAportes((a) => ({ ...a, [meta.id]: "" }));
      toast.success(sinal > 0 ? "Valor guardado." : "Valor retirado da meta.");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function excluir(meta: Meta) {
    try {
      await extras.excluirMeta(meta.id);
      toast.success("Meta removida.");
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  if (carregando) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const totalGuardado = metas.reduce((s, m) => s + m.guardado_centavos, 0);
  const totalAlvo = metas.reduce((s, m) => s + m.valor_alvo_centavos, 0);
  const concluidas = metas.filter((m) => m.guardado_centavos >= m.valor_alvo_centavos).length;
  const saldoLivre = saldoDisponivel - totalGuardado;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-texto-primario">Metas Financeiras</h1>
        <p className="text-sm text-texto-secundario">
          O valor guardado é uma reserva sua dentro do saldo das contas — ele não sai da conta, só deixa de contar como livre.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard titulo="Metas ativas" valor={String(metas.length - concluidas)} icone={Target} corIcone="destaque" subtitulo={`${concluidas} concluída(s)`} />
        <StatCard titulo="Total guardado" valor={formatarCentavos(totalGuardado)} corValor="sucesso" icone={PiggyBank} corIcone="sucesso" subtitulo={`de ${formatarCentavos(totalAlvo)} em metas`} />
        <StatCard titulo="Saldo em contas" valor={formatarCentavos(saldoDisponivel)} icone={Wallet} corIcone="primaria" />
        <StatCard
          titulo="Saldo livre"
          valor={formatarCentavos(saldoLivre)}
          corValor={saldoLivre < 0 ? "erro" : "normal"}
          icone={Flag}
          corIcone="secundaria"
          subtitulo={saldoLivre < 0 ? "Reservas maiores que o saldo das contas" : "Saldo menos o que está reservado"}
        />
      </div>

      <Secao titulo="Nova meta">
        <form onSubmit={criar} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Reserva de emergência" className={CLASSE_INPUT} />
          <input value={alvo} onChange={(e) => setAlvo(e.target.value)} inputMode="decimal" placeholder="Valor da meta (R$)" className={CLASSE_INPUT} />
          <label className="flex items-center gap-2 text-xs text-texto-secundario">
            Prazo
            <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className={`${CLASSE_INPUT} min-w-0 flex-1`} />
          </label>
          <Button type="submit">Criar meta</Button>
        </form>
      </Secao>

      {metas.length === 0 ? (
        <EmptyState titulo="Nenhuma meta cadastrada" descricao="Crie uma meta (reserva de emergência, viagem, compra…) e vá guardando valores." />
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {metas.map((m) => {
            const pct = (m.guardado_centavos / m.valor_alvo_centavos) * 100;
            const feita = m.guardado_centavos >= m.valor_alvo_centavos;
            const cor = feita ? "var(--cor-sucesso)" : "var(--cor-destaque)";
            const falta = Math.max(0, m.valor_alvo_centavos - m.guardado_centavos);
            const meses = m.prazo && m.prazo >= hoje ? mesesAte(m.prazo, hoje) : null;
            const atrasada = !!m.prazo && m.prazo < hoje && !feita;
            return (
              <li
                key={m.id}
                className="rounded-xl border bg-cartao p-4"
                style={{
                  borderColor: `color-mix(in srgb, ${cor} 40%, transparent)`,
                  backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${cor} 14%, transparent), transparent 60%)`,
                  boxShadow: `0 8px 24px -16px ${cor}`,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <IconeCoisa nome={m.nome} tamanho={40} redondo padrao={{ icone: Target, cor: "#a855f7" }} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-texto-primario">{m.nome}</p>
                      <p className="text-xs text-texto-secundario">
                        {m.prazo ? `Prazo: ${formatarDataISOParaBR(m.prazo)}` : "Sem prazo definido"}
                        {atrasada && <span className="ml-1 font-medium text-erro">· prazo vencido</span>}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => excluir(m)}
                    aria-label={`Remover meta ${m.nome}`}
                    className="rounded-md p-1.5 text-texto-secundario transition-colors hover:bg-erro/15 hover:text-erro"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="mt-4 flex items-end justify-between">
                  <p className="text-xl font-bold tabular-nums text-texto-primario">{formatarCentavos(m.guardado_centavos)}</p>
                  <p className="text-xs text-texto-secundario">
                    de {formatarCentavos(m.valor_alvo_centavos)} · {Math.min(100, Math.round(pct))}%
                  </p>
                </div>
                <div className="mt-2">
                  <BarraProgresso percentual={pct} cor={cor} />
                </div>
                <p className="mt-2 text-xs text-texto-secundario">
                  {feita
                    ? "Meta atingida!"
                    : meses
                      ? `Faltam ${formatarCentavos(falta)} — cerca de ${formatarCentavos(Math.ceil(falta / meses))} por mês até o prazo.`
                      : `Faltam ${formatarCentavos(falta)}.`}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={aportes[m.id] ?? ""}
                    onChange={(e) => setAportes((a) => ({ ...a, [m.id]: e.target.value }))}
                    inputMode="decimal"
                    placeholder="Valor (R$)"
                    aria-label={`Valor para ${m.nome}`}
                    className={`${CLASSE_INPUT} w-32`}
                  />
                  <Button tamanho="pequeno" onClick={() => aportar(m, 1)}>
                    Guardar
                  </Button>
                  <Button tamanho="pequeno" variante="secundaria" onClick={() => aportar(m, -1)} disabled={m.guardado_centavos === 0}>
                    Retirar
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
