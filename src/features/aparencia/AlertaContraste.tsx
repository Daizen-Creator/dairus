import { AlertTriangle, CheckCircle2, Wand2 } from "lucide-react";
import { useAparenciaStore } from "../../state/aparencia-store";
import { useThemeStore } from "../../state/theme-store";
import { aplicarCamada, avaliarContraste, escurecerParaContraste, hexParaRgb, luminancia, rgbParaHex, corCssParaRgba, type Aparencia, type ParcialProfunda } from "./aparencia";

/** Sugere a menor mudança que deixa o texto legível (≥ 4,5:1) para o tipo de fundo atual. */
export function correcaoDeContraste(a: Aparencia, texto: [number, number, number], fundoTema: string, mediaMidia: [number, number, number] | null): ParcialProfunda<Aparencia> | null {
  const f = a.fundo;
  const textoClaro = luminancia(texto) > 0.4;
  if (f.tipo === "imagem" || f.tipo === "video") {
    const base = mediaMidia ?? hexParaRgb(fundoTema);
    const e = escurecerParaContraste(base, texto);
    return e === null ? null : { fundo: { midia: { escurecer: e, opacidade: Math.max(f.midia.opacidade, 0.9) } }, formas: { opacidadeCartoes: Math.max(a.formas.opacidadeCartoes, 0.75) } };
  }
  if (f.tipo === "cor") {
    const e = escurecerParaContraste(hexParaRgb(f.cor), texto);
    return e === null ? null : { fundo: { cor: rgbParaHex(aplicarCamada(hexParaRgb(f.cor), e)) } };
  }
  if (f.tipo === "gradiente") {
    const pior = f.gradiente.paradas.map((p) => hexParaRgb(p.cor)).sort((x, y) => (textoClaro ? luminancia(y) - luminancia(x) : luminancia(x) - luminancia(y)))[0];
    const e = escurecerParaContraste(pior, texto);
    return e === null ? null : { fundo: { gradiente: { ...f.gradiente, paradas: f.gradiente.paradas.map((p) => ({ ...p, cor: rgbParaHex(aplicarCamada(hexParaRgb(p.cor), e)) })) } } };
  }
  return { formas: { opacidadeCartoes: 1 } };
}

/** Faixa no topo das abas de aparência: avisa quando o texto fica difícil de ler. */
export function AlertaContraste() {
  const a = useAparenciaStore((s) => s.aparencia);
  const media = useAparenciaStore((s) => s.mediaMidia);
  const alterar = useAparenciaStore((s) => s.alterar);
  const tema = useThemeStore((s) => s.temaAtivo());
  const r = avaliarContraste(a, { fundo: tema.cores.fundo, cartao: tema.cores.cartao, texto: tema.cores.textoPrimario, textoSecundario: tema.cores.textoSecundario }, media);
  const fmt = (v: number) => `${v.toFixed(1).replace(".", ",")}:1`;
  const ok = r.pior >= 4.5 && r.secundario >= 3;

  if (ok) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-sucesso/30 bg-sucesso/10 px-3 py-2 text-xs text-texto-primario" role="status">
        <CheckCircle2 size={15} className="shrink-0 text-sucesso" />
        Contraste {r.nivel} (WCAG): texto sobre o fundo {fmt(r.sobreFundo)}, dentro dos cartões {fmt(r.sobreCartao)}. Fácil de ler.
      </p>
    );
  }
  const texto = (corCssParaRgba(tema.cores.textoPrimario) ?? [255, 255, 255, 1]).slice(0, 3) as [number, number, number];
  const correcao = correcaoDeContraste(a, texto, /^#/.test(tema.cores.fundo) ? tema.cores.fundo : "#000000", media);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-alerta/40 bg-alerta/10 px-3 py-2 text-xs text-texto-primario" role="alert">
      <AlertTriangle size={15} className="shrink-0 text-alerta" />
      <span className="min-w-0 flex-1">
        <strong>Texto difícil de ler.</strong> Contraste sobre o fundo {fmt(r.sobreFundo)}, nos cartões {fmt(r.sobreCartao)}, legendas {fmt(r.secundario)}. O mínimo recomendado (WCAG AA) é 4,5:1
        {a.fundo.tipo === "imagem" || a.fundo.tipo === "video" ? ": escureça a imagem ou deixe os cartões menos transparentes." : a.fundo.tipo === "tema" ? ": deixe os cartões menos transparentes." : ": use uma cor de fundo mais escura (ou mais clara) ou troque o modo claro/escuro."}
      </span>
      {correcao && (
        <button type="button" onClick={() => alterar(correcao)} className="flex items-center gap-1 rounded-lg bg-alerta px-2.5 py-1 font-medium text-white hover:opacity-90">
          <Wand2 size={12} /> Corrigir para mim
        </button>
      )}
    </div>
  );
}
