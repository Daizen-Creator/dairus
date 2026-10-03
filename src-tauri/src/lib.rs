mod accounting;
mod atualizacao;
mod cartoes;
mod commands;
mod conta;
mod cripto;
mod db;
mod extras;
mod gestao;
mod investimentos;
mod lancamentos_extras;
mod mercado;
mod planejamento;
mod planilha;
mod sincronizacao;
mod sistema;

use std::sync::Mutex;

use commands::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Uma instância só: abrir o Dairus de novo traz a janela que já está aberta.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| sistema::mostrar_janela(app)))
        .plugin(sistema::plugin_log())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![sistema::ARG_MINIMIZADO]),
        ))
        .plugin(sistema::plugin_atalho())
        .setup(|app| {
            log::info!("Dairus {} iniciado", app.package_info().version);
            if let Err(erro) = sistema::criar_bandeja(app.handle()) {
                log::warn!("não foi possível criar o ícone da bandeja: {erro}");
            }
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                if let Err(erro) = app.global_shortcut().register(sistema::atalho_lancamento()) {
                    log::warn!("atalho Ctrl+Alt+D indisponível (outro programa pode estar usando): {erro}");
                }
            }
            // Aberto pelo Windows ao ligar: fica só na bandeja até ser chamado.
            if std::env::args().any(|a| a == sistema::ARG_MINIMIZADO) {
                if let Some(janela) = app.get_webview_window("main") {
                    let _ = janela.hide();
                }
            }

            let dados_dir = app
                .path()
                .app_data_dir()
                .expect("não foi possível resolver o diretório de dados do app");
            std::fs::create_dir_all(&dados_dir).expect("não foi possível criar o diretório de dados do app");

            // Até alguém entrar na conta, nenhum banco do disco fica aberto: usa um vazio em memória.
            // O banco de cada conta é aberto pelo comando `abrir_conta` depois do login.
            let conn = db::abrir_conexao(std::path::Path::new(":memory:")).expect("falha ao abrir o banco SQLite");
            db::executar_migracoes(&conn).expect("falha ao aplicar migrações do banco");

            app.manage(AppState {
                conn: Mutex::new(conn),
            });

            // Banco criptografado vive na memória: a cada 2 s, se mudou, grava cifrado no disco.
            let alca = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(2));
                let estado = alca.state::<AppState>();
                let conn = estado.conn.lock().expect("mutex da conexão envenenado");
                if let Err(erro) = cripto::persistir(&conn, false) {
                    log::error!("falha ao gravar o banco criptografado: {erro}");
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::listar_contas,
            commands::criar_conta,
            commands::obter_saldo_conta,
            commands::criar_lancamento,
            commands::estornar_lancamento,
            commands::corrigir_lancamento,
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
            extras::ler_backup,
            extras::gravar_backup_baixado,
            extras::restaurar_backup,
            extras::salvar_exportacao,
            planilha::exportar_xlsx,
            sistema::atualizar_bandeja,
            investimentos::listar_ativos_invest,
            investimentos::salvar_ativo_invest,
            investimentos::arquivar_ativo_invest,
            investimentos::excluir_ativo_invest,
            investimentos::registrar_operacao_invest,
            investimentos::listar_operacoes_invest,
            investimentos::excluir_operacao_invest,
            investimentos::atualizar_cotacoes,
            investimentos::salvar_indicadores,
            investimentos::listar_indicadores,
            mercado::buscar_json_mercado,
            lancamentos_extras::definir_tags,
            lancamentos_extras::listar_tags,
            lancamentos_extras::anexar_arquivo,
            lancamentos_extras::listar_anexos,
            lancamentos_extras::abrir_anexo,
            lancamentos_extras::ler_anexo,
            lancamentos_extras::excluir_anexo,
            lancamentos_extras::listar_regras,
            lancamentos_extras::salvar_regra,
            lancamentos_extras::excluir_regra,
            lancamentos_extras::processar_agendamentos_automaticos,
            lancamentos_extras::listar_pasta_importar,
            cartoes::listar_faturas,
            planejamento::listar_orcamentos_mes,
            planejamento::definir_orcamento_mes,
            planejamento::definir_acumulo_orcamento,
            planejamento::vincular_meta_conta,
            planejamento::aportar_meta_com_conta,
            planejamento::vincular_radar_meta,
            planejamento::criar_emprestimo,
            planejamento::listar_emprestimos,
            planejamento::pagar_parcela_emprestimo,
            planejamento::listar_a_receber,
            planejamento::registrar_divisao,
            planejamento::receber_valores,
            planejamento::perdoar_valor,
            cartoes::congelar_fatura,
            cartoes::listar_config_cartoes,
            cartoes::definir_juros_cartao,
            cartoes::lancar_encargos,
            cartoes::listar_adicionais,
            cartoes::criar_adicional,
            cartoes::excluir_adicional,
            cartoes::definir_portador,
            cartoes::listar_portadores,
            cartoes::listar_reembolsos,
            cartoes::registrar_reembolso,
            lancamentos_extras::marcar_extrato_importado,
            lancamentos_extras::caminho_pasta_importar,
            atualizacao::verificar_atualizacao,
            atualizacao::instalar_atualizacao,
            sincronizacao::impressao_dados,
            sincronizacao::gerar_copia_sync,
            sistema::pasta_de_logs,
            sistema::ler_log,
            extras::salvar_exportacao_binaria,
            extras::atualizar_lancamento_info,
            extras::atualizar_agendamento,
            extras::atualizar_conta,
            extras::arquivar_conta,
            extras::criar_categoria,
            extras::atualizar_meta,
            extras::listar_aportes_meta,
            extras::listar_todos_aportes,
            extras::mover_entre_metas,
            extras::renomear_bem,
            extras::atualizar_bem_detalhes,
            extras::atualizar_item_radar,
            extras::excluir_preco_radar,
            extras::listar_auditoria,
            conta::situacao_conta,
            conta::abrir_conta,
            conta::fechar_conta,
            conta::excluir_dados_conta,
            gestao::uso_da_conta,
            gestao::excluir_conta,
            gestao::mesclar_contas,
            gestao::trocar_conta_lancamento,
            gestao::excluir_lancamentos,
            conta::abrir_conta_com_senha,
            conta::recuperar_conta_com_codigo,
            conta::ativar_criptografia,
            conta::desativar_criptografia,
            conta::trocar_senha_banco,
            conta::criptografia_ativa,
            conta::aguardar_retorno_login,
            conta::cancelar_login,
            extras::info_banco,
            extras::verificar_integridade,
            extras::otimizar_banco,
            extras::excluir_backup,
            extras::verificar_backup,
            extras::aplicar_retencao,
            extras::abrir_pasta_dairus,
            extras::apagar_todos_os_dados,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, evento| {
            // Ao sair, grava a última versão do banco criptografado.
            if let tauri::RunEvent::Exit = evento {
                let estado = app.state::<AppState>();
                let conn = estado.conn.lock().expect("mutex da conexão envenenado");
                if let Err(erro) = cripto::persistir(&conn, false) {
                    log::error!("falha ao gravar o banco criptografado ao sair: {erro}");
                }
            }
        });
}
