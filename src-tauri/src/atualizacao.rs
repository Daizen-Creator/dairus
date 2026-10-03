//! Atualização automática do app. Fonte principal: GitHub Releases; reserva: um
//! `latest.json` público no Supabase Storage (bucket `atualizacoes`), útil quando o
//! GitHub limita as consultas. Baixa o instalador em segundo plano (com progresso),
//! confere o tamanho, o cabeçalho de executável e o SHA-256 (quando publicado) e
//! instala em modo passivo (só a barra do instalador), reabrindo o Dairus no fim.
//!
//! Para testar sem publicar (só em compilação de desenvolvimento, `npm run tauri dev`):
//! - `DAIRUS_VERSAO_FINGIDA=0.0.1` faz o app se achar antigo e encontrar a versão publicada;
//! - `DAIRUS_SIMULAR_FALHA=download` (ou `sha`) faz o download falhar no meio (ou na conferência).

use std::io::Read;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};

const REPOSITORIO: &str = "Daizen-Creator/dairus";
const SUPABASE_LATEST: &str = "https://wcxfjmifikmnydfpepiq.supabase.co/storage/v1/object/public/atualizacoes/latest.json";
const TAMANHO_MAXIMO: u64 = 300 * 1024 * 1024;
/// Sem receber nenhum byte por este tempo, o download é dado como travado (em vez de esperar para sempre).
const DOWNLOAD_PARADO: std::time::Duration = std::time::Duration::from_secs(30);

/// Progresso enviado para a tela de atualização (evento "atualizacao-progresso").
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Progresso {
    /// "baixando" | "conferindo" | "pronto"
    pub fase: &'static str,
    pub baixados: u64,
    /// 0 quando o servidor não informou o tamanho.
    pub total: u64,
}

/// Simulações para testar a tela de atualização (só em desenvolvimento).
fn simulacao(nome: &str) -> Option<String> {
    if cfg!(debug_assertions) {
        std::env::var(nome).ok().filter(|v| !v.is_empty())
    } else {
        None
    }
}

/// Versão que o app considera instalada (a real, ou a fingida em desenvolvimento).
fn versao_instalada(app: &AppHandle) -> String {
    simulacao("DAIRUS_VERSAO_FINGIDA").unwrap_or_else(|| app.package_info().version.to_string())
}

/// Instalador já baixado esperando o app fechar (opção "instalar ao sair").
static PENDENTE_AO_SAIR: Mutex<Option<PathBuf>> = Mutex::new(None);

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

/// Formato do `latest.json` publicado no Supabase pelo workflow de release.
#[derive(Deserialize)]
struct ManifestoSupabase {
    versao: String,
    #[serde(default)]
    titulo: Option<String>,
    #[serde(default)]
    notas: Option<String>,
    #[serde(default)]
    publicada_em: Option<String>,
    instalador: String,
    #[serde(default)]
    tamanho_bytes: u64,
    #[serde(default)]
    sha256: Option<String>,
}

#[derive(Serialize, Debug, PartialEq, Clone)]
pub struct Novidade {
    pub versao: String,
    pub versao_atual: String,
    pub titulo: String,
    pub notas: String,
    pub publicada_em: Option<String>,
    pub pagina: Option<String>,
    pub instalador: Option<String>,
    pub tamanho_bytes: u64,
    /// SHA-256 esperado do instalador (hex), quando publicado junto.
    pub sha256: Option<String>,
    pub fonte: String,
    pub beta: bool,
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

/// Arquivo `<instalador>.sha256` publicado ao lado (conteúdo: "hash  nome").
fn sha_de(release: &ReleaseGithub, instalador: &str) -> Option<String> {
    let alvo = format!("{}.sha256", instalador.to_lowercase());
    let a = release.assets.iter().find(|a| a.name.to_lowercase() == alvo)?;
    let texto = baixar_texto(&a.browser_download_url).ok()?;
    hash_valido(texto.split_whitespace().next()?)
}

fn hash_valido(h: &str) -> Option<String> {
    let h = h.trim().to_lowercase();
    (h.len() == 64 && h.chars().all(|c| c.is_ascii_hexdigit())).then_some(h)
}

fn novidade_de(release: ReleaseGithub, atual: &str, aceitar_beta: bool) -> Option<Novidade> {
    if release.draft || (release.prerelease && !aceitar_beta) {
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
        sha256: None,
        fonte: "GitHub".into(),
        beta: release.prerelease,
    })
}

fn novidade_supabase(m: ManifestoSupabase, atual: &str) -> Option<Novidade> {
    if versao(&m.versao)? <= versao(atual)? || !url_permitida(&m.instalador) {
        return None;
    }
    Some(Novidade {
        versao: m.versao.trim_start_matches(['v', 'V']).to_string(),
        versao_atual: atual.to_string(),
        titulo: m.titulo.unwrap_or_else(|| format!("Dairus {}", m.versao)),
        notas: m.notas.unwrap_or_default(),
        publicada_em: m.publicada_em,
        pagina: None,
        instalador: Some(m.instalador),
        tamanho_bytes: m.tamanho_bytes,
        sha256: m.sha256.as_deref().and_then(hash_valido),
        fonte: "Supabase".into(),
        beta: false,
    })
}

/// Só baixa instaladores do próprio repositório no GitHub ou do Storage do projeto no Supabase.
pub fn url_permitida(url: &str) -> bool {
    let github = format!("https://github.com/{REPOSITORIO}/releases/download/");
    let supabase = "https://wcxfjmifikmnydfpepiq.supabase.co/storage/v1/object/public/atualizacoes/";
    (url.starts_with(&github) || url.starts_with(supabase)) && url.to_lowercase().ends_with(".exe") && !url.contains("..")
}

fn baixar_texto(url: &str) -> Result<String, String> {
    ureq::get(url)
        .set("User-Agent", "Dairus")
        .timeout(std::time::Duration::from_secs(15))
        .call()
        .map_err(|e| e.to_string())?
        .into_string()
        .map_err(|e| e.to_string())
}

fn consultar_github(atual: &str, beta: bool) -> Result<Option<Novidade>, String> {
    let url = if beta {
        format!("https://api.github.com/repos/{REPOSITORIO}/releases?per_page=10")
    } else {
        format!("https://api.github.com/repos/{REPOSITORIO}/releases/latest")
    };
    let resposta = ureq::get(&url)
        .set("User-Agent", "Dairus")
        .set("Accept", "application/vnd.github+json")
        .timeout(std::time::Duration::from_secs(15))
        .call();
    let releases: Vec<ReleaseGithub> = match resposta {
        Ok(r) if beta => serde_json::from_reader(r.into_reader()).map_err(|e| e.to_string())?,
        Ok(r) => vec![serde_json::from_reader(r.into_reader()).map_err(|e| e.to_string())?],
        Err(ureq::Error::Status(404, _)) => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    // A mais nova que vale (estável, ou beta se escolhido).
    let melhor = releases
        .into_iter()
        .filter_map(|r| novidade_de(clonar(&r), atual, beta).map(|n| (r, n)))
        .max_by_key(|(_, n)| versao(&n.versao));
    Ok(melhor.map(|(r, mut n)| {
        if let Some(inst) = instalador_de(&r) {
            n.sha256 = sha_de(&r, &inst.name);
        }
        n
    }))
}

fn clonar(r: &ReleaseGithub) -> ReleaseGithub {
    ReleaseGithub {
        tag_name: r.tag_name.clone(),
        name: r.name.clone(),
        body: r.body.clone(),
        published_at: r.published_at.clone(),
        html_url: r.html_url.clone(),
        assets: r.assets.iter().map(|a| ArquivoGithub { name: a.name.clone(), browser_download_url: a.browser_download_url.clone(), size: a.size }).collect(),
        draft: r.draft,
        prerelease: r.prerelease,
    }
}

fn consultar_supabase(atual: &str) -> Result<Option<Novidade>, String> {
    match ureq::get(SUPABASE_LATEST).set("User-Agent", "Dairus").timeout(std::time::Duration::from_secs(15)).call() {
        Ok(r) => {
            let m: ManifestoSupabase = serde_json::from_reader(r.into_reader()).map_err(|e| e.to_string())?;
            Ok(novidade_supabase(m, atual))
        }
        Err(ureq::Error::Status(400 | 404, _)) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Consulta a última versão: GitHub primeiro; se ele falhar, o Supabase. `None` = já está na mais nova.
#[tauri::command]
pub async fn verificar_atualizacao(app: AppHandle, beta: Option<bool>) -> Result<Option<Novidade>, String> {
    let atual = versao_instalada(&app);
    let beta = beta.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || match consultar_github(&atual, beta) {
        Ok(Some(n)) => Ok(Some(n)),
        Ok(None) => consultar_supabase(&atual).or(Ok(None)),
        Err(erro_github) => consultar_supabase(&atual).map_err(|erro_supa| format!("Não foi possível verificar atualizações (GitHub: {erro_github}; Supabase: {erro_supa})")),
    })
    .await
    .map_err(|e| e.to_string())?
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// Confere o instalador baixado: tamanho, cabeçalho "MZ" de executável e SHA-256 (se houver).
pub fn conferir_instalador(bytes: &[u8], sha256: Option<&str>) -> Result<(), String> {
    if bytes.len() as u64 > TAMANHO_MAXIMO || bytes.len() < 1024 || &bytes[..2] != b"MZ" {
        return Err("O arquivo baixado não parece ser um instalador válido.".into());
    }
    if let Some(esperado) = sha256 {
        let obtido = sha256_hex(bytes);
        if !obtido.eq_ignore_ascii_case(esperado) {
            return Err("O instalador baixado não confere com a assinatura (SHA-256) publicada. Não foi instalado.".into());
        }
    }
    Ok(())
}

/// Baixa o instalador para a pasta de cache do app, emitindo "atualizacao-progresso" ([`Progresso`]).
/// Grava primeiro num `.parcial` e só renomeia depois de conferido, então um download
/// interrompido nunca vira um instalador "pronto". Devolve o caminho do arquivo.
#[tauri::command]
pub async fn baixar_atualizacao(app: AppHandle, url: String, sha256: Option<String>) -> Result<String, String> {
    if !url_permitida(&url) {
        return Err("Endereço de atualização não reconhecido.".into());
    }
    let pasta = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("atualizacoes");
    std::fs::create_dir_all(&pasta).map_err(|e| e.to_string())?;
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let nome = url.rsplit('/').next().unwrap_or("Dairus-setup.exe").replace(['\\', ':', '?', '*'], "_");
        let destino = pasta.join(&nome);
        let avisar = |fase: &'static str, baixados: u64, total: u64| {
            let _ = app2.emit("atualizacao-progresso", Progresso { fase, baixados, total });
        };
        // Já baixado e conferido antes? Reaproveita.
        if let Ok(existente) = std::fs::read(&destino) {
            if sha256.is_some() && conferir_instalador(&existente, sha256.as_deref()).is_ok() {
                let n = existente.len() as u64;
                avisar("pronto", n, n);
                return Ok(destino.to_string_lossy().into_owned());
            }
        }
        let falha = simulacao("DAIRUS_SIMULAR_FALHA");
        let agente = ureq::AgentBuilder::new()
            .timeout_connect(std::time::Duration::from_secs(20))
            .timeout_read(DOWNLOAD_PARADO)
            .user_agent("Dairus")
            .build();
        let resposta = agente.get(&url).call().map_err(|e| match e {
            ureq::Error::Status(c, _) => format!("O servidor de atualizações respondeu com erro {c}. Tente de novo mais tarde."),
            ureq::Error::Transport(t) => format!("Sem conexão para baixar a atualização ({t})."),
        })?;
        let total: u64 = resposta.header("Content-Length").and_then(|v| v.parse().ok()).unwrap_or(0);
        if total > TAMANHO_MAXIMO {
            return Err("O instalador publicado é grande demais; não foi baixado.".into());
        }
        let mut leitor = resposta.into_reader().take(TAMANHO_MAXIMO + 1);
        let mut bytes = Vec::with_capacity(total as usize);
        let mut bloco = [0u8; 64 * 1024];
        let mut ultimo_aviso = 0u64;
        avisar("baixando", 0, total);
        loop {
            let n = leitor.read(&mut bloco).map_err(|e| {
                if e.kind() == std::io::ErrorKind::TimedOut || e.kind() == std::io::ErrorKind::WouldBlock {
                    "O download parou de responder. Verifique a internet e tente de novo.".to_string()
                } else {
                    format!("A conexão caiu durante o download ({e}). Tente de novo.")
                }
            })?;
            if n == 0 {
                break;
            }
            bytes.extend_from_slice(&bloco[..n]);
            let baixados = bytes.len() as u64;
            // No máximo um aviso a cada 256 KB, para não inundar a tela.
            if baixados - ultimo_aviso >= 256 * 1024 {
                ultimo_aviso = baixados;
                avisar("baixando", baixados, total);
            }
            if falha.as_deref() == Some("download") && baixados > total / 2 {
                return Err("A conexão caiu durante o download (simulado). Tente de novo.".into());
            }
        }
        if total > 0 && (bytes.len() as u64) < total {
            return Err("O download terminou incompleto. Tente de novo.".into());
        }
        avisar("conferindo", bytes.len() as u64, total);
        let esperado = if falha.as_deref() == Some("sha") { Some("0".repeat(64)) } else { sha256.clone() };
        conferir_instalador(&bytes, esperado.as_deref())?;
        // Só o instalador desta versão fica na pasta (os antigos ocupariam espaço à toa).
        if let Ok(itens) = std::fs::read_dir(&pasta) {
            for item in itens.flatten() {
                if item.path() != destino {
                    let _ = std::fs::remove_file(item.path());
                }
            }
        }
        let parcial = destino.with_extension("parcial");
        std::fs::write(&parcial, &bytes).map_err(|e| format!("Não foi possível salvar o instalador (disco cheio ou sem permissão?): {e}"))?;
        std::fs::rename(&parcial, &destino).map_err(|e| format!("Não foi possível salvar o instalador: {e}"))?;
        avisar("pronto", bytes.len() as u64, total);
        log::info!("atualização baixada e conferida: {}", destino.display());
        Ok(destino.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn caminho_baixado(app: &AppHandle, caminho: &str) -> Result<PathBuf, String> {
    let pasta = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("atualizacoes");
    let p = PathBuf::from(caminho);
    if p.parent() != Some(pasta.as_path()) || !caminho.to_lowercase().ends_with(".exe") || !p.exists() {
        return Err("Instalador não encontrado. Baixe a atualização de novo.".into());
    }
    Ok(p)
}

/// Parâmetros do instalador NSIS do Tauri: `/P` = passivo (só a barra de progresso; fecha o
/// Dairus sozinho se ele ainda estiver aberto), `/UPDATE` = atualização (mantém atalhos e
/// configurações) e `/R` = reabre o Dairus quando terminar.
pub fn argumentos_instalador(reabrir: bool) -> Vec<&'static str> {
    let mut args = vec!["/P", "/UPDATE"];
    if reabrir {
        args.push("/R");
    }
    args
}

/// Roda o instalador direto, sem passar pelo `cmd` (com o `cmd`, as aspas do caminho
/// quebravam o comando: o Dairus fechava e nada era instalado).
fn executar_instalador(instalador: &PathBuf, reabrir: bool) -> Result<(), String> {
    std::process::Command::new(instalador)
        .args(argumentos_instalador(reabrir))
        .spawn()
        .map_err(|e| format!("Não foi possível abrir o instalador: {e}"))?;
    Ok(())
}

/// Instala agora o que já foi baixado: o Dairus fecha, o instalador roda e o app reabre sozinho.
#[tauri::command]
pub fn instalar_baixada(app: AppHandle, caminho: String) -> Result<(), String> {
    let p = caminho_baixado(&app, &caminho)?;
    log::info!("instalando atualização: {}", p.display());
    executar_instalador(&p, true)?;
    // Dá um instante para a tela mostrar "Reiniciando…" antes de fechar.
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(600));
        app.exit(0);
    });
    Ok(())
}

/// Deixa a atualização para quando o Dairus for fechado (sem interromper agora).
#[tauri::command]
pub fn instalar_ao_sair(app: AppHandle, caminho: String) -> Result<(), String> {
    let p = caminho_baixado(&app, &caminho)?;
    *PENDENTE_AO_SAIR.lock().expect("mutex envenenado") = Some(p);
    Ok(())
}

/// Chamado no fechamento do app: instala a atualização deixada para depois (sem reabrir).
pub fn ao_sair() {
    if let Some(p) = PENDENTE_AO_SAIR.lock().ok().and_then(|mut g| g.take()) {
        log::info!("instalando atualização ao sair: {}", p.display());
        let _ = executar_instalador(&p, false);
    }
}

/// Compatibilidade: baixa e instala em seguida.
#[tauri::command]
pub async fn instalar_atualizacao(app: AppHandle, url: String) -> Result<(), String> {
    let caminho = baixar_atualizacao(app.clone(), url, None).await?;
    instalar_baixada(app, caminho)
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
    fn instalador_roda_direto_com_os_parametros_do_tauri() {
        assert_eq!(argumentos_instalador(true), vec!["/P", "/UPDATE", "/R"]);
        assert_eq!(argumentos_instalador(false), vec!["/P", "/UPDATE"]);
    }

    #[cfg(windows)]
    #[test]
    fn abre_programa_em_caminho_com_espacos() {
        // O defeito antigo: "cmd /C" com o caminho entre aspas não executava nada.
        // Agora o instalador é aberto direto, e um caminho com espaços precisa funcionar.
        let pasta = std::env::temp_dir().join("dairus teste atualização");
        std::fs::create_dir_all(&pasta).unwrap();
        let alvo = pasta.join("programa de teste.exe");
        let sistema = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
        std::fs::copy(PathBuf::from(sistema).join("System32").join("whoami.exe"), &alvo).unwrap();
        let saida = std::process::Command::new(&alvo).output().unwrap();
        assert!(saida.status.success());
        let _ = std::fs::remove_dir_all(&pasta);
    }

    #[test]
    fn compara_versoes() {
        assert_eq!(versao("v1.2.3"), Some((1, 2, 3)));
        assert_eq!(versao("0.2"), Some((0, 2, 0)));
        assert_eq!(versao("1.0.0-beta.1"), Some((1, 0, 0)));
        assert_eq!(versao("abc"), None);
    }

    #[test]
    fn so_avisa_quando_e_mais_nova_e_beta_so_se_pedir() {
        let n = novidade_de(release("v0.2.0"), "0.1.0", false).unwrap();
        assert_eq!(n.versao, "0.2.0");
        assert_eq!(n.instalador.as_deref(), Some("https://github.com/a"));
        assert!(novidade_de(release("v0.1.0"), "0.1.0", false).is_none());
        let mut pre = release("v9.0.0");
        pre.prerelease = true;
        assert!(novidade_de(clonar(&pre), "0.1.0", false).is_none());
        assert!(novidade_de(pre, "0.1.0", true).unwrap().beta);
    }

    #[test]
    fn manifesto_do_supabase() {
        let m = ManifestoSupabase {
            versao: "0.3.0".into(), titulo: None, notas: Some("x".into()), publicada_em: None,
            instalador: "https://wcxfjmifikmnydfpepiq.supabase.co/storage/v1/object/public/atualizacoes/Dairus_0.3.0_x64-setup.exe".into(),
            tamanho_bytes: 10, sha256: Some("A".repeat(64)),
        };
        let n = novidade_supabase(m, "0.2.0").unwrap();
        assert_eq!(n.fonte, "Supabase");
        assert_eq!(n.sha256.as_deref(), Some("a".repeat(64).as_str()));
        let ruim = ManifestoSupabase { versao: "9.0.0".into(), titulo: None, notas: None, publicada_em: None, instalador: "https://malicioso.com/x.exe".into(), tamanho_bytes: 0, sha256: None };
        assert!(novidade_supabase(ruim, "0.2.0").is_none());
    }

    #[test]
    fn so_aceita_enderecos_do_projeto() {
        assert!(url_permitida("https://github.com/Daizen-Creator/dairus/releases/download/v1/Dairus_1_x64-setup.exe"));
        assert!(!url_permitida("https://github.com/outro/repo/releases/download/v1/x.exe"));
        assert!(!url_permitida("https://github.com/Daizen-Creator/dairus/releases/download/v1/../x.exe"));
        assert!(!url_permitida("https://github.com/Daizen-Creator/dairus/releases/download/v1/x.zip"));
    }

    #[test]
    fn confere_instalador_e_sha() {
        let mut bytes = b"MZ".to_vec();
        bytes.resize(2048, 7);
        let h = sha256_hex(&bytes);
        assert!(conferir_instalador(&bytes, Some(&h)).is_ok());
        assert!(conferir_instalador(&bytes, Some(&"0".repeat(64))).unwrap_err().contains("SHA-256"));
        assert!(conferir_instalador(b"PK", None).is_err());
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }
}
