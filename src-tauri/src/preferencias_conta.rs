//! Preferências da conta guardadas no banco (tabela `preferencias_conta`), para irem no
//! backup e na sincronização junto com os lançamentos. O front decide quais chaves
//! entram (as do computador e os segredos ficam de fora) e manda o conjunto inteiro;
//! aqui só grava o que mudou, para a "impressão" do banco não mudar à toa.

use std::collections::HashMap;

use rusqlite::{params, Connection};
use tauri::State;

use crate::commands::AppState;

type Res<T> = Result<T, String>;

const MAX_VALOR: usize = 256 * 1024;
const MAX_CHAVES: usize = 500;

fn chave_valida(c: &str) -> bool {
    (1..=64).contains(&c.len()) && c.chars().all(|x| x.is_ascii_lowercase() || x.is_ascii_digit() || x == '_')
}

pub fn ler_db(conn: &Connection) -> Res<HashMap<String, String>> {
    let mut st = conn.prepare("SELECT chave, valor FROM preferencias_conta").map_err(|e| e.to_string())?;
    let linhas = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).map_err(|e| e.to_string())?;
    linhas.collect::<rusqlite::Result<HashMap<_, _>>>().map_err(|e| e.to_string())
}

/// Deixa a tabela igual ao conjunto recebido: grava o que mudou, apaga o que saiu.
/// Valores grandes demais ou chaves inválidas são ignorados. Devolve quantas linhas mudaram.
pub fn gravar_db(conn: &mut Connection, itens: HashMap<String, String>) -> Res<usize> {
    if itens.len() > MAX_CHAVES {
        return Err("Preferências demais para guardar.".into());
    }
    let itens: HashMap<String, String> = itens
        .into_iter()
        .filter(|(c, v)| chave_valida(c) && v.len() <= MAX_VALOR && serde_json::from_str::<serde_json::Value>(v).is_ok())
        .collect();
    let atuais = ler_db(conn)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut mudou = 0;
    for (chave, valor) in &itens {
        if atuais.get(chave) != Some(valor) {
            tx.execute(
                "INSERT INTO preferencias_conta (chave, valor) VALUES (?1, ?2)
                 ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
                params![chave, valor],
            )
            .map_err(|e| e.to_string())?;
            mudou += 1;
        }
    }
    for chave in atuais.keys().filter(|c| !itens.contains_key(*c)) {
        tx.execute("DELETE FROM preferencias_conta WHERE chave = ?1", [chave]).map_err(|e| e.to_string())?;
        mudou += 1;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(mudou)
}

#[tauri::command]
pub fn ler_preferencias_conta(state: State<AppState>) -> Res<HashMap<String, String>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    ler_db(&conn)
}

#[tauri::command]
pub fn gravar_preferencias_conta(state: State<AppState>, itens: HashMap<String, String>) -> Res<usize> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    gravar_db(&mut conn, itens)
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::db::{abrir_conexao, executar_migracoes};
    use crate::sincronizacao::calcular_impressao;

    fn banco() -> Connection {
        let conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        executar_migracoes(&conn).unwrap();
        conn
    }

    fn mapa(pares: &[(&str, &str)]) -> HashMap<String, String> {
        pares.iter().map(|(c, v)| (c.to_string(), v.to_string())).collect()
    }

    #[test]
    fn grava_so_o_que_mudou_e_apaga_o_que_saiu() {
        let mut c = banco();
        assert_eq!(gravar_db(&mut c, mapa(&[("nome_usuario", "\"Daniel\""), ("perfil_renda", "{\"liquido\":500000}")])).unwrap(), 2);
        // Mesmo conjunto: nada muda (a impressão do banco também não).
        let antes = calcular_impressao(&c).unwrap();
        assert_eq!(gravar_db(&mut c, mapa(&[("nome_usuario", "\"Daniel\""), ("perfil_renda", "{\"liquido\":500000}")])).unwrap(), 0);
        assert_eq!(antes, calcular_impressao(&c).unwrap());
        // Mudou um valor e saiu outra chave.
        assert_eq!(gravar_db(&mut c, mapa(&[("nome_usuario", "\"Dani\"")])).unwrap(), 2);
        assert_eq!(ler_db(&c).unwrap(), mapa(&[("nome_usuario", "\"Dani\"")]));
        assert_ne!(antes, calcular_impressao(&c).unwrap());
    }

    #[test]
    fn ignora_chave_invalida_valor_que_nao_e_json_e_valor_enorme() {
        let mut c = banco();
        let grande = format!("\"{}\"", "x".repeat(MAX_VALOR + 1));
        let n = gravar_db(&mut c, mapa(&[("ok", "1"), ("Chave Ruim", "1"), ("sem_json", "isso não é json"), ("grande", &grande)])).unwrap();
        assert_eq!(n, 1);
        assert_eq!(ler_db(&c).unwrap().keys().collect::<Vec<_>>(), vec!["ok"]);
    }
}
