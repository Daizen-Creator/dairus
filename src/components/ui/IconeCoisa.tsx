import type { LucideIcon } from "lucide-react";
import { Receipt } from "lucide-react";
import { iconeDaDescricao } from "../../features/dashboard/categoriaIcone";
import { corDoTextoSobre, logoTransparente, marcaDaDescricao, marcaSvgDaDescricao } from "../../features/dashboard/marcas";
import { brilhoDeCor, degradeDeCor } from "../../services/gradientes";

interface IconeCoisaProps {
  /** Nome da coisa (descrição do lançamento, nome da conta, do cartão…). */
  nome: string;
  /** Usado quando não há logo nem ícone específico para o nome. */
  padrao?: { icone: LucideIcon; cor: string };
  tamanho?: number;
  redondo?: boolean;
}

/** Mostra, nesta ordem: o logo da marca (se o nome for reconhecido), um
 * ícone específico da coisa (internet, academia, uber…) ou o ícone padrão. */
export function IconeCoisa({ nome, padrao, tamanho = 28, redondo = false }: IconeCoisaProps) {
  const raio = redondo ? "rounded-full" : "rounded-lg";
  const marca = marcaDaDescricao(nome);

  if (marca) {
    // Ícones de app (com fundo próprio) preenchem o espaço todo, sem moldura branca;
    // logos transparentes ficam sobre um fundo escuro discreto.
    const transparente = logoTransparente(marca);
    return (
      <span
        className={`flex shrink-0 items-center justify-center overflow-hidden ${raio}`}
        style={{
          width: tamanho,
          height: tamanho,
          backgroundColor: transparente ? "color-mix(in srgb, var(--cor-superficie) 85%, white)" : undefined,
          boxShadow: "0 4px 12px -4px rgba(0,0,0,.55)",
        }}
        aria-hidden
      >
        <img
          src={marca}
          alt=""
          draggable={false}
          className={transparente ? "object-contain" : "h-full w-full object-cover"}
          style={transparente ? { width: Math.round(tamanho * 0.68), height: Math.round(tamanho * 0.68) } : undefined}
        />
      </span>
    );
  }

  const svg = marcaSvgDaDescricao(nome);
  if (svg) {
    const fundo = `#${svg.cor}`;
    const frente = corDoTextoSobre(svg.cor);
    return (
      <span
        className={`flex shrink-0 items-center justify-center font-bold ${raio}`}
        style={{ width: tamanho, height: tamanho, backgroundColor: fundo, color: frente, boxShadow: "0 4px 12px -4px rgba(0,0,0,.55)", fontSize: Math.round(tamanho * (svg.texto && svg.texto.length > 2 ? 0.3 : 0.42)) }}
        aria-hidden
        title={svg.titulo}
      >
        {svg.path ? (
          <svg viewBox="0 0 24 24" width={Math.round(tamanho * 0.58)} height={Math.round(tamanho * 0.58)} fill="currentColor"><path d={svg.path} /></svg>
        ) : (
          <span className="leading-none">{svg.texto}</span>
        )}
      </span>
    );
  }

  const alvo = iconeDaDescricao(nome) ?? padrao ?? { icone: Receipt, cor: "#71717a" };
  const Icone = alvo.icone;
  return (
    <span
      className={`flex shrink-0 items-center justify-center text-white ${raio}`}
      style={{ width: tamanho, height: tamanho, backgroundImage: degradeDeCor(alvo.cor), boxShadow: brilhoDeCor(alvo.cor) }}
      aria-hidden
    >
      <Icone size={Math.round(tamanho * 0.5)} strokeWidth={2.2} />
    </span>
  );
}
