//! Apoio à sincronização entre computadores: uma "impressão digital" dos
//! dados (para saber se algo mudou desde a última sincronização) e uma cópia
//! consistente do banco para enviar à nuvem.

use std::path::Path;

use rusqlite::types::ValueRef;
use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, State};

use crate::commands::AppState;
use crate::extras::pasta_dairus;

const FNV_INICIO: u64 = 0xcbf2_9ce4_8422_2325;
const FNV_PRIMO: u64 = 0x0000_0100_0000_01b3;

fn misturar(h: &mut u64, bytes: &[u8]) {
    for b in bytes {
        *h ^= *b as u64;
        *h = h.wrapping_mul(FNV_PRIMO);
    }
}

/// Resumo (FNV-1a de 64 bits) de todas as linhas de todas as tabelas de dados,
/// em ordem fixa. Muda se qualquer valor mudar; não serve como criptografia,
/// só para detectar alteração.
pub fn calcular_impressao(conn: &Connection) -> rusqlite::Result<String> {
    let mut tabelas: Vec<String> = conn
        .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table'
             AND name NOT LIKE 'sqlite_%' AND name NOT IN ('schema_migrations', 'auditoria')",
        )?
        .query_map([], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    tabelas.sort();

    let mut h = FNV_INICIO;
    let mut linhas_total: i64 = 0;
    for tabela in &tabelas {
        misturar(&mut h, tabela.as_bytes());
        let mut stmt = conn.prepare(&format!("SELECT * FROM \"{}\" ORDER BY rowid", tabela.replace('"', "\"\"")))?;
        let colunas = stmt.column_count();
        let mut linhas = stmt.query([])?;
        while let Some(linha) = linhas.next()? {
            linhas_total += 1;
            for i in 0..colunas {
                match linha.get_ref(i)? {
                    ValueRef::Null => misturar(&mut h, &[0]),
                    ValueRef::Integer(v) => {
                        misturar(&mut h, &[1]);
                        misturar(&mut h, &v.to_le_bytes());
                    }
                    ValueRef::Real(v) => {
                        misturar(&mut h, &[2]);
                        misturar(&mut h, &v.to_le_bytes());
                    }
                    ValueRef::Text(t) => {
                        misturar(&mut h, &[3]);
                        misturar(&mut h, t);
                        misturar(&mut h, &[0xff]);
                    }
                    ValueRef::Blob(b) => {
                        misturar(&mut h, &[4]);
                        misturar(&mut h, &(b.len() as u64).to_le_bytes());
                        misturar(&mut h, b);
                    }
                }
            }
        }
    }
    Ok(format!("{h:016x}-{linhas_total}"))
}

#[tauri::command]
pub fn impressao_dados(state: State<AppState>) -> Result<String, String> {
    let conn = state.conn.lock().expect("mutex envenenado");
    calcular_impressao(&conn).map_err(|e| e.to_string())
}

/// Cópia consistente do banco atual (mesmo com o app em uso), para enviar à nuvem.
#[tauri::command]
pub fn gerar_copia_sync(app: AppHandle, state: State<AppState>) -> Result<Vec<u8>, String> {
    {
        let conn = state.conn.lock().expect("mutex envenenado");
        if let Some(cifrado) = crate::cripto::bytes_de_backup(&conn)? {
            return Ok(cifrado);
        }
    }
    let temporario = pasta_dairus(&app, "Backups")?.join(format!(".sync-{}.tmp", uuid::Uuid::new_v4()));
    {
        let conn = state.conn.lock().expect("mutex envenenado");
        conn.backup(rusqlite::MAIN_DB, &temporario, None).map_err(|e| e.to_string())?;
    }
    let bytes = std::fs::read(&temporario).map_err(|e| e.to_string());
    let _ = std::fs::remove_file(&temporario);
    bytes
}

/// Começo da mensagem de `restaurar_backup` quando os dados deste computador mudaram
/// depois da decisão de baixar: o front trata como CONFLITO (nada foi substituído).
pub const DADOS_MUDARAM: &str = "DADOS_MUDARAM";

/// Cópia do banco e a impressão dos MESMOS dados (tiradas sob o mesmo lock da conexão),
/// mais a versão do esquema, para o `estado.json` da nuvem.
#[derive(Serialize)]
pub struct CopiaSync {
    pub copia: Vec<u8>,
    pub impressao: String,
    pub esquema: u32,
}

/// Tira a impressão e a cópia sem soltar a conexão: nenhuma edição entra no meio.
/// `temporario` é o arquivo usado para a cópia sem criptografia (apagado no fim).
pub fn copia_e_impressao(conn: &Connection, temporario: &Path) -> Result<CopiaSync, String> {
    let impressao = calcular_impressao(conn).map_err(|e| e.to_string())?;
    let copia = match crate::cripto::bytes_de_backup(conn)? {
        Some(cifrado) => cifrado,
        None => {
            let feito = conn.backup(rusqlite::MAIN_DB, temporario, None).map_err(|e| e.to_string());
            let bytes = feito.and_then(|_| std::fs::read(temporario).map_err(|e| e.to_string()));
            let _ = std::fs::remove_file(temporario);
            bytes?
        }
    };
    Ok(CopiaSync { copia, impressao, esquema: crate::db::versao_esquema_app() })
}

/// Para enviar à nuvem: cópia + impressão consistentes entre si.
#[tauri::command]
pub fn copia_e_impressao_sync(app: AppHandle, state: State<AppState>) -> Result<CopiaSync, String> {
    let temporario = pasta_dairus(&app, "Backups")?.join(format!(".sync-{}.tmp", uuid::Uuid::new_v4()));
    let conn = state.conn.lock().expect("mutex envenenado");
    copia_e_impressao(&conn, &temporario)
}

/// Versão do esquema que este app entende (a nuvem com versão maior pede atualizar o app).
#[tauri::command]
pub fn versao_esquema_app() -> u32 {
    crate::db::versao_esquema_app()
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::db::{abrir_conexao, executar_migracoes};

    #[test]
    fn impressao_e_estavel_e_muda_quando_os_dados_mudam() {
        let conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        executar_migracoes(&conn).unwrap();
        let a = calcular_impressao(&conn).unwrap();
        assert_eq!(a, calcular_impressao(&conn).unwrap());

        conn.execute("UPDATE contas_contabeis SET nome = 'Carteira' WHERE id = 'ativo-dinheiro'", []).unwrap();
        let b = calcular_impressao(&conn).unwrap();
        assert_ne!(a, b);

        // A auditoria (só registra que algo aconteceu) não conta como mudança de dados.
        conn.execute("INSERT INTO auditoria (id, acao, entidade, entidade_id) VALUES ('x', 'Y', 'z', 'w')", []).unwrap();
        assert_eq!(b, calcular_impressao(&conn).unwrap());
    }

    #[test]
    fn copia_e_impressao_sao_dos_mesmos_dados() {
        let conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        executar_migracoes(&conn).unwrap();
        conn.execute("UPDATE contas_contabeis SET nome = 'Carteira' WHERE id = 'ativo-dinheiro'", []).unwrap();
        let pasta = std::env::temp_dir().join(format!("dairus-sync-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&pasta).unwrap();
        let temporario = pasta.join(".sync.tmp");

        let r = copia_e_impressao(&conn, &temporario).unwrap();
        assert_eq!(r.impressao, calcular_impressao(&conn).unwrap());
        assert_eq!(r.esquema, crate::db::versao_esquema_app());
        assert!(!temporario.exists(), "o arquivo temporário é apagado");
        // (Se outro teste ligou a criptografia ao mesmo tempo, a cópia sai cifrada e não dá para abrir aqui.)
        if !crate::cripto::eh_cifrado(&r.copia) {
            let arquivo = pasta.join("copia.db");
            std::fs::write(&arquivo, &r.copia).unwrap();
            let copia = Connection::open(&arquivo).unwrap();
            assert_eq!(calcular_impressao(&copia).unwrap(), r.impressao, "a impressão descreve exatamente a cópia");
        }
        std::fs::remove_dir_all(pasta).ok();
    }
}
