# Atualização automática do Dairus

## Como funciona

1. **Verificar** (`verificar_atualizacao`, Rust): consulta `api.github.com/repos/Daizen-Creator/dairus/releases/latest`.
   Se o GitHub falhar, usa o `latest.json` do Supabase (bucket público `atualizacoes`).
   Só vale versão **maior** que a instalada (tag `vX.Y.Z`); rascunhos são ignorados e pré-lançamentos
   (`v0.3.0-beta.1`) só chegam a quem ligou "Receber versões de teste (beta)".
2. **Baixar** (`baixar_atualizacao`): só aceita instaladores do próprio repositório ou do Storage do projeto.
   Emite o evento `atualizacao-progresso` com `{ fase, baixados, total }`. Se nenhum byte chegar em 30 s,
   o download é dado como travado.
3. **Conferir**: tamanho, cabeçalho de executável (`MZ`) e SHA-256 (arquivo `.sha256` publicado pelo workflow).
   O arquivo é gravado como `.parcial` e só vira `.exe` depois de conferido.
4. **Backup** do banco (`criar_backup`).
5. **Instalar** (`instalar_baixada`): roda o instalador direto com `/P /UPDATE /R`. O `/P` mostra só a barra
   do instalador e fecha o Dairus, o `/UPDATE` mantém atalhos e configurações, e o `/R` reabre o Dairus no fim.
6. **Na abertura seguinte**: o app compara a versão instalada com a marca `atualizacao_em_andamento`.
   Se não subiu, mostra "A instalação não foi concluída" com "Tentar de novo".

A **tela de atualização** (`TelaAtualizacao.tsx`) cobre o app inteiro e bloqueia clique e teclado
(atributo `inert` no `#root`). Mostra a etapa, a barra, os MB, a velocidade e o tempo restante. Ela abre:

- sozinha ao abrir o Dairus, se houver versão nova. Dá para desligar em Configurações → "Ao abrir o Dairus,
  atualizar na hora";
- em "Atualizar agora", "Reiniciar e atualizar" ou "Ver progresso", na faixa de aviso.

Durante o uso, a verificação de 6 em 6 horas baixa em segundo plano e não interrompe o usuário.

## Testar sem publicar nada

### 1. A tela, no navegador (sem Rust)

```bash
npm run dev
```

Abra `http://localhost:1420/scripts/teste-visual/app.html?atualizacao=ok`. Também existem os cenários
`?atualizacao=erro` (cai no meio do download) e `?atualizacao=erro-instalar` (o instalador não abre).
Para repetir o teste, mude a URL (por exemplo, `&n=2`), porque mudar só o `#` não recarrega a página.

### 2. O download de verdade (app em desenvolvimento)

```bash
DAIRUS_VERSAO_FINGIDA=0.0.1 npm run tauri dev
```

O app se acha na versão 0.0.1, encontra a última versão publicada e baixa e confere o instalador real.
Para ver as falhas, use `DAIRUS_SIMULAR_FALHA=download` ou `DAIRUS_SIMULAR_FALHA=sha`. Essas variáveis
só funcionam em compilação de desenvolvimento; o app instalado as ignora.

> Atenção: se você deixar seguir até "Instalar", o instalador real roda e atualiza o Dairus instalado no computador.

### 3. Ponta a ponta, com segurança (versão beta)

1. Instale a versão atual pelo instalador da release.
2. Prepare a versão de teste, com o sufixo `-beta.N` e **maior que a instalada**:
   `npm run versao -- 0.2.6-beta.1` (atualiza `package.json`, `package-lock.json`, `tauri.conf.json`,
   `Cargo.toml` e `Cargo.lock`). No `CHANGELOG.md`, crie a seção com o título exato `## 0.2.6-beta.1`.
   Faça commit e `git tag v0.2.6-beta.1 && git push --tags`.
3. O workflow "Publicar versão" confere a tag, roda os testes e publica a release como **pré-lançamento**
   (qualquer tag com `-` é pré-lançamento) e **não** copia nada para o Supabase nem atualiza o `latest.json`.
   Quem não ligou o canal beta não recebe.
4. No Dairus instalado, ligue Configurações → "Receber versões de teste (beta)" e reabra o app.
5. Confira a tela: baixar → conferir → backup → instalar → reabrir. Depois, em Configurações, veja a versão nova.

**Limitação conhecida:** o app compara só `X.Y.Z` e descarta o sufixo (`versao()` em `atualizacao.rs`;
`0.3.0-beta.1` conta como `0.3.0`). Por isso:

- `0.3.0-beta.1` → `0.3.0-beta.2` **não** é oferecida como atualização, e quem está num beta de `0.3.0` **não**
  recebe a estável `0.3.0`. Nesses casos instale o instalador da release manualmente por cima (os dados ficam).
- Para o beta ser oferecido, o `X.Y.Z` dele precisa ser maior que o da versão instalada
  (de `0.2.5` para `0.2.6-beta.1`, sim).

Corrigir isso exige comparar o sufixo no Rust (`versao()` e `novidade_de()`); fica para uma versão futura.

## Publicar uma versão (workflow `release.yml`)

A tag `vX.Y.Z` (ou `vX.Y.Z-beta.N`) dispara o workflow **Publicar versão**, em dois jobs:

1. **verificar** (falha cedo, sem gerar instalador): confere se a tag é igual à versão de `package.json`,
   `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` e `src-tauri/tauri.conf.json`; se o
   `CHANGELOG.md` tem a seção `## X.Y.Z` (título exato) com texto; e roda `tsc`, `vitest` e `cargo test`.
   O mesmo teste de versão roda no seu computador: `node scripts/conferir-versao.mjs vX.Y.Z`.
2. **windows** (só roda se o anterior passou): gera o instalador, cria a release como **rascunho**, envia o
   `.sha256`, copia para o Supabase (só em versão estável) e, por último, torna a release pública
   (`gh release edit --draft=false`).

Se um passo falhar, a release fica como rascunho: o app instalado não a enxerga e ninguém recebe uma versão sem
`.sha256`. Corrija a causa e use "Re-run failed jobs" na execução (ou apague o rascunho e a tag e publique de
novo). Depois de repetir, confira em Releases se não sobrou um rascunho duplicado.

## Diagnóstico

- **Log do app**: Configurações → "Registro de erros (log)" → "Ver últimas linhas" ou "Abrir pasta do log"
  (`%LOCALAPPDATA%\com.danielsantos.dairus\logs`).
  As linhas `atualização baixada e conferida` e `instalando atualização` mostram até onde chegou.
- **Instalador baixado**: `%LOCALAPPDATA%\com.danielsantos.dairus\cache\atualizacoes\`. Fica só o da versão
  mais nova. Um `.parcial` ali indica um download interrompido, que é descartado na próxima tentativa.
- **O app não encontra a versão nova**:
  - a release está publicada (não é rascunho)?
  - a tag é maior que a instalada?
  - o anexo termina em `-setup.exe`?
  - o repositório está público? Teste com `curl https://api.github.com/repos/Daizen-Creator/dairus/releases/latest`.
- **"Não confere com a assinatura (SHA-256)"**: o `.sha256` da release não corresponde ao `.exe`
  (por exemplo, o instalador foi trocado à mão). Gere de novo pelo workflow.
- **Limite do GitHub**: sem login, a API aceita 60 consultas por hora por IP. O app consulta a cada 6 horas
  e, se o GitHub recusar, usa o Supabase.
- **Permissões**: o instalador é por usuário (`installMode: currentUser`) e não pede administrador.
  O antivírus pode atrasar o primeiro uso do instalador baixado.

## Tratamento de erros

Nenhuma falha deixa o app travado ou em versão misturada:

| Onde falhou | O que o usuário vê | Estado do app |
|---|---|---|
| Verificar | "Não foi possível verificar atualizações" + Tentar de novo | versão atual, intacta |
| Download (sem internet, travado, incompleto) | mensagem + Tentar de novo / Baixar pelo site / Continuar | nada gravado (só `.parcial`) |
| Conferência (tamanho ou SHA-256) | "não confere com a assinatura… não foi instalado" | instalador descartado |
| Abrir o instalador | "Não foi possível iniciar a instalação" | app continua aberto |
| Instalador fechado no meio ou sem permissão | na abertura: "A instalação da versão X não foi concluída" | versão anterior |

O backup antes de instalar garante os dados mesmo num caso extremo, já que o instalador não mexe no banco.
"Continuar sem atualizar" sempre fecha a tela e devolve o app ao normal.
