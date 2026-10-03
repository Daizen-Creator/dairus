//! Busca de dados públicos de mercado (cotações, Selic/CDI/IPCA, câmbio, cripto).
//! Só fala com uma lista fixa de serviços, sempre por HTTPS.

const SERVICOS: [&str; 5] = [
    "https://brapi.dev/api/",
    "https://api.bcb.gov.br/dados/serie/",
    "https://economia.awesomeapi.com.br/",
    "https://api.coingecko.com/api/v3/",
    "https://olinda.bcb.gov.br/olinda/servico/",
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

/// Comparadores de preço consultados pelo Radar de Compras (mesma base de ofertas:
/// Magazine Luiza, Amazon, Casas Bahia, Fast Shop, Mercado Livre, Kabum…). Se o primeiro
/// falhar, tenta o segundo.
const COMPARADORES: [(&str, &str); 2] = [("Zoom", "https://www.zoom.com.br"), ("Buscapé", "https://www.buscape.com.br")];

/// Os comparadores só entregam a página completa para navegadores comuns.
const AGENTE_NAVEGADOR: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/// Tira o JSON embutido pelo Next.js (`<script id="__NEXT_DATA__">`) e devolve a lista de produtos.
pub fn produtos_da_pagina(html: &str) -> Option<serde_json::Value> {
    let marca = html.find("id=\"__NEXT_DATA__\"")?;
    let inicio = marca + html[marca..].find('>')? + 1;
    let fim = inicio + html[inicio..].find("</script>")?;
    let dados: serde_json::Value = serde_json::from_str(&html[inicio..fim]).ok()?;
    let hits = dados.pointer("/props/initialReduxState/hits/hits")?;
    hits.is_array().then(|| hits.clone())
}

/// Busca um produto nos comparadores de preço e devolve { fonte, site, produtos }.
#[tauri::command]
pub async fn buscar_precos_lojas(termo: String) -> Result<serde_json::Value, String> {
    let termo: String = termo.trim().chars().take(120).collect();
    if termo.is_empty() {
        return Err("Informe o nome do produto.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut ultimo_erro = String::from("Nenhum comparador respondeu.");
        for (fonte, site) in COMPARADORES {
            let resposta = ureq::get(&format!("{site}/search"))
                .query("q", &termo)
                .set("User-Agent", AGENTE_NAVEGADOR)
                .set("Accept", "text/html,application/xhtml+xml")
                .set("Accept-Language", "pt-BR,pt;q=0.9")
                .timeout(std::time::Duration::from_secs(20))
                .call();
            match resposta.map(|r| r.into_string()) {
                Ok(Ok(html)) => match produtos_da_pagina(&html) {
                    Some(produtos) => return Ok(serde_json::json!({ "fonte": fonte, "site": site, "produtos": produtos })),
                    None => ultimo_erro = format!("O {fonte} mudou o formato da página."),
                },
                Ok(Err(e)) => ultimo_erro = format!("Resposta inválida do {fonte}: {e}"),
                Err(ureq::Error::Status(c, _)) => ultimo_erro = format!("O {fonte} respondeu com erro {c}."),
                Err(e) => ultimo_erro = format!("Sem conexão com o {fonte}: {e}"),
            }
        }
        Err(ultimo_erro)
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
        assert!(!url_permitida("https://api.mercadolibre.com/sites/MLB/search?q=x"));
    }

    #[test]
    fn le_produtos_do_comparador() {
        let html = r#"<html><script id="__NEXT_DATA__" type="application/json">{"props":{"initialReduxState":{"hits":{"hits":[{"name":"Air Fryer","price":239}]}}}}</script></html>"#;
        let produtos = produtos_da_pagina(html).unwrap();
        assert_eq!(produtos[0]["price"], 239);
        assert!(produtos_da_pagina("<html>sem dados</html>").is_none());
    }
}
