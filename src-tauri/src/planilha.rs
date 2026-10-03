//! Exportação para Excel (.xlsx) com várias abas, cabeçalho formatado,
//! valores em reais como número de verdade (somáveis no Excel) e datas reais.

use rust_xlsxwriter::{Color, ExcelDateTime, Format, FormatAlign, FormatBorder, Workbook};
use serde::Deserialize;
use tauri::AppHandle;

use crate::extras::{nome_seguro, pasta_dairus};

/// Como cada coluna é gravada.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FormatoColuna {
    Texto,
    /// Valor em centavos (inteiro) gravado como R$ com duas casas.
    Moeda,
    /// Data ISO (AAAA-MM-DD) gravada como data do Excel.
    Data,
    Numero,
    /// Fração (0,25) mostrada como 25%.
    Percentual,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Coluna {
    pub titulo: String,
    pub formato: FormatoColuna,
    #[serde(default)]
    pub largura: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Aba {
    pub nome: String,
    pub colunas: Vec<Coluna>,
    pub linhas: Vec<Vec<serde_json::Value>>,
    /// Acrescenta uma linha de total somando as colunas de moeda/número.
    #[serde(default)]
    pub total: bool,
}

/// Nome de aba válido no Excel: até 31 caracteres, sem `[]:*?/\`.
fn nome_aba(nome: &str, usados: &mut Vec<String>) -> String {
    let limpo: String = nome.chars().filter(|c| !"[]:*?/\\".contains(*c)).take(31).collect();
    let base = if limpo.trim().is_empty() { "Planilha".to_string() } else { limpo.trim().to_string() };
    let mut nome = base.clone();
    let mut n = 2;
    while usados.iter().any(|u| u.eq_ignore_ascii_case(&nome)) {
        let sufixo = format!(" ({n})");
        nome = format!("{}{}", base.chars().take(31 - sufixo.len()).collect::<String>(), sufixo);
        n += 1;
    }
    usados.push(nome.clone());
    nome
}

fn letra_coluna(mut i: u16) -> String {
    let mut s = String::new();
    i += 1;
    while i > 0 {
        let r = ((i - 1) % 26) as u8;
        s.insert(0, (b'A' + r) as char);
        i = (i - 1) / 26;
    }
    s
}

pub fn montar_xlsx(abas: &[Aba]) -> Result<Vec<u8>, String> {
    if abas.is_empty() {
        return Err("Nada para exportar.".into());
    }
    let mut wb = Workbook::new();
    let cabecalho = Format::new()
        .set_bold()
        .set_font_color(Color::White)
        .set_background_color(Color::RGB(0x4F46E5))
        .set_border_bottom(FormatBorder::Thin)
        .set_align(FormatAlign::Center);
    let moeda = Format::new().set_num_format("\"R$\" #,##0.00;[Red]-\"R$\" #,##0.00");
    let data = Format::new().set_num_format("dd/mm/yyyy");
    let numero = Format::new().set_num_format("#,##0.##");
    let percentual = Format::new().set_num_format("0.0%");
    let total_txt = Format::new().set_bold().set_border_top(FormatBorder::Thin);
    let total_moeda = moeda.clone().set_bold().set_border_top(FormatBorder::Thin);
    let total_num = numero.clone().set_bold().set_border_top(FormatBorder::Thin);

    let mut usados = Vec::new();
    for aba in abas {
        let ws = wb.add_worksheet();
        ws.set_name(nome_aba(&aba.nome, &mut usados)).map_err(|e| e.to_string())?;
        for (c, col) in aba.colunas.iter().enumerate() {
            let c = c as u16;
            ws.write_string_with_format(0, c, &col.titulo, &cabecalho).map_err(|e| e.to_string())?;
            let largura = col.largura.unwrap_or(match col.formato {
                FormatoColuna::Texto => 28.0,
                FormatoColuna::Data => 12.0,
                _ => 15.0,
            });
            ws.set_column_width(c, largura).map_err(|e| e.to_string())?;
        }
        ws.set_freeze_panes(1, 0).map_err(|e| e.to_string())?;

        for (r, linha) in aba.linhas.iter().enumerate() {
            let r = (r + 1) as u32;
            for (c, valor) in linha.iter().enumerate() {
                let Some(col) = aba.colunas.get(c) else { break };
                let c = c as u16;
                let res = match (col.formato, valor) {
                    (_, serde_json::Value::Null) => Ok(()),
                    (FormatoColuna::Moeda, v) if v.is_number() => {
                        ws.write_number_with_format(r, c, v.as_f64().unwrap_or(0.0) / 100.0, &moeda).map(|_| ())
                    }
                    (FormatoColuna::Numero, v) if v.is_number() => ws.write_number_with_format(r, c, v.as_f64().unwrap_or(0.0), &numero).map(|_| ()),
                    (FormatoColuna::Percentual, v) if v.is_number() => {
                        ws.write_number_with_format(r, c, v.as_f64().unwrap_or(0.0), &percentual).map(|_| ())
                    }
                    (FormatoColuna::Data, serde_json::Value::String(s)) => match ExcelDateTime::parse_from_str(s) {
                        Ok(d) => ws.write_datetime_with_format(r, c, &d, &data).map(|_| ()),
                        Err(_) => ws.write_string(r, c, s).map(|_| ()),
                    },
                    (_, serde_json::Value::String(s)) => ws.write_string(r, c, s).map(|_| ()),
                    (_, serde_json::Value::Bool(b)) => ws.write_string(r, c, if *b { "Sim" } else { "Não" }).map(|_| ()),
                    (_, v) => ws.write_string(r, c, v.to_string()).map(|_| ()),
                };
                res.map_err(|e| e.to_string())?;
            }
        }

        if aba.total && !aba.linhas.is_empty() {
            let r = (aba.linhas.len() + 1) as u32;
            let ultima = aba.linhas.len() + 1;
            ws.write_string_with_format(r, 0, "Total", &total_txt).map_err(|e| e.to_string())?;
            for (c, col) in aba.colunas.iter().enumerate().skip(1) {
                let fmt = match col.formato {
                    FormatoColuna::Moeda => &total_moeda,
                    FormatoColuna::Numero => &total_num,
                    _ => continue,
                };
                let l = letra_coluna(c as u16);
                ws.write_formula_with_format(r, c as u16, format!("=SUM({l}2:{l}{ultima})").as_str(), fmt)
                    .map_err(|e| e.to_string())?;
            }
        }
        if !aba.colunas.is_empty() {
            ws.autofilter(0, 0, aba.linhas.len() as u32, (aba.colunas.len() - 1) as u16).map_err(|e| e.to_string())?;
        }
    }
    wb.save_to_buffer().map_err(|e| e.to_string())
}

/// Gera o .xlsx e grava em Documentos\Dairus\Exportacoes. Devolve o caminho.
#[tauri::command]
pub fn exportar_xlsx(app: AppHandle, nome_arquivo: String, abas: Vec<Aba>) -> Result<String, String> {
    let nome = nome_seguro(&nome_arquivo)?;
    if !nome.to_lowercase().ends_with(".xlsx") {
        return Err("O arquivo precisa terminar em .xlsx.".into());
    }
    let bytes = montar_xlsx(&abas)?;
    let caminho = pasta_dairus(&app, "Exportacoes")?.join(nome);
    std::fs::write(&caminho, bytes).map_err(|e| e.to_string())?;
    Ok(caminho.to_string_lossy().to_string())
}

#[cfg(test)]
mod testes {
    use super::*;
    use serde_json::json;

    #[test]
    fn gera_xlsx_valido_com_abas_e_total() {
        let abas: Vec<Aba> = serde_json::from_value(json!([
            {
                "nome": "Lançamentos",
                "total": true,
                "colunas": [
                    {"titulo": "Data", "formato": "DATA"},
                    {"titulo": "Descrição", "formato": "TEXTO"},
                    {"titulo": "Valor", "formato": "MOEDA"}
                ],
                "linhas": [["2026-09-01", "Mercado", 4590], ["2026-09-02", "Uber", -1200], [null, "Sem data", 1]]
            },
            {"nome": "Lançamentos", "colunas": [{"titulo": "X", "formato": "PERCENTUAL"}], "linhas": [[0.25]]}
        ]))
        .unwrap();
        let bytes = montar_xlsx(&abas).unwrap();
        // .xlsx é um ZIP: começa com "PK".
        assert_eq!(&bytes[..2], b"PK");
        assert!(bytes.len() > 1000);
        if let Ok(destino) = std::env::var("DAIRUS_XLSX_TESTE") {
            std::fs::write(destino, &bytes).unwrap();
        }
    }

    #[test]
    fn nomes_de_aba_sao_limpos_e_unicos() {
        let mut usados = Vec::new();
        assert_eq!(nome_aba("A/B:C", &mut usados), "ABC");
        assert_eq!(nome_aba("abc", &mut usados), "abc (2)");
        assert_eq!(nome_aba("", &mut usados), "Planilha");
        assert_eq!(letra_coluna(0), "A");
        assert_eq!(letra_coluna(27), "AB");
    }

    #[test]
    fn sem_abas_e_erro() {
        assert!(montar_xlsx(&[]).is_err());
    }
}
