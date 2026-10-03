import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useThemeStore } from "../../state/theme-store";
import { Button } from "../../components/ui/Button";
import { CriarTemaForm } from "./CriarTemaForm";
import { ExtrasTemas } from "./ExtrasTemas";
import { notaContraste } from "./temasExtras";
import type { CategoriaTema, Tema } from "../../types/theme";

const CATEGORIAS: Array<CategoriaTema | "Todos" | "Favoritos"> = [
  "Todos",
  "Favoritos",
  "Escuro",
  "Claro",
  "Minimalista",
  "Corporativo",
  "Moderno",
  "Cyberpunk",
  "Neon",
  "Natural",
  "Monocromático",
  "Personalizado",
];

function CartaoTema({
  tema,
  ativo,
  favorito,
  onAplicar,
  onFavoritar,
  onRemover,
}: {
  tema: Tema;
  ativo: boolean;
  favorito: boolean;
  onAplicar: () => void;
  onFavoritar: () => void;
  onRemover?: () => void;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-xl border p-3 text-left transition-colors ${
        ativo ? "border-primaria" : "border-borda hover:border-texto-secundario"
      }`}
      style={{ backgroundColor: tema.cores.cartao }}
    >
      <button onClick={onAplicar} className="block w-full text-left" aria-label={`Aplicar tema ${tema.nome}`}>
        <div className="mb-3 flex gap-1.5">
          {[tema.cores.fundo, tema.cores.primaria, tema.cores.secundaria, tema.cores.destaque, tema.cores.sucesso].map(
            (cor, i) => (
              <span key={i} className="h-6 w-6 rounded-full border border-black/10" style={{ backgroundColor: cor }} />
            ),
          )}
        </div>
        <p className="text-sm font-semibold" style={{ color: tema.cores.textoPrimario }}>
          {tema.nome}
        </p>
        <p className="text-xs" style={{ color: tema.cores.textoSecundario }}>
          {tema.categoria} · contraste {notaContraste(tema).nivel === "baixo" ? "baixo" : notaContraste(tema).nivel} ({notaContraste(tema).razao.toFixed(1).replace(".", ",")})
        </p>
      </button>
      <div className="absolute right-2 top-2 flex gap-1">
        <button
          onClick={onFavoritar}
          aria-label={favorito ? "Remover dos favoritos" : "Favoritar"}
          className="rounded-full p-1 text-xs"
          style={{ color: favorito ? tema.cores.alerta : tema.cores.textoSecundario }}
        >
          {favorito ? "★" : "☆"}
        </button>
        {onRemover && (
          <button
            onClick={onRemover}
            aria-label="Excluir tema personalizado"
            className="rounded-full p-1 text-xs"
            style={{ color: tema.cores.erro }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export function TemasPage() {
  const {
    todosOsTemas,
    temaSelecionadoId,
    temaAtivo,
    modoAutomatico,
    favoritos,
    selecionarTema,
    alternarModoAutomatico,
    alternarFavorito,
    removerTemaPersonalizado,
    salvarTemaPersonalizado,
    configurarAutomatico,
    autoHorario,
    temaPreferidoClaroId,
    temaPreferidoEscuroId,
  } = useThemeStore();

  const [filtroCategoria, setFiltroCategoria] = useState<(typeof CATEGORIAS)[number]>("Todos");
  const [busca, setBusca] = useState("");
  const [criandoTema, setCriandoTema] = useState(false);

  const [modoFiltro, setModoFiltro] = useState<"todos" | "claro" | "escuro">("todos");
  const temas = todosOsTemas().filter((t) => modoFiltro === "todos" || t.modoBase === modoFiltro);

  const temasFiltrados = useMemo(() => {
    return temas.filter((t) => {
      const combinaBusca = t.nome.toLowerCase().includes(busca.toLowerCase());
      const combinaCategoria =
        filtroCategoria === "Todos" ||
        (filtroCategoria === "Favoritos" ? favoritos.includes(t.id) : t.categoria === filtroCategoria);
      return combinaBusca && combinaCategoria;
    }).sort((a, b) => Number(favoritos.includes(b.id)) - Number(favoritos.includes(a.id)));
  }, [temas, busca, filtroCategoria, favoritos]);

  function exportarTemas() {
    const personalizados = temas.filter((t) => t.personalizado);
    if (personalizados.length === 0) {
      toast.info("Você ainda não criou nenhum tema personalizado para exportar.");
      return;
    }
    const blob = new Blob([JSON.stringify(personalizados, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "temas-dairus.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importarTemas(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    try {
      const texto = await arquivo.text();
      const importados = JSON.parse(texto) as Tema[];
      for (const tema of importados) {
        await salvarTemaPersonalizado(tema);
      }
      toast.success(`${importados.length} tema(s) importado(s).`);
    } catch {
      toast.error("Arquivo inválido. Exporte um arquivo gerado pelo próprio Dairus.");
    } finally {
      evento.target.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-texto-primario">Temas</h1>
          <p className="text-sm text-texto-secundario">Tema ativo: {temaAtivo().nome}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-texto-secundario">
            <input
              type="checkbox"
              checked={modoAutomatico}
              onChange={(e) => alternarModoAutomatico(e.target.checked)}
            />
            Automático
          </label>
          <Button variante="secundaria" tamanho="pequeno" onClick={() => setCriandoTema((v) => !v)}>
            {criandoTema ? "Cancelar" : "+ Criar tema"}
          </Button>
        </div>
      </div>

      {modoAutomatico && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-borda bg-cartao p-3 text-sm text-texto-secundario">
          <label className="flex items-center gap-2">
            <input type="radio" name="origem-auto" checked={!autoHorario.ativo} onChange={() => configurarAutomatico({ autoHorario: { ...autoHorario, ativo: false } })} /> Seguir o Windows
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="origem-auto" checked={autoHorario.ativo} onChange={() => configurarAutomatico({ autoHorario: { ...autoHorario, ativo: true } })} /> Por horário
          </label>
          {autoHorario.ativo && (
            <span className="flex items-center gap-1.5">
              claro das
              <input type="number" min={0} max={23} value={autoHorario.horaClaro} onChange={(e) => configurarAutomatico({ autoHorario: { ...autoHorario, horaClaro: Math.min(23, Math.max(0, Number(e.target.value))) } })} aria-label="Hora do tema claro" className="w-14 rounded-lg border border-borda bg-fundo px-2 py-1 text-texto-primario" />
              h às
              <input type="number" min={0} max={23} value={autoHorario.horaEscuro} onChange={(e) => configurarAutomatico({ autoHorario: { ...autoHorario, horaEscuro: Math.min(23, Math.max(0, Number(e.target.value))) } })} aria-label="Hora do tema escuro" className="w-14 rounded-lg border border-borda bg-fundo px-2 py-1 text-texto-primario" />
              h
            </span>
          )}
          <label className="flex items-center gap-2">Claro
            <select value={temaPreferidoClaroId} onChange={(e) => configurarAutomatico({ claroId: e.target.value })} aria-label="Tema claro" className="rounded-lg border border-borda bg-fundo px-2 py-1 text-texto-primario">
              {temas.filter((t) => t.modoBase === "claro").map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">Escuro
            <select value={temaPreferidoEscuroId} onChange={(e) => configurarAutomatico({ escuroId: e.target.value })} aria-label="Tema escuro" className="rounded-lg border border-borda bg-fundo px-2 py-1 text-texto-primario">
              {temas.filter((t) => t.modoBase !== "claro").map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </label>
        </div>
      )}

      <ExtrasTemas temas={todosOsTemas()} favoritos={favoritos} />
      <div className="flex gap-1.5 text-xs">
        {(["todos", "claro", "escuro"] as const).map((m) => <button key={m} onClick={() => setModoFiltro(m)} className={`rounded-full px-3 py-1 ${modoFiltro === m ? "bg-primaria text-primaria-texto" : "bg-superficie text-texto-secundario"}`}>{m === "todos" ? "Claros e escuros" : m === "claro" ? "Só claros" : "Só escuros"}</button>)}
      </div>

      {criandoTema && (
        <CriarTemaForm
          onSalvar={async (tema) => {
            await salvarTemaPersonalizado(tema);
            await selecionarTema(tema.id);
            setCriandoTema(false);
            toast.success("Tema personalizado criado e aplicado.");
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar tema…"
          className="rounded-lg border border-borda bg-fundo px-3 py-1.5 text-sm text-texto-primario outline-none focus:border-primaria"
        />
        {CATEGORIAS.map((cat) => (
          <button
            key={cat}
            onClick={() => setFiltroCategoria(cat)}
            className={`rounded-full px-3 py-1 text-xs ${
              filtroCategoria === cat ? "bg-primaria text-primaria-texto" : "bg-superficie text-texto-secundario"
            }`}
          >
            {cat}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button variante="secundaria" tamanho="pequeno" onClick={exportarTemas}>
            Exportar meus temas
          </Button>
          <label className="cursor-pointer rounded-lg border border-borda bg-superficie px-3 py-1.5 text-xs text-texto-secundario hover:bg-borda/40">
            Importar
            <input type="file" accept="application/json" onChange={importarTemas} className="hidden" />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {temasFiltrados.map((tema) => (
          <CartaoTema
            key={tema.id}
            tema={tema}
            ativo={!modoAutomatico && tema.id === temaSelecionadoId}
            favorito={favoritos.includes(tema.id)}
            onAplicar={() => selecionarTema(tema.id)}
            onFavoritar={() => alternarFavorito(tema.id)}
            onRemover={tema.personalizado ? () => removerTemaPersonalizado(tema.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
