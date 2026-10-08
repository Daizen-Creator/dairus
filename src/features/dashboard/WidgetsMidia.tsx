import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Film, Image as ImageIcon, Pause, Play, Plus, Settings2, Trash2, Volume2, VolumeX, Wallpaper } from "lucide-react";
import { toast } from "sonner";
import { usePreferencia } from "../../state/usePreferencia";
import { useInstancia } from "./painel/contexto";
import { useAparenciaStore } from "../../state/aparencia-store";
import { apagarMidia, listarMidias, salvarMidia, urlDaMidia, type InfoMidia } from "../aparencia/midia";

/**
 * Moldura dos widgets de mídia: ocupa o tamanho escolhido na grade. Com "esconder título"
 * (padrão nas fotos), o conteúdo vai de borda a borda e os ajustes aparecem ao passar o mouse.
 */
function Moldura({ titulo, icone: Icone, ajustes, children, semPadding = false }: { titulo: string; icone: typeof Clock; ajustes?: React.ReactNode; children: React.ReactNode; semPadding?: boolean }) {
  const [abrirAjustes, setAbrirAjustes] = useState(false);
  const inst = useInstancia();
  const nome = inst?.config.titulo?.trim() || titulo;
  const flutuante = !!inst?.config.semTitulo;
  const botao = ajustes && (
    <button type="button" onClick={() => setAbrirAjustes(!abrirAjustes)} aria-label={`Ajustes: ${nome}`} aria-expanded={abrirAjustes} className={`nao-arrastar rounded p-1 ${flutuante ? "rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70" : "text-texto-secundario hover:bg-borda/50 hover:text-texto-primario"}`}><Settings2 size={13} /></button>
  );
  return (
    <div className="group/moldura relative flex h-full flex-col overflow-hidden rounded-xl border border-borda bg-cartao">
      {flutuante ? (
        botao && <div className={`absolute right-2 top-2 z-10 transition-opacity focus-within:opacity-100 group-hover/moldura:opacity-100 ${abrirAjustes ? "opacity-100" : "opacity-0"}`}>{botao}</div>
      ) : (
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-2.5">
          <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-texto-secundario"><Icone size={13} className="shrink-0 text-primaria" /> <span className="truncate">{nome}</span></p>
          {botao}
        </div>
      )}
      {abrirAjustes && ajustes && (
        <div className={`nao-arrastar space-y-2 overflow-auto rounded-lg border border-borda p-2.5 text-xs ${flutuante ? "absolute inset-x-2 top-11 z-10 max-h-[75%] bg-superficie shadow-lg" : "mx-3 mt-2 max-h-[60%] shrink-0 bg-fundo"}`}>{ajustes}</div>
      )}
      <div className={`min-h-0 flex-1 ${flutuante ? "" : semPadding ? "mt-2" : "overflow-auto p-3 pt-2"}`}>{children}</div>
    </div>
  );
}

/** true quando o elemento passa da largura (para o relógio crescer quando o card fica largo). */
function useLargo(ref: React.RefObject<HTMLElement | null>, minimo = 380): boolean {
  const [largo, setLargo] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(([e]) => setLargo(e.contentRect.width >= minimo));
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, minimo]);
  return largo;
}

// ---------------------------------------------------------------------------
// Relógio

export const FUSOS = [
  { id: "America/Sao_Paulo", nome: "Brasília" },
  { id: "America/Manaus", nome: "Manaus" },
  { id: "America/Noronha", nome: "Noronha" },
  { id: "Europe/Lisbon", nome: "Lisboa" },
  { id: "Europe/London", nome: "Londres" },
  { id: "Europe/Paris", nome: "Paris" },
  { id: "America/New_York", nome: "Nova York" },
  { id: "America/Los_Angeles", nome: "Los Angeles" },
  { id: "Asia/Tokyo", nome: "Tóquio" },
  { id: "Asia/Dubai", nome: "Dubai" },
  { id: "Australia/Sydney", nome: "Sydney" },
];

interface ConfigRelogio {
  estilo: "digital" | "analogico";
  segundos: boolean;
  fusos: string[];
}

/** Hora, minuto e segundo num fuso (sem depender do fuso do computador). */
export function horaNoFuso(data: Date, fuso: string): { h: number; m: number; s: number; texto: string } {
  const partes = new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(data);
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value ?? 0);
  const h = v("hour"), m = v("minute"), s = v("second");
  return { h, m, s, texto: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
}

function Analogico({ h, m, s, segundos, tamanho = 120 }: { h: number; m: number; s: number; segundos: boolean; tamanho?: number }) {
  const ang = (v: number, total: number) => (v / total) * 360;
  const ponteiro = (angulo: number, comp: number, larg: number, cor: string) => (
    <line x1="50" y1="50" x2={50 + comp * Math.sin((angulo * Math.PI) / 180)} y2={50 - comp * Math.cos((angulo * Math.PI) / 180)} stroke={cor} strokeWidth={larg} strokeLinecap="round" />
  );
  return (
    <svg viewBox="0 0 100 100" width={tamanho} height={tamanho} role="img" aria-label={`${h} horas e ${m} minutos`}>
      <circle cx="50" cy="50" r="47" fill="var(--cor-fundo)" stroke="var(--cor-borda)" strokeWidth="2" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        return <line key={i} x1={50 + 40 * Math.sin(a)} y1={50 - 40 * Math.cos(a)} x2={50 + (i % 3 ? 43 : 45) * Math.sin(a)} y2={50 - (i % 3 ? 43 : 45) * Math.cos(a)} stroke="var(--cor-texto-secundario)" strokeWidth={i % 3 ? 1 : 2} />;
      })}
      {ponteiro(ang((h % 12) + m / 60, 12), 24, 3.5, "var(--cor-texto-primario)")}
      {ponteiro(ang(m + s / 60, 60), 34, 2.5, "var(--cor-texto-primario)")}
      {segundos && ponteiro(ang(s, 60), 38, 1, "var(--cor-primaria)")}
      <circle cx="50" cy="50" r="2.5" fill="var(--cor-primaria)" />
    </svg>
  );
}

export function WidgetRelogio() {
  const [cfg, setCfg] = usePreferencia<ConfigRelogio>("widget_relogio", { estilo: "digital", segundos: false, fusos: [] });
  const area = useRef<HTMLDivElement>(null);
  const largo = useLargo(area);
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setAgora(new Date()), cfg.segundos || cfg.estilo === "analogico" ? 1000 : 15_000);
    return () => window.clearInterval(t);
  }, [cfg.segundos, cfg.estilo]);
  const local = { h: agora.getHours(), m: agora.getMinutes(), s: agora.getSeconds() };
  const dataMinuscula = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const data = dataMinuscula.charAt(0).toUpperCase() + dataMinuscula.slice(1);

  return (
    <Moldura
      titulo="Relógio"
      icone={Clock}
      ajustes={
        <>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1.5"><input type="radio" checked={cfg.estilo === "digital"} onChange={() => setCfg({ ...cfg, estilo: "digital" })} className="accent-[var(--cor-primaria)]" /> Digital</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={cfg.estilo === "analogico"} onChange={() => setCfg({ ...cfg, estilo: "analogico" })} className="accent-[var(--cor-primaria)]" /> Ponteiros</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={cfg.segundos} onChange={() => setCfg({ ...cfg, segundos: !cfg.segundos })} className="accent-[var(--cor-primaria)]" /> Segundos</label>
          </div>
          <p className="text-texto-secundario">Outros fusos (até 3):</p>
          <div className="flex flex-wrap gap-1">
            {FUSOS.map((f) => (
              <button key={f.id} type="button" onClick={() => setCfg({ ...cfg, fusos: cfg.fusos.includes(f.id) ? cfg.fusos.filter((x) => x !== f.id) : [...cfg.fusos, f.id].slice(-3) })} className={`rounded-full border px-2 py-0.5 ${cfg.fusos.includes(f.id) ? "border-primaria text-primaria" : "border-borda text-texto-secundario"}`}>{f.nome}</button>
            ))}
          </div>
        </>
      }
    >
      <div ref={area} className={`flex h-full items-center gap-4 ${cfg.estilo === "analogico" ? "" : "flex-col items-start justify-center"}`}>
        {cfg.estilo === "analogico" ? (
          <Analogico {...local} segundos={cfg.segundos} tamanho={largo ? 130 : 104} />
        ) : (
          <p className="font-bold leading-none tabular-nums text-texto-primario" style={{ fontSize: largo ? "3.25rem" : "2.6rem" }}>
            {String(local.h).padStart(2, "0")}:{String(local.m).padStart(2, "0")}
            {cfg.segundos && <span className="text-[0.45em] text-texto-secundario">:{String(local.s).padStart(2, "0")}</span>}
          </p>
        )}
        <div className="min-w-0">
          <p className="text-sm text-texto-secundario">{data}</p>
          {cfg.fusos.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs">
              {cfg.fusos.map((f) => (
                <li key={f} className="flex justify-between gap-3"><span className="text-texto-secundario">{FUSOS.find((x) => x.id === f)?.nome ?? f}</span><span className="tabular-nums text-texto-primario">{horaNoFuso(agora, f).texto}</span></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Moldura>
  );
}

// ---------------------------------------------------------------------------
// Fotos

interface ConfigFotos {
  intervalo: number;
  ajuste: "cover" | "contain";
}

export function WidgetFotos() {
  const [cfg, setCfg] = usePreferencia<ConfigFotos>("widget_fotos", { intervalo: 8, ajuste: "cover" });
  const [fotos, setFotos] = useState<InfoMidia[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [sobre, setSobre] = useState(false);
  const alterarAparencia = useAparenciaStore((s) => s.alterar);

  const carregar = async () => {
    const lista = await listarMidias("widget-foto").catch(() => []);
    setFotos(lista);
    const novas: Record<string, string> = {};
    for (const f of lista) {
      const u = await urlDaMidia(f.id).catch(() => null);
      if (u) novas[f.id] = u;
    }
    setUrls(novas);
  };
  useEffect(() => {
    carregar();
  }, []);
  useEffect(() => {
    if (fotos.length < 2 || pausado || sobre) return;
    const t = window.setInterval(() => setIndice((i) => (i + 1) % fotos.length), cfg.intervalo * 1000);
    return () => window.clearInterval(t);
  }, [fotos.length, pausado, sobre, cfg.intervalo]);

  async function enviar(arquivos: File[]) {
    let ok = 0;
    for (const a of arquivos) {
      try {
        await salvarMidia("widget-foto", a);
        ok++;
      } catch (e) {
        toast.error(`${a.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (ok) toast.success(`${ok} foto(s) adicionada(s).`);
    await carregar();
  }

  const atual = fotos[Math.min(indice, Math.max(0, fotos.length - 1))];
  const botaoEnviar = (
    <label className="inline-flex cursor-pointer items-center gap-1 text-primaria hover:underline">
      <Plus size={12} /> Adicionar fotos
      <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; enviar(fs); }} />
    </label>
  );

  return (
    <Moldura
      titulo="Fotos"
      icone={ImageIcon}
      semPadding={fotos.length > 0}
      ajustes={
        <>
          <label className="flex items-center gap-2">Trocar a cada <input type="range" min={3} max={60} value={cfg.intervalo} onChange={(e) => setCfg({ ...cfg, intervalo: Number(e.target.value) })} className="flex-1 accent-[var(--cor-primaria)]" /> <span className="w-8 tabular-nums">{cfg.intervalo}s</span></label>
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5"><input type="radio" checked={cfg.ajuste === "cover"} onChange={() => setCfg({ ...cfg, ajuste: "cover" })} className="accent-[var(--cor-primaria)]" /> Preencher</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={cfg.ajuste === "contain"} onChange={() => setCfg({ ...cfg, ajuste: "contain" })} className="accent-[var(--cor-primaria)]" /> Foto inteira</label>
          </div>
          <div className="flex flex-wrap items-center gap-3">{botaoEnviar}<span className="text-texto-secundario">{fotos.length} foto(s), guardadas só neste computador.</span></div>
          {fotos.length > 0 && (
            <div className="grid grid-cols-6 gap-1">
              {fotos.map((f) => (
                <div key={f.id} className="group relative aspect-square overflow-hidden rounded-md bg-borda/40">
                  {urls[f.id] && <img src={urls[f.id]} alt="" className="h-full w-full object-cover" />}
                  <button type="button" onClick={async () => { await apagarMidia(f.id); setIndice(0); carregar(); }} aria-label={`Apagar ${f.nome}`} className="absolute inset-0 flex items-center justify-center bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </>
      }
    >
      {fotos.length === 0 ? (
        <div className="m-3 flex h-[calc(100%-1.5rem)] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-borda px-3 py-6 text-center text-xs text-texto-secundario">
          <ImageIcon size={22} />
          <p>Coloque fotos da família, de uma viagem ou do que você está juntando dinheiro para conquistar.</p>
          {botaoEnviar}
        </div>
      ) : (
        <div className="group relative h-full min-h-[120px] overflow-hidden" onMouseEnter={() => setSobre(true)} onMouseLeave={() => setSobre(false)}>
          {fotos.map((f, i) =>
            urls[f.id] ? (
              <img
                key={f.id}
                src={urls[f.id]}
                alt={f.nome}
                className="absolute inset-0 h-full w-full transition-opacity duration-700"
                style={{ objectFit: cfg.ajuste, opacity: f.id === atual?.id ? 1 : 0, background: cfg.ajuste === "contain" ? "var(--cor-fundo)" : undefined }}
              />
            ) : (
              <span key={f.id} className={i === indice ? "" : "hidden"} />
            ),
          )}
          {fotos.length > 1 && (
            <>
              <button type="button" onClick={() => setIndice((i) => (i - 1 + fotos.length) % fotos.length)} aria-label="Foto anterior" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"><ChevronLeft size={16} /></button>
              <button type="button" onClick={() => setIndice((i) => (i + 1) % fotos.length)} aria-label="Próxima foto" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/45 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"><ChevronRight size={16} /></button>
            </>
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6 text-white opacity-0 transition-opacity group-hover:opacity-100">
            <span className="flex gap-1">
              {fotos.map((f, i) => <button key={f.id} type="button" onClick={() => setIndice(i)} aria-label={`Foto ${i + 1}`} className={`h-1.5 rounded-full transition-all ${f.id === atual?.id ? "w-4 bg-white" : "w-1.5 bg-white/50"}`} />)}
            </span>
            <span className="flex items-center gap-2">
              {atual && (
                <button type="button" onClick={() => { alterarAparencia({ fundo: { tipo: "imagem", imagem: `midia:${atual.id}`, midia: { escurecer: 40, opacidade: 1, desfoque: 0, saturacao: 100 } }, formas: { opacidadeCartoes: 0.7 } }); toast.success("Foto aplicada como fundo do app."); }} className="flex items-center gap-1 text-[11px] hover:underline" title="Usar esta foto como fundo do Dairus"><Wallpaper size={12} /> Usar de fundo</button>
              )}
              {fotos.length > 1 && <button type="button" onClick={() => setPausado(!pausado)} aria-label={pausado ? "Continuar" : "Pausar"}>{pausado ? <Play size={14} /> : <Pause size={14} />}</button>}
            </span>
          </div>
        </div>
      )}
    </Moldura>
  );
}

// ---------------------------------------------------------------------------
// Vídeo

interface ConfigVideo {
  id: string;
  mudo: boolean;
}

export function WidgetVideo() {
  const [cfg, setCfg] = usePreferencia<ConfigVideo>("widget_video", { id: "", mudo: true });
  const [videos, setVideos] = useState<InfoMidia[]>([]);
  const [url, setUrl] = useState<string | null>(null);
  const [tocando, setTocando] = useState(true);
  const ref = useRef<HTMLVideoElement>(null);

  const carregar = () => listarMidias("widget-video").then(setVideos).catch(() => setVideos([]));
  useEffect(() => {
    carregar();
  }, []);
  const idAtual = cfg.id && videos.some((v) => v.id === cfg.id) ? cfg.id : videos[0]?.id ?? "";
  useEffect(() => {
    let vivo = true;
    if (idAtual) urlDaMidia(idAtual).then((u) => vivo && setUrl(u));
    else setUrl(null);
    return () => {
      vivo = false;
    };
  }, [idAtual]);

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    try {
      const info = await salvarMidia("widget-video", arquivo);
      await carregar();
      setCfg({ ...cfg, id: info.id });
      toast.success("Vídeo adicionado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const botaoEnviar = (
    <label className="inline-flex cursor-pointer items-center gap-1 text-primaria hover:underline">
      <Plus size={12} /> Adicionar vídeo
      <input type="file" accept="video/mp4,video/webm,video/ogg" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; enviar(f); }} />
    </label>
  );

  return (
    <Moldura
      titulo="Vídeo"
      icone={Film}
      semPadding={!!url}
      ajustes={
        <>
          <div className="flex flex-wrap items-center gap-3">{botaoEnviar}<span className="text-texto-secundario">MP4/WebM até 150 MB, só neste computador.</span></div>
          {videos.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-2">
              <label className="flex min-w-0 items-center gap-1.5"><input type="radio" checked={idAtual === v.id} onChange={() => setCfg({ ...cfg, id: v.id })} className="accent-[var(--cor-primaria)]" /><span className="truncate">{v.nome}</span></label>
              <button type="button" onClick={async () => { await apagarMidia(v.id); carregar(); }} aria-label={`Apagar ${v.nome}`} className="text-texto-secundario hover:text-erro"><Trash2 size={12} /></button>
            </div>
          ))}
        </>
      }
    >
      {!url ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-borda px-3 py-6 text-center text-xs text-texto-secundario">
          <Film size={22} />
          <p>Um vídeo curto que te motiva: a viagem dos sonhos, a casa nova, sua família.</p>
          {botaoEnviar}
        </div>
      ) : (
        <div className="group relative h-full min-h-[120px]">
          <video ref={ref} src={url} autoPlay muted={cfg.mudo} loop playsInline className="h-full w-full bg-black object-cover" onPlay={() => setTocando(true)} onPause={() => setTocando(false)} />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-3 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button type="button" onClick={() => (tocando ? ref.current?.pause() : ref.current?.play())} aria-label={tocando ? "Pausar vídeo" : "Tocar vídeo"}>{tocando ? <Pause size={15} /> : <Play size={15} />}</button>
            <button type="button" onClick={() => setCfg({ ...cfg, mudo: !cfg.mudo })} aria-label={cfg.mudo ? "Ligar som" : "Tirar som"}>{cfg.mudo ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
          </div>
        </div>
      )}
    </Moldura>
  );
}
