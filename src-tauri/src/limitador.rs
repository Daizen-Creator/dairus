// Limite de tentativas de senha e código de recuperação (contra força bruta).
//
// O Argon2 já deixa cada tentativa lenta; aqui as falhas ficam gravadas em disco
// (fechar e abrir o app não zera a contagem) e, a partir da 5ª erro seguido, o
// Dairus recusa novas tentativas por um tempo que dobra a cada erro (1 min → 1 h).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Erros seguidos liberados antes de começar a esperar.
pub const LIVRES: u32 = 5;
const ESPERA_INICIAL: u64 = 60;
const ESPERA_MAXIMA: u64 = 3600;

#[derive(Default, Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct Registro {
    pub falhas: u32,
    /// Unix (segundos) até quando novas tentativas são recusadas.
    pub bloqueado_ate: u64,
}

/// Quantos segundos esperar depois de `falhas` erros seguidos.
pub fn espera_para(falhas: u32) -> u64 {
    if falhas < LIVRES {
        return 0;
    }
    let dobras = (falhas - LIVRES).min(10);
    (ESPERA_INICIAL << dobras).min(ESPERA_MAXIMA)
}

fn agora() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

static TRAVA: Mutex<()> = Mutex::new(());

fn arquivo(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|p| p.join("tentativas.json"))
}

fn ler(caminho: &Path) -> HashMap<String, Registro> {
    std::fs::read(caminho).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn gravar(caminho: &Path, mapa: &HashMap<String, Registro>) {
    if let Some(pasta) = caminho.parent() {
        let _ = std::fs::create_dir_all(pasta);
    }
    if let Ok(json) = serde_json::to_vec(mapa) {
        let _ = std::fs::write(caminho, json);
    }
}

fn mensagem(segundos: u64) -> String {
    let tempo = if segundos >= 60 { format!("{} min", segundos.div_ceil(60)) } else { format!("{segundos}s") };
    format!("Muitas tentativas erradas. Por segurança, tente de novo em {tempo}.")
}

/// Recusa na hora se a chave ainda está no tempo de espera.
pub fn conferir_em(caminho: &Path, chave: &str, agora: u64) -> Result<(), String> {
    let _g = TRAVA.lock().unwrap_or_else(|e| e.into_inner());
    match ler(caminho).get(chave) {
        Some(r) if r.bloqueado_ate > agora => Err(mensagem(r.bloqueado_ate - agora)),
        _ => Ok(()),
    }
}

/// Conta um erro e devolve o registro atualizado.
pub fn falhou_em(caminho: &Path, chave: &str, agora: u64) -> Registro {
    let _g = TRAVA.lock().unwrap_or_else(|e| e.into_inner());
    let mut mapa = ler(caminho);
    let r = mapa.entry(chave.to_string()).or_default();
    r.falhas = r.falhas.saturating_add(1);
    let espera = espera_para(r.falhas);
    r.bloqueado_ate = if espera > 0 { agora + espera } else { 0 };
    let copia = *r;
    gravar(caminho, &mapa);
    copia
}

pub fn acertou_em(caminho: &Path, chave: &str) {
    let _g = TRAVA.lock().unwrap_or_else(|e| e.into_inner());
    let mut mapa = ler(caminho);
    if mapa.remove(chave).is_some() {
        gravar(caminho, &mapa);
    }
}

/// Executa uma tentativa protegida: recusa durante a espera, conta o erro quando
/// `eh_erro_de_senha` reconhece a falha e zera a contagem no acerto.
pub fn tentar<T>(app: &AppHandle, chave: &str, eh_erro_de_senha: impl Fn(&str) -> bool, f: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let Some(caminho) = arquivo(app) else { return f() };
    conferir_em(&caminho, chave, agora())?;
    match f() {
        Ok(v) => {
            acertou_em(&caminho, chave);
            Ok(v)
        }
        Err(erro) if eh_erro_de_senha(&erro) => {
            let r = falhou_em(&caminho, chave, agora());
            log::warn!("tentativa de senha errada ({chave}): {} seguidas", r.falhas);
            if r.bloqueado_ate > 0 {
                Err(format!("{erro} {}", mensagem(r.bloqueado_ate.saturating_sub(agora()))))
            } else {
                let restam = LIVRES - r.falhas;
                Err(format!("{erro} Restam {restam} tentativa{} antes de uma pausa de segurança.", if restam == 1 { "" } else { "s" }))
            }
        }
        Err(erro) => Err(erro),
    }
}

/// Erros que contam como senha/código errado.
pub fn erro_de_senha(erro: &str) -> bool {
    erro.contains("incorret")
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn espera_dobra_e_tem_teto() {
        assert_eq!(espera_para(4), 0);
        assert_eq!(espera_para(5), 60);
        assert_eq!(espera_para(6), 120);
        assert_eq!(espera_para(8), 480);
        assert_eq!(espera_para(20), 3600);
        assert_eq!(espera_para(u32::MAX), 3600);
    }

    #[test]
    fn bloqueia_depois_de_cinco_erros_e_libera_no_acerto() {
        let pasta = std::env::temp_dir().join(format!("dairus-limite-{}", uuid::Uuid::new_v4()));
        let arq = pasta.join("tentativas.json");
        for _ in 0..4 {
            assert_eq!(falhou_em(&arq, "senha:x", 1000).bloqueado_ate, 0);
        }
        assert!(conferir_em(&arq, "senha:x", 1000).is_ok());
        assert_eq!(falhou_em(&arq, "senha:x", 1000).bloqueado_ate, 1060);
        // Gravado em disco: continua valendo para quem "reabrir o app".
        assert!(conferir_em(&arq, "senha:x", 1030).unwrap_err().contains("30s"));
        assert!(conferir_em(&arq, "senha:x", 1000).unwrap_err().contains("1 min"));
        assert!(conferir_em(&arq, "senha:y", 1030).is_ok());
        assert!(conferir_em(&arq, "senha:x", 1061).is_ok());
        acertou_em(&arq, "senha:x");
        assert_eq!(ler(&arq).get("senha:x"), None);
        let _ = std::fs::remove_dir_all(pasta);
    }
}
