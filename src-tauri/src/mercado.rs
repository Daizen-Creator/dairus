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

/// Único serviço da lista que recebe o token (no cabeçalho `Authorization: Bearer`).
const SERVICO_COM_TOKEN: &str = "https://brapi.dev/api/";

/// O token da brapi só tem letras, números e alguns símbolos; qualquer outra coisa
/// (espaço, quebra de linha, aspas) seria injeção de cabeçalho ou lixo colado.
pub fn token_valido(token: &str) -> bool {
    (1..=200).contains(&token.len()) && token.bytes().all(|b| b.is_ascii_alphanumeric() || b"-._~+/=".contains(&b))
}

/// Tira o parâmetro `token=...` da URL (versões antigas do app mandavam assim) e devolve
/// a URL limpa e o valor, para ir no cabeçalho em vez de aparecer em URL, erro ou log.
pub fn separar_token(url: &str) -> (String, Option<String>) {
    let Some((base, consulta)) = url.split_once('?') else { return (url.to_string(), None) };
    let mut token = None;
    let mut resto = Vec::new();
    for par in consulta.split('&') {
        match par.split_once('=') {
            Some((chave, valor)) if chave.eq_ignore_ascii_case("token") => token = Some(valor.to_string()),
            _ if par.is_empty() => {}
            _ => resto.push(par),
        }
    }
    let url = if resto.is_empty() { base.to_string() } else { format!("{base}?{}", resto.join("&")) };
    (url, token)
}

/// Remove segredos de uma mensagem de erro antes de ela ir para a tela ou para o log:
/// os valores conhecidos (`segredos`), qualquer `token=...` e qualquer `Bearer ...`.
pub fn limpar_segredos(texto: &str, segredos: &[&str]) -> String {
    let mut saida = texto.to_string();
    for s in segredos.iter().filter(|s| s.len() >= 4) {
        saida = saida.replace(s, "***");
    }
    for marca in ["token=", "Bearer "] {
        saida = ocultar_depois_de(&saida, marca);
    }
    saida
}

/// Troca o que vem depois de `marca` (sem diferenciar maiúsculas) por `***`, até o
/// primeiro separador (`&`, espaço, aspas, parêntese, `>`, `#`, `,`, `;`).
fn ocultar_depois_de(texto: &str, marca: &str) -> String {
    let minusculo = texto.to_ascii_lowercase();
    let marca_min = marca.to_ascii_lowercase();
    let mut saida = String::with_capacity(texto.len());
    let mut pos = 0;
    while let Some(achou) = minusculo[pos..].find(&marca_min) {
        let inicio = pos + achou;
        let valor_ini = inicio + marca.len();
        let fim = texto[valor_ini..]
            .find(|c: char| c == '&' || c.is_whitespace() || matches!(c, '"' | '\'' | ')' | '>' | '#' | ',' | ';'))
            .map_or(texto.len(), |i| valor_ini + i);
        saida.push_str(&texto[pos..valor_ini]);
        if fim > valor_ini {
            saida.push_str("***");
        }
        pos = fim;
    }
    saida.push_str(&texto[pos..]);
    saida
}

/// GET que devolve JSON. Usado pela aba de Investimentos.
/// O token da brapi vai no cabeçalho `Authorization: Bearer`, nunca na URL.
#[tauri::command]
pub async fn buscar_json_mercado(url: String, token: Option<String>) -> Result<serde_json::Value, String> {
    let (url, token_da_url) = separar_token(&url);
    if !url_permitida(&url) {
        return Err("Serviço de dados não permitido.".into());
    }
    let token = token.or(token_da_url).map(|t| t.trim().to_string()).filter(|t| !t.is_empty());
    if token.as_deref().is_some_and(|t| !token_valido(t)) {
        return Err("O token da brapi parece inválido: use só letras, números e - _ . (confira em Investimentos → Configurar).".into());
    }
    // Só a brapi recebe o token; os outros serviços são públicos.
    let token = token.filter(|_| url.starts_with(SERVICO_COM_TOKEN));
    tauri::async_runtime::spawn_blocking(move || {
        let mut pedido = ureq::get(&url)
            .set("User-Agent", "Dairus")
            .set("Accept", "application/json")
            .timeout(std::time::Duration::from_secs(20));
        if let Some(t) = &token {
            pedido = pedido.set("Authorization", &format!("Bearer {t}"));
        }
        let segredos: Vec<&str> = token.as_deref().into_iter().collect();
        match pedido.call() {
            Ok(r) => serde_json::from_reader(r.into_reader())
                .map_err(|e| limpar_segredos(&format!("Resposta inválida do serviço: {e}"), &segredos)),
            Err(ureq::Error::Status(401, _)) | Err(ureq::Error::Status(403, _)) => {
                Err("O serviço recusou o acesso (verifique o token da brapi em Investimentos → Configurar).".into())
            }
            Err(ureq::Error::Status(429, _)) => Err("Limite de consultas do serviço atingido; tente mais tarde.".into()),
            Err(ureq::Error::Status(c, _)) => Err(format!("O serviço respondeu com erro {c}.")),
            // O erro de transporte do ureq traz a URL; sai sem segredo nenhum.
            Err(e) => Err(format!("Sem conexão com o serviço de dados: {}", limpar_segredos(&e.to_string(), &segredos))),
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
    fn tira_o_token_da_url_e_guarda_para_o_cabecalho() {
        let (url, token) = separar_token("https://brapi.dev/api/quote/PETR4?token=abc123XYZ&range=1y&interval=1d");
        assert_eq!(url, "https://brapi.dev/api/quote/PETR4?range=1y&interval=1d");
        assert_eq!(token.as_deref(), Some("abc123XYZ"));
        let (url, token) = separar_token("https://brapi.dev/api/quote/PETR4?TOKEN=segredo99");
        assert_eq!(url, "https://brapi.dev/api/quote/PETR4");
        assert_eq!(token.as_deref(), Some("segredo99"));
        let (url, token) = separar_token("https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json");
        assert_eq!(url, "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json");
        assert_eq!(token, None);
        assert_eq!(separar_token("https://brapi.dev/api/quote/VALE3").1, None);
        // Parâmetro que só parece token não é tocado.
        assert_eq!(separar_token("https://brapi.dev/api/x?tokens=1&mytoken=2").0, "https://brapi.dev/api/x?tokens=1&mytoken=2");
    }

    #[test]
    fn so_aceita_token_com_caracteres_seguros() {
        assert!(token_valido("aB3-xYz_09.~"));
        assert!(!token_valido(""));
        assert!(!token_valido("com espaco"));
        assert!(!token_valido("linha\r\nX-Evil: 1"));
        assert!(!token_valido("aspas\"x"));
        assert!(!token_valido(&"a".repeat(201)));
    }

    #[test]
    fn mensagens_de_erro_nao_levam_o_token() {
        let token = "tK9fZ2pQr7";
        // Erro de transporte do ureq: traz a URL inteira.
        let erro = format!("https://brapi.dev/api/quote/PETR4?token={token}&range=1y: Connection Failed: dns error");
        let limpo = limpar_segredos(&erro, &[token]);
        assert!(!limpo.contains(token), "{limpo}");
        assert!(limpo.contains("brapi.dev/api/quote/PETR4"));
        assert!(limpo.contains("Connection Failed"));
        // Sem o valor conhecido, o padrão token=... também é coberto.
        let limpo = limpar_segredos(&erro, &[]);
        assert!(!limpo.contains(token), "{limpo}");
        assert!(limpo.contains("token=***&range=1y"));
        // Cabeçalho ecoado numa mensagem.
        let limpo = limpar_segredos("falha com Authorization: Bearer tK9fZ2pQr7 no pedido", &[]);
        assert_eq!(limpo, "falha com Authorization: Bearer *** no pedido");
        // Texto sem segredo e texto com acentos passam intactos.
        assert_eq!(limpar_segredos("Sem conexão: tempo esgotado", &["tK9fZ2pQr7"]), "Sem conexão: tempo esgotado");
        assert_eq!(limpar_segredos("ação token=àéî&x", &[]), "ação token=***&x");
    }

    #[test]
    fn le_produtos_do_comparador() {
        let html = r#"<html><script id="__NEXT_DATA__" type="application/json">{"props":{"initialReduxState":{"hits":{"hits":[{"name":"Air Fryer","price":239}]}}}}</script></html>"#;
        let produtos = produtos_da_pagina(html).unwrap();
        assert_eq!(produtos[0]["price"], 239);
        assert!(produtos_da_pagina("<html>sem dados</html>").is_none());
    }
}
