/** Markdown mínimo: **negrito**, listas com "-"/"*" e quebras de linha. Sem HTML injetado. */
export function TextoIA({ texto }: { texto: string }) {
  const linhas = texto.split("\n");
  return (
    <div className="space-y-1">
      {linhas.map((l, i) => {
        const item = /^\s*[-*]\s+/.test(l);
        const conteudo = l.replace(/^\s*[-*]\s+/, "");
        const partes = conteudo.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>));
        return item ? (
          <p key={i} className="flex gap-2 pl-1"><span aria-hidden>•</span><span>{partes}</span></p>
        ) : l.trim() === "" ? (
          <div key={i} className="h-1" />
        ) : (
          <p key={i}>{partes}</p>
        );
      })}
    </div>
  );
}

