use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use uuid::Uuid;

use super::error::AccountingError;
use super::models::{
    Agendamento, Conta, Lancamento, NovaContaInput, NovoAgendamentoInput, NovoLancamentoInput, Partida,
    PartidaInput, TipoConta, TipoPartida,
};

type Resultado<T> = Result<T, AccountingError>;

/// Data de hoje no horário de Brasília (UTC−3, sem horário de verão desde 2019), em AAAA-MM-DD.
/// Usar `Utc::now()` aqui faria, depois das 21h, tudo cair no dia seguinte.
pub fn hoje_brasilia() -> String {
    data_em_brasilia(Utc::now())
}

/// A data (AAAA-MM-DD) que o relógio de Brasília marca num instante em UTC.
pub fn data_em_brasilia(instante: chrono::DateTime<Utc>) -> String {
    let brasilia = chrono::FixedOffset::west_opt(3 * 3600).expect("fuso válido");
    instante.with_timezone(&brasilia).format("%Y-%m-%d").to_string()
}

/// id, data, descrição, observação, origem, estornado_de, etiqueta, parcelas, corrige.
type CabecalhoLancamento = (
    String,
    String,
    String,
    Option<String>,
    String,
    Option<String>,
    Option<String>,
    Option<i32>,
    Option<String>,
);

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
    corrige: Option<&str>,
) -> Resultado<Lancamento> {
    if input.partidas.len() < 2 {
        return Err(AccountingError::PartidasInsuficientes);
    }
    validar_entrada_lancamento(&input.data, &input.descricao, input.observacao.as_deref(), input.partidas.len())?;
    if let Some(n) = input.parcelas {
        if !(2..=72).contains(&n) {
            return Err(AccountingError::DadoInvalido("O parcelamento precisa ter de 2 a 72 parcelas.".into()));
        }
        if !input.partidas.iter().any(|p| p.tipo == TipoPartida::Credito && eh_cartao(tx, &p.conta_id)) {
            return Err(AccountingError::DadoInvalido("Só compras no cartão de crédito podem ser parceladas.".into()));
        }
    }

    let mut soma_debitos: i64 = 0;
    let mut soma_creditos: i64 = 0;

    for partida in &input.partidas {
        if partida.valor_centavos <= 0 || partida.valor_centavos > VALOR_MAXIMO_CENTAVOS {
            return Err(AccountingError::ValorInvalido);
        }
        conta_existe_e_ativa(tx, &partida.conta_id)?;
        match partida.tipo {
            TipoPartida::Debito => soma_debitos = soma_debitos.checked_add(partida.valor_centavos).ok_or(AccountingError::ValorInvalido)?,
            TipoPartida::Credito => soma_creditos = soma_creditos.checked_add(partida.valor_centavos).ok_or(AccountingError::ValorInvalido)?,
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
        "INSERT INTO lancamentos (id, data, descricao, observacao, origem, estornado_de, etiqueta, parcelas, corrige)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            lancamento_id,
            input.data,
            input.descricao,
            input.observacao,
            input.origem,
            estornado_de,
            input.etiqueta,
            input.parcelas,
            corrige,
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
        parcelas: input.parcelas,
        corrige: corrige.map(|s| s.to_string()),
        partidas: partidas_gravadas,
    })
}

fn eh_cartao(tx: &Transaction, conta_id: &str) -> bool {
    tx.query_row(
        "SELECT tipo = 'PASSIVO' AND subtipo = 'CARTAO_CREDITO' FROM contas_contabeis WHERE id = ?1",
        [conta_id],
        |row| row.get::<_, bool>(0),
    )
    .unwrap_or(false)
}

pub fn criar_lancamento(conn: &mut Connection, input: NovoLancamentoInput) -> Resultado<Lancamento> {
    let tx = conn.transaction()?;
    let lancamento = inserir_lancamento_na_transacao(&tx, &input, None, None)?;
    tx.commit()?;
    Ok(lancamento)
}

/// Grava um lançamento dentro de uma transação que já está aberta. Para quem
/// grava o lançamento e mais alguma coisa ligada a ele (fatura, parcela,
/// operação...): o chamador faz tudo na mesma transação e só então dá
/// `commit` — se a segunda parte falhar, o lançamento também não fica.
pub fn inserir_lancamento(tx: &Transaction, input: &NovoLancamentoInput) -> Resultado<Lancamento> {
    inserir_lancamento_na_transacao(tx, input, None, None)
}

/// Dados de um lançamento que podem ser estornados: devolve a origem e as
/// partidas, ou erro se ele não existe, já é um estorno ou já foi estornado.
fn carregar_estornavel(tx: &Transaction, lancamento_id: &str) -> Resultado<(LancamentoOriginal, Vec<PartidaInput>)> {
    let original: LancamentoOriginal = tx
        .query_row(
            "SELECT data, descricao, observacao, origem, etiqueta, parcelas FROM lancamentos WHERE id = ?1",
            [lancamento_id],
            |row| {
                Ok(LancamentoOriginal {
                    data: row.get(0)?,
                    descricao: row.get(1)?,
                    observacao: row.get(2)?,
                    origem: row.get(3)?,
                    etiqueta: row.get(4)?,
                    parcelas: row.get(5)?,
                })
            },
        )
        .optional()?
        .ok_or_else(|| AccountingError::LancamentoNaoEncontrado(lancamento_id.to_string()))?;

    if original.origem == "ESTORNO" {
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

    let mut stmt = tx.prepare("SELECT conta_id, tipo, valor_centavos FROM partidas WHERE lancamento_id = ?1 ORDER BY rowid")?;
    let partidas = stmt
        .query_map([lancamento_id], |row| {
            let tipo: String = row.get(1)?;
            Ok(PartidaInput {
                conta_id: row.get(0)?,
                tipo: if tipo == "DEBITO" { TipoPartida::Debito } else { TipoPartida::Credito },
                valor_centavos: row.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok((original, partidas))
}

struct LancamentoOriginal {
    data: String,
    descricao: String,
    observacao: Option<String>,
    origem: String,
    etiqueta: Option<String>,
    parcelas: Option<i32>,
}

fn gravar_estorno(
    tx: &Transaction,
    lancamento_id: &str,
    descricao: &str,
    partidas: &[PartidaInput],
    data: String,
) -> Resultado<Lancamento> {
    let partidas_invertidas = partidas
        .iter()
        .map(|p| PartidaInput {
            conta_id: p.conta_id.clone(),
            tipo: if p.tipo == TipoPartida::Debito { TipoPartida::Credito } else { TipoPartida::Debito },
            valor_centavos: p.valor_centavos,
        })
        .collect();

    let input_estorno = NovoLancamentoInput {
        data,
        descricao: format!("Estorno de: {descricao}"),
        observacao: None,
        origem: "ESTORNO".to_string(),
        etiqueta: None,
        parcelas: None,
        partidas: partidas_invertidas,
    };
    inserir_lancamento_na_transacao(tx, &input_estorno, Some(lancamento_id), None)
}

pub fn estornar_lancamento(conn: &mut Connection, lancamento_id: &str) -> Resultado<Lancamento> {
    let tx = conn.transaction()?;
    let de_investimento: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM operacoes_invest WHERE lancamento_id = ?1)",
        [lancamento_id],
        |row| row.get(0),
    )?;
    if de_investimento {
        // A posição do ativo vem das operações: estornar só o dinheiro deixaria a
        // carteira dizendo que o ativo ainda existe.
        return Err(AccountingError::DadoInvalido(
            "Este lançamento é de uma operação de investimento: exclua a operação na tela Investimentos.".into(),
        ));
    }
    let estorno = estornar_na_transacao(&tx, lancamento_id)?;
    tx.commit()?;
    Ok(estorno)
}

/// Estorna dentro de uma transação já aberta e desfaz, na mesma transação, o
/// que dependia do lançamento: a conta agendada volta a ficar em aberto, a
/// parcela do empréstimo volta a ficar devendo, o valor recebido de uma pessoa
/// volta a ser a receber, os encargos da fatura podem ser lançados de novo.
pub fn estornar_na_transacao(tx: &Transaction, lancamento_id: &str) -> Resultado<Lancamento> {
    let (original, partidas) = carregar_estornavel(tx, lancamento_id)?;
    impedir_estorno_com_dependentes(tx, lancamento_id)?;
    let estorno = gravar_estorno(tx, lancamento_id, &original.descricao, &partidas, hoje_brasilia())?;
    desfazer_vinculos(tx, lancamento_id)?;
    Ok(estorno)
}

/// Casos em que estornar deixaria outro registro pela metade: antes é preciso
/// desfazer o que veio depois (o reembolso, o recebimento).
fn impedir_estorno_com_dependentes(tx: &Transaction, lancamento_id: &str) -> Resultado<()> {
    let com_reembolso: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM reembolsos r WHERE r.compra_id = ?1
            AND NOT EXISTS (SELECT 1 FROM lancamentos x WHERE x.estornado_de = r.reembolso_id))",
        [lancamento_id],
        |row| row.get(0),
    )?;
    if com_reembolso {
        return Err(AccountingError::DadoInvalido(
            "Esta compra tem reembolso lançado. Estorne o reembolso antes de estornar a compra.".into(),
        ));
    }
    let divisao_recebida: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM a_receber WHERE lancamento_id = ?1 AND (recebido_em IS NOT NULL OR perdoado <> 0))",
        [lancamento_id],
        |row| row.get(0),
    )?;
    if divisao_recebida {
        return Err(AccountingError::DadoInvalido(
            "Parte desta divisão já foi recebida ou perdoada. Estorne o recebimento antes.".into(),
        ));
    }
    Ok(())
}

/// Reabre o que o lançamento estornado tinha quitado.
fn desfazer_vinculos(tx: &Transaction, lancamento_id: &str) -> Resultado<()> {
    // Conta agendada volta a ficar em aberto. Se era automática, deixa de ser
    // (só esta ocorrência): senão o app lançaria de novo, sozinho, o que a
    // pessoa acabou de estornar.
    tx.execute(
        "UPDATE agendamentos SET pago_em = NULL, lancamento_id = NULL, automatico = 0 WHERE lancamento_id = ?1",
        [lancamento_id],
    )?;
    // Parcela do empréstimo volta a ser devida.
    tx.execute("DELETE FROM emprestimo_parcelas WHERE lancamento_id = ?1", [lancamento_id])?;
    // Valor recebido (ou perdoado) de uma pessoa volta a ser a receber.
    tx.execute(
        "UPDATE a_receber SET recebido_em = NULL, perdoado = 0, recebimento_lancamento_id = NULL
         WHERE recebimento_lancamento_id = ?1",
        [lancamento_id],
    )?;
    // A divisão estornada não deixa ninguém devendo (nada dela foi recebido:
    // `impedir_estorno_com_dependentes` já garantiu).
    tx.execute("DELETE FROM a_receber WHERE lancamento_id = ?1", [lancamento_id])?;
    // Encargos da fatura podem ser lançados de novo.
    tx.execute(
        "UPDATE faturas SET encargos_lancamento_id = NULL WHERE encargos_lancamento_id = ?1",
        [lancamento_id],
    )?;
    // Aporte de meta desfeito sai do histórico da meta.
    tx.execute("DELETE FROM metas_aportes WHERE lancamento_id = ?1", [lancamento_id])?;
    Ok(())
}

/// Na correção, o lançamento novo passa a ser o que vale: quem apontava para o
/// original (conta agendada paga, encargos da fatura, quem usou o cartão)
/// passa a apontar para o novo — assim um estorno futuro do novo reabre tudo.
fn repontar_vinculos(tx: &Transaction, antigo: &str, novo: &str) -> Resultado<()> {
    tx.execute("UPDATE agendamentos SET lancamento_id = ?2 WHERE lancamento_id = ?1", [antigo, novo])?;
    tx.execute("UPDATE faturas SET encargos_lancamento_id = ?2 WHERE encargos_lancamento_id = ?1", [antigo, novo])?;
    tx.execute("UPDATE OR IGNORE lancamento_portador SET lancamento_id = ?2 WHERE lancamento_id = ?1", [antigo, novo])?;
    Ok(())
}

/// Lançamentos cujo valor está amarrado a outro registro: corrigir só o valor
/// deixaria os dois diferentes. Nesses casos o caminho é estornar e refazer.
fn impedir_correcao_com_vinculo(tx: &Transaction, lancamento_id: &str) -> Resultado<()> {
    let casos: [(&str, &str); 6] = [
        ("SELECT EXISTS(SELECT 1 FROM operacoes_invest WHERE lancamento_id = ?1)", "uma operação de investimento"),
        ("SELECT EXISTS(SELECT 1 FROM emprestimo_parcelas WHERE lancamento_id = ?1)", "uma parcela de empréstimo"),
        (
            "SELECT EXISTS(SELECT 1 FROM a_receber WHERE lancamento_id = ?1 OR recebimento_lancamento_id = ?1)",
            "uma divisão ou um recebimento de valores a receber",
        ),
        ("SELECT EXISTS(SELECT 1 FROM reembolsos WHERE compra_id = ?1 OR reembolso_id = ?1)", "uma compra com reembolso"),
        ("SELECT EXISTS(SELECT 1 FROM metas_aportes WHERE lancamento_id = ?1)", "um aporte de meta"),
        (
            "SELECT EXISTS(SELECT 1 FROM contas_contabeis c JOIN partidas p ON p.conta_id = c.id
                WHERE p.lancamento_id = ?1 AND c.subtipo = 'EMPRESTIMO')",
            "um empréstimo",
        ),
    ];
    for (sql, oque) in casos {
        let ligado: bool = tx.query_row(sql, [lancamento_id], |row| row.get(0))?;
        if ligado {
            return Err(AccountingError::DadoInvalido(format!(
                "Este lançamento é de {oque}: para mudar o valor, estorne e lance de novo."
            )));
        }
    }
    Ok(())
}

/// Reparte `novo_total` entre os valores de um lado do lançamento (débitos ou
/// créditos) na mesma proporção que antes; o centavo que sobra do
/// arredondamento vai para a maior partida. Assim o lançamento continua
/// equilibrado mesmo com várias partidas.
fn reescalar(valores: &[i64], novo_total: i64) -> Option<Vec<i64>> {
    let total: i64 = valores.iter().sum();
    if total <= 0 {
        return None;
    }
    let mut novos: Vec<i64> = valores
        .iter()
        .map(|v| ((*v as i128) * (novo_total as i128) / (total as i128)) as i64)
        .collect();
    let sobra = novo_total - novos.iter().sum::<i64>();
    let maior = (0..valores.len()).max_by_key(|&i| (valores[i], std::cmp::Reverse(i)))?;
    novos[maior] += sobra;
    if novos.iter().any(|v| *v <= 0) {
        return None;
    }
    Some(novos)
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct CorrecaoInput {
    pub lancamento_id: String,
    pub nova_data: String,
    /// Novo valor total do lançamento (soma dos débitos), em centavos.
    pub novo_valor_centavos: i64,
    #[serde(default)]
    pub nova_descricao: Option<String>,
}

/// Corrige valor e/ou data de um lançamento sem quebrar a imutabilidade do
/// razão: estorna o original na data dele (o mês original fica zerado, não
/// com um estorno solto em outro mês) e grava um novo, já certo, apontando
/// para o original. Tudo numa transação: ou faz as duas coisas, ou nenhuma.
pub fn corrigir_lancamento(conn: &mut Connection, input: CorrecaoInput) -> Resultado<Lancamento> {
    if chrono::NaiveDate::parse_from_str(&input.nova_data, "%Y-%m-%d").is_err() {
        return Err(AccountingError::DadoInvalido("Data inválida.".into()));
    }
    if input.novo_valor_centavos <= 0 {
        return Err(AccountingError::ValorInvalido);
    }
    let tx = conn.transaction()?;
    let (original, partidas) = carregar_estornavel(&tx, &input.lancamento_id)?;
    if original.origem == "SALDO_INICIAL" {
        return Err(AccountingError::DadoInvalido(
            "O saldo inicial não é corrigido por aqui: ajuste a conta com um lançamento manual.".into(),
        ));
    }
    impedir_correcao_com_vinculo(&tx, &input.lancamento_id)?;

    let valor_atual: i64 = partidas.iter().filter(|p| p.tipo == TipoPartida::Debito).map(|p| p.valor_centavos).sum();
    let descricao = input
        .nova_descricao
        .as_deref()
        .map(str::trim)
        .filter(|d| !d.is_empty())
        .unwrap_or(&original.descricao)
        .to_string();
    if valor_atual == input.novo_valor_centavos && original.data == input.nova_data && descricao == original.descricao {
        return Err(AccountingError::DadoInvalido("Nada mudou: informe outro valor, data ou descrição.".into()));
    }

    let lado = |tipo: TipoPartida| -> Resultado<Vec<i64>> {
        let valores: Vec<i64> = partidas.iter().filter(|p| p.tipo == tipo).map(|p| p.valor_centavos).collect();
        reescalar(&valores, input.novo_valor_centavos)
            .ok_or_else(|| AccountingError::DadoInvalido("Valor pequeno demais para dividir entre as partidas deste lançamento.".into()))
    };
    let mut debitos = lado(TipoPartida::Debito)?.into_iter();
    let mut creditos = lado(TipoPartida::Credito)?.into_iter();
    let novas_partidas = partidas
        .iter()
        .map(|p| PartidaInput {
            conta_id: p.conta_id.clone(),
            tipo: p.tipo,
            valor_centavos: match p.tipo {
                TipoPartida::Debito => debitos.next().expect("um valor por débito"),
                TipoPartida::Credito => creditos.next().expect("um valor por crédito"),
            },
        })
        .collect();

    gravar_estorno(&tx, &input.lancamento_id, &original.descricao, &partidas, original.data.clone())?;
    let novo = NovoLancamentoInput {
        data: input.nova_data,
        descricao,
        observacao: original.observacao,
        origem: original.origem,
        etiqueta: original.etiqueta,
        parcelas: original.parcelas,
        partidas: novas_partidas,
    };
    let corrigido = inserir_lancamento_na_transacao(&tx, &novo, None, Some(&input.lancamento_id))?;
    repontar_vinculos(&tx, &input.lancamento_id, &corrigido.id)?;
    registrar_auditoria(&tx, "CORRIGIR_LANCAMENTO", "lancamento", &input.lancamento_id)?;
    tx.commit()?;
    Ok(corrigido)
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
        let hoje = hoje_brasilia();
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
            parcelas: None,
            partidas,
        };
        inserir_lancamento_na_transacao(&tx, &input_saldo_inicial, None, None)?;
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

/// Dinheiro que dá para gastar agora: bancos, carteiras digitais, dinheiro e benefícios.
/// Fora ficam investimentos, valores a receber e bens (são patrimônio, não saldo).
fn soma_saldo_disponivel(conn: &Connection) -> Resultado<i64> {
    let ids: Vec<String> = {
        let mut stmt = conn.prepare(
            "SELECT id FROM contas_contabeis
             WHERE tipo = 'ATIVO' AND ativa = 1
               AND subtipo IN ('BANCO', 'CARTEIRA_DIGITAL', 'DINHEIRO', 'BENEFICIO')",
        )?;
        let ids = stmt.query_map([], |row| row.get::<_, String>(0))?.collect::<rusqlite::Result<_>>()?;
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
        saldo_disponivel_centavos: soma_saldo_disponivel(conn)?,
        patrimonio_liquido_centavos: total_ativo - total_passivo,
        receitas_mes_centavos: movimento_periodo_por_tipo(conn, TipoConta::Receita, data_inicio, data_fim)?,
        despesas_mes_centavos: movimento_periodo_por_tipo(conn, TipoConta::Despesa, data_inicio, data_fim)?,
    })
}

pub fn listar_lancamentos(conn: &Connection, limite: i64) -> Resultado<Vec<Lancamento>> {
    let mut stmt = conn.prepare(
        "SELECT id, data, descricao, observacao, origem, estornado_de, etiqueta, parcelas, corrige
         FROM lancamentos ORDER BY data DESC, criado_em DESC LIMIT ?1",
    )?;
    let cabecalhos: Vec<CabecalhoLancamento> = stmt
        .query_map([limite], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
                row.get(8)?,
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;
    drop(stmt);
    montar_lancamentos(conn, cabecalhos)
}

/// Um lançamento pelo id (com as partidas), sem carregar o banco inteiro.
pub fn carregar_lancamento(conn: &Connection, lancamento_id: &str) -> Resultado<Option<Lancamento>> {
    let cabecalho: Option<CabecalhoLancamento> = conn
        .query_row(
            "SELECT id, data, descricao, observacao, origem, estornado_de, etiqueta, parcelas, corrige
             FROM lancamentos WHERE id = ?1",
            [lancamento_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                ))
            },
        )
        .optional()?;
    Ok(cabecalho.map(|c| montar_lancamentos(conn, vec![c])).transpose()?.and_then(|mut v| v.pop()))
}

/// Junta as partidas aos cabeçalhos com UMA consulta (em vez de uma por
/// lançamento), mantendo a ordem dos cabeçalhos e a ordem de gravação das partidas.
fn montar_lancamentos(conn: &Connection, cabecalhos: Vec<CabecalhoLancamento>) -> Resultado<Vec<Lancamento>> {
    let ids: Vec<&str> = cabecalhos.iter().map(|c| c.0.as_str()).collect();
    let ids_json = serde_json::to_string(&ids).map_err(|e| AccountingError::DadoInvalido(e.to_string()))?;
    let mut por_lancamento: std::collections::HashMap<String, Vec<Partida>> = std::collections::HashMap::with_capacity(ids.len());
    {
        let mut stmt = conn.prepare_cached(
            "SELECT lancamento_id, id, conta_id, tipo, valor_centavos FROM partidas
             WHERE lancamento_id IN (SELECT value FROM json_each(?1))
             ORDER BY rowid",
        )?;
        let linhas = stmt.query_map([&ids_json], |row| {
            let tipo_str: String = row.get(3)?;
            Ok((
                row.get::<_, String>(0)?,
                Partida {
                    id: row.get(1)?,
                    conta_id: row.get(2)?,
                    tipo: if tipo_str == "DEBITO" { TipoPartida::Debito } else { TipoPartida::Credito },
                    valor_centavos: row.get(4)?,
                },
            ))
        })?;
        for linha in linhas {
            let (lancamento_id, partida) = linha?;
            por_lancamento.entry(lancamento_id).or_default().push(partida);
        }
    }

    let mut resultado = Vec::with_capacity(cabecalhos.len());
    for (id, data, descricao, observacao, origem, estornado_de, etiqueta, parcelas, corrige) in cabecalhos {
        let partidas = por_lancamento.remove(&id).unwrap_or_default();
        resultado.push(Lancamento {
            id,
            data,
            descricao,
            observacao,
            origem,
            etiqueta,
            estornado_de,
            parcelas,
            corrige,
            partidas,
        });
    }

    Ok(resultado)
}

const ETIQUETAS_VALIDAS: [&str; 3] = ["MENSALIDADE", "ASSINATURA", "FIXO"];

/// Maior valor aceito numa partida: R$ 100 bilhões (protege contra valores absurdos e estouro na soma).
pub const VALOR_MAXIMO_CENTAVOS: i64 = 10_000_000_000_000;

/// Validação de entrada do lançamento (lista branca de formato e tamanho).
fn validar_entrada_lancamento(data: &str, descricao: &str, observacao: Option<&str>, partidas: usize) -> Resultado<()> {
    if chrono::NaiveDate::parse_from_str(data, "%Y-%m-%d").is_err() || data.len() != 10 {
        return Err(AccountingError::DadoInvalido(format!("Data inválida: use o formato AAAA-MM-DD (recebido \"{}\").", data.chars().take(20).collect::<String>())));
    }
    if descricao.chars().count() > 300 {
        return Err(AccountingError::DadoInvalido("A descrição pode ter no máximo 300 caracteres.".into()));
    }
    if observacao.is_some_and(|o| o.chars().count() > 5000) {
        return Err(AccountingError::DadoInvalido("A observação pode ter no máximo 5.000 caracteres.".into()));
    }
    if partidas > 500 {
        return Err(AccountingError::DadoInvalido("Um lançamento pode ter no máximo 500 partidas.".into()));
    }
    Ok(())
}

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

/// Próxima data de uma conta recorrente. Mensal/anual partem do dia-âncora (o
/// dia em que a conta foi criada para vencer), limitado ao último dia do mês:
/// 31/01 → 28/02 → 31/03, em vez de ficar presa no dia 28. `None` usa o dia
/// do próprio vencimento.
pub fn proximo_vencimento_ancorado(vencimento: &str, recorrencia: &str, dia_original: Option<u32>) -> Option<String> {
    use chrono::{Datelike, Duration, NaiveDate};
    let data = NaiveDate::parse_from_str(vencimento, "%Y-%m-%d").ok()?;
    let dia = dia_original.filter(|d| (1..=31).contains(d)).unwrap_or(data.day());
    let proxima = match recorrencia {
        "SEMANAL" => data + Duration::days(7),
        "MENSAL" | "ANUAL" => {
            let meses = if recorrencia == "ANUAL" { 12 } else { 1 };
            let total = data.year() * 12 + data.month0() as i32 + meses;
            let (ano, mes) = (total.div_euclid(12), total.rem_euclid(12) as u32 + 1);
            let ultimo = NaiveDate::from_ymd_opt(if mes == 12 { ano + 1 } else { ano }, if mes == 12 { 1 } else { mes + 1 }, 1)?
                .pred_opt()?
                .day();
            NaiveDate::from_ymd_opt(ano, mes, dia.min(ultimo))?
        }
        _ => return None,
    };
    Some(proxima.format("%Y-%m-%d").to_string())
}

fn validar_tipo_agendamento(input: &NovoAgendamentoInput) -> Resultado<TipoConta> {
    match input.tipo.as_str() {
        "PAGAR" => Ok(TipoConta::Despesa),
        "RECEBER" => Ok(TipoConta::Receita),
        _ => Err(AccountingError::DadoInvalido("Tipo de agendamento inválido.".into())),
    }
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
    let tipo_esperado = validar_tipo_agendamento(&input)?;
    if input.automatico && input.conta_id.is_none() {
        return Err(AccountingError::DadoInvalido("Para lançar sozinho, escolha a conta.".into()));
    }
    if let Some(r) = input.reajuste_anual {
        if !(-0.9..=5.0).contains(&r) {
            return Err(AccountingError::DadoInvalido("Reajuste anual fora do esperado.".into()));
        }
    }

    let tx = conn.transaction()?;
    let tipo = conta_existe_e_ativa(&tx, &input.categoria_despesa_id)?;
    if tipo != tipo_esperado {
        return Err(AccountingError::DadoInvalido(if tipo_esperado == TipoConta::Despesa {
            "A categoria precisa ser uma conta de despesa.".into()
        } else {
            "A categoria precisa ser uma conta de receita.".into()
        }));
    }
    if let Some(c) = &input.conta_id {
        conta_existe_e_ativa(&tx, c)?;
    }
    let pessoa = input.pessoa.as_ref().map(|p| p.trim().to_string()).filter(|p| !p.is_empty());

    let id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO agendamentos (id, descricao, valor_centavos, vencimento, categoria_despesa_id, etiqueta, recorrencia,
                                   tipo, automatico, conta_id, reajuste_anual, mes_reajuste, pessoa, dia_original)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, CAST(substr(?4, 9, 2) AS INTEGER))",
        params![
            id,
            input.descricao.trim(),
            input.valor_centavos,
            input.vencimento,
            input.categoria_despesa_id,
            input.etiqueta,
            input.recorrencia,
            input.tipo,
            input.automatico as i64,
            input.conta_id,
            input.reajuste_anual,
            input.mes_reajuste,
            pessoa,
        ],
    )?;
    registrar_auditoria(&tx, "CRIAR_AGENDAMENTO", "agendamento", &id)?;
    tx.commit()?;

    // O gatilho da migração 0017 grava o dia do vencimento como âncora quando ela não vem informada.
    let dia_ancora = input.vencimento.get(8..10).and_then(|d| d.parse::<i32>().ok());
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
        tipo: input.tipo,
        automatico: input.automatico,
        conta_id: input.conta_id,
        reajuste_anual: input.reajuste_anual,
        mes_reajuste: input.mes_reajuste,
        pessoa,
        dia_original: dia_ancora,
    })
}

pub fn listar_agendamentos(conn: &Connection) -> Resultado<Vec<Agendamento>> {
    let mut stmt = conn.prepare(
        "SELECT id, descricao, valor_centavos, vencimento, categoria_despesa_id, etiqueta, lancamento_id, pago_em, recorrencia,
                tipo, automatico, conta_id, reajuste_anual, mes_reajuste, pessoa, dia_original
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
                tipo: row.get(9)?,
                automatico: row.get::<_, i64>(10)? != 0,
                conta_id: row.get(11)?,
                reajuste_anual: row.get(12)?,
                mes_reajuste: row.get(13)?,
                pessoa: row.get(14)?,
                dia_original: row.get(15)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(linhas)
}

/// Paga uma conta agendada: cria o lançamento balanceado (Débito na
/// categoria de despesa, Crédito na conta de origem) e marca o agendamento
/// como pago — tudo numa transação só.
/// Valor da próxima ocorrência, aplicando o reajuste anual quando a nova data cai no mês de reajuste.
pub fn valor_com_reajuste(valor: i64, vencimento_atual: &str, proximo: &str, reajuste: Option<f64>, mes: Option<i32>) -> i64 {
    match (reajuste, mes) {
        (Some(r), Some(m)) => {
            let mes_proximo: i32 = proximo[5..7].parse().unwrap_or(0);
            let mudou_ano = proximo[..4] != vencimento_atual[..4] || vencimento_atual[5..7].parse::<i32>().unwrap_or(0) < m;
            if mes_proximo == m && mudou_ano && proximo[..7] != vencimento_atual[..7] {
                ((valor as f64) * (1.0 + r)).round() as i64
            } else {
                valor
            }
        }
        _ => valor,
    }
}

/// Paga (ou recebe) uma conta agendada: cria o lançamento balanceado e marca
/// o agendamento como pago — tudo numa transação só. A pagar: Débito na
/// categoria de despesa, Crédito na conta. A receber: Débito na conta,
/// Crédito na categoria de receita.
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

    #[allow(clippy::type_complexity)]
    let (descricao, valor, categoria, etiqueta, pago_em, vencimento, recorrencia, tipo, automatico, conta_id, reajuste, mes_reajuste, pessoa, dia_original): (
        String,
        i64,
        String,
        Option<String>,
        Option<String>,
        String,
        Option<String>,
        String,
        i64,
        Option<String>,
        Option<f64>,
        Option<i32>,
        Option<String>,
        Option<u32>,
    ) = tx
        .query_row(
            "SELECT descricao, valor_centavos, categoria_despesa_id, etiqueta, pago_em, vencimento, recorrencia,
                    tipo, automatico, conta_id, reajuste_anual, mes_reajuste, pessoa, dia_original
             FROM agendamentos WHERE id = ?1",
            [agendamento_id],
            |row| {
                Ok((
                    row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?,
                    row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?, row.get(11)?, row.get(12)?, row.get(13)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| AccountingError::AgendamentoNaoEncontrado(agendamento_id.to_string()))?;

    if pago_em.is_some() {
        return Err(AccountingError::AgendamentoJaPago(agendamento_id.to_string()));
    }

    // Dia-âncora: a próxima parte do dia em que a conta foi criada para vencer
    // (31/01 → 28/02 → 31/03), não do vencimento já ajustado ao mês curto.
    let dia_ancora = dia_original.or_else(|| vencimento.get(8..10).and_then(|d| d.parse().ok()));
    let proximo = recorrencia.as_deref().and_then(|r| proximo_vencimento_ancorado(&vencimento, r, dia_ancora));
    let receber = tipo == "RECEBER";
    let input = NovoLancamentoInput {
        data: data_pagamento.to_string(),
        descricao: descricao.clone(),
        observacao: pessoa.as_ref().map(|p| format!("De/para: {p}")),
        origem: if receber { "SALARIO".to_string() } else { "MANUAL".to_string() },
        etiqueta: etiqueta.clone(),
        parcelas: None,
        partidas: if receber {
            vec![
                PartidaInput { conta_id: conta_origem_id.to_string(), tipo: TipoPartida::Debito, valor_centavos: valor },
                PartidaInput { conta_id: categoria.clone(), tipo: TipoPartida::Credito, valor_centavos: valor },
            ]
        } else {
            vec![
                PartidaInput { conta_id: categoria.clone(), tipo: TipoPartida::Debito, valor_centavos: valor },
                PartidaInput { conta_id: conta_origem_id.to_string(), tipo: TipoPartida::Credito, valor_centavos: valor },
            ]
        },
    };
    let lancamento = inserir_lancamento_na_transacao(&tx, &input, None, None)?;

    tx.execute(
        "UPDATE agendamentos SET lancamento_id = ?1, pago_em = ?2 WHERE id = ?3",
        params![lancamento.id, data_pagamento, agendamento_id],
    )?;
    registrar_auditoria(&tx, "PAGAR_AGENDAMENTO", "agendamento", agendamento_id)?;

    // Recorrente: já deixa a próxima agendada (com reajuste anual, se houver).
    // Se a próxima já existe (o pagamento foi estornado e agora é refeito),
    // não cria outra igual.
    let proxima_ja_existe = match (&proximo, &recorrencia) {
        (Some(venc), Some(rec)) => tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM agendamentos WHERE pago_em IS NULL AND descricao = ?1 AND categoria_despesa_id = ?2
                AND tipo = ?3 AND recorrencia = ?4 AND vencimento = ?5)",
            params![descricao, categoria, tipo, rec, venc],
            |row| row.get::<_, bool>(0),
        )?,
        _ => false,
    };
    if let (Some(venc), Some(rec), false) = (proximo, recorrencia, proxima_ja_existe) {
        let novo_valor = valor_com_reajuste(valor, &vencimento, &venc, reajuste, mes_reajuste);
        let novo_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO agendamentos (id, descricao, valor_centavos, vencimento, categoria_despesa_id, etiqueta, recorrencia,
                                       tipo, automatico, conta_id, reajuste_anual, mes_reajuste, pessoa, dia_original)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![novo_id, descricao, novo_valor, venc, categoria, etiqueta, rec, tipo, automatico, conta_id, reajuste, mes_reajuste, pessoa, dia_ancora],
        )?;
        registrar_auditoria(&tx, "CRIAR_AGENDAMENTO", "agendamento", &novo_id)?;
    }
    tx.commit()?;
    Ok(lancamento)
}

/// Lança sozinho os agendamentos automáticos que já venceram. Devolve quantos lançou.
pub fn processar_automaticos(conn: &mut Connection, hoje: &str) -> Resultado<Vec<Lancamento>> {
    let pendentes: Vec<(String, String, String)> = {
        let mut stmt = conn.prepare(
            "SELECT id, conta_id, vencimento FROM agendamentos
             WHERE automatico = 1 AND pago_em IS NULL AND conta_id IS NOT NULL AND vencimento <= ?1
             ORDER BY vencimento",
        )?;
        let v = stmt
            .query_map([hoje], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .collect::<rusqlite::Result<_>>()?;
        v
    };
    let mut feitos = Vec::new();
    for (id, conta, vencimento) in pendentes {
        feitos.push(pagar_agendamento(conn, &id, &conta, &vencimento)?);
    }
    // Um recorrente atrasado gera a próxima ocorrência, que também pode já ter vencido.
    if !feitos.is_empty() {
        feitos.extend(processar_automaticos(conn, hoje)?);
    }
    Ok(feitos)
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
            tipo: "PAGAR".into(),
            automatico: false,
            conta_id: None,
            reajuste_anual: None,
            mes_reajuste: None,
            pessoa: None,
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
mod testes_listagem {
    use super::*;
    use crate::db::{abrir_conexao, executar_migracoes};

    /// A versão antiga (uma consulta de partidas por lançamento), para comparar.
    fn listar_um_a_um(conn: &Connection, limite: i64) -> Vec<Lancamento> {
        let ids: Vec<String> = conn
            .prepare("SELECT id FROM lancamentos ORDER BY data DESC, criado_em DESC LIMIT ?1")
            .unwrap()
            .query_map([limite], |r| r.get(0))
            .unwrap()
            .map(|x| x.unwrap())
            .collect();
        ids.iter()
            .map(|id| {
                let mut l = carregar_lancamento(conn, id).unwrap().unwrap();
                l.partidas = conn
                    .prepare("SELECT id, conta_id, tipo, valor_centavos FROM partidas WHERE lancamento_id = ?1")
                    .unwrap()
                    .query_map([id], |row| {
                        let t: String = row.get(2)?;
                        Ok(Partida {
                            id: row.get(0)?,
                            conta_id: row.get(1)?,
                            tipo: if t == "DEBITO" { TipoPartida::Debito } else { TipoPartida::Credito },
                            valor_centavos: row.get(3)?,
                        })
                    })
                    .unwrap()
                    .map(|x| x.unwrap())
                    .collect();
                l
            })
            .collect()
    }

    #[test]
    fn listagem_com_uma_consulta_e_igual_a_antiga() {
        let mut conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        executar_migracoes(&conn).unwrap();
        for (i, valor) in [1_000, 2_500, 333, 7_700, 12].into_iter().enumerate() {
            let l = criar_lancamento(
                &mut conn,
                NovoLancamentoInput {
                    data: format!("2026-09-{:02}", 10 + i % 3),
                    descricao: format!("Compra {i}"),
                    observacao: None,
                    origem: "MANUAL".into(),
                    etiqueta: None,
                    parcelas: None,
                    partidas: vec![
                        PartidaInput { conta_id: "despesa-alimentacao".into(), tipo: TipoPartida::Debito, valor_centavos: valor },
                        PartidaInput { conta_id: "despesa-outras".into(), tipo: TipoPartida::Debito, valor_centavos: 1 },
                        PartidaInput { conta_id: "ativo-dinheiro".into(), tipo: TipoPartida::Credito, valor_centavos: valor + 1 },
                    ],
                },
            )
            .unwrap();
            if i == 2 {
                estornar_lancamento(&mut conn, &l.id).unwrap();
            }
        }
        for limite in [0, 1, 3, 100, i64::MAX] {
            let nova = serde_json::to_value(listar_lancamentos(&conn, limite).unwrap()).unwrap();
            let antiga = serde_json::to_value(listar_um_a_um(&conn, limite)).unwrap();
            assert_eq!(nova, antiga, "limite {limite}");
        }
        assert_eq!(listar_lancamentos(&conn, 100).unwrap().len(), 6);
        assert!(listar_lancamentos(&conn, 100).unwrap().iter().all(|l| l.partidas.len() == 3));
        assert!(carregar_lancamento(&conn, "nao-existe").unwrap().is_none());
    }
}

#[cfg(test)]
mod testes_estorno_vinculos {
    use super::*;
    use crate::db::{abrir_conexao, executar_migracoes};

    fn banco() -> Connection {
        let conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        executar_migracoes(&conn).unwrap();
        conn
    }

    fn aluguel(conn: &mut Connection, recorrencia: Option<&str>, automatico: bool) -> Agendamento {
        criar_agendamento(
            conn,
            NovoAgendamentoInput {
                descricao: "Aluguel".into(),
                valor_centavos: 150_000,
                vencimento: "2026-10-05".into(),
                categoria_despesa_id: "despesa-moradia".into(),
                etiqueta: None,
                recorrencia: recorrencia.map(String::from),
                tipo: "PAGAR".into(),
                automatico,
                conta_id: Some("ativo-dinheiro".into()),
                reajuste_anual: None,
                mes_reajuste: None,
                pessoa: None,
            },
        )
        .unwrap()
    }

    #[test]
    fn estornar_pagamento_reabre_a_conta_agendada_e_devolve_o_saldo() {
        let mut conn = banco();
        let ag = aluguel(&mut conn, None, false);
        let lanc = pagar_agendamento(&mut conn, &ag.id, "ativo-dinheiro", "2026-10-05").unwrap();
        assert_eq!(saldo_conta(&conn, "ativo-dinheiro").unwrap(), -150_000);

        estornar_lancamento(&mut conn, &lanc.id).unwrap();
        assert_eq!(saldo_conta(&conn, "ativo-dinheiro").unwrap(), 0);
        assert_eq!(saldo_conta(&conn, "despesa-moradia").unwrap(), 0);
        let todos = listar_agendamentos(&conn).unwrap();
        assert_eq!(todos.len(), 1);
        assert!(todos[0].pago_em.is_none(), "a conta volta a aparecer em aberto");
        assert!(todos[0].lancamento_id.is_none());

        // E pode ser paga de novo.
        pagar_agendamento(&mut conn, &ag.id, "ativo-dinheiro", "2026-10-06").unwrap();
        assert_eq!(saldo_conta(&conn, "ativo-dinheiro").unwrap(), -150_000);
    }

    #[test]
    fn refazer_pagamento_recorrente_nao_duplica_a_proxima() {
        let mut conn = banco();
        let ag = aluguel(&mut conn, Some("MENSAL"), false);
        let lanc = pagar_agendamento(&mut conn, &ag.id, "ativo-dinheiro", "2026-10-05").unwrap();
        estornar_lancamento(&mut conn, &lanc.id).unwrap();
        let abertos = |conn: &Connection| -> Vec<String> {
            listar_agendamentos(conn).unwrap().into_iter().filter(|a| a.pago_em.is_none()).map(|a| a.vencimento).collect()
        };
        assert_eq!(abertos(&conn), vec!["2026-10-05".to_string(), "2026-11-05".to_string()]);

        pagar_agendamento(&mut conn, &ag.id, "ativo-dinheiro", "2026-10-05").unwrap();
        assert_eq!(listar_agendamentos(&conn).unwrap().len(), 2);
        assert_eq!(abertos(&conn), vec!["2026-11-05".to_string()]);
    }

    #[test]
    fn estorno_de_automatico_nao_e_lancado_de_novo_sozinho() {
        let mut conn = banco();
        aluguel(&mut conn, None, true);
        let feitos = processar_automaticos(&mut conn, "2026-10-10").unwrap();
        assert_eq!(feitos.len(), 1);
        estornar_lancamento(&mut conn, &feitos[0].id).unwrap();

        assert!(processar_automaticos(&mut conn, "2026-10-10").unwrap().is_empty());
        assert_eq!(saldo_conta(&conn, "ativo-dinheiro").unwrap(), 0);
        let ag = &listar_agendamentos(&conn).unwrap()[0];
        assert!(ag.pago_em.is_none());
        assert!(!ag.automatico);
    }

    #[test]
    fn correcao_leva_o_vinculo_para_o_lancamento_novo() {
        let mut conn = banco();
        let ag = aluguel(&mut conn, None, false);
        let lanc = pagar_agendamento(&mut conn, &ag.id, "ativo-dinheiro", "2026-10-05").unwrap();
        let novo = corrigir_lancamento(
            &mut conn,
            CorrecaoInput { lancamento_id: lanc.id, nova_data: "2026-10-05".into(), novo_valor_centavos: 140_000, nova_descricao: None },
        )
        .unwrap();
        let pago = &listar_agendamentos(&conn).unwrap()[0];
        assert_eq!(pago.lancamento_id.as_deref(), Some(novo.id.as_str()));
        assert!(pago.pago_em.is_some(), "corrigir não reabre a conta");

        estornar_lancamento(&mut conn, &novo.id).unwrap();
        assert!(listar_agendamentos(&conn).unwrap()[0].pago_em.is_none());
        assert_eq!(saldo_conta(&conn, "ativo-dinheiro").unwrap(), 0);
    }
}

#[cfg(test)]
mod testes_recorrencia {
    use super::*;

    #[test]
    fn proximo_vencimento_respeita_fim_de_mes_e_virada_de_ano() {
        assert_eq!(proximo_vencimento_ancorado("2026-01-31", "MENSAL", None).as_deref(), Some("2026-02-28"));
        assert_eq!(proximo_vencimento_ancorado("2028-01-31", "MENSAL", None).as_deref(), Some("2028-02-29"));
        assert_eq!(proximo_vencimento_ancorado("2026-12-15", "MENSAL", None).as_deref(), Some("2027-01-15"));
        assert_eq!(proximo_vencimento_ancorado("2026-10-10", "SEMANAL", None).as_deref(), Some("2026-10-17"));
        assert_eq!(proximo_vencimento_ancorado("2028-02-29", "ANUAL", None).as_deref(), Some("2029-02-28"));
        assert_eq!(proximo_vencimento_ancorado("2026-10-10", "QUINZENAL", None), None);
    }

    #[test]
    fn dia_ancora_volta_ao_dia_original_depois_do_mes_curto() {
        assert_eq!(proximo_vencimento_ancorado("2026-02-28", "MENSAL", Some(31)).as_deref(), Some("2026-03-31"));
        assert_eq!(proximo_vencimento_ancorado("2026-03-31", "MENSAL", Some(31)).as_deref(), Some("2026-04-30"));
        assert_eq!(proximo_vencimento_ancorado("2026-04-30", "MENSAL", Some(31)).as_deref(), Some("2026-05-31"));
        assert_eq!(proximo_vencimento_ancorado("2029-02-28", "ANUAL", Some(29)).as_deref(), Some("2030-02-28"));
        assert_eq!(proximo_vencimento_ancorado("2031-02-28", "ANUAL", Some(29)).as_deref(), Some("2032-02-29"));
        assert_eq!(proximo_vencimento_ancorado("2026-10-10", "SEMANAL", Some(31)).as_deref(), Some("2026-10-17"));
        // Sem âncora (ou âncora inválida), vale o dia do vencimento — o comportamento antigo.
        assert_eq!(proximo_vencimento_ancorado("2026-02-28", "MENSAL", None).as_deref(), Some("2026-03-28"));
        assert_eq!(proximo_vencimento_ancorado("2026-02-28", "MENSAL", Some(0)).as_deref(), Some("2026-03-28"));
    }

    #[test]
    fn conta_do_dia_31_volta_ao_31_depois_de_fevereiro() {
        use crate::db::{abrir_conexao, executar_migracoes};
        let mut conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        executar_migracoes(&conn).unwrap();
        criar_agendamento(
            &mut conn,
            NovoAgendamentoInput {
                descricao: "Condomínio".into(),
                valor_centavos: 50_000,
                vencimento: "2027-01-31".into(),
                categoria_despesa_id: "despesa-moradia".into(),
                etiqueta: None,
                recorrencia: Some("MENSAL".into()),
                tipo: "PAGAR".into(),
                automatico: true,
                conta_id: Some("ativo-dinheiro".into()),
                reajuste_anual: None,
                mes_reajuste: None,
                pessoa: None,
            },
        )
        .unwrap();
        let feitos = processar_automaticos(&mut conn, "2027-05-01").unwrap();
        let datas: Vec<&str> = feitos.iter().map(|l| l.data.as_str()).collect();
        assert_eq!(datas, vec!["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
        let aberto = listar_agendamentos(&conn).unwrap().into_iter().find(|a| a.pago_em.is_none()).unwrap();
        assert_eq!(aberto.vencimento, "2027-05-31");
    }

    #[test]
    fn dia_ancora_no_banco_ao_criar_e_ao_editar() {
        use crate::db::{abrir_conexao, executar_migracoes};
        let conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        executar_migracoes(&conn).unwrap();
        let dia = |conn: &Connection| -> Option<i64> {
            conn.query_row("SELECT dia_original FROM agendamentos WHERE id = 'a'", [], |r| r.get(0)).unwrap()
        };
        // Quem grava sem informar o dia (código antigo, importação) fica com o dia do vencimento.
        conn.execute(
            "INSERT INTO agendamentos (id, descricao, valor_centavos, vencimento, categoria_despesa_id, recorrencia)
             VALUES ('a', 'Luz', 100, '2026-01-30', 'despesa-moradia', 'MENSAL')",
            [],
        )
        .unwrap();
        assert_eq!(dia(&conn), Some(30));
        // Editar sem mudar a data mantém a âncora; mudar a data troca.
        conn.execute("UPDATE agendamentos SET dia_original = 31 WHERE id = 'a'", []).unwrap();
        conn.execute("UPDATE agendamentos SET vencimento = '2026-01-30', valor_centavos = 200 WHERE id = 'a'", []).unwrap();
        assert_eq!(dia(&conn), Some(31));
        conn.execute("UPDATE agendamentos SET vencimento = '2026-01-15' WHERE id = 'a'", []).unwrap();
        assert_eq!(dia(&conn), Some(15));
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
                tipo: "PAGAR".into(),
                automatico: false,
                conta_id: None,
                reajuste_anual: None,
                mes_reajuste: None,
                pessoa: None,
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

#[cfg(test)]
mod testes_correcao_e_parcelas {
    use super::*;
    use crate::db::{abrir_conexao, executar_migracoes};

    fn banco() -> Connection {
        let conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        executar_migracoes(&conn).unwrap();
        conn
    }

    fn despesa(conn: &mut Connection, valor: i64, data: &str) -> Lancamento {
        criar_lancamento(
            conn,
            NovoLancamentoInput {
                data: data.into(),
                descricao: "Mercado".into(),
                observacao: Some("feira".into()),
                origem: "MANUAL".into(),
                etiqueta: None,
                parcelas: None,
                partidas: vec![
                    PartidaInput { conta_id: "despesa-alimentacao".into(), tipo: TipoPartida::Debito, valor_centavos: valor },
                    PartidaInput { conta_id: "ativo-dinheiro".into(), tipo: TipoPartida::Credito, valor_centavos: valor },
                ],
            },
        )
        .unwrap()
    }

    fn cartao(conn: &mut Connection) -> Conta {
        criar_conta(
            conn,
            NovaContaInput {
                codigo: "2.1.9".into(),
                nome: "Nubank".into(),
                tipo: TipoConta::Passivo,
                subtipo: Some("CARTAO_CREDITO".into()),
                categoria_pai_id: None,
                instituicao: None,
                saldo_inicial_centavos: 0,
                dia_fechamento_fatura: Some(5),
                dia_vencimento_fatura: Some(12),
                limite_centavos: Some(500_000),
            },
        )
        .unwrap()
    }

    #[test]
    fn corrigir_estorna_na_data_original_e_relanca() {
        let mut conn = banco();
        let l = despesa(&mut conn, 5000, "2026-09-10");
        let novo = corrigir_lancamento(
            &mut conn,
            CorrecaoInput { lancamento_id: l.id.clone(), nova_data: "2026-09-12".into(), novo_valor_centavos: 4200, nova_descricao: None },
        )
        .unwrap();

        assert_eq!(novo.corrige.as_deref(), Some(l.id.as_str()));
        assert_eq!(novo.data, "2026-09-12");
        assert_eq!(novo.observacao.as_deref(), Some("feira"));
        assert!(novo.partidas.iter().all(|p| p.valor_centavos == 4200));
        assert_eq!(saldo_conta(&conn, "ativo-dinheiro").unwrap(), -4200);
        let todos = listar_lancamentos(&conn, 10).unwrap();
        let estorno = todos.iter().find(|x| x.estornado_de.as_deref() == Some(l.id.as_str())).unwrap();
        assert_eq!(estorno.data, "2026-09-10");
        // O original não pode ser corrigido de novo (já foi estornado).
        assert!(corrigir_lancamento(
            &mut conn,
            CorrecaoInput { lancamento_id: l.id, nova_data: "2026-09-12".into(), novo_valor_centavos: 100, nova_descricao: None },
        )
        .is_err());
    }

    #[test]
    fn corrigir_sem_mudanca_e_rejeitado() {
        let mut conn = banco();
        let l = despesa(&mut conn, 5000, "2026-09-10");
        assert!(corrigir_lancamento(
            &mut conn,
            CorrecaoInput { lancamento_id: l.id, nova_data: "2026-09-10".into(), novo_valor_centavos: 5000, nova_descricao: None },
        )
        .is_err());
        assert_eq!(listar_lancamentos(&conn, 10).unwrap().len(), 1);
    }

    #[test]
    fn reescalar_mantem_proporcao_e_total() {
        assert_eq!(reescalar(&[3000, 1000], 2000), Some(vec![1500, 500]));
        assert_eq!(reescalar(&[1, 1, 1], 100), Some(vec![34, 33, 33]));
        assert_eq!(reescalar(&[9000, 1], 100), None);
    }

    #[test]
    fn parcelamento_ocupa_o_limite_inteiro_e_so_vale_no_cartao() {
        let mut conn = banco();
        let c = cartao(&mut conn);
        let compra = criar_lancamento(
            &mut conn,
            NovoLancamentoInput {
                data: "2026-09-20".into(),
                descricao: "Notebook".into(),
                observacao: None,
                origem: "CARTAO".into(),
                etiqueta: None,
                parcelas: Some(10),
                partidas: vec![
                    PartidaInput { conta_id: "despesa-outras".into(), tipo: TipoPartida::Debito, valor_centavos: 300_000 },
                    PartidaInput { conta_id: c.id.clone(), tipo: TipoPartida::Credito, valor_centavos: 300_000 },
                ],
            },
        )
        .unwrap();
        assert_eq!(compra.parcelas, Some(10));
        assert_eq!(saldo_conta(&conn, &c.id).unwrap(), 300_000);
        assert_eq!(listar_lancamentos(&conn, 1).unwrap()[0].parcelas, Some(10));

        let no_dinheiro = criar_lancamento(
            &mut conn,
            NovoLancamentoInput {
                data: "2026-09-20".into(),
                descricao: "TV".into(),
                observacao: None,
                origem: "MANUAL".into(),
                etiqueta: None,
                parcelas: Some(3),
                partidas: vec![
                    PartidaInput { conta_id: "despesa-outras".into(), tipo: TipoPartida::Debito, valor_centavos: 1000 },
                    PartidaInput { conta_id: "ativo-dinheiro".into(), tipo: TipoPartida::Credito, valor_centavos: 1000 },
                ],
            },
        );
        assert!(no_dinheiro.is_err());
    }
}

#[cfg(test)]
mod testes_receitas_automaticas {
    use super::*;
    use crate::db::{abrir_conexao, executar_migracoes};

    fn salario(automatico: bool) -> NovoAgendamentoInput {
        NovoAgendamentoInput {
            descricao: "Salário".into(),
            valor_centavos: 300_000,
            vencimento: "2026-09-05".into(),
            categoria_despesa_id: "receita-salario".into(),
            etiqueta: None,
            recorrencia: Some("MENSAL".into()),
            tipo: "RECEBER".into(),
            automatico,
            conta_id: Some("ativo-dinheiro".into()),
            reajuste_anual: None,
            mes_reajuste: None,
            pessoa: None,
        }
    }

    #[test]
    fn receita_agendada_credita_a_conta() {
        let mut conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        executar_migracoes(&conn).unwrap();
        let ag = criar_agendamento(&mut conn, salario(false)).unwrap();
        pagar_agendamento(&mut conn, &ag.id, "ativo-dinheiro", "2026-09-05").unwrap();
        assert_eq!(saldo_conta(&conn, "ativo-dinheiro").unwrap(), 300_000);
        assert_eq!(saldo_conta(&conn, "receita-salario").unwrap(), 300_000);
        // Receita com categoria de despesa é recusada.
        let mut errado = salario(false);
        errado.categoria_despesa_id = "despesa-outras".into();
        assert!(criar_agendamento(&mut conn, errado).is_err());
    }

    #[test]
    fn automatico_lanca_os_meses_atrasados_sozinho() {
        let mut conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        executar_migracoes(&conn).unwrap();
        criar_agendamento(&mut conn, salario(true)).unwrap();
        let feitos = processar_automaticos(&mut conn, "2026-11-10").unwrap();
        assert_eq!(feitos.len(), 3); // set, out, nov
        assert_eq!(saldo_conta(&conn, "ativo-dinheiro").unwrap(), 900_000);
        let abertos: Vec<_> = listar_agendamentos(&conn).unwrap().into_iter().filter(|a| a.pago_em.is_none()).collect();
        assert_eq!(abertos.len(), 1);
        assert_eq!(abertos[0].vencimento, "2026-12-05");
        assert!(processar_automaticos(&mut conn, "2026-11-10").unwrap().is_empty());
    }

    #[test]
    fn reajuste_anual_no_mes_certo() {
        assert_eq!(valor_com_reajuste(100_000, "2026-12-10", "2027-01-10", Some(0.08), Some(1)), 108_000);
        assert_eq!(valor_com_reajuste(100_000, "2027-01-10", "2027-02-10", Some(0.08), Some(1)), 100_000);
        assert_eq!(valor_com_reajuste(100_000, "2026-11-10", "2026-12-10", None, None), 100_000);
    }
}

#[cfg(test)]
mod testes_validacao_entrada {
    use super::*;

    #[test]
    fn recusa_data_texto_ou_partidas_fora_do_formato() {
        assert!(validar_entrada_lancamento("2026-10-03", "Mercado", None, 2).is_ok());
        assert!(validar_entrada_lancamento("2026-13-40", "x", None, 2).is_err());
        assert!(validar_entrada_lancamento("2026-10-03'; DROP TABLE lancamentos;--", "x", None, 2).is_err());
        assert!(validar_entrada_lancamento("2026-10-03", &"a".repeat(301), None, 2).is_err());
        assert!(validar_entrada_lancamento("2026-10-03", "x", Some(&"a".repeat(5001)), 2).is_err());
        assert!(validar_entrada_lancamento("2026-10-03", "x", None, 501).is_err());
    }
}

#[cfg(test)]
mod testes_data_e_saldo_disponivel {
    use super::*;
    use crate::db::{abrir_conexao, executar_migracoes};
    use chrono::TimeZone;

    #[test]
    fn data_de_brasilia_nao_pula_para_o_dia_seguinte_a_noite() {
        // 23h48 em Brasília já é 02h48 do dia seguinte em UTC.
        let noite = Utc.with_ymd_and_hms(2026, 10, 8, 2, 48, 0).unwrap();
        assert_eq!(data_em_brasilia(noite), "2026-10-07");
        let manha = Utc.with_ymd_and_hms(2026, 10, 8, 3, 0, 0).unwrap();
        assert_eq!(data_em_brasilia(manha), "2026-10-08");
        let virada = Utc.with_ymd_and_hms(2027, 1, 1, 1, 0, 0).unwrap();
        assert_eq!(data_em_brasilia(virada), "2026-12-31");
    }

    #[test]
    fn saldo_disponivel_nao_inclui_investimentos_nem_valores_a_receber() {
        let mut conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        executar_migracoes(&conn).unwrap();
        let nova = |codigo: &str, nome: &str, subtipo: &str, saldo: i64| NovaContaInput {
            codigo: codigo.into(),
            nome: nome.into(),
            tipo: TipoConta::Ativo,
            subtipo: Some(subtipo.into()),
            categoria_pai_id: None,
            instituicao: None,
            saldo_inicial_centavos: saldo,
            dia_fechamento_fatura: None,
            dia_vencimento_fatura: None,
            limite_centavos: None,
        };
        criar_conta(&mut conn, nova("1.9.1", "Banco", "BANCO", 100_000)).unwrap();
        criar_conta(&mut conn, nova("1.9.2", "Corretora", "INVESTIMENTO", 900_000)).unwrap();
        let r = resumo_dashboard(&conn, "2026-10-01", "2026-10-31").unwrap();
        assert_eq!(r.saldo_disponivel_centavos, 100_000);
        // O patrimônio continua somando tudo.
        assert_eq!(r.patrimonio_liquido_centavos, 1_000_000);
    }
}
