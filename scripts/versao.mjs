// Uso: npm run versao -- 0.2.0
// Atualiza a versão em package.json, src-tauri/tauri.conf.json e src-tauri/Cargo.toml.
import { readFileSync, writeFileSync } from "node:fs";

const nova = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(nova ?? "")) {
  console.error("Informe a versão no formato 1.2.3, por exemplo: npm run versao -- 0.2.0");
  process.exit(1);
}
for (const arquivo of ["package.json", "src-tauri/tauri.conf.json"]) {
  const json = JSON.parse(readFileSync(arquivo, "utf8"));
  json.version = nova;
  writeFileSync(arquivo, JSON.stringify(json, null, 2) + "\n");
}
const cargo = readFileSync("src-tauri/Cargo.toml", "utf8").replace(/^version = ".*"$/m, `version = "${nova}"`);
writeFileSync("src-tauri/Cargo.toml", cargo);
console.log(`Versão ${nova}. Agora: escreva o CHANGELOG.md, faça commit e rode  git tag v${nova} && git push --tags`);
