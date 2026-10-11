//! Apoio à sincronização entre computadores: uma "impressão digital" dos
//! dados (para saber se algo mudou desde a última sincronização) e uma cópia
//! consistente do banco para enviar à nuvem.

use std::collections::HashMap;
use std::path::Path;

use rusqlite::types::ValueRef;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
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
    calcular_impressao_ignorando(conn, &[])
}

/// Impressão sem a tabela das preferências da conta: usada para saber se, depois de
/// atualizar o app, só as preferências mudaram (são copiadas do arquivo sozinhas).
pub fn impressao_sem_preferencias(conn: &Connection) -> rusqlite::Result<String> {
    calcular_impressao_ignorando(conn, &["preferencias_conta"])
}

fn calcular_impressao_ignorando(conn: &Connection, ignorar: &[&str]) -> rusqlite::Result<String> {
    let mut tabelas: Vec<String> = conn
        .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table'
             AND name NOT LIKE 'sqlite_%' AND name NOT IN ('schema_migrations', 'auditoria')",
        )?
        .query_map([], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    tabelas.retain(|t| !ignorar.contains(&t.as_str()));
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

/// Atualizar o app muda a impressão sem a pessoa mexer em nada: as migrações criam tabelas
/// e colunas, e depois as preferências do arquivo são copiadas para o banco. Sem cuidado,
/// dois computadores que atualizam veriam "mudou aqui" e "mudou na nuvem" e acusariam um
/// CONFLITO falso. Por isso, ao abrir a conta com migrações pendentes, guarda-se a impressão
/// de ANTES delas (a mesma que a última sincronização gravou, se nada mais mudou) e a de
/// DEPOIS sem a tabela de preferências.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct MarcaAtualizacao {
    pub antes: String,
    pub depois_sem_preferencias: String,
    /// Resumo das preferências da conta (as que vão no banco) como estavam na primeira abertura
    /// depois da atualização, antes de qualquer edição. Sem ele, ou se a tabela já não bate com
    /// ele, a pessoa mexeu nas preferências e isso conta como mudança.
    #[serde(default)]
    pub preferencias: Option<String>,
}

/// Nome do arquivo da marca, na pasta da conta (só tem impressões, nenhum dado).
pub const ARQUIVO_MARCA: &str = "sync-atualizacao.json";

fn ler_marca(arquivo: &Path) -> Option<MarcaAtualizacao> {
    serde_json::from_slice(&std::fs::read(arquivo).ok()?).ok()
}

/// Aplica as migrações (como `executar_migracoes`) e, se havia alguma pendente, grava a marca.
/// Se a marca não puder ser gravada, só registra no log: no pior caso a sincronização pergunta.
pub fn migrar_registrando(conn: &Connection, arquivo_marca: &Path) -> rusqlite::Result<()> {
    migrar_registrando_com(conn, arquivo_marca, crate::db::executar_migracoes)
}

fn migrar_registrando_com(conn: &Connection, arquivo_marca: &Path, migrar: impl FnOnce(&Connection) -> rusqlite::Result<()>) -> rusqlite::Result<()> {
    // A marca é só um auxílio da sincronização: se não der para calculá-la, a conta abre do mesmo
    // jeito (no pior caso a sincronização pergunta).
    match crate::db::migracoes_pendentes(conn) {
        Ok(true) => {}
        Ok(false) => return migrar(conn),
        Err(err) => {
            log::warn!("sincronização: não foi possível ver as migrações pendentes: {err}");
            return migrar(conn);
        }
    }
    let previa = calcular_impressao(conn).and_then(|antes| Ok((antes, impressao_sem_preferencias(conn)?)));
    if let Err(err) = &previa {
        log::warn!("sincronização: não foi possível calcular a impressão antes da atualização: {err}");
    }
    migrar(conn)?;
    let Ok((antes, antes_sem_preferencias)) = previa else { return Ok(()) };
    let depois_sem_preferencias = match impressao_sem_preferencias(conn) {
        Ok(i) => i,
        Err(err) => {
            log::warn!("sincronização: não foi possível calcular a impressão depois da atualização: {err}");
            return Ok(());
        }
    };
    // Duas atualizações seguidas sem sincronizar no meio (a marca só é apagada depois de uma
    // sincronização): vale a impressão de antes da primeira, se nada além das preferências mudou.
    let (antes, preferencias) = match ler_marca(arquivo_marca) {
        Some(m) if m.depois_sem_preferencias == antes_sem_preferencias => (m.antes, m.preferencias),
        _ => (antes, None),
    };
    let marca = MarcaAtualizacao { antes, depois_sem_preferencias, preferencias };
    let gravado = serde_json::to_vec(&marca).map_err(|e| e.to_string()).and_then(|b| std::fs::write(arquivo_marca, b).map_err(|e| e.to_string()));
    if let Err(err) = gravado {
        log::warn!("sincronização: não foi possível guardar a marca da atualização: {err}");
    }
    Ok(())
}

/// Na primeira abertura depois da atualização (antes de a pessoa mexer em qualquer coisa), o
/// front manda o conjunto de preferências que vai para o banco. Fica na marca como ponto de
/// partida: depois, uma preferência editada passa a contar como mudança, em vez de ser trocada
/// sem perguntar pela da nuvem. Só grava uma vez por marca. Devolve se gravou.
pub fn registrar_preferencias_da_atualizacao_em(arquivo_marca: &Path, itens: HashMap<String, String>) -> bool {
    let Some(mut marca) = ler_marca(arquivo_marca) else { return false };
    if marca.preferencias.is_some() {
        return false;
    }
    marca.preferencias = Some(crate::preferencias_conta::impressao_do_conjunto(&crate::preferencias_conta::filtrar_itens(itens)));
    serde_json::to_vec(&marca).ok().is_some_and(|b| std::fs::write(arquivo_marca, b).is_ok())
}

#[tauri::command]
pub fn registrar_preferencias_da_atualizacao(app: AppHandle, itens: HashMap<String, String>) -> bool {
    let Some(arquivo) = crate::conta::arquivo_marca_atualizacao(&app) else { return false };
    registrar_preferencias_da_atualizacao_em(&arquivo, itens)
}

/// A única diferença entre os dados de agora e os da última sincronização (`impressao_vista`)
/// veio da atualização do app (e das preferências copiadas para o banco depois dela)? As
/// preferências só são ignoradas se continuam como na primeira abertura depois da atualização.
pub fn so_mudou_por_atualizacao(conn: &Connection, arquivo_marca: &Path, impressao_vista: &str) -> bool {
    let Some(marca) = ler_marca(arquivo_marca) else { return false };
    let preferencias_iguais = match &marca.preferencias {
        Some(esperada) => crate::preferencias_conta::ler_db(conn).is_ok_and(|t| &crate::preferencias_conta::impressao_do_conjunto(&t) == esperada),
        None => false,
    };
    marca.antes == impressao_vista && preferencias_iguais && impressao_sem_preferencias(conn).is_ok_and(|i| i == marca.depois_sem_preferencias)
}

#[tauri::command]
pub fn mudanca_so_da_atualizacao(app: AppHandle, state: State<AppState>, impressao_vista: String) -> bool {
    let Some(arquivo) = crate::conta::arquivo_marca_atualizacao(&app) else { return false };
    let conn = state.conn.lock().expect("mutex envenenado");
    so_mudou_por_atualizacao(&conn, &arquivo, &impressao_vista)
}

/// Depois de uma sincronização concluída, a marca da atualização não vale mais.
#[tauri::command]
pub fn limpar_marca_atualizacao(app: AppHandle) {
    if let Some(arquivo) = crate::conta::arquivo_marca_atualizacao(&app) {
        let _ = std::fs::remove_file(arquivo);
    }
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

    fn pasta_temp() -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!("dairus-marca-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    /// Banco como o da v0.2.5 (até a migração 0015), com uma alteração da pessoa.
    fn banco_da_versao_anterior() -> Connection {
        let conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        crate::db::executar_migracoes_ate(&conn, 15).unwrap();
        conn.execute("UPDATE contas_contabeis SET nome = 'Carteira' WHERE id = 'ativo-dinheiro'", []).unwrap();
        conn
    }

    fn conjunto(nome: &str) -> HashMap<String, String> {
        [("nome_usuario".to_string(), format!("\"{nome}\"")), ("_preferencias_v1".to_string(), "\"1\"".to_string())].into_iter().collect()
    }

    fn preferencias(conn: &mut Connection, nome: &str) {
        crate::preferencias_conta::gravar_db(conn, conjunto(nome)).unwrap();
    }

    /// O que o front faz na primeira abertura depois de atualizar: registra o ponto de partida.
    fn abrir_depois_de_atualizar(marca: &Path, nome: &str) {
        assert!(registrar_preferencias_da_atualizacao_em(marca, conjunto(nome)));
    }

    #[test]
    fn atualizar_o_app_sem_mexer_em_nada_nao_conta_como_mudanca() {
        let pasta = pasta_temp();
        let marca = pasta.join(ARQUIVO_MARCA);
        let mut conn = banco_da_versao_anterior();
        // A impressão que a v0.2.5 gravou na última sincronização.
        let vista = calcular_impressao(&conn).unwrap();

        migrar_registrando(&conn, &marca).unwrap();
        assert!(marca.is_file());
        assert_ne!(calcular_impressao(&conn).unwrap(), vista, "as migrações mudam a impressão");
        abrir_depois_de_atualizar(&marca, "Daniel");
        // A primeira cópia das preferências para o banco também não conta.
        preferencias(&mut conn, "Daniel");
        assert!(so_mudou_por_atualizacao(&conn, &marca, &vista));
        // Abrir de novo (sem migração pendente) não mexe na marca.
        migrar_registrando(&conn, &marca).unwrap();
        assert!(so_mudou_por_atualizacao(&conn, &marca, &vista));

        // Uma edição de verdade depois da atualização conta.
        conn.execute("UPDATE contas_contabeis SET nome = 'Bolso' WHERE id = 'ativo-dinheiro'", []).unwrap();
        assert!(!so_mudou_por_atualizacao(&conn, &marca, &vista));
        std::fs::remove_dir_all(pasta).ok();
    }

    #[test]
    fn preferencia_editada_depois_da_atualizacao_conta_como_mudanca() {
        let pasta = pasta_temp();
        let marca = pasta.join(ARQUIVO_MARCA);
        let mut conn = banco_da_versao_anterior();
        let vista = calcular_impressao(&conn).unwrap();
        migrar_registrando(&conn, &marca).unwrap();
        abrir_depois_de_atualizar(&marca, "Daniel");
        // O ponto de partida só vale uma vez por marca.
        assert!(!registrar_preferencias_da_atualizacao_em(&marca, conjunto("Outro")));
        // Passaram dias; a pessoa mudou o nome; a sincronização copiou o arquivo para o banco.
        preferencias(&mut conn, "Dani");
        assert!(!so_mudou_por_atualizacao(&conn, &marca, &vista), "editar uma preferência é mudança: vira pergunta, não troca silenciosa");
        // Voltando ao valor de antes, volta a ser só a atualização.
        preferencias(&mut conn, "Daniel");
        assert!(so_mudou_por_atualizacao(&conn, &marca, &vista));
        std::fs::remove_dir_all(pasta).ok();
    }

    #[test]
    fn sem_o_ponto_de_partida_das_preferencias_pergunta_na_duvida() {
        let pasta = pasta_temp();
        let marca = pasta.join(ARQUIVO_MARCA);
        let mut conn = banco_da_versao_anterior();
        let vista = calcular_impressao(&conn).unwrap();
        migrar_registrando(&conn, &marca).unwrap();
        preferencias(&mut conn, "Daniel");
        assert!(!so_mudou_por_atualizacao(&conn, &marca, &vista));
        // Sem marca, não há o que registrar.
        assert!(!registrar_preferencias_da_atualizacao_em(&pasta.join("nao-existe.json"), conjunto("Daniel")));
        std::fs::remove_dir_all(pasta).ok();
    }

    #[test]
    fn conta_abre_mesmo_se_a_marca_nao_puder_ser_gravada() {
        let pasta = pasta_temp();
        // A pasta da marca não existe: gravar a marca falha, e a conta abre do mesmo jeito.
        let marca = pasta.join("nao-existe").join(ARQUIVO_MARCA);
        let conn = banco_da_versao_anterior();
        migrar_registrando(&conn, &marca).unwrap();
        assert!(!crate::db::migracoes_pendentes(&conn).unwrap());
        std::fs::remove_dir_all(pasta).ok();
    }

    #[test]
    fn edicao_antes_de_atualizar_continua_contando() {
        let pasta = pasta_temp();
        let marca = pasta.join(ARQUIVO_MARCA);
        let conn = banco_da_versao_anterior();
        let vista = calcular_impressao(&conn).unwrap();
        // Editou na versão antiga depois da última sincronização, e só então atualizou.
        conn.execute("UPDATE contas_contabeis SET nome = 'Bolso' WHERE id = 'ativo-dinheiro'", []).unwrap();
        migrar_registrando(&conn, &marca).unwrap();
        assert!(!so_mudou_por_atualizacao(&conn, &marca, &vista));
        // Sem marca (nunca houve atualização) também não.
        assert!(!so_mudou_por_atualizacao(&conn, &pasta.join("nao-existe.json"), &vista));
        std::fs::remove_dir_all(pasta).ok();
    }

    #[test]
    fn duas_atualizacoes_sem_sincronizar_no_meio_guardam_a_impressao_mais_antiga() {
        let pasta = pasta_temp();
        let marca = pasta.join(ARQUIVO_MARCA);
        let mut conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        crate::db::executar_migracoes_ate(&conn, 15).unwrap();
        let vista = calcular_impressao(&conn).unwrap();
        // Primeira atualização (só até a 0016) e as preferências copiadas.
        migrar_registrando_com(&conn, &marca, |c| crate::db::executar_migracoes_ate(c, 16)).unwrap();
        assert!(crate::db::migracoes_pendentes(&conn).unwrap());
        abrir_depois_de_atualizar(&marca, "Daniel");
        preferencias(&mut conn, "Daniel");
        // Segunda atualização (o resto): o ponto de partida das preferências continua valendo.
        migrar_registrando(&conn, &marca).unwrap();
        assert!(so_mudou_por_atualizacao(&conn, &marca, &vista));
        std::fs::remove_dir_all(pasta).ok();
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
