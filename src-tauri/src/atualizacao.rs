//! Atualização do app pelo GitHub Releases: verifica se há versão nova (com a
//! lista do que mudou), baixa o instalador e o abre.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const REPOSITORIO: &str = "Daizen-Creator/dairus";
const TAMANHO_MAXIMO: u64 = 300 * 1024 * 1024;

#[derive(Deserialize)]
struct ReleaseGithub {
    tag_name: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    published_at: Option<String>,
    #[serde(default)]
    html_url: Option<String>,
    #[serde(default)]
    assets: Vec<ArquivoGithub>,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

#[derive(Deserialize)]
struct ArquivoGithub {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Novidade {
    pub versao: String,
    pub versao_atual: String,
    pub titulo: String,
    pub notas: String,
    pub publicada_em: Option<String>,
    pub pagina: Option<String>,
    pub instalador: Option<String>,
    pub tamanho_bytes: u64,
}

/// "v1.2.3" ou "1.2.3-beta" → (1, 2, 3).
pub fn versao(texto: &str) -> Option<(u64, u64, u64)> {
    let limpo = texto.trim().trim_start_matches(['v', 'V']);
    let nucleo = limpo.split(['-', '+']).next()?;
    let mut partes = nucleo.split('.').map(|p| p.parse::<u64>().ok());
    Some((partes.next()??, partes.next().flatten().unwrap_or(0), partes.next().flatten().unwrap_or(0)))
}

fn instalador_de(release: &ReleaseGithub) -> Option<&ArquivoGithub> {
    release
        .assets
        .iter()
        .find(|a| a.name.to_lowercase().ends_with("-setup.exe"))
        .or_else(|| release.assets.iter().find(|a| a.name.to_lowercase().ends_with(".exe")))
}

fn novidade_de(release: ReleaseGithub, atual: &str) -> Option<Novidade> {
    if release.draft || release.prerelease {
        return None;
    }
    if versao(&release.tag_name)? <= versao(atual)? {
        return None;
    }
    let instalador = instalador_de(&release);
    Some(Novidade {
        versao: release.tag_name.trim_start_matches(['v', 'V']).to_string(),
        versao_atual: atual.to_string(),
        titulo: release.name.clone().unwrap_or_else(|| release.tag_name.clone()),
        notas: release.body.clone().unwrap_or_default(),
        publicada_em: release.published_at.clone(),
        pagina: release.html_url.clone(),
        instalador: instalador.map(|a| a.browser_download_url.clone()),
        tamanho_bytes: instalador.map(|a| a.size).unwrap_or(0),
    })
}

/// Consulta a última versão publicada. `None` = já está na mais nova.
#[tauri::command]
pub async fn verificar_atualizacao(app: AppHandle) -> Result<Option<Novidade>, String> {
    let atual = app.package_info().version.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let url = format!("https://api.github.com/repos/{REPOSITORIO}/releases/latest");
        let resposta = ureq::get(&url)
            .set("User-Agent", "Dairus")
            .set("Accept", "application/vnd.github+json")
            .timeout(std::time::Duration::from_secs(15))
            .call();
        let release: ReleaseGithub = match resposta {
            Ok(r) => serde_json::from_reader(r.into_reader()).map_err(|e| e.to_string())?,
            // 404: nenhuma versão publicada ainda (ou repositório privado).
            Err(ureq::Error::Status(404, _)) => return Ok(None),
            Err(e) => return Err(format!("Não foi possível verificar atualizações: {e}")),
        };
        Ok(novidade_de(release, &atual))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Baixa o instalador da versão nova e o abre. O app fecha logo depois, para o instalador poder substituir os arquivos.
#[tauri::command]
pub async fn instalar_atualizacao(app: AppHandle, url: String) -> Result<(), String> {
    let prefixo = format!("https://github.com/{REPOSITORIO}/releases/download/");
    if !url.starts_with(&prefixo) || !url.to_lowercase().ends_with(".exe") {
        return Err("Endereço de atualização não reconhecido.".into());
    }
    let destino = tauri::async_runtime::spawn_blocking(move || -> Result<std::path::PathBuf, String> {
        let nome = url.rsplit('/').next().unwrap_or("Dairus-setup.exe").replace(['\\', ':'], "_");
        let destino = std::env::temp_dir().join(nome);
        let resposta = ureq::get(&url)
            .set("User-Agent", "Dairus")
            .timeout(std::time::Duration::from_secs(600))
            .call()
            .map_err(|e| format!("Falha ao baixar a atualização: {e}"))?;
        let mut leitor = std::io::Read::take(resposta.into_reader(), TAMANHO_MAXIMO + 1);
        let mut bytes = Vec::new();
        std::io::Read::read_to_end(&mut leitor, &mut bytes).map_err(|e| e.to_string())?;
        if bytes.len() as u64 > TAMANHO_MAXIMO || bytes.len() < 1024 || &bytes[..2] != b"MZ" {
            return Err("O arquivo baixado não parece ser um instalador válido.".into());
        }
        std::fs::write(&destino, bytes).map_err(|e| e.to_string())?;
        Ok(destino)
    })
    .await
    .map_err(|e| e.to_string())??;

    log::info!("abrindo instalador da atualização: {}", destino.display());
    std::process::Command::new(&destino).spawn().map_err(|e| format!("Não foi possível abrir o instalador: {e}"))?;
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::*;

    fn release(tag: &str) -> ReleaseGithub {
        ReleaseGithub {
            tag_name: tag.into(),
            name: Some(format!("Dairus {tag}")),
            body: Some("- Novidade".into()),
            published_at: None,
            html_url: None,
            assets: vec![
                ArquivoGithub { name: "latest.json".into(), browser_download_url: "x".into(), size: 1 },
                ArquivoGithub { name: "Dairus_0.2.0_x64-setup.exe".into(), browser_download_url: "https://github.com/a".into(), size: 9 },
            ],
            draft: false,
            prerelease: false,
        }
    }

    #[test]
    fn compara_versoes() {
        assert_eq!(versao("v1.2.3"), Some((1, 2, 3)));
        assert_eq!(versao("0.2"), Some((0, 2, 0)));
        assert_eq!(versao("1.0.0-beta.1"), Some((1, 0, 0)));
        assert_eq!(versao("abc"), None);
    }

    #[test]
    fn so_avisa_quando_e_mais_nova() {
        let n = novidade_de(release("v0.2.0"), "0.1.0").unwrap();
        assert_eq!(n.versao, "0.2.0");
        assert_eq!(n.instalador.as_deref(), Some("https://github.com/a"));
        assert_eq!(n.notas, "- Novidade");
        assert!(novidade_de(release("v0.1.0"), "0.1.0").is_none());
        let mut pre = release("v9.0.0");
        pre.prerelease = true;
        assert!(novidade_de(pre, "0.1.0").is_none());
    }
}
