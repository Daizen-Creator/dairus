import { useState } from "react";
import { Check, Cloud, CloudOff, Copy, Download, Loader2, RotateCcw, Undo2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { useAparenciaStore } from "../../state/aparencia-store";
import { useThemeStore } from "../../state/theme-store";
import { PREDEFINICOES, cssGradiente, mesclar, APARENCIA_PADRAO } from "./aparencia";
import { urlDaGaleria } from "./galeria";
import { Bloco } from "./Controles";

function Previa({ id }: { id: string }) {
  const p = PREDEFINICOES.find((x) => x.id === id)!;
  const tema = useThemeStore((s) => s.todosOsTemas().find((t) => t.id === p.temaId));
  const a = mesclar(APARENCIA_PADRAO, p.aparencia);
  const fundo =
    a.fundo.tipo === "cor" ? a.fundo.cor
      : a.fundo.tipo === "gradiente" ? cssGradiente(a.fundo.gradiente)
        : a.fundo.tipo === "imagem" ? `center / cover url("${urlDaGaleria(a.fundo.imagem.replace("galeria:", "")) ?? ""}")`
          : a.fundo.tipo === "animado" ? `radial-gradient(circle at 20% 30%, ${tema?.cores.primaria ?? "#1677ff"}, transparent 60%), radial-gradient(circle at 80% 70%, ${tema?.cores.destaque ?? "#7c3aed"}, transparent 55%), ${tema?.cores.fundo ?? "#000"}`
            : tema?.cores.fundo ?? "#0b1020";
  const raio = 6 * a.formas.raio;
  const destaque = p.corDestaque ?? tema?.cores.primaria ?? "#1677ff";
  return (
    <div className="relative flex h-24 gap-1.5 overflow-hidden p-2" style={{ background: fundo }}>
      {a.menu.layout === "lateral" ? (
        <div className="flex w-8 flex-col gap-1 p-1" style={{ background: tema?.cores.superficie, opacity: a.menu.vidro ? 0.6 : 1, borderRadius: raio }}>
          {[0, 1, 2, 3].map((i) => <span key={i} className="h-1.5" style={{ background: i === 0 ? destaque : tema?.cores.textoSecundario, borderRadius: 2, opacity: i === 0 ? 1 : 0.5 }} />)}
        </div>
      ) : (
        <div className="absolute inset-x-2 top-2 flex h-3 gap-1 px-1" style={{ background: tema?.cores.superficie, opacity: a.menu.vidro ? 0.6 : 1, borderRadius: raio }}>
          {[0, 1, 2].map((i) => <span key={i} className="mt-1 h-1 w-4" style={{ background: i === 0 ? destaque : tema?.cores.textoSecundario, borderRadius: 2 }} />)}
        </div>
      )}
      <div className={`grid flex-1 grid-cols-2 gap-1.5 ${a.menu.layout === "superior" ? "mt-4" : ""}`}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="p-1.5" style={{ background: tema?.cores.cartao, opacity: Math.max(0.5, a.formas.opacidadeCartoes), borderRadius: raio }}>
            <span className="block h-1 w-3/4" style={{ background: tema?.cores.textoPrimario, borderRadius: 2, opacity: 0.8 }} />
            <span className="mt-1 block h-1.5 w-1/2" style={{ background: i === 0 ? destaque : tema?.cores.textoSecundario, borderRadius: 2 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PainelPredefinicoes() {
  const { aparencia, historico, nuvem, aplicarPredefinicao, restaurarPadrao, desfazer, exportar, importar, sincronizarAgora } = useAparenciaStore();
  const [confirmarReset, setConfirmarReset] = useState(false);
  const [aplicando, setAplicando] = useState<string | null>(null);

  function salvarArquivo() {
    const blob = new Blob([exportar()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "aparencia-dairus.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <Bloco titulo="Predefinições de um clique" descricao="Trocam tema, fundo, menu, fonte e bordas de uma vez. Depois dá para ajustar qualquer detalhe nas outras abas.">
        <div className="grid gap-3 py-2 sm:grid-cols-2 lg:grid-cols-4">
          {PREDEFINICOES.map((p) => {
            const ativa = aparencia.preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={!!aplicando}
                onClick={async () => { setAplicando(p.id); await aplicarPredefinicao(p.id); setAplicando(null); toast.success(`Visual “${p.nome}” aplicado. Use Desfazer se não gostar.`); }}
                className={`overflow-hidden rounded-xl border-2 text-left transition-transform hover:-translate-y-0.5 ${ativa ? "border-primaria" : "border-borda hover:border-texto-secundario"}`}
              >
                <Previa id={p.id} />
                <span className="block px-3 py-2">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-texto-primario">
                    {aplicando === p.id ? <Loader2 size={13} className="animate-spin" /> : ativa ? <Check size={13} className="text-primaria" /> : null}
                    {p.nome}
                  </span>
                  <span className="block text-xs text-texto-secundario">{p.descricao}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Bloco>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco titulo="Desfazer e restaurar">
          <div className="flex flex-wrap items-center gap-2 py-3">
            <Button variante="secundaria" tamanho="pequeno" onClick={desfazer} disabled={!historico.length}><Undo2 size={13} /> Desfazer última mudança{historico.length ? ` (${historico.length})` : ""}</Button>
            {confirmarReset ? (
              <span className="flex flex-wrap items-center gap-2 text-xs text-texto-primario">
                Voltar tudo ao visual de fábrica?
                <Button variante="perigo" tamanho="pequeno" onClick={async () => { await restaurarPadrao(); setConfirmarReset(false); toast.success("Visual de fábrica restaurado."); }}>Restaurar</Button>
                <button type="button" onClick={() => setConfirmarReset(false)} className="text-texto-secundario hover:underline">Cancelar</button>
              </span>
            ) : (
              <Button variante="fantasma" tamanho="pequeno" onClick={() => setConfirmarReset(true)}><RotateCcw size={13} /> Restaurar padrões de fábrica</Button>
            )}
          </div>
        </Bloco>

        <Bloco titulo="Salvar e levar para outro computador">
          <div className="space-y-2 py-3 text-xs">
            <p className="flex items-center gap-1.5 text-texto-primario">
              {nuvem === "salvo" ? <Cloud size={14} className="text-sucesso" /> : nuvem === "salvando" ? <Loader2 size={14} className="animate-spin text-primaria" /> : <CloudOff size={14} className="text-texto-secundario" />}
              {nuvem === "salvo" ? "Salvo neste computador e na sua conta (nuvem)." : nuvem === "salvando" ? "Salvando…" : nuvem === "erro" ? "Salvo neste computador. A nuvem não respondeu agora." : "Salvo neste computador. Vai para a nuvem quando houver internet."}
              {nuvem !== "salvando" && nuvem !== "salvo" && <button type="button" onClick={sincronizarAgora} className="text-primaria hover:underline">Tentar agora</button>}
            </p>
            <p className="text-texto-secundario">Fotos e vídeos enviados ficam só neste computador; no outro, o fundo volta para o do tema até você enviar de novo.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variante="secundaria" tamanho="pequeno" onClick={() => navigator.clipboard.writeText(exportar()).then(() => toast.success("Configuração copiada."), () => toast.error("Não consegui copiar."))}><Copy size={13} /> Copiar</Button>
              <Button variante="secundaria" tamanho="pequeno" onClick={salvarArquivo}><Download size={13} /> Exportar arquivo</Button>
              <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-borda bg-superficie px-3 font-medium text-texto-primario hover:bg-borda/40">
                <Upload size={13} /> Importar
                <input type="file" accept="application/json,.json" className="sr-only" onChange={async (e) => { const arq = e.target.files?.[0]; e.target.value = ""; if (!arq) return; try { importar(await arq.text()); toast.success("Aparência importada."); } catch (err) { toast.error(err instanceof Error ? err.message : String(err)); } }} />
              </label>
            </div>
          </div>
        </Bloco>
      </div>
    </div>
  );
}
