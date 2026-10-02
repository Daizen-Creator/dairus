import type { LucideIcon } from "lucide-react";
import { Receipt } from "lucide-react";
import { iconeDaDescricao } from "../../features/dashboard/categoriaIcone";
import { marcaDaDescricao } from "../../features/dashboard/marcas";
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
    return (
      <span
        className={`flex shrink-0 items-center justify-center bg-white ${raio}`}
        style={{ width: tamanho, height: tamanho, boxShadow: "0 0 10px -3px rgba(255,255,255,.5)" }}
        aria-hidden
      >
        <img src={marca} alt="" width={Math.round(tamanho * 0.66)} height={Math.round(tamanho * 0.66)} draggable={false} />
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
