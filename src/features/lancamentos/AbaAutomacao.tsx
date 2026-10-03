import { useEffect, useState } from "react";
import { FolderInput, Repeat, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { opcoesCategoria } from "../../services/categorias";
import { extras } from "../../services/extras";
import { dataAtualISO, formatarCentavos } from "../../services/formato";
import { lancExtras, type RegraCategoria } from "../../services/lancamentosExtras";
import { caminhoPastaImportar, importarDaPasta } from "../../services/pastaVigiada";
import { usePreferencia } from "../../state/usePreferencia";
import type { Conta, Lancamento } from "../../types/accounting";
import { detectarAssinaturas } from "./detectores";
import { SecaoMarcas } from "./SecaoMarcas";

interface Props {
  contas: Conta[];
  lancamentos: Lancamento[];
  onAlterado: () => void;
}

/** Regras de categoria, assinaturas detectadas e pasta vigiada de extratos. */
export function AbaAutomacao({ contas, lancamentos, onAlterado }: Props) {
  const [regras, setRegras] = useState<RegraCategoria[]>([]);
  const [padrao, setPadrao] = useState("");
  const categorias = contas.filter((c) => (c.tipo === "DESPESA" || c.tipo === "RECEITA") && c.subtipo !== "CATEGORIA" && c.ativa);
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? "");
  const [pastaLigada, setPastaLigada] = usePreferencia<boolean>("pasta_vigiada", false);
  const [pastaConta, setPastaConta] = usePreferencia<string>("pasta_vigiada_conta", "");
  const [pastaInverter, setPastaInverter] = usePreferencia<boolean>("pasta_vigiada_inverter", false);
  const [caminho, setCaminho] = useState("");
  const [ignoradas, setIgnoradas] = usePreferencia<string[]>("assinaturas_ignoradas", []);
  const contasAtivas = contas.filter((c) => c.tipo === "ATIVO" && c.subtipo !== "CATEGORIA" && c.ativa);
  const nome = new Map(contas.map((c) => [c.id, c.nome]));
  const assinaturas = detectarAssinaturas(lancamentos, contas, dataAtualISO()).filter((a) => !ignoradas.includes(a.marca));

  const recarregarRegras = () => lancExtras.listarRegras().then(setRegras).catch(() => {});
  useEffect(() => {
    recarregarRegras();
    caminhoPastaImportar().then(setCaminho).catch(() => {});
  }, []);

  async function adicionarRegra(ev: React.FormEvent) {
    ev.preventDefault();
    try {
      await lancExtras.salvarRegra(padrao, categoriaId);
      setPadrao("");
      recarregarRegras();
      toast.success("Regra salva.");
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function marcarAssinatura(ids: string[]) {
    try {
      for (const id of ids) {
        const l = lancamentos.find((x) => x.id === id);
        if (l) await extras.atualizarLancamentoInfo(l.id, l.descricao, l.observacao, "ASSINATURA");
      }
      toast.success("Marcado como assinatura.");
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function importarAgora() {
    try {
      const r = await importarDaPasta(true);
      if (!r.arquivos) toast.info(pastaConta ? "Nenhum arquivo novo na pasta." : "Escolha a conta dos extratos primeiro.");
      else toast.success(`${r.arquivos} arquivo(s): ${r.importados} lançamento(s) importado(s), ${r.duplicados} repetido(s) ignorado(s).${r.erros.length ? ` Erros: ${r.erros.join("; ")}` : ""}`, { duration: 9000 });
      if (r.importados) onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Secao titulo={<><Wand2 size={16} className="text-primaria" /> Regras de categoria</>}>
        <p className="text-xs text-texto-secundario">“Se a descrição contém X, a categoria é Y.” Valem no formulário de despesa, na importação de extrato e na pasta vigiada. A importação também aprende regras com as suas correções.</p>
        <form onSubmit={adicionarRegra} className="mt-3 flex flex-wrap gap-2">
          <input value={padrao} onChange={(e) => setPadrao(e.target.value)} placeholder="Contém (ex.: uber)" aria-label="Texto da regra" className={`${CLASSE_INPUT} w-36`} />
          <Select aria-label="Categoria da regra" value={categoriaId} onValueChange={setCategoriaId} options={opcoesCategoria(categorias, contas)} className="min-w-44 flex-1" />
          <Button type="submit" tamanho="pequeno" disabled={padrao.trim().length < 2}>Adicionar</Button>
        </form>
        {regras.length === 0 ? <p className="mt-3 text-sm text-texto-secundario">Nenhuma regra ainda.</p> : (
          <ul className="mt-3 max-h-72 space-y-1 overflow-auto text-sm">
            {regras.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-borda/30">
                <span>“{r.padrao}” → <strong>{nome.get(r.categoria_id) ?? "?"}</strong></span>
                <button onClick={() => lancExtras.excluirRegra(r.id).then(recarregarRegras)} aria-label={`Excluir regra ${r.padrao}`} className="text-texto-secundario hover:text-erro"><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo={<><Repeat size={16} className="text-secundaria" /> Assinaturas detectadas</>}>
        {assinaturas.length === 0 ? (
          <p className="text-sm text-texto-secundario">Nenhuma repetição mensal sem etiqueta encontrada. Quando algo se repetir em 3 meses com valor parecido (Netflix, Spotify…), aparece aqui.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {assinaturas.map((a) => (
              <li key={a.marca} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borda px-3 py-2">
                <span><strong>{a.descricao}</strong> · {formatarCentavos(a.valorMedio)}/mês em {a.meses} meses · {formatarCentavos(a.valorMedio * 12)}/ano</span>
                <span className="flex gap-2">
                  <Button tamanho="pequeno" onClick={() => marcarAssinatura(a.ids)}>Marcar como assinatura</Button>
                  <Button tamanho="pequeno" variante="fantasma" onClick={() => setIgnoradas([...ignoradas, a.marca])}>Não é</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo={<><FolderInput size={16} className="text-destaque" /> Pasta vigiada de extratos</>}>
        <p className="text-xs text-texto-secundario">Jogue arquivos .ofx ou .csv nesta pasta e o Dairus importa sozinho (a cada 30 minutos com o app aberto), aplica as regras de categoria, ignora o que já foi lançado e move o arquivo para “Importados”.</p>
        <p className="mt-2 break-all rounded-md bg-fundo px-2 py-1 font-mono text-[11px] text-texto-primario">{caminho || "…"}</p>
        <div className="mt-3 space-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={pastaLigada} onChange={() => setPastaLigada(!pastaLigada)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Importar sozinho</label>
          <Select aria-label="Conta dos extratos" value={pastaConta} onValueChange={setPastaConta} options={[{ value: "", label: "Escolha a conta dos extratos" }, ...contasAtivas.map((c) => ({ value: c.id, label: c.nome }))]} className="w-full" />
          <label className="flex items-center gap-2 text-xs text-texto-secundario"><input type="checkbox" checked={pastaInverter} onChange={() => setPastaInverter(!pastaInverter)} className="h-4 w-4 accent-[var(--cor-primaria)]" />Inverter sinal (faturas de cartão)</label>
          <div className="flex gap-2">
            <Button tamanho="pequeno" variante="secundaria" onClick={importarAgora}>Importar agora</Button>
            <Button tamanho="pequeno" variante="fantasma" onClick={() => caminho && import("@tauri-apps/plugin-opener").then(({ openPath }) => openPath(caminho))}>Abrir a pasta</Button>
          </div>
        </div>
      </Secao>

      <SecaoMarcas />
    </div>
  );
}
