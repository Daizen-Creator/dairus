import { useEffect, useRef, useState } from "react";
import { ExternalLink, FileText, FileUp, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { documentos, type ArquivoDocumento, type Documento } from "../../services/documentos";
import { formatarDataISOParaBR } from "../../services/formato";
import { tamanhoLegivel } from "./documentosCalc";

/** Arquivos guardados de um documento: miniatura das fotos, abrir, apagar e enviar mais. */
export function ArquivosDocumento({ doc, onFechar, onAlterado }: { doc: Documento; onFechar: () => void; onAlterado: (quantidade: number) => void }) {
  const [lista, setLista] = useState<ArquivoDocumento[] | null>(null);
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [apagar, setApagar] = useState<string | null>(null);
  const criadas = useRef<string[]>([]);

  async function carregar() {
    try {
      const a = await documentos.arquivos(doc.id);
      setLista(a);
      onAlterado(a.length);
    } catch (e) {
      toast.error(String(e));
      setLista([]);
    }
  }
  useEffect(() => {
    carregar();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  // Miniaturas só das imagens (lidas do banco e mostradas como blob local).
  useEffect(() => {
    let vivo = true;
    (async () => {
      for (const a of (lista ?? []).filter((x) => x.mime.startsWith("image/") && !miniaturas[x.id])) {
        try {
          const bytes = await documentos.ler(a.id);
          const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: a.mime }));
          criadas.current.push(url);
          if (vivo) setMiniaturas((m) => ({ ...m, [a.id]: url }));
        } catch {
          // sem miniatura: mostra o ícone
        }
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista]);
  // Libera as miniaturas só ao fechar a janela.
  useEffect(() => () => criadas.current.forEach((u) => URL.revokeObjectURL(u)), []);

  async function enviar(arquivos: File[]) {
    if (!arquivos.length) return;
    setEnviando(true);
    let ok = 0;
    for (const f of arquivos) {
      try {
        await documentos.anexar(doc.id, f);
        ok++;
      } catch (e) {
        toast.error(`${f.name}: ${String(e)}`);
      }
    }
    setEnviando(false);
    if (ok) toast.success(`${ok} arquivo(s) guardado(s).`);
    carregar();
  }

  async function excluir(id: string) {
    try {
      await documentos.excluirArquivo(id);
      setApagar(null);
      toast.success("Arquivo apagado.");
      carregar();
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-4 sm:pt-12" role="dialog" aria-modal="true" aria-label={`Arquivos de ${doc.titulo}`} onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="w-full max-w-2xl rounded-2xl border border-borda bg-cartao shadow-2xl">
        <div className="flex items-center justify-between border-b border-borda px-5 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-texto-primario">Arquivos · {doc.titulo}</h2>
            <p className="text-xs text-texto-secundario">Guardados dentro do Dairus: entram no backup, na sincronização e na criptografia.</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-lg p-1 text-texto-secundario hover:bg-borda/40 hover:text-texto-primario"><X size={18} /></button>
        </div>

        <div className="space-y-3 p-5">
          <label
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); enviar(Array.from(e.dataTransfer.files)); }}
            className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-6 text-center text-sm transition-colors ${arrastando ? "border-primaria bg-primaria/10 text-primaria" : "border-borda bg-fundo text-texto-secundario hover:border-primaria hover:text-primaria"}`}
          >
            {enviando ? <Loader2 size={20} className="animate-spin" /> : <FileUp size={20} />}
            <span>Arraste aqui ou clique para escolher (PDF, foto, até 20 MB)</span>
            <input type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xml" className="sr-only" onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; enviar(fs); }} />
          </label>

          {lista === null ? (
            <p className="flex items-center gap-2 text-sm text-texto-secundario"><Loader2 size={14} className="animate-spin" /> Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="text-sm text-texto-secundario">Nenhum arquivo ainda. Guarde a nota fiscal ou o certificado: é o que a loja pede para acionar a garantia.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {lista.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-xl border border-borda bg-fundo p-2">
                  {miniaturas[a.id] ? (
                    <img src={miniaturas[a.id]} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-borda/40 text-texto-secundario">
                      <FileText size={22} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-texto-primario" title={a.nome}>{a.nome}</p>
                    <p className="text-xs text-texto-secundario">{tamanhoLegivel(a.tamanho)} · {formatarDataISOParaBR(a.criado_em.slice(0, 10))}</p>
                    {apagar === a.id ? (
                      <p className="mt-1 flex gap-2 text-xs">
                        <button onClick={() => excluir(a.id)} className="font-medium text-erro hover:underline">Apagar mesmo</button>
                        <button onClick={() => setApagar(null)} className="text-texto-secundario hover:underline">Cancelar</button>
                      </p>
                    ) : (
                      <p className="mt-1 flex gap-3 text-xs">
                        <button onClick={() => documentos.abrir(a.id).catch((e) => toast.error(String(e)))} className="flex items-center gap-1 text-primaria hover:underline"><ExternalLink size={12} /> Abrir</button>
                        <button onClick={() => setApagar(a.id)} className="flex items-center gap-1 text-texto-secundario hover:text-erro"><Trash2 size={12} /> Apagar</button>
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
