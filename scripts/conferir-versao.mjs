// Uso: node scripts/conferir-versao.mjs v0.2.6     (no GitHub Actions, usa GITHUB_REF_NAME)
// Confere se a tag da release bate com a versão gravada nos arquivos do projeto e
// se o CHANGELOG.md tem a seção "## <versão>" com texto. Sai com erro se algo não bater,
// para o workflow "Publicar versão" parar antes de gerar e publicar o instalador.
import { readFileSync } from "node:fs";

const noActions = process.env.GITHUB_ACTIONS === "true";
const problemas = [];
const falha = (texto) => problemas.push(texto);

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? "";
const versao = tag.replace(/^v/, "");
if (!/^\d+\.\d+\.\d+(-beta\.\d+)?$/.test(versao)) {
  console.error(`A tag "${tag}" não tem o formato vX.Y.Z nem vX.Y.Z-beta.N (por exemplo, v0.3.0 ou v0.3.0-beta.1).`);
  process.exit(1);
}

function lerJson(arquivo) {
  try {
    return JSON.parse(readFileSync(arquivo, "utf8"));
  } catch (erro) {
    falha(`${arquivo}: não consegui ler (${erro.message}).`);
    return null;
  }
}

function conferir(arquivo, encontrada) {
  if (encontrada !== versao) falha(`${arquivo}: versão ${encontrada ?? "(não encontrada)"}, esperado ${versao}.`);
}

const pacote = lerJson("package.json");
if (pacote) conferir("package.json", pacote.version);

const trava = lerJson("package-lock.json");
if (trava) {
  conferir("package-lock.json (version)", trava.version);
  conferir('package-lock.json (packages[""].version)', trava.packages?.[""]?.version);
}

const tauri = lerJson("src-tauri/tauri.conf.json");
if (tauri) conferir("src-tauri/tauri.conf.json", tauri.version);

try {
  const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
  const secaoPacote = cargo.split(/^\[/m).find((s) => s.startsWith("package]")) ?? "";
  conferir("src-tauri/Cargo.toml", secaoPacote.match(/^version\s*=\s*"([^"]+)"/m)?.[1]);
} catch (erro) {
  falha(`src-tauri/Cargo.toml: não consegui ler (${erro.message}).`);
}

try {
  const lock = readFileSync("src-tauri/Cargo.lock", "utf8").replace(/\r\n/g, "\n");
  const pacoteLock = lock.split("[[package]]").find((s) => /^\s*name = "dairus"$/m.test(s));
  conferir("src-tauri/Cargo.lock (pacote dairus)", pacoteLock?.match(/^version = "([^"]+)"/m)?.[1]);
} catch (erro) {
  falha(`src-tauri/Cargo.lock: não consegui ler (${erro.message}).`);
}

// CHANGELOG: o título tem de ser exatamente "## <versão>" (## 0.2.5 não vale para 0.2.50) e ter texto.
try {
  const linhas = readFileSync("CHANGELOG.md", "utf8").split(/\r?\n/);
  const inicio = linhas.findIndex((l) => l.trimEnd() === `## ${versao}`);
  if (inicio < 0) {
    falha(`CHANGELOG.md: não existe a seção "## ${versao}". Renomeie "Próxima versão" para esse título.`);
  } else {
    const resto = linhas.slice(inicio + 1);
    const fim = resto.findIndex((l) => l.startsWith("## "));
    const corpo = (fim < 0 ? resto : resto.slice(0, fim)).join("\n").trim();
    if (!corpo) falha(`CHANGELOG.md: a seção "## ${versao}" está vazia.`);
  }
} catch (erro) {
  falha(`CHANGELOG.md: não consegui ler (${erro.message}).`);
}

if (problemas.length) {
  console.error(`A tag ${tag} não está pronta para publicar:`);
  for (const p of problemas) console.error(noActions ? `::error::${p}` : ` - ${p}`);
  console.error("Corrija, faça commit e crie a tag de novo (git tag -d, git push --delete origin, git tag).");
  process.exit(1);
}
console.log(`Tag ${tag}: versão ${versao} confere em package.json, package-lock.json, Cargo.toml, Cargo.lock e tauri.conf.json, e o CHANGELOG.md tem a seção.`);
