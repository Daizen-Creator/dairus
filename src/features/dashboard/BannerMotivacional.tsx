import { ArrowRight, Mountain } from "lucide-react";
import { Link } from "react-router-dom";

/** Banner inferior: paisagem de montanhas ao pôr do sol (SVG próprio, sem
 * imagem externa — o app continua 100% offline) + frase motivacional. */
export function BannerMotivacional() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-borda" style={{ background: "var(--cor-cartao)" }}>
      <svg
        aria-hidden
        className="absolute inset-y-0 left-0 h-full w-[46%]"
        viewBox="0 0 400 100"
        preserveAspectRatio="xMinYMax slice"
        style={{ maskImage: "linear-gradient(90deg, #000 0%, #000 55%, transparent 100%)", WebkitMaskImage: "linear-gradient(90deg, #000 0%, #000 55%, transparent 100%)" }}
      >
        <defs>
          <linearGradient id="ceu-banner" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "color-mix(in srgb, var(--cor-fundo) 80%, var(--cor-primaria))" }} />
            <stop offset="55%" style={{ stopColor: "color-mix(in srgb, var(--cor-destaque) 70%, var(--cor-fundo))" }} />
            <stop offset="100%" style={{ stopColor: "color-mix(in srgb, var(--cor-erro) 60%, var(--cor-destaque))" }} />
          </linearGradient>
          <linearGradient id="montanha-fundo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "color-mix(in srgb, var(--cor-primaria) 38%, var(--cor-fundo))" }} />
            <stop offset="100%" style={{ stopColor: "var(--cor-fundo)" }} />
          </linearGradient>
          <linearGradient id="montanha-frente" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "color-mix(in srgb, var(--cor-destaque) 28%, var(--cor-fundo))" }} />
            <stop offset="100%" style={{ stopColor: "var(--cor-fundo)" }} />
          </linearGradient>
        </defs>
        <rect width="400" height="100" fill="url(#ceu-banner)" />
        <circle cx="300" cy="62" r="22" fill="#ffd0a8" opacity="0.18" />
        <polygon points="0,100 0,58 40,34 70,52 115,18 160,50 200,36 250,64 300,40 350,62 400,48 400,100" fill="url(#montanha-fundo)" />
        <polygon points="0,100 0,76 55,50 95,70 140,44 190,72 235,56 290,80 340,62 400,78 400,100" fill="url(#montanha-frente)" />
        <g fill="#fff" opacity="0.7">
          <circle cx="40" cy="12" r="0.9" /><circle cx="120" cy="8" r="0.7" /><circle cx="210" cy="14" r="0.8" />
          <circle cx="260" cy="6" r="0.7" /><circle cx="170" cy="20" r="0.6" />
        </g>
      </svg>

      <div className="relative flex flex-col items-start justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3 sm:ml-[30%]">
          <Mountain size={20} className="shrink-0 text-texto-primario" />
          <div>
            <p className="font-semibold text-texto-primario">Disciplina hoje, liberdade amanhã.</p>
            <p className="text-sm text-texto-secundario">Pequenas decisões financeiras constroem grandes resultados.</p>
          </div>
        </div>
        <Link
          to="/patrimonio"
          className="flex shrink-0 items-center gap-2 rounded-lg border px-5 py-2 text-sm font-medium text-white transition-[transform,filter] duration-150 [transition-timing-function:var(--ease-out)] hover:brightness-125 active:scale-[0.97]"
          style={{
            borderColor: "color-mix(in srgb, var(--cor-destaque) 65%, transparent)",
            backgroundImage:
              "linear-gradient(135deg, color-mix(in srgb, var(--cor-destaque) 38%, var(--cor-fundo)), color-mix(in srgb, var(--cor-primaria) 22%, var(--cor-fundo)))",
            boxShadow: "0 4px 20px -6px var(--cor-destaque)",
          }}
        >
          Ver mais detalhes <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
