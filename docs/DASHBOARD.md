# Painel inicial personalizável (dashboard)

O Início do Dairus é uma grade livre de 12 colunas. Cada conta pode ter vários **layouts** (por exemplo
"Visão geral", "Relatório financeiro" e "Produtividade") e alternar entre eles. Em cada layout, os widgets ficam em
qualquer posição e tamanho, e cada um tem a sua configuração.

## 1. Bibliotecas

| Para quê | Biblioteca | Por quê |
|---|---|---|
| Arrastar e redimensionar na grade | **react-grid-layout 2** | Grade com posição (x, y) e tamanho (w, h) por item, arrastar, redimensionar pelas bordas e cantos, compactação vertical ou posição 100% livre. A versão 2 é em TypeScript e usa hooks (`useContainerWidth`). |
| Gráficos | **Recharts 3** (já usado no app) | Barras, linha e rosca em SVG, com tooltip; responsivo com `ResponsiveContainer`. |
| Estado | **zustand** (já usado) | Um store compartilhado entre o Início, a aba de Temas e os próprios widgets. |
| Banco | **SQLite (rusqlite) via comandos Tauri** | Os layouts ficam no banco da conta: entram no backup, na criptografia e na sincronização entre computadores. |

O `@dnd-kit`, usado na versão anterior só para reordenar, saiu do projeto: o react-grid-layout faz as duas coisas.

## 2. Modelo de dados

Tabela `dashboards` (migração `0015_dashboards.sql`):

| coluna | tipo | |
|---|---|---|
| `id` | TEXT PK | UUID |
| `nome` | TEXT | 1 a 60 caracteres |
| `ordem` | INTEGER | ordem das abas |
| `ativo` | INTEGER 0/1 | só um ativo (índice único parcial) |
| `opcoes` | TEXT (JSON) | `{ "compactar": true, "espaco": "normal", "titulo": true }` |
| `widgets` | TEXT (JSON) | lista abaixo |
| `criado_em`, `atualizado_em` | TEXT | ISO 8601 |

Cada item de `widgets`:

```json
{
  "i": "w1k3j9a8x2",
  "tipo": "grafico",
  "x": 0, "y": 5, "w": 8, "h": 9,
  "config": {
    "titulo": "Despesas do ano",
    "semTitulo": false,
    "grafico": {
      "metrica": "despesas",
      "periodo": "12m",
      "granularidade": "mes",
      "exibicao": "linha",
      "categoriaId": null
    }
  }
}
```

- `x`, `w`: colunas (0 a 12, `x + w ≤ 12`). `y`, `h`: linhas de 30 px. O espaço entre os widgets depende de `opcoes.espaco`: 8, 12 ou 20 px.
- `tipo`: um dos 28 widgets do catálogo (`layoutWidgets.ts → CATALOGO`). O mesmo tipo pode aparecer várias vezes (ex.: dois gráficos); `i` identifica cada instância.
- `config.grafico`, só no tipo `grafico`:
  - `metrica`: `despesas` | `receitas` | `resultado` | `categoria` (com `categoriaId`, inclui as subcategorias) | `saldo` (saldo disponível nas contas);
  - `periodo`: `7d` | `30d` | `mes` | `3m` | `6m` | `12m` | `ano`;
  - `granularidade`: `auto` | `dia` | `semana` | `mes`;
  - `exibicao`: `barras` | `linha` | `rosca` | `tabela` | `kpi` (o número compara com o período anterior do mesmo tamanho).

O Rust valida tudo antes de gravar (`dashboards.rs → validar`). Ele recusa:
- widget fora da grade;
- `i` repetido;
- tipo com caracteres estranhos;
- configuração maior que 4 KB;
- mais de 60 widgets;
- mais de 20 layouts.

Se o JSON gravado estiver estragado, o layout é lido como vazio, para não travar o Início.

### Migração do formato antigo

Até a v0.2.4, o Início guardava só a lista de widgets e o tamanho P/M/G nas preferências (`widgets_inicio`,
`widgets_tamanhos`, `widgets_largos`, `widgets_layout`). Na primeira abertura sem nenhum layout no banco, o app
converte esse formato num layout "Visão geral" (P = largura padrão, M = 8 colunas, G = 12), sem apagar nada.

## 3. Como o código se encaixa

```
src-tauri/src/dashboards.rs        listar / salvar / ativar / excluir (+ validação e testes)
src/services/dashboards.ts         invoke dos comandos
src/state/widgets-store.ts         layouts, layout ativo, editar, adicionar, mover, configurar (grava com 500 ms de atraso)
src/features/dashboard/
  layoutWidgets.ts                 catálogo, modelo, lugar livre, migração, modelos prontos
  graficoDados.ts                  períodos, granularidade, séries, rosca, KPI
  WidgetsInicio.tsx                junta tudo no Início
  painel/GradePainel.tsx           a grade (react-grid-layout)
  painel/BarraPaineis.tsx          abas dos layouts, ações e catálogo
  painel/ConfigWidgetDialog.tsx    configurar um widget
  painel/WidgetGrafico.tsx         gráfico personalizável (Recharts)
src/features/aparencia/PainelWidgets.tsx   Temas e aparência → "Widgets e layout"
```

O núcleo da grade, simplificado de `GradePainel.tsx`:

```tsx
import ReactGridLayout, { useContainerWidth, verticalCompactor, noCompactor } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

function Grade({ painel, editando }: { painel: Painel; editando: boolean }) {
  const { width, containerRef, mounted } = useContainerWidth();
  const atualizarPosicoes = useWidgetsStore((s) => s.atualizarPosicoes);
  const layout = painel.widgets.map((w) => ({ i: w.i, x: w.x, y: w.y, w: w.w, h: w.h, minW: 2, minH: 3 }));
  return (
    <div ref={containerRef}>
      {mounted && (
        <ReactGridLayout
          width={width}
          layout={layout}
          gridConfig={{ cols: 12, rowHeight: 30, margin: [12, 12] }}
          dragConfig={{ enabled: editando, cancel: ".nao-arrastar" }}
          resizeConfig={{ enabled: editando, handles: ["se", "sw", "e", "w", "s"] }}
          compactor={painel.opcoes.compactar ? verticalCompactor : noCompactor}
          onLayoutChange={(novo) => editando && atualizarPosicoes(novo)}
        >
          {painel.widgets.map((w) => <div key={w.i}>{conteudo(w)}</div>)}
        </ReactGridLayout>
      )}
    </div>
  );
}
```

O "salvar no banco": o store junta as mudanças (500 ms) e chama o comando Tauri.

```ts
// widgets-store.ts
atualizarPosicoes: (posicoes) => alterarAtivo((p) => ({ ...p, widgets: aplicar(p.widgets, posicoes) })),
// ...depois de 500 ms sem mexer:
await invoke("salvar_dashboard", { dashboard: painelAtivo });
```

```rust
// dashboards.rs
#[tauri::command]
pub fn salvar_dashboard(state: State<AppState>, dashboard: Dashboard) -> Result<Dashboard, String> {
    let mut conn = state.conn.lock().expect("mutex envenenado");
    salvar_db(&mut conn, dashboard) // valida, faz INSERT ou UPDATE numa transação e devolve o salvo
}
```

Em telas com menos de 640 px de largura, os widgets ficam um embaixo do outro, na ordem de leitura
(de cima para baixo, da esquerda para a direita), cada um com a altura escolhida.

## 4. Foto do perfil (conta Google)

- No login com o Google, o Supabase guarda `picture` / `avatar_url` em `user_metadata`.
  O componente `AvatarUsuario` usa essa foto na barra de título e na saudação do Início.
- A foto é baixada uma vez em alta resolução (`=s256-c`) e guardada no computador (data URL, por conta),
  para aparecer mesmo sem internet. A CSP libera `https://*.googleusercontent.com` em `connect-src` para isso.
- Configurações → Preferências → Perfil → **Sincronizar com o Google**: atualiza a sessão e baixa a foto de novo.
- Se não houver foto, ou ela falhar, aparecem as iniciais do nome, numa cor estável calculada a partir do nome.

## 5. Testar sem o app instalado

Com `npm run dev` rodando, abra `http://localhost:1420/scripts/teste-visual/app.html`. O simulador guarda os
layouts no `localStorage` do navegador (`mock-dashboards`). Para começar do zero, rode
`localStorage.removeItem("mock-dashboards")` no console.
