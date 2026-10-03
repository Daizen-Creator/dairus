// Regras da aba Garantias e Documentos: situação de cada item, resumo e avisos.

import type { AvisoSistema } from "../../services/avisos";
import { formatarDataISOParaBR } from "../../services/formato";
import type { Documento, TipoDocumento } from "../../services/documentos";

export const CATEGORIAS: Record<TipoDocumento, string[]> = {
  GARANTIA: ["Eletrônicos", "Celular e informática", "Eletrodomésticos", "Móveis", "Veículo", "Ferramentas", "Roupas e calçados", "Outros"],
  DOCUMENTO: ["Veículo", "Seguro", "Moradia", "Contrato", "Imposto", "Saúde", "Pessoal", "Trabalho", "Outros"],
};

/** Modelos rápidos: preenchem categoria, repetição e antecedência do aviso. */
export const MODELOS: Array<{ rotulo: string; tipo: TipoDocumento; categoria: string; repete: "ANUAL" | "MENSAL" | null; avisar: number; numero?: string }> = [
  { rotulo: "IPVA", tipo: "DOCUMENTO", categoria: "Veículo", repete: "ANUAL", avisar: 15, numero: "Placa" },
  { rotulo: "Licenciamento", tipo: "DOCUMENTO", categoria: "Veículo", repete: "ANUAL", avisar: 15, numero: "Placa" },
  { rotulo: "Seguro do carro", tipo: "DOCUMENTO", categoria: "Seguro", repete: "ANUAL", avisar: 30, numero: "Apólice" },
  { rotulo: "Seguro residencial", tipo: "DOCUMENTO", categoria: "Seguro", repete: "ANUAL", avisar: 30, numero: "Apólice" },
  { rotulo: "Contrato de aluguel", tipo: "DOCUMENTO", categoria: "Moradia", repete: null, avisar: 60, numero: "Contrato" },
  { rotulo: "CNH", tipo: "DOCUMENTO", categoria: "Pessoal", repete: null, avisar: 60, numero: "Registro" },
  { rotulo: "Passaporte", tipo: "DOCUMENTO", categoria: "Pessoal", repete: null, avisar: 90, numero: "Número" },
  { rotulo: "Plano de saúde", tipo: "DOCUMENTO", categoria: "Saúde", repete: "ANUAL", avisar: 30, numero: "Carteirinha" },
  { rotulo: "IPTU", tipo: "DOCUMENTO", categoria: "Imposto", repete: "ANUAL", avisar: 15, numero: "Inscrição" },
];

export type Situacao = "VENCIDO" | "VENCE_LOGO" | "EM_DIA" | "SEM_PRAZO" | "ARQUIVADO";

export function diasEntre(de: string, ate: string): number {
  const ms = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return Math.round((ms(ate) - ms(de)) / 86_400_000);
}

export function situacao(d: Documento, hoje: string): Situacao {
  if (d.arquivado) return "ARQUIVADO";
  if (!d.vencimento) return "SEM_PRAZO";
  const dias = diasEntre(hoje, d.vencimento);
  if (dias < 0) return "VENCIDO";
  if (dias <= d.avisar_dias) return "VENCE_LOGO";
  return "EM_DIA";
}

/** "faltam 8 meses", "vence em 12 dias", "venceu há 3 dias", "vence hoje". */
export function textoPrazo(d: Documento, hoje: string): string {
  if (!d.vencimento) return "Sem vencimento";
  const dias = diasEntre(hoje, d.vencimento);
  const garantia = d.tipo === "GARANTIA";
  if (dias === 0) return garantia ? "Garantia acaba hoje" : "Vence hoje";
  if (dias < 0) {
    const ha = -dias;
    const quanto = ha >= 60 ? `${Math.floor(ha / 30)} meses` : `${ha} dia${ha === 1 ? "" : "s"}`;
    return garantia ? `Garantia acabou há ${quanto}` : `Venceu há ${quanto}`;
  }
  const quanto = dias >= 60 ? `${Math.floor(dias / 30)} meses` : `${dias} dia${dias === 1 ? "" : "s"}`;
  return garantia ? `Em garantia · faltam ${quanto}` : `Vence em ${quanto}`;
}

/** Quanto da garantia já passou (0 a 100), para a barra de progresso. */
export function progressoGarantia(d: Documento, hoje: string): number | null {
  if (d.tipo !== "GARANTIA" || !d.data_compra || !d.vencimento) return null;
  const total = diasEntre(d.data_compra, d.vencimento);
  if (total <= 0) return 100;
  return Math.max(0, Math.min(100, (diasEntre(d.data_compra, hoje) / total) * 100));
}

export interface Resumo {
  garantiasAtivas: number;
  valorProtegido: number;
  venceLogo: number;
  vencidos: number;
  semArquivo: number;
}

export function resumo(docs: Documento[], hoje: string): Resumo {
  const ativos = docs.filter((d) => !d.arquivado);
  const emGarantia = ativos.filter((d) => d.tipo === "GARANTIA" && d.vencimento && d.vencimento >= hoje);
  return {
    garantiasAtivas: emGarantia.length,
    valorProtegido: emGarantia.reduce((s, d) => s + (d.valor_centavos ?? 0), 0),
    venceLogo: ativos.filter((d) => situacao(d, hoje) === "VENCE_LOGO").length,
    vencidos: ativos.filter((d) => situacao(d, hoje) === "VENCIDO" && d.tipo === "DOCUMENTO").length,
    semArquivo: ativos.filter((d) => d.arquivos === 0).length,
  };
}

/** Próximos vencimentos (inclui os vencidos há até 30 dias), do mais urgente ao mais distante. */
export function proximos(docs: Documento[], hoje: string, limite = 8): Documento[] {
  return docs
    .filter((d) => !d.arquivado && d.vencimento && diasEntre(hoje, d.vencimento) >= -30)
    .sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? ""))
    .slice(0, limite);
}

/**
 * Avisos do Windows: no início da janela de aviso (avisar_dias antes), 7 dias antes,
 * 1 dia antes, no dia e, para documentos, quando vencem sem renovação.
 */
export function avisosDeDocumentos(docs: Documento[], hoje: string): AvisoSistema[] {
  const avisos: AvisoSistema[] = [];
  for (const d of docs) {
    if (d.arquivado || !d.vencimento || d.avisar_dias <= 0) continue;
    const dias = diasEntre(hoje, d.vencimento);
    const data = formatarDataISOParaBR(d.vencimento);
    const marcos = new Set([d.avisar_dias, 7, 1, 0].filter((m) => m <= d.avisar_dias));
    if (d.tipo === "GARANTIA") {
      if (marcos.has(dias)) {
        avisos.push({
          id: `documento-${d.id}-${d.vencimento}-${dias}`,
          titulo: dias === 0 ? `A garantia de ${d.titulo} acaba hoje` : `A garantia de ${d.titulo} acaba em ${dias} dia${dias === 1 ? "" : "s"}`,
          corpo: `Termina em ${data}. Algum defeito? Acione a ${d.loja ? `loja (${d.loja}) ou o ` : ""}fabricante antes disso.`,
        });
      }
    } else if (marcos.has(dias)) {
      avisos.push({
        id: `documento-${d.id}-${d.vencimento}-${dias}`,
        titulo: dias === 0 ? `${d.titulo} vence hoje` : `${d.titulo} vence em ${dias} dia${dias === 1 ? "" : "s"}`,
        corpo: `Vencimento em ${data}.${d.repete ? " Depois de pagar/renovar, clique em Renovar no Dairus." : ""}`,
      });
    } else if (dias < 0 && dias >= -30 && (-dias) % 7 === 1) {
      avisos.push({ id: `documento-${d.id}-${d.vencimento}-atraso${-dias}`, titulo: `${d.titulo} está vencido`, corpo: `Venceu em ${data}. Renove ou atualize a data no Dairus.` });
    }
  }
  return avisos;
}

/** Busca sem acento no título, loja, número, categoria e observação. */
export function filtrar(docs: Documento[], termo: string, categoria: string): Documento[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const t = norm(termo.trim());
  return docs.filter(
    (d) => (!categoria || d.categoria === categoria) && (!t || norm([d.titulo, d.loja, d.numero, d.categoria, d.observacao].filter(Boolean).join(" ")).includes(t)),
  );
}

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Mesma regra do motor: 31/01 + 1 mês = 28/02 (sem pular mês). */
export function somarMesesISO(iso: string, meses: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = total - ano * 12;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}
