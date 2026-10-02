//! Contas de usuário: cada conta (login Google via Supabase) tem o seu próprio
//! banco SQLite, em `%APPDATA%\com.danielsantos.dairus\contas\<id>\dairus.db`,
//! e as suas próprias pastas de backup/exportação em Documentos\Dairus\<id>.
//! Também recebe o retorno do login no navegador (servidor local só em 127.0.0.1).

use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::commands::AppState;

type Res<T> = Result<T, String>;

/// Id da conta aberta (usado para separar as pastas de backup/exportação).
pub static USUARIO_ATUAL: Mutex<Option<String>> = Mutex::new(None);
static CANCELAR_LOGIN: AtomicBool = AtomicBool::new(false);

/// Porta fixa do retorno do login; precisa estar cadastrada no Supabase
/// (Authentication → URL Configuration → Redirect URLs).
pub const PORTA_RETORNO: u16 = 47821;

fn e<T: std::fmt::Display>(erro: T) -> String {
    erro.to_string()
}

/// Ids do Supabase são UUIDs; aceitar só isso impede caminhos maliciosos.
fn id_valido(id: &str) -> Res<&str> {
    let ok = id.len() == 36 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    if ok {
        Ok(id)
    } else {
        Err("Identificador de conta inválido.".into())
    }
}

fn caminho_banco_legado(app: &AppHandle) -> Res<PathBuf> {
    Ok(app.path().app_data_dir().map_err(e)?.join("dairus.db"))
}

fn caminho_banco_conta(app: &AppHandle, id: &str) -> Res<PathBuf> {
    let pasta = app.path().app_data_dir().map_err(e)?.join("contas").join(id);
    std::fs::create_dir_all(&pasta).map_err(e)?;
    Ok(pasta.join("dairus.db"))
}

/// Banco cifrado da conta (quando a criptografia está ligada).
fn caminho_cripto(app: &AppHandle, id: &str) -> Res<PathBuf> {
    Ok(caminho_banco_conta(app, id)?.with_extension("db.cripto"))
}

fn contar_lancamentos(caminho: &Path) -> i64 {
    Connection::open_with_flags(caminho, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .and_then(|c| c.query_row("SELECT COUNT(*) FROM lancamentos", [], |r| r.get(0)))
        .unwrap_or(0)
}

#[derive(Serialize)]
pub struct SituacaoConta {
    /// A conta ainda não tem banco neste computador (primeiro acesso aqui).
    pub primeiro_acesso: bool,
    /// Lançamentos no banco antigo (de antes do login), que podem ser importados.
    pub lancamentos_legado: i64,
    /// O banco desta conta está criptografado: precisa da senha para abrir.
    pub criptografado: bool,
}

#[tauri::command]
pub fn situacao_conta(app: AppHandle, usuario_id: String) -> Res<SituacaoConta> {
    let id = id_valido(&usuario_id)?;
    let banco = app.path().app_data_dir().map_err(e)?.join("contas").join(id).join("dairus.db");
    let cifrado = banco.with_extension("db.cripto");
    let legado = caminho_banco_legado(&app)?;
    Ok(SituacaoConta {
        criptografado: cifrado.is_file(),
        primeiro_acesso: !banco.is_file() && !cifrado.is_file(),
        lancamentos_legado: if legado.is_file() { contar_lancamentos(&legado) } else { 0 },
    })
}

/// Abre (ou cria) o banco da conta e passa a usá-lo em todos os comandos.
/// `importar_legado` copia o banco antigo deste computador para a conta (só no primeiro acesso).
#[tauri::command]
pub fn abrir_conta(app: AppHandle, state: State<AppState>, usuario_id: String, importar_legado: bool) -> Res<()> {
    let id = id_valido(&usuario_id)?.to_string();
    if caminho_cripto(&app, &id)?.is_file() {
        return Err("SENHA_NECESSARIA".into());
    }
    let destino = caminho_banco_conta(&app, &id)?;
    if importar_legado && !destino.is_file() {
        let legado = caminho_banco_legado(&app)?;
        if legado.is_file() {
            // A API de backup do SQLite copia de forma consistente (inclui o que está no WAL).
            let origem = Connection::open_with_flags(&legado, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(e)?;
            origem.backup(rusqlite::MAIN_DB, &destino, None).map_err(e)?;
        }
    }
    let conn = crate::db::abrir_conexao(&destino).map_err(e)?;
    crate::db::executar_migracoes(&conn).map_err(e)?;
    crate::cripto::encerrar_sessao();
    *state.conn.lock().expect("mutex envenenado") = conn;
    *USUARIO_ATUAL.lock().expect("mutex envenenado") = Some(id);
    Ok(())
}

fn abrir_cifrado(
    app: &AppHandle,
    state: &State<AppState>,
    id: String,
    chaves: crate::cripto::Chaves,
    texto: &[u8],
    senha: &str,
) -> Res<()> {
    let conn = crate::cripto::banco_em_memoria(texto)?;
    crate::db::executar_migracoes(&conn).map_err(e)?;
    let arquivo = caminho_cripto(app, &id)?;
    let mut guarda = state.conn.lock().expect("mutex envenenado");
    crate::cripto::iniciar_sessao(chaves, senha, arquivo, &conn);
    // Grava já com o cabeçalho atual (e com as migrações novas, se houve).
    crate::cripto::persistir(&conn, true)?;
    *guarda = conn;
    *USUARIO_ATUAL.lock().expect("mutex envenenado") = Some(id);
    Ok(())
}

/// Abre o banco criptografado da conta com a senha (decifra só na memória).
#[tauri::command]
pub fn abrir_conta_com_senha(app: AppHandle, state: State<AppState>, usuario_id: String, senha: String) -> Res<()> {
    let id = id_valido(&usuario_id)?.to_string();
    let bytes = std::fs::read(caminho_cripto(&app, &id)?).map_err(|_| "Banco criptografado não encontrado.".to_string())?;
    let (chaves, texto) = crate::cripto::abrir_com_senha(&bytes, &senha)?;
    abrir_cifrado(&app, &state, id, chaves, &texto, &senha)
}

/// Esqueceu a senha: abre com o código de recuperação e define uma senha nova.
#[tauri::command]
pub fn recuperar_conta_com_codigo(app: AppHandle, state: State<AppState>, usuario_id: String, codigo: String, nova_senha: String) -> Res<()> {
    crate::cripto::validar_senha(&nova_senha)?;
    let id = id_valido(&usuario_id)?.to_string();
    let bytes = std::fs::read(caminho_cripto(&app, &id)?).map_err(|_| "Banco criptografado não encontrado.".to_string())?;
    let (chaves, texto) = crate::cripto::abrir_com_codigo(&bytes, &codigo)?;
    let chaves = chaves.com_nova_senha(&nova_senha)?;
    abrir_cifrado(&app, &state, id, chaves, &texto, &nova_senha)
}

/// Liga a criptografia da conta aberta. Devolve o código de recuperação (mostrar uma vez só).
#[tauri::command]
pub fn ativar_criptografia(app: AppHandle, state: State<AppState>, senha: String) -> Res<String> {
    let id = USUARIO_ATUAL.lock().expect("mutex envenenado").clone().ok_or("Entre numa conta primeiro.")?;
    if crate::cripto::ativa() {
        return Err("A criptografia já está ligada.".into());
    }
    let (chaves, codigo) = crate::cripto::Chaves::novas(&senha)?;
    let plano = caminho_banco_conta(&app, &id)?;
    let cifrado = caminho_cripto(&app, &id)?;
    let mut guarda = state.conn.lock().expect("mutex envenenado");
    let texto = zeroize::Zeroizing::new(crate::cripto::serializar(&guarda)?);
    let arquivo = chaves.cifrar(&texto)?;
    // Confere que o arquivo cifrado abre de volta antes de apagar o original.
    let (_, conferido) = crate::cripto::abrir_com_senha(&arquivo, &senha)?;
    let nova = crate::cripto::banco_em_memoria(&conferido)?;
    std::fs::write(&cifrado, &arquivo).map_err(e)?;
    crate::cripto::iniciar_sessao(chaves, &senha, cifrado, &nova);
    *guarda = nova;
    drop(guarda);
    for sufixo in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{sufixo}", plano.to_string_lossy()));
    }
    if let Ok(pasta) = crate::extras::pasta_dairus(&app, "Backups") {
        crate::cripto::converter_backups(&pasta, true);
    }
    log::info!("criptografia do banco ligada");
    Ok(codigo)
}

/// Desliga a criptografia (pede a senha): o banco e os backups voltam a ficar abertos no disco.
#[tauri::command]
pub fn desativar_criptografia(app: AppHandle, state: State<AppState>, senha: String) -> Res<()> {
    let id = USUARIO_ATUAL.lock().expect("mutex envenenado").clone().ok_or("Entre numa conta primeiro.")?;
    if !crate::cripto::ativa() {
        return Err("A criptografia não está ligada.".into());
    }
    if !crate::cripto::senha_confere(&senha) {
        return Err("Senha incorreta.".into());
    }
    if let Ok(pasta) = crate::extras::pasta_dairus(&app, "Backups") {
        crate::cripto::converter_backups(&pasta, false);
    }
    let plano = caminho_banco_conta(&app, &id)?;
    let mut guarda = state.conn.lock().expect("mutex envenenado");
    let tmp = plano.with_extension("db.tmp");
    std::fs::write(&tmp, crate::cripto::serializar(&guarda)?).map_err(e)?;
    std::fs::rename(&tmp, &plano).map_err(e)?;
    let conn = crate::db::abrir_conexao(&plano).map_err(e)?;
    crate::db::executar_migracoes(&conn).map_err(e)?;
    *guarda = conn;
    crate::cripto::encerrar_sessao();
    drop(guarda);
    let _ = std::fs::remove_file(caminho_cripto(&app, &id)?);
    log::info!("criptografia do banco desligada");
    Ok(())
}

#[tauri::command]
pub fn trocar_senha_banco(state: State<AppState>, atual: String, nova: String) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    crate::cripto::trocar_senha(&conn, &atual, &nova)
}

#[tauri::command]
pub fn criptografia_ativa() -> bool {
    crate::cripto::ativa()
}

/// Ao sair da conta, volta para um banco vazio em memória (nada fica aberto).
#[tauri::command]
pub fn fechar_conta(state: State<AppState>) -> Res<()> {
    let conn = crate::db::abrir_conexao(Path::new(":memory:")).map_err(e)?;
    crate::db::executar_migracoes(&conn).map_err(e)?;
    let mut guarda = state.conn.lock().expect("mutex envenenado");
    crate::cripto::persistir(&guarda, false)?;
    crate::cripto::encerrar_sessao();
    *guarda = conn;
    drop(guarda);
    *USUARIO_ATUAL.lock().expect("mutex envenenado") = None;
    Ok(())
}

fn decodificar_url(texto: &str) -> String {
    let bytes = texto.as_bytes();
    let mut saida = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => saida.push(b' '),
            b'%' if i + 2 < bytes.len() => {
                if let Ok(v) = u8::from_str_radix(&texto[i + 1..i + 3], 16) {
                    saida.push(v);
                    i += 2;
                } else {
                    saida.push(b'%');
                }
            }
            b => saida.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&saida).into_owned()
}

fn parametro(query: &str, nome: &str) -> Option<String> {
    query
        .split('&')
        .filter_map(|par| par.split_once('='))
        .find(|(k, _)| *k == nome)
        .map(|(_, v)| decodificar_url(v))
}

const PAGINA_OK: &str = "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><title>Dairus</title>\
<body style=\"margin:0;height:100vh;display:grid;place-items:center;background:#020817;color:#f4f8ff;font-family:Segoe UI,sans-serif\">\
<div style=\"text-align:center\"><h1 style=\"color:#00d9ff\">Login concluído</h1><p>Pode fechar esta aba e voltar ao Dairus.</p></div></body></html>";

const PAGINA_ERRO: &str = "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><title>Dairus</title>\
<body style=\"margin:0;height:100vh;display:grid;place-items:center;background:#020817;color:#f4f8ff;font-family:Segoe UI,sans-serif\">\
<div style=\"text-align:center\"><h1 style=\"color:#ff2d55\">Não foi possível entrar</h1><p>Volte ao Dairus e tente de novo.</p></div></body></html>";

fn responder(stream: &mut std::net::TcpStream, status: &str, corpo: &str) {
    let resposta = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{corpo}",
        corpo.len()
    );
    let _ = stream.write_all(resposta.as_bytes());
    let _ = stream.flush();
}

/// Espera o navegador voltar em http://127.0.0.1:47821/callback?code=… e devolve o `code`
/// (que o app troca pela sessão no Supabase, com PKCE). Desiste após 5 minutos.
#[tauri::command]
pub async fn aguardar_retorno_login() -> Res<String> {
    CANCELAR_LOGIN.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(|| -> Res<String> {
        let ouvinte = TcpListener::bind(("127.0.0.1", PORTA_RETORNO))
            .map_err(|err| format!("A porta {PORTA_RETORNO} está ocupada ({err}). Feche outra janela de login e tente de novo."))?;
        ouvinte.set_nonblocking(true).map_err(e)?;
        let limite = Instant::now() + Duration::from_secs(300);
        loop {
            if CANCELAR_LOGIN.load(Ordering::SeqCst) {
                return Err("Login cancelado.".into());
            }
            match ouvinte.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_nonblocking(false);
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                    let mut buffer = [0u8; 8192];
                    let n = stream.read(&mut buffer).unwrap_or(0);
                    let pedido = String::from_utf8_lossy(&buffer[..n]);
                    let caminho = pedido.lines().next().and_then(|l| l.split_whitespace().nth(1)).unwrap_or("/");
                    let Some(resto) = caminho.strip_prefix("/callback") else {
                        responder(&mut stream, "404 Not Found", "");
                        continue;
                    };
                    let query = resto.strip_prefix('?').unwrap_or("");
                    if let Some(codigo) = parametro(query, "code") {
                        responder(&mut stream, "200 OK", PAGINA_OK);
                        return Ok(codigo);
                    }
                    responder(&mut stream, "200 OK", PAGINA_ERRO);
                    let motivo = parametro(query, "error_description").or_else(|| parametro(query, "error"));
                    return Err(motivo.unwrap_or_else(|| "O Google não devolveu o código de login.".into()));
                }
                Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                    if Instant::now() > limite {
                        return Err("Tempo esgotado esperando o login no navegador.".into());
                    }
                    std::thread::sleep(Duration::from_millis(150));
                }
                Err(err) => return Err(e(err)),
            }
        }
    })
    .await
    .map_err(e)?
}

#[tauri::command]
pub fn cancelar_login() {
    CANCELAR_LOGIN.store(true, Ordering::SeqCst);
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn so_aceita_uuid_como_id_de_conta() {
        assert!(id_valido("3f2b8c1e-9a7d-4c2e-8f1a-0b9c8d7e6f5a").is_ok());
        assert!(id_valido("../../Windows").is_err());
        assert!(id_valido("3f2b8c1e-9a7d-4c2e-8f1a-0b9c8d7e6f5").is_err());
    }

    #[test]
    fn le_parametros_do_retorno() {
        assert_eq!(parametro("code=abc-123&state=x", "code").as_deref(), Some("abc-123"));
        assert_eq!(parametro("error=access_denied&error_description=Usu%C3%A1rio+cancelou", "error_description").as_deref(), Some("Usuário cancelou"));
        assert_eq!(parametro("x=1", "code"), None);
    }
}
