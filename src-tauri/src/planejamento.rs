//! Planejamento: orçamento por mês e sobra acumulada, metas ligadas a contas
//! reais, empréstimos/financiamentos (Price e SAC) e valores a receber de pessoas.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::accounting::engine;
use crate::accounting::models::{Lancamento, NovoLancamentoInput, PartidaInput, TipoPartida};
use crate::commands::AppState;

type Res<T> = Result<T, String>;
const A_RECEBER: &str = "ativo-a-receber";
const JUROS: &str = "despesa-juros-emprestimos";

fn e<T: std::fmt::Display>(erro: T) -> String {
    erro.to_string()
}

fn data_ok(d: &str) -> Res<()> {
    chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").map(|_| ()).map_err(|_| "Data inválida.".into())
}

fn mes_ok(m: &str) -> Res<()> {
    chrono::NaiveDate::parse_from_str(&format!("{m}-01"), "%Y-%m-%d").map(|_| ()).map_err(|_| "Mês inválido (use AAAA-MM).".into())
}

fn p(conta: &str, tipo: TipoPartida, v: i64) -> PartidaInput {
    PartidaInput { conta_id: conta.to_string(), tipo, valor_centavos: v }
}

fn lancar(conn: &mut Connection, data: &str, descricao: String, origem: &str, partidas: Vec<PartidaInput>) -> Res<Lancamento> {
    engine::criar_lancamento(
        conn,
        NovoLancamentoInput {
            data: data.to_string(),
            descricao,
            observacao: None,
            origem: origem.to_string(),
            etiqueta: None,
            parcelas: None,
            partidas: partidas.into_iter().filter(|x| x.valor_centavos > 0).collect(),
        },
    )
    .map_err(String::from)
}

// ---------------------------------------------------------------------------
// Orçamento por mês e sobra acumulada

#[derive(Serialize)]
pub struct LimiteMes {
    pub categoria_id: String,
    pub mes: String,
    pub limite_centavos: i64,
}

#[tauri::command]
pub fn listar_orcamentos_mes(state: State<AppState>) -> Res<Vec<LimiteMes>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn.prepare("SELECT categoria_id, mes, limite_centavos FROM orcamentos_mes ORDER BY mes").map_err(e)?;
    let v = stmt
        .query_map([], |r| Ok(LimiteMes { categoria_id: r.get(0)?, mes: r.get(1)?, limite_centavos: r.get(2)? }))
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(v)
}

/// Limite só para um mês (`None` volta a usar o limite normal).
#[tauri::command]
pub fn definir_orcamento_mes(state: State<AppState>, categoria_id: String, mes: String, limite_centavos: Option<i64>) -> Res<()> {
    mes_ok(&mes)?;
    let conn = state.conn.lock().expect("mutex envenenado");
    match limite_centavos {
        Some(l) if l >= 0 => conn
            .execute(
                "INSERT INTO orcamentos_mes (categoria_id, mes, limite_centavos) VALUES (?1, ?2, ?3)
                 ON CONFLICT(categoria_id, mes) DO UPDATE SET limite_centavos = excluded.limite_centavos",
                params![categoria_id, mes, l],
            )
            .map_err(e)?,
        _ => conn.execute("DELETE FROM orcamentos_mes WHERE categoria_id = ?1 AND mes = ?2", params![categoria_id, mes]).map_err(e)?,
    };
    Ok(())
}

/// Liga/desliga a sobra que passa para o mês seguinte, contando a partir de `desde` (AAAA-MM).
#[tauri::command]
pub fn definir_acumulo_orcamento(state: State<AppState>, categoria_id: String, acumular: bool, desde: Option<String>) -> Res<()> {
    if let Some(d) = &desde {
        mes_ok(d)?;
    }
    let conn = state.conn.lock().expect("mutex envenenado");
    let n = conn
        .execute("UPDATE orcamentos SET acumular = ?1, acumular_desde = ?2 WHERE categoria_id = ?3", params![acumular as i64, desde, categoria_id])
        .map_err(e)?;
    if n == 0 {
        return Err("Defina primeiro um limite para esta categoria.".into());
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Metas ligadas a contas reais

#[tauri::command]
pub fn vincular_meta_conta(state: State<AppState>, meta_id: String, conta_id: Option<String>) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    if let Some(c) = &conta_id {
        let ok: bool = conn
            .query_row("SELECT EXISTS(SELECT 1 FROM contas_contabeis WHERE id = ?1 AND tipo = 'ATIVO' AND subtipo IS NOT 'CATEGORIA')", [c], |r| r.get(0))
            .map_err(e)?;
        if !ok {
            return Err("A meta só pode ser ligada a uma conta (banco, poupança, carteira).".into());
        }
    }
    let n = conn.execute("UPDATE metas SET conta_id = ?1 WHERE id = ?2", params![conta_id, meta_id]).map_err(e)?;
    if n == 0 {
        return Err("Meta não encontrada.".into());
    }
    Ok(())
}

/// Aporte (ou retirada, com valor negativo) que move dinheiro de verdade:
/// transfere da `conta_origem_id` para a conta da meta (ou o contrário).
pub fn aportar_com_conta(conn: &mut Connection, meta_id: &str, valor: i64, data: &str, conta_origem_id: &str) -> Res<Lancamento> {
    data_ok(data)?;
    if valor == 0 {
        return Err("Informe um valor diferente de zero.".into());
    }
    let (nome, conta_meta): (String, Option<String>) = conn
        .query_row("SELECT nome, conta_id FROM metas WHERE id = ?1", [meta_id], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()
        .map_err(e)?
        .ok_or("Meta não encontrada.")?;
    let conta_meta = conta_meta.ok_or("Ligue a meta a uma conta para aportar tirando dinheiro de outra conta.")?;
    if conta_meta == conta_origem_id {
        return Err("A conta de origem é a própria conta da meta.".into());
    }
    let (debito, credito, texto) = if valor > 0 {
        (conta_meta.as_str(), conta_origem_id, format!("Aporte na meta {nome}"))
    } else {
        (conta_origem_id, conta_meta.as_str(), format!("Retirada da meta {nome}"))
    };
    let v = valor.abs();
    let lanc = lancar(conn, data, texto, "TRANSFERENCIA", vec![p(debito, TipoPartida::Debito, v), p(credito, TipoPartida::Credito, v)])?;
    conn.execute(
        "INSERT INTO metas_aportes (id, meta_id, valor_centavos, data, lancamento_id) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![Uuid::new_v4().to_string(), meta_id, valor, data, lanc.id],
    )
    .map_err(e)?;
    Ok(lanc)
}

#[tauri::command]
pub fn aportar_meta_com_conta(state: State<AppState>, meta_id: String, valor_centavos: i64, data: String, conta_origem_id: String) -> Res<Lancamento> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    aportar_com_conta(&mut conn, &meta_id, valor_centavos, &data, &conta_origem_id)
}

#[tauri::command]
pub fn vincular_radar_meta(state: State<AppState>, item_id: String, meta_id: Option<String>) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    conn.execute("UPDATE radar_itens SET meta_id = ?1 WHERE id = ?2", params![meta_id, item_id]).map_err(e)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Empréstimos e financiamentos

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct ParcelaTabela {
    pub numero: i64,
    pub vencimento: String,
    pub parcela: i64,
    pub juros: i64,
    pub amortizacao: i64,
    pub saldo_depois: i64,
}

fn somar_meses(data: &str, meses: i64) -> String {
    use chrono::{Datelike, NaiveDate};
    let d = NaiveDate::parse_from_str(data, "%Y-%m-%d").expect("data validada");
    let total = d.year() as i64 * 12 + d.month0() as i64 + meses;
    let (ano, mes) = ((total / 12) as i32, (total % 12) as u32 + 1);
    let ultimo = NaiveDate::from_ymd_opt(if mes == 12 { ano + 1 } else { ano }, if mes == 12 { 1 } else { mes + 1 }, 1)
        .and_then(|x| x.pred_opt())
        .map(|x| x.day())
        .unwrap_or(28);
    NaiveDate::from_ymd_opt(ano, mes, d.day().min(ultimo)).expect("data válida").format("%Y-%m-%d").to_string()
}

/// Tabela de parcelas: Price (parcelas iguais) ou SAC (amortização constante).
pub fn tabela(sistema: &str, principal: i64, taxa: f64, n: i64, primeiro: &str) -> Vec<ParcelaTabela> {
    let mut saldo = principal;
    let pmt = if taxa > 0.0 {
        (principal as f64 * taxa / (1.0 - (1.0 + taxa).powi(-(n as i32)))).round() as i64
    } else {
        (principal as f64 / n as f64).round() as i64
    };
    let amort_sac = (principal as f64 / n as f64).round() as i64;
    (1..=n)
        .map(|k| {
            let juros = (saldo as f64 * taxa).round() as i64;
            let mut amortizacao = if sistema == "SAC" { amort_sac } else { pmt - juros };
            if k == n || amortizacao > saldo {
                amortizacao = saldo;
            }
            saldo -= amortizacao;
            ParcelaTabela { numero: k, vencimento: somar_meses(primeiro, k - 1), parcela: juros + amortizacao, juros, amortizacao, saldo_depois: saldo }
        })
        .collect()
}

#[derive(Serialize)]
pub struct Emprestimo {
    pub id: String,
    pub nome: String,
    pub sistema: String,
    pub principal_centavos: i64,
    pub taxa_mensal: f64,
    pub parcelas: i64,
    pub primeiro_vencimento: String,
    pub conta_passivo_id: String,
    pub saldo_devedor_centavos: i64,
    pub pagas: Vec<i64>,
    pub tabela: Vec<ParcelaTabela>,
}

#[derive(Deserialize)]
pub struct EmprestimoInput {
    pub nome: String,
    pub sistema: String,
    pub principal_centavos: i64,
    pub taxa_mensal: f64,
    pub parcelas: i64,
    pub primeiro_vencimento: String,
    /// Conta onde o dinheiro entrou. `None` = dívida que já existia (entra no patrimônio).
    #[serde(default)]
    pub conta_destino_id: Option<String>,
    #[serde(default)]
    pub data_contratacao: Option<String>,
}

pub fn criar(conn: &mut Connection, input: EmprestimoInput) -> Res<String> {
    let nome = input.nome.trim().to_string();
    if nome.is_empty() {
        return Err("Dê um nome ao empréstimo (ex.: Financiamento do carro).".into());
    }
    if input.sistema != "PRICE" && input.sistema != "SAC" {
        return Err("Sistema de amortização inválido.".into());
    }
    if input.principal_centavos <= 0 || !(1..=600).contains(&input.parcelas) || !(0.0..1.0).contains(&input.taxa_mensal) {
        return Err("Confira o valor, a taxa ao mês e o número de parcelas.".into());
    }
    data_ok(&input.primeiro_vencimento)?;
    let contratacao = input.data_contratacao.clone().unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
    data_ok(&contratacao)?;
    let sufixo = Uuid::new_v4().simple().to_string()[..8].to_string();
    let conta_id = format!("emp-{sufixo}");
    conn.execute(
        "INSERT INTO contas_contabeis (id, codigo, nome, tipo, subtipo, categoria_pai_id, sistema) VALUES (?1, ?2, ?3, 'PASSIVO', 'EMPRESTIMO', 'passivo-emprestimos', 0)",
        params![conta_id, format!("2.3.{sufixo}"), nome],
    )
    .map_err(e)?;
    let (debito, origem) = match &input.conta_destino_id {
        Some(c) => (c.as_str(), "MANUAL"),
        None => ("patrimonio-saldo-inicial", "SALDO_INICIAL"),
    };
    lancar(
        conn,
        &contratacao,
        format!("Contratação: {nome}"),
        origem,
        vec![p(debito, TipoPartida::Debito, input.principal_centavos), p(&conta_id, TipoPartida::Credito, input.principal_centavos)],
    )?;
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO emprestimos (id, nome, sistema, principal_centavos, taxa_mensal, parcelas, primeiro_vencimento, conta_passivo_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, nome, input.sistema, input.principal_centavos, input.taxa_mensal, input.parcelas, input.primeiro_vencimento, conta_id],
    )
    .map_err(e)?;
    Ok(id)
}

#[tauri::command]
pub fn criar_emprestimo(state: State<AppState>, input: EmprestimoInput) -> Res<String> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    criar(&mut conn, input)
}

pub fn listar(conn: &Connection) -> Res<Vec<Emprestimo>> {
    let mut stmt = conn
        .prepare("SELECT id, nome, sistema, principal_centavos, taxa_mensal, parcelas, primeiro_vencimento, conta_passivo_id FROM emprestimos ORDER BY criado_em")
        .map_err(e)?;
    let linhas: Vec<(String, String, String, i64, f64, i64, String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?)))
        .map_err(e)?
        .collect::<rusqlite::Result<_>>()
        .map_err(e)?;
    linhas
        .into_iter()
        .map(|(id, nome, sistema, principal, taxa, n, primeiro, conta)| {
            let mut s = conn.prepare("SELECT numero FROM emprestimo_parcelas WHERE emprestimo_id = ?1 ORDER BY numero").map_err(e)?;
            let pagas = s.query_map([&id], |r| r.get(0)).map_err(e)?.collect::<rusqlite::Result<Vec<i64>>>().map_err(e)?;
            Ok(Emprestimo {
                saldo_devedor_centavos: engine::saldo_conta(conn, &conta).map_err(String::from)?,
                tabela: tabela(&sistema, principal, taxa, n, &primeiro),
                id,
                nome,
                sistema,
                principal_centavos: principal,
                taxa_mensal: taxa,
                parcelas: n,
                primeiro_vencimento: primeiro,
                conta_passivo_id: conta,
                pagas,
            })
        })
        .collect()
}

#[tauri::command]
pub fn listar_emprestimos(state: State<AppState>) -> Res<Vec<Emprestimo>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    listar(&conn)
}

/// Paga a próxima parcela: amortização reduz a dívida e os juros viram despesa.
pub fn pagar_parcela(conn: &mut Connection, emprestimo_id: &str, conta_id: &str, data: &str) -> Res<Lancamento> {
    data_ok(data)?;
    let emp = listar(conn)?.into_iter().find(|x| x.id == emprestimo_id).ok_or("Empréstimo não encontrado.")?;
    let proxima = (1..=emp.parcelas).find(|k| !emp.pagas.contains(k)).ok_or("Todas as parcelas já foram pagas.")?;
    let linha = emp.tabela[(proxima - 1) as usize].clone();
    let lanc = lancar(
        conn,
        data,
        format!("Parcela {proxima}/{} de {}", emp.parcelas, emp.nome),
        "MANUAL",
        vec![
            p(&emp.conta_passivo_id, TipoPartida::Debito, linha.amortizacao),
            p(JUROS, TipoPartida::Debito, linha.juros),
            p(conta_id, TipoPartida::Credito, linha.parcela),
        ],
    )?;
    conn.execute(
        "INSERT INTO emprestimo_parcelas (emprestimo_id, numero, pago_em, lancamento_id) VALUES (?1, ?2, ?3, ?4)",
        params![emprestimo_id, proxima, data, lanc.id],
    )
    .map_err(e)?;
    Ok(lanc)
}

#[tauri::command]
pub fn pagar_parcela_emprestimo(state: State<AppState>, emprestimo_id: String, conta_id: String, data: String) -> Res<Lancamento> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    pagar_parcela(&mut conn, &emprestimo_id, &conta_id, &data)
}

// ---------------------------------------------------------------------------
// Valores a receber de pessoas

#[derive(Serialize)]
pub struct AReceber {
    pub id: String,
    pub pessoa: String,
    pub descricao: String,
    pub valor_centavos: i64,
    pub data: String,
    pub recebido_em: Option<String>,
    pub perdoado: bool,
}

#[tauri::command]
pub fn listar_a_receber(state: State<AppState>) -> Res<Vec<AReceber>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    let mut stmt = conn
        .prepare("SELECT id, pessoa, descricao, valor_centavos, data, recebido_em, perdoado FROM a_receber ORDER BY (recebido_em IS NOT NULL OR perdoado = 1), data DESC")
        .map_err(e)?;
    let v = stmt
        .query_map([], |r| {
            Ok(AReceber {
                id: r.get(0)?,
                pessoa: r.get(1)?,
                descricao: r.get(2)?,
                valor_centavos: r.get(3)?,
                data: r.get(4)?,
                recebido_em: r.get(5)?,
                perdoado: r.get::<_, i64>(6)? != 0,
            })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(v)
}

#[derive(Deserialize)]
pub struct ParteDivisao {
    pub pessoa: String,
    pub valor_centavos: i64,
}

#[derive(Deserialize)]
pub struct DivisaoInput {
    pub descricao: String,
    pub data: String,
    pub conta_id: String,
    /// Categoria da sua parte (ex.: Alimentação). Pode ser zero se você só emprestou.
    pub categoria_id: Option<String>,
    pub minha_parte_centavos: i64,
    pub partes: Vec<ParteDivisao>,
}

/// "Racha a conta": você pagou tudo; sua parte vira despesa e a dos outros vira valor a receber.
pub fn dividir(conn: &mut Connection, input: DivisaoInput) -> Res<Lancamento> {
    data_ok(&input.data)?;
    let descricao = input.descricao.trim().to_string();
    if descricao.is_empty() {
        return Err("Informe o que foi pago (ex.: Pizza).".into());
    }
    let partes: Vec<&ParteDivisao> = input.partes.iter().filter(|x| x.valor_centavos > 0 && !x.pessoa.trim().is_empty()).collect();
    if partes.is_empty() {
        return Err("Informe quem deve e quanto.".into());
    }
    if input.minha_parte_centavos < 0 {
        return Err("Sua parte não pode ser negativa.".into());
    }
    if input.minha_parte_centavos > 0 && input.categoria_id.is_none() {
        return Err("Escolha a categoria da sua parte.".into());
    }
    let dos_outros: i64 = partes.iter().map(|x| x.valor_centavos).sum();
    let total = dos_outros + input.minha_parte_centavos;
    let mut partidas = vec![p(A_RECEBER, TipoPartida::Debito, dos_outros)];
    if let Some(cat) = &input.categoria_id {
        partidas.push(p(cat, TipoPartida::Debito, input.minha_parte_centavos));
    }
    partidas.push(p(&input.conta_id, TipoPartida::Credito, total));
    let origem = if input.minha_parte_centavos > 0 { "MANUAL" } else { "TRANSFERENCIA" };
    let lanc = lancar(conn, &input.data, descricao.clone(), origem, partidas)?;
    for parte in partes {
        conn.execute(
            "INSERT INTO a_receber (id, pessoa, descricao, valor_centavos, data, lancamento_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![Uuid::new_v4().to_string(), parte.pessoa.trim(), descricao, parte.valor_centavos, input.data, lanc.id],
        )
        .map_err(e)?;
    }
    Ok(lanc)
}

#[tauri::command]
pub fn registrar_divisao(state: State<AppState>, input: DivisaoInput) -> Res<Lancamento> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    dividir(&mut conn, input)
}

/// Recebe (dinheiro entra na conta) os valores escolhidos.
pub fn receber(conn: &mut Connection, ids: &[String], conta_id: &str, data: &str) -> Res<Lancamento> {
    data_ok(data)?;
    let mut total = 0;
    let mut pessoas = Vec::new();
    for id in ids {
        let (valor, pessoa, recebido, perdoado): (i64, String, Option<String>, i64) = conn
            .query_row("SELECT valor_centavos, pessoa, recebido_em, perdoado FROM a_receber WHERE id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .optional()
            .map_err(e)?
            .ok_or("Valor a receber não encontrado.")?;
        if recebido.is_some() || perdoado != 0 {
            return Err("Um dos valores já foi recebido ou perdoado.".into());
        }
        total += valor;
        if !pessoas.contains(&pessoa) {
            pessoas.push(pessoa);
        }
    }
    if total == 0 {
        return Err("Escolha o que foi recebido.".into());
    }
    let lanc = lancar(conn, data, format!("Recebido de {}", pessoas.join(", ")), "TRANSFERENCIA", vec![p(conta_id, TipoPartida::Debito, total), p(A_RECEBER, TipoPartida::Credito, total)])?;
    for id in ids {
        conn.execute("UPDATE a_receber SET recebido_em = ?1, recebimento_lancamento_id = ?2 WHERE id = ?3", params![data, lanc.id, id]).map_err(e)?;
    }
    Ok(lanc)
}

#[tauri::command]
pub fn receber_valores(state: State<AppState>, ids: Vec<String>, conta_id: String, data: String) -> Res<Lancamento> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    receber(&mut conn, &ids, &conta_id, &data)
}

/// Perdoa a dívida: vira despesa (não volta mais).
#[tauri::command]
pub fn perdoar_valor(state: State<AppState>, id: String, data: String) -> Res<()> {
    data_ok(&data)?;
    let mut conn = state.conn.lock().expect("mutex envenenado");
    let (valor, pessoa, recebido, perdoado): (i64, String, Option<String>, i64) = conn
        .query_row("SELECT valor_centavos, pessoa, recebido_em, perdoado FROM a_receber WHERE id = ?1", [&id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
        .optional()
        .map_err(e)?
        .ok_or("Valor a receber não encontrado.")?;
    if recebido.is_some() || perdoado != 0 {
        return Err("Este valor já foi recebido ou perdoado.".into());
    }
    let lanc = lancar(&mut conn, &data, format!("Dívida perdoada: {pessoa}"), "MANUAL", vec![p("despesa-outras", TipoPartida::Debito, valor), p(A_RECEBER, TipoPartida::Credito, valor)])?;
    conn.execute("UPDATE a_receber SET perdoado = 1, recebimento_lancamento_id = ?1 WHERE id = ?2", params![lanc.id, id]).map_err(e)?;
    Ok(())
}

/// Recebe só uma parte de um valor: a parte vira um item já recebido e o resto continua aberto.
pub fn receber_parte(conn: &mut Connection, id: &str, valor: i64, conta_id: &str, data: &str) -> Res<Lancamento> {
    data_ok(data)?;
    let (total, pessoa, descricao, data_orig, lanc_orig, recebido, perdoado): (i64, String, String, String, Option<String>, Option<String>, i64) = conn
        .query_row(
            "SELECT valor_centavos, pessoa, descricao, data, lancamento_id, recebido_em, perdoado FROM a_receber WHERE id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)),
        )
        .optional()
        .map_err(e)?
        .ok_or("Valor a receber não encontrado.")?;
    if recebido.is_some() || perdoado != 0 {
        return Err("Este valor já foi recebido ou perdoado.".into());
    }
    if valor <= 0 || valor > total {
        return Err("A parte precisa ser maior que zero e no máximo o valor em aberto.".into());
    }
    if valor == total {
        return receber(conn, &[id.to_string()], conta_id, data);
    }
    let lanc = lancar(conn, data, format!("Recebido (parte) de {pessoa}"), "TRANSFERENCIA", vec![p(conta_id, TipoPartida::Debito, valor), p(A_RECEBER, TipoPartida::Credito, valor)])?;
    conn.execute("UPDATE a_receber SET valor_centavos = valor_centavos - ?2 WHERE id = ?1", params![id, valor]).map_err(e)?;
    conn.execute(
        "INSERT INTO a_receber (id, pessoa, descricao, valor_centavos, data, lancamento_id, recebido_em, recebimento_lancamento_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![Uuid::new_v4().to_string(), pessoa, format!("{descricao} (parte)"), valor, data_orig, lanc_orig, data, lanc.id],
    )
    .map_err(e)?;
    Ok(lanc)
}

/// Corrige o nome de uma pessoa em tudo (valores a receber e contas agendadas).
pub fn renomear_pessoa_db(conn: &Connection, antigo: &str, novo: &str) -> Res<usize> {
    let novo = novo.trim();
    if novo.is_empty() {
        return Err("Informe o novo nome.".into());
    }
    let n = conn.execute("UPDATE a_receber SET pessoa = ?2 WHERE pessoa = ?1", params![antigo, novo]).map_err(e)?;
    conn.execute("UPDATE agendamentos SET pessoa = ?2 WHERE pessoa = ?1", params![antigo, novo]).map_err(e)?;
    Ok(n)
}

/// Desfaz uma divisão lançada errado (todas as partes e o lançamento), se nada foi recebido ainda.
pub fn excluir_divisao_db(conn: &mut Connection, id: &str) -> Res<usize> {
    let lanc: Option<String> = conn.query_row("SELECT lancamento_id FROM a_receber WHERE id = ?1", [id], |r| r.get(0)).optional().map_err(e)?.ok_or("Valor a receber não encontrado.")?;
    let ids: Vec<(String, Option<String>, i64)> = {
        let mut stmt = conn
            .prepare("SELECT id, recebido_em, perdoado FROM a_receber WHERE id = ?1 OR (lancamento_id IS NOT NULL AND lancamento_id = ?2)")
            .map_err(e)?;
        let v = stmt.query_map(params![id, lanc], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).map_err(e)?.collect::<rusqlite::Result<Vec<_>>>().map_err(e)?;
        v
    };
    if ids.iter().any(|(_, rec, perd)| rec.is_some() || *perd != 0) {
        return Err("Parte desta divisão já foi recebida ou perdoada; estorne o recebimento no Histórico antes.".into());
    }
    let tx = conn.transaction().map_err(e)?;
    for (x, _, _) in &ids {
        tx.execute("DELETE FROM a_receber WHERE id = ?1", [x]).map_err(e)?;
    }
    if let Some(l) = lanc {
        crate::gestao::apagar_lancamentos(&tx, vec![l])?;
    }
    tx.commit().map_err(e)?;
    Ok(ids.len())
}

#[tauri::command]
pub fn receber_parte_valor(state: State<AppState>, id: String, valor_centavos: i64, conta_id: String, data: String) -> Res<Lancamento> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    receber_parte(&mut conn, &id, valor_centavos, &conta_id, &data)
}

#[tauri::command]
pub fn renomear_pessoa(state: State<AppState>, antigo: String, novo: String) -> Res<usize> {
    let conn = state.conn.lock().expect("mutex envenenado");
    renomear_pessoa_db(&conn, &antigo, &novo)
}

#[tauri::command]
pub fn excluir_divisao(state: State<AppState>, id: String) -> Res<usize> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    excluir_divisao_db(&mut conn, &id)
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::db::{abrir_conexao, executar_migracoes};

    fn banco() -> Connection {
        let conn = abrir_conexao(std::path::Path::new(":memory:")).unwrap();
        executar_migracoes(&conn).unwrap();
        conn
    }

    #[test]
    fn tabela_price_e_sac_fecham_no_principal() {
        let price = tabela("PRICE", 1_000_000, 0.02, 12, "2026-11-10");
        assert_eq!(price.len(), 12);
        assert_eq!(price.iter().map(|x| x.amortizacao).sum::<i64>(), 1_000_000);
        assert_eq!(price.last().unwrap().saldo_depois, 0);
        assert!((price[0].parcela - price[5].parcela).abs() <= 1);
        assert_eq!(price[0].juros, 20_000);
        assert_eq!(price[1].vencimento, "2026-12-10");
        let sac = tabela("SAC", 1_200_000, 0.01, 12, "2026-01-31");
        assert_eq!(sac[0].amortizacao, 100_000);
        assert!(sac[0].parcela > sac[11].parcela);
        assert_eq!(sac[1].vencimento, "2026-02-28");
        assert_eq!(sac.iter().map(|x| x.amortizacao).sum::<i64>(), 1_200_000);
    }

    #[test]
    fn emprestimo_entra_na_conta_e_parcela_separa_juros() {
        let mut conn = banco();
        let id = criar(
            &mut conn,
            EmprestimoInput { nome: "Carro".into(), sistema: "PRICE".into(), principal_centavos: 1_000_000, taxa_mensal: 0.02, parcelas: 12, primeiro_vencimento: "2026-11-10".into(), conta_destino_id: Some("ativo-dinheiro".into()), data_contratacao: Some("2026-10-01".into()) },
        )
        .unwrap();
        assert_eq!(engine::saldo_conta(&conn, "ativo-dinheiro").unwrap(), 1_000_000);
        let lanc = pagar_parcela(&mut conn, &id, "ativo-dinheiro", "2026-11-10").unwrap();
        let emp = listar(&conn).unwrap().pop().unwrap();
        assert_eq!(emp.pagas, vec![1]);
        assert_eq!(emp.saldo_devedor_centavos, emp.tabela[0].saldo_depois);
        assert_eq!(engine::saldo_conta(&conn, JUROS).unwrap(), 20_000);
        assert_eq!(lanc.partidas.len(), 3);
    }

    #[test]
    fn racha_conta_recebe_e_perdoa() {
        let mut conn = banco();
        dividir(
            &mut conn,
            DivisaoInput {
                descricao: "Pizza".into(), data: "2026-10-01".into(), conta_id: "ativo-dinheiro".into(), categoria_id: Some("despesa-alimentacao".into()),
                minha_parte_centavos: 2_000, partes: vec![ParteDivisao { pessoa: "Ana".into(), valor_centavos: 3_000 }, ParteDivisao { pessoa: "Bia".into(), valor_centavos: 3_000 }],
            },
        )
        .unwrap();
        assert_eq!(engine::saldo_conta(&conn, "ativo-dinheiro").unwrap(), -8_000);
        assert_eq!(engine::saldo_conta(&conn, A_RECEBER).unwrap(), 6_000);
        assert_eq!(engine::saldo_conta(&conn, "despesa-alimentacao").unwrap(), 2_000);
        let ids: Vec<String> = conn.prepare("SELECT id FROM a_receber ORDER BY pessoa").unwrap().query_map([], |r| r.get(0)).unwrap().map(|x| x.unwrap()).collect();
        receber(&mut conn, &ids[..1], "ativo-dinheiro", "2026-10-05").unwrap();
        assert_eq!(engine::saldo_conta(&conn, A_RECEBER).unwrap(), 3_000);
        assert!(receber(&mut conn, &ids[..1], "ativo-dinheiro", "2026-10-05").is_err());
    }

    #[test]
    fn recebe_parte_renomeia_e_desfaz_divisao() {
        let mut conn = banco();
        let nova = |conn: &mut Connection, pessoa: &str| {
            dividir(
                conn,
                DivisaoInput {
                    descricao: "Jantar".into(), data: "2026-10-01".into(), conta_id: "ativo-dinheiro".into(), categoria_id: None,
                    minha_parte_centavos: 0, partes: vec![ParteDivisao { pessoa: pessoa.into(), valor_centavos: 10_000 }],
                },
            )
            .unwrap();
            conn.query_row("SELECT id FROM a_receber WHERE pessoa = ?1 AND recebido_em IS NULL", [pessoa], |r| r.get::<_, String>(0)).unwrap()
        };
        let id = nova(&mut conn, "Caio");
        receber_parte(&mut conn, &id, 4_000, "ativo-dinheiro", "2026-10-03").unwrap();
        let resto: i64 = conn.query_row("SELECT valor_centavos FROM a_receber WHERE id = ?1", [&id], |r| r.get(0)).unwrap();
        assert_eq!(resto, 6_000);
        assert_eq!(engine::saldo_conta(&conn, A_RECEBER).unwrap(), 6_000);
        assert!(receber_parte(&mut conn, &id, 7_000, "ativo-dinheiro", "2026-10-03").is_err());
        assert_eq!(renomear_pessoa_db(&conn, "Caio", "Caio Souza").unwrap(), 2);
        assert!(excluir_divisao_db(&mut conn, &id).unwrap_err().contains("recebida"));
        let outro = nova(&mut conn, "Duda");
        assert_eq!(excluir_divisao_db(&mut conn, &outro).unwrap(), 1);
        assert_eq!(engine::saldo_conta(&conn, A_RECEBER).unwrap(), 6_000);
    }

    #[test]
    fn aporte_de_meta_move_dinheiro_entre_contas() {
        let mut conn = banco();
        conn.execute("INSERT INTO metas (id, nome, valor_alvo_centavos) VALUES ('m', 'Reserva', 100000)", []).unwrap();
        assert!(aportar_com_conta(&mut conn, "m", 5_000, "2026-10-01", "ativo-dinheiro").is_err());
        conn.execute("UPDATE metas SET conta_id = 'ativo-vale-alimentacao' WHERE id = 'm'", []).unwrap();
        aportar_com_conta(&mut conn, "m", 5_000, "2026-10-01", "ativo-dinheiro").unwrap();
        assert_eq!(engine::saldo_conta(&conn, "ativo-vale-alimentacao").unwrap(), 5_000);
        aportar_com_conta(&mut conn, "m", -2_000, "2026-10-02", "ativo-dinheiro").unwrap();
        assert_eq!(engine::saldo_conta(&conn, "ativo-dinheiro").unwrap(), -3_000);
    }
}
