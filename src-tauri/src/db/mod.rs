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
    ("0010_investimentos", include_str!("migrations/0010_investimentos.sql")),
    ("0011_lancamentos_ampliados", include_str!("migrations/0011_lancamentos_ampliados.sql")),
    ("0012_cartoes", include_str!("migrations/0012_cartoes.sql")),
    ("0013_planejamento", include_str!("migrations/0013_planejamento.sql")),
    ("0014_documentos", include_str!("migrations/0014_documentos.sql")),
    ("0015_dashboards", include_str!("migrations/0015_dashboards.sql")),
    ("0016_preferencias_conta", include_str!("migrations/0016_preferencias_conta.sql")),
];

/// Número de uma migração pelo prefixo do nome ("0016_preferencias_conta" → 16).
fn numero_da_migracao(nome: &str) -> Option<u32> {
    nome.split('_').next()?.parse().ok()
}

/// Versão do esquema que este app conhece: o número da última migração da lista.
/// Vai no `estado.json` da nuvem para outro computador saber se precisa atualizar o app.
pub fn versao_esquema_app() -> u32 {
    MIGRATIONS.iter().filter_map(|(nome, _)| numero_da_migracao(nome)).max().unwrap_or(0)
}

/// Migrações registradas no banco que este app não conhece: o banco foi criado ou
/// atualizado por uma versão mais nova do Dairus. Banco sem `schema_migrations` → nenhuma.
pub fn migracoes_desconhecidas(conn: &Connection) -> rusqlite::Result<Vec<String>> {
    let tem_tabela: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations')",
        [],
        |r| r.get(0),
    )?;
    if !tem_tabela {
        return Ok(Vec::new());
    }
    let mut st = conn.prepare("SELECT nome FROM schema_migrations ORDER BY nome")?;
    let nomes = st.query_map([], |r| r.get::<_, String>(0))?.collect::<rusqlite::Result<Vec<String>>>()?;
    Ok(nomes.into_iter().filter(|n| !MIGRATIONS.iter().any(|(conhecida, _)| conhecida == n)).collect())
}

/// Recusa um banco de versão mais nova (com migrações que este app não conhece): usá-lo
/// aqui poderia estragar dados que só a versão nova entende.
pub fn recusar_banco_mais_novo(conn: &Connection) -> Result<(), String> {
    let desconhecidas = migracoes_desconhecidas(conn).map_err(|e| e.to_string())?;
    if desconhecidas.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Estes dados foram gravados por uma versão mais nova do Dairus ({}). Atualize o Dairus neste computador para usá-los.",
            desconhecidas.join(", ")
        ))
    }
}

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

#[cfg(test)]
mod testes_versao {
    use super::*;

    fn banco() -> Connection {
        let conn = abrir_conexao(Path::new(":memory:")).unwrap();
        executar_migracoes(&conn).unwrap();
        conn
    }

    #[test]
    fn versao_do_esquema_e_a_da_ultima_migracao() {
        let ultima = MIGRATIONS.last().unwrap().0;
        assert_eq!(versao_esquema_app(), ultima[..4].parse::<u32>().unwrap());
        assert!(versao_esquema_app() >= 16);
    }

    #[test]
    fn banco_deste_app_nao_tem_migracao_desconhecida() {
        let conn = banco();
        assert!(migracoes_desconhecidas(&conn).unwrap().is_empty());
        assert!(recusar_banco_mais_novo(&conn).is_ok());
        // Banco sem a tabela de controle (vazio ou muito antigo) também passa.
        let vazio = Connection::open_in_memory().unwrap();
        assert!(migracoes_desconhecidas(&vazio).unwrap().is_empty());
    }

    #[test]
    fn banco_de_versao_mais_nova_e_recusado() {
        let conn = banco();
        conn.execute("INSERT INTO schema_migrations (nome) VALUES ('9999_do_futuro')", []).unwrap();
        assert_eq!(migracoes_desconhecidas(&conn).unwrap(), vec!["9999_do_futuro".to_string()]);
        let erro = recusar_banco_mais_novo(&conn).unwrap_err();
        assert!(erro.contains("Atualize o Dairus"), "{erro}");
    }
}

#[cfg(test)]
mod testes_sql {
    /// Proteção contra SQL injection: todo SQL usa parâmetros (`?1`). Só nomes de
    /// tabela fixos do próprio código podem entrar por `format!` — esta lista.
    /// Se este teste falhar, troque a concatenação por parâmetros.
    const PERMITIDOS: &[&str] = &[
        "SELECT COUNT(*) FROM {tabela}",
        "SELECT COUNT(*) FROM {t}",
        "SELECT * FROM \\\"{}\\\" ORDER BY rowid",
        "BEGIN;\\n{sql}\\nINSERT INTO schema_migrations",
        "SELECT {COLUNAS} FROM documentos d",
    ];

    fn arquivos(pasta: &std::path::Path, saida: &mut Vec<std::path::PathBuf>) {
        for item in std::fs::read_dir(pasta).unwrap().flatten() {
            let p = item.path();
            if p.is_dir() {
                arquivos(&p, saida);
            } else if p.extension().is_some_and(|e| e == "rs") {
                saida.push(p);
            }
        }
    }

    #[test]
    fn nenhum_sql_montado_com_texto_de_fora() {
        let palavras = ["SELECT ", "INSERT ", "UPDATE ", "DELETE ", " WHERE ", "PRAGMA "];
        let mut lista = Vec::new();
        arquivos(&std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src"), &mut lista);
        let mut suspeitos = Vec::new();
        for arq in lista {
            let texto = std::fs::read_to_string(&arq).unwrap();
            for (n, linha) in texto.lines().enumerate() {
                let Some(i) = linha.find("format!(") else { continue };
                let resto = &linha[i..];
                let tem_sql = palavras.iter().any(|p| resto.to_uppercase().contains(p)) && resto.contains('{');
                if tem_sql && !PERMITIDOS.iter().any(|ok| resto.contains(ok)) && !resto.contains("PERMITIDOS") {
                    suspeitos.push(format!("{}:{}: {}", arq.display(), n + 1, linha.trim()));
                }
            }
        }
        assert!(suspeitos.is_empty(), "SQL montado com format! (use parâmetros):\n{}", suspeitos.join("\n"));
    }
}
