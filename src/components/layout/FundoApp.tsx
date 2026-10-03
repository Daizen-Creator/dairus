import { useEffect, useRef, useState } from "react";
import { cssGradiente, type Aparencia } from "../../features/aparencia/aparencia";
import { urlDaGaleria } from "../../features/aparencia/galeria";
import { urlDaMidia } from "../../features/aparencia/midia";
import { useAparenciaStore } from "../../state/aparencia-store";

/** URL da imagem de fundo: desenho da galeria ou arquivo enviado (guardado no computador). */
export function useUrlImagem(ref: string): string | null {
  const [url, setUrl] = useState<string | null>(() => (ref.startsWith("galeria:") ? urlDaGaleria(ref.slice(8)) : null));
  useEffect(() => {
    let vivo = true;
    if (ref.startsWith("galeria:")) setUrl(urlDaGaleria(ref.slice(8)));
    else if (ref.startsWith("midia:")) urlDaMidia(ref.slice(6)).then((u) => vivo && setUrl(u)).catch(() => vivo && setUrl(null));
    else setUrl(null);
    return () => {
      vivo = false;
    };
  }, [ref]);
  return url;
}

/** Cor média de uma imagem (amostra 24×24 num canvas), para medir o contraste. */
function medirMedia(fonte: CanvasImageSource): [number, number, number] | null {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 24;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(fonte, 0, 0, 24, 24);
    const d = ctx.getImageData(0, 0, 24, 24).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
    }
    const n = d.length / 4;
    return [r / n, g / n, b / n];
  } catch {
    return null;
  }
}

function estiloMidia(a: Aparencia): React.CSSProperties {
  const m = a.fundo.midia;
  return {
    opacity: m.opacidade,
    filter: `blur(${m.desfoque}px) saturate(${m.saturacao}%)`,
    // Com desfoque, aumenta um pouco para não aparecer borda clara nos cantos.
    transform: m.desfoque > 0 ? `scale(${1 + Math.min(0.12, m.desfoque / 200)})` : undefined,
  };
}

function Camada({ escurecer }: { escurecer: number }) {
  if (!escurecer) return null;
  return <div className="absolute inset-0" style={{ background: escurecer > 0 ? `rgba(0,0,0,${escurecer / 100})` : `rgba(255,255,255,${-escurecer / 100})` }} />;
}

function FundoAnimado({ a }: { a: Aparencia }) {
  const dur = (s: number) => `${(s / a.fundo.velocidade).toFixed(1)}s`;
  switch (a.fundo.animado) {
    case "ondas":
      return (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "linear-gradient(120deg, var(--cor-fundo), color-mix(in srgb, var(--cor-primaria) 45%, var(--cor-fundo)), color-mix(in srgb, var(--cor-destaque) 40%, var(--cor-fundo)), var(--cor-fundo))",
            backgroundSize: "400% 400%",
            animation: `fundo-onda ${dur(24)} ease-in-out infinite`,
          }}
        />
      );
    case "gradiente":
      return (
        <div
          className="absolute -inset-1/2"
          style={{
            backgroundImage: "conic-gradient(from 0deg, color-mix(in srgb, var(--cor-primaria) 55%, var(--cor-fundo)), color-mix(in srgb, var(--cor-destaque) 55%, var(--cor-fundo)), color-mix(in srgb, var(--cor-secundaria) 50%, var(--cor-fundo)), color-mix(in srgb, var(--cor-primaria) 55%, var(--cor-fundo)))",
            filter: "blur(80px)",
            animation: `fundo-gira ${dur(60)} linear infinite`,
          }}
        />
      );
    case "bolhas":
      return (
        <>
          {Array.from({ length: 14 }, (_, i) => {
            const tam = 40 + ((i * 37) % 120);
            return (
              <span
                key={i}
                className="absolute bottom-0 rounded-full"
                style={{
                  left: `${(i * 71) % 100}%`,
                  width: tam,
                  height: tam,
                  background: `radial-gradient(circle at 30% 30%, color-mix(in srgb, ${i % 2 ? "var(--cor-primaria)" : "var(--cor-destaque)"} 70%, white), transparent 70%)`,
                  opacity: 0,
                  animation: `fundo-sobe ${dur(14 + (i % 5) * 4)} linear ${(i * 1.7).toFixed(1)}s infinite`,
                }}
              />
            );
          })}
        </>
      );
    default:
      return (
        <>
          {[
            { cor: "var(--cor-primaria)", x: "10%", y: "5%", t: 22 },
            { cor: "var(--cor-destaque)", x: "55%", y: "40%", t: 28 },
            { cor: "var(--cor-secundaria)", x: "25%", y: "65%", t: 34 },
          ].map((b, i) => (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                left: b.x,
                top: b.y,
                width: "55vmax",
                height: "40vmax",
                background: `radial-gradient(closest-side, color-mix(in srgb, ${b.cor} 60%, transparent), transparent)`,
                filter: "blur(40px)",
                animation: `fundo-deriva ${dur(b.t)} ease-in-out ${i * -6}s infinite`,
              }}
            />
          ))}
        </>
      );
  }
}

/** Fundo da janela escolhido em Temas → Fundo. Fica atrás de tudo e não recebe cliques. */
export function FundoApp() {
  const a = useAparenciaStore((s) => s.aparencia);
  const definirMedia = useAparenciaStore((s) => s.definirMediaMidia);
  const tipo = a.fundo.tipo;
  const urlImagem = useUrlImagem(tipo === "imagem" ? a.fundo.imagem : "");
  const [urlVideo, setUrlVideo] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let vivo = true;
    if (tipo === "video" && a.fundo.video) urlDaMidia(a.fundo.video).then((u) => vivo && setUrlVideo(u)).catch(() => vivo && setUrlVideo(null));
    else setUrlVideo(null);
    return () => {
      vivo = false;
    };
  }, [tipo, a.fundo.video]);

  // Mede a cor média da imagem para o alerta de contraste.
  useEffect(() => {
    if (tipo !== "imagem" || !urlImagem) {
      if (tipo !== "video") definirMedia(null);
      return;
    }
    const img = new Image();
    img.onload = () => definirMedia(medirMedia(img));
    img.onerror = () => definirMedia(null);
    img.src = urlImagem;
  }, [tipo, urlImagem, definirMedia]);

  useEffect(() => {
    if (video.current) video.current.playbackRate = a.fundo.velocidade;
  }, [a.fundo.velocidade, urlVideo]);

  if (tipo === "tema") return null;
  const m = a.fundo.midia;

  return (
    <div aria-hidden className="fundo-animado pointer-events-none fixed inset-0 -z-10 overflow-hidden" style={{ background: "var(--cor-fundo)" }}>
      {tipo === "cor" && <div className="absolute inset-0" style={{ background: a.fundo.cor }} />}
      {tipo === "gradiente" && <div className="absolute inset-0" style={{ background: cssGradiente(a.fundo.gradiente) }} />}
      {tipo === "imagem" && urlImagem && (
        <>
          <div
            className="absolute inset-0"
            style={{
              ...estiloMidia(a),
              backgroundImage: `url("${urlImagem}")`,
              backgroundSize: a.fundo.ajuste === "fill" ? "100% 100%" : a.fundo.ajuste === "repeat" ? "auto" : a.fundo.ajuste,
              backgroundRepeat: a.fundo.ajuste === "repeat" ? "repeat" : "no-repeat",
              backgroundPosition: a.fundo.posicao,
            }}
          />
          <Camada escurecer={m.escurecer} />
        </>
      )}
      {tipo === "video" && urlVideo && (
        <>
          <video
            ref={video}
            src={urlVideo}
            autoPlay
            muted
            loop
            playsInline
            onLoadedData={(e) => definirMedia(medirMedia(e.currentTarget))}
            className="absolute inset-0 h-full w-full"
            style={{ ...estiloMidia(a), objectFit: a.fundo.ajuste === "contain" ? "contain" : a.fundo.ajuste === "fill" ? "fill" : "cover", objectPosition: a.fundo.posicao }}
          />
          <Camada escurecer={m.escurecer} />
        </>
      )}
      {tipo === "animado" && <FundoAnimado a={a} />}
    </div>
  );
}
