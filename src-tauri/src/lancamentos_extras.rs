//! Tags livres, comprovantes anexados, regras de categoria automática e
//! lançamento sozinho das receitas/contas agendadas.

use rusqlite::params;
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

use crate::accounting::engine;
use crate::accounting::models::Lancamento;
use crate::commands::AppState;

type Res<T> = Result<T, String>;
const TAMANHO_MAXIMO_ANEXO: usize = 15 * 1024 * 1024;

fn e<T: std::fmt::Display>(erro: T) -> String {
    erro.to_string()
}

/// "  Viagem  " → "viagem"; tags vazias ou longas demais são descartadas.
pub fn normalizar_tag(t: &str) -> Option<String> {
    let limpa: String = t.trim().trim_start_matches('#').to_lowercase().split_whitespace().collect::<Vec<_>>().join(" ");
    (!limpa.is_empty() && limpa.chars().count() <= 30).then_some(limpa)
}

#[tauri::command]
pub fn definir_tags(state: State<AppState>, lancamento_id: String, tags: Vec<String>) -> Res<Vec<String>> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    let tx = conn.transaction().map_err(e)?;
    tx.execute("DELETE FROM lancamento_tags WHERE lancamento_id = ?1", [&lancamento_id]).map_err(e)?;
    let mut finais: Vec<String> = tags.iter().filter_map(|t| normalizar_tag(t)).collect();
    finais.sort();
    finais.dedup();
    for t in &finais {
        tx.execute("INSERT INTO lancamento_tags (lancamento_id, tag) VALUES (?1, ?2)", params![lancamento_id, t]).map_err(e)?;
    }
    tx.commit().map_err(e)?;
    Ok(finais)
}

#[derive(Serialize)]
pub struct TagLancamento {
    pub lancamento_id: String,
    pub tag: String,
}

#[tauri::command]
pub fn listar_tags(state: State<AppState>) -> Res<Vec<TagLancamento>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn.prepare("SELECT lancamento_id, tag FROM lancamento_tags ORDER BY tag").map_err(e)?;
    let v = stmt
        .query_map([], |r| Ok(TagLancamento { lancamento_id: r.get(0)?, tag: r.get(1)? }))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(v)
}

#[derive(Serialize)]
pub struct InfoAnexo {
    pub id: String,
    pub lancamento_id: Option<String>,
    pub nome: String,
    pub mime: String,
    pub tamanho: i64,
    pub criado_em: String,
}

#[tauri::command]
pub fn anexar_arquivo(state: State<AppState>, lancamento_id: String, nome: String, mime: String, conteudo: Vec<u8>) -> Res<InfoAnexo> {
    if conteudo.is_empty() {
        return Err("Arquivo vazio.".into());
    }
    if conteudo.len() > TAMANHO_MAXIMO_ANEXO {
        return Err("Arquivo grande demais (máximo 15 MB).".into());
    }
    let nome: String = nome.chars().filter(|c| !"\\/:*?\"<>|".contains(*c)).take(120).collect();
    let nome = if nome.trim().is_empty() { "comprovante".to_string() } else { nome };
    let conn = state.conn.lock().expect("mutex envenenado");
    let existe: bool = conn
        .query_row("SELECT EXISTS(SELECT 1 FROM lancamentos WHERE id = ?1)", [&lancamento_id], |r| r.get(0))
        .map_err(e)?;
    if !existe {
        return Err("Lançamento não encontrado.".into());
    }
    let id = Uuid::new_v4().to_string();
    let tamanho = conteudo.len() as i64;
    conn.execute(
        "INSERT INTO anexos (id, lancamento_id, nome, mime, tamanho, conteudo) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, lancamento_id, nome, mime, tamanho, conteudo],
    )
    .map_err(e)?;
    let criado_em: String = conn.query_row("SELECT criado_em FROM anexos WHERE id = ?1", [&id], |r| r.get(0)).map_err(e)?;
    Ok(InfoAnexo { id, lancamento_id: Some(lancamento_id), nome, mime, tamanho, criado_em })
}

#[tauri::command]
pub fn listar_anexos(state: State<AppState>) -> Res<Vec<InfoAnexo>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn
        .prepare("SELECT id, lancamento_id, nome, mime, tamanho, criado_em FROM anexos ORDER BY criado_em")
        .map_err(e)?;
    let v = stmt
        .query_map([], |r| Ok(InfoAnexo { id: r.get(0)?, lancamento_id: r.get(1)?, nome: r.get(2)?, mime: r.get(3)?, tamanho: r.get(4)?, criado_em: r.get(5)? }))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(v)
}

/// Grava o anexo numa pasta temporária e devolve o caminho, para abrir no programa padrão.
#[tauri::command]
pub fn abrir_anexo(state: State<AppState>, id: String) -> Res<String> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let (nome, conteudo): (String, Vec<u8>) = conn
        .query_row("SELECT nome, conteudo FROM anexos WHERE id = ?1", [&id], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|_| "Comprovante não encontrado.".to_string())?;
    let pasta = std::env::temp_dir().join("dairus-comprovantes");
    std::fs::create_dir_all(&pasta).map_err(e)?;
    let caminho = pasta.join(format!("{}-{}", &id[..8], nome));
    std::fs::write(&caminho, conteudo).map_err(e)?;
    Ok(caminho.to_string_lossy().to_string())
}

#[tauri::command]
pub fn ler_anexo(state: State<AppState>, id: String) -> Res<Vec<u8>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    conn.query_row("SELECT conteudo FROM anexos WHERE id = ?1", [&id], |r| r.get(0)).map_err(|_| "Comprovante não encontrado.".to_string())
}

#[tauri::command]
pub fn excluir_anexo(state: State<AppState>, id: String) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    conn.execute("DELETE FROM anexos WHERE id = ?1", [&id]).map_err(e)?;
    Ok(())
}

#[derive(Serialize)]
pub struct RegraCategoria {
    pub id: String,
    pub padrao: String,
    pub categoria_id: String,
}

#[tauri::command]
pub fn listar_regras(state: State<AppState>) -> Res<Vec<RegraCategoria>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn.prepare("SELECT id, padrao, categoria_id FROM regras_categoria ORDER BY length(padrao) DESC, padrao").map_err(e)?;
    let v = stmt
        .query_map([], |r| Ok(RegraCategoria { id: r.get(0)?, padrao: r.get(1)?, categoria_id: r.get(2)? }))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(v)
}

/// Cria ou troca a regra "descrição contém X → categoria Y".
#[tauri::command]
pub fn salvar_regra(state: State<AppState>, padrao: String, categoria_id: String) -> Res<()> {
    let padrao = padrao.trim().to_lowercase();
    if padrao.chars().count() < 2 {
        return Err("O texto da regra precisa ter pelo menos 2 letras.".into());
    }
    let conn = state.conn.lock().expect("mutex envenenado");
    conn.execute(
        "INSERT INTO regras_categoria (id, padrao, categoria_id) VALUES (?1, ?2, ?3)
         ON CONFLICT(padrao) DO UPDATE SET categoria_id = excluded.categoria_id",
        params![Uuid::new_v4().to_string(), padrao, categoria_id],
    )
    .map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn excluir_regra(state: State<AppState>, id: String) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    conn.execute("DELETE FROM regras_categoria WHERE id = ?1", [&id]).map_err(e)?;
    Ok(())
}

/// Lança as receitas/contas agendadas como "automáticas" que já venceram.
#[tauri::command]
pub fn processar_agendamentos_automaticos(state: State<AppState>, hoje: String) -> Res<Vec<Lancamento>> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    engine::processar_automaticos(&mut conn, &hoje).map_err(String::from)
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn normaliza_tags() {
        assert_eq!(normalizar_tag("  #Viagem  ").as_deref(), Some("viagem"));
        assert_eq!(normalizar_tag("Presente   de  Natal").as_deref(), Some("presente de natal"));
        assert_eq!(normalizar_tag("   "), None);
        assert_eq!(normalizar_tag(&"x".repeat(31)), None);
    }
}
