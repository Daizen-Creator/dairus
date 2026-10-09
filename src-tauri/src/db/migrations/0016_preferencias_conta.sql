-- Preferências da conta que precisam ir junto com os dados (nome, perfil de renda,
-- chave Pix, bloco de notas, metas de economia, configurações dos widgets...).
-- Ficam aqui para entrar no backup e na sincronização entre computadores; o app
-- copia do arquivo de preferências para cá antes de sincronizar e de volta depois
-- de baixar ou restaurar. Preferências do computador (PIN, pastas, atualização) e
-- chaves secretas (Gemini, brapi) não vêm para cá.
CREATE TABLE preferencias_conta (
    chave TEXT PRIMARY KEY CHECK (length(chave) BETWEEN 1 AND 64),
    -- Valor em JSON, como está no arquivo de preferências.
    valor TEXT NOT NULL CHECK (length(valor) <= 262144),
    atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
