import { useEffect, useState } from "react";
import { AlertTriangle, Archive, ArchiveRestore, CalendarClock, FileText, Loader2, Paperclip, Pencil, Plus, RefreshCw, ShieldCheck, Sparkles, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Abas, useAbaDaPagina } from "../../components/ui/Abas";
import { Button } from "../../components/ui/Button";
import { BarraProgresso, CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { EmptyState } from "../../components/ui/EmptyState";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { Select } from "../../components/ui/Select";
import { StatCard } from "../../components/ui/StatCard";
import { contabilidade } from "../../services/contabilidade";
import { documentos, type Documento, type TipoDocumento } from "../../services/documentos";
import { dataAtualISO, formatarCentavos, formatarDataISOParaBR } from "../../services/formato";
import { arquivoParaAnexo, perguntarIAJson } from "../../services/gemini";
import type { Lancamento } from "../../types/accounting";
import { ArquivosDocumento } from "./ArquivosDocumento";
import { CATEGORIAS, MODELOS, filtrar, progressoGarantia, proximos, resumo, situacao, textoPrazo, type Situacao } from "./documentosCalc";
import { FormDocumento, rascunhoDoDocumento, rascunhoDoModelo, rascunhoVazio, type Rascunho } from "./FormDocumento";

type Aba = "geral" | "garantias" | "documentos" | "arquivados";

const ESTILO_SITUACAO: Record<Situacao, { texto: string; classe: string; cor: string }> = {
  VENCIDO: { texto: "Vencido", classe: "bg-erro/15 text-erro", cor: "var(--cor-erro)" },
  VENCE_LOGO: { texto: "Vence logo", classe: "bg-alerta/15 text-alerta", cor: "var(--cor-alerta)" },
  EM_DIA: { texto: "Em dia", classe: "bg-sucesso/15 text-sucesso", cor: "var(--cor-sucesso)" },
  SEM_PRAZO: { texto: "Sem prazo", classe: "bg-borda/60 text-texto-secundario", cor: "var(--cor-primaria)" },
  ARQUIVADO: { texto: "Arquivado", classe: "bg-borda/60 text-texto-secundario", cor: "var(--cor-primaria)" },
};

interface NotaLida {
  produto?: string;
  loja?: string;
  valor?: number;
  data?: string;
  garantia_meses?: number;
  numero_nota?: string;
  categoria?: string;
}

export function DocumentosPage() {
  const hoje = dataAtualISO();
  const [aba, setAba] = useAbaDaPagina<Aba>("documentos", "geral");
  const [lista, setLista] = useState<Documento[] | null>(null);
  const [compras, setCompras] = useState<Lancamento[]>([]);
  const [form, setForm] = useState<Rascunho | null>(null);
  const [arquivosDe, setArquivosDe] = useState<Documento | null>(null);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [lendoNota, setLendoNota] = useState(false);

  async function carregar() {
    try {
      setLista(await documentos.listar());
    } catch (e) {
      toast.error(String(e));
      setLista([]);
    }
  }
  useEffect(() => {
    carregar();
    contabilidade
      .listarLancamentos(400)
      .then((ls) => setCompras(ls.filter((l) => !l.estornado_de && l.partidas.length >= 2).sort((a, b) => b.data.localeCompare(a.data))))
      .catch(() => setCompras([]));
  }, []);

  const docs = lista ?? [];
  const r = resumo(docs, hoje);
  const atualizar = (d: Documento) => setLista((l) => (l ?? []).map((x) => (x.id === d.id ? d : x)));

  async function lerNotaComIA(arquivo: File) {
    setLendoNota(true);
    try {
      const nota = await perguntarIAJson<NotaLida>({
        instrucao: "Você lê notas fiscais e comprovantes de compra brasileiros. Responda só com JSON.",
        contexto: `Categorias possíveis: ${CATEGORIAS.GARANTIA.join(", ")}. Hoje é ${hoje}.`,
        pergunta:
          'Extraia o principal produto desta nota/comprovante. Responda em JSON: {"produto": "nome curto com marca e modelo", "loja": "nome fantasia da loja", "valor": número em reais do produto, "data": "AAAA-MM-DD" da compra, "garantia_meses": meses de garantia se estiver escrito (senão 12), "numero_nota": "número da NF-e se houver", "categoria": uma das categorias}.',
        anexo: await arquivoParaAnexo(arquivo),
        json: true,
      });
      const base = rascunhoVazio("GARANTIA");
      const data = nota.data && /^\d{4}-\d{2}-\d{2}$/.test(nota.data) ? nota.data : base.dataCompra;
      setForm({
        ...base,
        titulo: (nota.produto ?? "").slice(0, 120),
        loja: (nota.loja ?? "").slice(0, 80),
        valor: typeof nota.valor === "number" && nota.valor > 0 ? nota.valor.toFixed(2).replace(".", ",") : "",
        dataCompra: data,
        garantiaMeses: String(Math.min(240, Math.max(0, Math.round(nota.garantia_meses ?? 12)))),
        numero: (nota.numero_nota ?? "").slice(0, 80),
        categoria: CATEGORIAS.GARANTIA.includes(nota.categoria ?? "") ? nota.categoria! : base.categoria,
        arquivos: [arquivo],
      });
      toast.success("Nota lida. Confira os dados antes de salvar.");
    } catch (e) {
      toast.error(`Não consegui ler a nota: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLendoNota(false);
    }
  }

  const botoesNovo = (
    <div className="flex flex-wrap gap-2">
      <Button tamanho="pequeno" onClick={() => setForm(rascunhoVazio("GARANTIA"))}><Plus size={14} /> Garantia</Button>
      <Button tamanho="pequeno" variante="secundaria" onClick={() => setForm(rascunhoVazio("DOCUMENTO"))}><Plus size={14} /> Documento</Button>
      <label className={`inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-borda bg-superficie px-3 text-xs font-medium text-texto-primario hover:bg-borda/40 ${lendoNota ? "pointer-events-none opacity-60" : ""}`}>
        {lendoNota ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-primaria" />} Ler nota fiscal com IA
        <input type="file" accept="image/*,application/pdf" className="sr-only" disabled={lendoNota} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) lerNotaComIA(f); }} />
      </label>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-texto-primario"><ShieldCheck size={22} className="text-primaria" /> Garantias e documentos</h1>
          <p className="text-sm text-texto-secundario">Nota fiscal e garantia de cada compra, e os documentos que vencem: IPVA, seguro, contrato.</p>
        </div>
        {botoesNovo}
      </div>

      <Abas
        ativa={aba}
        onChange={setAba}
        abas={[
          { id: "geral", rotulo: "Visão geral", icone: CalendarClock, contador: r.venceLogo + r.vencidos || undefined },
          { id: "garantias", rotulo: "Garantias", icone: ShieldCheck },
          { id: "documentos", rotulo: "Documentos", icone: FileText },
          { id: "arquivados", rotulo: "Arquivados", icone: Archive },
        ]}
      />

      {lista === null ? (
        <p className="flex items-center gap-2 text-sm text-texto-secundario"><Loader2 size={14} className="animate-spin" /> Carregando…</p>
      ) : aba === "geral" ? (
        <VisaoGeral docs={docs} hoje={hoje} onNovo={setForm} onArquivos={setArquivosDe} />
      ) : (
        <Lista
          docs={docs.filter((d) => (aba === "arquivados" ? d.arquivado : !d.arquivado && d.tipo === (aba === "garantias" ? "GARANTIA" : "DOCUMENTO")))}
          tipo={aba === "garantias" ? "GARANTIA" : aba === "documentos" ? "DOCUMENTO" : null}
          hoje={hoje}
          busca={busca}
          setBusca={setBusca}
          categoria={categoria}
          setCategoria={setCategoria}
          onEditar={(d) => setForm(rascunhoDoDocumento(d))}
          onArquivos={setArquivosDe}
          onAtualizado={atualizar}
          onExcluido={(id) => setLista((l) => (l ?? []).filter((x) => x.id !== id))}
          onNovo={() => setForm(rascunhoVazio(aba === "documentos" ? "DOCUMENTO" : "GARANTIA"))}
        />
      )}

      {form && (
        <FormDocumento
          inicial={form}
          compras={compras}
          onFechar={() => setForm(null)}
          onSalvo={(d) => {
            setForm(null);
            setLista((l) => [...(l ?? []).filter((x) => x.id !== d.id), d]);
            carregar();
          }}
        />
      )}
      {arquivosDe && <ArquivosDocumento doc={arquivosDe} onFechar={() => setArquivosDe(null)} onAlterado={(n) => setLista((l) => (l ?? []).map((x) => (x.id === arquivosDe.id ? { ...x, arquivos: n } : x)))} />}
    </div>
  );
}

function VisaoGeral({ docs, hoje, onNovo, onArquivos }: { docs: Documento[]; hoje: string; onNovo: (r: Rascunho) => void; onArquivos: (d: Documento) => void }) {
  const r = resumo(docs, hoje);
  const prox = proximos(docs, hoje);
  const semArquivo = docs.filter((d) => !d.arquivado && d.arquivos === 0).slice(0, 6);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard titulo="Garantias ativas" valor={String(r.garantiasAtivas)} subtitulo="compras ainda cobertas" icone={ShieldCheck} corIcone="sucesso" />
        <StatCard titulo="Valor protegido" valor={formatarCentavos(r.valorProtegido)} subtitulo="soma das compras em garantia" icone={Wallet} corIcone="primaria" />
        <StatCard titulo="Vencem em breve" valor={String(r.venceLogo)} subtitulo="dentro do prazo de aviso" icone={CalendarClock} corIcone="alerta" />
        <StatCard titulo="Documentos vencidos" valor={String(r.vencidos)} corValor={r.vencidos ? "erro" : "normal"} subtitulo="renove ou atualize a data" icone={AlertTriangle} corIcone="erro" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Secao titulo={<><CalendarClock size={15} /> Próximos vencimentos</>}>
          {prox.length === 0 ? (
            <EmptyState titulo="Nada vencendo" descricao="Cadastre uma garantia ou um documento com data para o Dairus avisar antes de vencer." />
          ) : (
            <ol className="space-y-2">
              {prox.map((d) => {
                const s = situacao(d, hoje);
                return (
                  <li key={d.id} className="flex items-center gap-3 rounded-lg border border-borda bg-fundo px-3 py-2">
                    <div className="w-14 shrink-0 text-center">
                      <p className="text-lg font-semibold leading-none text-texto-primario tabular-nums">{d.vencimento!.slice(8, 10)}</p>
                      <p className="text-[11px] uppercase tracking-wide text-texto-secundario">{new Date(`${d.vencimento}T12:00:00`).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")} {d.vencimento!.slice(2, 4)}</p>
                    </div>
                    <IconeCoisa nome={d.titulo} tamanho={30} padrao={{ icone: d.tipo === "GARANTIA" ? ShieldCheck : FileText, cor: ESTILO_SITUACAO[s].cor }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-texto-primario">{d.titulo}</p>
                      <p className="truncate text-xs text-texto-secundario">{textoPrazo(d, hoje)}{d.loja ? ` · ${d.loja}` : ""}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${ESTILO_SITUACAO[s].classe}`}>{ESTILO_SITUACAO[s].texto}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Secao>

        <div className="space-y-4">
          <Secao titulo={<><Plus size={15} /> Começar rápido</>}>
            <p className="mb-2 text-xs text-texto-secundario">Modelos já com categoria, repetição e aviso certos:</p>
            <div className="flex flex-wrap gap-1.5">
              {MODELOS.map((m) => (
                <button key={m.rotulo} onClick={() => onNovo(rascunhoDoModelo(m))} className="rounded-full border border-borda px-3 py-1.5 text-xs text-texto-secundario hover:border-primaria hover:text-primaria">{m.rotulo}</button>
              ))}
            </div>
          </Secao>
          {semArquivo.length > 0 && (
            <Secao titulo={<><Paperclip size={15} /> Sem arquivo guardado</>}>
              <p className="mb-2 text-xs text-texto-secundario">Sem a nota fiscal, a loja pode recusar a garantia. Guarde uma foto ou o PDF:</p>
              <ul className="space-y-1 text-sm">
                {semArquivo.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-texto-primario">{d.titulo}</span>
                    <button onClick={() => onArquivos(d)} className="shrink-0 text-xs text-primaria hover:underline">Guardar arquivo</button>
                  </li>
                ))}
              </ul>
            </Secao>
          )}
        </div>
      </div>
    </div>
  );
}

interface ListaProps {
  docs: Documento[];
  tipo: TipoDocumento | null;
  hoje: string;
  busca: string;
  setBusca: (v: string) => void;
  categoria: string;
  setCategoria: (v: string) => void;
  onEditar: (d: Documento) => void;
  onArquivos: (d: Documento) => void;
  onAtualizado: (d: Documento) => void;
  onExcluido: (id: string) => void;
  onNovo: () => void;
}

function Lista({ docs, tipo, hoje, busca, setBusca, categoria, setCategoria, onEditar, onArquivos, onAtualizado, onExcluido, onNovo }: ListaProps) {
  const categorias = [...new Set(docs.map((d) => d.categoria))].sort();
  const filtrados = filtrar(docs, busca, categorias.includes(categoria) ? categoria : "");
  const total = filtrados.reduce((s, d) => s + (d.valor_centavos ?? 0), 0);

  if (docs.length === 0) {
    return (
      <EmptyState
        titulo={tipo === "GARANTIA" ? "Nenhuma garantia guardada" : tipo === "DOCUMENTO" ? "Nenhum documento guardado" : "Nada arquivado"}
        descricao={tipo === "GARANTIA" ? "Cadastre a TV, o celular ou a geladeira com a nota fiscal. O Dairus avisa antes da garantia acabar." : tipo === "DOCUMENTO" ? "IPVA, seguro, contrato de aluguel, CNH: guarde o arquivo e receba aviso antes de vencer." : "Garantias que acabaram e documentos antigos vêm para cá quando você arquiva."}
        acao={tipo ? <Button onClick={onNovo}><Plus size={14} /> {tipo === "GARANTIA" ? "Nova garantia" : "Novo documento"}</Button> : undefined}
      />
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, loja, número…" aria-label="Buscar" className={`${CLASSE_INPUT} w-64 max-w-full py-1.5`} />
        <Select aria-label="Categoria" value={categorias.includes(categoria) ? categoria : "TODAS"} onValueChange={(v) => setCategoria(v === "TODAS" ? "" : v)} className="w-48" options={[{ value: "TODAS", label: "Todas as categorias" }, ...categorias.map((c) => ({ value: c, label: c }))]} />
        <span className="text-xs text-texto-secundario">{filtrados.length} item(ns){total ? ` · ${formatarCentavos(total)}` : ""}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {filtrados.map((d) => (
          <CartaoDocumento key={d.id} d={d} hoje={hoje} onEditar={onEditar} onArquivos={onArquivos} onAtualizado={onAtualizado} onExcluido={onExcluido} />
        ))}
      </div>
    </div>
  );
}

function CartaoDocumento({ d, hoje, onEditar, onArquivos, onAtualizado, onExcluido }: { d: Documento; hoje: string; onEditar: (d: Documento) => void; onArquivos: (d: Documento) => void; onAtualizado: (d: Documento) => void; onExcluido: (id: string) => void }) {
  const [confirmar, setConfirmar] = useState(false);
  const s = situacao(d, hoje);
  const estilo = ESTILO_SITUACAO[s];
  const progresso = progressoGarantia(d, hoje);

  async function acao(fn: () => Promise<Documento>, msg: string) {
    try {
      onAtualizado(await fn());
      toast.success(msg);
    } catch (e) {
      toast.error(String(e));
    }
  }
  async function excluir() {
    try {
      await documentos.excluir(d.id);
      onExcluido(d.id);
      toast.success("Excluído, com os arquivos.");
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <article className="flex flex-col rounded-xl border border-borda bg-cartao p-4">
      <div className="flex items-start gap-3">
        <IconeCoisa nome={d.titulo} tamanho={40} padrao={{ icone: d.tipo === "GARANTIA" ? ShieldCheck : FileText, cor: estilo.cor }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-texto-primario" title={d.titulo}>{d.titulo}</h3>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${estilo.classe}`}>{estilo.texto}</span>
          </div>
          <p className="truncate text-xs text-texto-secundario">{[d.categoria, d.loja, d.numero].filter(Boolean).join(" · ")}</p>
        </div>
      </div>

      <div className="mt-3 flex-1 space-y-1.5 text-xs">
        <p className="text-texto-primario">{textoPrazo(d, hoje)}{d.vencimento ? <span className="text-texto-secundario"> · {formatarDataISOParaBR(d.vencimento)}</span> : null}</p>
        {progresso !== null && <BarraProgresso percentual={progresso} cor={estilo.cor} altura={5} />}
        <p className="flex flex-wrap gap-x-3 text-texto-secundario">
          {d.valor_centavos != null && <span className="tabular-nums">{formatarCentavos(d.valor_centavos)}</span>}
          {d.data_compra && <span>Compra {formatarDataISOParaBR(d.data_compra)}</span>}
          {d.garantia_estendida_meses > 0 && <span>+{d.garantia_estendida_meses} meses estendida</span>}
          {d.repete && <span>Repete {d.repete === "ANUAL" ? "todo ano" : "todo mês"}</span>}
        </p>
        {d.observacao && <p className="line-clamp-2 text-texto-secundario">{d.observacao}</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-borda pt-2.5 text-xs">
        {confirmar ? (
          <>
            <span className="text-texto-secundario">Excluir com os {d.arquivos} arquivo(s)?</span>
            <button onClick={excluir} className="font-medium text-erro hover:underline">Excluir</button>
            <button onClick={() => setConfirmar(false)} className="text-texto-secundario hover:underline">Cancelar</button>
          </>
        ) : (
          <>
            <button onClick={() => onArquivos(d)} className="flex items-center gap-1 text-primaria hover:underline"><Paperclip size={12} /> Arquivos ({d.arquivos})</button>
            <button onClick={() => onEditar(d)} className="flex items-center gap-1 text-texto-secundario hover:text-texto-primario"><Pencil size={12} /> Editar</button>
            {d.tipo === "DOCUMENTO" && d.repete && d.vencimento && !d.arquivado && (
              <button onClick={() => acao(() => documentos.renovar(d.id), `Renovado: próximo vencimento atualizado.`)} className="flex items-center gap-1 text-texto-secundario hover:text-texto-primario"><RefreshCw size={12} /> Renovar</button>
            )}
            <button onClick={() => acao(() => documentos.arquivar(d.id, !d.arquivado), d.arquivado ? "Restaurado." : "Arquivado.")} className="flex items-center gap-1 text-texto-secundario hover:text-texto-primario">
              {d.arquivado ? <><ArchiveRestore size={12} /> Restaurar</> : <><Archive size={12} /> Arquivar</>}
            </button>
            <button onClick={() => setConfirmar(true)} className="ml-auto flex items-center gap-1 text-texto-secundario hover:text-erro"><Trash2 size={12} /> Excluir</button>
          </>
        )}
      </div>
    </article>
  );
}
