// Pasta vigiada: extratos .ofx/.csv jogados em Documentos\Dairus\<conta>\Importar
// são importados sozinhos (com as regras de categoria) e movidos para "Importados".

import { invoke } from "@tauri-apps/api/core";
import { lerPreferencia } from "./armazenamento";
import { contabilidade } from "./contabilidade";
import { padronizarDescricao, sugerirCategoria } from "./categorias";
import { chaveDeDuplicidade, lerExtrato } from "./importacao";
import { lancExtras } from "./lancamentosExtras";
import { CONTAS_SISTEMA } from "../types/accounting";

export const caminhoPastaImportar = () => invoke<string>("caminho_pasta_importar");

export interface ResultadoPasta {
  arquivos: number;
  importados: number;
  duplicados: number;
  erros: string[];
}

export async function importarDaPasta(forcar = false): Promise<ResultadoPasta> {
  const r: ResultadoPasta = { arquivos: 0, importados: 0, duplicados: 0, erros: [] };
  if (!forcar && !(await lerPreferencia<boolean>("pasta_vigiada"))) return r;
  const contaId = await lerPreferencia<string>("pasta_vigiada_conta");
  if (!contaId) return r;
  const inverter = (await lerPreferencia<boolean>("pasta_vigiada_inverter")) ?? false;
  const arquivos = await invoke<Array<{ nome: string; conteudo: string }>>("listar_pasta_importar");
  if (!arquivos.length) return r;
  const [contas, lancamentos, regras] = await Promise.all([contabilidade.listarContas(), contabilidade.listarLancamentos(5000), lancExtras.listarRegras()]);
  const existentes = new Set<string>();
  for (const l of lancamentos) for (const p of l.partidas) if (p.conta_id === contaId) existentes.add(chaveDeDuplicidade(l.data, p.valor_centavos));
  const outras = contas.find((c) => c.id === CONTAS_SISTEMA.despesaOutras)?.id ?? CONTAS_SISTEMA.despesaOutras;

  for (const arq of arquivos) {
    r.arquivos++;
    try {
      const linhas = lerExtrato(arq.nome, arq.conteudo);
      for (const bruta of linhas) {
        const valor = inverter ? -bruta.valorCentavos : bruta.valorCentavos;
        const chave = chaveDeDuplicidade(bruta.data, valor);
        if (existentes.has(chave)) {
          r.duplicados++;
          continue;
        }
        const descricao = padronizarDescricao(bruta.descricao);
        if (valor < 0) {
          const s = sugerirCategoria(bruta.descricao, "DESPESA", regras, lancamentos, contas);
          await contabilidade.registrarDespesa({ conta_origem_id: contaId, categoria_despesa_id: s?.categoriaId ?? outras, valor_centavos: -valor, data: bruta.data, descricao });
        } else if (valor > 0) {
          const s = sugerirCategoria(bruta.descricao, "RECEITA", regras, lancamentos, contas);
          await contabilidade.registrarRecebimento({ conta_destino_id: contaId, conta_receita_id: s?.categoriaId ?? CONTAS_SISTEMA.receitaRendaExtra, valor_centavos: valor, data: bruta.data, descricao });
        }
        existentes.add(chave);
        r.importados++;
      }
      await invoke("marcar_extrato_importado", { nome: arq.nome });
    } catch (e) {
      r.erros.push(`${arq.nome}: ${String(e)}`);
    }
  }
  return r;
}
