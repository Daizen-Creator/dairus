use thiserror::Error;

/// Erros do motor contábil. A mensagem de cada variante é a que chega ao
/// frontend — por isso é sempre em português e nunca expõe SQL bruto.
#[derive(Debug, Error)]
pub enum AccountingError {
    #[error("Um lançamento precisa de ao menos duas partidas.")]
    PartidasInsuficientes,

    #[error("O valor de cada partida precisa ser maior que zero.")]
    ValorInvalido,

    #[error("Lançamento desequilibrado: débitos somam {debitos} centavos e créditos somam {creditos} centavos.")]
    LancamentoDesequilibrado { debitos: i64, creditos: i64 },

    #[error("Conta contábil '{0}' não encontrada.")]
    ContaNaoEncontrada(String),

    #[error("Conta contábil '{0}' está arquivada e não aceita novos lançamentos.")]
    ContaArquivada(String),

    #[error("Já existe uma conta com o código '{0}'.")]
    CodigoDuplicado(String),

    #[error("Lançamento '{0}' não encontrado.")]
    LancamentoNaoEncontrado(String),

    #[error("Lançamento '{0}' já foi estornado.")]
    LancamentoJaEstornado(String),

    #[error("Conta agendada '{0}' não encontrada.")]
    AgendamentoNaoEncontrado(String),

    #[error("A conta agendada '{0}' já foi paga.")]
    AgendamentoJaPago(String),

    #[error("{0}")]
    DadoInvalido(String),

    #[error("Saldo inicial não pode ser negativo nesta versão.")]
    SaldoInicialNegativo,

    #[error("Erro de banco de dados: {0}")]
    Banco(#[from] rusqlite::Error),
}

impl From<AccountingError> for String {
    fn from(err: AccountingError) -> String {
        err.to_string()
    }
}
