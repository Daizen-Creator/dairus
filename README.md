# Dairus

Sistema financeiro pessoal para Windows, feito com **Tauri 2 + Rust + React/TypeScript**. Os dados ficam só no seu computador, num banco **SQLite** com contabilidade de partidas dobradas (débitos = créditos em todo lançamento, valores sempre em centavos inteiros).

## O que tem

- **Dashboard** com resumo do período, saúde financeira, alertas, lançamento rápido, fluxo de caixa e calendário.
- **Contas bancárias e cartões** (fatura aberta/anterior, melhor dia de compra, pagar fatura, uso do limite).
- **Despesas e receitas** com filtros, etiquetas (Mensalidade/Assinatura/Fixo), contas a pagar recorrentes, parcelamento, importação de extrato OFX/CSV e estorno.
- **Orçamento** por categoria, **metas**, **patrimônio** (bens e dívidas), **salário e renda**.
- **Contabilidade**: balancete, balanço, resultado, livro diário, razão, plano de contas, lançamento manual e auditoria.
- **Relatórios** com comparação entre períodos, exportação CSV e impressão/PDF.
- **IA** com Google Gemini (chave própria do AI Studio ou do Vertex AI), mostrando exatamente o que é enviado.
- **Radar de compras** (preços registrados por você), **backup/restauração**, **PIN de bloqueio** e 102 temas.

## Desenvolvimento

Pré-requisitos: Node.js, Rust (stable) e o Visual Studio Build Tools com C++ (MSVC + Windows SDK).

```bash
npm install
npm run tauri dev
```

Testes do motor contábil e dos módulos (Rust):

```bash
cd src-tauri
cargo test
```

Gerar o instalador (NSIS):

```bash
npm run tauri build
```

O ícone do app vem de `app-icon.svg`; depois de alterá-lo, rode `npx tauri icon app-icon.svg`.

## Onde ficam os dados

- Banco: `%APPDATA%\com.danielsantos.dairus\dairus.db`
- Preferências: `%APPDATA%\com.danielsantos.dairus\preferencias.json`
- Backups e exportações: `Documentos\Dairus\Backups` e `Documentos\Dairus\Exportacoes`

O PIN bloqueia a tela do app. Para proteger o arquivo, ligue a **criptografia** em Backup e Segurança → PIN e criptografia: o banco passa a ficar só cifrado no disco (AES-256-GCM, senha por Argon2id), aberto apenas na memória, e os backups também saem cifrados. Guarde o código de recuperação.
