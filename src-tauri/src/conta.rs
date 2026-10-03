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
    let (chaves, texto) = crate::limitador::tentar(&app, &format!("senha:{id}"), crate::limitador::erro_de_senha, || crate::cripto::abrir_com_senha(&bytes, &senha))?;
    abrir_cifrado(&app, &state, id, chaves, &texto, &senha)
}

/// Esqueceu a senha: abre com o código de recuperação e define uma senha nova.
#[tauri::command]
pub fn recuperar_conta_com_codigo(app: AppHandle, state: State<AppState>, usuario_id: String, codigo: String, nova_senha: String) -> Res<()> {
    crate::cripto::validar_senha(&nova_senha)?;
    let id = id_valido(&usuario_id)?.to_string();
    let bytes = std::fs::read(caminho_cripto(&app, &id)?).map_err(|_| "Banco criptografado não encontrado.".to_string())?;
    let (chaves, texto) = crate::limitador::tentar(&app, &format!("codigo:{id}"), crate::limitador::erro_de_senha, || crate::cripto::abrir_com_codigo(&bytes, &codigo))?;
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
    crate::limitador::tentar(&app, &format!("senha:{id}"), crate::limitador::erro_de_senha, || {
        if crate::cripto::senha_confere(&senha) { Ok(()) } else { Err("Senha incorreta.".to_string()) }
    })?;
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
pub fn trocar_senha_banco(app: AppHandle, state: State<AppState>, atual: String, nova: String) -> Res<()> {
    let id = USUARIO_ATUAL.lock().expect("mutex envenenado").clone().unwrap_or_default();
    let conn = state.conn.lock().expect("mutex envenenado");
    crate::limitador::tentar(&app, &format!("senha:{id}"), crate::limitador::erro_de_senha, || crate::cripto::trocar_senha(&conn, &atual, &nova))
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

/// Logo do app embutido (também vira o favicon da página, em data URI: o servidor
/// local fecha logo depois de receber o retorno, então não dá para servir /favicon.ico).
const LOGO_SVG: &str = include_str!("../../public/dairus.svg");

fn svg_em_data_uri(svg: &str) -> String {
    let mut saida = String::from("data:image/svg+xml,");
    for c in svg.chars() {
        match c {
            '"' => saida.push('\''),
            '%' => saida.push_str("%25"),
            '#' => saida.push_str("%23"),
            '<' => saida.push_str("%3C"),
            '>' => saida.push_str("%3E"),
            '\n' | '\r' => saida.push(' '),
            _ => saida.push(c),
        }
    }
    saida
}

fn escapar_html(texto: &str) -> String {
    texto.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&#39;")
}

/// Único script da página de retorno (contagem e fechar a aba). A CSP só libera
/// exatamente este texto, pelo hash SHA-256.
const SCRIPT_FECHAR: &str = "let n=8;const e=document.getElementById('s');const t=setInterval(()=>{n--;if(e)e.textContent=n;if(n<=0){clearInterval(t);window.close();}},1000);";

/// Content-Security-Policy da página de retorno: nada de rede, nada de frames,
/// só o estilo embutido, imagens em data URI e o script acima.
fn csp_retorno() -> String {
    use base64::Engine;
    use sha2::Digest;
    let hash = base64::engine::general_purpose::STANDARD.encode(sha2::Sha256::digest(SCRIPT_FECHAR.as_bytes()));
    format!("default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'sha256-{hash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
}

/// Página mostrada no navegador depois do login (sucesso ou erro).
pub fn pagina_retorno(ok: bool, detalhe: Option<&str>) -> String {
    let logo = svg_em_data_uri(LOGO_SVG);
    let (cor, icone, titulo, texto) = if ok {
        ("#00d395", "&#10003;", "Login concluído!", "Tudo certo. O Dairus já recebeu o acesso e está abrindo a sua conta.")
    } else {
        ("#ff2d55", "!", "Não foi possível entrar", "O Google não confirmou o acesso. Volte ao Dairus e clique em “Entrar com Google” de novo.")
    };
    let detalhe_html = detalhe.map(|d| format!("<p class=\"detalhe\">Detalhe: {}</p>", escapar_html(d))).unwrap_or_default();
    let passos = if ok {
        "<ol><li>Volte para a janela do <strong>Dairus</strong> (ela já veio para a frente).</li><li>Seus dados abrem em instantes.</li><li>Pode fechar esta aba.</li></ol><p class=\"contagem\">Esta aba tenta fechar sozinha em <span id=\"s\">8</span>s.</p>"
    } else {
        "<ol><li>Confira se escolheu a conta Google certa.</li><li>Se o navegador bloqueou pop-ups ou cookies, libere para accounts.google.com.</li><li>Tente de novo pelo Dairus.</li></ol>"
    };
    let script = if ok { format!("<script>{SCRIPT_FECHAR}</script>") } else { String::new() };
    format!(
        r#"<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{titulo} · Dairus</title><link rel="icon" type="image/svg+xml" href="{logo}">
<style>
*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;display:grid;place-items:center;font-family:"Segoe UI",system-ui,sans-serif;color:#f4f8ff;
background:radial-gradient(900px 500px at 15% 10%,rgba(22,119,255,.28),transparent 60%),radial-gradient(800px 500px at 90% 100%,rgba(168,85,247,.22),transparent 60%),#020817}}
.cartao{{width:min(460px,92vw);padding:36px 32px;border-radius:24px;background:rgba(10,22,44,.78);border:1px solid rgba(120,160,255,.18);box-shadow:0 30px 90px -30px {cor};backdrop-filter:blur(8px);text-align:center}}
.topo{{display:flex;align-items:center;justify-content:center;gap:12px}}.topo img{{width:52px;height:52px;border-radius:14px}}
.marca{{font-size:34px;font-weight:800;letter-spacing:-.5px;background:linear-gradient(90deg,#00d9ff,#1677ff,#a855f7);-webkit-background-clip:text;background-clip:text;color:transparent}}
.selo{{margin:26px auto 14px;width:76px;height:76px;border-radius:50%;display:grid;place-items:center;font-size:38px;font-weight:700;color:#020817;background:{cor};box-shadow:0 0 0 10px {cor}22,0 0 40px {cor}88;animation:surge .5s ease-out}}
@keyframes surge{{from{{transform:scale(.4);opacity:0}}to{{transform:scale(1);opacity:1}}}}
h1{{margin:0 0 8px;font-size:24px}}p{{margin:0;color:#a9b8d6;line-height:1.5}}
ol{{text-align:left;margin:22px 0 0;padding:16px 16px 16px 36px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);color:#d7e2f7;font-size:14px;line-height:1.7}}
.detalhe{{margin-top:14px;font-size:12px;color:#ff8aa1;word-break:break-word}}.contagem{{margin-top:14px;font-size:12px}}
.rodape{{margin-top:22px;font-size:11px;color:#6f81a6}}
</style></head><body><main class="cartao">
<div class="topo"><img src="{logo}" alt=""><span class="marca">dairus</span></div>
<div class="selo">{icone}</div><h1>{titulo}</h1><p>{texto}</p>{detalhe_html}{passos}
<p class="rodape">Seus dados ficam no seu computador. Esta página é servida pelo próprio Dairus (127.0.0.1) e não é gravada na internet.</p>
</main>{script}</body></html>"#
    )
}

fn responder(stream: &mut std::net::TcpStream, status: &str, corpo: &str) {
    let resposta = format!("HTTP/1.1 {status}\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{corpo}", cabecalhos_seguros(), corpo.len());
    let _ = stream.write_all(resposta.as_bytes());
    let _ = stream.flush();
}

/// Cabeçalhos de segurança de toda resposta do servidor local: a URL tem o código
/// de login, então nada de cache, de Referer, de frames nem de adivinhar o tipo.
fn cabecalhos_seguros() -> String {
    format!(
        "Content-Type: text/html; charset=utf-8\r\nContent-Security-Policy: {}\r\nX-Frame-Options: DENY\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nCache-Control: no-store, max-age=0\r\nPragma: no-cache\r\nCross-Origin-Opener-Policy: same-origin\r\nCross-Origin-Resource-Policy: same-origin\r\nPermissions-Policy: camera=(), microphone=(), geolocation=()\r\n",
        csp_retorno()
    )
}

/// Código de login aceito: o do Supabase (UUID), com folga, mas só caracteres seguros.
fn codigo_valido(codigo: &str) -> bool {
    (8..=512).contains(&codigo.len()) && codigo.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.')
}

/// Só aceita o retorno quando é o navegador abrindo a página (navegação GET),
/// não um `fetch`/imagem disparado por outro site para atrapalhar o login.
fn pedido_de_navegacao(pedido: &str) -> bool {
    let mut linhas = pedido.lines();
    if !linhas.next().is_some_and(|l| l.starts_with("GET ")) {
        return false;
    }
    for linha in linhas {
        let Some((nome, valor)) = linha.split_once(':') else { continue };
        let (nome, valor) = (nome.trim().to_ascii_lowercase(), valor.trim().to_ascii_lowercase());
        if nome == "sec-fetch-dest" && valor != "document" {
            return false;
        }
        if nome == "sec-fetch-mode" && valor != "navigate" {
            return false;
        }
    }
    true
}

/// Depois do login, traz a janela do Dairus para a frente (o usuário estava no navegador).
fn trazer_para_frente(app: &AppHandle) {
    if let Some(janela) = app.get_webview_window("main") {
        let _ = janela.unminimize();
        let _ = janela.show();
        let _ = janela.set_focus();
    }
}

/// Espera o navegador voltar em http://127.0.0.1:47821/callback?code=… e devolve o `code`
/// (que o app troca pela sessão no Supabase, com PKCE). Desiste após 5 minutos.
#[tauri::command]
pub async fn aguardar_retorno_login(app: AppHandle) -> Res<String> {
    CANCELAR_LOGIN.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || -> Res<String> {
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
                    if !pedido_de_navegacao(&pedido) {
                        // Outro site/programa tentando cancelar ou injetar o login: ignora e continua esperando.
                        log::warn!("retorno de login ignorado: não é uma navegação do navegador");
                        responder(&mut stream, "403 Forbidden", "");
                        continue;
                    }
                    let query = resto.strip_prefix('?').unwrap_or("");
                    if let Some(codigo) = parametro(query, "code").filter(|c| codigo_valido(c)) {
                        responder(&mut stream, "200 OK", &pagina_retorno(true, None));
                        trazer_para_frente(&app);
                        return Ok(codigo);
                    }
                    let motivo = parametro(query, "error_description").or_else(|| parametro(query, "error"));
                    responder(&mut stream, "200 OK", &pagina_retorno(false, motivo.as_deref()));
                    trazer_para_frente(&app);
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

    #[test]
    fn pagina_de_retorno_tem_favicon_e_escapa_o_erro() {
        let ok = pagina_retorno(true, None);
        assert!(ok.contains("rel=\"icon\""));
        assert!(ok.contains("data:image/svg+xml,"));
        assert!(ok.contains("Login concluído"));
        assert!(csp_retorno().contains("script-src 'sha256-"));
        assert!(cabecalhos_seguros().contains("X-Frame-Options: DENY"));
        let erro = pagina_retorno(false, Some("<script>x</script>"));
        assert!(erro.contains("&lt;script&gt;"));
        assert!(!erro.contains("<script>x"));
    }

    #[test]
    fn so_aceita_navegacao_e_codigo_seguro() {
        assert!(pedido_de_navegacao("GET /callback?code=a HTTP/1.1\r\nHost: x\r\nSec-Fetch-Dest: document\r\nSec-Fetch-Mode: navigate\r\n"));
        assert!(pedido_de_navegacao("GET /callback?code=a HTTP/1.1\r\nHost: x\r\n"));
        assert!(!pedido_de_navegacao("GET /callback?error=x HTTP/1.1\r\nSec-Fetch-Dest: image\r\n"));
        assert!(!pedido_de_navegacao("GET /callback?error=x HTTP/1.1\r\nSec-Fetch-Mode: no-cors\r\n"));
        assert!(!pedido_de_navegacao("POST /callback HTTP/1.1\r\n"));
        assert!(codigo_valido("aa3c42b7-b468-48f9-bbc1-97f3673a419e"));
        assert!(!codigo_valido("abc"));
        assert!(!codigo_valido("aa3c42b7<script>-b468-48f9"));
    }
}

/// Apaga TUDO desta conta neste computador: banco (normal e cifrado), preferências,
/// backups e exportações. A nuvem é apagada antes, pelo app (precisa do login).
/// `confirmacao` precisa ser exatamente "EXCLUIR".
#[tauri::command]
pub fn excluir_dados_conta(app: AppHandle, state: State<AppState>, usuario_id: String, confirmacao: String) -> Res<()> {
    let id = id_valido(&usuario_id)?.to_string();
    if confirmacao != "EXCLUIR" {
        return Err("Digite EXCLUIR para confirmar.".into());
    }
    if USUARIO_ATUAL.lock().expect("mutex envenenado").as_deref() != Some(id.as_str()) {
        return Err("Só é possível excluir a conta que está aberta.".into());
    }
    // Troca para um banco vazio em memória SEM gravar nada (nem o cifrado).
    let vazio = crate::db::abrir_conexao(Path::new(":memory:")).map_err(e)?;
    crate::db::executar_migracoes(&vazio).map_err(e)?;
    {
        let mut guarda = state.conn.lock().expect("mutex envenenado");
        crate::cripto::encerrar_sessao();
        *guarda = vazio;
    }
    *USUARIO_ATUAL.lock().expect("mutex envenenado") = None;
    let dados = app.path().app_data_dir().map_err(e)?;
    let mut falhas = Vec::new();
    let mut remover_pasta = |p: PathBuf| {
        if p.exists() {
            if let Err(err) = std::fs::remove_dir_all(&p) {
                falhas.push(format!("{}: {err}", p.display()));
            }
        }
    };
    remover_pasta(dados.join("contas").join(&id));
    if let Ok(docs) = app.path().document_dir() {
        remover_pasta(docs.join("Dairus").join(&id));
    }
    let prefs = dados.join(format!("preferencias-{id}.json"));
    if prefs.exists() {
        if let Err(err) = std::fs::remove_file(&prefs) {
            falhas.push(format!("{}: {err}", prefs.display()));
        }
    }
    if falhas.is_empty() {
        log::info!("Dados locais da conta excluídos a pedido do usuário.");
        Ok(())
    } else {
        Err(format!("Alguns arquivos não puderam ser apagados (feche outros programas e tente de novo): {}", falhas.join("; ")))
    }
}
