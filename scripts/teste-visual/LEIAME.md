# Teste visual do Dairus (sem o Rust)

Abre a interface no navegador com um backend simulado (`mock-tauri.js`), passa por todas as telas e abas,
tira prints e lista erros, rolagem horizontal e comandos que o simulador não conhece.

```bash
npm run dev            # em outro terminal (porta 1420)
npm run teste:visual   # prints em prints-teste/ e relatório no terminal
npm run teste:ia       # clica em todos os botões de IA com o Gemini simulado
```

Variáveis: `LARGURA=1024` (largura da janela), `CHROMIUM=/caminho/do/chrome`, `PLAYWRIGHT_DIR` (Playwright global).

## Abrir o app simulado à mão

Com `npm run dev` rodando, abra `http://localhost:1420/scripts/teste-visual/app.html` (o Dairus com o backend
simulado). Para ver a tela de atualização: `?atualizacao=ok`, `?atualizacao=erro` ou `?atualizacao=erro-instalar`
(detalhes em `docs/ATUALIZACAO.md`).
