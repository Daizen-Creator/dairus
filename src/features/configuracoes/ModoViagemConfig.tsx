import { useEffect, useState } from "react";
import { Plane } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { lerPreferencia } from "../../services/armazenamento";
import { centavosParaValorInput, dataAtualISO, valorInputParaCentavos } from "../../services/formato";
import { definirViagem, tagDaViagem, type Viagem } from "../../services/modoViagem";

export function ModoViagemConfig() {
  const hoje = dataAtualISO();
  const [atual, setAtual] = useState<Viagem | null>(null);
  const [nome, setNome] = useState("");
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState("");
  const [orcamento, setOrcamento] = useState("");

  useEffect(() => {
    lerPreferencia<Viagem>("modo_viagem").then((v) => {
      setAtual(v);
      if (v?.ativo) {
        setNome(v.nome);
        setInicio(v.inicio);
        setFim(v.fim ?? "");
        setOrcamento(v.orcamento_centavos ? centavosParaValorInput(v.orcamento_centavos) : "");
      }
    });
  }, []);

  async function salvar(ativo: boolean) {
    if (ativo && !nome.trim()) return toast.error("Dê um nome para a viagem.");
    if (ativo && fim && fim < inicio) return toast.error("A volta precisa ser depois da ida.");
    const v: Viagem = { ativo, nome: nome.trim() || atual?.nome || "viagem", inicio, fim: fim || null, orcamento_centavos: orcamento ? valorInputParaCentavos(orcamento) : null };
    await definirViagem(v);
    setAtual(v);
    toast.success(ativo ? `Modo viagem ligado: as despesas ganham #${tagDaViagem(v)}.` : "Modo viagem encerrado.");
  }

  return (
    <Secao titulo={<><Plane size={16} className="text-secundaria" /> Modo viagem</>}>
      <p className="text-xs text-texto-secundario">Enquanto ligado, toda despesa nova (inclusive pelo atalho e pela IA) recebe a etiqueta da viagem, e uma faixa no topo mostra quanto já gastou x o orçamento. Desliga sozinho depois da volta. Depois, filtre o histórico ou os relatórios pela etiqueta.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2 text-xs text-texto-secundario">
        <label className="flex flex-col gap-1">Nome<input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Praia 2026" className={`${CLASSE_INPUT} w-40`} /></label>
        <label className="flex flex-col gap-1">Ida<input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={`${CLASSE_INPUT} w-36`} /></label>
        <label className="flex flex-col gap-1">Volta<input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className={`${CLASSE_INPUT} w-36`} /></label>
        <label className="flex flex-col gap-1">Orçamento<input value={orcamento} onChange={(e) => setOrcamento(e.target.value)} inputMode="decimal" placeholder="opcional" className={`${CLASSE_INPUT} w-28`} /></label>
        <Button tamanho="pequeno" onClick={() => salvar(true)}>{atual?.ativo ? "Atualizar" : "Ligar"}</Button>
        {atual?.ativo && <Button tamanho="pequeno" variante="fantasma" onClick={() => salvar(false)}>Encerrar</Button>}
      </div>
    </Secao>
  );
}
