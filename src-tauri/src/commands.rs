use std::sync::Mutex;

use rusqlite::Connection;
use serde::Deserialize;
use tauri::State;

use crate::accounting::engine;
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
    let lancamento = NovoLancamentoInput {
        data: input.data,
        descricao: input.descricao,
        observacao: None,
        origem: "SALARIO".to_string(),
        etiqueta: None,
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
    engine::criar_lancamento(&mut conn, lancamento).map_err(String::from)
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
}

/// Atalho para "paguei uma despesa agora": Débito na categoria de despesa,
/// Crédito na conta (ativo) ou cartão (passivo) de onde saiu o dinheiro.
#[tauri::command]
pub fn registrar_despesa(state: State<AppState>, input: DespesaInput) -> Result<Lancamento, String> {
    let mut conn = state.conn.lock().expect("mutex da conexão envenenado");
    let lancamento = NovoLancamentoInput {
        data: input.data,
        descricao: input.descricao,
        observacao: None,
        origem: "MANUAL".to_string(),
        etiqueta: input.etiqueta,
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
    engine::criar_lancamento(&mut conn, lancamento).map_err(String::from)
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
    let lancamento = NovoLancamentoInput {
        data: input.data,
        descricao: input.descricao,
        observacao: None,
        origem: "TRANSFERENCIA".to_string(),
        etiqueta: None,
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
    engine::criar_lancamento(&mut conn, lancamento).map_err(String::from)
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
