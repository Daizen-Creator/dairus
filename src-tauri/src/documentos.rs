//! Garantias de compras e documentos importantes, com os arquivos (nota fiscal,
//! certificado de garantia, apólice, contrato…) guardados dentro do banco.

use chrono::{Datelike, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::commands::AppState;

type Res<T> = Result<T, String>;
const TAMANHO_MAXIMO_ARQUIVO: usize = 20 * 1024 * 1024;

fn e<T: std::fmt::Display>(erro: T) -> String {
    erro.to_string()
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Documento {
    pub id: String,
    pub tipo: String,
    pub categoria: String,
    pub titulo: String,
    pub numero: Option<String>,
    pub loja: Option<String>,
    pub valor_centavos: Option<i64>,
    pub data_compra: Option<String>,
    pub garantia_meses: Option<i64>,
    pub garantia_estendida_meses: i64,
    pub vencimento: Option<String>,
    pub repete: Option<String>,
    pub avisar_dias: i64,
    pub lancamento_id: Option<String>,
    pub observacao: Option<String>,
    pub arquivado: bool,
    pub criado_em: String,
    pub atualizado_em: String,
    pub arquivos: i64,
}

#[derive(Deserialize, Debug, Clone)]
pub struct DocumentoInput {
    pub id: Option<String>,
    pub tipo: String,
    pub categoria: String,
    pub titulo: String,
    pub numero: Option<String>,
    pub loja: Option<String>,
    pub valor_centavos: Option<i64>,
    pub data_compra: Option<String>,
    pub garantia_meses: Option<i64>,
    #[serde(default)]
    pub garantia_estendida_meses: i64,
    pub vencimento: Option<String>,
    pub repete: Option<String>,
    pub avisar_dias: i64,
    pub lancamento_id: Option<String>,
    pub observacao: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct InfoArquivo {
    pub id: String,
    pub documento_id: String,
    pub nome: String,
    pub mime: String,
    pub tamanho: i64,
    pub criado_em: String,
}

/// Soma meses a uma data, sem pular mês: 31/01 + 1 mês = 28/02 (ou 29 no bissexto).
pub fn somar_meses(data: NaiveDate, meses: i64) -> NaiveDate {
    let total = data.year() as i64 * 12 + data.month0() as i64 + meses;
    let (ano, mes0) = (total.div_euclid(12) as i32, total.rem_euclid(12) as u32);
    let mut dia = data.day();
    loop {
        if let Some(d) = NaiveDate::from_ymd_opt(ano, mes0 + 1, dia) {
            return d;
        }
        dia -= 1;
    }
}

fn data(texto: &str, campo: &str) -> Res<NaiveDate> {
    NaiveDate::parse_from_str(texto, "%Y-%m-%d").map_err(|_| format!("{campo}: data inválida (use AAAA-MM-DD)."))
}

fn texto_opcional(v: &Option<String>, max: usize, campo: &str) -> Res<Option<String>> {
    match v.as_deref().map(str::trim) {
        None | Some("") => Ok(None),
        Some(t) if t.chars().count() > max => Err(format!("{campo}: no máximo {max} caracteres.")),
        Some(t) => Ok(Some(t.to_string())),
    }
}

/// Valida e normaliza o que veio da tela. Na garantia, o vencimento é calculado
/// pela data da compra + meses de garantia (+ garantia estendida).
pub fn normalizar(i: &DocumentoInput) -> Res<DocumentoInput> {
    let tipo = i.tipo.trim().to_uppercase();
    if tipo != "GARANTIA" && tipo != "DOCUMENTO" {
        return Err("Tipo inválido.".into());
    }
    let titulo = i.titulo.trim();
    if titulo.is_empty() {
        return Err("Dê um nome (ex.: TV Samsung 55\", IPVA do carro).".into());
    }
    if titulo.chars().count() > 120 {
        return Err("O nome pode ter no máximo 120 caracteres.".into());
    }
    let categoria = i.categoria.trim();
    if categoria.is_empty() || categoria.chars().count() > 40 {
        return Err("Escolha uma categoria.".into());
    }
    if i.valor_centavos.is_some_and(|v| !(0..=10_000_000_000_000).contains(&v)) {
        return Err("Valor inválido.".into());
    }
    if !(0..=365).contains(&i.avisar_dias) {
        return Err("Avisar com 0 a 365 dias de antecedência.".into());
    }
    let repete = match i.repete.as_deref().map(str::trim) {
        None | Some("") => None,
        Some(r) if r == "MENSAL" || r == "ANUAL" => Some(r.to_string()),
        Some(_) => return Err("Repetição inválida.".into()),
    };
    let data_compra = match texto_opcional(&i.data_compra, 10, "Data da compra")? {
        Some(d) => Some(data(&d, "Data da compra")?.to_string()),
        None => None,
    };
    let mut vencimento = match texto_opcional(&i.vencimento, 10, "Vencimento")? {
        Some(d) => Some(data(&d, "Vencimento")?.to_string()),
        None => None,
    };
    let estendida = i.garantia_estendida_meses;
    if !(0..=240).contains(&estendida) || i.garantia_meses.is_some_and(|m| !(0..=240).contains(&m)) {
        return Err("A garantia vai de 0 a 240 meses.".into());
    }
    if tipo == "GARANTIA" {
        let compra = data_compra.as_deref().ok_or("Informe a data da compra para calcular a garantia.")?;
        let meses = i.garantia_meses.ok_or("Informe quantos meses de garantia.")?;
        vencimento = Some(somar_meses(data(compra, "Data da compra")?, meses + estendida).to_string());
    }
    Ok(DocumentoInput {
        id: i.id.clone(),
        tipo,
        categoria: categoria.to_string(),
        titulo: titulo.to_string(),
        numero: texto_opcional(&i.numero, 80, "Número")?,
        loja: texto_opcional(&i.loja, 80, "Loja")?,
        valor_centavos: i.valor_centavos,
        data_compra,
        garantia_meses: if i.tipo.eq_ignore_ascii_case("GARANTIA") { i.garantia_meses } else { None },
        garantia_estendida_meses: if i.tipo.eq_ignore_ascii_case("GARANTIA") { estendida } else { 0 },
        vencimento,
        repete,
        avisar_dias: i.avisar_dias,
        lancamento_id: texto_opcional(&i.lancamento_id, 40, "Lançamento")?,
        observacao: texto_opcional(&i.observacao, 5000, "Observação")?,
    })
}

const COLUNAS: &str = "d.id, d.tipo, d.categoria, d.titulo, d.numero, d.loja, d.valor_centavos, d.data_compra, d.garantia_meses,
    d.garantia_estendida_meses, d.vencimento, d.repete, d.avisar_dias, d.lancamento_id, d.observacao, d.arquivado, d.criado_em,
    d.atualizado_em, (SELECT COUNT(*) FROM documento_arquivos a WHERE a.documento_id = d.id)";

fn ler(r: &rusqlite::Row) -> rusqlite::Result<Documento> {
    Ok(Documento {
        id: r.get(0)?,
        tipo: r.get(1)?,
        categoria: r.get(2)?,
        titulo: r.get(3)?,
        numero: r.get(4)?,
        loja: r.get(5)?,
        valor_centavos: r.get(6)?,
        data_compra: r.get(7)?,
        garantia_meses: r.get(8)?,
        garantia_estendida_meses: r.get(9)?,
        vencimento: r.get(10)?,
        repete: r.get(11)?,
        avisar_dias: r.get(12)?,
        lancamento_id: r.get(13)?,
        observacao: r.get(14)?,
        arquivado: r.get::<_, i64>(15)? != 0,
        criado_em: r.get(16)?,
        atualizado_em: r.get(17)?,
        arquivos: r.get(18)?,
    })
}

pub fn buscar(conn: &Connection, id: &str) -> Res<Documento> {
    conn.query_row(&format!("SELECT {COLUNAS} FROM documentos d WHERE d.id = ?1"), [id], ler)
        .optional()
        .map_err(e)?
        .ok_or_else(|| "Documento não encontrado.".to_string())
}

pub fn listar(conn: &Connection) -> Res<Vec<Documento>> {
    let mut stmt = conn
        .prepare(&format!("SELECT {COLUNAS} FROM documentos d ORDER BY d.arquivado, d.vencimento IS NULL, d.vencimento, d.titulo"))
        .map_err(e)?;
    let v = stmt.query_map([], ler).map_err(e)?.collect::<rusqlite::Result<Vec<_>>>().map_err(e)?;
    Ok(v)
}

pub fn salvar(conn: &Connection, input: &DocumentoInput) -> Res<Documento> {
    let i = normalizar(input)?;
    if let Some(l) = &i.lancamento_id {
        let existe: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM lancamentos WHERE id = ?1)", [l], |r| r.get(0)).map_err(e)?;
        if !existe {
            return Err("Lançamento ligado não encontrado.".into());
        }
    }
    let id = match &i.id {
        Some(id) => {
            let n = conn
                .execute(
                    "UPDATE documentos SET tipo = ?2, categoria = ?3, titulo = ?4, numero = ?5, loja = ?6, valor_centavos = ?7,
                     data_compra = ?8, garantia_meses = ?9, garantia_estendida_meses = ?10, vencimento = ?11, repete = ?12,
                     avisar_dias = ?13, lancamento_id = ?14, observacao = ?15,
                     atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
                    params![id, i.tipo, i.categoria, i.titulo, i.numero, i.loja, i.valor_centavos, i.data_compra, i.garantia_meses,
                        i.garantia_estendida_meses, i.vencimento, i.repete, i.avisar_dias, i.lancamento_id, i.observacao],
                )
                .map_err(e)?;
            if n == 0 {
                return Err("Documento não encontrado.".into());
            }
            id.clone()
        }
        None => {
            let id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO documentos (id, tipo, categoria, titulo, numero, loja, valor_centavos, data_compra, garantia_meses,
                 garantia_estendida_meses, vencimento, repete, avisar_dias, lancamento_id, observacao)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
                params![id, i.tipo, i.categoria, i.titulo, i.numero, i.loja, i.valor_centavos, i.data_compra, i.garantia_meses,
                    i.garantia_estendida_meses, i.vencimento, i.repete, i.avisar_dias, i.lancamento_id, i.observacao],
            )
            .map_err(e)?;
            id
        }
    };
    buscar(conn, &id)
}

/// Documento que se repete (IPVA, seguro, licenciamento): passa o vencimento para o próximo período.
pub fn renovar(conn: &Connection, id: &str) -> Res<Documento> {
    let d = buscar(conn, id)?;
    let atual = d.vencimento.as_deref().ok_or("Este documento não tem vencimento.")?;
    let meses = match d.repete.as_deref() {
        Some("MENSAL") => 1,
        _ => 12,
    };
    let novo = somar_meses(data(atual, "Vencimento")?, meses).to_string();
    conn.execute(
        "UPDATE documentos SET vencimento = ?2, atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
        params![id, novo],
    )
    .map_err(e)?;
    buscar(conn, id)
}

pub(crate) fn nome_seguro(nome: &str, padrao: &str) -> String {
    let n: String = nome.chars().filter(|c| !"\\/:*?\"<>|".contains(*c) && !c.is_control()).take(120).collect();
    let n = n.trim().trim_start_matches('.').to_string();
    if n.is_empty() { padrao.to_string() } else { n }
}

// ---------------------------------------------------------------------------
// Arquivos abertos no programa padrão (nota fiscal, comprovante…)
//
// Para abrir um anexo, ele é gravado decifrado numa pasta da própria conta
// (`contas\<id>\abertos`, dentro da pasta de dados do app). Essa pasta é apagada
// ao sair da conta, ao sair do app e na próxima abertura, para o arquivo não ficar
// decifrado no disco (nem na pasta temporária, que é de todos os usuários e contas).

/// Subpasta da conta onde ficam os anexos abertos (precisa bater com `capabilities/default.json`).
pub(crate) const PASTA_ABERTOS: &str = "abertos";

/// Extensões que o Windows executa (ou interpreta como script) ao abrir: nunca são abertas pelo Dairus.
const EXTENSOES_EXECUTAVEIS: &[&str] = &[
    "exe", "bat", "cmd", "com", "scr", "msi", "ps1", "vbs", "js", "jse", "wsf", "hta", "lnk", "reg", "dll", // pedidas
    "pif", "cpl", "jar", "vbe", "wsh", "wsc", "msp", "inf", "scf", "url", "sct", "msc", "ps1xml", "psm1", "gadget", "application",
];

/// Última extensão do nome, em minúsculas, ignorando pontos e espaços no fim
/// (o Windows trata "a.exe." e "a.exe " como "a.exe").
fn extensao_do_nome(nome: &str) -> Option<String> {
    let limpo = nome.trim_end_matches(|c: char| c == '.' || c.is_whitespace());
    let (_, ext) = limpo.rsplit_once('.')?;
    let ext = ext.trim().to_lowercase();
    (!ext.is_empty()).then_some(ext)
}

/// A extensão (sem o ponto) quando o nome é de um programa/script que não deve ser aberto.
pub(crate) fn extensao_executavel(nome: &str) -> Option<String> {
    extensao_do_nome(nome).filter(|ext| EXTENSOES_EXECUTAVEIS.contains(&ext.as_str()))
}

/// Nome do arquivo gravado para abrir: `<8 primeiros caracteres do id>-<nome limpo>`.
/// Recusa extensões executáveis. Não entra em pânico com ids curtos.
pub(crate) fn nome_para_abrir(id: &str, nome: &str) -> Res<String> {
    let limpo = nome_seguro(nome, "arquivo");
    if let Some(ext) = extensao_executavel(nome).or_else(|| extensao_executavel(&limpo)) {
        return Err(format!(
            "Por segurança, o Dairus não abre arquivos .{ext} (programas e scripts). Anexe o comprovante em PDF ou imagem."
        ));
    }
    let prefixo: String = id.chars().filter(|c| c.is_ascii_alphanumeric()).take(8).collect();
    let prefixo = if prefixo.is_empty() { "arquivo".to_string() } else { prefixo };
    Ok(format!("{prefixo}-{limpo}"))
}

/// Pasta dos anexos abertos da conta atual (`contas\<id>\abertos`), criada se não existir.
pub(crate) fn pasta_abertos<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Res<std::path::PathBuf> {
    use tauri::Manager;
    let conta = crate::conta::USUARIO_ATUAL
        .lock()
        .expect("mutex envenenado")
        .clone()
        .ok_or("Entre na sua conta primeiro.")?;
    let pasta = app.path().app_data_dir().map_err(e)?.join("contas").join(conta).join(PASTA_ABERTOS);
    std::fs::create_dir_all(&pasta).map_err(e)?;
    Ok(pasta)
}

/// Grava o anexo em `pasta` e devolve o caminho, para abrir no programa padrão.
pub(crate) fn gravar_para_abrir(pasta: &std::path::Path, id: &str, nome: &str, conteudo: &[u8]) -> Res<std::path::PathBuf> {
    let arquivo = nome_para_abrir(id, nome)?;
    std::fs::create_dir_all(pasta).map_err(e)?;
    let caminho = pasta.join(arquivo);
    std::fs::write(&caminho, conteudo).map_err(e)?;
    Ok(caminho)
}

/// Apaga a pasta de anexos abertos (o que estiver aberto em outro programa fica
/// para a próxima limpeza). Devolve quantos arquivos foram apagados.
pub(crate) fn limpar_pasta_abertos(pasta: &std::path::Path) -> usize {
    let Ok(entradas) = std::fs::read_dir(pasta) else { return 0 };
    let mut apagados = 0;
    for ent in entradas.filter_map(|x| x.ok()) {
        let p = ent.path();
        let ok = if p.is_dir() { std::fs::remove_dir_all(&p).is_ok() } else { std::fs::remove_file(&p).is_ok() };
        if ok {
            apagados += 1;
        }
    }
    let _ = std::fs::remove_dir(pasta);
    apagados
}

/// Limpeza geral: anexos abertos de TODAS as contas (`contas\*\abertos`) e as pastas
/// temporárias que as versões antigas usavam em `%TEMP%`. Devolve quantos arquivos saíram.
pub(crate) fn limpar_abertos_de_todas(dados: &std::path::Path, temporario: &std::path::Path) -> usize {
    let mut n = 0;
    if let Ok(contas) = std::fs::read_dir(dados.join("contas")) {
        for conta in contas.filter_map(|x| x.ok()) {
            n += limpar_pasta_abertos(&conta.path().join(PASTA_ABERTOS));
        }
    }
    for antiga in ["dairus-documentos", "dairus-comprovantes"] {
        n += limpar_pasta_abertos(&temporario.join(antiga));
    }
    n
}

/// Mesma limpeza, usando as pastas do app. Nunca falha: é só higiene.
pub(crate) fn limpar_abertos<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use tauri::Manager;
    if let Ok(dados) = app.path().app_data_dir() {
        let n = limpar_abertos_de_todas(&dados, &std::env::temp_dir());
        if n > 0 {
            log::info!("{n} arquivo(s) aberto(s) apagado(s) do disco");
        }
    }
}

pub fn anexar(conn: &Connection, documento_id: &str, nome: &str, mime: &str, conteudo: &[u8]) -> Res<InfoArquivo> {
    if conteudo.is_empty() {
        return Err("Arquivo vazio.".into());
    }
    if conteudo.len() > TAMANHO_MAXIMO_ARQUIVO {
        return Err("Arquivo grande demais (máximo 20 MB).".into());
    }
    buscar(conn, documento_id)?;
    let nome = nome_seguro(nome, "arquivo");
    let mime: String = mime.chars().filter(|c| c.is_ascii_graphic()).take(100).collect();
    let mime = if mime.is_empty() { "application/octet-stream".to_string() } else { mime };
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO documento_arquivos (id, documento_id, nome, mime, tamanho, conteudo) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, documento_id, nome, mime, conteudo.len() as i64, conteudo],
    )
    .map_err(e)?;
    arquivos(conn, documento_id)?.into_iter().find(|a| a.id == id).ok_or_else(|| "Falha ao gravar o arquivo.".to_string())
}

pub fn arquivos(conn: &Connection, documento_id: &str) -> Res<Vec<InfoArquivo>> {
    let mut stmt = conn
        .prepare("SELECT id, documento_id, nome, mime, tamanho, criado_em FROM documento_arquivos WHERE documento_id = ?1 ORDER BY criado_em")
        .map_err(e)?;
    let v = stmt
        .query_map([documento_id], |r| {
            Ok(InfoArquivo { id: r.get(0)?, documento_id: r.get(1)?, nome: r.get(2)?, mime: r.get(3)?, tamanho: r.get(4)?, criado_em: r.get(5)? })
        })
        .map_err(e)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(e)?;
    Ok(v)
}

/// Copia os comprovantes já anexados ao lançamento (ex.: a nota fiscal) para o documento.
pub fn copiar_do_lancamento(conn: &Connection, documento_id: &str, lancamento_id: &str) -> Res<usize> {
    buscar(conn, documento_id)?;
    let n = conn
        .execute(
            "INSERT INTO documento_arquivos (id, documento_id, nome, mime, tamanho, conteudo)
             SELECT lower(hex(randomblob(16))), ?1, a.nome, a.mime, a.tamanho, a.conteudo FROM anexos a
             WHERE a.lancamento_id = ?2
               AND NOT EXISTS (SELECT 1 FROM documento_arquivos x WHERE x.documento_id = ?1 AND x.nome = a.nome AND x.tamanho = a.tamanho)",
            params![documento_id, lancamento_id],
        )
        .map_err(e)?;
    Ok(n)
}

// ---------------------------------------------------------------------------
// Comandos

#[tauri::command]
pub fn listar_documentos(state: State<AppState>) -> Res<Vec<Documento>> {
    listar(&state.conn.lock().expect("mutex envenenado"))
}

#[tauri::command]
pub fn salvar_documento(state: State<AppState>, input: DocumentoInput) -> Res<Documento> {
    salvar(&state.conn.lock().expect("mutex envenenado"), &input)
}

#[tauri::command]
pub fn excluir_documento(state: State<AppState>, id: String) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    // Os arquivos saem junto (ON DELETE CASCADE).
    conn.execute("DELETE FROM documentos WHERE id = ?1", [&id]).map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn arquivar_documento(state: State<AppState>, id: String, arquivado: bool) -> Res<Documento> {
    let conn = state.conn.lock().expect("mutex envenenado");
    conn.execute(
        "UPDATE documentos SET arquivado = ?2, atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
        params![id, arquivado as i64],
    )
    .map_err(e)?;
    buscar(&conn, &id)
}

#[tauri::command]
pub fn renovar_documento(state: State<AppState>, id: String) -> Res<Documento> {
    renovar(&state.conn.lock().expect("mutex envenenado"), &id)
}

#[tauri::command]
pub fn anexar_arquivo_documento(state: State<AppState>, documento_id: String, nome: String, mime: String, conteudo: Vec<u8>) -> Res<InfoArquivo> {
    anexar(&state.conn.lock().expect("mutex envenenado"), &documento_id, &nome, &mime, &conteudo)
}

#[tauri::command]
pub fn listar_arquivos_documento(state: State<AppState>, documento_id: String) -> Res<Vec<InfoArquivo>> {
    arquivos(&state.conn.lock().expect("mutex envenenado"), &documento_id)
}

#[tauri::command]
pub fn ler_arquivo_documento(state: State<AppState>, id: String) -> Res<Vec<u8>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    conn.query_row("SELECT conteudo FROM documento_arquivos WHERE id = ?1", [&id], |r| r.get(0)).map_err(|_| "Arquivo não encontrado.".to_string())
}

/// Grava o arquivo na pasta `abertos` da conta e devolve o caminho, para abrir no programa
/// padrão. A pasta é apagada ao sair da conta ou do app. Programas e scripts não abrem.
#[tauri::command]
pub fn abrir_arquivo_documento(app: tauri::AppHandle, state: State<AppState>, id: String) -> Res<String> {
    let (nome, conteudo): (String, Vec<u8>) = {
        let conn = state.conn.lock().expect("mutex envenenado");
        conn.query_row("SELECT nome, conteudo FROM documento_arquivos WHERE id = ?1", [&id], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|_| "Arquivo não encontrado.".to_string())?
    };
    nome_para_abrir(&id, &nome)?; // recusa antes de criar qualquer pasta
    let caminho = gravar_para_abrir(&pasta_abertos(&app)?, &id, &nome, &conteudo)?;
    Ok(caminho.to_string_lossy().to_string())
}

#[tauri::command]
pub fn excluir_arquivo_documento(state: State<AppState>, id: String) -> Res<()> {
    let conn = state.conn.lock().expect("mutex envenenado");
    conn.execute("DELETE FROM documento_arquivos WHERE id = ?1", [&id]).map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn copiar_comprovantes_para_documento(state: State<AppState>, documento_id: String, lancamento_id: String) -> Res<usize> {
    copiar_do_lancamento(&state.conn.lock().expect("mutex envenenado"), &documento_id, &lancamento_id)
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

    fn garantia(titulo: &str, compra: &str, meses: i64) -> DocumentoInput {
        DocumentoInput {
            id: None,
            tipo: "GARANTIA".into(),
            categoria: "Eletrônicos".into(),
            titulo: titulo.into(),
            numero: Some(" NF 123 ".into()),
            loja: Some("Magalu".into()),
            valor_centavos: Some(320_000),
            data_compra: Some(compra.into()),
            garantia_meses: Some(meses),
            garantia_estendida_meses: 0,
            vencimento: Some("2000-01-01".into()),
            repete: None,
            avisar_dias: 30,
            lancamento_id: None,
            observacao: None,
        }
    }

    #[test]
    fn soma_meses_sem_pular_o_fim_do_mes() {
        let d = |s: &str| NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap();
        assert_eq!(somar_meses(d("2026-01-31"), 1), d("2026-02-28"));
        assert_eq!(somar_meses(d("2028-01-31"), 1), d("2028-02-29"));
        assert_eq!(somar_meses(d("2026-10-03"), 12), d("2027-10-03"));
        assert_eq!(somar_meses(d("2026-11-15"), 3), d("2027-02-15"));
    }

    #[test]
    fn garantia_calcula_o_vencimento_e_soma_a_estendida() {
        let conn = banco();
        let doc = salvar(&conn, &garantia("TV Samsung 55\"", "2026-03-10", 12)).unwrap();
        assert_eq!(doc.vencimento.as_deref(), Some("2027-03-10"));
        assert_eq!(doc.numero.as_deref(), Some("NF 123"));
        let mut ed = garantia("TV Samsung 55\"", "2026-03-10", 12);
        ed.id = Some(doc.id.clone());
        ed.garantia_estendida_meses = 12;
        let doc = salvar(&conn, &ed).unwrap();
        assert_eq!(doc.vencimento.as_deref(), Some("2028-03-10"));
        assert_eq!(listar(&conn).unwrap().len(), 1);
    }

    #[test]
    fn recusa_dados_invalidos() {
        let mut g = garantia("", "2026-03-10", 12);
        assert!(normalizar(&g).is_err());
        g.titulo = "Celular".into();
        g.data_compra = None;
        assert!(normalizar(&g).unwrap_err().contains("data da compra"));
        g.data_compra = Some("2026-02-30".into());
        assert!(normalizar(&g).is_err());
        g.data_compra = Some("2026-02-10".into());
        g.tipo = "OUTRO".into();
        assert!(normalizar(&g).is_err());
    }

    #[test]
    fn documento_anual_renova_e_arquivos_saem_junto() {
        let conn = banco();
        let ipva = salvar(
            &conn,
            &DocumentoInput {
                id: None,
                tipo: "DOCUMENTO".into(),
                categoria: "Veículo".into(),
                titulo: "IPVA do carro".into(),
                numero: Some("ABC1D23".into()),
                loja: None,
                valor_centavos: Some(180_000),
                data_compra: None,
                garantia_meses: Some(12),
                garantia_estendida_meses: 0,
                vencimento: Some("2027-01-20".into()),
                repete: Some("ANUAL".into()),
                avisar_dias: 15,
                lancamento_id: None,
                observacao: None,
            },
        )
        .unwrap();
        assert_eq!(ipva.garantia_meses, None);
        assert_eq!(renovar(&conn, &ipva.id).unwrap().vencimento.as_deref(), Some("2028-01-20"));
        let a = anexar(&conn, &ipva.id, "../boleto?.pdf", "application/pdf", b"%PDF-1.4").unwrap();
        assert_eq!(a.nome, "boleto.pdf");
        assert_eq!(buscar(&conn, &ipva.id).unwrap().arquivos, 1);
        assert!(anexar(&conn, &ipva.id, "x", "y", b"").is_err());
        conn.execute("DELETE FROM documentos WHERE id = ?1", [&ipva.id]).unwrap();
        let sobrou: i64 = conn.query_row("SELECT COUNT(*) FROM documento_arquivos", [], |r| r.get(0)).unwrap();
        assert_eq!(sobrou, 0);
    }

    fn pasta_temp(nome: &str) -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!("dairus-teste-{nome}-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn recusa_abrir_programas_e_scripts() {
        for nome in [
            "setup.exe", "a.BAT", "x.cmd", "y.com", "z.scr", "i.msi", "s.ps1", "s.vbs", "s.js", "s.jse", "s.wsf", "s.hta", "a.lnk", "a.reg",
            "a.dll", "nota.pdf.exe", "nota.pdf.exe.", "nota.pdf.exe ", "NOTA.PDF.ExE",
        ] {
            assert!(nome_para_abrir("abcdef12-0000", nome).is_err(), "{nome} deveria ser recusado");
        }
        for nome in ["nota.pdf", "foto.JPG", "contrato.docx", "sem-extensao", "exe", "arquivo.exe.pdf", "relatorio.js.pdf"] {
            assert!(nome_para_abrir("abcdef12-0000", nome).is_ok(), "{nome} deveria abrir");
        }
        assert_eq!(extensao_executavel("setup.EXE").as_deref(), Some("exe"));
        assert_eq!(extensao_executavel("nota.pdf"), None);
    }

    #[test]
    fn nome_para_abrir_nao_entra_em_panico_com_id_curto_ou_estranho() {
        assert_eq!(nome_para_abrir("ab", "nota.pdf").unwrap(), "ab-nota.pdf");
        assert_eq!(nome_para_abrir("", "nota.pdf").unwrap(), "arquivo-nota.pdf");
        // Id com caracteres de caminho e acentos: só letras/números entram no prefixo.
        assert_eq!(nome_para_abrir("../../é1", "nota.pdf").unwrap(), "1-nota.pdf");
        assert_eq!(nome_para_abrir("12345678-aaaa", "../../Windows/x.pdf").unwrap(), "12345678-Windowsx.pdf");
    }

    #[test]
    fn grava_na_pasta_da_conta_e_limpa_tudo() {
        let dados = pasta_temp("abertos");
        let temp = pasta_temp("abertos-temp");
        let conta_a = dados.join("contas").join("aaaaaaaa-0000-4000-8000-000000000001").join(PASTA_ABERTOS);
        let conta_b = dados.join("contas").join("bbbbbbbb-0000-4000-8000-000000000002").join(PASTA_ABERTOS);
        let a = gravar_para_abrir(&conta_a, "11111111-x", "nota.pdf", b"%PDF-conta-a").unwrap();
        let b = gravar_para_abrir(&conta_b, "22222222-x", "recibo.png", b"png-conta-b").unwrap();
        assert!(a.starts_with(&conta_a) && b.starts_with(&conta_b));
        assert_eq!(std::fs::read(&a).unwrap(), b"%PDF-conta-a");
        // O que as versões antigas deixaram em %TEMP%.
        std::fs::create_dir_all(temp.join("dairus-documentos")).unwrap();
        std::fs::write(temp.join("dairus-documentos").join("12345678-velho.pdf"), b"velho").unwrap();
        std::fs::create_dir_all(temp.join("dairus-comprovantes")).unwrap();
        std::fs::write(temp.join("dairus-comprovantes").join("12345678-velho.pdf"), b"velho").unwrap();
        // Outra pasta do usuário em %TEMP% não é tocada.
        std::fs::write(temp.join("meu-arquivo.txt"), b"nao mexe").unwrap();

        assert_eq!(limpar_abertos_de_todas(&dados, &temp), 4);
        assert!(!a.exists() && !b.exists());
        assert!(!conta_a.exists() && !conta_b.exists());
        assert!(!temp.join("dairus-documentos").exists() && !temp.join("dairus-comprovantes").exists());
        assert!(temp.join("meu-arquivo.txt").exists());
        // Sem nada para limpar, não falha.
        assert_eq!(limpar_abertos_de_todas(&dados, &temp), 0);
        assert_eq!(limpar_pasta_abertos(&dados.join("nao-existe")), 0);

        // Extensão executável não grava nada em disco.
        let pasta = dados.join("contas").join("cccccccc-0000-4000-8000-000000000003").join(PASTA_ABERTOS);
        assert!(gravar_para_abrir(&pasta, "33333333", "instalador.exe", b"MZ").is_err());
        assert!(!pasta.exists());
        let _ = std::fs::remove_dir_all(&dados);
        let _ = std::fs::remove_dir_all(&temp);
    }
}
