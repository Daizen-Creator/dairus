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
    pub tipo: Option<String>,
    pub prioridade: Option<String>,
    pub notas: Option<String>,
}

fn validar_extras_meta(tipo: &Option<String>, prioridade: &Option<String>) -> Res<()> {
    if !matches!(prioridade.as_deref(), None | Some("ALTA") | Some("MEDIA") | Some("BAIXA")) {
        return Err("Prioridade inválida.".into());
    }
    if let Some(t) = tipo {
        if t.len() > 30 || t.chars().any(|c| !(c.is_ascii_alphanumeric() || c == '_')) {
            return Err("Tipo de meta inválido.".into());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn listar_metas(state: State<AppState>) -> Res<Vec<Meta>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.nome, m.valor_alvo_centavos, m.prazo,
                    COALESCE((SELECT SUM(valor_centavos) FROM metas_aportes a WHERE a.meta_id = m.id), 0),
                    m.tipo, m.prioridade, m.notas
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
                tipo: r.get(5)?,
                prioridade: r.get(6)?,
                notas: r.get(7)?,
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
    tipo: Option<String>,
    prioridade: Option<String>,
    notas: Option<String>,
) -> Res<String> {
    let nome = nome_valido(&nome)?;
    if valor_alvo_centavos <= 0 {
        return Err("O valor da meta precisa ser maior que zero.".into());
    }
    if let Some(p) = &prazo {
        data_valida(p)?;
    }
    validar_extras_meta(&tipo, &prioridade)?;
    let notas = notas.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    let conn = state.conn.lock().expect("mutex envenenado");
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO metas (id, nome, valor_alvo_centavos, prazo, tipo, prioridade, notas) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, nome, valor_alvo_centavos, prazo, tipo, prioridade, notas],
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
    pub categoria: Option<String>,
    pub notas: Option<String>,
    pub aquisicao_data: Option<String>,
    pub aquisicao_valor_centavos: Option<i64>,
    pub avaliacoes: Vec<Avaliacao>,
}

#[tauri::command]
pub fn listar_bens(state: State<AppState>) -> Res<Vec<Bem>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn
        .prepare("SELECT id, nome, tipo, categoria, notas, aquisicao_data, aquisicao_valor_centavos FROM bens ORDER BY criado_em")
        .map_err(e)?;
    let base = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, Option<String>>(4)?,
                r.get::<_, Option<String>>(5)?,
                r.get::<_, Option<i64>>(6)?,
            ))
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    let mut bens = Vec::new();
    for (id, nome, tipo, categoria, notas, aquisicao_data, aquisicao_valor_centavos) in base {
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
        bens.push(Bem { id, nome, tipo, valor_centavos, categoria, notas, aquisicao_data, aquisicao_valor_centavos, avaliacoes });
    }
    Ok(bens)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn criar_bem(
    state: State<AppState>,
    nome: String,
    tipo: String,
    valor_centavos: i64,
    data: String,
    categoria: Option<String>,
    notas: Option<String>,
    aquisicao_data: Option<String>,
    aquisicao_valor_centavos: Option<i64>,
) -> Res<String> {
    let nome = nome_valido(&nome)?;
    if tipo != "BEM" && tipo != "DIVIDA" {
        return Err("Tipo inválido.".into());
    }
    if valor_centavos < 0 || matches!(aquisicao_valor_centavos, Some(v) if v < 0) {
        return Err("O valor não pode ser negativo.".into());
    }
    data_valida(&data)?;
    if let Some(d) = &aquisicao_data {
        data_valida(d)?;
    }
    let notas = notas.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    let mut conn = state.conn.lock().expect("mutex envenenado");
    let tx = conn.transaction().map_err(e)?;
    let id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO bens (id, nome, tipo, categoria, notas, aquisicao_data, aquisicao_valor_centavos) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, nome, tipo, categoria, notas, aquisicao_data, aquisicao_valor_centavos],
    )
    .map_err(e)?;
    tx.execute(
        "INSERT INTO bens_avaliacoes (id, bem_id, valor_centavos, data) VALUES (?1, ?2, ?3, ?4)",
        params![Uuid::new_v4().to_string(), id, valor_centavos, data],
    )
    .map_err(e)?;
    tx.commit().map_err(e)?;
    Ok(id)
}

#[tauri::command]
pub fn atualizar_bem_detalhes(
    state: State<AppState>,
    bem_id: String,
    nome: String,
    categoria: Option<String>,
    notas: Option<String>,
    aquisicao_data: Option<String>,
    aquisicao_valor_centavos: Option<i64>,
) -> Res<()> {
    let nome = nome_valido(&nome)?;
    if matches!(aquisicao_valor_centavos, Some(v) if v < 0) {
        return Err("O valor não pode ser negativo.".into());
    }
    if let Some(d) = &aquisicao_data {
        data_valida(d)?;
    }
    let notas = notas.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    let conn = state.conn.lock().expect("mutex envenenado");
    let alteradas = conn
        .execute(
            "UPDATE bens SET nome = ?1, categoria = ?2, notas = ?3, aquisicao_data = ?4, aquisicao_valor_centavos = ?5 WHERE id = ?6",
            params![nome, categoria, notas, aquisicao_data, aquisicao_valor_centavos, bem_id],
        )
        .map_err(e)?;
    if alteradas == 0 {
        return Err("Item não encontrado.".into());
    }
    Ok(())
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

// ----------------------------------------------- Edição de cadastros e extras

fn etiqueta_valida(etiqueta: &Option<String>) -> Res<()> {
    match etiqueta.as_deref() {
        None | Some("MENSALIDADE") | Some("ASSINATURA") | Some("FIXO") => Ok(()),
        Some(_) => Err("Etiqueta inválida.".into()),
    }
}

/// Corrige só descrição, observação e etiqueta. Valores, datas e contas de um
/// lançamento nunca mudam: para isso o caminho contábil correto é estornar e relançar.
#[tauri::command]
pub fn atualizar_lancamento_info(
    state: State<AppState>,
    lancamento_id: String,
    descricao: String,
    observacao: Option<String>,
    etiqueta: Option<String>,
) -> Res<()> {
    let descricao = nome_valido(&descricao)?;
    etiqueta_valida(&etiqueta)?;
    let observacao = observacao.map(|o| o.trim().to_string()).filter(|o| !o.is_empty());
    let mut conn = state.conn.lock().expect("mutex envenenado");
    let tx = conn.transaction().map_err(e)?;
    let alteradas = tx
        .execute(
            "UPDATE lancamentos SET descricao = ?1, observacao = ?2, etiqueta = ?3 WHERE id = ?4",
            params![descricao, observacao, etiqueta, lancamento_id],
        )
        .map_err(e)?;
    if alteradas == 0 {
        return Err("Lançamento não encontrado.".into());
    }
    tx.execute(
        "INSERT INTO auditoria (id, acao, entidade, entidade_id) VALUES (?1, 'ATUALIZAR_LANCAMENTO', 'lancamento', ?2)",
        params![Uuid::new_v4().to_string(), lancamento_id],
    )
    .map_err(e)?;
    tx.commit().map_err(e)
}

#[tauri::command]
pub fn atualizar_agendamento(
    state: State<AppState>,
    agendamento_id: String,
    descricao: String,
    valor_centavos: i64,
    vencimento: String,
    etiqueta: Option<String>,
    recorrencia: Option<String>,
) -> Res<()> {
    let descricao = nome_valido(&descricao)?;
    if valor_centavos <= 0 {
        return Err("O valor precisa ser maior que zero.".into());
    }
    data_valida(&vencimento)?;
    etiqueta_valida(&etiqueta)?;
    if !matches!(recorrencia.as_deref(), None | Some("SEMANAL") | Some("MENSAL") | Some("ANUAL")) {
        return Err("Recorrência inválida.".into());
    }
    let conn = state.conn.lock().expect("mutex envenenado");
    let alteradas = conn
        .execute(
            "UPDATE agendamentos SET descricao = ?1, valor_centavos = ?2, vencimento = ?3, etiqueta = ?4, recorrencia = ?5
             WHERE id = ?6 AND pago_em IS NULL",
            params![descricao, valor_centavos, vencimento, etiqueta, recorrencia, agendamento_id],
        )
        .map_err(e)?;
    if alteradas == 0 {
        return Err("Conta não encontrada ou já paga.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn atualizar_conta(
    state: State<AppState>,
    conta_id: String,
    nome: String,
    instituicao: Option<String>,
    limite_centavos: Option<i64>,
    dia_fechamento_fatura: Option<i32>,
    dia_vencimento_fatura: Option<i32>,
) -> Res<()> {
    let nome = nome_valido(&nome)?;
    if matches!(limite_centavos, Some(l) if l < 0) {
        return Err("O limite não pode ser negativo.".into());
    }
    for dia in [dia_fechamento_fatura, dia_vencimento_fatura].into_iter().flatten() {
        if !(1..=31).contains(&dia) {
            return Err("O dia da fatura precisa estar entre 1 e 31.".into());
        }
    }
    let instituicao = instituicao.map(|i| i.trim().to_string()).filter(|i| !i.is_empty());
    let conn = state.conn.lock().expect("mutex envenenado");
    let alteradas = conn
        .execute(
            "UPDATE contas_contabeis SET nome = ?1, instituicao = ?2, limite_centavos = ?3,
                    dia_fechamento_fatura = ?4, dia_vencimento_fatura = ?5
             WHERE id = ?6 AND sistema = 0",
            params![nome, instituicao, limite_centavos, dia_fechamento_fatura, dia_vencimento_fatura, conta_id],
        )
        .map_err(e)?;
    if alteradas == 0 {
        return Err("Conta não encontrada ou protegida do sistema.".into());
    }
    Ok(())
}

/// Arquiva (ou reativa) uma conta. Só arquiva com saldo zero, para não
/// "esconder" dinheiro ou dívida.
#[tauri::command]
pub fn arquivar_conta(state: State<AppState>, conta_id: String, arquivar: bool) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    if arquivar {
        let saldo = crate::accounting::engine::saldo_conta(&conn, &conta_id).map_err(String::from)?;
        if saldo != 0 {
            return Err("Só é possível arquivar uma conta com saldo zero.".into());
        }
    }
    let alteradas = conn
        .execute(
            "UPDATE contas_contabeis SET ativa = ?1 WHERE id = ?2 AND sistema = 0",
            params![if arquivar { 0 } else { 1 }, conta_id],
        )
        .map_err(e)?;
    if alteradas == 0 {
        return Err("Conta não encontrada ou protegida do sistema.".into());
    }
    Ok(())
}

/// Categoria personalizada de despesa ou receita.
#[tauri::command]
pub fn criar_categoria(state: State<AppState>, nome: String, tipo: String) -> Res<String> {
    let nome = nome_valido(&nome)?;
    let prefixo = match tipo.as_str() {
        "DESPESA" => "5",
        "RECEITA" => "4",
        _ => return Err("Tipo de categoria inválido.".into()),
    };
    let conn = state.conn.lock().expect("mutex envenenado");
    let existe: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM contas_contabeis WHERE tipo = ?1 AND lower(nome) = lower(?2))",
            params![tipo, nome],
            |r| r.get(0),
        )
        .map_err(e)?;
    if existe {
        return Err("Já existe uma categoria com esse nome.".into());
    }
    let sufixo = Uuid::new_v4().simple().to_string()[..8].to_string();
    let id = format!("cat-{sufixo}");
    conn.execute(
        "INSERT INTO contas_contabeis (id, codigo, nome, tipo, subtipo, categoria_pai_id, sistema)
         VALUES (?1, ?2, ?3, ?4, NULL, NULL, 0)",
        params![id, format!("{prefixo}.c-{sufixo}"), nome, tipo],
    )
    .map_err(e)?;
    Ok(id)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn atualizar_meta(
    state: State<AppState>,
    meta_id: String,
    nome: String,
    valor_alvo_centavos: i64,
    prazo: Option<String>,
    tipo: Option<String>,
    prioridade: Option<String>,
    notas: Option<String>,
) -> Res<()> {
    let nome = nome_valido(&nome)?;
    if valor_alvo_centavos <= 0 {
        return Err("O valor da meta precisa ser maior que zero.".into());
    }
    if let Some(p) = &prazo {
        data_valida(p)?;
    }
    validar_extras_meta(&tipo, &prioridade)?;
    let notas = notas.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    let conn = state.conn.lock().expect("mutex envenenado");
    let alteradas = conn
        .execute(
            "UPDATE metas SET nome = ?1, valor_alvo_centavos = ?2, prazo = ?3, tipo = ?4, prioridade = ?5, notas = ?6 WHERE id = ?7",
            params![nome, valor_alvo_centavos, prazo, tipo, prioridade, notas, meta_id],
        )
        .map_err(e)?;
    if alteradas == 0 {
        return Err("Meta não encontrada.".into());
    }
    Ok(())
}

#[derive(Serialize)]
pub struct AporteComMeta {
    pub meta_id: String,
    pub data: String,
    pub valor_centavos: i64,
}

#[tauri::command]
pub fn listar_todos_aportes(state: State<AppState>) -> Res<Vec<AporteComMeta>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn
        .prepare("SELECT meta_id, data, valor_centavos FROM metas_aportes ORDER BY data")
        .map_err(e)?;
    let linhas = stmt
        .query_map([], |r| Ok(AporteComMeta { meta_id: r.get(0)?, data: r.get(1)?, valor_centavos: r.get(2)? }))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(linhas)
}

/// Move valor já guardado de uma meta para outra, numa transação só.
#[tauri::command]
pub fn mover_entre_metas(
    state: State<AppState>,
    origem_id: String,
    destino_id: String,
    valor_centavos: i64,
    data: String,
) -> Res<()> {
    if valor_centavos <= 0 {
        return Err("Informe um valor maior que zero.".into());
    }
    if origem_id == destino_id {
        return Err("Escolha metas diferentes.".into());
    }
    data_valida(&data)?;
    let mut conn = state.conn.lock().expect("mutex envenenado");
    let tx = conn.transaction().map_err(e)?;
    let guardado: Option<i64> = tx
        .query_row(
            "SELECT COALESCE((SELECT SUM(valor_centavos) FROM metas_aportes WHERE meta_id = ?1), 0)
             WHERE EXISTS (SELECT 1 FROM metas WHERE id = ?1)",
            [&origem_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(e)?;
    let guardado = guardado.ok_or("Meta de origem não encontrada.")?;
    if guardado < valor_centavos {
        return Err("A meta de origem não tem esse valor guardado.".into());
    }
    let destino_existe: bool = tx
        .query_row("SELECT EXISTS(SELECT 1 FROM metas WHERE id = ?1)", [&destino_id], |r| r.get(0))
        .map_err(e)?;
    if !destino_existe {
        return Err("Meta de destino não encontrada.".into());
    }
    for (meta, valor) in [(&origem_id, -valor_centavos), (&destino_id, valor_centavos)] {
        tx.execute(
            "INSERT INTO metas_aportes (id, meta_id, valor_centavos, data) VALUES (?1, ?2, ?3, ?4)",
            params![Uuid::new_v4().to_string(), meta, valor, data],
        )
        .map_err(e)?;
    }
    tx.commit().map_err(e)
}

#[derive(Serialize)]
pub struct AporteMeta {
    pub data: String,
    pub valor_centavos: i64,
}

#[tauri::command]
pub fn listar_aportes_meta(state: State<AppState>, meta_id: String) -> Res<Vec<AporteMeta>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn
        .prepare("SELECT data, valor_centavos FROM metas_aportes WHERE meta_id = ?1 ORDER BY data DESC, criado_em DESC")
        .map_err(e)?;
    let linhas = stmt
        .query_map([meta_id], |r| Ok(AporteMeta { data: r.get(0)?, valor_centavos: r.get(1)? }))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(linhas)
}

#[tauri::command]
pub fn renomear_bem(state: State<AppState>, bem_id: String, nome: String) -> Res<()> {
    let nome = nome_valido(&nome)?;
    let conn = state.conn.lock().expect("mutex envenenado");
    let alteradas = conn.execute("UPDATE bens SET nome = ?1 WHERE id = ?2", params![nome, bem_id]).map_err(e)?;
    if alteradas == 0 {
        return Err("Item não encontrado.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn atualizar_item_radar(
    state: State<AppState>,
    item_id: String,
    nome: String,
    preco_alvo_centavos: Option<i64>,
) -> Res<()> {
    let nome = nome_valido(&nome)?;
    if matches!(preco_alvo_centavos, Some(p) if p <= 0) {
        return Err("O preço-alvo precisa ser maior que zero.".into());
    }
    let conn = state.conn.lock().expect("mutex envenenado");
    let alteradas = conn
        .execute(
            "UPDATE radar_itens SET nome = ?1, preco_alvo_centavos = ?2 WHERE id = ?3",
            params![nome, preco_alvo_centavos, item_id],
        )
        .map_err(e)?;
    if alteradas == 0 {
        return Err("Item não encontrado.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn excluir_preco_radar(state: State<AppState>, preco_id: String) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    conn.execute("DELETE FROM radar_precos WHERE id = ?1", [preco_id]).map_err(e)?;
    Ok(())
}

// ------------------------------------------------ Manutenção e segurança dos dados

#[derive(Serialize)]
pub struct InfoBanco {
    pub caminho: String,
    pub tamanho_bytes: u64,
    pub lancamentos: i64,
    pub contas: i64,
    pub agendamentos: i64,
    pub metas: i64,
    pub bens: i64,
    pub versao_sqlite: String,
    pub migracoes: i64,
}

#[tauri::command]
pub fn info_banco(state: State<AppState>) -> Res<InfoBanco> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let contar = |tabela: &str| -> Res<i64> {
        conn.query_row(&format!("SELECT COUNT(*) FROM {tabela}"), [], |r| r.get(0)).map_err(e)
    };
    let caminho = conn.path().unwrap_or("").to_string();
    let tamanho_bytes = std::fs::metadata(&caminho).map(|m| m.len()).unwrap_or(0);
    Ok(InfoBanco {
        tamanho_bytes,
        lancamentos: contar("lancamentos")?,
        contas: contar("contas_contabeis")?,
        agendamentos: contar("agendamentos")?,
        metas: contar("metas")?,
        bens: contar("bens")?,
        migracoes: contar("schema_migrations")?,
        versao_sqlite: rusqlite::version().to_string(),
        caminho,
    })
}

/// Roda `PRAGMA integrity_check` e confere se débitos = créditos em todos os lançamentos.
#[tauri::command]
pub fn verificar_integridade(state: State<AppState>) -> Res<Vec<String>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut problemas = Vec::new();
    let mut stmt = conn.prepare("PRAGMA integrity_check").map_err(e)?;
    let resultados = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    if resultados.len() != 1 || resultados[0] != "ok" {
        problemas.extend(resultados.into_iter().map(|r| format!("Banco: {r}")));
    }
    let desequilibrados: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM (
                SELECT lancamento_id FROM partidas GROUP BY lancamento_id
                HAVING SUM(CASE WHEN tipo = 'DEBITO' THEN valor_centavos ELSE -valor_centavos END) <> 0
             )",
            [],
            |r| r.get(0),
        )
        .map_err(e)?;
    if desequilibrados > 0 {
        problemas.push(format!("{desequilibrados} lançamento(s) com débitos diferentes de créditos."));
    }
    let sem_partidas: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM lancamentos l WHERE NOT EXISTS (SELECT 1 FROM partidas p WHERE p.lancamento_id = l.id)",
            [],
            |r| r.get(0),
        )
        .map_err(e)?;
    if sem_partidas > 0 {
        problemas.push(format!("{sem_partidas} lançamento(s) sem partidas."));
    }
    Ok(problemas)
}

#[tauri::command]
pub fn otimizar_banco(state: State<AppState>) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;").map_err(e)
}

#[tauri::command]
pub fn excluir_backup(app: AppHandle, nome: String) -> Res<()> {
    let nome = nome_seguro(&nome)?;
    let caminho = pasta_dairus(&app, "Backups")?.join(nome);
    if !caminho.is_file() || !caminho.extension().is_some_and(|x| x == "db") {
        return Err("Backup não encontrado.".into());
    }
    std::fs::remove_file(caminho).map_err(e)
}

#[tauri::command]
pub fn verificar_backup(app: AppHandle, nome: String) -> Res<()> {
    let nome = nome_seguro(&nome)?;
    let caminho = pasta_dairus(&app, "Backups")?.join(nome);
    if !caminho.is_file() {
        return Err("Backup não encontrado.".into());
    }
    validar_arquivo_backup(&caminho)
}

/// Mantém só os `manter` backups mais recentes feitos pelo Dairus (os de segurança
/// "antes-de-restaurar" nunca são apagados automaticamente). Devolve quantos removeu.
#[tauri::command]
pub fn aplicar_retencao(app: AppHandle, manter: usize) -> Res<usize> {
    let manter = manter.max(1);
    let pasta = pasta_dairus(&app, "Backups")?;
    let mut lista: Vec<(String, PathBuf)> = std::fs::read_dir(&pasta)
        .map_err(e)?
        .filter_map(|ent| ent.ok())
        .map(|ent| ent.path())
        .filter(|p| p.extension().is_some_and(|x| x == "db"))
        .filter(|p| p.file_name().is_some_and(|n| n.to_string_lossy().starts_with("dairus-")))
        .filter_map(|p| info_do_arquivo(&p).map(|i| (i.criado_em, p)))
        .collect();
    lista.sort_by(|a, b| b.0.cmp(&a.0));
    let mut removidos = 0;
    for (_, caminho) in lista.into_iter().skip(manter) {
        if std::fs::remove_file(caminho).is_ok() {
            removidos += 1;
        }
    }
    Ok(removidos)
}

#[tauri::command]
pub fn abrir_pasta_dairus(app: AppHandle, subpasta: String) -> Res<String> {
    let sub = match subpasta.as_str() {
        "Backups" | "Exportacoes" => subpasta.as_str(),
        _ => return Err("Pasta inválida.".into()),
    };
    let pasta = pasta_dairus(&app, sub)?;
    #[cfg(windows)]
    std::process::Command::new("explorer").arg(&pasta).spawn().map_err(e)?;
    Ok(pasta.to_string_lossy().to_string())
}

/// Volta o app ao estado inicial: apaga lançamentos, contas e categorias suas, metas,
/// bens, radar e orçamentos. Antes disso grava um backup de segurança.
#[tauri::command]
pub fn apagar_todos_os_dados(app: AppHandle, state: State<AppState>, confirmacao: String) -> Res<InfoBackup> {
    if confirmacao != "APAGAR TUDO" {
        return Err("Confirmação incorreta.".into());
    }
    let pasta = pasta_dairus(&app, "Backups")?;
    let mut conn = state.conn.lock().expect("mutex envenenado");
    let seguranca = gravar_backup(&conn, &pasta, "antes-de-apagar")?;
    limpar_dados(&mut conn)?;
    Ok(seguranca)
}

fn limpar_dados(conn: &mut Connection) -> Res<()> {
    let tx = conn.transaction().map_err(e)?;
    tx.execute_batch(
        "DELETE FROM metas_aportes; DELETE FROM metas;
         DELETE FROM bens_avaliacoes; DELETE FROM bens;
         DELETE FROM radar_precos; DELETE FROM radar_itens;
         DELETE FROM orcamentos; DELETE FROM agendamentos;
         DELETE FROM partidas; UPDATE lancamentos SET estornado_de = NULL; DELETE FROM lancamentos;
         DELETE FROM contas_contabeis WHERE sistema = 0;
         UPDATE contas_contabeis SET ativa = 1;
         DELETE FROM auditoria;",
    )
    .map_err(e)?;
    tx.commit().map_err(e)
}

#[derive(Serialize)]
pub struct RegistroAuditoria {
    pub acao: String,
    pub entidade: String,
    pub entidade_id: String,
    pub criado_em: String,
}

/// Trilha de auditoria (só o fato de algo ter acontecido; nunca valores ou descrições).
#[tauri::command]
pub fn listar_auditoria(state: State<AppState>, limite: i64) -> Res<Vec<RegistroAuditoria>> {
    let limite = limite.clamp(1, 1000);
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn
        .prepare("SELECT acao, entidade, entidade_id, criado_em FROM auditoria ORDER BY criado_em DESC LIMIT ?1")
        .map_err(e)?;
    let linhas = stmt
        .query_map([limite], |r| {
            Ok(RegistroAuditoria { acao: r.get(0)?, entidade: r.get(1)?, entidade_id: r.get(2)?, criado_em: r.get(3)? })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(linhas)
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

/// DocumentosDairus<id da conta><sub>: cada conta tem as suas próprias pastas.
pub(crate) fn pasta_dairus(app: &AppHandle, sub: &str) -> Res<PathBuf> {
    let usuario = crate::conta::USUARIO_ATUAL
        .lock()
        .expect("mutex envenenado")
        .clone()
        .ok_or("Entre na sua conta primeiro.")?;
    let base = app.path().document_dir().map_err(e)?.join("Dairus").join(usuario).join(sub);
    std::fs::create_dir_all(&base).map_err(e)?;
    Ok(base)
}

pub(crate) fn nome_seguro(nome: &str) -> Res<&str> {
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

/// Lê o conteúdo de um backup local (para enviar à nuvem).
#[tauri::command]
pub fn ler_backup(app: AppHandle, nome: String) -> Res<Vec<u8>> {
    let nome = nome_seguro(&nome)?;
    let caminho = pasta_dairus(&app, "Backups")?.join(nome);
    if !caminho.is_file() {
        return Err("Backup não encontrado.".into());
    }
    std::fs::read(caminho).map_err(e)
}

/// Grava na pasta de backups um arquivo baixado da nuvem, conferindo se é um backup válido do Dairus.
#[tauri::command]
pub fn gravar_backup_baixado(app: AppHandle, nome: String, conteudo: Vec<u8>) -> Res<InfoBackup> {
    let nome = nome_seguro(&nome)?;
    if !nome.ends_with(".db") {
        return Err("O arquivo precisa ser um backup .db do Dairus.".into());
    }
    let caminho = pasta_dairus(&app, "Backups")?.join(nome);
    std::fs::write(&caminho, &conteudo).map_err(e)?;
    if let Err(erro) = validar_arquivo_backup(&caminho) {
        let _ = std::fs::remove_file(&caminho);
        return Err(erro);
    }
    info_do_arquivo(&caminho).ok_or_else(|| "Não foi possível ler o arquivo baixado.".to_string())
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

/// Grava um arquivo binário (ex.: PDF) na pasta de exportações da conta.
#[tauri::command]
pub fn salvar_exportacao_binaria(app: AppHandle, nome_arquivo: String, conteudo: Vec<u8>) -> Res<String> {
    let nome = nome_seguro(&nome_arquivo)?;
    if conteudo.len() > 50 * 1024 * 1024 {
        return Err("Arquivo grande demais.".into());
    }
    let caminho = pasta_dairus(&app, "Exportacoes")?.join(nome);
    std::fs::write(&caminho, &conteudo).map_err(e)?;
    Ok(caminho.to_string_lossy().to_string())
}

/// Grava um arquivo exportado (CSV, texto) em Documentos\Dairus\Exportacoes.
#[tauri::command]
pub fn salvar_exportacao(app: AppHandle, nome_arquivo: String, conteudo: String) -> Res<String> {
    let nome = nome_seguro(&nome_arquivo)?;
    let caminho = pasta_dairus(&app, "Exportacoes")?.join(nome);
    std::fs::write(&caminho, conteudo.as_bytes()).map_err(e)?;
    Ok(caminho.to_string_lossy().to_string())
}

#[cfg(test)]
mod testes_backup {
    use super::*;
    use crate::accounting::engine;
    use crate::accounting::models::{NovoLancamentoInput, PartidaInput, TipoPartida};

    fn pasta_temp(nome: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("dairus-teste-{nome}-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    fn banco_com_despesa() -> Connection {
        let conn = crate::db::abrir_conexao(Path::new(":memory:")).unwrap();
        crate::db::executar_migracoes(&conn).unwrap();
        conn
    }

    fn lancar(conn: &mut Connection, valor: i64) {
        engine::criar_lancamento(
            conn,
            NovoLancamentoInput {
                data: "2026-10-01".into(),
                descricao: "Teste".into(),
                observacao: None,
                origem: "MANUAL".into(),
                etiqueta: None,
                parcelas: None,
                partidas: vec![
                    PartidaInput { conta_id: "despesa-outras".into(), tipo: TipoPartida::Debito, valor_centavos: valor },
                    PartidaInput { conta_id: "ativo-dinheiro".into(), tipo: TipoPartida::Credito, valor_centavos: valor },
                ],
            },
        )
        .unwrap();
    }

    #[test]
    fn backup_valido_e_restauracao_devolvem_o_estado_antigo() {
        let pasta = pasta_temp("restore");
        let mut conn = banco_com_despesa();
        lancar(&mut conn, 1000);
        let info = gravar_backup(&conn, &pasta, "dairus").unwrap();
        validar_arquivo_backup(Path::new(&info.caminho)).unwrap();

        lancar(&mut conn, 2500); // estado novo, posterior ao backup
        assert_eq!(engine::saldo_conta(&conn, "ativo-dinheiro").unwrap(), -3500);

        conn.restore(rusqlite::MAIN_DB, &info.caminho, None::<fn(rusqlite::backup::Progress)>).unwrap();
        crate::db::executar_migracoes(&conn).unwrap();
        assert_eq!(engine::saldo_conta(&conn, "ativo-dinheiro").unwrap(), -1000);
        std::fs::remove_dir_all(pasta).ok();
    }

    #[test]
    fn rejeita_arquivos_que_nao_sao_backup_do_dairus() {
        let pasta = pasta_temp("invalido");
        let lixo = pasta.join("lixo.db");
        std::fs::write(&lixo, b"isto nao e um banco sqlite").unwrap();
        assert!(validar_arquivo_backup(&lixo).is_err());

        let vazio = pasta.join("vazio.db");
        Connection::open(&vazio).unwrap().execute_batch("CREATE TABLE outra (x INTEGER);").unwrap();
        assert!(validar_arquivo_backup(&vazio).is_err());
        std::fs::remove_dir_all(pasta).ok();
    }

    #[test]
    fn nomes_de_arquivo_perigosos_sao_recusados() {
        assert!(nome_seguro("dairus-20261002-093643.db").is_ok());
        assert!(nome_seguro(r"..\..\Windows\sistema.db").is_err());
        assert!(nome_seguro("../x.db").is_err());
        assert!(nome_seguro("C:/x.db").is_err());
        assert!(nome_seguro("").is_err());
    }
}

#[cfg(test)]
mod testes_manutencao {
    use super::*;
    use crate::accounting::engine;
    use crate::accounting::models::{NovoLancamentoInput, PartidaInput, TipoPartida};

    #[test]
    fn limpar_dados_zera_o_usuario_mas_preserva_o_plano_de_contas() {
        let mut conn = crate::db::abrir_conexao(Path::new(":memory:")).unwrap();
        crate::db::executar_migracoes(&conn).unwrap();
        let l = engine::criar_lancamento(
            &mut conn,
            NovoLancamentoInput {
                data: "2026-10-01".into(),
                descricao: "Teste".into(),
                observacao: None,
                origem: "MANUAL".into(),
                etiqueta: None,
                parcelas: None,
                partidas: vec![
                    PartidaInput { conta_id: "despesa-outras".into(), tipo: TipoPartida::Debito, valor_centavos: 500 },
                    PartidaInput { conta_id: "ativo-dinheiro".into(), tipo: TipoPartida::Credito, valor_centavos: 500 },
                ],
            },
        )
        .unwrap();
        engine::estornar_lancamento(&mut conn, &l.id).unwrap();
        conn.execute("INSERT INTO metas (id, nome, valor_alvo_centavos) VALUES ('m1', 'Meta', 1000)", []).unwrap();

        limpar_dados(&mut conn).unwrap();

        let total = |t: &str| -> i64 { conn.query_row(&format!("SELECT COUNT(*) FROM {t}"), [], |r| r.get(0)).unwrap() };
        assert_eq!(total("lancamentos"), 0);
        assert_eq!(total("partidas"), 0);
        assert_eq!(total("metas"), 0);
        assert!(total("contas_contabeis") > 10, "o plano de contas padrão precisa continuar");
        assert_eq!(engine::saldo_conta(&conn, "ativo-dinheiro").unwrap(), 0);
    }

    #[test]
    fn retencao_e_nomes_de_backup_so_mexem_em_arquivos_do_dairus() {
        assert!(nome_seguro("dairus-20261002-093643.db").is_ok());
        assert!(nome_seguro("antes-de-restaurar-20261002-093643.db").is_ok());
    }
}

#[cfg(test)]
mod testes_sql_dos_modulos {
    use super::*;

    /// Garante que as instruções SQL dos módulos batem com o esquema migrado
    /// (nomes de colunas, CHECKs e chaves estrangeiras).
    #[test]
    fn instrucoes_de_escrita_funcionam_no_esquema_real() {
        let conn = crate::db::abrir_conexao(Path::new(":memory:")).unwrap();
        crate::db::executar_migracoes(&conn).unwrap();

        conn.execute(
            "INSERT INTO metas (id, nome, valor_alvo_centavos, prazo, tipo, prioridade, notas) VALUES ('m', 'Reserva', 100000, '2027-01-01', 'RESERVA', 'ALTA', 'x')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO metas_aportes (id, meta_id, valor_centavos, data) VALUES ('a1', 'm', 5000, '2026-10-01')", []).unwrap();
        let guardado: i64 = conn
            .query_row("SELECT COALESCE(SUM(valor_centavos), 0) FROM metas_aportes WHERE meta_id = 'm'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(guardado, 5000);
        assert!(conn.execute("INSERT INTO metas (id, nome, valor_alvo_centavos, prioridade) VALUES ('x', 'Y', 1, 'URGENTE')", []).is_err());

        conn.execute(
            "INSERT INTO bens (id, nome, tipo, categoria, notas, aquisicao_data, aquisicao_valor_centavos) VALUES ('b', 'Moto', 'BEM', 'VEICULO', NULL, '2025-01-01', 1500000)",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO bens_avaliacoes (id, bem_id, valor_centavos, data) VALUES ('v1', 'b', 1400000, '2026-10-01')", []).unwrap();
        conn.execute(
            "UPDATE bens SET nome = 'Moto 150', categoria = 'VEICULO', notas = 'ok', aquisicao_data = NULL, aquisicao_valor_centavos = NULL WHERE id = 'b'",
            [],
        )
        .unwrap();

        conn.execute("INSERT INTO radar_itens (id, nome, preco_alvo_centavos) VALUES ('r', 'Notebook', 300000)", []).unwrap();
        conn.execute("INSERT INTO radar_precos (id, item_id, loja, preco_centavos, url, data) VALUES ('p', 'r', 'Loja', 320000, NULL, '2026-10-01')", []).unwrap();
        assert!(conn.execute("INSERT INTO radar_precos (id, item_id, loja, preco_centavos, data) VALUES ('q', 'r', 'L', 0, '2026-10-01')", []).is_err());

        conn.execute(
            "INSERT INTO orcamentos (categoria_id, limite_centavos) VALUES ('despesa-lazer', 20000)
             ON CONFLICT(categoria_id) DO UPDATE SET limite_centavos = excluded.limite_centavos,
             atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO contas_contabeis (id, codigo, nome, tipo, subtipo, categoria_pai_id, sistema) VALUES ('cat-x', '5.c-x', 'Pets', 'DESPESA', NULL, NULL, 0)", []).unwrap();
        conn.execute("UPDATE contas_contabeis SET nome = 'Pets 2', instituicao = NULL, limite_centavos = NULL, dia_fechamento_fatura = NULL, dia_vencimento_fatura = NULL WHERE id = 'cat-x' AND sistema = 0", []).unwrap();

        // Excluir uma meta leva os aportes junto (ON DELETE CASCADE).
        conn.execute("DELETE FROM metas WHERE id = 'm'", []).unwrap();
        let restantes: i64 = conn.query_row("SELECT COUNT(*) FROM metas_aportes", [], |r| r.get(0)).unwrap();
        assert_eq!(restantes, 0);
    }
}
