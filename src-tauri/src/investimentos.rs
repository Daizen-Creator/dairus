//! Investimentos: carteira de ativos, operações e indicadores de mercado.
//!
//! Compras, vendas e proventos viram lançamentos contábeis balanceados:
//! - compra: Débito Carteira de Investimentos (valor + taxas) / Crédito conta;
//! - venda: Débito conta (líquido) + Débito despesa (taxas/IR) / Crédito
//!   Carteira (custo pelo preço médio) e o lucro em receita (ou o prejuízo em despesa);
//! - provento: Débito conta (líquido) + Débito despesa (IR) / Crédito receita.
//! Assim o total investido entra no patrimônio líquido pelo custo.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::accounting::engine;
use crate::accounting::models::{NovoLancamentoInput, PartidaInput, TipoPartida};
use crate::commands::AppState;

type Res<T> = Result<T, String>;

const CARTEIRA: &str = "ativo-investimentos";
const RECEITA: &str = "receita-investimentos";
const DESPESA: &str = "despesa-investimentos";
/// Conta especial: "já tinha esse investimento" (entra no patrimônio sem tirar dinheiro de conta).
pub const JA_TINHA: &str = "patrimonio-saldo-inicial";

const CLASSES: [&str; 12] = ["ACAO", "FII", "ETF", "BDR", "TESOURO", "CDB", "LCI", "LCA", "POUPANCA", "CRIPTO", "PREVIDENCIA", "OUTRO"];
const TIPOS: [&str; 6] = ["COMPRA", "VENDA", "DIVIDENDO", "JCP", "RENDIMENTO", "AMORTIZACAO"];

fn e<T: std::fmt::Display>(erro: T) -> String {
    erro.to_string()
}

#[derive(Debug, Serialize, Clone)]
pub struct AtivoInvest {
    pub id: String,
    pub codigo: String,
    pub nome: Option<String>,
    pub classe: String,
    pub indexador: Option<String>,
    pub taxa: Option<f64>,
    pub vencimento: Option<String>,
    pub objetivo: Option<String>,
    pub setor: Option<String>,
    pub risco: Option<String>,
    pub moeda: String,
    pub cotacao: Option<f64>,
    pub cotacao_em: Option<String>,
    pub alerta_acima: Option<f64>,
    pub alerta_abaixo: Option<f64>,
    pub ativo: bool,
    pub notas: Option<String>,
    // Posição calculada a partir das operações.
    pub quantidade: f64,
    pub custo_centavos: i64,
    pub preco_medio: f64,
    pub proventos_centavos: i64,
    pub lucro_realizado_centavos: i64,
    pub primeira_compra: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AtivoInput {
    #[serde(default)]
    pub id: Option<String>,
    pub codigo: String,
    #[serde(default)]
    pub nome: Option<String>,
    pub classe: String,
    #[serde(default)]
    pub indexador: Option<String>,
    #[serde(default)]
    pub taxa: Option<f64>,
    #[serde(default)]
    pub vencimento: Option<String>,
    #[serde(default)]
    pub objetivo: Option<String>,
    #[serde(default)]
    pub setor: Option<String>,
    #[serde(default)]
    pub risco: Option<String>,
    #[serde(default)]
    pub moeda: Option<String>,
    #[serde(default)]
    pub alerta_acima: Option<f64>,
    #[serde(default)]
    pub alerta_abaixo: Option<f64>,
    #[serde(default)]
    pub notas: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct OperacaoInvest {
    pub id: String,
    pub ativo_id: String,
    pub tipo: String,
    pub data: String,
    pub quantidade: f64,
    pub preco_unitario: f64,
    pub taxas_centavos: i64,
    pub valor_centavos: i64,
    pub ir_retido_centavos: i64,
    pub custo_centavos: Option<i64>,
    pub day_trade: bool,
    pub conta_id: Option<String>,
    pub lancamento_id: Option<String>,
    pub notas: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct OperacaoInput {
    pub ativo_id: String,
    pub tipo: String,
    pub data: String,
    #[serde(default)]
    pub quantidade: f64,
    #[serde(default)]
    pub preco_unitario: f64,
    #[serde(default)]
    pub taxas_centavos: i64,
    /// Para compra/venda pode vir vazio: é calculado como quantidade x preço.
    #[serde(default)]
    pub valor_centavos: Option<i64>,
    #[serde(default)]
    pub ir_retido_centavos: i64,
    #[serde(default)]
    pub day_trade: bool,
    /// Conta de onde sai/para onde vai o dinheiro. `None` = só registra na carteira.
    #[serde(default)]
    pub conta_id: Option<String>,
    #[serde(default)]
    pub notas: Option<String>,
}

#[derive(Debug, Default, Clone, PartialEq)]
pub struct Posicao {
    pub quantidade: f64,
    pub custo_centavos: i64,
    pub proventos_centavos: i64,
    pub lucro_realizado_centavos: i64,
    pub primeira_compra: Option<String>,
}

const QTD_EPS: f64 = 1e-9;

/// Posição de um ativo (preço médio com taxas incluídas no custo).
pub fn posicao(ops: &[OperacaoInvest]) -> Posicao {
    let mut p = Posicao::default();
    for op in ops {
        match op.tipo.as_str() {
            "COMPRA" => {
                p.quantidade += op.quantidade;
                p.custo_centavos += op.valor_centavos + op.taxas_centavos;
                if p.primeira_compra.is_none() {
                    p.primeira_compra = Some(op.data.clone());
                }
            }
            "VENDA" => {
                let custo = op.custo_centavos.unwrap_or_else(|| custo_da_venda(&p, op.quantidade));
                p.quantidade -= op.quantidade;
                p.custo_centavos -= custo;
                p.lucro_realizado_centavos += op.valor_centavos - op.taxas_centavos - custo;
                if p.quantidade.abs() < QTD_EPS {
                    p.quantidade = 0.0;
                    p.custo_centavos = 0;
                }
            }
            "AMORTIZACAO" => {
                // Devolução de capital: reduz o custo, sem mexer na quantidade.
                p.custo_centavos = (p.custo_centavos - op.valor_centavos).max(0);
            }
            _ => p.proventos_centavos += op.valor_centavos,
        }
    }
    p
}

fn custo_da_venda(p: &Posicao, quantidade: f64) -> i64 {
    if p.quantidade <= QTD_EPS {
        return 0;
    }
    if (quantidade - p.quantidade).abs() < QTD_EPS {
        return p.custo_centavos;
    }
    ((p.custo_centavos as f64) * quantidade / p.quantidade).round() as i64
}

fn ler_operacoes(conn: &Connection, ativo_id: Option<&str>) -> Res<Vec<OperacaoInvest>> {
    let sql = "SELECT id, ativo_id, tipo, data, quantidade, preco_unitario, taxas_centavos, valor_centavos,
                      ir_retido_centavos, custo_centavos, day_trade, conta_id, lancamento_id, notas
               FROM operacoes_invest WHERE (?1 IS NULL OR ativo_id = ?1) ORDER BY data, criado_em, rowid";
    let mut stmt = conn.prepare(sql).map_err(e)?;
    let linhas = stmt
        .query_map([ativo_id], |r| {
            Ok(OperacaoInvest {
                id: r.get(0)?,
                ativo_id: r.get(1)?,
                tipo: r.get(2)?,
                data: r.get(3)?,
                quantidade: r.get(4)?,
                preco_unitario: r.get(5)?,
                taxas_centavos: r.get(6)?,
                valor_centavos: r.get(7)?,
                ir_retido_centavos: r.get(8)?,
                custo_centavos: r.get(9)?,
                day_trade: r.get::<_, i64>(10)? != 0,
                conta_id: r.get(11)?,
                lancamento_id: r.get(12)?,
                notas: r.get(13)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(linhas)
}

pub fn listar_ativos(conn: &Connection) -> Res<Vec<AtivoInvest>> {
    let ops = ler_operacoes(conn, None)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, codigo, nome, classe, indexador, taxa, vencimento, objetivo, setor, risco, moeda,
                    cotacao, cotacao_em, alerta_acima, alerta_abaixo, ativo, notas
             FROM ativos_invest ORDER BY ativo DESC, classe, codigo",
        )
        .map_err(e)?;
    let ativos = stmt
        .query_map([], |r| {
            Ok(AtivoInvest {
                id: r.get(0)?,
                codigo: r.get(1)?,
                nome: r.get(2)?,
                classe: r.get(3)?,
                indexador: r.get(4)?,
                taxa: r.get(5)?,
                vencimento: r.get(6)?,
                objetivo: r.get(7)?,
                setor: r.get(8)?,
                risco: r.get(9)?,
                moeda: r.get(10)?,
                cotacao: r.get(11)?,
                cotacao_em: r.get(12)?,
                alerta_acima: r.get(13)?,
                alerta_abaixo: r.get(14)?,
                ativo: r.get::<_, i64>(15)? != 0,
                notas: r.get(16)?,
                quantidade: 0.0,
                custo_centavos: 0,
                preco_medio: 0.0,
                proventos_centavos: 0,
                lucro_realizado_centavos: 0,
                primeira_compra: None,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(ativos
        .into_iter()
        .map(|mut a| {
            let do_ativo: Vec<OperacaoInvest> = ops.iter().filter(|o| o.ativo_id == a.id).cloned().collect();
            let p = posicao(&do_ativo);
            a.quantidade = p.quantidade;
            a.custo_centavos = p.custo_centavos;
            a.preco_medio = if p.quantidade > QTD_EPS { p.custo_centavos as f64 / 100.0 / p.quantidade } else { 0.0 };
            a.proventos_centavos = p.proventos_centavos;
            a.lucro_realizado_centavos = p.lucro_realizado_centavos;
            a.primeira_compra = p.primeira_compra;
            a
        })
        .collect())
}

fn texto_opcional(t: Option<String>) -> Option<String> {
    t.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

pub fn salvar_ativo(conn: &Connection, input: AtivoInput) -> Res<String> {
    let codigo = input.codigo.trim().to_uppercase();
    if codigo.is_empty() {
        return Err("Informe o código ou nome do ativo (ex.: PETR4, CDB Banco X).".into());
    }
    if !CLASSES.contains(&input.classe.as_str()) {
        return Err("Classe de ativo inválida.".into());
    }
    if let Some(ix) = &input.indexador {
        if !["CDI", "SELIC", "IPCA", "PRE"].contains(&ix.as_str()) {
            return Err("Indexador inválido.".into());
        }
    }
    if let Some(v) = &input.vencimento {
        if chrono::NaiveDate::parse_from_str(v, "%Y-%m-%d").is_err() {
            return Err("Data de vencimento inválida.".into());
        }
    }
    let moeda = input.moeda.unwrap_or_else(|| "BRL".into());
    match input.id {
        Some(id) => {
            let n = conn
                .execute(
                    "UPDATE ativos_invest SET codigo=?1, nome=?2, classe=?3, indexador=?4, taxa=?5, vencimento=?6, objetivo=?7,
                     setor=?8, risco=?9, moeda=?10, alerta_acima=?11, alerta_abaixo=?12, notas=?13 WHERE id=?14",
                    params![
                        codigo, texto_opcional(input.nome), input.classe, input.indexador, input.taxa, input.vencimento,
                        texto_opcional(input.objetivo), texto_opcional(input.setor), input.risco, moeda,
                        input.alerta_acima, input.alerta_abaixo, texto_opcional(input.notas), id
                    ],
                )
                .map_err(e)?;
            if n == 0 {
                return Err("Ativo não encontrado.".into());
            }
            Ok(id)
        }
        None => {
            let id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO ativos_invest (id, codigo, nome, classe, indexador, taxa, vencimento, objetivo, setor, risco, moeda,
                 alerta_acima, alerta_abaixo, notas) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
                params![
                    id, codigo, texto_opcional(input.nome), input.classe, input.indexador, input.taxa, input.vencimento,
                    texto_opcional(input.objetivo), texto_opcional(input.setor), input.risco, moeda,
                    input.alerta_acima, input.alerta_abaixo, texto_opcional(input.notas)
                ],
            )
            .map_err(e)?;
            Ok(id)
        }
    }
}

fn partida(conta: &str, tipo: TipoPartida, valor: i64) -> Option<PartidaInput> {
    (valor > 0).then(|| PartidaInput { conta_id: conta.to_string(), tipo, valor_centavos: valor })
}

/// Partidas contábeis de uma operação (já balanceadas).
pub fn partidas_da_operacao(op: &OperacaoInvest, conta: &str) -> Vec<PartidaInput> {
    use TipoPartida::{Credito, Debito};
    let mut v: Vec<Option<PartidaInput>> = Vec::new();
    match op.tipo.as_str() {
        "COMPRA" => {
            let total = op.valor_centavos + op.taxas_centavos;
            v.push(partida(CARTEIRA, Debito, total));
            v.push(partida(conta, Credito, total));
        }
        "VENDA" => {
            let custo = op.custo_centavos.unwrap_or(0);
            let descontos = op.taxas_centavos + op.ir_retido_centavos;
            let liquido = op.valor_centavos - descontos;
            let resultado = op.valor_centavos - custo;
            v.push(partida(conta, Debito, liquido));
            v.push(partida(DESPESA, Debito, descontos));
            v.push(partida(CARTEIRA, Credito, custo));
            if resultado >= 0 {
                v.push(partida(RECEITA, Credito, resultado));
            } else {
                v.push(partida(DESPESA, Debito, -resultado));
            }
        }
        "AMORTIZACAO" => {
            v.push(partida(conta, Debito, op.valor_centavos - op.ir_retido_centavos));
            v.push(partida(DESPESA, Debito, op.ir_retido_centavos));
            v.push(partida(CARTEIRA, Credito, op.valor_centavos));
        }
        _ => {
            v.push(partida(conta, Debito, op.valor_centavos - op.ir_retido_centavos));
            v.push(partida(DESPESA, Debito, op.ir_retido_centavos));
            v.push(partida(RECEITA, Credito, op.valor_centavos));
        }
    }
    v.into_iter().flatten().collect()
}

fn descricao_operacao(op: &OperacaoInvest, codigo: &str) -> String {
    let qtd = if op.quantidade.fract() == 0.0 { format!("{}", op.quantidade as i64) } else { format!("{:.6}", op.quantidade).trim_end_matches('0').to_string() };
    match op.tipo.as_str() {
        "COMPRA" => format!("Compra de {qtd} {codigo}"),
        "VENDA" => format!("Venda de {qtd} {codigo}"),
        "DIVIDENDO" => format!("Dividendos de {codigo}"),
        "JCP" => format!("JCP de {codigo}"),
        "RENDIMENTO" => format!("Rendimento de {codigo}"),
        _ => format!("Amortização de {codigo}"),
    }
}

pub fn registrar_operacao(conn: &mut Connection, input: OperacaoInput) -> Res<OperacaoInvest> {
    if !TIPOS.contains(&input.tipo.as_str()) {
        return Err("Tipo de operação inválido.".into());
    }
    if chrono::NaiveDate::parse_from_str(&input.data, "%Y-%m-%d").is_err() {
        return Err("Data inválida.".into());
    }
    if input.taxas_centavos < 0 || input.ir_retido_centavos < 0 {
        return Err("Taxas e IR não podem ser negativos.".into());
    }
    let codigo: String = conn
        .query_row("SELECT codigo FROM ativos_invest WHERE id = ?1", [&input.ativo_id], |r| r.get(0))
        .optional()
        .map_err(e)?
        .ok_or("Ativo não encontrado.")?;
    let negociacao = input.tipo == "COMPRA" || input.tipo == "VENDA";
    if negociacao && (input.quantidade <= 0.0 || input.preco_unitario < 0.0) {
        return Err("Informe a quantidade e o preço.".into());
    }
    let valor = match input.valor_centavos {
        Some(v) => v,
        None if negociacao => (input.quantidade * input.preco_unitario * 100.0).round() as i64,
        None => return Err("Informe o valor recebido.".into()),
    };
    if valor <= 0 {
        return Err("O valor precisa ser maior que zero.".into());
    }

    let anteriores = ler_operacoes(conn, Some(&input.ativo_id))?;
    let ate_a_data: Vec<OperacaoInvest> = anteriores.iter().filter(|o| o.data <= input.data).cloned().collect();
    if anteriores.iter().any(|o| o.data > input.data) && input.tipo == "VENDA" {
        return Err("Há operações depois desta data; registre as vendas em ordem cronológica.".into());
    }
    let pos = posicao(&ate_a_data);
    let custo = if input.tipo == "VENDA" {
        if input.quantidade > pos.quantidade + QTD_EPS {
            return Err(format!("Você só tem {} deste ativo nesta data.", pos.quantidade));
        }
        Some(custo_da_venda(&pos, input.quantidade))
    } else {
        None
    };
    if input.ir_retido_centavos + if input.tipo == "VENDA" { input.taxas_centavos } else { 0 } > valor {
        return Err("Taxas e IR maiores que o valor da operação.".into());
    }

    let mut op = OperacaoInvest {
        id: Uuid::new_v4().to_string(),
        ativo_id: input.ativo_id,
        tipo: input.tipo,
        data: input.data,
        quantidade: if negociacao { input.quantidade } else { 0.0 },
        preco_unitario: if negociacao { input.preco_unitario } else { 0.0 },
        taxas_centavos: input.taxas_centavos,
        valor_centavos: valor,
        ir_retido_centavos: input.ir_retido_centavos,
        custo_centavos: custo,
        day_trade: input.day_trade,
        conta_id: input.conta_id.filter(|c| !c.is_empty()),
        lancamento_id: None,
        notas: texto_opcional(input.notas),
    };

    if let Some(conta) = op.conta_id.clone() {
        let ja_tinha = conta == JA_TINHA;
        if ja_tinha && op.tipo != "COMPRA" {
            return Err("\"Já tinha\" vale só para registrar compras antigas.".into());
        }
        let partidas = partidas_da_operacao(&op, &conta);
        let lanc = engine::criar_lancamento(
            conn,
            NovoLancamentoInput {
                data: op.data.clone(),
                descricao: descricao_operacao(&op, &codigo),
                observacao: op.notas.clone(),
                origem: if ja_tinha {
                    "SALDO_INICIAL".into()
                } else if op.tipo == "COMPRA" {
                    "TRANSFERENCIA".into()
                } else if op.tipo == "VENDA" {
                    "MANUAL".into()
                } else {
                    "SALARIO".into()
                },
                etiqueta: None,
                parcelas: None,
                partidas,
            },
        )
        .map_err(String::from)?;
        op.lancamento_id = Some(lanc.id);
    }

    conn.execute(
        "INSERT INTO operacoes_invest (id, ativo_id, tipo, data, quantidade, preco_unitario, taxas_centavos, valor_centavos,
         ir_retido_centavos, custo_centavos, day_trade, conta_id, lancamento_id, notas)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
        params![
            op.id, op.ativo_id, op.tipo, op.data, op.quantidade, op.preco_unitario, op.taxas_centavos, op.valor_centavos,
            op.ir_retido_centavos, op.custo_centavos, op.day_trade as i64, op.conta_id, op.lancamento_id, op.notas
        ],
    )
    .map_err(e)?;
    Ok(op)
}

/// Exclui uma operação (só a mais recente do ativo, para não bagunçar o preço
/// médio das vendas seguintes). O lançamento contábil dela é estornado.
pub fn excluir_operacao(conn: &mut Connection, id: &str) -> Res<()> {
    let (ativo_id, lancamento): (String, Option<String>) = conn
        .query_row("SELECT ativo_id, lancamento_id FROM operacoes_invest WHERE id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()
        .map_err(e)?
        .ok_or("Operação não encontrada.")?;
    let ops = ler_operacoes(conn, Some(&ativo_id))?;
    if ops.last().map(|o| o.id.as_str()) != Some(id) {
        return Err("Só a operação mais recente do ativo pode ser excluída. Exclua as posteriores antes.".into());
    }
    if let Some(l) = lancamento {
        let ja_estornado: bool = conn
            .query_row("SELECT EXISTS(SELECT 1 FROM lancamentos WHERE estornado_de = ?1)", [&l], |r| r.get(0))
            .map_err(e)?;
        if !ja_estornado {
            engine::estornar_lancamento(conn, &l).map_err(String::from)?;
        }
    }
    conn.execute("DELETE FROM operacoes_invest WHERE id = ?1", [id]).map_err(e)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Comandos

#[tauri::command]
pub fn listar_ativos_invest(state: State<AppState>) -> Res<Vec<AtivoInvest>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    listar_ativos(&conn)
}

#[tauri::command]
pub fn salvar_ativo_invest(state: State<AppState>, input: AtivoInput) -> Res<String> {
    let conn = state.conn.lock().expect("mutex envenenado");
    salvar_ativo(&conn, input)
}

#[tauri::command]
pub fn arquivar_ativo_invest(state: State<AppState>, id: String, arquivar: bool) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    conn.execute("UPDATE ativos_invest SET ativo = ?1 WHERE id = ?2", params![!arquivar as i64, id]).map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn excluir_ativo_invest(state: State<AppState>, id: String) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let tem: bool = conn
        .query_row("SELECT EXISTS(SELECT 1 FROM operacoes_invest WHERE ativo_id = ?1)", [&id], |r| r.get(0))
        .map_err(e)?;
    if tem {
        return Err("Este ativo tem operações; arquive-o em vez de excluir.".into());
    }
    conn.execute("DELETE FROM ativos_invest WHERE id = ?1", [&id]).map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn registrar_operacao_invest(state: State<AppState>, input: OperacaoInput) -> Res<OperacaoInvest> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    registrar_operacao(&mut conn, input)
}

#[tauri::command]
pub fn listar_operacoes_invest(state: State<AppState>, ativo_id: Option<String>) -> Res<Vec<OperacaoInvest>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    ler_operacoes(&conn, ativo_id.as_deref())
}

#[tauri::command]
pub fn excluir_operacao_invest(state: State<AppState>, id: String) -> Res<()> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    excluir_operacao(&mut conn, &id)
}

#[derive(Debug, Deserialize)]
pub struct Cotacao {
    pub id: String,
    pub cotacao: f64,
}

#[tauri::command]
pub fn atualizar_cotacoes(state: State<AppState>, cotacoes: Vec<Cotacao>) -> Res<usize> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let agora = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
    let mut n = 0;
    for c in cotacoes.iter().filter(|c| c.cotacao.is_finite() && c.cotacao >= 0.0) {
        n += conn
            .execute("UPDATE ativos_invest SET cotacao = ?1, cotacao_em = ?2 WHERE id = ?3", params![c.cotacao, agora, c.id])
            .map_err(e)?;
    }
    Ok(n)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PontoIndicador {
    pub data: String,
    pub valor: f64,
}

#[tauri::command]
pub fn salvar_indicadores(state: State<AppState>, serie: String, pontos: Vec<PontoIndicador>) -> Res<usize> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut n = 0;
    for p in pontos {
        n += conn
            .execute("INSERT OR REPLACE INTO indicadores (serie, data, valor) VALUES (?1, ?2, ?3)", params![serie, p.data, p.valor])
            .map_err(e)?;
    }
    Ok(n)
}

#[tauri::command]
pub fn listar_indicadores(state: State<AppState>, serie: String, desde: String) -> Res<Vec<PontoIndicador>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn.prepare("SELECT data, valor FROM indicadores WHERE serie = ?1 AND data >= ?2 ORDER BY data").map_err(e)?;
    let v = stmt
        .query_map(params![serie, desde], |r| Ok(PontoIndicador { data: r.get(0)?, valor: r.get(1)? }))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(v)
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::db::{abrir_conexao, executar_migracoes};

    fn banco() -> Connection {
        let conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        executar_migracoes(&conn).unwrap();
        conn
    }

    fn ativo(conn: &Connection, codigo: &str) -> String {
        salvar_ativo(
            conn,
            AtivoInput {
                id: None, codigo: codigo.into(), nome: None, classe: "ACAO".into(), indexador: None, taxa: None,
                vencimento: None, objetivo: None, setor: None, risco: None, moeda: None, alerta_acima: None,
                alerta_abaixo: None, notas: None,
            },
        )
        .unwrap()
    }

    fn op(ativo: &str, tipo: &str, data: &str, q: f64, preco: f64, taxas: i64, valor: Option<i64>) -> OperacaoInput {
        OperacaoInput {
            ativo_id: ativo.into(), tipo: tipo.into(), data: data.into(), quantidade: q, preco_unitario: preco,
            taxas_centavos: taxas, valor_centavos: valor, ir_retido_centavos: 0, day_trade: false,
            conta_id: Some("ativo-dinheiro".into()), notas: None,
        }
    }

    #[test]
    fn preco_medio_venda_e_contabilidade() {
        let mut conn = banco();
        let a = ativo(&conn, "petr4");
        registrar_operacao(&mut conn, op(&a, "COMPRA", "2026-01-10", 100.0, 30.0, 500, None)).unwrap(); // 3.000 + 5 taxas
        registrar_operacao(&mut conn, op(&a, "COMPRA", "2026-02-10", 100.0, 40.0, 500, None)).unwrap(); // 4.000 + 5
        let lista = listar_ativos(&conn).unwrap();
        assert_eq!(lista[0].codigo, "PETR4");
        assert_eq!(lista[0].quantidade, 200.0);
        assert_eq!(lista[0].custo_centavos, 701_000);
        assert!((lista[0].preco_medio - 35.05).abs() < 1e-9);
        assert_eq!(engine::saldo_conta(&conn, CARTEIRA).unwrap(), 701_000);
        assert_eq!(engine::saldo_conta(&conn, "ativo-dinheiro").unwrap(), -701_000);

        // Vende metade a R$ 50: custo 3.505, valor 5.000, taxa 5 → lucro 1.490.
        let venda = registrar_operacao(&mut conn, op(&a, "VENDA", "2026-03-10", 100.0, 50.0, 500, None)).unwrap();
        assert_eq!(venda.custo_centavos, Some(350_500));
        let lista = listar_ativos(&conn).unwrap();
        assert_eq!(lista[0].quantidade, 100.0);
        assert_eq!(lista[0].custo_centavos, 350_500);
        assert_eq!(lista[0].lucro_realizado_centavos, 149_000);
        assert_eq!(engine::saldo_conta(&conn, CARTEIRA).unwrap(), 350_500);
        assert_eq!(engine::saldo_conta(&conn, RECEITA).unwrap(), 149_500);
        assert_eq!(engine::saldo_conta(&conn, DESPESA).unwrap(), 500);
        assert_eq!(engine::saldo_conta(&conn, "ativo-dinheiro").unwrap(), -701_000 + 499_500);

        // Não deixa vender mais do que tem.
        assert!(registrar_operacao(&mut conn, op(&a, "VENDA", "2026-03-11", 101.0, 50.0, 0, None)).is_err());
    }

    #[test]
    fn venda_com_prejuizo_e_provento_com_ir() {
        let mut conn = banco();
        let a = ativo(&conn, "MXRF11");
        registrar_operacao(&mut conn, op(&a, "COMPRA", "2026-01-10", 10.0, 10.0, 0, None)).unwrap();
        registrar_operacao(&mut conn, op(&a, "VENDA", "2026-02-10", 10.0, 8.0, 0, None)).unwrap();
        assert_eq!(engine::saldo_conta(&conn, DESPESA).unwrap(), 2_000);
        assert_eq!(engine::saldo_conta(&conn, CARTEIRA).unwrap(), 0);

        let mut jcp = op(&a, "JCP", "2026-02-15", 0.0, 0.0, 0, Some(1_000));
        jcp.ir_retido_centavos = 150;
        registrar_operacao(&mut conn, jcp).unwrap();
        assert_eq!(engine::saldo_conta(&conn, RECEITA).unwrap(), 1_000);
        assert_eq!(engine::saldo_conta(&conn, "ativo-dinheiro").unwrap(), -10_000 + 8_000 + 850);
        assert_eq!(listar_ativos(&conn).unwrap()[0].proventos_centavos, 1_000);
    }

    #[test]
    fn excluir_so_a_ultima_e_estorna() {
        let mut conn = banco();
        let a = ativo(&conn, "ITUB4");
        let o1 = registrar_operacao(&mut conn, op(&a, "COMPRA", "2026-01-10", 1.0, 10.0, 0, None)).unwrap();
        let o2 = registrar_operacao(&mut conn, op(&a, "COMPRA", "2026-01-11", 1.0, 10.0, 0, None)).unwrap();
        assert!(excluir_operacao(&mut conn, &o1.id).is_err());
        excluir_operacao(&mut conn, &o2.id).unwrap();
        assert_eq!(engine::saldo_conta(&conn, CARTEIRA).unwrap(), 1_000);
        assert_eq!(listar_ativos(&conn).unwrap()[0].quantidade, 1.0);
    }

    #[test]
    fn ja_tinha_entra_no_patrimonio_sem_mexer_em_conta() {
        let mut conn = banco();
        let a = ativo(&conn, "BOVA11");
        let mut o = op(&a, "COMPRA", "2025-06-01", 10.0, 100.0, 0, None);
        o.conta_id = Some(JA_TINHA.into());
        registrar_operacao(&mut conn, o).unwrap();
        assert_eq!(engine::saldo_conta(&conn, CARTEIRA).unwrap(), 100_000);
        assert_eq!(engine::saldo_conta(&conn, "ativo-dinheiro").unwrap(), 0);
    }
}
