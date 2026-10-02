use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use uuid::Uuid;

use super::error::AccountingError;
use super::models::{
    Agendamento, Conta, Lancamento, NovaContaInput, NovoAgendamentoInput, NovoLancamentoInput, Partida,
    PartidaInput, TipoConta, TipoPartida,
};

type Resultado<T> = Result<T, AccountingError>;

fn registrar_auditoria(tx: &Transaction, acao: &str, entidade: &str, entidade_id: &str) -> Resultado<()> {
    tx.execute(
        "INSERT INTO auditoria (id, acao, entidade, entidade_id) VALUES (?1, ?2, ?3, ?4)",
        params![Uuid::new_v4().to_string(), acao, entidade, entidade_id],
    )?;
    Ok(())
}

fn conta_existe_e_ativa(tx: &Transaction, conta_id: &str) -> Resultado<TipoConta> {
    let row: Option<(String, bool)> = tx
        .query_row(
            "SELECT tipo, ativa FROM contas_contabeis WHERE id = ?1",
            [conta_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? != 0)),
        )
        .optional()?;

    match row {
        None => Err(AccountingError::ContaNaoEncontrada(conta_id.to_string())),
        Some((_, false)) => Err(AccountingError::ContaArquivada(conta_id.to_string())),
        Some((tipo, true)) => Ok(TipoConta::from_db_str(&tipo)),
    }
}

/// Núcleo do motor contábil: valida partidas dobradas e grava lançamento +
/// partidas na mesma transação. Toda outra função de escrita (criação de
/// conta com saldo inicial, estorno, atalhos de salário/despesa) termina
/// chamando esta função — nunca duplica a validação.
fn inserir_lancamento_na_transacao(
    tx: &Transaction,
    input: &NovoLancamentoInput,
    estornado_de: Option<&str>,
) -> Resultado<Lancamento> {
    if input.partidas.len() < 2 {
        return Err(AccountingError::PartidasInsuficientes);
    }

    let mut soma_debitos: i64 = 0;
    let mut soma_creditos: i64 = 0;

    for partida in &input.partidas {
        if partida.valor_centavos <= 0 {
            return Err(AccountingError::ValorInvalido);
        }
        conta_existe_e_ativa(tx, &partida.conta_id)?;
        match partida.tipo {
            TipoPartida::Debito => soma_debitos += partida.valor_centavos,
            TipoPartida::Credito => soma_creditos += partida.valor_centavos,
        }
    }

    if soma_debitos != soma_creditos {
        return Err(AccountingError::LancamentoDesequilibrado {
            debitos: soma_debitos,
            creditos: soma_creditos,
        });
    }

    let lancamento_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO lancamentos (id, data, descricao, observacao, origem, estornado_de, etiqueta)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            lancamento_id,
            input.data,
            input.descricao,
            input.observacao,
            input.origem,
            estornado_de,
            input.etiqueta,
        ],
    )?;

    let mut partidas_gravadas = Vec::with_capacity(input.partidas.len());
    for partida in &input.partidas {
        let partida_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO partidas (id, lancamento_id, conta_id, tipo, valor_centavos)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                partida_id,
                lancamento_id,
                partida.conta_id,
                partida.tipo.as_db_str(),
                partida.valor_centavos,
            ],
        )?;
        partidas_gravadas.push(Partida {
            id: partida_id,
            conta_id: partida.conta_id.clone(),
            tipo: partida.tipo,
            valor_centavos: partida.valor_centavos,
        });
    }

    registrar_auditoria(tx, "CRIAR_LANCAMENTO", "lancamento", &lancamento_id)?;

    Ok(Lancamento {
        id: lancamento_id,
        data: input.data.clone(),
        descricao: input.descricao.clone(),
        observacao: input.observacao.clone(),
        origem: input.origem.clone(),
        etiqueta: input.etiqueta.clone(),
        estornado_de: estornado_de.map(|s| s.to_string()),
        partidas: partidas_gravadas,
    })
}

pub fn criar_lancamento(conn: &mut Connection, input: NovoLancamentoInput) -> Resultado<Lancamento> {
    let tx = conn.transaction()?;
    let lancamento = inserir_lancamento_na_transacao(&tx, &input, None)?;
    tx.commit()?;
    Ok(lancamento)
}

pub fn estornar_lancamento(conn: &mut Connection, lancamento_id: &str) -> Resultado<Lancamento> {
    let tx = conn.transaction()?;

    let (data, descricao, origem): (String, String, String) = tx
        .query_row(
            "SELECT data, descricao, origem FROM lancamentos WHERE id = ?1",
            [lancamento_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?
        .ok_or_else(|| AccountingError::LancamentoNaoEncontrado(lancamento_id.to_string()))?;

    if origem == "ESTORNO" {
        return Err(AccountingError::LancamentoJaEstornado(lancamento_id.to_string()));
    }

    let ja_estornado: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM lancamentos WHERE estornado_de = ?1)",
        [lancamento_id],
        |row| row.get(0),
    )?;
    if ja_estornado {
        return Err(AccountingError::LancamentoJaEstornado(lancamento_id.to_string()));
    }

    let mut stmt = tx.prepare(
        "SELECT conta_id, tipo, valor_centavos FROM partidas WHERE lancamento_id = ?1",
    )?;
    let partidas_originais: Vec<(String, String, i64)> = stmt
        .query_map([lancamento_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?
        .collect::<rusqlite::Result<_>>()?;
    drop(stmt);

    let partidas_invertidas = partidas_originais
        .into_iter()
        .map(|(conta_id, tipo, valor_centavos)| super::models::PartidaInput {
            conta_id,
            tipo: if tipo == "DEBITO" {
                TipoPartida::Credito
            } else {
                TipoPartida::Debito
            },
            valor_centavos,
        })
        .collect();

    let input_estorno = NovoLancamentoInput {
        data: Utc::now().format("%Y-%m-%d").to_string(),
        descricao: format!("Estorno de: {descricao}"),
        observacao: None,
        origem: "ESTORNO".to_string(),
        etiqueta: None,
        partidas: partidas_invertidas,
    };

    let estorno = inserir_lancamento_na_transacao(&tx, &input_estorno, Some(lancamento_id))?;
    let _ = data; // mantido para uso futuro (ex.: exibir data original no comprovante)
    tx.commit()?;
    Ok(estorno)
}

pub fn saldo_conta(conn: &Connection, conta_id: &str) -> Resultado<i64> {
    let tipo_str: String = conn
        .query_row(
            "SELECT tipo FROM contas_contabeis WHERE id = ?1",
            [conta_id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| AccountingError::ContaNaoEncontrada(conta_id.to_string()))?;
    let tipo = TipoConta::from_db_str(&tipo_str);

    let soma_debitos: i64 = conn.query_row(
        "SELECT COALESCE(SUM(valor_centavos), 0) FROM partidas WHERE conta_id = ?1 AND tipo = 'DEBITO'",
        [conta_id],
        |row| row.get(0),
    )?;
    let soma_creditos: i64 = conn.query_row(
        "SELECT COALESCE(SUM(valor_centavos), 0) FROM partidas WHERE conta_id = ?1 AND tipo = 'CREDITO'",
        [conta_id],
        |row| row.get(0),
    )?;

    Ok(if tipo.natureza_devedora() {
        soma_debitos - soma_creditos
    } else {
        soma_creditos - soma_debitos
    })
}

pub fn criar_conta(conn: &mut Connection, input: NovaContaInput) -> Resultado<Conta> {
    if input.saldo_inicial_centavos < 0 {
        return Err(AccountingError::SaldoInicialNegativo);
    }

    let tx = conn.transaction()?;

    let codigo_existe: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM contas_contabeis WHERE codigo = ?1)",
        [&input.codigo],
        |row| row.get(0),
    )?;
    if codigo_existe {
        return Err(AccountingError::CodigoDuplicado(input.codigo.clone()));
    }

    let conta_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO contas_contabeis (
            id, codigo, nome, tipo, subtipo, categoria_pai_id, instituicao,
            saldo_inicial_centavos, dia_fechamento_fatura, dia_vencimento_fatura,
            limite_centavos, sistema, ativa
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, 1)",
        params![
            conta_id,
            input.codigo,
            input.nome,
            input.tipo.as_db_str(),
            input.subtipo,
            input.categoria_pai_id,
            input.instituicao,
            input.saldo_inicial_centavos,
            input.dia_fechamento_fatura,
            input.dia_vencimento_fatura,
            input.limite_centavos,
        ],
    )?;

    if input.saldo_inicial_centavos > 0 {
        let hoje = Utc::now().format("%Y-%m-%d").to_string();
        let partidas = match input.tipo {
            TipoConta::Ativo | TipoConta::Despesa => vec![
                super::models::PartidaInput {
                    conta_id: conta_id.clone(),
                    tipo: TipoPartida::Debito,
                    valor_centavos: input.saldo_inicial_centavos,
                },
                super::models::PartidaInput {
                    conta_id: "patrimonio-saldo-inicial".to_string(),
                    tipo: TipoPartida::Credito,
                    valor_centavos: input.saldo_inicial_centavos,
                },
            ],
            TipoConta::Passivo | TipoConta::Patrimonio | TipoConta::Receita => vec![
                super::models::PartidaInput {
                    conta_id: "patrimonio-saldo-inicial".to_string(),
                    tipo: TipoPartida::Debito,
                    valor_centavos: input.saldo_inicial_centavos,
                },
                super::models::PartidaInput {
                    conta_id: conta_id.clone(),
                    tipo: TipoPartida::Credito,
                    valor_centavos: input.saldo_inicial_centavos,
                },
            ],
        };

        let input_saldo_inicial = NovoLancamentoInput {
            data: hoje,
            descricao: format!("Saldo inicial de {}", input.nome),
            observacao: None,
            origem: "SALDO_INICIAL".to_string(),
            etiqueta: None,
            partidas,
        };
        inserir_lancamento_na_transacao(&tx, &input_saldo_inicial, None)?;
    }

    registrar_auditoria(&tx, "CRIAR_CONTA", "conta", &conta_id)?;
    tx.commit()?;

    carregar_conta(conn, &conta_id)?.ok_or_else(|| AccountingError::ContaNaoEncontrada(conta_id))
}

pub fn carregar_conta(conn: &Connection, conta_id: &str) -> Resultado<Option<Conta>> {
    let encontrada = conn
        .query_row(
            "SELECT id, codigo, nome, tipo, subtipo, categoria_pai_id, instituicao,
                    saldo_inicial_centavos, dia_fechamento_fatura, dia_vencimento_fatura,
                    limite_centavos, sistema, ativa
             FROM contas_contabeis WHERE id = ?1",
            [conta_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, i64>(7)?,
                    row.get::<_, Option<i32>>(8)?,
                    row.get::<_, Option<i32>>(9)?,
                    row.get::<_, Option<i64>>(10)?,
                    row.get::<_, i64>(11)? != 0,
                    row.get::<_, i64>(12)? != 0,
                ))
            },
        )
        .optional()?;

    let Some((
        id, codigo, nome, tipo, subtipo, categoria_pai_id, instituicao,
        saldo_inicial_centavos, dia_fechamento_fatura, dia_vencimento_fatura,
        limite_centavos, sistema, ativa,
    )) = encontrada else {
        return Ok(None);
    };

    let saldo_atual_centavos = saldo_conta(conn, &id)?;

    Ok(Some(Conta {
        id,
        codigo,
        nome,
        tipo: TipoConta::from_db_str(&tipo),
        subtipo,
        categoria_pai_id,
        instituicao,
        saldo_inicial_centavos,
        dia_fechamento_fatura,
        dia_vencimento_fatura,
        limite_centavos,
        sistema,
        ativa,
        saldo_atual_centavos,
    }))
}

pub fn listar_contas(conn: &Connection) -> Resultado<Vec<Conta>> {
    let ids: Vec<String> = {
        let mut stmt = conn.prepare("SELECT id FROM contas_contabeis ORDER BY codigo")?;
        let ids = stmt
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<_>>()?;
        ids
    };

    ids.into_iter()
        .map(|id| carregar_conta(conn, &id).map(|c| c.expect("conta recém-listada deve existir")))
        .collect()
}

/// Soma o movimento de contas de um tipo (Receita ou Despesa) dentro de um
/// período, líquido de estornos: o lado natural soma, o lado oposto subtrai.
pub fn movimento_periodo_por_tipo(
    conn: &Connection,
    tipo: TipoConta,
    data_inicio: &str,
    data_fim: &str,
) -> Resultado<i64> {
    let lado_natural = if tipo.natureza_devedora() { "DEBITO" } else { "CREDITO" };
    conn.query_row(
        "SELECT COALESCE(SUM(
            CASE WHEN p.tipo = ?1 THEN p.valor_centavos ELSE -p.valor_centavos END
         ), 0)
         FROM partidas p
         JOIN lancamentos l ON l.id = p.lancamento_id
         JOIN contas_contabeis c ON c.id = p.conta_id
         WHERE c.tipo = ?2 AND l.data BETWEEN ?3 AND ?4",
        params![lado_natural, tipo.as_db_str(), data_inicio, data_fim],
        |row| row.get(0),
    )
    .map_err(AccountingError::from)
}

fn soma_saldo_por_tipo(conn: &Connection, tipo: TipoConta) -> Resultado<i64> {
    let ids: Vec<String> = {
        let mut stmt = conn.prepare("SELECT id FROM contas_contabeis WHERE tipo = ?1")?;
        let ids = stmt
            .query_map([tipo.as_db_str()], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<_>>()?;
        ids
    };
    let mut total = 0i64;
    for id in ids {
        total += saldo_conta(conn, &id)?;
    }
    Ok(total)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ResumoDashboard {
    pub saldo_disponivel_centavos: i64,
    pub patrimonio_liquido_centavos: i64,
    pub receitas_mes_centavos: i64,
    pub despesas_mes_centavos: i64,
}

pub fn resumo_dashboard(conn: &Connection, data_inicio: &str, data_fim: &str) -> Resultado<ResumoDashboard> {
    let total_ativo = soma_saldo_por_tipo(conn, TipoConta::Ativo)?;
    let total_passivo = soma_saldo_por_tipo(conn, TipoConta::Passivo)?;

    Ok(ResumoDashboard {
        saldo_disponivel_centavos: total_ativo,
        patrimonio_liquido_centavos: total_ativo - total_passivo,
        receitas_mes_centavos: movimento_periodo_por_tipo(conn, TipoConta::Receita, data_inicio, data_fim)?,
        despesas_mes_centavos: movimento_periodo_por_tipo(conn, TipoConta::Despesa, data_inicio, data_fim)?,
    })
}

pub fn listar_lancamentos(conn: &Connection, limite: i64) -> Resultado<Vec<Lancamento>> {
    let mut stmt = conn.prepare(
        "SELECT id, data, descricao, observacao, origem, estornado_de, etiqueta
         FROM lancamentos ORDER BY data DESC, criado_em DESC LIMIT ?1",
    )?;
    let cabecalhos: Vec<(String, String, String, Option<String>, String, Option<String>, Option<String>)> = stmt
        .query_map([limite], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;
    drop(stmt);

    let mut resultado = Vec::with_capacity(cabecalhos.len());
    for (id, data, descricao, observacao, origem, estornado_de, etiqueta) in cabecalhos {
        let mut stmt_partidas = conn.prepare(
            "SELECT id, conta_id, tipo, valor_centavos FROM partidas WHERE lancamento_id = ?1",
        )?;
        let partidas: Vec<Partida> = stmt_partidas
            .query_map([&id], |row| {
                let tipo_str: String = row.get(2)?;
                Ok(Partida {
                    id: row.get(0)?,
                    conta_id: row.get(1)?,
                    tipo: if tipo_str == "DEBITO" {
                        TipoPartida::Debito
                    } else {
                        TipoPartida::Credito
                    },
                    valor_centavos: row.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?;

        resultado.push(Lancamento {
            id,
            data,
            descricao,
            observacao,
            origem,
            etiqueta,
            estornado_de,
            partidas,
        });
    }

    Ok(resultado)
}

const ETIQUETAS_VALIDAS: [&str; 3] = ["MENSALIDADE", "ASSINATURA", "FIXO"];

fn validar_etiqueta(etiqueta: &Option<String>) -> Resultado<()> {
    match etiqueta {
        Some(e) if !ETIQUETAS_VALIDAS.contains(&e.as_str()) => Err(AccountingError::DadoInvalido(format!(
            "Etiqueta inválida: {e}. Use Mensalidade, Assinatura ou Fixo."
        ))),
        _ => Ok(()),
    }
}

fn validar_recorrencia(recorrencia: &Option<String>) -> Resultado<()> {
    match recorrencia.as_deref() {
        None | Some("SEMANAL") | Some("MENSAL") | Some("ANUAL") => Ok(()),
        Some(r) => Err(AccountingError::DadoInvalido(format!("Recorrência inválida: {r}."))),
    }
}

/// Próxima data de uma conta recorrente. Mensal/anual mantêm o dia, ajustando
/// ao último dia do mês quando ele não existe (ex.: 31/01 -> 28/02).
pub fn proximo_vencimento(vencimento: &str, recorrencia: &str) -> Option<String> {
    use chrono::{Datelike, Duration, NaiveDate};
    let data = NaiveDate::parse_from_str(vencimento, "%Y-%m-%d").ok()?;
    let proxima = match recorrencia {
        "SEMANAL" => data + Duration::days(7),
        "MENSAL" | "ANUAL" => {
            let meses = if recorrencia == "ANUAL" { 12 } else { 1 };
            let total = data.year() * 12 + data.month0() as i32 + meses;
            let (ano, mes) = (total.div_euclid(12), total.rem_euclid(12) as u32 + 1);
            let ultimo = NaiveDate::from_ymd_opt(if mes == 12 { ano + 1 } else { ano }, if mes == 12 { 1 } else { mes + 1 }, 1)?
                .pred_opt()?
                .day();
            NaiveDate::from_ymd_opt(ano, mes, data.day().min(ultimo))?
        }
        _ => return None,
    };
    Some(proxima.format("%Y-%m-%d").to_string())
}

pub fn criar_agendamento(conn: &mut Connection, input: NovoAgendamentoInput) -> Resultado<Agendamento> {
    if input.descricao.trim().is_empty() {
        return Err(AccountingError::DadoInvalido("Informe uma descrição para a conta.".into()));
    }
    if input.valor_centavos <= 0 {
        return Err(AccountingError::ValorInvalido);
    }
    if chrono::NaiveDate::parse_from_str(&input.vencimento, "%Y-%m-%d").is_err() {
        return Err(AccountingError::DadoInvalido("Data de vencimento inválida.".into()));
    }
    validar_etiqueta(&input.etiqueta)?;
    validar_recorrencia(&input.recorrencia)?;

    let tx = conn.transaction()?;
    let tipo = conta_existe_e_ativa(&tx, &input.categoria_despesa_id)?;
    if tipo != TipoConta::Despesa {
        return Err(AccountingError::DadoInvalido("A categoria precisa ser uma conta de despesa.".into()));
    }

    let id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO agendamentos (id, descricao, valor_centavos, vencimento, categoria_despesa_id, etiqueta, recorrencia)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            id,
            input.descricao.trim(),
            input.valor_centavos,
            input.vencimento,
            input.categoria_despesa_id,
            input.etiqueta,
            input.recorrencia,
        ],
    )?;
    registrar_auditoria(&tx, "CRIAR_AGENDAMENTO", "agendamento", &id)?;
    tx.commit()?;

    Ok(Agendamento {
        id,
        descricao: input.descricao.trim().to_string(),
        valor_centavos: input.valor_centavos,
        vencimento: input.vencimento,
        categoria_despesa_id: input.categoria_despesa_id,
        etiqueta: input.etiqueta,
        lancamento_id: None,
        pago_em: None,
        recorrencia: input.recorrencia,
    })
}

pub fn listar_agendamentos(conn: &Connection) -> Resultado<Vec<Agendamento>> {
    let mut stmt = conn.prepare(
        "SELECT id, descricao, valor_centavos, vencimento, categoria_despesa_id, etiqueta, lancamento_id, pago_em, recorrencia
         FROM agendamentos ORDER BY (pago_em IS NOT NULL), vencimento, criado_em",
    )?;
    let linhas = stmt
        .query_map([], |row| {
            Ok(Agendamento {
                id: row.get(0)?,
                descricao: row.get(1)?,
                valor_centavos: row.get(2)?,
                vencimento: row.get(3)?,
                categoria_despesa_id: row.get(4)?,
                etiqueta: row.get(5)?,
                lancamento_id: row.get(6)?,
                pago_em: row.get(7)?,
                recorrencia: row.get(8)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(linhas)
}

/// Paga uma conta agendada: cria o lançamento balanceado (Débito na
/// categoria de despesa, Crédito na conta de origem) e marca o agendamento
/// como pago — tudo numa transação só.
pub fn pagar_agendamento(
    conn: &mut Connection,
    agendamento_id: &str,
    conta_origem_id: &str,
    data_pagamento: &str,
) -> Resultado<Lancamento> {
    if chrono::NaiveDate::parse_from_str(data_pagamento, "%Y-%m-%d").is_err() {
        return Err(AccountingError::DadoInvalido("Data de pagamento inválida.".into()));
    }
    let tx = conn.transaction()?;

    let (descricao, valor, categoria, etiqueta, pago_em, vencimento, recorrencia): (
        String,
        i64,
        String,
        Option<String>,
        Option<String>,
        String,
        Option<String>,
    ) = tx
        .query_row(
            "SELECT descricao, valor_centavos, categoria_despesa_id, etiqueta, pago_em, vencimento, recorrencia
             FROM agendamentos WHERE id = ?1",
            [agendamento_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
        )
        .optional()?
        .ok_or_else(|| AccountingError::AgendamentoNaoEncontrado(agendamento_id.to_string()))?;

    if pago_em.is_some() {
        return Err(AccountingError::AgendamentoJaPago(agendamento_id.to_string()));
    }

    let proximo = recorrencia.as_deref().and_then(|r| proximo_vencimento(&vencimento, r));
    let input = NovoLancamentoInput {
        data: data_pagamento.to_string(),
        descricao: descricao.clone(),
        observacao: None,
        origem: "MANUAL".to_string(),
        etiqueta: etiqueta.clone(),
        partidas: vec![
            PartidaInput { conta_id: categoria.clone(), tipo: TipoPartida::Debito, valor_centavos: valor },
            PartidaInput { conta_id: conta_origem_id.to_string(), tipo: TipoPartida::Credito, valor_centavos: valor },
        ],
    };
    let lancamento = inserir_lancamento_na_transacao(&tx, &input, None)?;

    tx.execute(
        "UPDATE agendamentos SET lancamento_id = ?1, pago_em = ?2 WHERE id = ?3",
        params![lancamento.id, data_pagamento, agendamento_id],
    )?;
    registrar_auditoria(&tx, "PAGAR_AGENDAMENTO", "agendamento", agendamento_id)?;

    // Conta recorrente: ao pagar esta, já deixa a próxima agendada.
    if let (Some(venc), Some(rec)) = (proximo, recorrencia) {
        let novo_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO agendamentos (id, descricao, valor_centavos, vencimento, categoria_despesa_id, etiqueta, recorrencia)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![novo_id, descricao, valor, venc, categoria, etiqueta, rec],
        )?;
        registrar_auditoria(&tx, "CRIAR_AGENDAMENTO", "agendamento", &novo_id)?;
    }
    tx.commit()?;
    Ok(lancamento)
}

/// Só agendamentos ainda não pagos podem ser removidos; um pago já virou
/// lançamento contábil e só se desfaz por estorno.
pub fn excluir_agendamento(conn: &mut Connection, agendamento_id: &str) -> Resultado<()> {
    let tx = conn.transaction()?;
    let pago_em: Option<Option<String>> = tx
        .query_row("SELECT pago_em FROM agendamentos WHERE id = ?1", [agendamento_id], |row| row.get(0))
        .optional()?;
    match pago_em {
        None => return Err(AccountingError::AgendamentoNaoEncontrado(agendamento_id.to_string())),
        Some(Some(_)) => return Err(AccountingError::AgendamentoJaPago(agendamento_id.to_string())),
        Some(None) => {}
    }
    tx.execute("DELETE FROM agendamentos WHERE id = ?1", [agendamento_id])?;
    registrar_auditoria(&tx, "EXCLUIR_AGENDAMENTO", "agendamento", agendamento_id)?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod testes_agendamento {
    use super::*;
    use crate::db::{abrir_conexao, executar_migracoes};

    fn banco() -> Connection {
        let conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        executar_migracoes(&conn).unwrap();
        conn
    }

    fn novo(valor: i64, etiqueta: Option<&str>) -> NovoAgendamentoInput {
        NovoAgendamentoInput {
            descricao: "Faculdade Wyden".to_string(),
            valor_centavos: valor,
            vencimento: "2026-10-10".to_string(),
            categoria_despesa_id: "despesa-educacao".to_string(),
            etiqueta: etiqueta.map(String::from),
            recorrencia: None,
        }
    }

    #[test]
    fn pagar_gera_lancamento_balanceado_e_marca_como_pago() {
        let mut conn = banco();
        let ag = criar_agendamento(&mut conn, novo(8800, Some("MENSALIDADE"))).unwrap();
        let lanc = pagar_agendamento(&mut conn, &ag.id, "ativo-dinheiro", "2026-10-09").unwrap();

        assert_eq!(lanc.etiqueta.as_deref(), Some("MENSALIDADE"));
        assert_eq!(lanc.partidas.len(), 2);
        assert_eq!(saldo_conta(&conn, "ativo-dinheiro").unwrap(), -8800);
        let salvo = listar_agendamentos(&conn).unwrap();
        assert_eq!(salvo[0].pago_em.as_deref(), Some("2026-10-09"));
        assert_eq!(salvo[0].lancamento_id.as_deref(), Some(lanc.id.as_str()));
    }

    #[test]
    fn nao_paga_duas_vezes_e_nao_exclui_pago() {
        let mut conn = banco();
        let ag = criar_agendamento(&mut conn, novo(5000, None)).unwrap();
        pagar_agendamento(&mut conn, &ag.id, "ativo-dinheiro", "2026-10-09").unwrap();

        assert!(matches!(
            pagar_agendamento(&mut conn, &ag.id, "ativo-dinheiro", "2026-10-09"),
            Err(AccountingError::AgendamentoJaPago(_))
        ));
        assert!(matches!(excluir_agendamento(&mut conn, &ag.id), Err(AccountingError::AgendamentoJaPago(_))));
        assert_eq!(saldo_conta(&conn, "ativo-dinheiro").unwrap(), -5000);
    }

    #[test]
    fn rejeita_dados_invalidos_e_exclui_em_aberto() {
        let mut conn = banco();
        assert!(criar_agendamento(&mut conn, novo(0, None)).is_err());
        assert!(criar_agendamento(&mut conn, novo(100, Some("OUTRA"))).is_err());
        let mut sem_data = novo(100, None);
        sem_data.vencimento = "10/10/2026".into();
        assert!(criar_agendamento(&mut conn, sem_data).is_err());
        let mut categoria_errada = novo(100, None);
        categoria_errada.categoria_despesa_id = "ativo-dinheiro".into();
        assert!(criar_agendamento(&mut conn, categoria_errada).is_err());

        let ag = criar_agendamento(&mut conn, novo(100, None)).unwrap();
        excluir_agendamento(&mut conn, &ag.id).unwrap();
        assert!(listar_agendamentos(&conn).unwrap().is_empty());
    }
}

#[cfg(test)]
mod testes_recorrencia {
    use super::*;

    #[test]
    fn proximo_vencimento_respeita_fim_de_mes_e_virada_de_ano() {
        assert_eq!(proximo_vencimento("2026-01-31", "MENSAL").as_deref(), Some("2026-02-28"));
        assert_eq!(proximo_vencimento("2028-01-31", "MENSAL").as_deref(), Some("2028-02-29"));
        assert_eq!(proximo_vencimento("2026-12-15", "MENSAL").as_deref(), Some("2027-01-15"));
        assert_eq!(proximo_vencimento("2026-10-10", "SEMANAL").as_deref(), Some("2026-10-17"));
        assert_eq!(proximo_vencimento("2028-02-29", "ANUAL").as_deref(), Some("2029-02-28"));
        assert_eq!(proximo_vencimento("2026-10-10", "QUINZENAL"), None);
    }

    #[test]
    fn pagar_conta_recorrente_agenda_a_proxima() {
        use crate::db::{abrir_conexao, executar_migracoes};
        let mut conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        executar_migracoes(&conn).unwrap();
        let ag = criar_agendamento(
            &mut conn,
            NovoAgendamentoInput {
                descricao: "Internet".into(),
                valor_centavos: 9990,
                vencimento: "2026-10-31".into(),
                categoria_despesa_id: "despesa-moradia".into(),
                etiqueta: Some("FIXO".into()),
                recorrencia: Some("MENSAL".into()),
            },
        )
        .unwrap();
        pagar_agendamento(&mut conn, &ag.id, "ativo-dinheiro", "2026-10-30").unwrap();
        let todos = listar_agendamentos(&conn).unwrap();
        assert_eq!(todos.len(), 2);
        let aberto = todos.iter().find(|a| a.pago_em.is_none()).unwrap();
        assert_eq!(aberto.vencimento, "2026-11-30");
        assert_eq!(aberto.recorrencia.as_deref(), Some("MENSAL"));
        assert_eq!(aberto.etiqueta.as_deref(), Some("FIXO"));
    }
}
