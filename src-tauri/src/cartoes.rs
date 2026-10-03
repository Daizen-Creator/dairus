//! Cartões: faturas fechadas (congeladas), adicionais, reembolsos e encargos.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

use crate::accounting::engine;
use crate::accounting::models::{Lancamento, NovoLancamentoInput, PartidaInput, TipoPartida};
use crate::commands::AppState;

type Res<T> = Result<T, String>;
pub const ENCARGOS: &str = "despesa-encargos-cartao";

fn e<T: std::fmt::Display>(erro: T) -> String {
    erro.to_string()
}

fn eh_cartao(conn: &Connection, id: &str) -> Res<()> {
    let ok: bool = conn
        .query_row("SELECT EXISTS(SELECT 1 FROM contas_contabeis WHERE id = ?1 AND subtipo = 'CARTAO_CREDITO')", [id], |r| r.get(0))
        .map_err(e)?;
    if ok {
        Ok(())
    } else {
        Err("Cartão não encontrado.".into())
    }
}

#[derive(Serialize)]
pub struct Fatura {
    pub id: String,
    pub cartao_id: String,
    pub inicio: String,
    pub fechamento: String,
    pub vencimento: String,
    pub valor_centavos: i64,
    pub encargos_lancamento_id: Option<String>,
}

#[tauri::command]
pub fn listar_faturas(state: State<AppState>) -> Res<Vec<Fatura>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn
        .prepare("SELECT id, cartao_id, inicio, fechamento, vencimento, valor_centavos, encargos_lancamento_id FROM faturas ORDER BY fechamento DESC")
        .map_err(e)?;
    let v = stmt
        .query_map([], |r| {
            Ok(Fatura {
                id: r.get(0)?,
                cartao_id: r.get(1)?,
                inicio: r.get(2)?,
                fechamento: r.get(3)?,
                vencimento: r.get(4)?,
                valor_centavos: r.get(5)?,
                encargos_lancamento_id: r.get(6)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(v)
}

pub fn congelar(conn: &Connection, cartao_id: &str, inicio: &str, fechamento: &str, vencimento: &str, valor: i64) -> Res<bool> {
    eh_cartao(conn, cartao_id)?;
    for d in [inicio, fechamento, vencimento] {
        chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").map_err(|_| "Data inválida.".to_string())?;
    }
    let n = conn
        .execute(
            "INSERT OR IGNORE INTO faturas (id, cartao_id, inicio, fechamento, vencimento, valor_centavos) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![Uuid::new_v4().to_string(), cartao_id, inicio, fechamento, vencimento, valor],
        )
        .map_err(e)?;
    Ok(n > 0)
}

/// Guarda o valor da fatura no fechamento. Se já foi guardada, não muda (fatura congelada).
#[tauri::command]
pub fn congelar_fatura(state: State<AppState>, cartao_id: String, inicio: String, fechamento: String, vencimento: String, valor_centavos: i64) -> Res<bool> {
    let conn = state.conn.lock().expect("mutex envenenado");
    congelar(&conn, &cartao_id, &inicio, &fechamento, &vencimento, valor_centavos)
}

#[derive(Serialize)]
pub struct ConfigCartao {
    pub cartao_id: String,
    pub juros_rotativo: Option<f64>,
}

#[tauri::command]
pub fn listar_config_cartoes(state: State<AppState>) -> Res<Vec<ConfigCartao>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn
        .prepare("SELECT id, juros_rotativo FROM contas_contabeis WHERE subtipo = 'CARTAO_CREDITO'")
        .map_err(e)?;
    let v = stmt
        .query_map([], |r| Ok(ConfigCartao { cartao_id: r.get(0)?, juros_rotativo: r.get(1)? }))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(v)
}

/// Juros do rotativo ao mês (fração, ex.: 0.14 = 14% a.m.).
#[tauri::command]
pub fn definir_juros_cartao(state: State<AppState>, cartao_id: String, juros_mensal: Option<f64>) -> Res<()> {
    if let Some(j) = juros_mensal {
        if !(0.0..=1.0).contains(&j) {
            return Err("Juros ao mês entre 0% e 100%.".into());
        }
    }
    let conn = state.conn.lock().expect("mutex envenenado");
    eh_cartao(&conn, &cartao_id)?;
    conn.execute("UPDATE contas_contabeis SET juros_rotativo = ?1 WHERE id = ?2", params![juros_mensal, cartao_id]).map_err(e)?;
    Ok(())
}

/// Lança juros, multa e IOF de uma fatura paga com atraso ou parcialmente:
/// Débito em "Juros, Multas e IOF do Cartão", Crédito no cartão (entra na próxima fatura).
#[tauri::command]
pub fn lancar_encargos(state: State<AppState>, fatura_id: String, data: String, valor_centavos: i64, detalhe: String) -> Res<Lancamento> {
    if valor_centavos <= 0 {
        return Err("Valor dos encargos precisa ser maior que zero.".into());
    }
    let mut conn = state.conn.lock().expect("mutex envenenado");
    let (cartao, ja): (String, Option<String>) = conn
        .query_row("SELECT cartao_id, encargos_lancamento_id FROM faturas WHERE id = ?1", [&fatura_id], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()
        .map_err(e)?
        .ok_or("Fatura não encontrada.")?;
    if ja.is_some() {
        return Err("Os encargos desta fatura já foram lançados.".into());
    }
    let lanc = engine::criar_lancamento(
        &mut conn,
        NovoLancamentoInput {
            data,
            descricao: "Encargos do cartão (juros, multa e IOF)".into(),
            observacao: Some(detalhe).filter(|d| !d.trim().is_empty()),
            origem: "CARTAO".into(),
            etiqueta: None,
            parcelas: None,
            partidas: vec![
                PartidaInput { conta_id: ENCARGOS.into(), tipo: TipoPartida::Debito, valor_centavos },
                PartidaInput { conta_id: cartao, tipo: TipoPartida::Credito, valor_centavos },
            ],
        },
    )
    .map_err(String::from)?;
    conn.execute("UPDATE faturas SET encargos_lancamento_id = ?1 WHERE id = ?2", params![lanc.id, fatura_id]).map_err(e)?;
    Ok(lanc)
}

#[derive(Serialize)]
pub struct Adicional {
    pub id: String,
    pub cartao_id: String,
    pub nome: String,
    pub final_cartao: Option<String>,
    pub limite_centavos: Option<i64>,
}

#[tauri::command]
pub fn listar_adicionais(state: State<AppState>) -> Res<Vec<Adicional>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn.prepare("SELECT id, cartao_id, nome, final, limite_centavos FROM cartoes_adicionais ORDER BY nome").map_err(e)?;
    let v = stmt
        .query_map([], |r| Ok(Adicional { id: r.get(0)?, cartao_id: r.get(1)?, nome: r.get(2)?, final_cartao: r.get(3)?, limite_centavos: r.get(4)? }))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(v)
}

#[tauri::command]
pub fn criar_adicional(state: State<AppState>, cartao_id: String, nome: String, final_cartao: Option<String>, limite_centavos: Option<i64>) -> Res<String> {
    let nome = nome.trim().to_string();
    if nome.is_empty() {
        return Err("Informe o nome de quem usa o cartão adicional.".into());
    }
    let final_cartao = final_cartao.map(|f| f.chars().filter(|c| c.is_ascii_digit()).collect::<String>()).filter(|f| !f.is_empty());
    let conn = state.conn.lock().expect("mutex envenenado");
    eh_cartao(&conn, &cartao_id)?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO cartoes_adicionais (id, cartao_id, nome, final, limite_centavos) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, cartao_id, nome, final_cartao, limite_centavos.filter(|l| *l > 0)],
    )
    .map_err(e)?;
    Ok(id)
}

#[tauri::command]
pub fn excluir_adicional(state: State<AppState>, id: String) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    conn.execute("DELETE FROM cartoes_adicionais WHERE id = ?1", [&id]).map_err(e)?;
    Ok(())
}

/// Diz quem usou a compra (adicional). `None` = titular.
#[tauri::command]
pub fn definir_portador(state: State<AppState>, lancamento_id: String, adicional_id: Option<String>) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    conn.execute("DELETE FROM lancamento_portador WHERE lancamento_id = ?1", [&lancamento_id]).map_err(e)?;
    if let Some(a) = adicional_id {
        conn.execute("INSERT INTO lancamento_portador (lancamento_id, adicional_id) VALUES (?1, ?2)", params![lancamento_id, a]).map_err(e)?;
    }
    Ok(())
}

#[derive(Serialize)]
pub struct VinculoCartao {
    pub lancamento_id: String,
    pub outro_id: String,
}

#[tauri::command]
pub fn listar_portadores(state: State<AppState>) -> Res<Vec<VinculoCartao>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn.prepare("SELECT lancamento_id, adicional_id FROM lancamento_portador").map_err(e)?;
    let v = stmt
        .query_map([], |r| Ok(VinculoCartao { lancamento_id: r.get(0)?, outro_id: r.get(1)? }))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(v)
}

#[tauri::command]
pub fn listar_reembolsos(state: State<AppState>) -> Res<Vec<VinculoCartao>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn.prepare("SELECT reembolso_id, compra_id FROM reembolsos").map_err(e)?;
    let v = stmt
        .query_map([], |r| Ok(VinculoCartao { lancamento_id: r.get(0)?, outro_id: r.get(1)? }))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(v)
}

/// Reembolso (total ou parcial) de uma compra no cartão: crédito no cartão e
/// devolução para as categorias da compra, na mesma proporção.
pub fn reembolsar(conn: &mut Connection, compra_id: &str, valor: i64, data: &str, motivo: Option<String>) -> Res<Lancamento> {
    if valor <= 0 {
        return Err("O valor do reembolso precisa ser maior que zero.".into());
    }
    chrono::NaiveDate::parse_from_str(data, "%Y-%m-%d").map_err(|_| "Data inválida.".to_string())?;
    let compra = engine::listar_lancamentos(conn, i64::MAX)
        .map_err(String::from)?
        .into_iter()
        .find(|l| l.id == compra_id)
        .ok_or("Compra não encontrada.")?;
    let estornada: bool = conn
        .query_row("SELECT EXISTS(SELECT 1 FROM lancamentos WHERE estornado_de = ?1)", [compra_id], |r| r.get(0))
        .map_err(e)?;
    if estornada {
        return Err("Esta compra já foi estornada inteira.".into());
    }
    let cartao = compra
        .partidas
        .iter()
        .find(|p| p.tipo == TipoPartida::Credito)
        .map(|p| p.conta_id.clone())
        .ok_or("Compra sem conta de pagamento.")?;
    let debitos: Vec<_> = compra.partidas.iter().filter(|p| p.tipo == TipoPartida::Debito).collect();
    let total: i64 = debitos.iter().map(|p| p.valor_centavos).sum();
    let ja_reembolsado: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(p.valor_centavos), 0) FROM reembolsos r JOIN partidas p ON p.lancamento_id = r.reembolso_id
             WHERE r.compra_id = ?1 AND p.tipo = 'DEBITO'
               AND NOT EXISTS (SELECT 1 FROM lancamentos x WHERE x.estornado_de = r.reembolso_id)",
            [compra_id],
            |r| r.get(0),
        )
        .map_err(e)?;
    if valor > total - ja_reembolsado {
        return Err(format!("O reembolso passa do valor da compra (resta {:.2}).", (total - ja_reembolsado) as f64 / 100.0).replace('.', ","));
    }
    // Reparte o valor entre as categorias da compra, o centavo que sobra fica na maior.
    let mut partes: Vec<i64> = debitos.iter().map(|p| ((p.valor_centavos as i128 * valor as i128) / total as i128) as i64).collect();
    let sobra = valor - partes.iter().sum::<i64>();
    if let Some(i) = (0..debitos.len()).max_by_key(|&i| debitos[i].valor_centavos) {
        partes[i] += sobra;
    }
    let mut partidas = vec![PartidaInput { conta_id: cartao, tipo: TipoPartida::Debito, valor_centavos: valor }];
    for (p, v) in debitos.iter().zip(partes) {
        if v > 0 {
            partidas.push(PartidaInput { conta_id: p.conta_id.clone(), tipo: TipoPartida::Credito, valor_centavos: v });
        }
    }
    let lanc = engine::criar_lancamento(
        conn,
        NovoLancamentoInput {
            data: data.to_string(),
            descricao: format!("Reembolso: {}", compra.descricao),
            observacao: motivo.filter(|m| !m.trim().is_empty()),
            origem: "CARTAO".into(),
            etiqueta: None,
            parcelas: None,
            partidas,
        },
    )
    .map_err(String::from)?;
    conn.execute("INSERT INTO reembolsos (reembolso_id, compra_id) VALUES (?1, ?2)", params![lanc.id, compra_id]).map_err(e)?;
    Ok(lanc)
}

#[tauri::command]
pub fn registrar_reembolso(state: State<AppState>, compra_id: String, valor_centavos: i64, data: String, motivo: Option<String>) -> Res<Lancamento> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    reembolsar(&mut conn, &compra_id, valor_centavos, &data, motivo)
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::accounting::models::{NovaContaInput, TipoConta};
    use crate::db::{abrir_conexao, executar_migracoes};

    fn preparar() -> (Connection, String, Lancamento) {
        let mut conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        executar_migracoes(&conn).unwrap();
        let c = engine::criar_conta(
            &mut conn,
            NovaContaInput {
                codigo: "2.1.7".into(), nome: "Nubank".into(), tipo: TipoConta::Passivo, subtipo: Some("CARTAO_CREDITO".into()),
                categoria_pai_id: None, instituicao: None, saldo_inicial_centavos: 0, dia_fechamento_fatura: Some(5),
                dia_vencimento_fatura: Some(12), limite_centavos: Some(100_000),
            },
        )
        .unwrap();
        let compra = engine::criar_lancamento(
            &mut conn,
            NovoLancamentoInput {
                data: "2026-09-10".into(), descricao: "Loja".into(), observacao: None, origem: "CARTAO".into(), etiqueta: None, parcelas: None,
                partidas: vec![
                    PartidaInput { conta_id: "despesa-vestuario".into(), tipo: TipoPartida::Debito, valor_centavos: 7_000 },
                    PartidaInput { conta_id: "despesa-outras".into(), tipo: TipoPartida::Debito, valor_centavos: 3_000 },
                    PartidaInput { conta_id: c.id.clone(), tipo: TipoPartida::Credito, valor_centavos: 10_000 },
                ],
            },
        )
        .unwrap();
        (conn, c.id, compra)
    }

    #[test]
    fn reembolso_parcial_proporcional_e_limite() {
        let (mut conn, cartao, compra) = preparar();
        reembolsar(&mut conn, &compra.id, 4_000, "2026-09-20", Some("devolvi uma peça".into())).unwrap();
        assert_eq!(engine::saldo_conta(&conn, &cartao).unwrap(), 6_000);
        assert_eq!(engine::saldo_conta(&conn, "despesa-vestuario").unwrap(), 7_000 - 2_800);
        assert_eq!(engine::saldo_conta(&conn, "despesa-outras").unwrap(), 3_000 - 1_200);
        assert!(reembolsar(&mut conn, &compra.id, 6_001, "2026-09-21", None).is_err());
        reembolsar(&mut conn, &compra.id, 6_000, "2026-09-21", None).unwrap();
        assert_eq!(engine::saldo_conta(&conn, &cartao).unwrap(), 0);
    }

    #[test]
    fn fatura_congela_uma_vez_e_encargos_entram_no_cartao() {
        let (conn, cartao, _) = preparar();
        assert!(congelar(&conn, &cartao, "2026-08-06", "2026-09-05", "2026-09-12", 10_000).unwrap());
        assert!(!congelar(&conn, &cartao, "2026-08-06", "2026-09-05", "2026-09-12", 99_999).unwrap());
        let valor: i64 = conn.query_row("SELECT valor_centavos FROM faturas", [], |r| r.get(0)).unwrap();
        assert_eq!(valor, 10_000);
        assert!(congelar(&conn, "despesa-outras", "2026-08-06", "2026-09-05", "2026-09-12", 1).is_err());
    }
}
