mod accounting;
mod commands;
mod db;
mod extras;

use std::sync::Mutex;

use commands::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let dados_dir = app
                .path()
                .app_data_dir()
                .expect("não foi possível resolver o diretório de dados do app");
            std::fs::create_dir_all(&dados_dir).expect("não foi possível criar o diretório de dados do app");

            let caminho_banco = dados_dir.join("dairus.db");
            let conn = db::abrir_conexao(&caminho_banco).expect("falha ao abrir o banco SQLite");
            db::executar_migracoes(&conn).expect("falha ao aplicar migrações do banco");

            app.manage(AppState {
                conn: Mutex::new(conn),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::listar_contas,
            commands::criar_conta,
            commands::obter_saldo_conta,
            commands::criar_lancamento,
            commands::estornar_lancamento,
            commands::listar_lancamentos,
            commands::obter_resumo_dashboard,
            commands::registrar_recebimento,
            commands::registrar_despesa,
            commands::registrar_transferencia,
            commands::criar_agendamento,
            commands::listar_agendamentos,
            commands::pagar_agendamento,
            commands::excluir_agendamento,
            extras::listar_orcamentos,
            extras::definir_orcamento,
            extras::listar_metas,
            extras::criar_meta,
            extras::aportar_meta,
            extras::excluir_meta,
            extras::listar_bens,
            extras::criar_bem,
            extras::atualizar_bem,
            extras::excluir_bem,
            extras::listar_radar,
            extras::criar_item_radar,
            extras::registrar_preco_radar,
            extras::excluir_item_radar,
            extras::criar_backup,
            extras::listar_backups,
            extras::restaurar_backup,
            extras::salvar_exportacao,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
