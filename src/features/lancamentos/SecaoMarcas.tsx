import { useEffect, useState } from "react";
import { Image, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { IconeCoisa } from "../../components/ui/IconeCoisa";
import { Select } from "../../components/ui/Select";
import { lerPreferencia, salvarPreferencia } from "../../services/armazenamento";
import { definirMarcasUsuario, MARCAS_EMBUTIDAS, type MarcaUsuario } from "../dashboard/marcas";
import { avisarDadosAlterados } from "../../state/useAoAlterarDados";

/** Reduz a imagem para 96×96 (PNG em data URL) para guardar nas preferências. */
async function imagemPequena(arquivo: File): Promise<string> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => {
      const i = new window.Image();
      i.onload = () => ok(i);
      i.onerror = () => erro(new Error("Não consegui abrir essa imagem."));
      i.src = url;
    });
    const lado = 96;
    const canvas = document.createElement("canvas");
    canvas.width = lado;
    canvas.height = lado;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Sem suporte a imagens.");
    const escala = Math.min(lado / img.width, lado / img.height);
    const w = img.width * escala;
    const h = img.height * escala;
    ctx.drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Ensinar marcas novas ao logo automático. */
export function SecaoMarcas() {
  const [marcas, setMarcas] = useState<MarcaUsuario[]>([]);
  const [palavras, setPalavras] = useState("");
  const [embutida, setEmbutida] = useState("");
  const [imagem, setImagem] = useState<string | null>(null);

  useEffect(() => {
    lerPreferencia<MarcaUsuario[]>("marcas_usuario").then((m) => setMarcas(m ?? []));
  }, []);

  async function gravar(lista: MarcaUsuario[]) {
    setMarcas(lista);
    definirMarcasUsuario(lista);
    await salvarPreferencia("marcas_usuario", lista);
    avisarDadosAlterados();
  }

  async function adicionar(ev: React.FormEvent) {
    ev.preventDefault();
    const lista = palavras.split(",").map((p) => p.trim()).filter(Boolean);
    const logo = imagem ?? embutida;
    if (!lista.length || !logo) return toast.error("Informe as palavras e escolha um logo ou envie uma imagem.");
    await gravar([...marcas, { palavras: lista, imagem: logo }]);
    setPalavras("");
    setImagem(null);
    setEmbutida("");
    toast.success("Marca ensinada. Os lançamentos com essas palavras já mostram o logo.");
  }

  return (
    <Secao titulo={<><Image size={16} className="text-primaria" /> Marcas e logos</>}>
      <p className="text-xs text-texto-secundario">O Dairus reconhece marcas pela descrição. Ensine marcas novas (ex.: “Padaria do Zé”) com uma imagem sua, ou aponte nomes diferentes para um logo que já existe (ex.: “NU PAGAMENTOS” → Nubank).</p>
      <form onSubmit={adicionar} className="mt-3 flex flex-wrap items-center gap-2">
        <input value={palavras} onChange={(e) => setPalavras(e.target.value)} placeholder="Palavras (separe por vírgula)" aria-label="Palavras da marca" className={`${CLASSE_INPUT} min-w-48 flex-1`} />
        <Select aria-label="Logo existente" value={embutida} onValueChange={(v) => { setEmbutida(v); setImagem(null); }} options={[{ value: "", label: "Logo existente…" }, ...MARCAS_EMBUTIDAS.map((m) => ({ value: m.caminho, label: m.arquivo }))]} className="w-40" />
        <label className="cursor-pointer text-xs text-primaria hover:underline">
          {imagem ? "Imagem escolhida" : "ou enviar imagem"}
          <input type="file" accept="image/*" aria-label="Imagem da marca" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) imagemPequena(f).then((d) => { setImagem(d); setEmbutida(""); }).catch((er) => toast.error(String(er))); }} />
        </label>
        {imagem && <img src={imagem} alt="" className="h-7 w-7 rounded" />}
        <Button type="submit" tamanho="pequeno">Ensinar</Button>
      </form>
      {marcas.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {marcas.map((m, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><IconeCoisa nome={m.palavras[0]} tamanho={24} /> {m.palavras.join(", ")}</span>
              <button onClick={() => gravar(marcas.filter((_, j) => j !== i))} aria-label={`Esquecer ${m.palavras[0]}`} className="text-texto-secundario hover:text-erro"><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}
