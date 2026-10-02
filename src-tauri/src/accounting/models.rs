use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TipoConta {
    Ativo,
    Passivo,
    Patrimonio,
    Receita,
    Despesa,
}

impl TipoConta {
    pub fn as_db_str(&self) -> &'static str {
        match self {
            TipoConta::Ativo => "ATIVO",
            TipoConta::Passivo => "PASSIVO",
            TipoConta::Patrimonio => "PATRIMONIO",
            TipoConta::Receita => "RECEITA",
            TipoConta::Despesa => "DESPESA",
        }
    }

    pub fn from_db_str(valor: &str) -> Self {
        match valor {
            "ATIVO" => TipoConta::Ativo,
            "PASSIVO" => TipoConta::Passivo,
            "PATRIMONIO" => TipoConta::Patrimonio,
            "RECEITA" => TipoConta::Receita,
            "DESPESA" => TipoConta::Despesa,
            outro => unreachable!("tipo de conta desconhecido no banco: {outro}"),
        }
    }

    /// Débito aumenta o saldo de Ativo/Despesa; Crédito aumenta o de
    /// Passivo/Patrimônio/Receita. Isso é a regra contábil clássica (DR=CR).
    pub fn natureza_devedora(&self) -> bool {
        matches!(self, TipoConta::Ativo | TipoConta::Despesa)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TipoPartida {
    Debito,
    Credito,
}

impl TipoPartida {
    pub fn as_db_str(&self) -> &'static str {
        match self {
            TipoPartida::Debito => "DEBITO",
            TipoPartida::Credito => "CREDITO",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Conta {
    pub id: String,
    pub codigo: String,
    pub nome: String,
    pub tipo: TipoConta,
    pub subtipo: Option<String>,
    pub categoria_pai_id: Option<String>,
    pub instituicao: Option<String>,
    pub saldo_inicial_centavos: i64,
    pub dia_fechamento_fatura: Option<i32>,
    pub dia_vencimento_fatura: Option<i32>,
    pub limite_centavos: Option<i64>,
    pub sistema: bool,
    pub ativa: bool,
    pub saldo_atual_centavos: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NovaContaInput {
    pub codigo: String,
    pub nome: String,
    pub tipo: TipoConta,
    pub subtipo: Option<String>,
    pub categoria_pai_id: Option<String>,
    pub instituicao: Option<String>,
    #[serde(default)]
    pub saldo_inicial_centavos: i64,
    pub dia_fechamento_fatura: Option<i32>,
    pub dia_vencimento_fatura: Option<i32>,
    pub limite_centavos: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PartidaInput {
    pub conta_id: String,
    pub tipo: TipoPartida,
    pub valor_centavos: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Partida {
    pub id: String,
    pub conta_id: String,
    pub tipo: TipoPartida,
    pub valor_centavos: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NovoLancamentoInput {
    pub data: String,
    pub descricao: String,
    pub observacao: Option<String>,
    #[serde(default = "origem_padrao")]
    pub origem: String,
    #[serde(default)]
    pub etiqueta: Option<String>,
    /// Número de parcelas de uma compra no cartão (2 a 72). `None` = à vista.
    #[serde(default)]
    pub parcelas: Option<i32>,
    pub partidas: Vec<PartidaInput>,
}

fn origem_padrao() -> String {
    "MANUAL".to_string()
}

#[derive(Debug, Clone, Serialize)]
pub struct Lancamento {
    pub id: String,
    pub data: String,
    pub descricao: String,
    pub observacao: Option<String>,
    pub origem: String,
    pub etiqueta: Option<String>,
    pub estornado_de: Option<String>,
    pub parcelas: Option<i32>,
    pub corrige: Option<String>,
    pub partidas: Vec<Partida>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Agendamento {
    pub id: String,
    pub descricao: String,
    pub valor_centavos: i64,
    pub vencimento: String,
    pub categoria_despesa_id: String,
    pub etiqueta: Option<String>,
    pub lancamento_id: Option<String>,
    pub pago_em: Option<String>,
    pub recorrencia: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NovoAgendamentoInput {
    pub descricao: String,
    pub valor_centavos: i64,
    pub vencimento: String,
    pub categoria_despesa_id: String,
    #[serde(default)]
    pub etiqueta: Option<String>,
    #[serde(default)]
    pub recorrencia: Option<String>,
}
