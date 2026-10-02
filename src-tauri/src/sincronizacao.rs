//! Apoio à sincronização entre computadores: uma "impressão digital" dos
//! dados (para saber se algo mudou desde a última sincronização) e uma cópia
//! consistente do banco para enviar à nuvem.

use rusqlite::types::ValueRef;
use rusqlite::Connection;
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
    let temporario = pasta_dairus(&app, "Backups")?.join(format!(".sync-{}.tmp", uuid::Uuid::new_v4()));
    {
        let conn = state.conn.lock().expect("mutex envenenado");
        conn.backup(rusqlite::MAIN_DB, &temporario, None).map_err(|e| e.to_string())?;
    }
    let bytes = std::fs::read(&temporario).map_err(|e| e.to_string());
    let _ = std::fs::remove_file(&temporario);
    bytes
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
}
