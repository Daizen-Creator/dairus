import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownUp, Bell, Cloud, Landmark, PartyPopper, Sparkles, WalletCards } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { lerPreferencia, salvarPreferencia } from "../../services/armazenamento";

export const EVENTO_TUTORIAL = "dairus:tutorial";

const PASSOS = [
  { icone: PartyPopper, titulo: "Bem-vindo ao Dairus", texto: "Seu controle financeiro fica neste computador, com contabilidade de verdade por trás (cada real que sai de um lugar entra em outro). Em 1 minuto mostramos o essencial." },
  { icone: Landmark, titulo: "1. Cadastre suas contas", texto: "Em Contas Bancárias e Cartões, cadastre onde está seu dinheiro com o saldo de hoje. Os saldos passam a mudar sozinhos a cada lançamento.", rota: "/contas-bancarias" },
  { icone: ArrowDownUp, titulo: "2. Lance gastos e receitas", texto: "Em Despesas e Receitas, ou de qualquer lugar com Ctrl+Alt+D. Dá para importar o extrato do banco, agendar contas fixas e, com a IA, lançar escrevendo, por foto ou por voz.", rota: "/lancamentos" },
  { icone: WalletCards, titulo: "3. Planeje", texto: "Orçamento com limites por categoria, metas com prazo e previsão de saldo dos próximos 90 dias. O Dairus pode montar o orçamento pela sua média.", rota: "/orcamento" },
  { icone: Bell, titulo: "4. Deixe o Dairus trabalhar", texto: "Ele avisa no Windows antes das contas vencerem, quando a fatura fecha, se o orçamento estourar e se o saldo vai ficar negativo. Também gera o resumo da semana e o PDF do mês." },
  { icone: Cloud, titulo: "5. Proteja seus dados", texto: "Ligue o backup automático e a sincronização com a nuvem em Backup e Segurança. Se quiser, criptografe o banco com senha.", rota: "/backup" },
  { icone: Sparkles, titulo: "Pronto!", texto: "A lista de Primeiros passos no Início mostra o que falta. Dúvidas? Abra a Ajuda (no menu) ou pergunte à IA “como faço…”." },
];

/** Tutorial de primeiro uso (aparece uma vez; pode ser refeito em Ajuda ou Configurações). */
export function Tutorial() {
  const [aberto, setAberto] = useState(false);
  const [i, setI] = useState(0);
  const navegar = useNavigate();

  useEffect(() => {
    // Só abre sozinho para quem está começando (sem lançamentos); os demais acham em Ajuda.
    lerPreferencia<boolean>("tutorial_visto").then(async (visto) => {
      if (visto) return;
      const { contabilidade } = await import("../../services/contabilidade");
      const ls = await contabilidade.listarLancamentos(1).catch(() => [1]);
      if (ls.length === 0) setAberto(true);
      else salvarPreferencia("tutorial_visto", true);
    });
    const abrir = () => { setI(0); setAberto(true); };
    window.addEventListener(EVENTO_TUTORIAL, abrir);
    return () => window.removeEventListener(EVENTO_TUTORIAL, abrir);
  }, []);

  function fechar(rota?: string) {
    setAberto(false);
    salvarPreferencia("tutorial_visto", true);
    if (rota) navegar(rota);
  }

  if (!aberto) return null;
  const p = PASSOS[i];
  const Icone = p.icone;
  const ultimo = i === PASSOS.length - 1;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Tutorial do Dairus">
      <div className="w-full max-w-md rounded-2xl border border-borda bg-superficie p-6 shadow-2xl">
        <Icone size={32} className="text-primaria" />
        <h2 className="mt-3 text-lg font-semibold text-texto-primario">{p.titulo}</h2>
        <p className="mt-2 text-sm leading-relaxed text-texto-secundario">{p.texto}</p>
        <div className="mt-4 flex gap-1">{PASSOS.map((_, k) => <span key={k} className={`h-1.5 flex-1 rounded-full ${k <= i ? "bg-primaria" : "bg-borda"}`} />)}</div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button onClick={() => fechar()} className="text-xs text-texto-secundario hover:underline">{ultimo ? "Fechar" : "Pular tutorial"}</button>
          <div className="flex gap-2">
            {i > 0 && <Button variante="fantasma" tamanho="pequeno" onClick={() => setI(i - 1)}>Voltar</Button>}
            {"rota" in p && p.rota && <Button variante="secundaria" tamanho="pequeno" onClick={() => fechar(p.rota)}>Ir agora</Button>}
            {!ultimo ? <Button tamanho="pequeno" onClick={() => setI(i + 1)}>Próximo</Button> : <Button tamanho="pequeno" onClick={() => fechar("/")}>Começar</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}
