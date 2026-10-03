// Abre cada tela e cada aba do app com o backend simulado, tira prints e lista erros.
// Uso: npm run dev (porta 1420) em outro terminal; node scripts/teste-visual/rodar.mjs [pasta-dos-prints]
import { createRequire } from "node:module";
// Usa o Playwright do projeto ou o global (PLAYWRIGHT_DIR).
const requerer = createRequire(import.meta.url);
const { chromium } = requerer(process.env.PLAYWRIGHT_DIR ?? "playwright");
import fs from "node:fs";
import path from "node:path";

const saida = process.argv[2] ?? "prints";
fs.mkdirSync(saida, { recursive: true });
const mock = fs.readFileSync(new URL("./mock-tauri.js", import.meta.url), "utf8");
const ROTAS = ["/", "/contas-bancarias", "/cartoes", "/lancamentos", "/orcamento", "/metas", "/patrimonio", "/investimentos", "/pessoas", "/salario", "/contabilidade", "/relatorios", "/ia", "/radar", "/documentos", "/configuracoes", "/backup", "/temas", "/ajuda"];
const largura = Number(process.env.LARGURA ?? 1366);

const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
const pagina = await navegador.newPage({ viewport: { width: largura, height: 900 } });
await pagina.addInitScript(mock);
const problemas = [];
let rotaAtual = "";
pagina.on("pageerror", (e) => problemas.push(`[${rotaAtual}] ERRO: ${e.message}`));
pagina.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource|ERR_|net::|supabase|Download the React DevTools/i.test(m.text())) problemas.push(`[${rotaAtual}] console: ${m.text().slice(0, 300)}`);
});

for (const rota of ROTAS) {
  rotaAtual = rota;
  await pagina.goto(`http://localhost:1420/#${rota}`, { waitUntil: "networkidle" }).catch(() => {});
  await pagina.waitForTimeout(1200);
  const nome = rota === "/" ? "inicio" : rota.slice(1);
  const abas = await pagina.locator('[role="tab"]').all();
  const nomes = [];
  for (const a of abas) nomes.push((await a.innerText()).trim());
  if (nomes.length === 0) {
    await pagina.screenshot({ path: path.join(saida, `${nome}.png`), fullPage: true });
  }
  for (let i = 0; i < nomes.length; i++) {
    rotaAtual = `${rota} › ${nomes[i]}`;
    await pagina.locator('[role="tab"]').nth(i).click().catch((e) => problemas.push(`[${rotaAtual}] não clicou: ${e.message}`));
    await pagina.waitForTimeout(500);
    const estouro = await pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (estouro > 4) problemas.push(`[${rotaAtual}] rolagem horizontal de ${estouro}px`);
    await pagina.screenshot({ path: path.join(saida, `${nome}-${String(i).padStart(2, "0")}.png`), fullPage: true });
  }
  const vazio = await pagina.evaluate(() => (document.querySelector("main")?.innerText ?? "").trim().length);
  if (vazio < 20) problemas.push(`[${rota}] tela vazia`);
}
const desconhecidos = await pagina.evaluate(() => [...(window.__COMANDOS_DESCONHECIDOS__ ?? [])]);
console.log(JSON.stringify({ problemas, desconhecidos }, null, 2));
await navegador.close();
