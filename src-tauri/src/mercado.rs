//! Busca de dados públicos de mercado (cotações, Selic/CDI/IPCA, câmbio, cripto).
//! Só fala com uma lista fixa de serviços, sempre por HTTPS.

const SERVICOS: [&str; 6] = [
    "https://brapi.dev/api/",
    "https://api.bcb.gov.br/dados/serie/",
    "https://economia.awesomeapi.com.br/",
    "https://api.coingecko.com/api/v3/",
    "https://olinda.bcb.gov.br/olinda/servico/",
    "https://api.mercadolibre.com/sites/MLB/search",
];

pub fn url_permitida(url: &str) -> bool {
    SERVICOS.iter().any(|s| url.starts_with(s)) && !url.contains("..") && !url.contains('@')
}

/// GET que devolve JSON. Usado pela aba de Investimentos.
#[tauri::command]
pub async fn buscar_json_mercado(url: String) -> Result<serde_json::Value, String> {
    if !url_permitida(&url) {
        return Err("Serviço de dados não permitido.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let resposta = ureq::get(&url)
            .set("User-Agent", "Dairus")
            .set("Accept", "application/json")
            .timeout(std::time::Duration::from_secs(20))
            .call();
        match resposta {
            Ok(r) => serde_json::from_reader(r.into_reader()).map_err(|e| format!("Resposta inválida do serviço: {e}")),
            Err(ureq::Error::Status(401, _)) | Err(ureq::Error::Status(403, _)) => {
                Err("O serviço recusou o acesso (verifique o token da brapi em Investimentos → Configurar).".into())
            }
            Err(ureq::Error::Status(429, _)) => Err("Limite de consultas do serviço atingido; tente mais tarde.".into()),
            Err(ureq::Error::Status(c, _)) => Err(format!("O serviço respondeu com erro {c}.")),
            Err(e) => Err(format!("Sem conexão com o serviço de dados: {e}")),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn so_aceita_servicos_conhecidos() {
        assert!(url_permitida("https://brapi.dev/api/quote/PETR4"));
        assert!(url_permitida("https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json"));
        assert!(!url_permitida("http://brapi.dev/api/quote/PETR4"));
        assert!(!url_permitida("https://brapi.dev.evil.com/api/"));
        assert!(!url_permitida("https://brapi.dev/api/@evil.com"));
        assert!(!url_permitida("https://exemplo.com"));
    }
}
