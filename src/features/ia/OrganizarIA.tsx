import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { contabilidade } from "../../services/contabilidade";
import { extras } from "../../services/extras";
import { marcaDaDescricao } from "../../services/categorias";
import { dataAtualISO, formatarCentavos, formatarDataISOParaBR } from "../../services/formato";
import { perguntarIAJson } from "../../services/gemini";
import { lancExtras } from "../../services/lancamentosExtras";
import { usePreferencia } from "../../state/usePreferencia";
import { avisarDadosAlterados } from "../../state/useAoAlterarDados";
import type { Conta, Lancamento } from "../../types/accounting";
import { categoriaPrincipalDe, descricoesParaIA, descricoesParaPadronizar, duplicatasSuspeitas, validarSugestoes, type SugestaoIA } from "./organizar";

const somarDias = (iso: string, d: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + d)).toISOString().slice(0, 10);
const valorDe = (l: Lancamento) => l.partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0);

/** Arrumar o histórico: duplicatas, nomes despadronizados e sugestões da IA. */
export function OrganizarIA({ temChave }: { temChave: boolean }) {
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [ignoradas, setIgnoradas] = usePreferencia<string[]>("duplicatas_ignoradas", []);
  const [sugestoes, setSugestoes] = useState<SugestaoIA[] | null>(null);
  const [pensando, setPensando] = useState(false);
  const hoje = dataAtualISO();
  const desde = somarDias(hoje, -120);

  async function carregar() {
    const [c, l] = await Promise.all([contabilidade.listarContas(), contabilidade.listarLancamentos(5000)]);
    setContas(c);
    setLancamentos(l);
  }
  useEffect(() => {
    carregar().catch((e) => toast.error(String(e)));
  }, []);

  const porId = new Map(contas.map((c) => [c.id, c]));
  const duplicatas = duplicatasSuspeitas(lancamentos, desde).filter(([a, b]) => !ignoradas.includes(`${a.id}|${b.id}`));
  const padronizar = descricoesParaPadronizar(lancamentos, desde);

  async function renomear(ids: string[], nome: string) {
    for (const id of ids) {
      const l = lancamentos.find((x) => x.id === id);
      if (l) await extras.atualizarLancamentoInfo(id, nome, l.observacao, l.etiqueta);
    }
  }

  async function executar(acao: () => Promise<unknown>, ok: string) {
    try {
      await acao();
      toast.success(ok);
      avisarDadosAlterados();
      await carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function pedirSugestoes() {
    const lista = descricoesParaIA(lancamentos, contas, desde);
    if (!lista.length) return toast.info("Sem despesas nos últimos 4 meses para analisar.");
    try {
      setPensando(true);
      const cats = contas.filter((c) => c.tipo === "DESPESA" && c.ativa && c.subtipo !== "CATEGORIA");
      const bruto = await perguntarIAJson<unknown>({
        instrucao: "Você organiza o histórico financeiro de um usuário brasileiro. Responda só JSON válido.",
        contexto: `Categorias de despesa (id = nome):\n${cats.map((c) => `${c.id} = ${c.nome}`).join("\n")}`,
        pergunta: `Para cada descrição abaixo (com a categoria atual e quantas vezes aparece), sugira SOMENTE quando houver ganho claro:
- nova_descricao: nome limpo e padronizado do estabelecimento (ex.: "PAG*JOSEDASILVA" -> "José da Silva", "IFD*IFOOD" -> "iFood");
- etiqueta: "ASSINATURA" (streaming, apps), "MENSALIDADE" (escola, academia, plano) ou "FIXO" (aluguel, condomínio, contas de consumo); só se ainda não tiver;
- categoria_id: se a categoria atual estiver claramente errada, o id correto da lista (vale para os próximos lançamentos);
- subcategoria: nome de uma subcategoria útil quando a categoria atual for genérica (ex.: "Aplicativos de transporte").
Devolva {"sugestoes":[{"descricao":"igual à original","nova_descricao":null,"etiqueta":null,"categoria_id":null,"subcategoria":null}]}.
${lista.map((d) => `"${d.descricao}" | ${d.categoria} | ${d.vezes}x${d.etiqueta ? ` | etiqueta ${d.etiqueta}` : ""}`).join("\n")}`,
      });
      const v = validarSugestoes(bruto, new Set(lista.map((d) => d.descricao)), contas);
      setSugestoes(v);
      if (!v.length) toast.info("A IA não encontrou nada para arrumar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPensando(false);
    }
  }

  async function aplicar(s: SugestaoIA) {
    const ids = lancamentos.filter((l) => l.descricao === s.descricao).map((l) => l.id);
    const nome = s.nova_descricao ?? s.descricao;
    for (const id of ids) {
      const l = lancamentos.find((x) => x.id === id)!;
      if (s.nova_descricao || (s.etiqueta && !l.etiqueta)) await extras.atualizarLancamentoInfo(id, nome, l.observacao, l.etiqueta ?? s.etiqueta);
    }
    const padrao = marcaDaDescricao(nome) || nome;
    if (s.subcategoria) {
      const pai = categoriaPrincipalDe(s.descricao, lancamentos, contas);
      const existente = contas.find((c) => c.tipo === "DESPESA" && c.nome.toLowerCase() === s.subcategoria!.toLowerCase());
      const id = existente?.id ?? (await extras.criarCategoria(s.subcategoria, "DESPESA", pai?.id ?? null));
      await lancExtras.salvarRegra(padrao, id);
    } else if (s.categoria_id) {
      await lancExtras.salvarRegra(padrao, s.categoria_id);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-borda bg-cartao p-4">
        <p className="text-sm font-semibold text-texto-primario">Possíveis lançamentos repetidos (últimos 4 meses)</p>
        {duplicatas.length === 0 ? <p className="mt-1 text-sm text-texto-secundario">Nenhum encontrado.</p> : (
          <ul className="mt-2 space-y-2">
            {duplicatas.slice(0, 20).map(([a, b]) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borda/70 px-3 py-2 text-sm">
                <span className="text-texto-primario">{a.descricao} ({formatarDataISOParaBR(a.data)}) e {b.descricao} ({formatarDataISOParaBR(b.data)}) · <strong className="tabular-nums">{formatarCentavos(valorDe(a))}</strong></span>
                <span className="flex gap-2">
                  <Button tamanho="pequeno" variante="perigo" onClick={() => executar(() => contabilidade.estornarLancamento(b.id), "Lançamento repetido estornado.")}>Estornar o 2º</Button>
                  <Button tamanho="pequeno" variante="fantasma" onClick={() => setIgnoradas([...ignoradas, `${a.id}|${b.id}`])}>Não é repetido</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-borda bg-cartao p-4">
        <p className="text-sm font-semibold text-texto-primario">Nomes escritos de jeitos diferentes</p>
        {padronizar.length === 0 ? <p className="mt-1 text-sm text-texto-secundario">Tudo padronizado.</p> : (
          <ul className="mt-2 space-y-2">
            {padronizar.slice(0, 20).map((p) => (
              <li key={p.marca} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borda/70 px-3 py-2 text-sm">
                <span className="text-texto-secundario">{p.variantes.slice(0, 4).join(" · ")} → <strong className="text-texto-primario">{p.sugestao}</strong></span>
                <Button tamanho="pequeno" variante="secundaria" onClick={() => executar(() => renomear(p.ids, p.sugestao), `${p.ids.length} lançamento(s) renomeado(s).`)}>Padronizar {p.ids.length}</Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-borda bg-cartao p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-texto-primario">Sugestões da IA</p>
            <p className="text-xs text-texto-secundario">Nomes limpos, etiquetas (assinatura, mensalidade, fixo), categoria certa para os próximos lançamentos e subcategorias. Envia só as descrições e categorias.</p>
          </div>
          <Button tamanho="pequeno" onClick={pedirSugestoes} disabled={!temChave || pensando}>{pensando ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Pedir sugestões</Button>
        </div>
        {!temChave && <p className="mt-2 text-xs text-texto-secundario">Precisa da chave do Gemini.</p>}
        {sugestoes && sugestoes.length > 0 && (
          <ul className="mt-3 space-y-2">
            {sugestoes.map((s) => (
              <li key={s.descricao} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borda/70 px-3 py-2 text-sm">
                <span className="text-texto-primario">
                  <strong>{s.descricao}</strong>
                  {s.nova_descricao && <> → renomear para “{s.nova_descricao}”</>}
                  {s.etiqueta && <> · etiqueta {s.etiqueta.toLowerCase()}</>}
                  {s.categoria_id && <> · próximos em {porId.get(s.categoria_id)?.nome}</>}
                  {s.subcategoria && <> · nova subcategoria “{s.subcategoria}”</>}
                </span>
                <span className="flex gap-2">
                  <Button tamanho="pequeno" variante="secundaria" onClick={() => executar(() => aplicar(s), "Sugestão aplicada.").then(() => setSugestoes((l) => l?.filter((x) => x !== s) ?? null))}>Aplicar</Button>
                  <Button tamanho="pequeno" variante="fantasma" onClick={() => setSugestoes((l) => l?.filter((x) => x !== s) ?? null)}>Ignorar</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
