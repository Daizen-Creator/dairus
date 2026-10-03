import { useState } from "react";
import { BarChart3, Calculator, ChartCandlestick, Coins, FileDown, PiggyBank, Receipt, Settings2, Sparkles, WalletMinimal } from "lucide-react";
import { toast } from "sonner";
import { Abas, useAbaDaPagina } from "../../components/ui/Abas";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Skeleton } from "../../components/ui/Skeleton";
import { extras } from "../../services/extras";
import { usePreferencia } from "../../state/usePreferencia";
import { useAuthStore, dadosDoUsuario } from "../../state/auth-store";
import { AbaCarteira } from "./AbaCarteira";
import { AbaIAInvest } from "./AbaIAInvest";
import { AbaImpostos } from "./AbaImpostos";
import { AbaLancar } from "./AbaLancar";
import { AbaMercado, AbaProventos } from "./AbaProventosMercado";
import { AbaSimuladores } from "./AbaSimuladores";
import { gerarPdfInvestimentos } from "./relatorioInvestimentos";
import { useCarteira } from "./useCarteira";

type Aba = "carteira" | "lancar" | "proventos" | "mercado" | "simuladores" | "impostos" | "ia" | "configurar";

export function InvestimentosPage() {
  const carteira = useCarteira();
  const [aba, setAba] = useAbaDaPagina<Aba>("investimentos", "carteira");
  const sessao = useAuthStore((s) => s.sessao);

  async function pdfDoMes() {
    try {
      const mes = carteira.hoje.slice(0, 7);
      const bytes = gerarPdfInvestimentos(carteira, mes, dadosDoUsuario(sessao).nome || "Titular");
      const caminho = await extras.salvarExportacaoBinaria(`investimentos-${mes}.pdf`, bytes);
      const { openPath } = await import("@tauri-apps/plugin-opener");
      await openPath(caminho).catch(() => {});
      toast.success(`PDF salvo em ${caminho}`, { duration: 8000 });
    } catch (e) {
      toast.error(String(e));
    }
  }

  if (carteira.carregando) return <Skeleton className="h-72 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-texto-primario"><ChartCandlestick size={22} className="text-primaria" /> Investimentos</h1>
        <Button tamanho="pequeno" variante="secundaria" onClick={pdfDoMes}><FileDown size={13} /> Relatório do mês (PDF)</Button>
      </div>
      {carteira.erro && <p className="text-sm text-erro">{carteira.erro}</p>}
      <Abas
        ativa={aba}
        onChange={setAba}
        abas={[
          { id: "carteira", rotulo: "Carteira", icone: WalletMinimal },
          { id: "lancar", rotulo: "Lançar", icone: Coins },
          { id: "proventos", rotulo: "Proventos", icone: PiggyBank },
          { id: "mercado", rotulo: "Mercado", icone: BarChart3 },
          { id: "simuladores", rotulo: "Simuladores", icone: Calculator },
          { id: "impostos", rotulo: "Impostos", icone: Receipt },
          { id: "ia", rotulo: "IA", icone: Sparkles },
          { id: "configurar", rotulo: "Configurar", icone: Settings2 },
        ]}
      />
      {aba === "carteira" && <AbaCarteira carteira={carteira} />}
      {aba === "lancar" && <AbaLancar carteira={carteira} />}
      {aba === "proventos" && <AbaProventos carteira={carteira} />}
      {aba === "mercado" && <AbaMercado carteira={carteira} />}
      {aba === "simuladores" && <AbaSimuladores carteira={carteira} />}
      {aba === "impostos" && <AbaImpostos carteira={carteira} />}
      {aba === "ia" && <AbaIAInvest carteira={carteira} />}
      {aba === "configurar" && <AbaConfigurar />}
    </div>
  );
}

function AbaConfigurar() {
  const [token, setToken] = usePreferencia<string>("brapi_token", "");
  const [rascunho, setRascunho] = useState<string | null>(null);
  const [diaAporte, setDiaAporte] = usePreferencia<number>("invest_dia_aporte", 0);
  const [valorAporte, setValorAporte] = usePreferencia<string>("invest_valor_aporte", "");
  const [autoCotacoes, setAutoCotacoes] = usePreferencia<boolean>("invest_cotacoes_auto", true);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Secao titulo="Cotações da bolsa (brapi)">
        <p className="text-sm text-texto-secundario">Sem token, a brapi libera poucas consultas e alguns ativos. Crie um token gratuito em brapi.dev e cole aqui para cotações de todos os ativos, histórico e dividendos.</p>
        <form onSubmit={(e) => { e.preventDefault(); setToken((rascunho ?? token).trim()); setRascunho(null); toast.success("Token salvo."); }} className="mt-3 flex gap-2">
          <input type="password" value={rascunho ?? token} onChange={(e) => setRascunho(e.target.value)} placeholder="Token da brapi" aria-label="Token da brapi" className={`${CLASSE_INPUT} flex-1`} />
          <Button type="submit" tamanho="pequeno">Salvar</Button>
        </form>
        <label className="mt-3 flex items-center gap-2 text-sm text-texto-primario"><input type="checkbox" checked={autoCotacoes} onChange={() => setAutoCotacoes(!autoCotacoes)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Atualizar cotações sozinho (a cada 30 minutos, com o app aberto)</label>
      </Secao>
      <Secao titulo="Lembrete de aporte mensal">
        <p className="text-sm text-texto-secundario">No dia escolhido (ex.: o dia em que o salário entra), o Windows avisa para fazer o aporte.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-texto-secundario">
          <label>Dia do mês (0 = desligado)<input type="number" min={0} max={31} value={diaAporte} onChange={(e) => setDiaAporte(Math.max(0, Math.min(31, Number(e.target.value) || 0)))} className={`${CLASSE_INPUT} mt-1 w-full`} /></label>
          <label>Valor planejado (R$)<input value={valorAporte} onChange={(e) => setValorAporte(e.target.value)} inputMode="decimal" className={`${CLASSE_INPUT} mt-1 w-full`} /></label>
        </div>
      </Secao>
      <Secao titulo="Alertas automáticos">
        <p className="text-sm text-texto-secundario">Com o app aberto (ou na bandeja), o Dairus avisa no Windows quando um ativo chega ao preço de alerta definido no cadastro e quando um título de renda fixa vence em 30, 7 e 1 dia(s).</p>
      </Secao>
      <Secao titulo="Backup e sincronização">
        <p className="text-sm text-texto-secundario">A carteira fica no mesmo banco do resto do Dairus: entra nos backups, na sincronização entre computadores e na criptografia, sem configuração extra.</p>
      </Secao>
    </div>
  );
}
