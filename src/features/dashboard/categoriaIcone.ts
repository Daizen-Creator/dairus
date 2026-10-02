import {
  Banknote,
  Car,
  CreditCard,
  Droplets,
  Dumbbell,
  Film,
  GraduationCap,
  HeartPulse,
  Home,
  Music,
  Receipt,
  Shirt,
  ShoppingCart,
  Sparkles,
  Ticket,
  UtensilsCrossed,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Conta, Lancamento } from "../../types/accounting";
import { bateAlguma, normalizar } from "./marcas";

const MAPA: Array<{ contem: string; icone: LucideIcon; cor: string }> = [
  { contem: "salário", icone: Banknote, cor: "#00d395" },
  { contem: "benefíc", icone: Receipt, cor: "#00d395" },
  { contem: "renda extra", icone: Banknote, cor: "#00d395" },
  { contem: "educação", icone: GraduationCap, cor: "#a855f7" },
  { contem: "alimentação", icone: UtensilsCrossed, cor: "#f59e0b" },
  { contem: "transporte", icone: Car, cor: "#1677ff" },
  { contem: "lazer", icone: Film, cor: "#ec4899" },
  { contem: "moradia", icone: Home, cor: "#eab308" },
  { contem: "saúde", icone: HeartPulse, cor: "#f43f5e" },
  { contem: "vestuário", icone: Shirt, cor: "#00d9ff" },
];

/** Ícone "da coisa": reconhece pelo nome do lançamento serviços e itens
 * comuns (Claude, Uber, Netflix, Internet…). Sem logotipos de marca —
 * só ícones genéricos com a cor típica de cada coisa. */
const PALAVRAS: Array<{ palavras: string[]; icone: LucideIcon; cor: string }> = [
  { palavras: ["claude", "anthropic", "chatgpt", "openai", "gemini", "copilot"], icone: Sparkles, cor: "#d97757" },
  { palavras: ["uber", "99", "taxi", "onibus", "metro", "passagem", "gasolina", "combustivel"], icone: Car, cor: "#1677ff" },
  { palavras: ["netflix", "prime video", "disney", "hbo", "cinema", "filme"], icone: Film, cor: "#f43f5e" },
  { palavras: ["spotify", "deezer", "youtube music", "musica"], icone: Music, cor: "#00d395" },
  { palavras: ["internet", "wifi", "wi-fi", "fibra", "claro", "vivo", "tim", "oi "], icone: Wifi, cor: "#7c3aed" },
  { palavras: ["luz", "energia", "eletric", "enel", "cemig"], icone: Zap, cor: "#eab308" },
  { palavras: ["agua", "saneamento", "sabesp"], icone: Droplets, cor: "#00a8ff" },
  { palavras: ["academia", "gym", "smart fit", "treino"], icone: Dumbbell, cor: "#a855f7" },
  { palavras: ["mercado", "supermercado", "atacado", "feira", "padaria"], icone: ShoppingCart, cor: "#f59e0b" },
  { palavras: ["ifood", "restaurante", "lanche", "pizza", "almoco", "jantar"], icone: UtensilsCrossed, cor: "#f97316" },
  { palavras: ["faculdade", "mensalidade", "curso", "escola", "livro", "material"], icone: GraduationCap, cor: "#a855f7" },
  { palavras: ["cartao", "fatura", "nubank", "credito"], icone: CreditCard, cor: "#8a8aff" },
  { palavras: ["vale-alimentacao", "vale alimentacao", "vale refeicao", "beneficio", "vr", "va "], icone: Ticket, cor: "#00d395" },
  { palavras: ["salario", "pagamento", "renda"], icone: Banknote, cor: "#00d395" },
  { palavras: ["farmacia", "remedio", "consulta", "medico", "dentista", "saude"], icone: HeartPulse, cor: "#f43f5e" },
  { palavras: ["aluguel", "condominio", "casa", "moradia"], icone: Home, cor: "#eab308" },
  { palavras: ["roupa", "tenis", "sapato", "camisa"], icone: Shirt, cor: "#00d9ff" },
];

export function iconeDaDescricao(descricao: string): { icone: LucideIcon; cor: string } | null {
  const texto = normalizar(descricao);
  const achou = PALAVRAS.find((p) => bateAlguma(texto, p.palavras));
  return achou ? { icone: achou.icone, cor: achou.cor } : null;
}

export interface CategoriaLancamento {
  nome: string;
  icone: LucideIcon;
  cor: string;
  /** Tipo da conta de categoria (Receita/Despesa); null em transferências e saldos iniciais. */
  tipo: "RECEITA" | "DESPESA" | null;
}

export function categoriaDoLancamento(l: Lancamento, contas: Conta[]): CategoriaLancamento {
  const contaPorId = new Map(contas.map((c) => [c.id, c]));
  const partidaCategoria = l.partidas.find((p) => {
    const conta = contaPorId.get(p.conta_id);
    return conta?.tipo === "RECEITA" || conta?.tipo === "DESPESA";
  });
  const conta = partidaCategoria ? contaPorId.get(partidaCategoria.conta_id) : undefined;
  const nome = conta?.nome ?? "Outros";
  const entrada = MAPA.find((m) => nome.toLowerCase().includes(m.contem));
  return {
    nome,
    icone: entrada?.icone ?? Receipt,
    cor: entrada?.cor ?? "#71717a",
    tipo: conta ? (conta.tipo as "RECEITA" | "DESPESA") : null,
  };
}

/** Ícone e cor de uma categoria pelo nome (Alimentação, Transporte…). */
export function iconeDaCategoria(nome: string): { icone: LucideIcon; cor: string } {
  const entrada = MAPA.find((m) => nome.toLowerCase().includes(m.contem));
  return { icone: entrada?.icone ?? Receipt, cor: entrada?.cor ?? "#71717a" };
}
