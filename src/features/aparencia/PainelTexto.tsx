import { useEffect } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useAparenciaStore } from "../../state/aparencia-store";
import { definirCorPrimaria, useThemeStore } from "../../state/theme-store";
import { usePreferencia } from "../../state/usePreferencia";
import { CORES_DESTAQUE, FONTES, TAMANHOS } from "./aparencia";
import { Alternar, Bloco, Faixa, Linha, Opcoes, SeletorCor } from "./Controles";

export function PainelTexto() {
  const a = useAparenciaStore((s) => s.aparencia);
  const alterar = useAparenciaStore((s) => s.alterar);
  const { modoAutomatico, alternarModoAutomatico, selecionarTema, temaAtivo, temaPreferidoClaroId, temaPreferidoEscuroId } = useThemeStore();
  const [corCustom, setCorCustom] = usePreferencia<string>("cor_primaria_custom", "");
  const tema = temaAtivo();
  const modo: "claro" | "escuro" | "auto" = modoAutomatico ? "auto" : tema.modoBase;
  const corAtual = corCustom || tema.cores.primaria;
  const grupos = [...new Set(FONTES.map((f) => f.grupo))];
  // Fontes vêm junto com o app: carrega todas para a prévia de cada botão ficar fiel.
  useEffect(() => {
    for (const f of FONTES) f.carregar?.().catch(() => {});
  }, []);

  function trocarModo(m: typeof modo) {
    if (m === "auto") alternarModoAutomatico(true);
    else selecionarTema(m === "claro" ? temaPreferidoClaroId : temaPreferidoEscuroId);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <Bloco titulo="Modo e cor de destaque">
          <Linha rotulo="Modo" ajuda={modo === "auto" ? "Segue o claro/escuro do Windows (ou o horário, em Temas)." : undefined}>
            <Opcoes rotulo="Modo claro ou escuro" valor={modo} onChange={trocarModo} opcoes={[{ valor: "claro", rotulo: "Claro", icone: <Sun size={13} /> }, { valor: "escuro", rotulo: "Escuro", icone: <Moon size={13} /> }, { valor: "auto", rotulo: "Automático", icone: <Monitor size={13} /> }]} />
          </Linha>
          <Linha rotulo="Cor de destaque" ajuda="Botões, links, caixas de marcar e o item ativo do menu.">
            <SeletorCor rotulo="Cor de destaque" valor={corAtual} onChange={(c) => { setCorCustom(c); definirCorPrimaria(c); }} sugestoes={CORES_DESTAQUE} />
            {corCustom && <button type="button" onClick={() => { setCorCustom(""); definirCorPrimaria(null); }} className="text-xs text-texto-secundario hover:underline">a do tema</button>}
          </Linha>
        </Bloco>

        <Bloco titulo="Letra">
          <div className="py-2">
            <p className="mb-1.5 text-sm text-texto-primario">Fonte</p>
            {grupos.map((g) => (
              <div key={g} className="mb-2">
                <p className="mb-1 text-[11px] uppercase tracking-wide text-texto-secundario">{g}</p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {FONTES.filter((f) => f.grupo === g).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onMouseEnter={() => f.carregar?.()}
                      onFocus={() => f.carregar?.()}
                      onClick={() => alterar({ tipografia: { fonte: f.id } })}
                      aria-pressed={a.tipografia.fonte === f.id}
                      className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${a.tipografia.fonte === f.id ? "border-primaria bg-primaria/10" : "border-borda hover:border-texto-secundario"}`}
                    >
                      <span className="block text-base leading-tight text-texto-primario" style={{ fontFamily: f.familia }}>Aa R$ 1.234</span>
                      <span className="block truncate text-[11px] text-texto-secundario">{f.nome}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Linha rotulo="Tamanho do texto" ajuda="Para ler com mais conforto. Muda tudo: textos, ícones e espaços.">
            <Opcoes rotulo="Tamanho do texto" valor={TAMANHOS.some((t) => t.valor === a.tipografia.tamanho) ? a.tipografia.tamanho : -1} onChange={(tamanho) => alterar({ tipografia: { tamanho } })} opcoes={TAMANHOS.map((t) => ({ valor: t.valor, rotulo: t.rotulo }))} />
          </Linha>
          <Faixa rotulo="Ajuste fino do tamanho" valor={a.tipografia.tamanho} min={75} max={150} passo={6.25} formato={(v) => `${v}%`} onChange={(tamanho) => alterar({ tipografia: { tamanho } })} />
        </Bloco>
      </div>

      <div className="space-y-4">
        <Bloco titulo="Bordas e cartões">
          <Faixa rotulo="Arredondamento das bordas" valor={a.formas.raio} min={0} max={2.5} passo={0.1} formato={(v) => (v === 0 ? "quadrado" : v < 0.8 ? "pouco" : v <= 1.2 ? "padrão" : v < 2 ? "redondo" : "bem redondo")} onChange={(raio) => alterar({ formas: { raio } })} />
          <div className="flex flex-wrap gap-2 pb-2">
            {[0, 0.5, 1, 1.6, 2.5].map((r) => (
              <button key={r} type="button" onClick={() => alterar({ formas: { raio: r } })} aria-label={`Arredondamento ${r}`} className={`h-10 w-14 border-2 bg-fundo ${a.formas.raio === r ? "border-primaria" : "border-borda"}`} style={{ borderRadius: 12 * r }} />
            ))}
          </div>
          <Faixa rotulo="Transparência dos cartões" valor={Math.round((1 - a.formas.opacidadeCartoes) * 100)} min={0} max={85} formato={(v) => (v === 0 ? "sólidos" : `${v}% transparentes`)} onChange={(v) => alterar({ formas: { opacidadeCartoes: 1 - v / 100 } })} ajuda="Com fundo de imagem, deixe uns 30–40% para a foto aparecer." />
          <Faixa rotulo="Vidro fosco dos cartões" valor={a.formas.desfoqueCartoes} min={0} max={40} formato={(v) => (v === 0 ? "sem desfoque" : `${v}px`)} onChange={(desfoqueCartoes) => alterar({ formas: { desfoqueCartoes } })} />
          <Alternar rotulo="Sombras" ajuda="Desligado = visual chapado (flat)." ligado={a.formas.sombras} onChange={(sombras) => alterar({ formas: { sombras } })} />
          <Alternar rotulo="Brilho neon" ajuda="Brilho colorido em botões, gráficos e no menu." ligado={a.formas.brilho} onChange={(brilho) => alterar({ formas: { brilho } })} />
          <Alternar rotulo="Animações" ajuda="Transições ao trocar de tela, abrir menus e no fundo animado." ligado={a.formas.animacoes} onChange={(animacoes) => alterar({ formas: { animacoes } })} />
        </Bloco>

        <Bloco titulo="Prévia">
          <div className="space-y-2 py-2">
            <div className="rounded-xl border border-borda bg-cartao p-3 shadow-[0_8px_30px_-12px_var(--cor-sombra)]">
              <p className="text-xs text-texto-secundario">Saldo em conta</p>
              <p className="text-xl font-bold text-texto-primario">R$ 12.480,90</p>
              <p className="text-xs text-sucesso">+ R$ 1.200,00 este mês</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="rounded-lg bg-gradient-to-r from-primaria to-destaque px-3 py-1.5 text-sm font-medium text-primaria-texto shadow-[0_4px_18px_-4px_var(--cor-primaria)]">Botão principal</button>
              <button type="button" className="rounded-lg border border-borda bg-superficie px-3 py-1.5 text-sm text-texto-primario">Secundário</button>
              <label className="flex items-center gap-1.5 text-sm text-texto-primario"><input type="checkbox" defaultChecked className="h-4 w-4 accent-[var(--cor-primaria)]" /> Marcado</label>
              <a href="#/temas" onClick={(e) => e.preventDefault()} className="text-sm text-primaria underline">Um link</a>
            </div>
          </div>
        </Bloco>
      </div>
    </div>
  );
}
