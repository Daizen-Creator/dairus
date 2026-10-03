import { useEffect, useState } from "react";
import { Film, Image as ImageIcon, Layers, Palette, Plus, Sparkles, SwatchBook, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useAparenciaStore } from "../../state/aparencia-store";
import { useUrlImagem } from "../../components/layout/FundoApp";
import { CORES_PRONTAS, GRADIENTES_PRONTOS, cssGradiente, type EstiloAnimado, type Gradiente, type TipoFundo } from "./aparencia";
import { Bloco, Faixa, Linha, Opcoes, SeletorCor } from "./Controles";
import { CATEGORIAS_GALERIA, GALERIA } from "./galeria";
import { apagarMidia, listarMidias, salvarMidia, type InfoMidia, type TipoMidia } from "./midia";

const TIPOS: Array<{ valor: TipoFundo; rotulo: string; icone: React.ReactNode }> = [
  { valor: "tema", rotulo: "Do tema", icone: <SwatchBook size={13} /> },
  { valor: "cor", rotulo: "Cor sólida", icone: <Palette size={13} /> },
  { valor: "gradiente", rotulo: "Degradê", icone: <Layers size={13} /> },
  { valor: "imagem", rotulo: "Imagem", icone: <ImageIcon size={13} /> },
  { valor: "video", rotulo: "Vídeo", icone: <Film size={13} /> },
  { valor: "animado", rotulo: "Animado", icone: <Sparkles size={13} /> },
];

function Miniatura({ refImagem, selecionada, onClick, rotulo, onApagar }: { refImagem: string; selecionada: boolean; onClick: () => void; rotulo: string; onApagar?: () => void }) {
  const url = useUrlImagem(refImagem);
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selecionada}
        title={rotulo}
        className={`block aspect-video w-full overflow-hidden rounded-lg border-2 bg-fundo bg-cover bg-center transition-transform hover:scale-[1.03] ${selecionada ? "border-primaria" : "border-transparent"}`}
        style={{ backgroundImage: url ? `url("${url}")` : undefined }}
      >
        <span className="sr-only">{rotulo}</span>
      </button>
      <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate rounded-b-lg bg-black/55 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">{rotulo}</span>
      {onApagar && (
        <button type="button" onClick={onApagar} aria-label={`Apagar ${rotulo}`} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-erro group-hover:opacity-100 focus:opacity-100">
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}

function EditorGradiente({ g, onChange }: { g: Gradiente; onChange: (g: Gradiente) => void }) {
  const alterarParada = (i: number, p: Partial<Gradiente["paradas"][number]>) => onChange({ ...g, paradas: g.paradas.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return (
    <div className="space-y-2 py-2">
      <div className="h-16 rounded-lg border border-borda" style={{ background: cssGradiente(g) }} aria-label="Prévia do degradê" />
      <Linha rotulo="Tipo">
        <Opcoes rotulo="Tipo de degradê" valor={g.tipo} onChange={(tipo) => onChange({ ...g, tipo })} opcoes={[{ valor: "linear", rotulo: "Linear" }, { valor: "radial", rotulo: "Radial (do centro)" }]} />
      </Linha>
      {g.tipo === "linear" && <Faixa rotulo="Ângulo" valor={g.angulo} min={0} max={360} formato={(v) => `${v}°`} onChange={(angulo) => onChange({ ...g, angulo })} />}
      <p className="pt-1 text-xs font-medium text-texto-secundario">Cores (paradas)</p>
      {g.paradas.map((p, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <SeletorCor rotulo={`Cor ${i + 1}`} valor={p.cor} onChange={(cor) => alterarParada(i, { cor })} />
          <input type="range" min={0} max={100} value={p.pos} onChange={(e) => alterarParada(i, { pos: Number(e.target.value) })} aria-label={`Posição da cor ${i + 1}`} className="w-28 accent-[var(--cor-primaria)]" />
          <span className="w-9 text-xs tabular-nums text-texto-secundario">{p.pos}%</span>
          {g.paradas.length > 2 && (
            <button type="button" onClick={() => onChange({ ...g, paradas: g.paradas.filter((_, j) => j !== i) })} aria-label={`Tirar cor ${i + 1}`} className="text-texto-secundario hover:text-erro"><X size={14} /></button>
          )}
        </div>
      ))}
      {g.paradas.length < 6 && (
        <button type="button" onClick={() => onChange({ ...g, paradas: [...g.paradas, { cor: "#ffffff", pos: 100 }] })} className="flex items-center gap-1 text-xs text-primaria hover:underline"><Plus size={12} /> Adicionar cor</button>
      )}
    </div>
  );
}

function useMidias(tipo: TipoMidia) {
  const [lista, setLista] = useState<InfoMidia[]>([]);
  const recarregar = () => listarMidias(tipo).then(setLista).catch(() => setLista([]));
  useEffect(() => {
    recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);
  return { lista, recarregar };
}

export function PainelFundo() {
  const a = useAparenciaStore((s) => s.aparencia);
  const alterar = useAparenciaStore((s) => s.alterar);
  const f = a.fundo;
  const [categoria, setCategoria] = useState<string>("Todas");
  const imagens = useMidias("fundo-imagem");
  const videos = useMidias("fundo-video");
  const [enviando, setEnviando] = useState(false);

  async function enviar(tipo: TipoMidia, arquivo: File | undefined) {
    if (!arquivo) return;
    setEnviando(true);
    try {
      const info = await salvarMidia(tipo, arquivo);
      if (tipo === "fundo-imagem") {
        await imagens.recarregar();
        alterar({ fundo: { tipo: "imagem", imagem: `midia:${info.id}` } });
      } else {
        await videos.recarregar();
        alterar({ fundo: { tipo: "video", video: info.id } });
      }
      toast.success("Fundo aplicado. O arquivo fica guardado só neste computador.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  async function apagar(tipo: TipoMidia, id: string) {
    await apagarMidia(id);
    if (tipo === "fundo-imagem") {
      await imagens.recarregar();
      if (f.imagem === `midia:${id}`) alterar({ fundo: { imagem: "galeria:montanhas" } });
    } else {
      await videos.recarregar();
      if (f.video === id) alterar({ fundo: { tipo: "tema", video: "" } });
    }
  }

  const ajustesMidia = (
    <Bloco titulo="Ajustes para o texto continuar legível">
      <Faixa rotulo="Escurecer / clarear" valor={f.midia.escurecer} min={-100} max={100} formato={(v) => (v === 0 ? "nada" : v > 0 ? `escurecer ${v}%` : `clarear ${-v}%`)} onChange={(escurecer) => alterar({ fundo: { midia: { escurecer } } })} />
      <Faixa rotulo="Desfoque" valor={f.midia.desfoque} min={0} max={40} formato={(v) => `${v}px`} onChange={(desfoque) => alterar({ fundo: { midia: { desfoque } } })} />
      <Faixa rotulo="Opacidade" valor={Math.round(f.midia.opacidade * 100)} min={10} max={100} formato={(v) => `${v}%`} onChange={(v) => alterar({ fundo: { midia: { opacidade: v / 100 } } })} />
      <Faixa rotulo="Saturação das cores" valor={f.midia.saturacao} min={0} max={200} formato={(v) => (v === 0 ? "preto e branco" : `${v}%`)} onChange={(saturacao) => alterar({ fundo: { midia: { saturacao } } })} />
      <Linha rotulo="Encaixe">
        <Opcoes rotulo="Encaixe da imagem" valor={f.ajuste} onChange={(ajuste) => alterar({ fundo: { ajuste } })} opcoes={[{ valor: "cover", rotulo: "Preencher (cover)" }, { valor: "contain", rotulo: "Inteira (contain)" }, { valor: "fill", rotulo: "Esticar" }, ...(f.tipo === "imagem" ? [{ valor: "repeat" as const, rotulo: "Repetir" }] : [])]} />
      </Linha>
      <Linha rotulo="Posição">
        <Opcoes rotulo="Posição da imagem" valor={f.posicao} onChange={(posicao) => alterar({ fundo: { posicao } })} opcoes={[{ valor: "center", rotulo: "Centro" }, { valor: "top", rotulo: "Topo" }, { valor: "bottom", rotulo: "Base" }, { valor: "left", rotulo: "Esquerda" }, { valor: "right", rotulo: "Direita" }]} />
      </Linha>
      {f.tipo === "video" && <Faixa rotulo="Velocidade do vídeo" valor={f.velocidade} min={0.25} max={2} passo={0.25} formato={(v) => `${v}×`} onChange={(velocidade) => alterar({ fundo: { velocidade } })} />}
    </Bloco>
  );

  return (
    <div className="space-y-4">
      <Bloco titulo="Tipo de fundo" descricao="Muda na hora, no app inteiro. Os cartões ficam transparentes conforme Texto e formas → Transparência.">
        <div className="py-2">
          <Opcoes rotulo="Tipo de fundo" valor={f.tipo} onChange={(tipo) => alterar({ fundo: { tipo } })} opcoes={TIPOS} />
        </div>
      </Bloco>

      {f.tipo === "cor" && (
        <Bloco titulo="Cor sólida">
          <Linha rotulo="Cor do fundo">
            <SeletorCor rotulo="Cor do fundo" valor={f.cor} onChange={(cor) => alterar({ fundo: { cor } })} sugestoes={CORES_PRONTAS} />
          </Linha>
        </Bloco>
      )}

      {f.tipo === "gradiente" && (
        <>
          <Bloco titulo="Degradês prontos">
            <div className="grid grid-cols-2 gap-2 py-2 sm:grid-cols-5">
              {GRADIENTES_PRONTOS.map((p) => (
                <button key={p.nome} type="button" onClick={() => alterar({ fundo: { gradiente: p.gradiente } })} className="overflow-hidden rounded-lg border border-borda text-left hover:border-primaria">
                  <span className="block h-12" style={{ background: cssGradiente(p.gradiente) }} />
                  <span className="block px-2 py-1 text-xs text-texto-primario">{p.nome}</span>
                </button>
              ))}
            </div>
          </Bloco>
          <Bloco titulo="Criar o meu degradê">
            <EditorGradiente g={f.gradiente} onChange={(gradiente) => alterar({ fundo: { gradiente } })} />
          </Bloco>
        </>
      )}

      {f.tipo === "imagem" && (
        <>
          <Bloco
            titulo="Suas fotos"
            descricao="PNG, JPG, WebP ou GIF até 25 MB. Ficam guardadas só neste computador (não vão para a nuvem)."
            acao={
              <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-gradient-to-r from-primaria to-destaque px-3 py-1.5 text-xs font-medium text-primaria-texto ${enviando ? "pointer-events-none opacity-60" : ""}`}>
                <Upload size={13} /> Enviar foto
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const arq = e.target.files?.[0]; e.target.value = ""; enviar("fundo-imagem", arq); }} />
              </label>
            }
          >
            {imagens.lista.length === 0 ? (
              <p className="py-2 text-xs text-texto-secundario">Nenhuma foto enviada ainda. Use uma foto da família, de uma viagem ou do seu lugar favorito.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 py-2 sm:grid-cols-5 lg:grid-cols-6">
                {imagens.lista.map((m) => (
                  <Miniatura key={m.id} refImagem={`midia:${m.id}`} rotulo={m.nome} selecionada={f.imagem === `midia:${m.id}`} onClick={() => alterar({ fundo: { imagem: `midia:${m.id}` } })} onApagar={() => apagar("fundo-imagem", m.id)} />
                ))}
              </div>
            )}
          </Bloco>
          <Bloco titulo="Galeria do Dairus">
            <div className="flex flex-wrap gap-1.5 py-2">
              {["Todas", ...CATEGORIAS_GALERIA].map((c) => (
                <button key={c} type="button" onClick={() => setCategoria(c)} className={`rounded-full px-3 py-1 text-xs ${categoria === c ? "bg-primaria text-primaria-texto" : "bg-superficie text-texto-secundario hover:text-texto-primario"}`}>{c}</button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 pb-2 sm:grid-cols-5 lg:grid-cols-6">
              {GALERIA.filter((g) => categoria === "Todas" || g.categoria === categoria).map((g) => (
                <Miniatura key={g.id} refImagem={`galeria:${g.id}`} rotulo={g.nome} selecionada={f.imagem === `galeria:${g.id}`} onClick={() => alterar({ fundo: { imagem: `galeria:${g.id}` } })} />
              ))}
            </div>
          </Bloco>
          {ajustesMidia}
        </>
      )}

      {f.tipo === "video" && (
        <>
          <Bloco
            titulo="Seus vídeos"
            descricao="MP4 ou WebM até 150 MB, sem som e em repetição. Prefira vídeos curtos e calmos; ficam só neste computador."
            acao={
              <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-gradient-to-r from-primaria to-destaque px-3 py-1.5 text-xs font-medium text-primaria-texto ${enviando ? "pointer-events-none opacity-60" : ""}`}>
                <Upload size={13} /> Enviar vídeo
                <input type="file" accept="video/mp4,video/webm,video/ogg" className="sr-only" onChange={(e) => { const arq = e.target.files?.[0]; e.target.value = ""; enviar("fundo-video", arq); }} />
              </label>
            }
          >
            {videos.lista.length === 0 ? (
              <p className="py-2 text-xs text-texto-secundario">Nenhum vídeo enviado. Sem vídeo, use um fundo Animado (não precisa de arquivo).</p>
            ) : (
              <ul className="py-1">
                {videos.lista.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                    <label className="flex min-w-0 items-center gap-2 text-texto-primario">
                      <input type="radio" name="video-fundo" checked={f.video === v.id} onChange={() => alterar({ fundo: { video: v.id } })} className="accent-[var(--cor-primaria)]" />
                      <Film size={14} className="shrink-0 text-texto-secundario" />
                      <span className="truncate">{v.nome}</span>
                      <span className="shrink-0 text-xs text-texto-secundario">{(v.tamanho / 1024 / 1024).toFixed(1).replace(".", ",")} MB</span>
                    </label>
                    <button type="button" onClick={() => apagar("fundo-video", v.id)} aria-label={`Apagar ${v.nome}`} className="text-texto-secundario hover:text-erro"><Trash2 size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
          </Bloco>
          {ajustesMidia}
        </>
      )}

      {f.tipo === "animado" && (
        <Bloco titulo="Fundo animado" descricao="Movimento lento nas cores do tema. Para quando o Windows ou o Dairus estão com “reduzir animações”.">
          <div className="grid grid-cols-2 gap-2 py-2 sm:grid-cols-4">
            {(
              [
                ["aurora", "Aurora", "radial-gradient(circle at 20% 30%, var(--cor-primaria), transparent 60%), radial-gradient(circle at 80% 70%, var(--cor-destaque), transparent 55%), var(--cor-fundo)"],
                ["ondas", "Ondas de cor", "linear-gradient(120deg, var(--cor-fundo), var(--cor-primaria), var(--cor-destaque), var(--cor-fundo))"],
                ["bolhas", "Bolhas subindo", "radial-gradient(circle at 30% 70%, var(--cor-primaria) 0 8%, transparent 9%), radial-gradient(circle at 70% 40%, var(--cor-destaque) 0 6%, transparent 7%), var(--cor-fundo)"],
                ["gradiente", "Giro de cores", "conic-gradient(var(--cor-primaria), var(--cor-destaque), var(--cor-secundaria), var(--cor-primaria))"],
              ] as Array<[EstiloAnimado, string, string]>
            ).map(([id, nome, prev]) => (
              <button key={id} type="button" onClick={() => alterar({ fundo: { animado: id } })} aria-pressed={f.animado === id} className={`overflow-hidden rounded-lg border-2 text-left ${f.animado === id ? "border-primaria" : "border-borda hover:border-texto-secundario"}`}>
                <span className="block h-14" style={{ background: prev }} />
                <span className="block px-2 py-1 text-xs text-texto-primario">{nome}</span>
              </button>
            ))}
          </div>
          <Faixa rotulo="Velocidade" valor={f.velocidade} min={0.25} max={3} passo={0.25} formato={(v) => `${v}×`} onChange={(velocidade) => alterar({ fundo: { velocidade } })} />
        </Bloco>
      )}
    </div>
  );
}

