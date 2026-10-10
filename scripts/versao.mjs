// Uso: npm run versao -- 0.2.0          (versão estável)
//      npm run versao -- 0.3.0-beta.1   (versão de teste, publicada como pré-lançamento)
// Atualiza a versão em package.json, package-lock.json, src-tauri/tauri.conf.json,
// src-tauri/Cargo.toml e src-tauri/Cargo.lock (pacote "dairus").
import { readFileSync, writeFileSync } from "node:fs";

const nova = process.argv[2];
if (!/^\d+\.\d+\.\d+(-beta\.\d+)?$/.test(nova ?? "")) {
  console.error("Informe a versão no formato 1.2.3 ou 1.2.3-beta.1, por exemplo: npm run versao -- 0.2.0");
  process.exit(1);
}

// Lê e valida tudo antes de gravar, para nunca deixar os arquivos com versões diferentes.
const quebraDeLinha = {}; // preserva LF/CRLF de cada arquivo, para o git não mostrar o arquivo todo mudado
function lerJson(arquivo) {
  const texto = readFileSync(arquivo, "utf8");
  quebraDeLinha[arquivo] = texto.includes("\r\n") ? "\r\n" : "\n";
  return JSON.parse(texto);
}
function exigir(condicao, mensagem) {
  if (!condicao) {
    console.error(mensagem);
    process.exit(1);
  }
}

const pacote = lerJson("package.json");
pacote.version = nova;

const trava = lerJson("package-lock.json");
exigir(trava.packages?.[""], 'package-lock.json sem o pacote raiz (packages[""]). Rode `npm install --package-lock-only`.');
trava.version = nova;
trava.packages[""].version = nova;

const tauri = lerJson("src-tauri/tauri.conf.json");
tauri.version = nova;

// Cargo.toml: só a "version" da seção [package] (as dependências também têm "version = ...").
const cargoAntigo = readFileSync("src-tauri/Cargo.toml", "utf8");
const cargoNovo = cargoAntigo.replace(/(\[package\][^[]*?^version\s*=\s*)"[^"]*"/m, `$1"${nova}"`);
exigir(cargoNovo !== cargoAntigo || cargoAntigo.includes(`version = "${nova}"`), "Não achei a linha version na seção [package] de src-tauri/Cargo.toml.");

// Cargo.lock: o bloco [[package]] cujo name é "dairus".
const lockAntigo = readFileSync("src-tauri/Cargo.lock", "utf8");
const lockNovo = lockAntigo.replace(/(\[\[package\]\]\r?\nname = "dairus"\r?\nversion = )"[^"]*"/, `$1"${nova}"`);
exigir(lockNovo !== lockAntigo || lockAntigo.includes(`name = "dairus"\nversion = "${nova}"`) || lockAntigo.includes(`name = "dairus"\r\nversion = "${nova}"`), 'Não achei o pacote "dairus" em src-tauri/Cargo.lock.');

const gravarJson = (arquivo, json) =>
  writeFileSync(arquivo, (JSON.stringify(json, null, 2) + "\n").replace(/\n/g, quebraDeLinha[arquivo]));
gravarJson("package.json", pacote);
gravarJson("package-lock.json", trava);
gravarJson("src-tauri/tauri.conf.json", tauri);
writeFileSync("src-tauri/Cargo.toml", cargoNovo);
writeFileSync("src-tauri/Cargo.lock", lockNovo);

console.log(`Versão ${nova} gravada em package.json, package-lock.json, tauri.conf.json, Cargo.toml e Cargo.lock.`);
console.log(`Agora: escreva a seção "## ${nova}" no CHANGELOG.md, faça commit e rode  git tag v${nova} && git push --tags`);
if (nova.includes("-")) {
  console.log("É uma versão de teste: o workflow a publica como pré-lançamento (só chega a quem ligou o canal beta).");
}
