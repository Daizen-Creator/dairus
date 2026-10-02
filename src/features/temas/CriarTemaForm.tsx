import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import type { Tema } from "../../types/theme";

interface CriarTemaFormProps {
  onSalvar: (tema: Tema) => void;
}

/** Luminância relativa (WCAG) para escolher automaticamente texto preto ou
 * branco sobre uma cor de destaque, garantindo contraste mínimo legível. */
function textoComContraste(corFundo: string): string {
  const hex = corFundo.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminancia = 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  return luminancia > 0.45 ? "#111111" : "#ffffff";
}

function slugificar(nome: string): string {
  return (
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "meu-tema"
  );
}

const CAMPOS: Array<{ chave: string; rotulo: string; padrao: string }> = [
  { chave: "fundo", rotulo: "Fundo", padrao: "#101418" },
  { chave: "cartao", rotulo: "Cartões", padrao: "#181d24" },
  { chave: "primaria", rotulo: "Primária", padrao: "#5b8cff" },
  { chave: "secundaria", rotulo: "Secundária", padrao: "#22d3ee" },
  { chave: "destaque", rotulo: "Destaque", padrao: "#a78bfa" },
  { chave: "textoPrimario", rotulo: "Texto principal", padrao: "#f2f4fa" },
  { chave: "textoSecundario", rotulo: "Texto secundário", padrao: "#9aa5bd" },
  { chave: "borda", rotulo: "Bordas", padrao: "#28324a" },
  { chave: "sucesso", rotulo: "Sucesso", padrao: "#34d399" },
  { chave: "alerta", rotulo: "Alerta", padrao: "#fbbf24" },
  { chave: "erro", rotulo: "Erro", padrao: "#f87171" },
];

export function CriarTemaForm({ onSalvar }: CriarTemaFormProps) {
  const [nome, setNome] = useState("Meu Tema");
  const [cores, setCores] = useState<Record<string, string>>(
    Object.fromEntries(CAMPOS.map((c) => [c.chave, c.padrao])),
  );

  function salvar() {
    if (!nome.trim()) {
      toast.error("Dê um nome para o tema.");
      return;
    }
    const tema: Tema = {
      id: `${slugificar(nome)}-${Date.now().toString(36)}`,
      nome: nome.trim(),
      categoria: "Personalizado",
      modoBase: textoComContraste(cores.fundo) === "#ffffff" ? "escuro" : "claro",
      personalizado: true,
      cores: {
        fundo: cores.fundo,
        superficie: cores.cartao,
        cartao: cores.cartao,
        primaria: cores.primaria,
        primariaTexto: textoComContraste(cores.primaria),
        secundaria: cores.secundaria,
        secundariaTexto: textoComContraste(cores.secundaria),
        textoPrimario: cores.textoPrimario,
        textoSecundario: cores.textoSecundario,
        borda: cores.borda,
        sucesso: cores.sucesso,
        alerta: cores.alerta,
        erro: cores.erro,
        destaque: cores.destaque,
        sombra: "rgba(0,0,0,0.35)",
        grafico: [cores.primaria, cores.secundaria, cores.destaque, cores.sucesso, cores.alerta],
      },
    };
    onSalvar(tema);
  }

  return (
    <div className="space-y-4 rounded-xl border border-borda bg-cartao p-4">
      <label className="block text-sm">
        <span className="mb-1 block text-texto-secundario">Nome do tema</span>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-borda bg-fundo px-3 py-2 text-texto-primario outline-none focus:border-primaria"
        />
      </label>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {CAMPOS.map((campo) => (
          <label key={campo.chave} className="text-xs text-texto-secundario">
            <span className="mb-1 block">{campo.rotulo}</span>
            <input
              type="color"
              value={cores[campo.chave]}
              onChange={(e) => setCores((atual) => ({ ...atual, [campo.chave]: e.target.value }))}
              className="h-9 w-full cursor-pointer rounded-lg border border-borda bg-fundo"
            />
          </label>
        ))}
      </div>

      <Button onClick={salvar}>Salvar tema personalizado</Button>
    </div>
  );
}
