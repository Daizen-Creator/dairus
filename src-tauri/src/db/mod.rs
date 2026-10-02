use rusqlite::Connection;
use std::path::Path;

/// Esquema do banco local. Cada entrada é aplicada uma única vez,
/// controlada pela tabela `schema_migrations`. Nunca editar uma
/// migração já publicada — apenas adicionar uma nova ao final.
const MIGRATIONS: &[(&str, &str)] = &[
    ("0001_plano_de_contas", include_str!("migrations/0001_plano_de_contas.sql")),
    ("0002_lancamentos", include_str!("migrations/0002_lancamentos.sql")),
    ("0003_seed_plano_de_contas_padrao", include_str!("migrations/0003_seed_plano_de_contas_padrao.sql")),
    ("0004_agendamentos_etiquetas", include_str!("migrations/0004_agendamentos_etiquetas.sql")),
    ("0005_modulos_financeiros", include_str!("migrations/0005_modulos_financeiros.sql")),
    ("0006_recorrencia_agendamentos", include_str!("migrations/0006_recorrencia_agendamentos.sql")),
    ("0007_metas_detalhes", include_str!("migrations/0007_metas_detalhes.sql")),
    ("0008_bens_detalhes", include_str!("migrations/0008_bens_detalhes.sql")),
    ("0009_parcelas_e_correcoes", include_str!("migrations/0009_parcelas_e_correcoes.sql")),
];

pub fn abrir_conexao(caminho_banco: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(caminho_banco)?;
    // `journal_mode` é especial: o PRAGMA devolve uma linha com o modo
    // resultante, então `pragma_update` sozinho falharia aqui — precisa do
    // `_and_check`, mesmo descartando o valor retornado.
    conn.pragma_update_and_check(None, "journal_mode", "WAL", |_row| Ok(()))?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(conn)
}

pub fn executar_migracoes(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            nome TEXT PRIMARY KEY,
            aplicado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );",
    )?;

    for (nome, sql) in MIGRATIONS {
        let ja_aplicada: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE nome = ?1)",
                [nome],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if ja_aplicada {
            continue;
        }

        // Cada migração roda numa transação: ou aplica inteira, ou nada.
        conn.execute_batch(&format!("BEGIN;\n{sql}\nINSERT INTO schema_migrations (nome) VALUES ('{nome}');\nCOMMIT;"))?;
    }

    Ok(())
}
