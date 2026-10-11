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

/// Marca da última atualização do app (ver `sincronizacao::MarcaAtualizacao`) da conta aberta.
pub fn arquivo_marca_atualizacao(app: &AppHandle) -> Option<PathBuf> {
    let id = USUARIO_ATUAL.lock().expect("mutex envenenado").clone()?;
    let banco = caminho_banco_conta(app, &id).ok()?;
    Some(banco.parent()?.join(crate::sincronizacao::ARQUIVO_MARCA))
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

/// Marca, na pasta da conta, de que ela começou a importar o banco de antes do login e
/// ainda não terminou (cópia + arquivamento). Enquanto existir, o banco antigo é dessa
/// conta: não é oferecido a nenhuma outra, e a importação é retomada ao abrir a conta.
const IMPORTACAO_PENDENTE: &str = "importacao-legado-pendente";

/// Contas deste computador (ids) que reivindicaram o banco de antes do login: começaram a
/// importá-lo e ainda não terminaram.
fn contas_que_reivindicaram(dados: &Path) -> Vec<String> {
    let Ok(pastas) = std::fs::read_dir(dados.join("contas")) else { return Vec::new() };
    pastas
        .filter_map(|ent| ent.ok())
        .map(|ent| ent.path())
        .filter(|pasta| pasta.join(IMPORTACAO_PENDENTE).is_file())
        .filter_map(|pasta| pasta.file_name().map(|n| n.to_string_lossy().into_owned()))
        .collect()
}

/// Lançamentos do banco de antes do login que ainda estão no lugar de origem
/// (0 quando não há banco antigo, quando uma conta já o importou e arquivou, ou quando
/// uma conta começou a importá-lo e ainda vai terminar).
fn lancamentos_no_legado(dados: &Path) -> i64 {
    let legado = dados.join("dairus.db");
    if legado.is_file() && contas_que_reivindicaram(dados).is_empty() { contar_lancamentos(&legado) } else { 0 }
}

/// Copia o banco de antes do login (`legado`) para o banco da conta (`destino`).
/// A API de backup do SQLite copia de forma consistente (inclui o que está no WAL).
/// Copia para um arquivo temporário e só então renomeia: se falhar (ou o app fechar) no
/// meio, não fica um banco pela metade na conta.
fn copiar_legado_para_conta(legado: &Path, destino: &Path) -> Res<()> {
    let temporario = destino.with_extension("db.importando");
    let _ = std::fs::remove_file(&temporario);
    let origem = Connection::open_with_flags(legado, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(e)?;
    let copiado = origem.backup(rusqlite::MAIN_DB, &temporario, None).map_err(e);
    drop(origem);
    if let Err(erro) = copiado.and_then(|_| std::fs::rename(&temporario, destino).map_err(e)) {
        let _ = std::fs::remove_file(&temporario);
        return Err(erro);
    }
    Ok(())
}

/// Importa o banco de antes do login para a conta de forma RETOMÁVEL: marca a pendência na
/// pasta da conta, copia (se ainda não copiou) e arquiva o antigo. Devolve `true` quando o
/// banco foi copiado e arquivado: aí quem chama tira a marca (depois de levar também as
/// preferências). Se o app fechar no meio, a próxima abertura desta conta continua de onde
/// parou, e nenhuma outra conta recebe a oferta desses dados nesse intervalo.
fn importar_legado_retomavel(legado: &Path, destino: &Path, backups: &Path, pasta_conta: &Path, carimbo: &str) -> Res<bool> {
    let pendente = pasta_conta.join(IMPORTACAO_PENDENTE);
    std::fs::write(&pendente, b"").map_err(e)?;
    if !destino.is_file() && legado.is_file() {
        if let Err(erro) = copiar_legado_para_conta(legado, destino) {
            // Nada foi importado: o banco antigo continua disponível (sem dono).
            let _ = std::fs::remove_file(&pendente);
            return Err(erro);
        }
    }
    if legado.is_file() {
        match arquivar_banco_legado(legado, backups, pasta_conta, carimbo) {
            Ok(arquivo) => log::info!("banco de antes do login importado e arquivado em {}", arquivo.display()),
            Err(erro) => {
                // A marca fica: tenta de novo na próxima abertura, e ninguém mais recebe a oferta.
                log::warn!("banco de antes do login importado, mas não arquivado (tenta de novo ao abrir): {erro}");
                return Ok(false);
            }
        }
    }
    Ok(true)
}

/// ARQUIVA o banco de antes do login como backup da conta que o importou: uma cópia
/// consistente em `pasta_backups` (ou, se não der, em `<pasta da conta>\legado`) e o
/// original (com `-wal` e `-shm`) é apagado. Assim nenhuma outra conta deste computador
/// vê nem recebe a oferta desses dados. Devolve onde o backup ficou.
fn arquivar_banco_legado(legado: &Path, pasta_backups: &Path, pasta_conta: &Path, carimbo: &str) -> Res<PathBuf> {
    let origem = Connection::open_with_flags(legado, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(e)?;
    let nome = format!("antes-do-login-{carimbo}.db");
    let candidatos = [pasta_backups.join(&nome), pasta_conta.join("legado").join(&nome)];
    let mut arquivado = None;
    for alvo in candidatos {
        if let Some(pasta) = alvo.parent() {
            if std::fs::create_dir_all(pasta).is_err() {
                continue;
            }
        }
        if origem.backup(rusqlite::MAIN_DB, &alvo, None).is_ok() && alvo.is_file() {
            arquivado = Some(alvo);
            break;
        }
        let _ = std::fs::remove_file(&alvo);
    }
    drop(origem);
    let arquivado = arquivado.ok_or_else(|| "Não foi possível arquivar o banco de antes do login.".to_string())?;
    for sufixo in ["", "-wal", "-shm"] {
        let arquivo = format!("{}{sufixo}", legado.to_string_lossy());
        if let Err(err) = std::fs::remove_file(&arquivo) {
            if err.kind() != std::io::ErrorKind::NotFound {
                log::warn!("não foi possível apagar o banco antigo ({sufixo}): {err}");
            }
        }
    }
    Ok(arquivado)
}

/// Grava as preferências de antes do login (texto puro, pode ter a chave do Gemini)
/// como arquivo de backup da conta que as importou.
fn arquivar_preferencias_legadas(itens: &[(String, serde_json::Value)], pasta: &Path, carimbo: &str) -> Res<PathBuf> {
    std::fs::create_dir_all(pasta).map_err(e)?;
    let mapa: serde_json::Map<String, serde_json::Value> = itens.iter().cloned().collect();
    let alvo = pasta.join(format!("preferencias-antes-do-login-{carimbo}.json"));
    std::fs::write(&alvo, serde_json::to_vec_pretty(&mapa).map_err(e)?).map_err(e)?;
    Ok(alvo)
}

/// Leva as preferências do arquivo antigo (`preferencias.json`) para a conta, guarda uma
/// cópia no backup da conta e ESVAZIA o arquivo antigo (e a cópia em memória do plugin,
/// que senão o regravaria ao sair). Devolve quantas chaves foram levadas.
fn migrar_preferencias_legadas(app: &AppHandle, id: &str, pasta_backup: &Path, carimbo: &str) -> Res<usize> {
    use tauri_plugin_store::StoreExt;
    let antiga = app.store("preferencias.json").map_err(e)?;
    let itens = antiga.entries();
    if itens.is_empty() {
        return Ok(0);
    }
    let nova = app.store(format!("preferencias-{id}.json")).map_err(e)?;
    for (chave, valor) in &itens {
        // Nunca sobrescreve o que a conta já tem.
        if !nova.has(chave) {
            nova.set(chave.clone(), valor.clone());
        }
    }
    nova.save().map_err(e)?;
    arquivar_preferencias_legadas(&itens, pasta_backup, carimbo)?;
    antiga.clear();
    antiga.save().map_err(e)?;
    Ok(itens.len())
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
    let dados = app.path().app_data_dir().map_err(e)?;
    let banco = dados.join("contas").join(id).join("dairus.db");
    let cifrado = banco.with_extension("db.cripto");
    Ok(SituacaoConta {
        criptografado: cifrado.is_file(),
        primeiro_acesso: !banco.is_file() && !cifrado.is_file(),
        lancamentos_legado: lancamentos_no_legado(&dados),
    })
}

/// Abre (ou cria) o banco da conta e passa a usá-lo em todos os comandos.
/// `importar_legado` copia o banco antigo deste computador para a conta (só no primeiro
/// acesso) e depois o MOVE para um backup dessa conta: nenhuma outra conta vê esses dados.
#[tauri::command]
pub fn abrir_conta(app: AppHandle, state: State<AppState>, usuario_id: String, importar_legado: bool) -> Res<()> {
    let id = id_valido(&usuario_id)?.to_string();
    if caminho_cripto(&app, &id)?.is_file() {
        return Err("SENHA_NECESSARIA".into());
    }
    crate::documentos::limpar_abertos(&app);
    let destino = caminho_banco_conta(&app, &id)?;
    let pasta_conta = destino.parent().unwrap_or(Path::new(".")).to_path_buf();
    // Importação começada e não terminada (o app fechou no meio): continua agora.
    let retomar = pasta_conta.join(IMPORTACAO_PENDENTE).is_file();
    if retomar || (importar_legado && !destino.is_file()) {
        let legado = caminho_banco_legado(&app)?;
        let carimbo = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
        let dados = app.path().app_data_dir().map_err(e)?;
        // Outra conta já começou a importar o banco antigo (e as preferências antigas): são dela.
        let de_outra = contas_que_reivindicaram(&dados).iter().any(|outra| outra != &id);
        if !de_outra {
            let concluido = if legado.is_file() {
                let backups = app.path().document_dir().map(|d| d.join("Dairus").join(&id).join("Backups")).unwrap_or_else(|_| pasta_conta.join("legado"));
                importar_legado_retomavel(&legado, &destino, &backups, &pasta_conta, &carimbo)?
            } else {
                true
            };
            // As preferências antigas (podem ter chaves de API) saem do arquivo comum a todas as contas.
            match migrar_preferencias_legadas(&app, &id, &pasta_conta.join("legado"), &carimbo) {
                Ok(n) if n > 0 => log::info!("{n} preferência(s) de antes do login levadas para a conta"),
                Ok(_) => {}
                Err(erro) => log::warn!("não foi possível levar as preferências de antes do login: {erro}"),
            }
            if concluido {
                let _ = std::fs::remove_file(pasta_conta.join(IMPORTACAO_PENDENTE));
            }
        }
    }
    let conn = crate::db::abrir_conexao(&destino).map_err(e)?;
    let marca = destino.parent().unwrap_or(Path::new(".")).join(crate::sincronizacao::ARQUIVO_MARCA);
    crate::sincronizacao::migrar_registrando(&conn, &marca).map_err(e)?;
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
    let marca = caminho_banco_conta(app, &id)?.with_file_name(crate::sincronizacao::ARQUIVO_MARCA);
    crate::sincronizacao::migrar_registrando(&conn, &marca).map_err(e)?;
    crate::documentos::limpar_abertos(app);
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

/// Ao sair da conta, volta para um banco vazio em memória (nada fica aberto) e apaga
/// do disco os anexos que foram abertos no programa padrão.
#[tauri::command]
pub fn fechar_conta(app: AppHandle, state: State<AppState>) -> Res<()> {
    let conn = crate::db::abrir_conexao(Path::new(":memory:")).map_err(e)?;
    crate::db::executar_migracoes(&conn).map_err(e)?;
    let mut guarda = state.conn.lock().expect("mutex envenenado");
    crate::cripto::persistir(&guarda, false)?;
    crate::cripto::encerrar_sessao();
    *guarda = conn;
    drop(guarda);
    *USUARIO_ATUAL.lock().expect("mutex envenenado") = None;
    crate::documentos::limpar_abertos(&app);
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

    fn pasta_temp(nome: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("dairus-teste-{nome}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    /// Banco antigo (de antes do login), em modo WAL como o do app, com `n` lançamentos.
    fn banco_antigo(caminho: &Path, n: i64) {
        let c = Connection::open(caminho).unwrap();
        c.pragma_update(None, "journal_mode", "WAL").unwrap();
        c.execute_batch("CREATE TABLE lancamentos (id INTEGER PRIMARY KEY, descricao TEXT)").unwrap();
        for i in 0..n {
            c.execute("INSERT INTO lancamentos (descricao) VALUES (?1)", [format!("compra {i}")]).unwrap();
        }
    }

    #[test]
    fn banco_de_antes_do_login_so_e_oferecido_a_uma_conta_e_depois_vira_backup_dela() {
        let dados = pasta_temp("legado");
        let docs = pasta_temp("legado-docs");
        banco_antigo(&dados.join("dairus.db"), 3);
        assert_eq!(lancamentos_no_legado(&dados), 3);

        // A conta A aceita levar os dados.
        let pasta_a = dados.join("contas").join("aaaaaaaa-0000-4000-8000-000000000001");
        std::fs::create_dir_all(&pasta_a).unwrap();
        let destino_a = pasta_a.join("dairus.db");
        let backups_a = docs.join("Dairus").join("aaaaaaaa-0000-4000-8000-000000000001").join("Backups");
        copiar_legado_para_conta(&dados.join("dairus.db"), &destino_a).unwrap();
        let backup = arquivar_banco_legado(&dados.join("dairus.db"), &backups_a, &pasta_a, "20260101-120000").unwrap();

        // A conta ficou com os dados e o backup também os tem, abrindo sozinho (sem -wal).
        assert_eq!(contar_lancamentos(&destino_a), 3);
        assert!(backup.starts_with(&backups_a) && backup.is_file());
        assert_eq!(contar_lancamentos(&backup), 3);
        // O banco antigo (e os arquivos do WAL) saiu do lugar comum: ninguém mais o vê.
        for sufixo in ["", "-wal", "-shm"] {
            assert!(!dados.join(format!("dairus.db{sufixo}")).exists(), "dairus.db{sufixo} ainda existe");
        }
        assert_eq!(lancamentos_no_legado(&dados), 0);

        // A conta B, no mesmo PC, não recebe a oferta.
        let pasta_b = dados.join("contas").join("bbbbbbbb-0000-4000-8000-000000000002");
        assert!(!pasta_b.join("dairus.db").exists());
        assert_eq!(lancamentos_no_legado(&dados), 0);
        let _ = std::fs::remove_dir_all(&dados);
        let _ = std::fs::remove_dir_all(&docs);
    }

    #[test]
    fn app_fechou_entre_a_copia_e_o_arquivamento_a_conta_retoma_e_ninguem_mais_recebe_a_oferta() {
        let dados = pasta_temp("legado-retoma");
        let legado = dados.join("dairus.db");
        banco_antigo(&legado, 2);
        let pasta_a = dados.join("contas").join("aaaaaaaa-0000-4000-8000-000000000001");
        std::fs::create_dir_all(&pasta_a).unwrap();
        let destino = pasta_a.join("dairus.db");
        let backups = dados.join("Backups-A");

        // Começou: marcou a pendência e copiou, mas o app fechou antes de arquivar.
        std::fs::write(pasta_a.join(IMPORTACAO_PENDENTE), b"").unwrap();
        copiar_legado_para_conta(&legado, &destino).unwrap();
        assert!(legado.is_file());
        // O banco antigo é da conta A: não aparece para outra conta.
        assert_eq!(contas_que_reivindicaram(&dados), vec!["aaaaaaaa-0000-4000-8000-000000000001".to_string()]);
        assert_eq!(lancamentos_no_legado(&dados), 0);

        // A conta A abre de novo: termina o arquivamento sem copiar outra vez.
        assert!(importar_legado_retomavel(&legado, &destino, &backups, &pasta_a, "20260101-120000").unwrap());
        assert!(!legado.exists());
        assert_eq!(contar_lancamentos(&destino), 2);
        let arquivados: Vec<_> = std::fs::read_dir(&backups).unwrap().flatten().collect();
        assert_eq!(arquivados.len(), 1);
        let _ = std::fs::remove_dir_all(&dados);
    }

    #[test]
    fn app_fechou_no_meio_da_copia_a_conta_copia_de_novo_sem_banco_pela_metade() {
        let dados = pasta_temp("legado-meio");
        let legado = dados.join("dairus.db");
        banco_antigo(&legado, 4);
        let pasta_a = dados.join("contas").join("aaaaaaaa-0000-4000-8000-000000000001");
        std::fs::create_dir_all(&pasta_a).unwrap();
        let destino = pasta_a.join("dairus.db");
        // Sobrou só o temporário pela metade (o banco da conta nunca é escrito direto).
        std::fs::write(pasta_a.join(IMPORTACAO_PENDENTE), b"").unwrap();
        std::fs::write(destino.with_extension("db.importando"), b"metade").unwrap();
        assert!(!destino.exists());

        assert!(importar_legado_retomavel(&legado, &destino, &dados.join("Backups"), &pasta_a, "20260101-120000").unwrap());
        assert_eq!(contar_lancamentos(&destino), 4);
        assert!(!destino.with_extension("db.importando").exists());
        assert!(!legado.exists());
        let _ = std::fs::remove_dir_all(&dados);
    }

    #[test]
    fn copia_que_falha_libera_o_banco_antigo() {
        let dados = pasta_temp("legado-libera");
        let legado = dados.join("dairus.db");
        std::fs::write(&legado, b"isto nao e um banco sqlite").unwrap();
        let pasta_a = dados.join("contas").join("aaaaaaaa-0000-4000-8000-000000000001");
        std::fs::create_dir_all(&pasta_a).unwrap();
        let destino = pasta_a.join("dairus.db");
        assert!(importar_legado_retomavel(&legado, &destino, &dados.join("Backups"), &pasta_a, "x").is_err());
        assert!(!destino.exists());
        assert!(legado.exists());
        assert!(contas_que_reivindicaram(&dados).is_empty(), "sem dono: pode ser oferecido de novo");
        let _ = std::fs::remove_dir_all(&dados);
    }

    #[test]
    fn sem_pasta_de_backups_o_arquivo_fica_na_pasta_da_conta() {
        let dados = pasta_temp("legado-reserva");
        banco_antigo(&dados.join("dairus.db"), 1);
        let pasta_conta = dados.join("contas").join("aaaaaaaa-0000-4000-8000-000000000001");
        std::fs::create_dir_all(&pasta_conta).unwrap();
        // "Pasta de backups" impossível: um arquivo ocupa o lugar do diretório.
        let ocupado = dados.join("nao-e-pasta");
        std::fs::write(&ocupado, b"x").unwrap();
        let backup = arquivar_banco_legado(&dados.join("dairus.db"), &ocupado.join("Backups"), &pasta_conta, "20260101-120000").unwrap();
        assert!(backup.starts_with(pasta_conta.join("legado")));
        assert_eq!(contar_lancamentos(&backup), 1);
        assert!(!dados.join("dairus.db").exists());
        let _ = std::fs::remove_dir_all(&dados);
    }

    #[test]
    fn falha_ao_importar_nao_deixa_banco_pela_metade_nem_apaga_o_antigo() {
        let dados = pasta_temp("legado-falha");
        std::fs::write(dados.join("dairus.db"), b"isto nao e um banco sqlite").unwrap();
        let destino = dados.join("conta.db");
        assert!(copiar_legado_para_conta(&dados.join("dairus.db"), &destino).is_err());
        assert!(!destino.exists());
        assert!(dados.join("dairus.db").exists());
        let _ = std::fs::remove_dir_all(&dados);
    }

    #[test]
    fn preferencias_antigas_viram_arquivo_de_backup_da_conta() {
        let pasta = pasta_temp("prefs-legadas").join("legado");
        let itens = vec![("tema".to_string(), serde_json::json!("escuro")), ("gemini_chave".to_string(), serde_json::json!("chave-de-teste"))];
        let arquivo = arquivar_preferencias_legadas(&itens, &pasta, "20260101-120000").unwrap();
        let lido: serde_json::Value = serde_json::from_slice(&std::fs::read(&arquivo).unwrap()).unwrap();
        assert_eq!(lido["tema"], "escuro");
        assert_eq!(lido["gemini_chave"], "chave-de-teste");
        let _ = std::fs::remove_dir_all(pasta.parent().unwrap());
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
