import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { useWidgetsStore, usePainelAtivo } from "../../state/widgets-store";
import { CatalogoWidgets, Miniatura } from "../dashboard/painel/BarraPaineis";
import { MODELOS, montar, type ModeloPainel } from "../dashboard/layoutWidgets";

function Bloco({ titulo, descricao, children, acao }: { titulo: string; descricao?: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-borda bg-cartao p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-texto-primario">{titulo}</h2>
          {descricao && <p className="text-xs text-texto-secundario">{descricao}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

function CartaoModelo({ m, onUsar, onNovo }: { m: ModeloPainel; onUsar: () => void; onNovo: () => void }) {
  const widgets = useMemo(() => montar(m.itens), [m]);
  return (
    <div className="flex flex-col rounded-xl border border-borda bg-fundo p-3">
      <Miniatura widgets={widgets} />
      <p className="mt-2 text-sm font-semibold text-texto-primario">{m.nome}</p>
      <p className="flex-1 text-[11px] text-texto-secundario">{m.descricao}</p>
      <div className="mt-2 flex gap-2">
        <Button tamanho="pequeno" variante="secundaria" onClick={onNovo}>Criar layout</Button>
        <Button tamanho="pequeno" variante="fantasma" onClick={onUsar} title="Troca os widgets do layout em uso por este modelo">Usar no atual</Button>
      </div>
    </div>
  );
}

/** Aba "Widgets e layout" de Temas e aparência: layouts salvos, modelos, opções e widgets. */
export function PainelWidgets() {
  const { paineis, carregado, carregar, ativar, criar, renomear, excluir, aplicarModelo, alterarOpcoes } = useWidgetsStore();
  const ativo = usePainelAtivo();
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!carregado || !ativo) return null;

  return (
    <div className="space-y-4">
      <Bloco
        titulo="Meus layouts"
        descricao="Monte quantos quiser (ex.: “Visão geral”, “Relatório financeiro”, “Produtividade”) e alterne entre eles no Início. Para mover e redimensionar os widgets, use “Editar layout” no Início."
        acao={<Link to="/" className="inline-flex items-center gap-1 text-xs text-primaria hover:underline"><ExternalLink size={12} /> Arrumar no Início</Link>}
      >
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {paineis.map((p) => (
            <li key={p.id} className={`rounded-xl border p-3 ${p.id === ativo.id ? "border-primaria bg-primaria/5" : "border-borda bg-fundo"}`}>
              <Miniatura widgets={p.widgets} />
              <div className="mt-2 flex items-center justify-between gap-2">
                {renomeando === p.id ? (
                  <input defaultValue={p.nome} autoFocus maxLength={60} onBlur={(e) => { renomear(p.id, e.target.value); setRenomeando(null); }} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} aria-label="Nome do layout" className="min-w-0 flex-1 rounded border border-primaria bg-fundo px-2 py-0.5 text-sm text-texto-primario outline-none" />
                ) : (
                  <p className="min-w-0 truncate text-sm font-semibold text-texto-primario">{p.nome}</p>
                )}
                {p.id === ativo.id ? <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-primaria"><Check size={12} /> em uso</span> : <Button tamanho="pequeno" variante="secundaria" onClick={() => ativar(p.id)}>Usar</Button>}
              </div>
              <p className="text-[11px] text-texto-secundario">{p.widgets.length} widget(s)</p>
              <div className="mt-2 flex gap-1">
                <button onClick={() => setRenomeando(p.id)} aria-label={`Renomear ${p.nome}`} title="Renomear" className="rounded p-1 text-texto-secundario hover:text-primaria"><Pencil size={13} /></button>
                <button onClick={() => criar(`${p.nome} (cópia)`, { copiarDe: p })} aria-label={`Duplicar ${p.nome}`} title="Duplicar" className="rounded p-1 text-texto-secundario hover:text-primaria"><Copy size={13} /></button>
                {paineis.length > 1 && (
                  excluindo === p.id
                    ? <button onClick={() => { excluir(p.id); setExcluindo(null); }} className="rounded px-1.5 text-[11px] font-semibold text-erro hover:underline">Confirmar exclusão</button>
                    : <button onClick={() => setExcluindo(p.id)} aria-label={`Excluir ${p.nome}`} title="Excluir" className="rounded p-1 text-texto-secundario hover:text-erro"><Trash2 size={13} /></button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Bloco>

      <Bloco titulo={`Opções de “${ativo.nome}”`} descricao="Valem para o layout em uso.">
        <div className="space-y-3 text-sm">
          <label className="flex items-center justify-between gap-2 text-texto-primario">
            <span>Encaixar automaticamente <span className="block text-xs text-texto-secundario">Ligado: os widgets sobem para fechar os buracos. Desligado: cada um fica exatamente onde você soltar.</span></span>
            <input type="checkbox" checked={ativo.opcoes.compactar} onChange={() => alterarOpcoes({ compactar: !ativo.opcoes.compactar })} className="h-4 w-4 accent-[var(--cor-primaria)]" />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-texto-primario">Espaço entre widgets</span>
            <div role="radiogroup" aria-label="Espaço entre widgets" className="inline-flex rounded-lg border border-borda p-0.5">
              {(["compacto", "normal", "amplo"] as const).map((v) => (
                <button key={v} role="radio" aria-checked={ativo.opcoes.espaco === v} onClick={() => alterarOpcoes({ espaco: v })} className={`rounded-md px-3 py-1 text-xs capitalize ${ativo.opcoes.espaco === v ? "bg-primaria text-white" : "text-texto-secundario hover:text-texto-primario"}`}>{v}</button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between gap-2 text-texto-primario">Mostrar a barra dos layouts acima dos widgets<input type="checkbox" checked={ativo.opcoes.titulo} onChange={() => alterarOpcoes({ titulo: !ativo.opcoes.titulo })} className="h-4 w-4 accent-[var(--cor-primaria)]" /></label>
        </div>
      </Bloco>

      <Bloco titulo="Modelos prontos" descricao="Crie um layout novo a partir de um modelo, ou troque os widgets do layout em uso.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {MODELOS.map((m) => (
            <CartaoModelo
              key={m.id}
              m={m}
              onNovo={() => { criar(m.nome, { modelo: m }); toast.success(`Layout “${m.nome}” criado e em uso.`); }}
              onUsar={() => { aplicarModelo(m); toast.success(`“${ativo.nome}” agora usa o modelo ${m.nome}.`); }}
            />
          ))}
        </div>
      </Bloco>

      <Bloco titulo={`Widgets de “${ativo.nome}” (${ativo.widgets.length})`} descricao="Clique para adicionar ou tirar. O gráfico personalizável pode entrar várias vezes, cada um com a sua configuração.">
        <CatalogoWidgets />
      </Bloco>
    </div>
  );
}
