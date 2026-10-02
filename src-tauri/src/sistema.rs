//! Integração com o Windows: ícone na bandeja, atalho global, abrir junto
//! com o sistema, uma instância só e o arquivo de log.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

pub const ID_BANDEJA: &str = "bandeja-dairus";
/// Argumento passado quando o Windows abre o Dairus ao ligar: começa só na bandeja.
pub const ARG_MINIMIZADO: &str = "--minimizado";

/// Ctrl+Alt+D abre o lançamento rápido, mesmo com o app minimizado.
pub fn atalho_lancamento() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyD)
}

pub fn mostrar_janela<R: Runtime>(app: &AppHandle<R>) {
    if let Some(janela) = app.get_webview_window("main") {
        let _ = janela.unminimize();
        let _ = janela.show();
        let _ = janela.set_focus();
    }
}

fn abrir_lancamento_rapido<R: Runtime>(app: &AppHandle<R>) {
    mostrar_janela(app);
    let _ = app.emit("lancamento-rapido", ());
}

pub fn plugin_atalho<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, atalho, evento| {
            if evento.state() == ShortcutState::Pressed && *atalho == atalho_lancamento() {
                abrir_lancamento_rapido(app);
            }
        })
        .build()
}

pub fn plugin_log<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
    tauri_plugin_log::Builder::new()
        .targets([
            Target::new(TargetKind::LogDir { file_name: Some("dairus".into()) }),
            Target::new(TargetKind::Stdout),
        ])
        .level(log::LevelFilter::Info)
        .max_file_size(2 * 1024 * 1024)
        .rotation_strategy(RotationStrategy::KeepSome(5))
        .build()
}

pub fn criar_bandeja<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let abrir = MenuItem::with_id(app, "abrir", "Abrir o Dairus", true, None::<&str>)?;
    let lancar = MenuItem::with_id(app, "lancar", "Lançamento rápido (Ctrl+Alt+D)", true, None::<&str>)?;
    let separador = PredefinedMenuItem::separator(app)?;
    let sair = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&abrir, &lancar, &separador, &sair])?;

    let mut construtor = TrayIconBuilder::with_id(ID_BANDEJA)
        .tooltip("Dairus")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, evento| match evento.id.as_ref() {
            "abrir" => mostrar_janela(app),
            "lancar" => abrir_lancamento_rapido(app),
            "sair" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|bandeja, evento| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = evento {
                mostrar_janela(bandeja.app_handle());
            }
        });
    if let Some(icone) = app.default_window_icon() {
        construtor = construtor.icon(icone.clone());
    }
    construtor.build(app)?;
    Ok(())
}

/// Texto do ícone da bandeja (ex.: saldo do dia e próxima conta).
#[tauri::command]
pub fn atualizar_bandeja(app: AppHandle, texto: String) -> Result<(), String> {
    let texto: String = texto.chars().take(120).collect();
    if let Some(bandeja) = app.tray_by_id(ID_BANDEJA) {
        bandeja.set_tooltip(Some(texto)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Pasta onde fica o arquivo de log, aberta no Explorer.
#[tauri::command]
pub fn pasta_de_logs(app: AppHandle) -> Result<String, String> {
    let pasta = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&pasta).map_err(|e| e.to_string())?;
    Ok(pasta.to_string_lossy().to_string())
}

/// Últimas linhas do log, para mostrar na tela de ajuda/diagnóstico.
#[tauri::command]
pub fn ler_log(app: AppHandle, linhas: usize) -> Result<String, String> {
    let caminho = app.path().app_log_dir().map_err(|e| e.to_string())?.join("dairus.log");
    let texto = std::fs::read_to_string(caminho).unwrap_or_default();
    let todas: Vec<&str> = texto.lines().collect();
    let ini = todas.len().saturating_sub(linhas.clamp(1, 2000));
    Ok(todas[ini..].join("\n"))
}
