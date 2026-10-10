use std::sync::Mutex;

use rusqlite::Connection;
use serde::Deserialize;
use tauri::State;

use crate::accounting::engine;
use crate::accounting::error::AccountingError;
use crate::accounting::models::{
    Agendamento, Conta, Lancamento, NovaContaInput, NovoAgendamentoInput, NovoLancamentoInput, PartidaInput,
    TipoPartida,
};

pub struct AppState {
    pub conn: Mutex<Connection>,
}

#[tauri::command]
pub fn listar_contas(state: State<AppState>) -> Result<Vec<Conta>, String> {
    let conn = state.conn.lock().expect("mutex da conexão envenenado");
    engine::listar_contas(&conn).map_err(String::from)
}

#[tauri::command]
pub fn criar_conta(state: State<AppState>, input: NovaContaInput) -> Result<Conta, String> {
    let mut conn = state.conn.lock().expect("mutex da conexão envenenado");
    engine::criar_conta(&mut conn, input).map_err(String::from)
}

#[tauri::command]
pub fn obter_saldo_conta(state: State<AppState>, conta_id: String) -> Result<i64, String> {
    let conn = state.conn.lock().expect("mutex da conexão envenenado");
    engine::saldo_conta(&conn, &conta_id).map_err(String::from)
}

#[tauri::command]
pub fn criar_lancamento(
    state: State<AppState>,
    input: NovoLancamentoInput,
) -> Result<Lancamento, String> {
    let mut conn = state.conn.lock().expect("mutex da conexão envenenado");
    engine::criar_lancamento(&mut conn, input).map_err(String::from)
}

#[tauri::command]
pub fn estornar_lancamento(
    state: State<AppState>,
    lancamento_id: String,
) -> Result<Lancamento, String> {
    let mut conn = state.conn.lock().expect("mutex da conexão envenenado");
    engine::estornar_lancamento(&mut conn, &lancamento_id).map_err(String::from)
}

#[tauri::command]
pub fn corrigir_lancamento(state: State<AppState>, input: engine::CorrecaoInput) -> Result<Lancamento, String> {
    let mut conn = state.conn.lock().expect("mutex da conexão envenenado");
    engine::corrigir_lancamento(&mut conn, input).map_err(String::from)
}

#[tauri::command]
pub fn listar_lancamentos(state: State<AppState>, limite: i64) -> Result<Vec<Lancamento>, String> {
    let conn = state.conn.lock().expect("mutex da conexão envenenado");
    engine::listar_lancamentos(&conn, limite).map_err(String::from)
}

#[tauri::command]
pub fn obter_resumo_dashboard(
    state: State<AppState>,
    data_inicio: String,
    data_fim: String,
) -> Result<engine::ResumoDashboard, String> {
    let conn = state.conn.lock().expect("mutex da conexão envenenado");
    engine::resumo_dashboard(&conn, &data_inicio, &data_fim).map_err(String::from)
}

#[derive(Debug, Deserialize)]
pub struct RecebimentoInput {
    pub conta_destino_id: String,
    pub conta_receita_id: String,
    pub valor_centavos: i64,
    pub data: String,
    pub descricao: String,
}

/// Atalho para "recebi um valor": Débito na conta de destino (ativo),
/// Crédito na conta de receita (salário, benefício, renda extra...).
/// Nunca contabiliza como receita uma simples transferência entre contas
/// próprias — para isso existe `registrar_transferencia`.
#[tauri::command]
pub fn registrar_recebimento(
    state: State<AppState>,
    input: RecebimentoInput,
) -> Result<Lancamento, String> {
    let mut conn = state.conn.lock().expect("mutex da conexão envenenado");
    registrar_recebimento_db(&mut conn, input).map_err(String::from)
}

pub fn registrar_recebimento_db(conn: &mut Connection, input: RecebimentoInput) -> Result<Lancamento, AccountingError> {
    let lancamento = NovoLancamentoInput {
        data: input.data,
        descricao: input.descricao,
        observacao: None,
        origem: "SALARIO".to_string(),
        etiqueta: None,
        parcelas: None,
        partidas: vec![
            PartidaInput {
                conta_id: input.conta_destino_id,
                tipo: TipoPartida::Debito,
                valor_centavos: input.valor_centavos,
            },
            PartidaInput {
                conta_id: input.conta_receita_id,
                tipo: TipoPartida::Credito,
                valor_centavos: input.valor_centavos,
            },
        ],
    };
    engine::criar_lancamento(conn, lancamento)
}

#[derive(Debug, Deserialize)]
pub struct DespesaInput {
    pub conta_origem_id: String,
    pub categoria_despesa_id: String,
    pub valor_centavos: i64,
    pub data: String,
    pub descricao: String,
    #[serde(default)]
    pub etiqueta: Option<String>,
    #[serde(default)]
    pub observacao: Option<String>,
    /// Compra parcelada no cartão (2 a 72 parcelas).
    #[serde(default)]
    pub parcelas: Option<i32>,
}

/// Atalho para "paguei uma despesa agora": Débito na categoria de despesa,
/// Crédito na conta (ativo) ou cartão (passivo) de onde saiu o dinheiro.
#[tauri::command]
pub fn registrar_despesa(state: State<AppState>, input: DespesaInput) -> Result<Lancamento, String> {
    let mut conn = state.conn.lock().expect("mutex da conexão envenenado");
    registrar_despesa_db(&mut conn, input).map_err(String::from)
}

pub fn registrar_despesa_db(conn: &mut Connection, input: DespesaInput) -> Result<Lancamento, AccountingError> {
    let lancamento = NovoLancamentoInput {
        data: input.data,
        descricao: input.descricao,
        observacao: input.observacao.map(|o| o.trim().to_string()).filter(|o| !o.is_empty()),
        origem: "MANUAL".to_string(),
        etiqueta: input.etiqueta,
        parcelas: input.parcelas,
        partidas: vec![
            PartidaInput {
                conta_id: input.categoria_despesa_id,
                tipo: TipoPartida::Debito,
                valor_centavos: input.valor_centavos,
            },
            PartidaInput {
                conta_id: input.conta_origem_id,
                tipo: TipoPartida::Credito,
                valor_centavos: input.valor_centavos,
            },
        ],
    };
    engine::criar_lancamento(conn, lancamento)
}

#[derive(Debug, Deserialize)]
pub struct TransferenciaInput {
    pub conta_origem_id: String,
    pub conta_destino_id: String,
    pub valor_centavos: i64,
    pub data: String,
    pub descricao: String,
}

/// Transferência entre contas próprias: nunca é receita nem despesa, só
/// move saldo de um Ativo para outro (seção 6 do escopo).
#[tauri::command]
pub fn registrar_transferencia(
    state: State<AppState>,
    input: TransferenciaInput,
) -> Result<Lancamento, String> {
    let mut conn = state.conn.lock().expect("mutex da conexão envenenado");
    registrar_transferencia_db(&mut conn, input).map_err(String::from)
}

pub fn registrar_transferencia_db(conn: &mut Connection, input: TransferenciaInput) -> Result<Lancamento, AccountingError> {
    let lancamento = NovoLancamentoInput {
        data: input.data,
        descricao: input.descricao,
        observacao: None,
        origem: "TRANSFERENCIA".to_string(),
        etiqueta: None,
        parcelas: None,
        partidas: vec![
            PartidaInput {
                conta_id: input.conta_destino_id,
                tipo: TipoPartida::Debito,
                valor_centavos: input.valor_centavos,
            },
            PartidaInput {
                conta_id: input.conta_origem_id,
                tipo: TipoPartida::Credito,
                valor_centavos: input.valor_centavos,
            },
        ],
    };
    engine::criar_lancamento(conn, lancamento)
}

#[tauri::command]
pub fn criar_agendamento(state: State<AppState>, input: NovoAgendamentoInput) -> Result<Agendamento, String> {
    let mut conn = state.conn.lock().expect("mutex da conexão envenenado");
    engine::criar_agendamento(&mut conn, input).map_err(String::from)
}

#[tauri::command]
pub fn listar_agendamentos(state: State<AppState>) -> Result<Vec<Agendamento>, String> {
    let conn = state.conn.lock().expect("mutex da conexão envenenado");
    engine::listar_agendamentos(&conn).map_err(String::from)
}

#[tauri::command]
pub fn pagar_agendamento(
    state: State<AppState>,
    agendamento_id: String,
    conta_origem_id: String,
    data_pagamento: String,
) -> Result<Lancamento, String> {
    let mut conn = state.conn.lock().expect("mutex da conexão envenenado");
    engine::pagar_agendamento(&mut conn, &agendamento_id, &conta_origem_id, &data_pagamento).map_err(String::from)
}

#[tauri::command]
pub fn excluir_agendamento(state: State<AppState>, agendamento_id: String) -> Result<(), String> {
    let mut conn = state.conn.lock().expect("mutex da conexão envenenado");
    engine::excluir_agendamento(&mut conn, &agendamento_id).map_err(String::from)
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::accounting::models::{NovaContaInput, TipoConta};
    use crate::db::{abrir_conexao, executar_migracoes};

    fn banco() -> Connection {
        let conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        executar_migracoes(&conn).unwrap();
        conn
    }

    fn conta(conn: &mut Connection, codigo: &str, tipo: TipoConta, subtipo: &str, saldo: i64) -> String {
        engine::criar_conta(
            conn,
            NovaContaInput {
                codigo: codigo.into(), nome: format!("Conta {codigo}"), tipo, subtipo: Some(subtipo.into()), categoria_pai_id: None,
                instituicao: None, saldo_inicial_centavos: saldo, dia_fechamento_fatura: None, dia_vencimento_fatura: None,
                limite_centavos: None,
            },
        )
        .unwrap()
        .id
    }

    fn despesa(conta_origem: &str, valor: i64, parcelas: Option<i32>) -> DespesaInput {
        DespesaInput {
            conta_origem_id: conta_origem.into(),
            categoria_despesa_id: "despesa-alimentacao".into(),
            valor_centavos: valor,
            data: "2026-10-05".into(),
            descricao: "Mercado".into(),
            etiqueta: None,
            observacao: Some("  ".into()),
            parcelas,
        }
    }

    #[test]
    fn despesa_debita_categoria_e_credita_a_conta() {
        let mut conn = banco();
        let banco_id = conta(&mut conn, "1.1.80", TipoConta::Ativo, "BANCO", 100_000);
        let l = registrar_despesa_db(&mut conn, despesa(&banco_id, 12_345, None)).unwrap();
        assert_eq!(l.origem, "MANUAL");
        assert_eq!(l.observacao, None, "observação só com espaços vira vazia");
        let debito = l.partidas.iter().find(|p| p.tipo == TipoPartida::Debito).unwrap();
        let credito = l.partidas.iter().find(|p| p.tipo == TipoPartida::Credito).unwrap();
        assert_eq!((debito.conta_id.as_str(), debito.valor_centavos), ("despesa-alimentacao", 12_345));
        assert_eq!((credito.conta_id.as_str(), credito.valor_centavos), (banco_id.as_str(), 12_345));
        assert_eq!(engine::saldo_conta(&conn, &banco_id).unwrap(), 100_000 - 12_345);
        assert_eq!(engine::saldo_conta(&conn, "despesa-alimentacao").unwrap(), 12_345);
        assert!(registrar_despesa_db(&mut conn, despesa(&banco_id, 0, None)).is_err());
        assert!(registrar_despesa_db(&mut conn, despesa(&banco_id, 100, Some(3))).is_err(), "parcelar só no cartão");
    }

    #[test]
    fn despesa_no_cartao_aumenta_a_divida() {
        let mut conn = banco();
        let cartao = conta(&mut conn, "2.1.80", TipoConta::Passivo, "CARTAO_CREDITO", 0);
        let l = registrar_despesa_db(&mut conn, despesa(&cartao, 60_000, Some(6))).unwrap();
        assert_eq!(l.parcelas, Some(6));
        // Passivo tem natureza credora: o crédito da compra aumenta a dívida do cartão.
        assert_eq!(engine::saldo_conta(&conn, &cartao).unwrap(), 60_000);
        assert_eq!(engine::saldo_conta(&conn, "despesa-alimentacao").unwrap(), 60_000);
        let resumo = engine::resumo_dashboard(&conn, "2026-10-01", "2026-10-31").unwrap();
        assert_eq!(resumo.despesas_mes_centavos, 60_000);
        assert_eq!(resumo.patrimonio_liquido_centavos, -60_000);
    }

    #[test]
    fn recebimento_debita_a_conta_e_credita_a_receita() {
        let mut conn = banco();
        let banco_id = conta(&mut conn, "1.1.81", TipoConta::Ativo, "BANCO", 0);
        let l = registrar_recebimento_db(
            &mut conn,
            RecebimentoInput {
                conta_destino_id: banco_id.clone(),
                conta_receita_id: "receita-salario".into(),
                valor_centavos: 450_000,
                data: "2026-10-05".into(),
                descricao: "Salário".into(),
            },
        )
        .unwrap();
        assert_eq!(l.origem, "SALARIO");
        assert_eq!(engine::saldo_conta(&conn, &banco_id).unwrap(), 450_000);
        assert_eq!(engine::saldo_conta(&conn, "receita-salario").unwrap(), 450_000);
        assert_eq!(engine::resumo_dashboard(&conn, "2026-10-01", "2026-10-31").unwrap().receitas_mes_centavos, 450_000);
    }

    #[test]
    fn transferencia_move_saldo_sem_receita_nem_despesa() {
        let mut conn = banco();
        let a = conta(&mut conn, "1.1.82", TipoConta::Ativo, "BANCO", 50_000);
        let b = conta(&mut conn, "1.1.83", TipoConta::Ativo, "BANCO", 0);
        let transferir = |conn: &mut Connection, de: &str, para: &str, valor: i64| {
            registrar_transferencia_db(
                conn,
                TransferenciaInput { conta_origem_id: de.into(), conta_destino_id: para.into(), valor_centavos: valor, data: "2026-10-05".into(), descricao: "Transferência".into() },
            )
            .unwrap()
        };
        assert_eq!(transferir(&mut conn, &a, &b, 20_000).origem, "TRANSFERENCIA");
        assert_eq!(engine::saldo_conta(&conn, &a).unwrap(), 30_000);
        assert_eq!(engine::saldo_conta(&conn, &b).unwrap(), 20_000);
        let resumo = engine::resumo_dashboard(&conn, "2026-10-01", "2026-10-31").unwrap();
        assert_eq!((resumo.receitas_mes_centavos, resumo.despesas_mes_centavos), (0, 0));

        // Pagar a fatura é transferir do banco para o cartão: a dívida baixa, sem despesa nova.
        let cartao = conta(&mut conn, "2.1.81", TipoConta::Passivo, "CARTAO_CREDITO", 0);
        registrar_despesa_db(&mut conn, despesa(&cartao, 10_000, None)).unwrap();
        transferir(&mut conn, &a, &cartao, 10_000);
        assert_eq!(engine::saldo_conta(&conn, &cartao).unwrap(), 0);
        assert_eq!(engine::saldo_conta(&conn, &a).unwrap(), 20_000);
        assert_eq!(engine::resumo_dashboard(&conn, "2026-10-01", "2026-10-31").unwrap().despesas_mes_centavos, 10_000);
    }
}
