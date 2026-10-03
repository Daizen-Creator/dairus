import {
  LayoutDashboard,
  Calculator,
  Landmark,
  CreditCard,
  ArrowDownUp,
  WalletCards,
  Target,
  Building2,
  ChartCandlestick,
  Users,
  BadgeDollarSign,
  Radar,
  ChartNoAxesCombined,
  Sparkles,
  ShieldCheck,
  Settings,
  CircleHelp,
  type LucideIcon,
} from "lucide-react";

export interface ItemNavegacao {
  rota: string;
  rotulo: string;
  icone: LucideIcon;
  tag?: "IA";
}

export const NAVEGACAO: ItemNavegacao[] = [
  { rota: "/", rotulo: "Dashboard", icone: LayoutDashboard },
  { rota: "/contas-bancarias", rotulo: "Contas Bancárias", icone: Landmark },
  { rota: "/cartoes", rotulo: "Cartões de Crédito", icone: CreditCard },
  { rota: "/lancamentos", rotulo: "Despesas e Receitas", icone: ArrowDownUp },
  {
    rota: "/orcamento",
    rotulo: "Orçamento",
    icone: WalletCards,
  },
  {
    rota: "/metas",
    rotulo: "Metas Financeiras",
    icone: Target,
  },
  {
    rota: "/patrimonio",
    rotulo: "Patrimônio",
    icone: Building2,
  },
  { rota: "/investimentos", rotulo: "Investimentos", icone: ChartCandlestick, tag: "IA" },
  { rota: "/pessoas", rotulo: "Pessoas e Divisões", icone: Users },
  { rota: "/salario", rotulo: "Salário e Renda", icone: BadgeDollarSign },
  {
    rota: "/contabilidade",
    rotulo: "Contabilidade",
    icone: Calculator,
  },
  {
    rota: "/relatorios",
    rotulo: "Relatórios",
    icone: ChartNoAxesCombined,
  },
  {
    rota: "/ia",
    rotulo: "Inteligência Artificial",
    icone: Sparkles,
    tag: "IA",
  },
  {
    rota: "/radar",
    rotulo: "Radar de Compras",
    icone: Radar,
  },
  { rota: "/configuracoes", rotulo: "Configurações", icone: Settings },
  {
    rota: "/backup",
    rotulo: "Backup e Segurança",
    icone: ShieldCheck,
  },
  { rota: "/ajuda", rotulo: "Ajuda", icone: CircleHelp },
];
