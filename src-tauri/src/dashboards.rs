//! Layouts do painel inicial: salvar, listar, ativar e excluir. Cada layout guarda os
//! widgets com posição (x, y) e tamanho (w, h) numa grade de 12 colunas, o tipo e a
//! configuração (gráfico, período, métrica...). Tudo é validado aqui antes de gravar,
//! para um JSON estragado (importado ou editado à mão) nunca quebrar o Início.

use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::commands::AppState;

type Res<T> = Result<T, String>;

pub const COLUNAS: u32 = 12;
const MAX_WIDGETS: usize = 60;
const MAX_ALTURA: u32 = 40;
const MAX_Y: u32 = 2000;
const MAX_CONFIG_BYTES: usize = 4096;
const MAX_LAYOUTS: i64 = 20;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct WidgetNoPainel {
    /// Id da instância (o mesmo tipo pode aparecer mais de uma vez, ex.: dois gráficos).
    pub i: String,
    pub tipo: String,
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
    #[serde(default)]
    pub config: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Dashboard {
    /// Vazio = layout novo (o id é criado aqui).
    #[serde(default)]
    pub id: String,
    pub nome: String,
    #[serde(default)]
    pub ordem: i64,
    #[serde(default)]
    pub ativo: bool,
    #[serde(default)]
    pub opcoes: serde_json::Value,
    pub widgets: Vec<WidgetNoPainel>,
    #[serde(default)]
    pub atualizado_em: Option<String>,
}

fn id_valido(id: &str) -> bool {
    (1..=64).contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Confere nome, quantidade, ids únicos, limites da grade e tamanho da configuração.
pub fn validar(d: &Dashboard) -> Res<()> {
    let nome = d.nome.trim();
    if nome.is_empty() || nome.chars().count() > 60 {
        return Err("O nome do layout precisa ter de 1 a 60 caracteres.".into());
    }
    if d.widgets.len() > MAX_WIDGETS {
        return Err(format!("Um layout pode ter no máximo {MAX_WIDGETS} widgets."));
    }
    let mut ids = HashSet::new();
    for w in &d.widgets {
        if !id_valido(&w.i) || !ids.insert(w.i.as_str()) {
            return Err(format!("Widget com identificação inválida ou repetida: {}", w.i));
        }
        if w.tipo.is_empty() || w.tipo.len() > 32 || !w.tipo.chars().all(|c| c.is_ascii_lowercase()) {
            return Err(format!("Tipo de widget inválido: {}", w.tipo));
        }
        if w.w == 0 || w.w > COLUNAS || w.x + w.w > COLUNAS {
            return Err(format!("O widget {} sai da grade de {COLUNAS} colunas.", w.tipo));
        }
        if w.h == 0 || w.h > MAX_ALTURA || w.y > MAX_Y {
            return Err(format!("Altura ou posição inválida no widget {}.", w.tipo));
        }
        if !(w.config.is_null() || w.config.is_object()) || w.config.to_string().len() > MAX_CONFIG_BYTES {
            return Err(format!("Configuração inválida no widget {}.", w.tipo));
        }
    }
    if !(d.opcoes.is_null() || d.opcoes.is_object()) || d.opcoes.to_string().len() > 1024 {
        return Err("Opções do layout inválidas.".into());
    }
    Ok(())
}

fn ler(linha: &rusqlite::Row) -> rusqlite::Result<Dashboard> {
    let opcoes: String = linha.get(4)?;
    let widgets: String = linha.get(5)?;
    Ok(Dashboard {
        id: linha.get(0)?,
        nome: linha.get(1)?,
        ordem: linha.get(2)?,
        ativo: linha.get::<_, i64>(3)? == 1,
        opcoes: serde_json::from_str(&opcoes).unwrap_or(serde_json::Value::Null),
        // Um JSON estragado vira layout vazio, em vez de travar a tela.
        widgets: serde_json::from_str(&widgets).unwrap_or_default(),
        atualizado_em: linha.get(6)?,
    })
}

pub fn listar_db(conn: &Connection) -> Res<Vec<Dashboard>> {
    let mut st = conn
        .prepare("SELECT id, nome, ordem, ativo, opcoes, widgets, atualizado_em FROM dashboards ORDER BY ordem, criado_em")
        .map_err(|e| e.to_string())?;
    let lista = st.query_map([], ler).map_err(|e| e.to_string())?.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?;
    Ok(lista)
}

/// Cria ou atualiza. O primeiro layout criado já fica ativo.
pub fn salvar_db(conn: &mut Connection, mut d: Dashboard) -> Res<Dashboard> {
    validar(&d)?;
    d.nome = d.nome.trim().to_string();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let existe = !d.id.is_empty() && tx.query_row("SELECT 1 FROM dashboards WHERE id = ?1", [&d.id], |_| Ok(())).optional().map_err(|e| e.to_string())?.is_some();
    let widgets = serde_json::to_string(&d.widgets).map_err(|e| e.to_string())?;
    let opcoes = if d.opcoes.is_null() { "{}".to_string() } else { d.opcoes.to_string() };
    if existe {
        tx.execute(
            "UPDATE dashboards SET nome = ?2, ordem = ?3, opcoes = ?4, widgets = ?5, atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
            params![d.id, d.nome, d.ordem, opcoes, widgets],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let total: i64 = tx.query_row("SELECT COUNT(*) FROM dashboards", [], |r| r.get(0)).map_err(|e| e.to_string())?;
        if total >= MAX_LAYOUTS {
            return Err(format!("Você pode ter até {MAX_LAYOUTS} layouts. Exclua algum para criar outro."));
        }
        if !id_valido(&d.id) {
            d.id = Uuid::new_v4().to_string();
        }
        tx.execute(
            "INSERT INTO dashboards (id, nome, ordem, ativo, opcoes, widgets) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![d.id, d.nome, d.ordem, (total == 0) as i64, opcoes, widgets],
        )
        .map_err(|e| e.to_string())?;
    }
    let salvo = tx
        .query_row("SELECT id, nome, ordem, ativo, opcoes, widgets, atualizado_em FROM dashboards WHERE id = ?1", [&d.id], ler)
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(salvo)
}

pub fn ativar_db(conn: &mut Connection, id: &str) -> Res<()> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("UPDATE dashboards SET ativo = 0 WHERE ativo = 1", []).map_err(|e| e.to_string())?;
    if tx.execute("UPDATE dashboards SET ativo = 1 WHERE id = ?1", [id]).map_err(|e| e.to_string())? == 0 {
        return Err("Layout não encontrado.".into());
    }
    tx.commit().map_err(|e| e.to_string())
}

/// Exclui um layout (nunca o último). Se era o ativo, o primeiro da lista vira ativo.
pub fn excluir_db(conn: &mut Connection, id: &str) -> Res<()> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let total: i64 = tx.query_row("SELECT COUNT(*) FROM dashboards", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    if total <= 1 {
        return Err("Mantenha pelo menos um layout.".into());
    }
    let era_ativo: bool = tx.query_row("SELECT ativo FROM dashboards WHERE id = ?1", [id], |r| r.get::<_, i64>(0)).optional().map_err(|e| e.to_string())?.ok_or("Layout não encontrado.")? == 1;
    tx.execute("DELETE FROM dashboards WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    if era_ativo {
        tx.execute("UPDATE dashboards SET ativo = 1 WHERE id = (SELECT id FROM dashboards ORDER BY ordem, criado_em LIMIT 1)", []).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn listar_dashboards(state: State<AppState>) -> Res<Vec<Dashboard>> {
    let conn = state.conn.lock().expect("mutex envenenado");
    listar_db(&conn)
}

#[tauri::command]
pub fn salvar_dashboard(state: State<AppState>, dashboard: Dashboard) -> Res<Dashboard> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    salvar_db(&mut conn, dashboard)
}

#[tauri::command]
pub fn ativar_dashboard(state: State<AppState>, id: String) -> Res<()> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    ativar_db(&mut conn, &id)
}

#[tauri::command]
pub fn excluir_dashboard(state: State<AppState>, id: String) -> Res<()> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    excluir_db(&mut conn, &id)
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

    fn widget(i: &str, x: u32, w: u32) -> WidgetNoPainel {
        WidgetNoPainel { i: i.into(), tipo: "grafico".into(), x, y: 0, w, h: 6, config: serde_json::json!({ "exibicao": "barras", "periodo": "6m" }) }
    }

    fn layout(nome: &str, widgets: Vec<WidgetNoPainel>) -> Dashboard {
        Dashboard { id: String::new(), nome: nome.into(), ordem: 0, ativo: false, opcoes: serde_json::json!({ "compactar": true }), widgets, atualizado_em: None }
    }

    #[test]
    fn salva_lista_e_o_primeiro_fica_ativo() {
        let mut c = banco();
        let a = salvar_db(&mut c, layout("Visão geral", vec![widget("w1", 0, 6), widget("w2", 6, 6)])).unwrap();
        assert!(a.ativo);
        assert!(!a.id.is_empty());
        let b = salvar_db(&mut c, layout("Investimentos", vec![])).unwrap();
        assert!(!b.ativo);
        let lista = listar_db(&c).unwrap();
        assert_eq!(lista.len(), 2);
        assert_eq!(lista[0].widgets[1].x, 6);
        assert_eq!(lista[0].widgets[0].config["periodo"], "6m");
    }

    #[test]
    fn atualiza_posicoes_e_troca_o_ativo() {
        let mut c = banco();
        let mut a = salvar_db(&mut c, layout("A", vec![widget("w1", 0, 4)])).unwrap();
        let b = salvar_db(&mut c, layout("B", vec![])).unwrap();
        a.widgets[0].x = 8;
        a.widgets[0].y = 3;
        salvar_db(&mut c, a.clone()).unwrap();
        ativar_db(&mut c, &b.id).unwrap();
        let lista = listar_db(&c).unwrap();
        assert_eq!((lista[0].widgets[0].x, lista[0].widgets[0].y), (8, 3));
        assert!(!lista[0].ativo && lista[1].ativo);
    }

    #[test]
    fn recusa_widget_fora_da_grade_ou_repetido() {
        let mut c = banco();
        assert!(salvar_db(&mut c, layout("X", vec![widget("w1", 8, 6)])).unwrap_err().contains("12 colunas"));
        assert!(salvar_db(&mut c, layout("X", vec![widget("w1", 0, 4), widget("w1", 4, 4)])).unwrap_err().contains("repetida"));
        assert!(salvar_db(&mut c, layout("  ", vec![])).is_err());
        let mut tipo_ruim = widget("w1", 0, 4);
        tipo_ruim.tipo = "<script>".into();
        assert!(salvar_db(&mut c, layout("X", vec![tipo_ruim])).is_err());
    }

    #[test]
    fn nao_exclui_o_ultimo_e_passa_o_ativo_adiante() {
        let mut c = banco();
        let a = salvar_db(&mut c, layout("A", vec![])).unwrap();
        assert!(excluir_db(&mut c, &a.id).is_err());
        let b = salvar_db(&mut c, layout("B", vec![])).unwrap();
        excluir_db(&mut c, &a.id).unwrap();
        let lista = listar_db(&c).unwrap();
        assert_eq!(lista.len(), 1);
        assert_eq!(lista[0].id, b.id);
        assert!(lista[0].ativo);
    }

    #[test]
    fn json_estragado_vira_layout_vazio() {
        let mut c = banco();
        let a = salvar_db(&mut c, layout("A", vec![widget("w1", 0, 4)])).unwrap();
        c.execute("UPDATE dashboards SET widgets = 'isso não é json' WHERE id = ?1", [&a.id]).unwrap();
        assert!(listar_db(&c).unwrap()[0].widgets.is_empty());
    }
}
