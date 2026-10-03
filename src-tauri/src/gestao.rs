//! Gestão de contas: excluir de vez (com ou sem o histórico) e juntar duas contas
//! (ex.: a mesma conta cadastrada duas vezes, ou duas categorias parecidas).
//! Vale para contas bancárias, cartões e categorias criadas pelo usuário; as contas
//! do sistema nunca são apagadas.

use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

use crate::commands::AppState;

type Res<T> = Result<T, String>;

fn e<T: std::fmt::Display>(erro: T) -> String {
    erro.to_string()
}

#[derive(Debug, Serialize, PartialEq)]
pub struct UsoDaConta {
    /// Lançamentos que mexem na conta (fora o saldo inicial).
    pub lancamentos: i64,
    /// Lançamentos de saldo inicial (somem junto com a conta sem perguntar).
    pub saldo_inicial: i64,
    pub agendamentos: i64,
    pub subcategorias: i64,
    pub sistema: bool,
}

struct InfoConta {
    tipo: String,
    sistema: bool,
}

fn info(conn: &Connection, id: &str) -> Res<InfoConta> {
    conn.query_row("SELECT tipo, sistema FROM contas_contabeis WHERE id = ?1", [id], |r| Ok(InfoConta { tipo: r.get(0)?, sistema: r.get::<_, i64>(1)? != 0 }))
        .optional()
        .map_err(e)?
        .ok_or_else(|| "Conta não encontrada.".to_string())
}

pub fn uso_da_conta_db(conn: &Connection, id: &str) -> Res<UsoDaConta> {
    let i = info(conn, id)?;
    let contar = |sql: &str| conn.query_row(sql, [id], |r| r.get::<_, i64>(0)).map_err(e);
    Ok(UsoDaConta {
        lancamentos: contar("SELECT COUNT(DISTINCT l.id) FROM lancamentos l JOIN partidas p ON p.lancamento_id = l.id WHERE p.conta_id = ?1 AND l.origem <> 'SALDO_INICIAL'")?,
        saldo_inicial: contar("SELECT COUNT(DISTINCT l.id) FROM lancamentos l JOIN partidas p ON p.lancamento_id = l.id WHERE p.conta_id = ?1 AND l.origem = 'SALDO_INICIAL'")?,
        agendamentos: contar("SELECT COUNT(*) FROM agendamentos WHERE (conta_id = ?1 OR categoria_despesa_id = ?1) AND pago_em IS NULL")?,
        subcategorias: contar("SELECT COUNT(*) FROM contas_contabeis WHERE categoria_pai_id = ?1")?,
        sistema: i.sistema,
    })
}

/// Apaga lançamentos inteiros (com estornos e correções ligados a eles) e solta as referências.
pub(crate) fn apagar_lancamentos(conn: &Connection, iniciais: Vec<String>) -> Res<usize> {
    let mut todos: HashSet<String> = iniciais.into_iter().collect();
    // Estornos/correções apontam para o original com RESTRICT: entram juntos.
    loop {
        let mut novos = Vec::new();
        let mut stmt = conn.prepare("SELECT id, estornado_de, corrige FROM lancamentos WHERE estornado_de IS NOT NULL OR corrige IS NOT NULL").map_err(e)?;
        let linhas = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, Option<String>>(2)?)))
            .map_err(e)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(e)?;
        for (id, est, cor) in linhas {
            let liga = est.as_ref().is_some_and(|x| todos.contains(x)) || cor.as_ref().is_some_and(|x| todos.contains(x));
            if liga && !todos.contains(&id) {
                novos.push(id);
            }
        }
        if novos.is_empty() {
            break;
        }
        todos.extend(novos);
    }
    for id in &todos {
        conn.execute("UPDATE agendamentos SET lancamento_id = NULL WHERE lancamento_id = ?1", [id]).map_err(e)?;
        conn.execute("UPDATE operacoes_invest SET lancamento_id = NULL WHERE lancamento_id = ?1", [id]).map_err(e)?;
        conn.execute("DELETE FROM emprestimo_parcelas WHERE lancamento_id = ?1", [id]).map_err(e)?;
    }
    // Apaga primeiro quem aponta para os outros (estornos/correções), depois os originais.
    let mut restantes: Vec<String> = todos.iter().cloned().collect();
    let mut voltas = 0;
    while !restantes.is_empty() && voltas < 50 {
        voltas += 1;
        restantes.retain(|id| {
            let referenciado: bool = conn
                .query_row("SELECT EXISTS(SELECT 1 FROM lancamentos WHERE estornado_de = ?1 OR corrige = ?1)", [id], |r| r.get(0))
                .unwrap_or(true);
            if referenciado {
                return true;
            }
            conn.execute("DELETE FROM lancamentos WHERE id = ?1", [id]).is_err()
        });
    }
    if !restantes.is_empty() {
        return Err("Não foi possível apagar alguns lançamentos ligados a esta conta.".into());
    }
    Ok(todos.len())
}

/// Exclui a conta. Sem `apagar_historico`, só deixa se ela não tiver movimentação
/// (o saldo inicial vai junto). Devolve quantos lançamentos foram apagados.
pub fn excluir_conta_db(conn: &mut Connection, id: &str, apagar_historico: bool) -> Res<usize> {
    let uso = uso_da_conta_db(conn, id)?;
    if uso.sistema {
        return Err("Esta conta é do sistema e não pode ser excluída.".into());
    }
    if uso.subcategorias > 0 {
        return Err("Esta categoria tem subcategorias. Exclua ou mova as subcategorias primeiro.".into());
    }
    if uso.lancamentos > 0 && !apagar_historico {
        return Err(format!(
            "A conta tem {} lançamento(s). Para não perder histórico, arquive ou junte com outra conta; ou confirme excluir junto com o histórico.",
            uso.lancamentos
        ));
    }
    let tx = conn.transaction().map_err(e)?;
    let ids: Vec<String> = {
        let mut stmt = tx.prepare("SELECT DISTINCT lancamento_id FROM partidas WHERE conta_id = ?1").map_err(e)?;
        let v = stmt.query_map([id], |r| r.get(0)).map_err(e)?.collect::<rusqlite::Result<Vec<String>>>().map_err(e)?;
        v
    };
    let apagados = apagar_lancamentos(&tx, ids)?;
    // Agendamentos que dependem da conta: os em aberto somem; os pagos perdem o vínculo.
    let em_uso_categoria: i64 = tx.query_row("SELECT COUNT(*) FROM agendamentos WHERE categoria_despesa_id = ?1", [id], |r| r.get(0)).map_err(e)?;
    if em_uso_categoria > 0 {
        tx.execute("DELETE FROM agendamentos WHERE categoria_despesa_id = ?1", [id]).map_err(e)?;
    }
    tx.execute("UPDATE agendamentos SET conta_id = NULL WHERE conta_id = ?1", [id]).map_err(e)?;
    tx.execute("UPDATE operacoes_invest SET conta_id = NULL WHERE conta_id = ?1", [id]).map_err(e)?;
    tx.execute("DELETE FROM emprestimos WHERE conta_passivo_id = ?1", [id]).map_err(e)?;
    tx.execute("DELETE FROM contas_contabeis WHERE id = ?1 AND sistema = 0", [id]).map_err(e)?;
    tx.execute(
        "INSERT INTO auditoria (id, acao, entidade, entidade_id) VALUES (?1, 'EXCLUIR_CONTA', 'conta', ?2)",
        params![Uuid::new_v4().to_string(), id],
    )
    .map_err(e)?;
    tx.commit().map_err(e)?;
    Ok(apagados)
}

/// Junta `origem` em `destino` (mesmo tipo): todo o histórico, agendamentos, metas,
/// limites e regras passam para o destino, e a origem é apagada.
pub fn mesclar_contas_db(conn: &mut Connection, origem: &str, destino: &str) -> Res<usize> {
    if origem == destino {
        return Err("Escolha duas contas diferentes.".into());
    }
    let (a, b) = (info(conn, origem)?, info(conn, destino)?);
    if a.sistema {
        return Err("A conta de origem é do sistema e não pode ser apagada; junte na direção contrária.".into());
    }
    if a.tipo != b.tipo {
        return Err("Só é possível juntar contas do mesmo tipo (ex.: banco com banco, categoria de despesa com despesa).".into());
    }
    let tx = conn.transaction().map_err(e)?;
    let movidas = tx.execute("UPDATE partidas SET conta_id = ?2 WHERE conta_id = ?1", [origem, destino]).map_err(e)?;
    tx.execute("UPDATE agendamentos SET conta_id = ?2 WHERE conta_id = ?1", [origem, destino]).map_err(e)?;
    tx.execute("UPDATE agendamentos SET categoria_despesa_id = ?2 WHERE categoria_despesa_id = ?1", [origem, destino]).map_err(e)?;
    tx.execute("UPDATE metas SET conta_id = ?2 WHERE conta_id = ?1", [origem, destino]).map_err(e)?;
    tx.execute("UPDATE operacoes_invest SET conta_id = ?2 WHERE conta_id = ?1", [origem, destino]).map_err(e)?;
    tx.execute("UPDATE emprestimos SET conta_passivo_id = ?2 WHERE conta_passivo_id = ?1", [origem, destino]).map_err(e)?;
    tx.execute("UPDATE contas_contabeis SET categoria_pai_id = ?2 WHERE categoria_pai_id = ?1", [origem, destino]).map_err(e)?;
    tx.execute("UPDATE regras_categoria SET categoria_id = ?2 WHERE categoria_id = ?1", [origem, destino]).map_err(e)?;
    tx.execute("UPDATE cartoes_adicionais SET cartao_id = ?2 WHERE cartao_id = ?1", [origem, destino]).map_err(e)?;
    // Limites: o destino mantém o seu; se não tiver, herda o da origem.
    tx.execute("UPDATE OR IGNORE orcamentos SET categoria_id = ?2 WHERE categoria_id = ?1", [origem, destino]).map_err(e)?;
    tx.execute("UPDATE OR IGNORE orcamentos_mes SET categoria_id = ?2 WHERE categoria_id = ?1", [origem, destino]).map_err(e)?;
    // Faturas guardadas da origem não fazem sentido no destino (são recalculadas).
    tx.execute("DELETE FROM faturas WHERE cartao_id = ?1", [origem]).map_err(e)?;
    tx.execute("DELETE FROM contas_contabeis WHERE id = ?1 AND sistema = 0", [origem]).map_err(e)?;
    tx.execute(
        "INSERT INTO auditoria (id, acao, entidade, entidade_id) VALUES (?1, 'MESCLAR_CONTA', 'conta', ?2)",
        params![Uuid::new_v4().to_string(), format!("{origem}->{destino}")],
    )
    .map_err(e)?;
    tx.commit().map_err(e)?;
    Ok(movidas)
}

#[tauri::command]
pub fn uso_da_conta(state: State<AppState>, conta_id: String) -> Res<UsoDaConta> {
    let conn = state.conn.lock().expect("mutex envenenado");
    uso_da_conta_db(&conn, &conta_id)
}

#[tauri::command]
pub fn excluir_conta(state: State<AppState>, conta_id: String, apagar_historico: bool) -> Res<usize> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    excluir_conta_db(&mut conn, &conta_id, apagar_historico)
}

#[tauri::command]
pub fn mesclar_contas(state: State<AppState>, origem_id: String, destino_id: String) -> Res<usize> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    mesclar_contas_db(&mut conn, &origem_id, &destino_id)
}

/// Troca a conta (ou categoria) de um lançamento por outra do mesmo tipo,
/// ex.: "Mercado" lançado em Lazer → Alimentação, ou pago no Nubank → no Itaú.
pub fn trocar_conta_lancamento_db(conn: &mut Connection, lancamento_id: &str, conta_atual: &str, conta_nova: &str) -> Res<()> {
    if conta_atual == conta_nova {
        return Ok(());
    }
    let (a, b) = (info(conn, conta_atual)?, info(conn, conta_nova)?);
    if a.tipo != b.tipo {
        return Err("Escolha uma conta do mesmo tipo (categoria por categoria, conta por conta).".into());
    }
    let (origem, estornado): (String, bool) = conn
        .query_row(
            "SELECT origem, EXISTS(SELECT 1 FROM lancamentos x WHERE x.estornado_de = l.id OR x.corrige = l.id) FROM lancamentos l WHERE id = ?1",
            [lancamento_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(e)?
        .ok_or("Lançamento não encontrado.")?;
    if origem == "ESTORNO" || estornado {
        return Err("Este lançamento foi estornado ou corrigido; troque no lançamento que vale.".into());
    }
    let tx = conn.transaction().map_err(e)?;
    let n = tx
        .execute("UPDATE partidas SET conta_id = ?3 WHERE lancamento_id = ?1 AND conta_id = ?2", params![lancamento_id, conta_atual, conta_nova])
        .map_err(e)?;
    if n == 0 {
        return Err("Essa conta não faz parte do lançamento.".into());
    }
    tx.execute(
        "INSERT INTO auditoria (id, acao, entidade, entidade_id) VALUES (?1, 'TROCAR_CONTA', 'lancamento', ?2)",
        params![Uuid::new_v4().to_string(), lancamento_id],
    )
    .map_err(e)?;
    tx.commit().map_err(e)?;
    Ok(())
}

/// Apaga lançamentos de vez (com os estornos e correções ligados). Devolve quantos saíram.
pub fn excluir_lancamentos_db(conn: &mut Connection, ids: &[String]) -> Res<usize> {
    if ids.is_empty() {
        return Ok(0);
    }
    let tx = conn.transaction().map_err(e)?;
    let n = apagar_lancamentos(&tx, ids.to_vec())?;
    for id in ids {
        tx.execute(
            "INSERT INTO auditoria (id, acao, entidade, entidade_id) VALUES (?1, 'EXCLUIR_LANCAMENTO', 'lancamento', ?2)",
            params![Uuid::new_v4().to_string(), id],
        )
        .map_err(e)?;
    }
    tx.commit().map_err(e)?;
    Ok(n)
}

#[tauri::command]
pub fn trocar_conta_lancamento(state: State<AppState>, lancamento_id: String, conta_atual: String, conta_nova: String) -> Res<()> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    trocar_conta_lancamento_db(&mut conn, &lancamento_id, &conta_atual, &conta_nova)
}

#[tauri::command]
pub fn excluir_lancamentos(state: State<AppState>, ids: Vec<String>) -> Res<usize> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    excluir_lancamentos_db(&mut conn, &ids)
}

/// Coloca a categoria dentro de outra (subcategoria) ou volta para principal (`pai` = None).
pub fn definir_categoria_pai_db(conn: &Connection, id: &str, pai: Option<&str>) -> Res<()> {
    let c = info(conn, id)?;
    if c.tipo != "DESPESA" && c.tipo != "RECEITA" {
        return Err("Só categorias podem virar subcategoria.".into());
    }
    if let Some(p) = pai {
        if p == id {
            return Err("Uma categoria não pode ficar dentro dela mesma.".into());
        }
        if info(conn, p)?.tipo != c.tipo {
            return Err("A categoria principal precisa ser do mesmo tipo.".into());
        }
        // Evita ciclo: o novo pai não pode estar dentro desta categoria.
        let mut atual = Some(p.to_string());
        let mut passos = 0;
        while let Some(x) = atual {
            if x == id {
                return Err("Isso criaria um ciclo (a principal está dentro desta).".into());
            }
            passos += 1;
            if passos > 20 {
                break;
            }
            atual = conn.query_row("SELECT categoria_pai_id FROM contas_contabeis WHERE id = ?1", [&x], |r| r.get(0)).optional().map_err(e)?.flatten();
        }
    }
    conn.execute("UPDATE contas_contabeis SET categoria_pai_id = ?2 WHERE id = ?1", params![id, pai]).map_err(e)?;
    Ok(())
}

/// Renomeia uma categoria (inclusive as que vêm com o app: o nome é só rótulo).
pub fn renomear_categoria_db(conn: &Connection, id: &str, nome: &str) -> Res<()> {
    let nome = nome.trim();
    if nome.is_empty() || nome.chars().count() > 60 {
        return Err("Nome inválido (1 a 60 letras).".into());
    }
    let c = info(conn, id)?;
    if c.tipo != "DESPESA" && c.tipo != "RECEITA" {
        return Err("Use a tela da conta para renomear contas.".into());
    }
    conn.execute("UPDATE contas_contabeis SET nome = ?2 WHERE id = ?1", params![id, nome]).map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn definir_categoria_pai(state: State<AppState>, conta_id: String, pai_id: Option<String>) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    definir_categoria_pai_db(&conn, &conta_id, pai_id.as_deref())
}

#[tauri::command]
pub fn renomear_categoria(state: State<AppState>, conta_id: String, nome: String) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    renomear_categoria_db(&conn, &conta_id, &nome)
}

/// Desdobramento (fator 2 = cada ação vira 2) ou grupamento (fator 0,5): ajusta quantidade e
/// preço das compras/vendas até a data, mantendo o valor investido e o preço médio coerente.
pub fn desdobrar_ativo_db(conn: &mut Connection, ativo_id: &str, fator: f64, data: &str) -> Res<usize> {
    if !(fator.is_finite() && fator > 0.0) || (fator - 1.0).abs() < 1e-9 {
        return Err("Fator inválido (ex.: 2 para desdobramento 1:2, 0,1 para grupamento 10:1).".into());
    }
    let tx = conn.transaction().map_err(e)?;
    let n = tx
        .execute(
            "UPDATE operacoes_invest SET quantidade = quantidade * ?2, preco_unitario = preco_unitario / ?2
             WHERE ativo_id = ?1 AND data <= ?3 AND tipo IN ('COMPRA', 'VENDA')",
            params![ativo_id, fator, data],
        )
        .map_err(e)?;
    tx.execute("UPDATE ativos_invest SET cotacao = cotacao / ?2 WHERE id = ?1 AND cotacao IS NOT NULL AND (cotacao_em IS NULL OR cotacao_em <= ?3)", params![ativo_id, fator, data]).map_err(e)?;
    tx.commit().map_err(e)?;
    Ok(n)
}

/// Exclui o ativo com todas as operações e os lançamentos que elas geraram.
pub fn excluir_ativo_completo_db(conn: &mut Connection, ativo_id: &str) -> Res<usize> {
    let tx = conn.transaction().map_err(e)?;
    let ids: Vec<String> = {
        let mut stmt = tx.prepare("SELECT lancamento_id FROM operacoes_invest WHERE ativo_id = ?1 AND lancamento_id IS NOT NULL").map_err(e)?;
        let v = stmt.query_map([ativo_id], |r| r.get(0)).map_err(e)?.collect::<rusqlite::Result<Vec<String>>>().map_err(e)?;
        v
    };
    let n = tx.execute("DELETE FROM operacoes_invest WHERE ativo_id = ?1", [ativo_id]).map_err(e)?;
    apagar_lancamentos(&tx, ids)?;
    tx.execute("DELETE FROM ativos_invest WHERE id = ?1", [ativo_id]).map_err(e)?;
    tx.commit().map_err(e)?;
    Ok(n)
}

#[tauri::command]
pub fn desdobrar_ativo(state: State<AppState>, ativo_id: String, fator: f64, data: String) -> Res<usize> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    desdobrar_ativo_db(&mut conn, &ativo_id, fator, &data)
}

#[tauri::command]
pub fn excluir_ativo_completo(state: State<AppState>, ativo_id: String) -> Res<usize> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    excluir_ativo_completo_db(&mut conn, &ativo_id)
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::accounting::engine;
    use crate::accounting::models::{NovaContaInput, NovoLancamentoInput, PartidaInput, TipoConta, TipoPartida};
    use crate::db::{abrir_conexao, executar_migracoes};

    fn banco() -> Connection {
        let conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        executar_migracoes(&conn).unwrap();
        conn
    }

    fn conta(conn: &mut Connection, codigo: &str, nome: &str, saldo: i64) -> String {
        engine::criar_conta(
            conn,
            NovaContaInput {
                codigo: codigo.into(), nome: nome.into(), tipo: TipoConta::Ativo, subtipo: Some("BANCO".into()), categoria_pai_id: None,
                instituicao: None, saldo_inicial_centavos: saldo, dia_fechamento_fatura: None, dia_vencimento_fatura: None, limite_centavos: None,
            },
        )
        .unwrap()
        .id
    }

    fn gasto(conn: &mut Connection, conta: &str, v: i64) -> String {
        engine::criar_lancamento(
            conn,
            NovoLancamentoInput {
                data: "2026-09-10".into(), descricao: "Mercado".into(), observacao: None, origem: "MANUAL".into(), etiqueta: None, parcelas: None,
                partidas: vec![
                    PartidaInput { conta_id: "despesa-outras".into(), tipo: TipoPartida::Debito, valor_centavos: v },
                    PartidaInput { conta_id: conta.into(), tipo: TipoPartida::Credito, valor_centavos: v },
                ],
            },
        )
        .unwrap()
        .id
    }

    #[test]
    fn exclui_conta_sem_movimento_com_saldo_inicial() {
        let mut conn = banco();
        let c = conta(&mut conn, "1.1.90", "Banco X", 5_000);
        assert_eq!(uso_da_conta_db(&conn, &c).unwrap().saldo_inicial, 1);
        assert_eq!(excluir_conta_db(&mut conn, &c, false).unwrap(), 1);
        assert!(info(&conn, &c).is_err());
        assert_eq!(engine::saldo_conta(&conn, "patrimonio-saldo-inicial").unwrap(), 0);
    }

    #[test]
    fn pede_confirmacao_com_historico_e_apaga_estornos_juntos() {
        let mut conn = banco();
        let c = conta(&mut conn, "1.1.91", "Banco Y", 10_000);
        let l = gasto(&mut conn, &c, 2_000);
        engine::estornar_lancamento(&mut conn, &l).unwrap();
        assert!(excluir_conta_db(&mut conn, &c, false).unwrap_err().contains("2 lançamento"));
        assert_eq!(excluir_conta_db(&mut conn, &c, true).unwrap(), 3);
        let restantes: i64 = conn.query_row("SELECT COUNT(*) FROM lancamentos", [], |r| r.get(0)).unwrap();
        assert_eq!(restantes, 0);
        assert!(excluir_conta_db(&mut conn, "ativo-dinheiro", true).unwrap_err().contains("sistema"));
    }

    #[test]
    fn junta_duas_contas_somando_os_saldos() {
        let mut conn = banco();
        let a = conta(&mut conn, "1.1.92", "Nubank", 10_000);
        let b = conta(&mut conn, "1.1.93", "Nubank (2)", 3_000);
        gasto(&mut conn, &b, 1_000);
        assert_eq!(mesclar_contas_db(&mut conn, &b, &a).unwrap(), 2);
        assert_eq!(engine::saldo_conta(&conn, &a).unwrap(), 12_000);
        assert!(info(&conn, &b).is_err());
        assert!(mesclar_contas_db(&mut conn, &a, "despesa-outras").unwrap_err().contains("mesmo tipo"));
    }

    #[test]
    fn troca_categoria_e_exclui_lancamento() {
        let mut conn = banco();
        let c = conta(&mut conn, "1.1.94", "Banco Z", 10_000);
        let l = gasto(&mut conn, &c, 2_000);
        trocar_conta_lancamento_db(&mut conn, &l, "despesa-outras", "despesa-alimentacao").unwrap();
        assert_eq!(engine::saldo_conta(&conn, "despesa-alimentacao").unwrap(), 2_000);
        assert_eq!(engine::saldo_conta(&conn, "despesa-outras").unwrap(), 0);
        assert!(trocar_conta_lancamento_db(&mut conn, &l, "despesa-alimentacao", &c).unwrap_err().contains("mesmo tipo"));
        engine::estornar_lancamento(&mut conn, &l).unwrap();
        assert!(trocar_conta_lancamento_db(&mut conn, &l, "despesa-alimentacao", "despesa-lazer").unwrap_err().contains("estornado"));
        assert_eq!(excluir_lancamentos_db(&mut conn, &[l]).unwrap(), 2);
        assert_eq!(engine::saldo_conta(&conn, &c).unwrap(), 10_000);
    }

    #[test]
    fn move_e_renomeia_categoria_sem_ciclo() {
        let conn = banco();
        definir_categoria_pai_db(&conn, "despesa-lazer", Some("despesa-outras")).unwrap();
        assert!(definir_categoria_pai_db(&conn, "despesa-outras", Some("despesa-lazer")).unwrap_err().contains("ciclo"));
        assert!(definir_categoria_pai_db(&conn, "despesa-lazer", Some("receita-salario")).unwrap_err().contains("mesmo tipo"));
        definir_categoria_pai_db(&conn, "despesa-lazer", None).unwrap();
        renomear_categoria_db(&conn, "despesa-alimentacao", "Comida").unwrap();
        let nome: String = conn.query_row("SELECT nome FROM contas_contabeis WHERE id = 'despesa-alimentacao'", [], |r| r.get(0)).unwrap();
        assert_eq!(nome, "Comida");
        assert!(renomear_categoria_db(&conn, "ativo-dinheiro", "X").is_err());
    }

    #[test]
    fn desdobra_e_exclui_ativo() {
        use crate::investimentos::{listar_ativos, registrar_operacao, salvar_ativo, AtivoInput, OperacaoInput};
        let mut conn = banco();
        let id = salvar_ativo(&conn, serde_json::from_value::<AtivoInput>(serde_json::json!({"codigo": "ABCD3", "classe": "ACAO"})).unwrap()).unwrap();
        registrar_operacao(&mut conn, serde_json::from_value::<OperacaoInput>(serde_json::json!({"ativo_id": id, "tipo": "COMPRA", "data": "2026-01-10", "quantidade": 10.0, "preco_unitario": 20.0})).unwrap()).unwrap();
        assert_eq!(desdobrar_ativo_db(&mut conn, &id, 2.0, "2026-02-01").unwrap(), 1);
        let a = listar_ativos(&conn).unwrap().into_iter().find(|x| x.id == id).unwrap();
        assert!((a.quantidade - 20.0).abs() < 1e-9);
        assert!((a.preco_medio - 10.0).abs() < 1e-6);
        assert!(desdobrar_ativo_db(&mut conn, &id, 1.0, "2026-02-01").is_err());
        assert_eq!(excluir_ativo_completo_db(&mut conn, &id).unwrap(), 1);
        assert!(listar_ativos(&conn).unwrap().iter().all(|x| x.id != id));
    }
}
