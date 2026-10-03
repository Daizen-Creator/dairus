import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, PanelLeft, PanelTop, RotateCcw } from "lucide-react";
import { NAVEGACAO } from "../../app/navegacao";
import { useAparenciaStore } from "../../state/aparencia-store";
import { usePreferencia } from "../../state/usePreferencia";
import { CORES_DESTAQUE, ordenarPorPreferencia } from "./aparencia";
import { Alternar, Bloco, Faixa, Linha, Opcoes, SeletorCor } from "./Controles";

/** Move o item `de` para a posição `para` (usado pelo arrastar e pelas setas). */
export function moverItem<T>(lista: T[], de: number, para: number): T[] {
  if (de === para || de < 0 || para < 0 || de >= lista.length || para >= lista.length) return lista;
  const nova = [...lista];
  const [item] = nova.splice(de, 1);
  nova.splice(para, 0, item);
  return nova;
}

function CorOpcional({ rotulo, valor, padrao, onChange }: { rotulo: string; valor: string | null; padrao: string; onChange: (v: string | null) => void }) {
  return (
    <Linha rotulo={rotulo} ajuda={valor ? undefined : "Usando a cor do tema"}>
      <SeletorCor rotulo={rotulo} valor={valor ?? padrao} onChange={onChange} sugestoes={CORES_DESTAQUE.slice(0, 6)} />
      {valor && <button type="button" onClick={() => onChange(null)} className="text-xs text-texto-secundario hover:underline">a do tema</button>}
    </Linha>
  );
}

export function PainelMenu() {
  const menu = useAparenciaStore((s) => s.aparencia.menu);
  const alterar = useAparenciaStore((s) => s.alterar);
  const [ocultos, setOcultos] = usePreferencia<string[]>("menu_oculto", []);
  const itens = ordenarPorPreferencia(NAVEGACAO, menu.ordem);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const corTema = getComputedStyle(document.documentElement).getPropertyValue("--cor-primaria").trim() || "#1677ff";
  const corSuperficie = getComputedStyle(document.documentElement).getPropertyValue("--cor-superficie").trim() || "#0b1020";

  const salvarOrdem = (lista: typeof itens) => alterar({ menu: { ordem: lista.map((i) => i.rota) } });

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <Bloco titulo="Posição e comportamento">
          <Linha rotulo="Onde fica o menu">
            <Opcoes rotulo="Posição do menu" valor={menu.layout} onChange={(layout) => alterar({ menu: { layout } })} opcoes={[{ valor: "lateral", rotulo: "Lateral", icone: <PanelLeft size={13} /> }, { valor: "superior", rotulo: "Superior", icone: <PanelTop size={13} /> }]} />
          </Linha>
          <Linha rotulo="Estado" ajuda={menu.modo === "gaveta" ? "Fica escondido: abra pelo botão ☰ no canto de cima." : menu.modo === "recolhido" ? "Só os ícones, para sobrar espaço." : "Sempre aberto."}>
            <Opcoes rotulo="Estado do menu" valor={menu.modo} onChange={(modo) => alterar({ menu: { modo } })} opcoes={[{ valor: "fixo", rotulo: "Fixo" }, { valor: "recolhido", rotulo: "Só ícones" }, { valor: "gaveta", rotulo: "Gaveta (esconder)" }]} />
          </Linha>
          <Linha rotulo="Itens mostram">
            <Opcoes rotulo="Estilo dos itens" valor={menu.itens} onChange={(itensV) => alterar({ menu: { itens: itensV } })} opcoes={[{ valor: "ambos", rotulo: "Ícone + texto" }, { valor: "icones", rotulo: "Só ícones" }, { valor: "texto", rotulo: "Só texto" }]} />
          </Linha>
          {menu.layout === "lateral" && <Faixa rotulo="Largura do menu aberto" valor={menu.largura} min={200} max={320} formato={(v) => `${v}px`} onChange={(largura) => alterar({ menu: { largura } })} />}
        </Bloco>

        <Bloco titulo="Cores e efeito">
          <Alternar rotulo="Vidro fosco" ajuda="Desfoca o que está atrás do menu e da barra de cima (fica bonito com fundo de imagem)." ligado={menu.vidro} onChange={(vidro) => alterar({ menu: { vidro, opacidade: vidro && menu.opacidade === 1 ? 0.55 : menu.opacidade } })} />
          <Faixa rotulo="Opacidade do menu" valor={Math.round(menu.opacidade * 100)} min={20} max={100} formato={(v) => `${v}%`} onChange={(v) => alterar({ menu: { opacidade: v / 100 } })} />
          <CorOpcional rotulo="Fundo do menu" valor={menu.corFundo} padrao={corSuperficie.startsWith("#") ? corSuperficie : "#0b1020"} onChange={(corFundo) => alterar({ menu: { corFundo } })} />
          <CorOpcional rotulo="Item selecionado" valor={menu.corSelecionado} padrao={corTema.startsWith("#") ? corTema : "#1677ff"} onChange={(corSelecionado) => alterar({ menu: { corSelecionado } })} />
          <CorOpcional rotulo="Ao passar o mouse" valor={menu.corHover} padrao={corTema.startsWith("#") ? corTema : "#1677ff"} onChange={(corHover) => alterar({ menu: { corHover } })} />
        </Bloco>
      </div>

      <Bloco
        titulo="Ordem e itens visíveis"
        descricao="Arraste para pôr no topo o que você mais usa. O olho esconde o item do menu (a tela continua na busca Ctrl+K)."
        acao={
          menu.ordem.length > 0 || ocultos.length > 0 ? (
            <button type="button" onClick={() => { alterar({ menu: { ordem: [] } }); setOcultos([]); }} className="flex items-center gap-1 text-xs text-texto-secundario hover:text-texto-primario"><RotateCcw size={12} /> Ordem original</button>
          ) : undefined
        }
      >
        <ol className="space-y-1 py-2">
          {itens.map((item, i) => {
            const oculto = ocultos.includes(item.rota);
            const Icone = item.icone;
            return (
              <li
                key={item.rota}
                draggable={item.rota !== "/"}
                onDragStart={(e) => { setArrastando(i); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { e.preventDefault(); setSobre(i); }}
                onDragLeave={() => setSobre((s) => (s === i ? null : s))}
                onDrop={(e) => { e.preventDefault(); if (arrastando !== null) salvarOrdem(moverItem(itens, arrastando, i)); setArrastando(null); setSobre(null); }}
                onDragEnd={() => { setArrastando(null); setSobre(null); }}
                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm transition-colors ${sobre === i && arrastando !== i ? "border-primaria bg-primaria/10" : "border-borda bg-fundo"} ${arrastando === i ? "opacity-50" : ""} ${oculto ? "opacity-60" : ""}`}
              >
                <GripVertical size={14} className={`shrink-0 ${item.rota === "/" ? "text-transparent" : "cursor-grab text-texto-secundario"}`} aria-hidden />
                <Icone size={15} className="shrink-0 text-texto-secundario" />
                <span className={`flex-1 truncate ${oculto ? "text-texto-secundario line-through" : "text-texto-primario"}`}>{item.rotulo}</span>
                <button type="button" onClick={() => salvarOrdem(moverItem(itens, i, i - 1))} disabled={i === 0} aria-label={`Subir ${item.rotulo}`} className="rounded p-1 text-texto-secundario hover:bg-borda/50 disabled:opacity-30"><ArrowUp size={13} /></button>
                <button type="button" onClick={() => salvarOrdem(moverItem(itens, i, i + 1))} disabled={i === itens.length - 1} aria-label={`Descer ${item.rotulo}`} className="rounded p-1 text-texto-secundario hover:bg-borda/50 disabled:opacity-30"><ArrowDown size={13} /></button>
                <button
                  type="button"
                  onClick={() => setOcultos(oculto ? ocultos.filter((r) => r !== item.rota) : [...ocultos, item.rota])}
                  disabled={item.rota === "/" || item.rota === "/configuracoes"}
                  aria-label={oculto ? `Mostrar ${item.rotulo}` : `Esconder ${item.rotulo}`}
                  title={item.rota === "/" || item.rota === "/configuracoes" ? "Este item não pode ser escondido" : undefined}
                  className="rounded p-1 text-texto-secundario hover:bg-borda/50 disabled:opacity-30"
                >
                  {oculto ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </li>
            );
          })}
        </ol>
      </Bloco>
    </div>
  );
}
