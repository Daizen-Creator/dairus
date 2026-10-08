import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import type { Conta } from "../../../types/accounting";
import { useWidgetsStore } from "../../../state/widgets-store";
import { EXIBICOES, GRANULARIDADES, METRICAS, PERIODOS, normalizarConfigGrafico, tituloDoGrafico, type ConfigGrafico } from "../graficoDados";
import { infoDoWidget, type ConfigWidget, type WidgetNoPainel } from "../layoutWidgets";

const CAMPO = "w-full rounded-lg border border-borda bg-fundo px-2 py-1.5 text-sm text-texto-primario outline-none focus:border-primaria";

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-texto-secundario">{rotulo}</span>
      {children}
    </label>
  );
}

/** Configurar um widget: título (ou nenhum) e, no gráfico, métrica, período, granularidade e exibição. */
export function ConfigWidgetDialog({ widget, contas, onFechar }: { widget: WidgetNoPainel; contas: Conta[]; onFechar: () => void }) {
  const configurar = useWidgetsStore((s) => s.configurar);
  const info = infoDoWidget(widget.tipo);
  const [rascunho, setRascunho] = useState<ConfigWidget>(() => ({ ...widget.config, grafico: widget.tipo === "grafico" ? normalizarConfigGrafico(widget.config?.grafico) : undefined }));
  const g = rascunho.grafico;
  const categorias = contas.filter((c) => (c.tipo === "DESPESA" || c.tipo === "RECEITA") && c.ativa).sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  const alterarGrafico = (parte: Partial<ConfigGrafico>) => setRascunho({ ...rascunho, grafico: { ...g!, ...parte } });
  const salvar = () => {
    const final: ConfigWidget = { ...rascunho, titulo: rascunho.titulo?.trim() || undefined };
    if (final.grafico?.metrica === "categoria" && !final.grafico.categoriaId) final.grafico = { ...final.grafico, categoriaId: categorias.find((c) => c.tipo === "DESPESA")?.id ?? null };
    configurar(widget.i, final);
    onFechar();
  };

  return createPortal(
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-config-widget" className="w-full max-w-md rounded-2xl border border-borda bg-cartao p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="titulo-config-widget" className="text-base font-semibold text-texto-primario">Configurar: {info.rotulo}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded p-1 text-texto-secundario hover:text-texto-primario"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <Linha rotulo="Título">
            <input value={rascunho.titulo ?? ""} onChange={(e) => setRascunho({ ...rascunho, titulo: e.target.value.slice(0, 60) })} placeholder={g ? tituloDoGrafico(g, contas) : info.rotulo} className={CAMPO} />
          </Linha>
          <label className="flex items-center gap-2 text-sm text-texto-primario">
            <input type="checkbox" checked={!!rascunho.semTitulo} onChange={() => setRascunho({ ...rascunho, semTitulo: !rascunho.semTitulo })} className="h-4 w-4 accent-[var(--cor-primaria)]" />
            Esconder o título {widget.tipo === "fotos" || widget.tipo === "video" ? "(a mídia ocupa o card inteiro)" : ""}
          </label>

          {g && (
            <div className="space-y-3 border-t border-borda pt-3">
              <Linha rotulo="O que mostrar (métrica)">
                <select value={g.metrica} onChange={(e) => alterarGrafico({ metrica: e.target.value as ConfigGrafico["metrica"] })} className={CAMPO}>
                  {METRICAS.map((m) => <option key={m.v} value={m.v}>{m.r}</option>)}
                </select>
              </Linha>
              {g.metrica === "categoria" && (
                <Linha rotulo="Categoria (inclui as subcategorias)">
                  <select value={g.categoriaId ?? ""} onChange={(e) => alterarGrafico({ categoriaId: e.target.value || null })} className={CAMPO}>
                    <option value="">Escolha…</option>
                    {categorias.map((c) => <option key={c.id} value={c.id}>{c.tipo === "RECEITA" ? "Receita · " : ""}{c.nome}</option>)}
                  </select>
                </Linha>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Linha rotulo="Período">
                  <select value={g.periodo} onChange={(e) => alterarGrafico({ periodo: e.target.value as ConfigGrafico["periodo"] })} className={CAMPO}>
                    {PERIODOS.map((p) => <option key={p.v} value={p.v}>{p.r}</option>)}
                  </select>
                </Linha>
                <Linha rotulo="Granularidade">
                  <select value={g.granularidade} onChange={(e) => alterarGrafico({ granularidade: e.target.value as ConfigGrafico["granularidade"] })} className={CAMPO} disabled={g.exibicao === "rosca" || g.exibicao === "tabela" || g.exibicao === "kpi"}>
                    {GRANULARIDADES.map((p) => <option key={p.v} value={p.v}>{p.r}</option>)}
                  </select>
                </Linha>
              </div>
              <Linha rotulo="Exibição">
                <div role="radiogroup" aria-label="Exibição" className="grid grid-cols-5 gap-1">
                  {EXIBICOES.map((e) => (
                    <button key={e.v} type="button" role="radio" aria-checked={g.exibicao === e.v} onClick={() => alterarGrafico({ exibicao: e.v })} className={`rounded-lg border px-1 py-1.5 text-xs ${g.exibicao === e.v ? "border-primaria bg-primaria/15 text-primaria" : "border-borda text-texto-secundario hover:text-texto-primario"}`}>{e.r}</button>
                  ))}
                </div>
              </Linha>
              <p className="text-[11px] text-texto-secundario">
                Rosca e tabela mostram a divisão por categoria (no saldo, por conta). O número compara com o período anterior do mesmo tamanho.
              </p>
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variante="fantasma" tamanho="pequeno" onClick={onFechar}>Cancelar</Button>
          <Button tamanho="pequeno" onClick={salvar}>Salvar</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
