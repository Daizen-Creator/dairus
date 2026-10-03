import { useEffect, useState } from "react";
import { ExternalLink, Globe, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { lerPreferencia } from "../../services/armazenamento";
import { extras } from "../../services/extras";
import { dataAtualISO, formatarCentavos } from "../../services/formato";
import type { ItemRadar } from "../../types/extras";
import { buscarEmTodasAsLojas, LOJAS, type OfertaLoja } from "./buscaLojas";

const abrir = (url: string) => import("@tauri-apps/plugin-opener").then((m) => m.openUrl(url)).catch(() => window.open(url, "_blank", "noopener"));

/** Busca o produto em todas as lojas, mostra as ofertas da mais barata para a mais cara e registra no histórico. */
export function BuscaTodasLojas({ item, onAlterado }: { item: ItemRadar; onAlterado: () => void }) {
  const [temChave, setTemChave] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [ofertas, setOfertas] = useState<OfertaLoja[] | null>(null);
  const [mostrarLinks, setMostrarLinks] = useState(false);
  useEffect(() => {
    lerPreferencia<string>("gemini_chave").then((c) => setTemChave(!!c));
  }, []);

  async function buscar() {
    try {
      setBuscando(true);
      const r = await buscarEmTodasAsLojas(item.nome, temChave);
      setOfertas(r.ofertas);
      if (r.erros.length) toast.warning(r.erros.join(" · "), { duration: 9000 });
      if (!r.ofertas.length) toast.info("Nenhuma oferta encontrada. Use os links das lojas abaixo.");
      setMostrarLinks(true);
    } finally {
      setBuscando(false);
    }
  }

  async function registrar(lista: OfertaLoja[]) {
    try {
      const hoje = dataAtualISO();
      for (const o of lista) await extras.registrarPrecoRadar(item.id, o.loja, o.precoCentavos, o.url, hoje);
      toast.success(`${lista.length} preço(s) registrado(s) no histórico.`);
      onAlterado();
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="mt-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Button tamanho="pequeno" variante="secundaria" onClick={buscar} disabled={buscando}>
          {buscando ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />} {buscando ? "Procurando nas lojas…" : "Buscar em todas as lojas"}
        </Button>
        <button onClick={() => setMostrarLinks(!mostrarLinks)} className="text-primaria hover:underline">{mostrarLinks ? "Ocultar lojas" : "Abrir nas lojas"}</button>
        {!temChave && <span className="text-texto-secundario">Sem a chave do Gemini, busca só pelo comparador Zoom (várias lojas); as outras abrem pelos links.</span>}
      </div>
      {ofertas && ofertas.length > 0 && (
        <div className="mt-2 rounded-lg border border-borda">
          <table className="w-full">
            <thead className="text-left text-texto-secundario"><tr><th className="px-2 py-1">Loja</th><th>Anúncio</th><th className="text-right">Preço</th><th /></tr></thead>
            <tbody>
              {ofertas.map((o, k) => (
                <tr key={`${o.loja}-${k}`} className={`border-t border-borda ${k === 0 ? "bg-sucesso/10" : ""}`}>
                  <td className="px-2 py-1 font-medium">{o.loja}{k === 0 && <span className="ml-1 text-sucesso">★ menor</span>}</td>
                  <td className="max-w-56 truncate text-texto-secundario" title={o.titulo}>{o.titulo || "—"}</td>
                  <td className="text-right tabular-nums">{formatarCentavos(o.precoCentavos)}</td>
                  <td className="px-2 text-right whitespace-nowrap">
                    {o.url && <button onClick={() => abrir(o.url!)} className="mr-2 text-primaria" aria-label={`Abrir oferta da ${o.loja}`}><ExternalLink size={12} /></button>}
                    <button onClick={() => registrar([o])} className="text-primaria" aria-label={`Registrar preço da ${o.loja}`}><Plus size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-borda px-2 py-1.5">
            <span className="text-texto-secundario">{ofertas.length} oferta(s){ofertas.some((o) => o.fonte === "IA") ? " · preços achados pela IA na busca do Google: confira na loja antes de comprar" : ""}</span>
            <Button tamanho="pequeno" onClick={() => registrar(ofertas)}>Registrar todos</Button>
          </div>
        </div>
      )}
      {mostrarLinks && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {LOJAS.map((l) => <button key={l.nome} onClick={() => abrir(l.busca(item.nome))} className="inline-flex items-center gap-1 rounded-full border border-borda px-2 py-0.5 hover:border-primaria hover:text-primaria"><ExternalLink size={10} /> {l.nome}</button>)}
        </div>
      )}
    </div>
  );
}
