# Dairus

Sistema financeiro pessoal para Windows, feito com **Tauri 2 + Rust + React/TypeScript**. Cada conta tem o seu próprio banco **SQLite**, guardado **no seu computador**, com contabilidade de partidas dobradas (débitos = créditos em todo lançamento, valores sempre em centavos inteiros). Você entra com a **conta Google** (login pelo Supabase); depois de entrar uma vez, o app abre e funciona sem internet. A internet só é usada para o login, para a **sincronização e o backup na nuvem** (opcionais, ficam na sua conta no Supabase), para a IA (Gemini, com a sua chave), para cotações e para as atualizações do app.

## O que tem

- **Dashboard** (Início) personalizável: grade livre de widgets, vários layouts salvos, gráfico configurável, saúde financeira, alertas, lançamento rápido, fluxo de caixa e calendário.
- **Contas bancárias e cartões** (fatura aberta/anterior, melhor dia de compra, pagar fatura, uso do limite).
- **Despesas e receitas** com filtros, etiquetas (Mensalidade/Assinatura/Fixo), contas a pagar recorrentes, parcelamento, importação de extrato OFX/CSV e estorno.
- **Orçamento** por categoria, **metas**, **patrimônio** (bens e dívidas), **salário e renda**.
- **Contabilidade**: balancete, balanço, resultado, livro diário, razão, plano de contas, lançamento manual e auditoria.
- **Relatórios** com comparação entre períodos, exportação CSV e impressão/PDF.
- **IA** com Google Gemini (chave própria do AI Studio ou do Vertex AI), mostrando exatamente o que é enviado.
- **Radar de compras** (preços registrados por você), **backup/restauração**, **PIN de bloqueio** e 102 temas.
- **Login com Google** e uma conta separada por pessoa no mesmo computador. Para ligar o login no seu projeto do Supabase, veja `docs/CONFIGURAR_LOGIN_GOOGLE.md`.
- **Sincronização entre computadores** pela nuvem da conta (Backup → Nuvem): envia e baixa o banco e as preferências, e se os dois lados mudaram avisa do conflito em vez de sobrescrever. Também há backup na nuvem, opcional.
- **Atualização automática**, com conferência de SHA-256 e backup antes de instalar (`docs/ATUALIZACAO.md`).

## Desenvolvimento

Pré-requisitos: Node.js 22, Rust (stable) e o Visual Studio Build Tools com C++ (MSVC + Windows SDK).

```bash
npm install
npm run tauri dev
```

Verificações (as mesmas do GitHub Actions):

```bash
npx tsc --noEmit        # TypeScript
npx vitest run          # telas e regras do front-end
npx vite build          # build do front-end
cd src-tauri
cargo test              # motor contábil e módulos (Rust)
cargo clippy
```

Também dá para ver o app no navegador, sem o Rust: `npm run dev` e abrir `http://localhost:1420/scripts/teste-visual/app.html` (o backend simulado fica em `scripts/teste-visual/mock-tauri.js`).

Gerar o instalador (NSIS):

```bash
npm run tauri build
```

O ícone do app vem de `app-icon.svg`; depois de alterá-lo, rode `npx tauri icon app-icon.svg`.

### Pasta de build do Rust (`CARGO_TARGET_DIR`)

O arquivo `src-tauri/.cargo/config.toml` manda o Rust compilar em `D:/dairus-target`, porque os builds de debug ocupam vários GB e o C: do computador do dono já ficou sem espaço. **Em um computador sem o disco D:** o `cargo` falha ao criar essa pasta. Nesse caso, aponte a pasta de build por variável de ambiente, que vale mais que o arquivo:

```powershell
# PowerShell, na pasta do projeto (vale só para este terminal)
$env:CARGO_TARGET_DIR = "$PWD\src-tauri\target"
npm run tauri dev
```

Para deixar fixo, use `setx CARGO_TARGET_DIR "C:\caminho\da\pasta"` e abra um terminal novo. O GitHub Actions faz a mesma coisa (veja `.github/workflows/testes.yml`).

## Onde ficam os dados

Cada conta (id do Supabase) tem as suas pastas:

- Banco: `%APPDATA%\com.danielsantos.dairus\contas\<id da conta>\dairus.db` (com a criptografia ligada, o arquivo é `dairus.db.cripto`). O `dairus.db` solto em `%APPDATA%\com.danielsantos.dairus\` é o banco antigo, de antes do login; ele pode ser importado no primeiro acesso.
- Preferências: `%APPDATA%\com.danielsantos.dairus\preferencias-<id da conta>.json` (e as principais também vão dentro do banco, para entrar no backup e na sincronização).
- Backups e exportações: `Documentos\Dairus\<id da conta>\Backups` e `Documentos\Dairus\<id da conta>\Exportacoes`.
- Log: `%LOCALAPPDATA%\com.danielsantos.dairus\logs\dairus.log`.

O PIN bloqueia a tela do app. Para proteger o arquivo, ligue a **criptografia** em Backup e Segurança → PIN e criptografia: o banco passa a ficar só cifrado no disco (AES-256-GCM, senha por Argon2id), aberto apenas na memória, e os backups também saem cifrados. Guarde o código de recuperação. Mais sobre o que é protegido e o que sai do computador em `SEGURANCA.md`.

## Publicar uma versão nova

1. `npm run versao -- 0.3.0` (atualiza a versão em `package.json`, `package-lock.json`, `tauri.conf.json`, `Cargo.toml` e `Cargo.lock`). Para uma versão de teste: `npm run versao -- 0.3.0-beta.1`.
2. Escreva o que mudou em `CHANGELOG.md`, numa seção com o **título exato** `## 0.3.0` (renomeie "Próxima versão").
3. Commit e `git tag v0.3.0 && git push --tags`.

O workflow **Publicar versão** primeiro confere se a tag bate com a versão dos arquivos e com o CHANGELOG e roda os testes; só então gera o instalador no Windows, cria a release como rascunho, anexa o `.sha256`, copia para o Supabase (só versão estável) e, por último, torna a release pública. Se algo falhar, ela continua rascunho. Tag com `-` (ex.: `v0.3.0-beta.1`) vira pré-lançamento e só chega a quem ligou "Receber versões de teste (beta)". Detalhes e limitações em `docs/ATUALIZACAO.md`.

O Dairus instalado verifica a cada 6 horas, avisa (inclusive por notificação), mostra "O que mudou" e, em "Atualizar agora", baixa o instalador, confere e o abre. A verificação consulta primeiro as releases do GitHub, que por isso precisam ser públicas (com repositório privado essa consulta não encontra nada). Se o GitHub não responder, o app usa a reserva no Supabase (`latest.json` e o instalador no bucket público `atualizacoes`), que o workflow grava quando o segredo `SUPABASE_SERVICE_ROLE_KEY` está configurado no repositório.

## Time de agentes (Claude Code)

O trabalho de desenvolvimento usa agentes do Claude Code, um por papel (devops, revisor de código, segurança, releases, front-end, banco de dados etc.), descritos em `.claude/agents/*.md`. A pasta `.claude/` está no `.gitignore`, então esses arquivos **ainda não vão para o repositório**: ficam só neste computador.
