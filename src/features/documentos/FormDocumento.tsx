import { useEffect, useState } from "react";
import { FileUp, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { documentos, type Documento, type DocumentoInput, type Repeticao, type TipoDocumento } from "../../services/documentos";
import { centavosParaValorInput, dataAtualISO, formatarCentavos, formatarDataISOParaBR, valorInputParaCentavos } from "../../services/formato";
import type { Lancamento } from "../../types/accounting";
import { CATEGORIAS, MODELOS, somarMesesISO, tamanhoLegivel } from "./documentosCalc";

/** Valores iniciais do formulário (novo, edição, modelo rápido ou nota lida pela IA). */
export interface Rascunho {
  id?: string;
  tipo: TipoDocumento;
  categoria: string;
  titulo: string;
  numero: string;
  loja: string;
  valor: string;
  dataCompra: string;
  garantiaMeses: string;
  estendida: string;
  vencimento: string;
  repete: "" | Repeticao;
  avisarDias: string;
  lancamentoId: string;
  observacao: string;
  /** Arquivos escolhidos antes de salvar (sobem logo depois). */
  arquivos: File[];
  rotuloNumero?: string;
}

export function rascunhoVazio(tipo: TipoDocumento): Rascunho {
  return {
    tipo,
    categoria: CATEGORIAS[tipo][0],
    titulo: "",
    numero: "",
    loja: "",
    valor: "",
    dataCompra: tipo === "GARANTIA" ? dataAtualISO() : "",
    garantiaMeses: tipo === "GARANTIA" ? "12" : "",
    estendida: "0",
    vencimento: "",
    repete: "",
    avisarDias: tipo === "GARANTIA" ? "30" : "15",
    lancamentoId: "",
    observacao: "",
    arquivos: [],
  };
}

export function rascunhoDoModelo(m: (typeof MODELOS)[number]): Rascunho {
  return { ...rascunhoVazio(m.tipo), titulo: m.rotulo, categoria: m.categoria, repete: m.repete ?? "", avisarDias: String(m.avisar), rotuloNumero: m.numero };
}

export function rascunhoDoDocumento(d: Documento): Rascunho {
  return {
    id: d.id,
    tipo: d.tipo,
    categoria: d.categoria,
    titulo: d.titulo,
    numero: d.numero ?? "",
    loja: d.loja ?? "",
    valor: d.valor_centavos != null ? centavosParaValorInput(d.valor_centavos) : "",
    dataCompra: d.data_compra ?? "",
    garantiaMeses: d.garantia_meses != null ? String(d.garantia_meses) : "",
    estendida: String(d.garantia_estendida_meses),
    vencimento: d.vencimento ?? "",
    repete: d.repete ?? "",
    avisarDias: String(d.avisar_dias),
    lancamentoId: d.lancamento_id ?? "",
    observacao: d.observacao ?? "",
    arquivos: [],
  };
}

/** Valor de uma compra: soma dos débitos do lançamento. */
export const valorDoLancamento = (l: Lancamento) => l.partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + p.valor_centavos, 0);

interface Props {
  inicial: Rascunho;
  compras: Lancamento[];
  onFechar: () => void;
  onSalvo: (d: Documento) => void;
}

export function FormDocumento({ inicial, compras, onFechar, onSalvo }: Props) {
  const [r, setR] = useState<Rascunho>(inicial);
  const [salvando, setSalvando] = useState(false);
  const garantia = r.tipo === "GARANTIA";
  const alterar = (p: Partial<Rascunho>) => setR((x) => ({ ...x, ...p }));
  const meses = (Number(r.garantiaMeses) || 0) + (Number(r.estendida) || 0);
  const fimGarantia = garantia && r.dataCompra && r.garantiaMeses !== "" ? somarMesesISO(r.dataCompra, meses) : null;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  function escolherCompra(id: string) {
    const l = compras.find((c) => c.id === id);
    if (!l) return alterar({ lancamentoId: "" });
    alterar({ lancamentoId: id, titulo: r.titulo || l.descricao, valor: centavosParaValorInput(valorDoLancamento(l)), dataCompra: l.data });
  }

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    const input: DocumentoInput = {
      id: r.id ?? null,
      tipo: r.tipo,
      categoria: r.categoria,
      titulo: r.titulo,
      numero: r.numero || null,
      loja: r.loja || null,
      valor_centavos: r.valor.trim() ? valorInputParaCentavos(r.valor) : null,
      data_compra: r.dataCompra || null,
      garantia_meses: garantia && r.garantiaMeses !== "" ? Number(r.garantiaMeses) : null,
      garantia_estendida_meses: garantia ? Number(r.estendida) || 0 : 0,
      vencimento: garantia ? null : r.vencimento || null,
      repete: garantia ? null : r.repete || null,
      avisar_dias: Math.max(0, Math.min(365, Number(r.avisarDias) || 0)),
      lancamento_id: r.lancamentoId || null,
      observacao: r.observacao || null,
    };
    setSalvando(true);
    try {
      const doc = await documentos.salvar(input);
      let falhas = 0;
      for (const f of r.arquivos) await documentos.anexar(doc.id, f).catch(() => falhas++);
      // A nota fiscal que já estava no lançamento vem junto.
      const copiados = r.lancamentoId && r.lancamentoId !== inicial.lancamentoId ? await documentos.copiarComprovantes(doc.id, r.lancamentoId).catch(() => 0) : 0;
      toast.success(`${garantia ? "Garantia" : "Documento"} salvo.${copiados ? ` ${copiados} comprovante(s) do lançamento copiado(s).` : ""}`);
      if (falhas) toast.error(`${falhas} arquivo(s) não foram guardados (máximo 20 MB cada).`);
      onSalvo({ ...doc, arquivos: doc.arquivos + r.arquivos.length - falhas + copiados });
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSalvando(false);
    }
  }

  const rotulo = "mb-1 block text-xs font-medium text-texto-secundario";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-4 sm:pt-12" role="dialog" aria-modal="true" aria-label={garantia ? "Garantia" : "Documento"} onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <form onSubmit={salvar} className="w-full max-w-2xl rounded-2xl border border-borda bg-cartao shadow-2xl">
        <div className="flex items-center justify-between border-b border-borda px-5 py-3">
          <h2 className="text-base font-semibold text-texto-primario">{r.id ? "Editar" : "Nova"} {garantia ? "garantia" : "documento"}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-lg p-1 text-texto-secundario hover:bg-borda/40 hover:text-texto-primario"><X size={18} /></button>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {!r.id && (
            <div className="sm:col-span-2 flex gap-1 rounded-lg border border-borda bg-fundo p-1 text-sm">
              {(["GARANTIA", "DOCUMENTO"] as const).map((t) => (
                <button key={t} type="button" onClick={() => alterar({ ...rascunhoVazio(t), titulo: r.titulo, arquivos: r.arquivos, lancamentoId: r.lancamentoId, valor: r.valor })} className={`flex-1 rounded-md px-3 py-1.5 ${r.tipo === t ? "bg-primaria text-primaria-texto" : "text-texto-secundario hover:text-texto-primario"}`}>
                  {t === "GARANTIA" ? "Garantia de compra" : "Documento importante"}
                </button>
              ))}
            </div>
          )}

          {garantia && compras.length > 0 && (
            <label className="sm:col-span-2">
              <span className={rotulo}>Preencher a partir de uma compra lançada (opcional)</span>
              <Select aria-label="Compra lançada" value={r.lancamentoId || "NENHUMA"} onValueChange={(v) => escolherCompra(v === "NENHUMA" ? "" : v)} className="w-full" options={[{ value: "NENHUMA", label: "Nenhuma" }, ...compras.slice(0, 200).map((l) => ({ value: l.id, label: `${formatarDataISOParaBR(l.data)} · ${l.descricao} · ${formatarCentavos(valorDoLancamento(l))}` }))]} />
            </label>
          )}

          <label className="sm:col-span-2">
            <span className={rotulo}>{garantia ? "Produto" : "Nome do documento"}</span>
            <input autoFocus value={r.titulo} onChange={(e) => alterar({ titulo: e.target.value })} maxLength={120} required placeholder={garantia ? 'Ex.: TV Samsung 55"' : "Ex.: IPVA do carro"} className={`${CLASSE_INPUT} w-full`} />
          </label>
          <label>
            <span className={rotulo}>Categoria</span>
            <Select aria-label="Categoria" value={r.categoria} onValueChange={(v) => alterar({ categoria: v })} className="w-full" options={CATEGORIAS[r.tipo].map((c) => ({ value: c, label: c }))} />
          </label>
          <label>
            <span className={rotulo}>{r.rotuloNumero ?? (garantia ? "Número da nota / série" : "Número (placa, apólice, contrato)")}</span>
            <input value={r.numero} onChange={(e) => alterar({ numero: e.target.value })} maxLength={80} className={`${CLASSE_INPUT} w-full`} />
          </label>
          <label>
            <span className={rotulo}>{garantia ? "Loja" : "Empresa / órgão"}</span>
            <input value={r.loja} onChange={(e) => alterar({ loja: e.target.value })} maxLength={80} placeholder={garantia ? "Ex.: Magazine Luiza" : "Ex.: Detran, Porto Seguro"} className={`${CLASSE_INPUT} w-full`} />
          </label>
          <label>
            <span className={rotulo}>{garantia ? "Valor pago (R$)" : "Valor (R$)"}</span>
            <input value={r.valor} onChange={(e) => alterar({ valor: e.target.value })} inputMode="decimal" placeholder="0,00" className={`${CLASSE_INPUT} w-full`} />
          </label>

          {garantia ? (
            <>
              <label>
                <span className={rotulo}>Data da compra</span>
                <input type="date" value={r.dataCompra} onChange={(e) => alterar({ dataCompra: e.target.value })} required className={`${CLASSE_INPUT} w-full`} />
              </label>
              <div>
                <span className={rotulo}>Garantia do fabricante</span>
                <div className="flex flex-wrap gap-1">
                  {[3, 6, 12, 24].map((m) => (
                    <button key={m} type="button" onClick={() => alterar({ garantiaMeses: String(m) })} className={`rounded-lg border px-2.5 py-1.5 text-xs ${r.garantiaMeses === String(m) ? "border-primaria text-primaria" : "border-borda text-texto-secundario hover:text-texto-primario"}`}>
                      {m < 12 ? `${m} meses` : `${m / 12} ano${m > 12 ? "s" : ""}`}
                    </button>
                  ))}
                  <input value={r.garantiaMeses} onChange={(e) => alterar({ garantiaMeses: e.target.value.replace(/\D/g, "").slice(0, 3) })} inputMode="numeric" aria-label="Meses de garantia" className={`${CLASSE_INPUT} w-16 py-1 text-xs`} />
                </div>
              </div>
              <label>
                <span className={rotulo}>Garantia estendida</span>
                <Select aria-label="Garantia estendida" value={r.estendida} onValueChange={(v) => alterar({ estendida: v })} className="w-full" options={[{ value: "0", label: "Não tenho" }, { value: "12", label: "+1 ano" }, { value: "24", label: "+2 anos" }, { value: "36", label: "+3 anos" }]} />
              </label>
              <p className="sm:col-span-2 rounded-lg bg-fundo px-3 py-2 text-sm text-texto-secundario">
                {fimGarantia ? <>A garantia vai até <strong className="text-texto-primario">{formatarDataISOParaBR(fimGarantia)}</strong> ({meses} meses).</> : "Informe a data da compra e os meses de garantia."}
              </p>
            </>
          ) : (
            <>
              <label>
                <span className={rotulo}>Vencimento / validade (opcional)</span>
                <input type="date" value={r.vencimento} onChange={(e) => alterar({ vencimento: e.target.value })} className={`${CLASSE_INPUT} w-full`} />
              </label>
              <label>
                <span className={rotulo}>Repete</span>
                <Select aria-label="Repetição" value={r.repete || "NAO"} onValueChange={(v) => alterar({ repete: v === "NAO" ? "" : (v as Rascunho["repete"]) })} className="w-full" options={[{ value: "NAO", label: "Não (vence uma vez)" }, { value: "ANUAL", label: "Todo ano (IPVA, seguro…)" }, { value: "MENSAL", label: "Todo mês" }]} />
              </label>
            </>
          )}

          <label>
            <span className={rotulo}>Avisar quantos dias antes</span>
            <input value={r.avisarDias} onChange={(e) => alterar({ avisarDias: e.target.value.replace(/\D/g, "").slice(0, 3) })} inputMode="numeric" className={`${CLASSE_INPUT} w-full`} />
          </label>
          <label className="sm:col-span-2">
            <span className={rotulo}>Observação</span>
            <textarea value={r.observacao} onChange={(e) => alterar({ observacao: e.target.value })} maxLength={5000} rows={2} placeholder={garantia ? "Ex.: assistência técnica autorizada, telefone do SAC" : "Ex.: corretor, telefone, o que cobre"} className={`${CLASSE_INPUT} w-full resize-y`} />
          </label>

          <div className="sm:col-span-2">
            <span className={rotulo}>{garantia ? "Nota fiscal, certificado de garantia, fotos" : "Arquivos (PDF, foto do documento, boleto)"}</span>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-borda bg-fundo px-3 py-3 text-sm text-texto-secundario hover:border-primaria hover:text-primaria">
              <FileUp size={16} /> Escolher arquivos (até 20 MB cada)
              <input type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xml" className="sr-only" onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; alterar({ arquivos: [...r.arquivos, ...fs] }); }} />
            </label>
            {r.arquivos.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs">
                {r.arquivos.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md bg-fundo px-2 py-1">
                    <span className="flex min-w-0 items-center gap-1.5 truncate text-texto-primario"><Paperclip size={12} />{f.name} <span className="text-texto-secundario">· {tamanhoLegivel(f.size)}</span></span>
                    <button type="button" onClick={() => alterar({ arquivos: r.arquivos.filter((_, j) => j !== i) })} aria-label={`Tirar ${f.name}`} className="text-texto-secundario hover:text-erro"><X size={13} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-borda px-5 py-3">
          <Button type="button" variante="secundaria" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" disabled={salvando}>{salvando && <Loader2 size={14} className="animate-spin" />} Salvar</Button>
        </div>
      </form>
    </div>
  );
}
