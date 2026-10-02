//! Módulos que não movimentam o razão contábil: orçamento, metas,
//! patrimônio manual (bens/dívidas), radar de compras e backups.
//! Tudo em transações curtas, valores sempre em centavos inteiros.

use std::path::{Path, PathBuf};

use chrono::NaiveDate;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use crate::commands::AppState;

type Res<T> = Result<T, String>;

fn e<T: std::fmt::Display>(erro: T) -> String {
    erro.to_string()
}

fn data_valida(data: &str) -> Res<()> {
    NaiveDate::parse_from_str(data, "%Y-%m-%d").map(|_| ()).map_err(|_| "Data inválida.".to_string())
}

fn nome_valido(nome: &str) -> Res<String> {
    let n = nome.trim();
    if n.is_empty() {
        Err("Informe um nome.".into())
    } else {
        Ok(n.to_string())
    }
}

// ---------------------------------------------------------------- Orçamento

#[derive(Serialize)]
pub struct Orcamento {
    pub categoria_id: String,
    pub limite_centavos: i64,
}

#[tauri::command]
pub fn listar_orcamentos(state: State<AppState>) -> Res<Vec<Orcamento>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn.prepare("SELECT categoria_id, limite_centavos FROM orcamentos").map_err(e)?;
    let linhas = stmt
        .query_map([], |r| Ok(Orcamento { categoria_id: r.get(0)?, limite_centavos: r.get(1)? }))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(linhas)
}

/// `limite_centavos <= 0` remove o limite da categoria.
#[tauri::command]
pub fn definir_orcamento(state: State<AppState>, categoria_id: String, limite_centavos: i64) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let tipo: Option<String> = conn
        .query_row("SELECT tipo FROM contas_contabeis WHERE id = ?1", [&categoria_id], |r| r.get(0))
        .optional()
        .map_err(e)?;
    if tipo.as_deref() != Some("DESPESA") {
        return Err("O orçamento só vale para categorias de despesa.".into());
    }
    if limite_centavos <= 0 {
        conn.execute("DELETE FROM orcamentos WHERE categoria_id = ?1", [&categoria_id]).map_err(e)?;
    } else {
        conn.execute(
            "INSERT INTO orcamentos (categoria_id, limite_centavos) VALUES (?1, ?2)
             ON CONFLICT(categoria_id) DO UPDATE SET limite_centavos = excluded.limite_centavos,
             atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
            params![categoria_id, limite_centavos],
        )
        .map_err(e)?;
    }
    Ok(())
}

// -------------------------------------------------------------------- Metas

#[derive(Serialize)]
pub struct Meta {
    pub id: String,
    pub nome: String,
    pub valor_alvo_centavos: i64,
    pub prazo: Option<String>,
    pub guardado_centavos: i64,
}

#[tauri::command]
pub fn listar_metas(state: State<AppState>) -> Res<Vec<Meta>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.nome, m.valor_alvo_centavos, m.prazo,
                    COALESCE((SELECT SUM(valor_centavos) FROM metas_aportes a WHERE a.meta_id = m.id), 0)
             FROM metas m ORDER BY m.criado_em",
        )
        .map_err(e)?;
    let linhas = stmt
        .query_map([], |r| {
            Ok(Meta {
                id: r.get(0)?,
                nome: r.get(1)?,
                valor_alvo_centavos: r.get(2)?,
                prazo: r.get(3)?,
                guardado_centavos: r.get(4)?,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(linhas)
}

#[tauri::command]
pub fn criar_meta(
    state: State<AppState>,
    nome: String,
    valor_alvo_centavos: i64,
    prazo: Option<String>,
) -> Res<String> {
    let nome = nome_valido(&nome)?;
    if valor_alvo_centavos <= 0 {
        return Err("O valor da meta precisa ser maior que zero.".into());
    }
    if let Some(p) = &prazo {
        data_valida(p)?;
    }
    let conn = state.conn.lock().expect("mutex envenenado");
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO metas (id, nome, valor_alvo_centavos, prazo) VALUES (?1, ?2, ?3, ?4)",
        params![id, nome, valor_alvo_centavos, prazo],
    )
    .map_err(e)?;
    Ok(id)
}

/// Aporte positivo guarda dinheiro; negativo retira (nunca deixa o guardado abaixo de zero).
#[tauri::command]
pub fn aportar_meta(state: State<AppState>, meta_id: String, valor_centavos: i64, data: String) -> Res<()> {
    if valor_centavos == 0 {
        return Err("Informe um valor diferente de zero.".into());
    }
    data_valida(&data)?;
    let mut conn = state.conn.lock().expect("mutex envenenado");
    let tx = conn.transaction().map_err(e)?;
    let guardado: Option<i64> = tx
        .query_row(
            "SELECT COALESCE((SELECT SUM(valor_centavos) FROM metas_aportes WHERE meta_id = ?1), 0)
             WHERE EXISTS (SELECT 1 FROM metas WHERE id = ?1)",
            [&meta_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(e)?;
    let guardado = guardado.ok_or("Meta não encontrada.")?;
    if guardado + valor_centavos < 0 {
        return Err("A retirada é maior que o valor guardado.".into());
    }
    tx.execute(
        "INSERT INTO metas_aportes (id, meta_id, valor_centavos, data) VALUES (?1, ?2, ?3, ?4)",
        params![Uuid::new_v4().to_string(), meta_id, valor_centavos, data],
    )
    .map_err(e)?;
    tx.commit().map_err(e)
}

#[tauri::command]
pub fn excluir_meta(state: State<AppState>, meta_id: String) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    conn.execute("DELETE FROM metas WHERE id = ?1", [meta_id]).map_err(e)?;
    Ok(())
}

// --------------------------------------------------------------- Patrimônio

#[derive(Serialize)]
pub struct Avaliacao {
    pub data: String,
    pub valor_centavos: i64,
}

#[derive(Serialize)]
pub struct Bem {
    pub id: String,
    pub nome: String,
    pub tipo: String,
    pub valor_centavos: i64,
    pub avaliacoes: Vec<Avaliacao>,
}

#[tauri::command]
pub fn listar_bens(state: State<AppState>) -> Res<Vec<Bem>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn.prepare("SELECT id, nome, tipo FROM bens ORDER BY criado_em").map_err(e)?;
    let base = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    let mut bens = Vec::new();
    for (id, nome, tipo) in base {
        let mut av = conn
            .prepare(
                "SELECT data, valor_centavos FROM bens_avaliacoes WHERE bem_id = ?1
                 ORDER BY data DESC, criado_em DESC",
            )
            .map_err(e)?;
        let avaliacoes = av
            .query_map([&id], |r| Ok(Avaliacao { data: r.get(0)?, valor_centavos: r.get(1)? }))
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)?;
        let valor_centavos = avaliacoes.first().map(|a| a.valor_centavos).unwrap_or(0);
        bens.push(Bem { id, nome, tipo, valor_centavos, avaliacoes });
    }
    Ok(bens)
}

#[tauri::command]
pub fn criar_bem(state: State<AppState>, nome: String, tipo: String, valor_centavos: i64, data: String) -> Res<String> {
    let nome = nome_valido(&nome)?;
    if tipo != "BEM" && tipo != "DIVIDA" {
        return Err("Tipo inválido.".into());
    }
    if valor_centavos < 0 {
        return Err("O valor não pode ser negativo.".into());
    }
    data_valida(&data)?;
    let mut conn = state.conn.lock().expect("mutex envenenado");
    let tx = conn.transaction().map_err(e)?;
    let id = Uuid::new_v4().to_string();
    tx.execute("INSERT INTO bens (id, nome, tipo) VALUES (?1, ?2, ?3)", params![id, nome, tipo]).map_err(e)?;
    tx.execute(
        "INSERT INTO bens_avaliacoes (id, bem_id, valor_centavos, data) VALUES (?1, ?2, ?3, ?4)",
        params![Uuid::new_v4().to_string(), id, valor_centavos, data],
    )
    .map_err(e)?;
    tx.commit().map_err(e)?;
    Ok(id)
}

#[tauri::command]
pub fn atualizar_bem(state: State<AppState>, bem_id: String, valor_centavos: i64, data: String) -> Res<()> {
    if valor_centavos < 0 {
        return Err("O valor não pode ser negativo.".into());
    }
    data_valida(&data)?;
    let conn = state.conn.lock().expect("mutex envenenado");
    let existe: bool = conn
        .query_row("SELECT EXISTS(SELECT 1 FROM bens WHERE id = ?1)", [&bem_id], |r| r.get(0))
        .map_err(e)?;
    if !existe {
        return Err("Item não encontrado.".into());
    }
    conn.execute(
        "INSERT INTO bens_avaliacoes (id, bem_id, valor_centavos, data) VALUES (?1, ?2, ?3, ?4)",
        params![Uuid::new_v4().to_string(), bem_id, valor_centavos, data],
    )
    .map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn excluir_bem(state: State<AppState>, bem_id: String) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    conn.execute("DELETE FROM bens WHERE id = ?1", [bem_id]).map_err(e)?;
    Ok(())
}

// ------------------------------------------------------------------- Radar

#[derive(Serialize)]
pub struct PrecoObservado {
    pub id: String,
    pub loja: String,
    pub preco_centavos: i64,
    pub url: Option<String>,
    pub data: String,
}

#[derive(Serialize)]
pub struct ItemRadar {
    pub id: String,
    pub nome: String,
    pub preco_alvo_centavos: Option<i64>,
    pub precos: Vec<PrecoObservado>,
}

#[tauri::command]
pub fn listar_radar(state: State<AppState>) -> Res<Vec<ItemRadar>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn
        .prepare("SELECT id, nome, preco_alvo_centavos FROM radar_itens ORDER BY criado_em")
        .map_err(e)?;
    let base = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<i64>>(2)?)))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    let mut itens = Vec::new();
    for (id, nome, preco_alvo_centavos) in base {
        let mut ps = conn
            .prepare(
                "SELECT id, loja, preco_centavos, url, data FROM radar_precos WHERE item_id = ?1
                 ORDER BY data DESC, criado_em DESC",
            )
            .map_err(e)?;
        let precos = ps
            .query_map([&id], |r| {
                Ok(PrecoObservado {
                    id: r.get(0)?,
                    loja: r.get(1)?,
                    preco_centavos: r.get(2)?,
                    url: r.get(3)?,
                    data: r.get(4)?,
                })
            })
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)?;
        itens.push(ItemRadar { id, nome, preco_alvo_centavos, precos });
    }
    Ok(itens)
}

#[tauri::command]
pub fn criar_item_radar(state: State<AppState>, nome: String, preco_alvo_centavos: Option<i64>) -> Res<String> {
    let nome = nome_valido(&nome)?;
    if matches!(preco_alvo_centavos, Some(p) if p <= 0) {
        return Err("O preço-alvo precisa ser maior que zero.".into());
    }
    let conn = state.conn.lock().expect("mutex envenenado");
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO radar_itens (id, nome, preco_alvo_centavos) VALUES (?1, ?2, ?3)",
        params![id, nome, preco_alvo_centavos],
    )
    .map_err(e)?;
    Ok(id)
}

#[tauri::command]
pub fn registrar_preco_radar(
    state: State<AppState>,
    item_id: String,
    loja: String,
    preco_centavos: i64,
    url: Option<String>,
    data: String,
) -> Res<()> {
    let loja = nome_valido(&loja)?;
    if preco_centavos <= 0 {
        return Err("O preço precisa ser maior que zero.".into());
    }
    data_valida(&data)?;
    let url = url.map(|u| u.trim().to_string()).filter(|u| !u.is_empty());
    let conn = state.conn.lock().expect("mutex envenenado");
    let existe: bool = conn
        .query_row("SELECT EXISTS(SELECT 1 FROM radar_itens WHERE id = ?1)", [&item_id], |r| r.get(0))
        .map_err(e)?;
    if !existe {
        return Err("Item não encontrado.".into());
    }
    conn.execute(
        "INSERT INTO radar_precos (id, item_id, loja, preco_centavos, url, data) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![Uuid::new_v4().to_string(), item_id, loja, preco_centavos, url, data],
    )
    .map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn excluir_item_radar(state: State<AppState>, item_id: String) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    conn.execute("DELETE FROM radar_itens WHERE id = ?1", [item_id]).map_err(e)?;
    Ok(())
}

// ------------------------------------------------------- Backup e exportação

#[derive(Serialize)]
pub struct InfoBackup {
    pub nome: String,
    pub caminho: String,
    pub tamanho_bytes: u64,
    /// Data/hora local do arquivo, "AAAA-MM-DD HH:MM:SS".
    pub criado_em: String,
}

fn pasta_dairus(app: &AppHandle, sub: &str) -> Res<PathBuf> {
    let base = app.path().document_dir().map_err(e)?.join("Dairus").join(sub);
    std::fs::create_dir_all(&base).map_err(e)?;
    Ok(base)
}

fn nome_seguro(nome: &str) -> Res<&str> {
    let ok = !nome.is_empty()
        && nome.len() <= 120
        && nome.chars().all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | ' '))
        && !nome.contains("..");
    if ok {
        Ok(nome)
    } else {
        Err("Nome de arquivo inválido.".into())
    }
}

fn info_do_arquivo(caminho: &Path) -> Option<InfoBackup> {
    let meta = std::fs::metadata(caminho).ok()?;
    let modificado: chrono::DateTime<chrono::Local> = meta.modified().ok()?.into();
    Some(InfoBackup {
        nome: caminho.file_name()?.to_string_lossy().to_string(),
        caminho: caminho.to_string_lossy().to_string(),
        tamanho_bytes: meta.len(),
        criado_em: modificado.format("%Y-%m-%d %H:%M:%S").to_string(),
    })
}

fn gravar_backup(conn: &Connection, pasta: &Path, prefixo: &str) -> Res<InfoBackup> {
    let nome = format!("{prefixo}-{}.db", chrono::Local::now().format("%Y%m%d-%H%M%S"));
    let destino = pasta.join(nome);
    conn.backup(rusqlite::MAIN_DB, &destino, None).map_err(e)?;
    info_do_arquivo(&destino).ok_or_else(|| "Backup criado, mas não foi possível ler o arquivo.".to_string())
}

#[tauri::command]
pub fn criar_backup(app: AppHandle, state: State<AppState>) -> Res<InfoBackup> {
    let pasta = pasta_dairus(&app, "Backups")?;
    let conn = state.conn.lock().expect("mutex envenenado");
    gravar_backup(&conn, &pasta, "dairus")
}

#[tauri::command]
pub fn listar_backups(app: AppHandle) -> Res<Vec<InfoBackup>> {
    let pasta = pasta_dairus(&app, "Backups")?;
    let mut lista: Vec<InfoBackup> = std::fs::read_dir(&pasta)
        .map_err(e)?
        .filter_map(|ent| ent.ok())
        .map(|ent| ent.path())
        .filter(|p| p.extension().is_some_and(|x| x == "db"))
        .filter_map(|p| info_do_arquivo(&p))
        .collect();
    lista.sort_by(|a, b| b.criado_em.cmp(&a.criado_em));
    Ok(lista)
}

fn validar_arquivo_backup(caminho: &Path) -> Res<()> {
    let origem = Connection::open_with_flags(caminho, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(e)?;
    let integridade: String = origem
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|_| "O arquivo não é um banco SQLite válido.".to_string())?;
    if integridade != "ok" {
        return Err(format!("Falha na verificação de integridade: {integridade}"));
    }
    let tem_razao: bool = origem
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lancamentos')",
            [],
            |r| r.get(0),
        )
        .map_err(e)?;
    if !tem_razao {
        return Err("Este arquivo não parece ser um backup do Dairus.".into());
    }
    Ok(())
}

/// Restaura um backup da pasta de backups. Valida a integridade antes e
/// guarda uma cópia de segurança do estado atual, para poder desfazer.
#[tauri::command]
pub fn restaurar_backup(app: AppHandle, state: State<AppState>, nome: String) -> Res<InfoBackup> {
    let nome = nome_seguro(&nome)?;
    let pasta = pasta_dairus(&app, "Backups")?;
    let origem = pasta.join(nome);
    if !origem.is_file() {
        return Err("Backup não encontrado.".into());
    }
    validar_arquivo_backup(&origem)?;

    let mut conn = state.conn.lock().expect("mutex envenenado");
    let seguranca = gravar_backup(&conn, &pasta, "antes-de-restaurar")?;
    conn.restore(rusqlite::MAIN_DB, &origem, None::<fn(rusqlite::backup::Progress)>).map_err(e)?;
    // Um backup antigo pode não ter tabelas criadas em migrações posteriores.
    crate::db::executar_migracoes(&conn).map_err(e)?;
    conn.pragma_update(None, "foreign_keys", "ON").map_err(e)?;
    Ok(seguranca)
}

/// Grava um arquivo exportado (CSV, texto) em Documentos\Dairus\Exportacoes.
#[tauri::command]
pub fn salvar_exportacao(app: AppHandle, nome_arquivo: String, conteudo: String) -> Res<String> {
    let nome = nome_seguro(&nome_arquivo)?;
    let caminho = pasta_dairus(&app, "Exportacoes")?.join(nome);
    std::fs::write(&caminho, conteudo.as_bytes()).map_err(e)?;
    Ok(caminho.to_string_lossy().to_string())
}
