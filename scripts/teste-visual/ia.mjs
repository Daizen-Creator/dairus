// Clica em todos os botões de IA com o Gemini simulado e confere que a resposta aparece.
import { createRequire } from "node:module";
import fs from "node:fs";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_DIR ?? "playwright");
const mock = fs.readFileSync(new URL("./mock-tauri.js", import.meta.url), "utf8");
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
await p.addInitScript(mock);
const falhas = [];
const chamadas = [];
let local = "";
p.on("pageerror", (e) => falhas.push(`[${local}] ERRO ${e.message}`));
await p.route("**/generativelanguage.googleapis.com/**", async (r) => {
  const corpo = r.request().postData() ?? "";
  chamadas.push(local);
  let texto = "**Resposta da IA de teste.**\n- Ponto 1\n- Ponto 2";
  if (/Extraia|Transcreva/.test(corpo)) texto = JSON.stringify({ lancamentos: [{ tipo: "DESPESA", descricao: "Padaria", valor: 12.5, data: new Date().toISOString().slice(0, 10), categoria_id: "despesa-alimentacao", conta_id: "banco-nu" }] });
  else if (/Para cada descrição/.test(corpo)) texto = JSON.stringify({ sugestoes: [{ descricao: "Uber Trip", nova_descricao: "Uber", etiqueta: null, categoria_id: null, subcategoria: null }] });
  else if (/preço atual de/.test(corpo)) texto = '[{"loja":"Amazon","titulo":"Fone","preco":1599.9,"url":"https://amazon.com.br/x"},{"loja":"Kabum","preco":1499,"url":"https://kabum.com.br/y"}]';
  await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }], usageMetadata: { totalTokenCount: 42 } }) });
});
const ir = async (rota, aba) => {
  local = `${rota}${aba ? " › " + aba : ""}`;
  await p.goto(`http://localhost:1420/#${rota}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  if (aba) { await p.getByRole("tab", { name: new RegExp(aba, "i") }).first().click(); await p.waitForTimeout(400); }
};
const espera = async (seletor, rotulo) => {
  try { await p.locator(seletor).first().waitFor({ timeout: 6000 }); } catch { falhas.push(`[${local}] ${rotulo}: resposta não apareceu`); }
};

// Conversa
await ir("/ia", "Conversa");
await p.getByRole("button", { name: "Onde posso economizar?" }).click();
await espera("text=Resposta da IA de teste", "conversa");
await p.getByLabel("Pergunta").fill("Quanto gastei?");
await p.keyboard.press("Enter");
await p.waitForTimeout(800);

// Análises: todas
await ir("/ia", "Análises");
const botoes = await p.locator("section button.rounded-full").allInnerTexts();
for (const nome of botoes) {
  local = `/ia › Análises › ${nome}`;
  await p.getByRole("button", { name: nome, exact: true }).first().click();
  const campo = p.locator("form input[aria-label]").first();
  if (await campo.isVisible().catch(() => false)) {
    await campo.fill("teste de 1000 reais");
    await p.getByRole("button", { name: "Analisar" }).click();
  }
  await espera("text=Resposta da IA de teste", nome);
}

// Lançar com IA
await ir("/ia", "Lançar");
await p.getByLabel("Descreva os lançamentos").fill("padaria 12,50 hoje");
await p.getByRole("button", { name: "Entender com IA" }).click();
await espera('input[aria-label="Descrição"]', "lançar com IA");
await p.getByRole("button", { name: /^Lançar$/ }).click().catch((e) => falhas.push(`[${local}] botão Lançar: ${e.message}`));
await p.waitForTimeout(500);

// Organizar
await ir("/ia", "Organizar");
await p.getByRole("button", { name: "Pedir sugestões" }).click();
await espera("text=renomear para", "organizar");

// Radar: buscar em todas as lojas
await ir("/radar");
await p.getByRole("button", { name: "Buscar em todas as lojas" }).first().click();
await espera("text=★ menor", "radar lojas");
await p.getByRole("button", { name: "Analisar com IA" }).first().click();
await espera("text=Análise da IA", "radar análise");

// Pessoas: cobrança com IA
await ir("/pessoas", "Quem me deve");
await p.getByRole("button", { name: /Escrever com IA/ }).first().click();
await p.waitForTimeout(1200);
const msg = await p.locator('textarea[aria-label^="Mensagem para"]').first().inputValue().catch(() => "");
if (!msg.includes("Resposta da IA de teste")) falhas.push("[/pessoas] mensagem com IA não apareceu");

// Investimentos: IA
await ir("/investimentos", "IA");
const perguntas = await p.locator("main button").allInnerTexts();
const alvo = perguntas.find((t) => /carteira|diversif|risco/i.test(t));
if (alvo) { await p.getByRole("button", { name: alvo }).first().click(); await espera("text=Resposta da IA de teste", "investimentos IA"); }
else falhas.push("[/investimentos › IA] nenhum botão de pergunta encontrado");

// Ajuda: perguntar à IA
await ir("/ajuda");
await p.getByLabel("Buscar na ajuda").fill("como lanço parcelado");
await p.getByRole("button", { name: "Perguntar à IA" }).click();
await espera("text=Resposta da IA de teste", "ajuda IA");

console.log(JSON.stringify({ falhas, chamadasIA: chamadas.length }, null, 2));
await b.close();
